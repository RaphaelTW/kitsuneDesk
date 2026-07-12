param([Parameter(Mandatory = $true)][string]$PreviousTag)
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
  Start-Process $oldInstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
  $newInstaller = Resolve-Path "dist/KitsuneDesk-Setup-$currentVersion.exe"
  Start-Process $newInstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
  $installed = Join-Path $env:LOCALAPPDATA 'Programs\KitsuneDesk\KitsuneDesk.exe'
  if (-not (Test-Path $installed)) { throw 'Executável instalado não encontrado após o upgrade.' }
  $installedVersion = (Get-Item $installed).VersionInfo.ProductVersion
  if ($installedVersion -notlike "$currentVersion*") { throw "Versão instalada $installedVersion, esperada $currentVersion." }
  Write-Host "Upgrade instalado de $PreviousTag para v$currentVersion validado."
} finally { Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue }
