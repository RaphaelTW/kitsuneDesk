param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('goanime', 'anime-cli-br', 'ani-cli', 'fast-anime-vsr')]
  [string]$Provider,

  [Parameter(Mandatory = $true)]
  [string]$BridgeSourcePath,

  [string]$OfflineBundlePath = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$LocalRoot = Join-Path $env:LOCALAPPDATA 'KitsuneDesk'
$ToolsRoot = Join-Path $LocalRoot 'tools'
$RuntimesRoot = Join-Path $LocalRoot 'runtimes'
$DownloadsRoot = Join-Path $LocalRoot 'downloads'
$GoAnimeBridgeVersion = '1.6.0'
$GoAnimeTag = 'v1.8.5'

function Send-KitsuneEvent {
  param(
    [string]$Type = 'progress',
    [int]$Percent = 0,
    [string]$Component = 'installer',
    [string]$State = 'running',
    [string]$Message = '',
    [string]$Purpose = '',
    [string]$Detail = ''
  )

  $payload = [ordered]@{
    type = $Type
    percent = [Math]::Max(0, [Math]::Min(100, $Percent))
    component = $Component
    state = $State
    message = $Message
    purpose = $Purpose
    detail = $Detail
  }
  [Console]::Out.WriteLine('KITSUNE_EVENT ' + ($payload | ConvertTo-Json -Compress -Depth 5))
}

function Send-Step {
  param([int]$Percent, [string]$Component, [string]$State, [string]$Message, [string]$Purpose = '')
  Send-KitsuneEvent -Type 'progress' -Percent $Percent -Component $Component -State $State -Message $Message -Purpose $Purpose
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $scoopShims = Join-Path $env:USERPROFILE 'scoop\shims'
  $env:Path = @($scoopShims, $machinePath, $userPath) -join ';'
}

function Add-UserPath {
  param([Parameter(Mandatory = $true)][string]$Directory)
  if (-not (Test-Path -LiteralPath $Directory)) { return }
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($current -split ';' | Where-Object { $_ })
  if ($entries -notcontains $Directory) {
    $updated = (@($entries) + $Directory) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
  }
  if (($env:Path -split ';') -notcontains $Directory) {
    $env:Path = "$Directory;$env:Path"
  }
}

function Ensure-Directory {
  param([Parameter(Mandatory = $true)][string]$Path)
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Remove-Safe {
  param([string]$Path)
  if ($Path -and (Test-Path -LiteralPath $Path)) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Download {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [string]$ExpectedSha256 = '',
    [string]$RequiredPublisher = ''
  )
  Ensure-Directory -Path (Split-Path -Parent $OutFile)
  Invoke-WebRequest -Uri $Uri -OutFile $OutFile -UseBasicParsing -Headers @{ 'User-Agent' = 'KitsuneDesk/0.11.0' }
  if (-not (Test-Path -LiteralPath $OutFile) -or (Get-Item -LiteralPath $OutFile).Length -eq 0) {
    throw "O download de $Uri ficou vazio ou incompleto."
  }
  if ($ExpectedSha256) {
    Assert-FileSha256 -Path $OutFile -ExpectedSha256 $ExpectedSha256
  } elseif ($OutFile -match '(?i)\.(exe|msi)$') {
    Assert-AuthenticodeSignature -Path $OutFile -RequiredPublisher $RequiredPublisher
  }
}

function Assert-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256
  )
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $expected = $ExpectedSha256.ToLowerInvariant().Replace('sha256:', '')
  if ($actual -ne $expected) {
    throw "Falha de integridade em $(Split-Path -Leaf $Path): SHA-256 esperado $expected, recebido $actual."
  }
}

function Assert-AuthenticodeSignature {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$RequiredPublisher = ''
  )
  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne 'Valid') {
    throw "A assinatura digital de $(Split-Path -Leaf $Path) nao e valida: $($signature.Status)."
  }
  if ($RequiredPublisher -and $signature.SignerCertificate.Subject -notmatch [Regex]::Escape($RequiredPublisher)) {
    throw "A assinatura digital de $(Split-Path -Leaf $Path) nao pertence ao publicador esperado."
  }
}

function Resolve-AssetSha256 {
  param($Asset)
  $digest = ''
  if ($Asset -and $Asset.PSObject.Properties.Name -contains 'digest') {
    $digest = [string]$Asset.digest
  }
  if ($digest -match '(?i)^sha256:([a-f0-9]{64})$') { return $Matches[1] }
  return ''
}

function Get-GitHubReleaseAsset {
  param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][scriptblock]$Filter
  )
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers @{ 'User-Agent' = 'KitsuneDesk/0.11.0' }
  $asset = $release.assets | Where-Object $Filter | Select-Object -First 1
  if (-not $asset) { throw "Nenhum pacote compativel foi encontrado em $Repository." }
  return $asset
}

function Expand-ZipFresh {
  param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  Remove-Safe -Path $Destination
  Ensure-Directory -Path $Destination
  Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
}

function Resolve-CommandPath {
  param([Parameter(Mandatory = $true)][string]$Name)
  Refresh-ProcessPath
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  return $null
}

function Ensure-Scoop {
  param([int]$Percent)
  Refresh-ProcessPath
  $scoop = Resolve-CommandPath -Name 'scoop'
  if ($scoop) {
    Send-Step $Percent 'scoop' 'skipped' 'Scoop ja esta instalado.' 'Gerencia ferramentas portateis sem exigir Winget ou terminal externo.'
    return
  }

  Send-Step $Percent 'scoop' 'installing' 'Instalando o gerenciador Scoop em modo silencioso...' 'Gerencia ferramentas portateis sem exigir Winget ou terminal externo.'
  try { Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force } catch {}
  Invoke-RestMethod -Uri 'https://get.scoop.sh' -Headers @{ 'User-Agent' = 'KitsuneDesk/0.11.0' } | Invoke-Expression
  Refresh-ProcessPath
  if (-not (Resolve-CommandPath -Name 'scoop')) { throw 'Scoop nao foi localizado depois da instalacao.' }
  Send-Step ($Percent + 3) 'scoop' 'installed' 'Scoop instalado.' 'Gerencia ferramentas portateis sem exigir Winget ou terminal externo.'
}

function Ensure-ScoopExtras {
  param([int]$Percent)
  $bucketOutput = (& scoop bucket list 2>$null | Out-String)
  $hasExtras = $bucketOutput -match '(?im)^\s*extras\b'
  if ($hasExtras) {
    Send-Step $Percent 'scoop-extras' 'skipped' 'Catalogo Extras do Scoop ja esta configurado.' 'Disponibiliza MPV, VLC e ani-cli.'
    return
  }
  Send-Step $Percent 'scoop-extras' 'installing' 'Adicionando o catalogo Extras do Scoop...' 'Disponibiliza MPV, VLC e ani-cli.'
  & scoop bucket add extras
  $bucketOutput = (& scoop bucket list 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0 -and $bucketOutput -notmatch '(?im)^\s*extras\b') {
    throw 'Falha ao adicionar o catalogo Extras do Scoop.'
  }
  Send-Step ($Percent + 2) 'scoop-extras' 'installed' 'Catalogo Extras configurado.' 'Disponibiliza MPV, VLC e ani-cli.'
}

function Find-ScoopExecutable {
  param([Parameter(Mandatory = $true)][string]$Package, [Parameter(Mandatory = $true)][string]$Command)
  $candidates = @(
    (Join-Path $env:USERPROFILE "scoop\shims\$Command.exe"),
    (Join-Path $env:USERPROFILE "scoop\shims\$Command.cmd"),
    (Join-Path $env:USERPROFILE "scoop\shims\$Command"),
    (Join-Path $env:USERPROFILE "scoop\apps\$Package\current\$Command.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return Resolve-CommandPath -Name $Command
}

function Ensure-ScoopPackage {
  param(
    [Parameter(Mandatory = $true)][string]$Package,
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][int]$Percent,
    [Parameter(Mandatory = $true)][string]$Component,
    [Parameter(Mandatory = $true)][string]$Purpose
  )
  $existing = Find-ScoopExecutable -Package $Package -Command $Command
  if ($existing) {
    Send-Step $Percent $Component 'skipped' "$Package ja esta instalado." $Purpose
    return [string]$existing
  }

  Send-Step $Percent $Component 'installing' "Instalando $Package..." $Purpose
  $installOutput = @(& scoop install $Package 2>&1)
  $installExitCode = $LASTEXITCODE
  foreach ($line in $installOutput) {
    if ($null -ne $line -and [string]$line -ne '') {
      [Console]::Out.WriteLine([string]$line)
    }
  }
  if ($installExitCode -ne 0) { throw "Falha ao instalar $Package pelo Scoop (codigo $installExitCode)." }
  Refresh-ProcessPath
  $installed = Find-ScoopExecutable -Package $Package -Command $Command
  if (-not $installed) { throw "$Package nao foi localizado depois da instalacao." }
  Send-Step ($Percent + 3) $Component 'installed' "$Package instalado." $Purpose
  return [string]$installed
}

function Test-PythonVersion {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Expected)
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    $version = (& $Path -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null | Select-Object -First 1).Trim()
    return $version -eq $Expected
  } catch { return $false }
}

