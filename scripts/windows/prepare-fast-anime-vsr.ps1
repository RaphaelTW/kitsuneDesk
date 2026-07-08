$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Write-Host 'KitsuneDesk - preparando FAST Anime VSR' -ForegroundColor Cyan
Write-Host 'IMPORTANTE: FAST Anime VSR nao e um provedor de streaming.' -ForegroundColor Yellow
Write-Host 'Ele processa arquivos de video locais usando super-resolucao por GPU NVIDIA.' -ForegroundColor DarkCyan
Write-Host ''

$toolsRoot = Join-Path $env:LOCALAPPDATA 'KitsuneDesk\tools'
$repoPath = Join-Path $toolsRoot 'FAST_Anime_VSR'
$venvPath = Join-Path $repoPath '.venv'
$venvPython = Join-Path $venvPath 'Scripts\python.exe'

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machinePath, $userPath) -join ';'
}

function Test-Python310 {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path $Path)) { return $false }
  try {
    $value = (& $Path -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null | Select-Object -First 1).Trim()
    return $value -eq '3.10'
  } catch { return $false }
}

function Get-Python310Candidates {
  $candidates = New-Object System.Collections.Generic.List[string]

  foreach ($candidate in @(
      (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310\python.exe'),
      (Join-Path $env:ProgramFiles 'Python310\python.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Python310-32\python.exe')
    )) {
    if ($candidate) { $candidates.Add($candidate) }
  }

  $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    try {
      $launcherPath = & $pyLauncher.Source -3.10 -c "import sys; print(sys.executable)" 2>$null
      if ($LASTEXITCODE -eq 0 -and $launcherPath) { $candidates.Add(($launcherPath | Select-Object -First 1).Trim()) }
    } catch {}

    try {
      foreach ($line in (& $pyLauncher.Source -0p 2>$null)) {
        if ($line -match '-3\.10[^\r\n]*?([A-Za-z]:\\[^\r\n]*python\.exe)') {
          $candidates.Add($Matches[1].Trim())
        }
      }
    } catch {}
  }

  foreach ($registryRoot in @(
      'HKCU:\Software\Python\PythonCore\3.10\InstallPath',
      'HKLM:\Software\Python\PythonCore\3.10\InstallPath',
      'HKLM:\Software\WOW6432Node\Python\PythonCore\3.10\InstallPath'
    )) {
    if (-not (Test-Path $registryRoot)) { continue }
    try {
      $installPath = (Get-Item $registryRoot).GetValue('')
      if ($installPath) { $candidates.Add((Join-Path $installPath 'python.exe')) }
    } catch {}
  }

  return $candidates | Select-Object -Unique
}

function Resolve-Python310 {
  Refresh-ProcessPath
  foreach ($candidate in Get-Python310Candidates) {
    if (Test-Python310 -Path $candidate) { return $candidate }
  }
  return $null
}

function Install-Python310 {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host 'Instalando Python 3.10 pelo winget...' -ForegroundColor Yellow
    & $winget.Source install --id Python.Python.3.10 -e --scope user --accept-package-agreements --accept-source-agreements --silent
    Refresh-ProcessPath
    $resolved = Resolve-Python310
    if ($resolved) { return $resolved }
  }

  Write-Host 'Usando o instalador oficial do Python 3.10.11...' -ForegroundColor Yellow
  $installer = Join-Path $env:TEMP 'python-3.10.11-amd64.exe'
  $targetDir = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python310'
  Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe' -OutFile $installer
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
    throw "O instalador do Python 3.10 terminou com o codigo $($process.ExitCode)."
  }

  Refresh-ProcessPath
  $resolved = Resolve-Python310
  if (-not $resolved) { throw 'Python 3.10 nao foi localizado apos a instalacao oficial.' }
  return $resolved
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
  throw 'Git nao foi localizado apos a instalacao.'
}

try {
  New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null

  $git = Resolve-Git
  Write-Host "Git: $git" -ForegroundColor Green

  $python = Resolve-Python310
  if (-not $python) { $python = Install-Python310 }
  Write-Host "Python 3.10: $python" -ForegroundColor Green

  if (Test-Path (Join-Path $repoPath '.git')) {
    Write-Host 'Atualizando FAST Anime VSR...' -ForegroundColor Yellow
    & $git -C $repoPath fetch --depth 1 origin
    & $git -C $repoPath reset --hard origin/HEAD
  } else {
    if (Test-Path $repoPath) { Remove-Item $repoPath -Recurse -Force }
    Write-Host 'Baixando FAST Anime VSR...' -ForegroundColor Yellow
    & $git clone --depth 1 https://github.com/Kiteretsu77/FAST_Anime_VSR.git $repoPath
  }
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar ou atualizar FAST Anime VSR.' }

  if (Test-Path $venvPath) {
    $validVenv = Test-Path $venvPython
    if ($validVenv) {
      try {
        $validVenv = ((& $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null).Trim() -eq '3.10')
      } catch { $validVenv = $false }
    }
    if (-not $validVenv) { Remove-Item $venvPath -Recurse -Force }
  }

  if (-not (Test-Path $venvPython)) {
    Write-Host 'Criando ambiente virtual Python 3.10...' -ForegroundColor Yellow
    & $python -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o ambiente virtual do FAST Anime VSR.' }
  }

  Write-Host 'Instalando dependencias basicas...' -ForegroundColor Yellow
  & $venvPython -m pip install --upgrade pip setuptools wheel
  & $venvPython -m pip install -r (Join-Path $repoPath 'requirements.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependencias basicas do FAST Anime VSR.' }

  Write-Host ''
  Write-Host 'Ambiente basico do FAST Anime VSR preparado.' -ForegroundColor Green
  Write-Host "Python: $venvPython" -ForegroundColor DarkGreen
  Write-Host ''
  Write-Host 'Ainda e necessario instalar manualmente componentes compativeis com sua GPU:' -ForegroundColor Yellow
  Write-Host '- Driver NVIDIA e CUDA'
  Write-Host '- cuDNN'
  Write-Host '- PyTorch para a versao do CUDA instalada'
  Write-Host '- TensorRT e torch2trt para maior desempenho (opcionais)'
  Write-Host ''
  Write-Host 'O FAST Anime VSR continua separado do streaming do GoAnime.' -ForegroundColor Cyan
} catch {
  Write-Host ''
  Write-Host "Falha ao preparar FAST Anime VSR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Documentacao: https://github.com/Kiteretsu77/FAST_Anime_VSR'
}
