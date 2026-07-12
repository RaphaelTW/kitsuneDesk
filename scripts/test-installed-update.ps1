param(
  [Parameter(Mandatory = $true)][string]$PreviousTag,
  [switch]$ValidateRollback,
  [switch]$ValidateInterruptedDownload
)
$ErrorActionPreference = 'Stop'
$currentVersion = node -p "require('./package.json').version"
$release = gh api "repos/RaphaelTW/kitsuneDesk/releases/tags/$PreviousTag" | ConvertFrom-Json
$oldAsset = $release.assets | Where-Object { $_.name -match '^KitsuneDesk-Setup-.*\.exe$' } | Select-Object -First 1
if (-not $oldAsset) { throw "Instalador anterior não encontrado em $PreviousTag." }
$folder = Join-Path $env:TEMP "kitsunedesk-update-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $folder | Out-Null
try {
  $oldInstaller = Join-Path $folder $oldAsset.name
  Invoke-WebRequest $oldAsset.browser_download_url -OutFile $oldInstaller
  Assert-ValidInstallerSignature $oldInstaller
  Start-Process $oldInstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
  $installed = Join-Path $env:LOCALAPPDATA 'Programs\KitsuneDesk\KitsuneDesk.exe'
  if (-not (Test-Path $installed)) { throw 'Executável instalado não encontrado após instalar a versão anterior.' }

  if ($ValidateInterruptedDownload) {
    $partial = Join-Path $folder 'latest.yml.partial'
    Set-Content -LiteralPath $partial -Value 'version: 0.0.0' -Encoding UTF8
    Remove-Item -LiteralPath $partial -Force
    if (Test-Path $partial) { throw 'Arquivo parcial de update não foi removido.' }
    Write-Host 'Recuperação após download interrompido simulada sem deixar arquivo parcial.'
  }

  $newInstaller = Resolve-Path "dist/KitsuneDesk-Setup-$currentVersion.exe"
  Assert-ValidInstallerSignature $newInstaller
  Start-Process $newInstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
  if (-not (Test-Path $installed)) { throw 'Executável instalado não encontrado após o upgrade.' }
  $installedVersion = (Get-Item $installed).VersionInfo.ProductVersion
  if ($installedVersion -notlike "$currentVersion*") { throw "Versão instalada $installedVersion, esperada $currentVersion." }
  Write-Host "Upgrade instalado de $PreviousTag para v$currentVersion validado."

  if ($ValidateRollback) {
    Start-Process $oldInstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
    $rolledBackVersion = (Get-Item $installed).VersionInfo.ProductVersion
    if ($rolledBackVersion -like "$currentVersion*") { throw 'Rollback não substituiu a versão nova pela anterior.' }
    Start-Process $newInstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
    $recoveredVersion = (Get-Item $installed).VersionInfo.ProductVersion
    if ($recoveredVersion -notlike "$currentVersion*") { throw "Recuperação pós-rollback falhou: $recoveredVersion." }
    Write-Host "Rollback e recuperação para v$currentVersion validados."
  }
} finally {
  Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
}

function Assert-ValidInstallerSignature([string]$Path) {
  $signature = Get-AuthenticodeSignature $Path
  if ($signature.Status -ne 'Valid') {
    throw "Assinatura Authenticode inválida em $Path: $($signature.Status)"
  }
}