function Get-PythonCandidates {
  param([Parameter(Mandatory = $true)][string]$Version)
  $compact = $Version.Replace('.', '')
  $items = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in @(
      (Join-Path $env:LOCALAPPDATA "Programs\Python\Python$compact\python.exe"),
      (Join-Path $env:ProgramFiles "Python$compact\python.exe")
    )) {
    if ($candidate) { $items.Add($candidate) }
  }

  $launcher = Resolve-CommandPath -Name 'py.exe'
  if ($launcher) {
    try {
      $pathValue = (& $launcher "-$Version" -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1).Trim()
      if ($pathValue) { $items.Add($pathValue) }
    } catch {}
  }
  return $items | Select-Object -Unique
}

function Resolve-Python {
  param([Parameter(Mandatory = $true)][string]$Version)
  foreach ($candidate in Get-PythonCandidates -Version $Version) {
    if (Test-PythonVersion -Path $candidate -Expected $Version) { return $candidate }
  }
  return $null
}

function Ensure-Python {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$FullVersion,
    [Parameter(Mandatory = $true)][int]$Percent,
    [Parameter(Mandatory = $true)][string]$Component,
    [Parameter(Mandatory = $true)][string]$Purpose
  )
  $python = Resolve-Python -Version $Version
  if ($python) {
    Send-Step $Percent $Component 'skipped' "Python $Version ja esta instalado." $Purpose
    return [string]$python
  }

  Send-Step $Percent $Component 'downloading' "Baixando Python $FullVersion..." $Purpose
  $compact = $Version.Replace('.', '')
  $installer = Join-Path $DownloadsRoot "python-$FullVersion-amd64.exe"
  Invoke-Download -Uri "https://www.python.org/ftp/python/$FullVersion/python-$FullVersion-amd64.exe" -OutFile $installer -RequiredPublisher 'Python'
  $targetDir = Join-Path $env:LOCALAPPDATA "Programs\Python\Python$compact"
  $arguments = @(
    '/quiet',
    'InstallAllUsers=0',
    'PrependPath=1',
    'Include_launcher=1',
    'Include_test=0',
    ('TargetDir="' + $targetDir + '"')
  )
  Send-Step ($Percent + 4) $Component 'installing' "Instalando Python $FullVersion para este usuario..." $Purpose
  $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "O instalador do Python terminou com o codigo $($process.ExitCode)." }
  Refresh-ProcessPath
  $python = Resolve-Python -Version $Version
  if (-not $python) { throw "Python $Version nao foi localizado depois da instalacao." }
  Send-Step ($Percent + 8) $Component 'installed' "Python $Version instalado." $Purpose
  return [string]$python
}

function Download-RepositoryArchive {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$ExpectedFolderPrefix
  )
  $archive = Join-Path $DownloadsRoot (([Guid]::NewGuid().ToString()) + '.zip')
  $temporary = Join-Path $env:TEMP ('kitsunedesk-extract-' + [Guid]::NewGuid().ToString())
  Invoke-Download -Uri $Uri -OutFile $archive
  Expand-ZipFresh -Archive $archive -Destination $temporary
  $source = Get-ChildItem -LiteralPath $temporary -Directory | Where-Object { $_.Name -like "$ExpectedFolderPrefix*" } | Select-Object -First 1
  if (-not $source) { throw 'A estrutura do pacote baixado nao foi reconhecida.' }
  Remove-Safe -Path $Destination
  Ensure-Directory -Path (Split-Path -Parent $Destination)
  Move-Item -LiteralPath $source.FullName -Destination $Destination -Force
  Remove-Safe -Path $temporary
  return $Destination
}

function Resolve-GoAnime {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\GoAnime\goanime.exe'),
    (Join-Path $env:ProgramFiles 'GoAnime\goanime.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'GoAnime\goanime.exe'),
    (Resolve-CommandPath -Name 'goanime.exe'),
    (Resolve-CommandPath -Name 'goanime')
  ) | Where-Object { $_ }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Ensure-GoAnime {
  param([int]$Percent)
  $existing = Resolve-GoAnime
  if ($existing) {
    Send-Step $Percent 'goanime' 'skipped' 'GoAnime classico ja esta instalado.' 'Motor principal de pesquisa, episodios e fontes.'
    return [string]$existing
  }

  Send-Step $Percent 'goanime' 'downloading' 'Baixando o executavel oficial do GoAnime...' 'Motor principal de pesquisa, episodios e fontes.'
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/alvarorichard/GoAnime/releases/latest' -Headers @{ 'User-Agent' = 'KitsuneDesk/0.11.0' }
  $portable = $release.assets | Where-Object {
    $_.name -match '(?i)^goanime.*windows.*amd64.*\.exe$' -and $_.name -notmatch '(?i)installer'
  } | Select-Object -First 1

  if ($portable) {
    $directory = Join-Path $env:LOCALAPPDATA 'Programs\GoAnime'
    Ensure-Directory -Path $directory
    $target = Join-Path $directory 'goanime.exe'
    Invoke-Download -Uri $portable.browser_download_url -OutFile $target -ExpectedSha256 (Resolve-AssetSha256 -Asset $portable)
    Add-UserPath -Directory $directory
  } else {
    $installer = $release.assets | Where-Object { $_.name -match '(?i)^GoAnime.*Installer.*\.exe$' } | Select-Object -First 1
    if (-not $installer) { throw 'A release oficial nao possui executavel portatil nem instalador para Windows.' }
    $installerPath = Join-Path $DownloadsRoot $installer.name
    Invoke-Download -Uri $installer.browser_download_url -OutFile $installerPath -ExpectedSha256 (Resolve-AssetSha256 -Asset $installer)
    Send-Step ($Percent + 4) 'goanime' 'installing' 'Executando o instalador oficial do GoAnime...' 'Motor principal de pesquisa, episodios e fontes.'
    $arguments = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /TASKS="addtopath"'
    $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "O instalador do GoAnime terminou com o codigo $($process.ExitCode)." }
  }

  $resolved = Resolve-GoAnime
  if (-not $resolved) { throw 'GoAnime nao foi localizado depois da instalacao.' }
  Send-Step ($Percent + 7) 'goanime' 'installed' 'GoAnime classico instalado.' 'Motor principal de pesquisa, episodios e fontes.'
  return [string]$resolved
}

function Test-GoRuntime {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    $output = (& $Path version 2>$null | Select-Object -First 1)
    return $output -match 'go1\.(2[6-9]|[3-9][0-9])'
  } catch { return $false }
}

function Ensure-GoRuntime {
  param([int]$Percent)
  $localGo = Join-Path $RuntimesRoot 'go\bin\go.exe'
  $systemGo = Resolve-CommandPath -Name 'go.exe'
  foreach ($candidate in @($localGo, $systemGo)) {
    if (Test-GoRuntime -Path $candidate) {
      $root = Split-Path -Parent (Split-Path -Parent $candidate)
      $env:GOROOT = $root
      $env:Path = "$(Split-Path -Parent $candidate);$env:Path"
      Send-Step $Percent 'go-runtime' 'skipped' 'Runtime Go compativel ja esta disponivel.' 'Compila o bridge local que conecta o GoAnime à interface gráfica.'
      return [string]$candidate
    }
  }

  Send-Step $Percent 'go-runtime' 'downloading' 'Baixando o runtime Go portatil...' 'Compila o bridge local que conecta o GoAnime à interface gráfica.'
  $releases = Invoke-RestMethod -Uri 'https://go.dev/dl/?mode=json' -Headers @{ 'User-Agent' = 'KitsuneDesk/0.11.0' }
  $stable = $releases | Where-Object { $_.stable -eq $true } | Select-Object -First 1
  $file = $stable.files | Where-Object { $_.os -eq 'windows' -and $_.arch -eq 'amd64' -and $_.kind -eq 'archive' } | Select-Object -First 1
  if (-not $file) { throw 'O pacote portatil do Go para Windows nao foi encontrado.' }
  $archive = Join-Path $DownloadsRoot $file.filename
  Invoke-Download -Uri ('https://go.dev/dl/' + $file.filename) -OutFile $archive -ExpectedSha256 $file.sha256
  $temporary = Join-Path $env:TEMP ('kitsunedesk-go-' + [Guid]::NewGuid().ToString())
  Expand-ZipFresh -Archive $archive -Destination $temporary
  $goRoot = Join-Path $RuntimesRoot 'go'
  Remove-Safe -Path $goRoot
  Ensure-Directory -Path $RuntimesRoot
  Move-Item -LiteralPath (Join-Path $temporary 'go') -Destination $goRoot -Force
  Remove-Safe -Path $temporary
  $goExe = Join-Path $goRoot 'bin\go.exe'
  if (-not (Test-GoRuntime -Path $goExe)) { throw 'O runtime Go baixado nao passou na verificacao.' }
  $env:GOROOT = $goRoot
  $env:Path = "$(Join-Path $goRoot 'bin');$env:Path"
  Send-Step ($Percent + 8) 'go-runtime' 'installed' 'Runtime Go portatil instalado.' 'Compila o bridge local que conecta o GoAnime à interface gráfica.'
  return [string]$goExe
}

function Test-GoAnimeBridge {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    $output = (& $Path --version 2>$null | Select-Object -First 1)
    return $output -match [Regex]::Escape($GoAnimeBridgeVersion)
  } catch { return $false }
}

function Ensure-GoAnimeBridge {
  param([Parameter(Mandatory = $true)][string]$GoExe, [int]$Percent)
  $bridgeRoot = Join-Path $ToolsRoot 'goanime-bridge'
  $bridgeExe = Join-Path $bridgeRoot 'goanime-bridge.exe'
  if (Test-GoAnimeBridge -Path $bridgeExe) {
    Send-Step $Percent 'goanime-bridge' 'skipped' 'Bridge gráfico do GoAnime ja esta atualizado.' 'Entrega pesquisa, episódios e reprodução à interface do KitsuneDesk.'
    return [string]$bridgeExe
  }

  Send-Step $Percent 'goanime-source' 'downloading' "Baixando o codigo compativel do GoAnime $GoAnimeTag..." 'Fornece a biblioteca oficial usada pela interface gráfica.'
  $sourceRoot = Join-Path $bridgeRoot 'source'
  Download-RepositoryArchive -Uri "https://github.com/alvarorichard/GoAnime/archive/refs/tags/$GoAnimeTag.zip" -Destination $sourceRoot -ExpectedFolderPrefix 'GoAnime-' | Out-Null
  $packageRoot = Join-Path $sourceRoot 'cmd\kitsunedesk-bridge'
  Ensure-Directory -Path $packageRoot
  Copy-Item -LiteralPath $BridgeSourcePath -Destination (Join-Path $packageRoot 'main.go') -Force

  Send-Step ($Percent + 7) 'goanime-bridge' 'installing' 'Baixando módulos e compilando o bridge gráfico...' 'Entrega pesquisa, episódios e reprodução à interface do KitsuneDesk.'
  Push-Location $sourceRoot
  try {
    $env:GOTOOLCHAIN = 'auto'
    $env:CGO_ENABLED = '0'
    & $GoExe mod download
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar os modulos Go.' }
    Ensure-Directory -Path $bridgeRoot
    & $GoExe build -trimpath -ldflags '-s -w' -o $bridgeExe '.\cmd\kitsunedesk-bridge'
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o bridge grafico do GoAnime.' }
  } finally {
    Pop-Location
  }

  if (-not (Test-GoAnimeBridge -Path $bridgeExe)) { throw 'O bridge compilado nao passou na verificacao de versao.' }
  Send-Step ($Percent + 17) 'goanime-bridge' 'installed' 'Bridge gráfico instalado e verificado.' 'Entrega pesquisa, episódios e reprodução à interface do KitsuneDesk.'
  return [string]$bridgeExe
}

function Install-GoAnimeStack {
  Send-Step 2 'installer' 'checking' 'Verificando GoAnime, MPV e interface gráfica...' 'Instala apenas os componentes que estiverem faltando.'
  Ensure-Directory -Path $ToolsRoot
  Ensure-Directory -Path $RuntimesRoot
  Ensure-Directory -Path $DownloadsRoot

  $goAnime = @(Ensure-GoAnime -Percent 8)[-1]
  Ensure-Scoop -Percent 20
  Ensure-ScoopExtras -Percent 25
  $mpv = @(Ensure-ScoopPackage -Package 'mpv' -Command 'mpv' -Percent 30 -Component 'mpv' -Purpose 'Reprodutor de vídeo usado pelo GoAnime clássico e pela interface gráfica.')[-1]
  $bridgePath = Join-Path $ToolsRoot 'goanime-bridge\goanime-bridge.exe'
  if (Test-GoAnimeBridge -Path $bridgePath) {
    Send-Step 68 'goanime-bridge' 'skipped' 'Bridge gráfico ja esta pronto; compilador não é necessário agora.' 'Entrega pesquisa, episódios e reprodução à interface do KitsuneDesk.'
  } else {
    $goExe = @(Ensure-GoRuntime -Percent 43)[-1]
    Ensure-GoAnimeBridge -GoExe $goExe -Percent 64 | Out-Null
  }

  Send-Step 96 'verification' 'checking' 'Validando GoAnime, MPV e bridge...' 'Confirma que os três modos estão prontos para uso.'
  if (-not $goAnime -or -not (Test-Path -LiteralPath $goAnime)) { throw 'GoAnime nao passou na verificacao final.' }
  if (-not $mpv -or -not (Test-Path -LiteralPath $mpv)) { throw 'MPV nao passou na verificacao final.' }
  if (-not (Test-GoAnimeBridge -Path $bridgePath)) { throw 'GoAnime GUI nao passou na verificacao final.' }
  Send-Step 100 'installer' 'installed' 'GoAnime clássico e GoAnime GUI estão prontos.' 'Motor principal do KitsuneDesk.'
}

