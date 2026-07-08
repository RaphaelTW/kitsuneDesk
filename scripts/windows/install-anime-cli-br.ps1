$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Write-Host 'KitsuneDesk - instalando anime-cli-br' -ForegroundColor Cyan
Write-Host 'Projeto brasileiro baseado em AnimeFire. Usa um ambiente Python dedicado e VLC.' -ForegroundColor DarkCyan
Write-Host ''

$toolsRoot = Join-Path $env:LOCALAPPDATA 'KitsuneDesk\tools'
$repoPath = Join-Path $toolsRoot 'anime-cli-br'
$venvPath = Join-Path $repoPath '.venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
$venvCommand = Join-Path $venvPath 'Scripts\anime-cli-br.exe'

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machinePath, $userPath) -join ';'
}

function Test-PythonVersion {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path $Path)) { return $false }

  try {
    $versionText = (& $Path -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null | Select-Object -First 1).Trim()
    if (-not $versionText) { return $false }
    $version = [version]$versionText
    return $version.Major -eq 3 -and $version.Minor -ge 10 -and $version.Minor -le 12
  } catch {
    return $false
  }
}

function Get-PythonCandidates {
  $candidates = New-Object System.Collections.Generic.List[string]

  foreach ($candidate in @(
      (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310\python.exe'),
      (Join-Path $env:ProgramFiles 'Python312\python.exe'),
      (Join-Path $env:ProgramFiles 'Python311\python.exe'),
      (Join-Path $env:ProgramFiles 'Python310\python.exe')
    )) {
    if ($candidate) { $candidates.Add($candidate) }
  }

  $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    try {
      $launcherOutput = & $pyLauncher.Source -0p 2>$null
      foreach ($line in $launcherOutput) {
        if ($line -match '([A-Za-z]:\\[^\r\n]*python\.exe)') {
          $candidates.Add($Matches[1].Trim())
        }
      }
    } catch {}
  }

  foreach ($registryRoot in @(
      'HKCU:\Software\Python\PythonCore',
      'HKLM:\Software\Python\PythonCore',
      'HKLM:\Software\WOW6432Node\Python\PythonCore'
    )) {
    if (-not (Test-Path $registryRoot)) { continue }
    Get-ChildItem $registryRoot -ErrorAction SilentlyContinue | ForEach-Object {
      $installKey = Join-Path $_.PSPath 'InstallPath'
      try {
        $installPath = (Get-ItemProperty -Path $installKey -ErrorAction Stop).'(default)'
        if (-not $installPath) {
          $installPath = (Get-Item -Path $installKey -ErrorAction Stop).GetValue('')
        }
        if ($installPath) { $candidates.Add((Join-Path $installPath 'python.exe')) }
      } catch {}
    }
  }

  foreach ($commandName in @('python.exe', 'python3.exe', 'python')) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) { $candidates.Add($command.Source) }
  }

  return $candidates | Select-Object -Unique
}

function Resolve-CompatiblePython {
  Refresh-ProcessPath
  foreach ($candidate in Get-PythonCandidates) {
    if (Test-PythonVersion -Path $candidate) { return $candidate }
  }
  return $null
}

function Install-Python312 {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host 'Instalando Python 3.12 pelo winget...' -ForegroundColor Yellow
    & $winget.Source install --id Python.Python.3.12 -e --scope user --accept-package-agreements --accept-source-agreements --silent
    Refresh-ProcessPath
    $resolved = Resolve-CompatiblePython
    if ($resolved) { return $resolved }
  }

  Write-Host 'Usando o instalador oficial do Python 3.12...' -ForegroundColor Yellow
  $installer = Join-Path $env:TEMP 'python-3.12.10-amd64.exe'
  $targetDir = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312'
  Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile $installer
  $arguments = @(
    '/quiet',
    'InstallAllUsers=0',
    'PrependPath=1',
    'Include_launcher=1',
    'Include_test=0',
    ('TargetDir="' + $targetDir + '"')
  )
  $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "O instalador oficial do Python terminou com o codigo $($process.ExitCode)."
  }

  Refresh-ProcessPath
  $resolved = Resolve-CompatiblePython
  if (-not $resolved) { throw 'Python 3.10, 3.11 ou 3.12 nao foi localizado apos a instalacao.' }
  return $resolved
}

function Resolve-Git {
  Refresh-ProcessPath
  $git = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($git) { return $git.Source }

  $candidates = @(
    (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
    (Join-Path $env:USERPROFILE 'scoop\apps\git\current\cmd\git.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'Git nao encontrado e winget indisponivel.' }

  Write-Host 'Instalando Git...' -ForegroundColor Yellow
  & $winget.Source install --id Git.Git -e --accept-package-agreements --accept-source-agreements --silent
  Refresh-ProcessPath
  $git = Get-Command git.exe -ErrorAction SilentlyContinue
  if ($git) { return $git.Source }

  $fallback = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
  if (Test-Path $fallback) { return $fallback }
  throw 'Git nao foi localizado apos a instalacao.'
}

function Resolve-Vlc {
  Refresh-ProcessPath
  $command = Get-Command vlc.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  foreach ($candidate in @(
      (Join-Path $env:ProgramFiles 'VideoLAN\VLC\vlc.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'VideoLAN\VLC\vlc.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\VideoLAN\VLC\vlc.exe')
    )) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }

  return $null
}

function Ensure-Vlc {
  $vlc = Resolve-Vlc
  if ($vlc) {
    Write-Host "VLC encontrado: $vlc" -ForegroundColor Green
    return $vlc
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'VLC nao encontrado e winget indisponivel.' }

  Write-Host 'Instalando VLC Media Player...' -ForegroundColor Yellow
  # O winget pode retornar codigo diferente de zero quando o VLC ja esta instalado e sem atualizacao.
  # A verificacao do executavel abaixo e a fonte de verdade.
  & $winget.Source install --id VideoLAN.VLC -e --accept-package-agreements --accept-source-agreements --silent
  Refresh-ProcessPath
  $vlc = Resolve-Vlc
  if (-not $vlc) { throw 'VLC Media Player nao foi localizado apos a tentativa de instalacao.' }
  return $vlc
}

try {
  New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

  $python = Resolve-CompatiblePython
  if (-not $python) { $python = Install-Python312 }
  Write-Host "Python compativel: $python" -ForegroundColor Green

  $git = Resolve-Git
  Write-Host "Git: $git" -ForegroundColor Green

  $vlc = Ensure-Vlc
  $vlcDirectory = Split-Path $vlc -Parent
  if ($env:Path -notlike "*$vlcDirectory*") { $env:Path = "$vlcDirectory;$env:Path" }

  if (Test-Path (Join-Path $repoPath '.git')) {
    Write-Host 'Atualizando o codigo do anime-cli-br...' -ForegroundColor Yellow
    & $git -C $repoPath fetch --depth 1 origin main
    & $git -C $repoPath reset --hard origin/main
  } else {
    if (Test-Path $repoPath) { Remove-Item $repoPath -Recurse -Force }
    Write-Host 'Baixando o anime-cli-br...' -ForegroundColor Yellow
    & $git clone --depth 1 https://github.com/MtywX/anime-cli-br.git $repoPath
  }

  if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar ou atualizar o anime-cli-br.' }

  if (Test-Path $venvPath) {
    $existingVersionOk = Test-Path $venvPython
    if ($existingVersionOk) {
      try {
        $venvVersion = (& $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null).Trim()
        $existingVersionOk = $venvVersion -in @('3.10', '3.11', '3.12')
      } catch { $existingVersionOk = $false }
    }
    if (-not $existingVersionOk) { Remove-Item $venvPath -Recurse -Force }
  }

  if (-not (Test-Path $venvPython)) {
    Write-Host 'Criando ambiente Python dedicado...' -ForegroundColor Yellow
    & $python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o ambiente virtual do anime-cli-br.' }
  }

  Write-Host 'Instalando dependencias do anime-cli-br...' -ForegroundColor Yellow
  & $venvPython -m pip install --upgrade pip setuptools wheel
  & $venvPython -m pip install requests click beautifulsoup4 colorama
  & $venvPython -m pip install --force-reinstall $repoPath
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o anime-cli-br no ambiente dedicado.' }

  if (-not (Test-Path $venvCommand)) { throw 'O comando anime-cli-br nao foi criado no ambiente dedicado.' }

  Write-Host ''
  Write-Host 'anime-cli-br instalado no ambiente isolado do KitsuneDesk.' -ForegroundColor Green
  Write-Host "Comando: $venvCommand" -ForegroundColor DarkGreen
  Write-Host 'Observacao: se animefire.net estiver fora do ar ou sem DNS, o KitsuneDesk mostrara um aviso sem abrir traceback.' -ForegroundColor Yellow
  Write-Host 'Volte ao KitsuneDesk e clique em Atualizar status.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "Falha ao instalar anime-cli-br: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Projeto: https://github.com/MtywX/anime-cli-br'
}
