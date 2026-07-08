$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Write-Host 'KitsuneDesk - ativando a interface grafica do GoAnime' -ForegroundColor Cyan
Write-Host 'Este processo prepara um bridge local para pesquisa, episodios e streams sem terminal.' -ForegroundColor DarkCyan
Write-Host ''

$toolsRoot = Join-Path $env:LOCALAPPDATA 'KitsuneDesk\tools'
$sourcePath = Join-Path $toolsRoot 'GoAnime-source'
$bridgeDirectory = Join-Path $toolsRoot 'goanime-bridge'
$bridgeExe = Join-Path $bridgeDirectory 'goanime-bridge.exe'
$bridgeSource = '__BRIDGE_SOURCE_PATH__'
$pinnedVersion = 'v1.8.5'

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machinePath, $userPath) -join ';'
}

function Resolve-Git {
  Refresh-ProcessPath
  $command = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in @(
      (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
      (Join-Path $env:USERPROFILE 'scoop\apps\git\current\cmd\git.exe')
    )) {
    if (Test-Path $candidate) { return $candidate }
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'Git nao encontrado e winget indisponivel.' }
  Write-Host 'Instalando Git...' -ForegroundColor Yellow
  & $winget.Source install --id Git.Git -e --accept-package-agreements --accept-source-agreements --silent
  Refresh-ProcessPath
  $command = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $fallback = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
  if (Test-Path $fallback) { return $fallback }
  throw 'Git nao foi localizado apos a instalacao.'
}

function Resolve-Go {
  Refresh-ProcessPath
  $command = Get-Command go.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  foreach ($candidate in @(
      (Join-Path $env:ProgramFiles 'Go\bin\go.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\Go\bin\go.exe'),
      (Join-Path $env:USERPROFILE 'scoop\apps\go\current\bin\go.exe')
    )) {
    if (Test-Path $candidate) { return $candidate }
  }

  return $null
}

function Ensure-Go {
  $go = Resolve-Go
  if ($go) { return $go }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'Go nao encontrado e winget indisponivel.' }
  Write-Host 'Instalando Go pelo winget...' -ForegroundColor Yellow
  & $winget.Source install --id GoLang.Go -e --accept-package-agreements --accept-source-agreements --silent
  Refresh-ProcessPath
  $go = Resolve-Go
  if (-not $go) { throw 'Go nao foi localizado apos a instalacao.' }
  return $go
}

function Find-GoAnime {
  Refresh-ProcessPath
  $command = Get-Command goanime.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in @(
      (Join-Path $env:ProgramFiles 'GoAnime\goanime.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'GoAnime\goanime.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\GoAnime\goanime.exe')
    )) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

function Ensure-GoAnime {
  $goAnime = Find-GoAnime
  if ($goAnime) {
    Write-Host "GoAnime encontrado: $goAnime" -ForegroundColor Green
    return $goAnime
  }

  Write-Host 'GoAnime nao encontrado. Baixando o instalador oficial...' -ForegroundColor Yellow
  $headers = @{ 'User-Agent' = 'KitsuneDesk' }
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/alvarorichard/GoAnime/releases/latest' -Headers $headers
  $asset = $release.assets |
    Where-Object { $_.name -match '^GoAnime-Installer-.*\.exe$' -or $_.name -eq 'GoAnimeInstaller.exe' } |
    Select-Object -First 1
  if (-not $asset) { throw 'Instalador oficial do GoAnime nao encontrado na release atual.' }

  $installer = Join-Path $env:TEMP $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $installer
  $process = Start-Process -FilePath $installer -Verb RunAs -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Instalador do GoAnime terminou com o codigo $($process.ExitCode)." }
  Refresh-ProcessPath
  $goAnime = Find-GoAnime
  if (-not $goAnime) { throw 'GoAnime nao foi localizado depois da instalacao.' }
  return $goAnime
}

try {
  if (-not (Test-Path $bridgeSource)) { throw 'O codigo do bridge grafico nao foi encontrado no pacote do KitsuneDesk.' }
  New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null

  $goAnime = Ensure-GoAnime
  $git = Resolve-Git
  $go = Ensure-Go
  Write-Host "Git: $git" -ForegroundColor Green
  Write-Host "Go: $go" -ForegroundColor Green
  & $go version

  if (Test-Path (Join-Path $sourcePath '.git')) {
    Write-Host "Atualizando codigo do GoAnime para $pinnedVersion..." -ForegroundColor Yellow
    & $git -C $sourcePath fetch --depth 1 origin "refs/tags/$pinnedVersion:refs/tags/$pinnedVersion"
    & $git -C $sourcePath reset --hard $pinnedVersion
    & $git -C $sourcePath clean -fd
  } else {
    if (Test-Path $sourcePath) { Remove-Item $sourcePath -Recurse -Force }
    Write-Host "Baixando codigo do GoAnime $pinnedVersion..." -ForegroundColor Yellow
    & $git clone --depth 1 --branch $pinnedVersion https://github.com/alvarorichard/GoAnime.git $sourcePath
  }
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar a versao compativel do GoAnime.' }

  $bridgePackage = Join-Path $sourcePath 'cmd\kitsunedesk-bridge'
  New-Item -ItemType Directory -Path $bridgePackage -Force | Out-Null
  Copy-Item -Path $bridgeSource -Destination (Join-Path $bridgePackage 'main.go') -Force

  Write-Host 'Baixando modulos Go necessarios...' -ForegroundColor Yellow
  Push-Location $sourcePath
  try {
    $env:GOTOOLCHAIN = 'auto'
    & $go mod download
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar os modulos Go.' }

    Write-Host 'Compilando o motor grafico local...' -ForegroundColor Yellow
    $env:CGO_ENABLED = '0'
    & $go build -trimpath -ldflags '-s -w' -o $bridgeExe '.\cmd\kitsunedesk-bridge'
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'Tentando novamente com CGO habilitado...' -ForegroundColor Yellow
      Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
      & $go build -trimpath -ldflags '-s -w' -o $bridgeExe '.\cmd\kitsunedesk-bridge'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o bridge grafico do GoAnime.' }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $bridgeExe)) { throw 'O executavel do bridge nao foi criado.' }
  $versionOutput = & $bridgeExe --version
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch 'kitsunedesk-goanime-bridge') {
    throw 'O bridge foi compilado, mas falhou na verificacao.'
  }

  Write-Host ''
  Write-Host 'GoAnime GUI ativado com sucesso.' -ForegroundColor Green
  Write-Host "Bridge: $bridgeExe" -ForegroundColor DarkGreen
  Write-Host "GoAnime: $goAnime" -ForegroundColor DarkGreen
  Write-Host 'Volte ao KitsuneDesk, clique em Atualizar status e pesquise um anime.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "Falha ao ativar GoAnime GUI: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'O GoAnime classico permanece disponivel e nao foi removido.' -ForegroundColor Yellow
  Write-Host 'Projeto oficial: https://github.com/alvarorichard/GoAnime'
}