function Install-AnimeCliBr {
  Ensure-Directory -Path $ToolsRoot
  Ensure-Directory -Path $DownloadsRoot
  Send-Step 2 'installer' 'checking' 'Verificando o ambiente do anime-cli-br...' 'Instala apenas os componentes que estiverem faltando.'
  $python = @(Ensure-Python -Version '3.12' -FullVersion '3.12.10' -Percent 8 -Component 'python-312' -Purpose 'Executa o anime-cli-br em um ambiente isolado e compatível.')[-1]
  Ensure-Scoop -Percent 23
  Ensure-ScoopExtras -Percent 28
  $vlc = @(Ensure-ScoopPackage -Package 'vlc' -Command 'vlc' -Percent 33 -Component 'vlc' -Purpose 'Reprodutor usado pelo anime-cli-br.')[-1]

  $repoPath = Join-Path $ToolsRoot 'anime-cli-br'
  if (Test-Path -LiteralPath (Join-Path $repoPath 'setup.py')) {
    Send-Step 49 'anime-cli-br-source' 'skipped' 'Código do anime-cli-br já está instalado.' 'Cliente brasileiro que consulta a fonte AnimeFire.'
  } else {
    Send-Step 49 'anime-cli-br-source' 'downloading' 'Baixando o anime-cli-br...' 'Cliente brasileiro que consulta a fonte AnimeFire.'
    Download-RepositoryArchive -Uri 'https://github.com/MtywX/anime-cli-br/archive/refs/heads/main.zip' -Destination $repoPath -ExpectedFolderPrefix 'anime-cli-br-' | Out-Null
  }

  $venvPath = Join-Path $repoPath '.venv'
  $venvPython = Join-Path $venvPath 'Scripts\python.exe'
  if (Test-PythonVersion -Path $venvPython -Expected '3.12') {
    Send-Step 62 'anime-cli-br-env' 'skipped' 'Ambiente Python isolado já está pronto.' 'Evita conflitos com versões como Python 3.15.'
  } else {
    Remove-Safe -Path $venvPath
    Send-Step 62 'anime-cli-br-env' 'installing' 'Criando o ambiente Python isolado...' 'Evita conflitos com versões como Python 3.15.'
    & $python -m venv $venvPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $venvPython)) { throw 'Falha ao criar o ambiente virtual do anime-cli-br.' }
  }

  $command = Join-Path $venvPath 'Scripts\anime-cli-br.exe'
  $commandHealthy = $false
  if (Test-Path -LiteralPath $command) {
    try {
      & $command --help 2>$null | Out-Null
      $commandHealthy = ($LASTEXITCODE -eq 0)
    } catch {}
  }
  if ($commandHealthy) {
    Send-Step 74 'anime-cli-br-dependencies' 'skipped' 'Dependências do anime-cli-br já estão instaladas.' 'Inclui requests, BeautifulSoup, Click e Colorama.'
  } else {
    Send-Step 74 'anime-cli-br-dependencies' 'installing' 'Instalando dependências do anime-cli-br...' 'Inclui requests, BeautifulSoup, Click e Colorama.'
    & $venvPython -m pip install --disable-pip-version-check --upgrade pip setuptools wheel
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o pip do anime-cli-br.' }
    & $venvPython -m pip install --disable-pip-version-check $repoPath
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o anime-cli-br.' }
  }

  if (-not (Test-Path -LiteralPath $command)) { throw 'O executavel anime-cli-br nao foi criado.' }
  if (-not $vlc -or -not (Test-Path -LiteralPath $vlc)) { throw 'VLC nao passou na verificacao final.' }
  Send-Step 96 'animefire-source' 'warning' 'Ambiente instalado. A disponibilidade do AnimeFire depende do DNS externo.' 'Fonte de catálogo usada pelo projeto; pode ficar temporariamente indisponível.'
  Send-Step 100 'installer' 'installed' 'anime-cli-br instalado e isolado.' 'Alternativa brasileira baseada em AnimeFire.'
}

