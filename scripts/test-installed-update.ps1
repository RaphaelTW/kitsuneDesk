param([Parameter(Mandatory = $true)][string]$PreviousTag)
$ErrorActionPreference = 'Stop'

$currentVersion = node -p "require('./package.json').version"
$release = gh api "repos/RaphaelTW/kitsuneDesk/releases/tags/$PreviousTag" | ConvertFrom-Json
$oldAsset = $release.assets | Where-Object { $_.name -match '^KitsuneDesk-Setup-.*\.exe$' } | Select-Object -First 1
if (-not $oldAsset) { throw "Instalador anterior não encontrado em $PreviousTag." }

$folder = Join-Path $env:TEMP "kitsunedesk-update-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $folder | Out-Null
$installed = Join-Path $env:LOCALAPPDATA 'Programs\KitsuneDesk\KitsuneDesk.exe'

function Install-Silent([string]$InstallerPath, [string]$Label) {
  Write-Host "Instalando $Label..."
  $process = Start-Process $InstallerPath -ArgumentList '/S' -Wait -WindowStyle Hidden -PassThru
  return $process.ExitCode
}

function Assert-InstalledVersion([string]$ExpectedVersion, [string]$Stage) {
  if (-not (Test-Path $installed)) { throw "Executável instalado não encontrado em $Stage." }
  $installedVersion = (Get-Item $installed).VersionInfo.ProductVersion
  if ($installedVersion -notlike "$ExpectedVersion*") {
    throw "Versão instalada $installedVersion em $Stage, esperada $ExpectedVersion."
  }
  Write-Host "Versão $installedVersion validada em $Stage."
}

try {
  $oldInstaller = Join-Path $folder $oldAsset.name
  Invoke-WebRequest $oldAsset.browser_download_url -OutFile $oldInstaller
  $previousVersion = [regex]::Match($oldAsset.name, 'KitsuneDesk-Setup-(?<version>[0-9]+\.[0-9]+\.[0-9]+)\.exe').Groups['version'].Value
  if (-not $previousVersion) { $previousVersion = $PreviousTag.TrimStart('v') }

  $exitCode = Install-Silent $oldInstaller "versão anterior $PreviousTag"
  if ($exitCode -ne 0) { throw "Instalação anterior falhou com código $exitCode." }
  Assert-InstalledVersion $previousVersion 'instalação base'

  $newInstaller = Resolve-Path "dist/KitsuneDesk-Setup-$currentVersion.exe"
  $interruptedInstaller = Join-Path $folder "KitsuneDesk-Setup-$currentVersion-interrompido.exe"
  $bytes = [System.IO.File]::ReadAllBytes($newInstaller.Path)
  $partialLength = [Math]::Min($bytes.Length, 32768)
  $partial = New-Object byte[] $partialLength
  [Array]::Copy($bytes, $partial, $partialLength)
  [System.IO.File]::WriteAllBytes($interruptedInstaller, $partial)

  $interruptedExitCode = $null
  try {
    $interruptedExitCode = Install-Silent $interruptedInstaller 'download interrompido simulado'
  } catch {
    Write-Host "Falha esperada no instalador truncado: $($_.Exception.Message)"
  }
  if ($interruptedExitCode -eq 0) {
    throw 'Instalador truncado retornou sucesso inesperado.'
  }
  Assert-InstalledVersion $previousVersion 'recuperação após download interrompido'

  $exitCode = Install-Silent $newInstaller.Path "upgrade para v$currentVersion"
  if ($exitCode -ne 0) { throw "Upgrade falhou com código $exitCode." }
  Assert-InstalledVersion $currentVersion 'upgrade'

  $exitCode = Install-Silent $oldInstaller "rollback para $PreviousTag"
  if ($exitCode -ne 0) { throw "Rollback falhou com código $exitCode." }
  Assert-InstalledVersion $previousVersion 'rollback'

  $exitCode = Install-Silent $newInstaller.Path "recuperação pós-rollback para v$currentVersion"
  if ($exitCode -ne 0) { throw "Reinstalação pós-rollback falhou com código $exitCode." }
  Assert-InstalledVersion $currentVersion 'recuperação pós-rollback'

  Write-Host "Upgrade, rollback e recuperação após download interrompido validados de $PreviousTag para v$currentVersion."
} finally {
  Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
}