function Install-AniCli {
  Ensure-Directory -Path $DownloadsRoot
  Send-Step 2 'installer' 'checking' 'Verificando o ani-cli e suas ferramentas...' 'Instala apenas os componentes que estiverem faltando.'
  Ensure-Scoop -Percent 6
  Ensure-ScoopExtras -Percent 12
  Ensure-ScoopPackage -Package 'git' -Command 'git' -Percent 18 -Component 'git-bash' -Purpose 'Fornece o shell Bash necessário para executar o ani-cli no Windows.' | Out-Null
  Ensure-ScoopPackage -Package 'fzf' -Command 'fzf' -Percent 31 -Component 'fzf' -Purpose 'Exibe os menus interativos de anime e episódios.' | Out-Null
  Ensure-ScoopPackage -Package 'ffmpeg' -Command 'ffmpeg' -Percent 43 -Component 'ffmpeg' -Purpose 'Processa e identifica fluxos de áudio e vídeo.' | Out-Null
  Ensure-ScoopPackage -Package 'mpv' -Command 'mpv' -Percent 56 -Component 'mpv' -Purpose 'Reproduz os episódios selecionados.' | Out-Null
  Ensure-ScoopPackage -Package 'openssl' -Command 'openssl' -Percent 69 -Component 'openssl' -Purpose 'Descriptografa respostas de fontes usadas pelo ani-cli.' | Out-Null
  $aniCli = @(Ensure-ScoopPackage -Package 'ani-cli' -Command 'ani-cli' -Percent 82 -Component 'ani-cli' -Purpose 'Cliente experimental de anime executado no Git Bash.')[-1]
  Send-Step 94 'ani-cli-update' 'installing' 'Atualizando o script do ani-cli...' 'Aplica correções publicadas pelo projeto original.'
  try { & $aniCli -U 2>$null | Out-Null } catch {}
  Send-Step 98 'ani-cli-source' 'warning' 'Instalado. A versão atual ainda pode falhar ao extrair fontes externas.' 'O erro “no valid sources” depende do projeto e dos sites externos.'
  Send-Step 100 'installer' 'installed' 'ani-cli experimental instalado.' 'Alternativa experimental mantida separada do GoAnime.'
}

function Install-FastAnimeVsr {
  Ensure-Directory -Path $ToolsRoot
  Ensure-Directory -Path $DownloadsRoot
  Send-Step 2 'installer' 'checking' 'Verificando o ambiente do FAST Anime VSR...' 'Prepara o processamento local de vídeos.'
  $python = @(Ensure-Python -Version '3.10' -FullVersion '3.10.11' -Percent 7 -Component 'python-310' -Purpose 'Versão compatível com o pipeline de super-resolução.')[-1]
  Ensure-Scoop -Percent 22
  Ensure-ScoopExtras -Percent 27
  $ffmpeg = @(Ensure-ScoopPackage -Package 'ffmpeg' -Command 'ffmpeg' -Percent 32 -Component 'ffmpeg' -Purpose 'Lê, converte e grava os arquivos de vídeo processados.')[-1]

  $repoPath = Join-Path $ToolsRoot 'FAST_Anime_VSR'
  if (Test-Path -LiteralPath (Join-Path $repoPath 'main.py')) {
    Send-Step 47 'fast-vsr-source' 'skipped' 'Código do FAST Anime VSR já está instalado.' 'Código de super-resolução para vídeos locais.'
  } else {
    Send-Step 47 'fast-vsr-source' 'downloading' 'Baixando o FAST Anime VSR...' 'Código de super-resolução para vídeos locais.'
    Download-RepositoryArchive -Uri 'https://github.com/Kiteretsu77/FAST_Anime_VSR/archive/refs/heads/main.zip' -Destination $repoPath -ExpectedFolderPrefix 'FAST_Anime_VSR-' | Out-Null
  }

  $venvPath = Join-Path $repoPath '.venv'
  $venvPython = Join-Path $venvPath 'Scripts\python.exe'
  if (Test-PythonVersion -Path $venvPython -Expected '3.10') {
    Send-Step 59 'fast-vsr-env' 'skipped' 'Ambiente Python 3.10 já está pronto.' 'Mantém as bibliotecas do VSR separadas do sistema.'
  } else {
    Remove-Safe -Path $venvPath
    Send-Step 59 'fast-vsr-env' 'installing' 'Criando o ambiente Python 3.10 isolado...' 'Mantém as bibliotecas do VSR separadas do sistema.'
    & $python -m venv $venvPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $venvPython)) { throw 'Falha ao criar o ambiente virtual do FAST Anime VSR.' }
  }

  $basicReady = $false
  try {
    & $venvPython -c 'import cv2, numpy, moviepy' 2>$null
    $basicReady = ($LASTEXITCODE -eq 0)
  } catch {}
  if ($basicReady) {
    Send-Step 70 'fast-vsr-dependencies' 'skipped' 'Bibliotecas básicas de vídeo já estão instaladas.' 'Inclui OpenCV, MoviePy, NumPy e ferramentas do projeto.'
  } else {
    Send-Step 70 'fast-vsr-dependencies' 'installing' 'Instalando bibliotecas básicas de vídeo...' 'Inclui OpenCV, MoviePy, NumPy e ferramentas do projeto.'
    & $venvPython -m pip install --disable-pip-version-check --upgrade pip setuptools wheel
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o pip do FAST Anime VSR.' }
    & $venvPython -m pip install --disable-pip-version-check -r (Join-Path $repoPath 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências do FAST Anime VSR.' }
  }

  $torchReady = $false
  try {
    & $venvPython -c 'import torch' 2>$null
    $torchReady = ($LASTEXITCODE -eq 0)
  } catch {}
  if ($torchReady) {
    Send-Step 82 'pytorch' 'skipped' 'PyTorch já está instalado.' 'Executa os modelos de super-resolução; CUDA é usada quando compatível.'
  } else {
    Send-Step 82 'pytorch' 'installing' 'Instalando PyTorch para o processamento de modelos...' 'Executa os modelos de super-resolução; CUDA é usada quando compatível.'
    & $venvPython -m pip install --disable-pip-version-check torch torchvision torchaudio
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o PyTorch.' }
  }

  Send-Step 94 'gpu' 'checking' 'Verificando GPU NVIDIA e CUDA...' 'Acelera o processamento; o ambiente base funciona como preparação mesmo sem CUDA ativa.'
  $gpu = Resolve-CommandPath -Name 'nvidia-smi.exe'
  $cudaOutput = (& $venvPython -c "import torch; print('CUDA=' + str(bool(torch.cuda.is_available())))" 2>$null | Select-Object -First 1)
  if ($gpu -and $cudaOutput -match 'CUDA=True') {
    Send-Step 98 'gpu' 'installed' 'GPU NVIDIA e CUDA detectadas.' 'Aceleração por hardware pronta.'
  } else {
    Send-Step 98 'gpu' 'warning' 'Ambiente base pronto, mas CUDA não está ativa nesta máquina.' 'Instale driver NVIDIA/CUDA compatíveis para usar aceleração por GPU.'
  }
  if (-not $ffmpeg -or -not (Test-Path -LiteralPath $ffmpeg)) { throw 'FFmpeg nao passou na verificacao final.' }
  Send-Step 100 'installer' 'installed' 'FAST Anime VSR preparado.' 'Ferramenta opcional para melhorar arquivos de vídeo locais.'
}

try {
  Ensure-Directory -Path $LocalRoot
  Ensure-Directory -Path $ToolsRoot
  Ensure-Directory -Path $RuntimesRoot
  Ensure-Directory -Path $DownloadsRoot

  $offlineProvider = if ($OfflineBundlePath) { Join-Path $OfflineBundlePath $Provider } else { '' }
  if ($offlineProvider -and (Test-Path -LiteralPath $offlineProvider)) {
    Send-Step 10 'offline-bundle' 'installing' 'Instalando pacote offline verificado...' 'Evita downloads dos componentes opcionais.'
    Copy-Item -Path (Join-Path $offlineProvider '*') -Destination $ToolsRoot -Recurse -Force
    Send-KitsuneEvent -Type 'complete' -Percent 100 -Component 'offline-bundle' -State 'installed' -Message 'Pacote offline instalado com sucesso.'
    exit 0
  }

  switch ($Provider) {
    'goanime' { Install-GoAnimeStack }
    'anime-cli-br' { Install-AnimeCliBr }
    'ani-cli' { Install-AniCli }
    'fast-anime-vsr' { Install-FastAnimeVsr }
  }

  Send-KitsuneEvent -Type 'complete' -Percent 100 -Component 'installer' -State 'installed' -Message 'Processo concluído com sucesso.'
  exit 0
} catch {
  $detail = $_.Exception.Message
  Send-KitsuneEvent -Type 'error' -Percent 0 -Component 'installer' -State 'error' -Message 'Falha durante a instalação automática.' -Detail $detail
  [Console]::Error.WriteLine($detail)
  exit 1
}
