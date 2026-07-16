param([Parameter(Mandatory = $true)][string[]]$PreviousTag)
$ErrorActionPreference = 'Stop'

$currentVersion = node -p "require('./package.json').version"
$newInstaller = (Resolve-Path "dist/KitsuneDesk-Setup-$currentVersion.exe").Path
$installed = Join-Path $env:LOCALAPPDATA 'Programs\KitsuneDesk\KitsuneDesk.exe'
$uninstaller = Join-Path $env:LOCALAPPDATA 'Programs\KitsuneDesk\Uninstall KitsuneDesk.exe'
$appData = Join-Path $env:APPDATA 'KitsuneDesk'
$databasePath = Join-Path $appData 'database\kitsunedesk.sqlite'
$electronNode = (Resolve-Path 'node_modules\electron\dist\electron.exe').Path
$fixtureScript = (Resolve-Path 'scripts\installed-update-fixture.js').Path

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

function Start-Smoke([string]$Stage) {
  $previousSmoke = $env:KITSUNEDESK_SMOKE_TEST
  $previousNodeMode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:KITSUNEDESK_SMOKE_TEST = '1'
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $process = Start-Process $installed -Wait -WindowStyle Hidden -PassThru
    if ($process.ExitCode -ne 0) { throw "Aplicativo instalado falhou em $Stage." }
  } finally {
    if ($null -eq $previousSmoke) { Remove-Item Env:KITSUNEDESK_SMOKE_TEST -ErrorAction SilentlyContinue } else { $env:KITSUNEDESK_SMOKE_TEST = $previousSmoke }
    if ($null -eq $previousNodeMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE = $previousNodeMode }
  }
}

function Uninstall-Silent {
  if (Test-Path $uninstaller) {
    $exitCode = (Start-Process $uninstaller -ArgumentList '/S' -Wait -WindowStyle Hidden -PassThru).ExitCode
    if ($exitCode -ne 0) { throw "Desinstalação falhou com código $exitCode." }
  }
}

function Invoke-Fixture(
  [Parameter(Mandatory = $true)][string]$Mode,
  [Parameter(Mandatory = $true)][string]$FixtureDatabasePath,
  [string]$BackupPath = ''
) {
  $previousNodeMode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    if ($BackupPath) {
      & $electronNode $fixtureScript $Mode $FixtureDatabasePath $BackupPath
    } else {
      & $electronNode $fixtureScript $Mode $FixtureDatabasePath
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Fixture instalada '$Mode' falhou com código $LASTEXITCODE."
    }
  } finally {
    if ($null -eq $previousNodeMode) {
      Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    } else {
      $env:ELECTRON_RUN_AS_NODE = $previousNodeMode
    }
  }
}

# Instalação realmente limpa: sem versão anterior e sem AppData.
Uninstall-Silent
if (Test-Path $appData) { Remove-Item -LiteralPath $appData -Recurse -Force }
if ((Install-Silent $newInstaller "instalação limpa da v$currentVersion") -ne 0) {
  throw 'Instalação limpa da versão atual falhou.'
}
Assert-InstalledVersion $currentVersion 'instalação limpa da versão atual'
Start-Smoke 'primeira abertura limpa da versão atual'
Invoke-Fixture clean $databasePath
Uninstall-Silent
if (Test-Path $appData) { Remove-Item -LiteralPath $appData -Recurse -Force }

foreach ($tag in $PreviousTag) {
  $folder = Join-Path $env:TEMP "kitsunedesk-update-$($tag.TrimStart('v'))-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $folder | Out-Null
  try {
    Uninstall-Silent
    if (Test-Path $appData) { Remove-Item -LiteralPath $appData -Recurse -Force }

    $release = gh api "repos/RaphaelTW/kitsuneDesk/releases/tags/$tag" | ConvertFrom-Json
    $oldAsset = $release.assets | Where-Object { $_.name -match '^KitsuneDesk-Setup-.*\.exe$' } | Select-Object -First 1
    if (-not $oldAsset) { throw "Instalador anterior não encontrado em $tag." }
    $oldInstaller = Join-Path $folder $oldAsset.name
    Invoke-WebRequest $oldAsset.browser_download_url -OutFile $oldInstaller
    $previousVersion = [regex]::Match($oldAsset.name, 'KitsuneDesk-Setup-(?<version>[0-9]+\.[0-9]+\.[0-9]+)\.exe').Groups['version'].Value
    if (-not $previousVersion) { $previousVersion = $tag.TrimStart('v') }

    if ((Install-Silent $oldInstaller "versão anterior $tag") -ne 0) { throw 'Instalação base falhou.' }
    Assert-InstalledVersion $previousVersion 'instalação base'
    Start-Smoke 'primeira abertura da versão anterior'
    $backupFile = Join-Path $appData 'backups\stable-preservation.kitsunebackup'
    Invoke-Fixture seed $databasePath $backupFile

    $truncated = Join-Path $folder "KitsuneDesk-Setup-$currentVersion-corrompido.exe"
    $stream = [System.IO.File]::OpenRead($newInstaller)
    try {
      $buffer = New-Object byte[] ([Math]::Min($stream.Length, 32768))
      [void]$stream.Read($buffer, 0, $buffer.Length)
      [System.IO.File]::WriteAllBytes($truncated, $buffer)
    } finally { $stream.Dispose() }
    try { $corruptExit = Install-Silent $truncated 'instalador corrompido' } catch { $corruptExit = -1 }
    if ($corruptExit -eq 0) { throw 'Instalador corrompido retornou sucesso inesperado.' }
    Assert-InstalledVersion $previousVersion 'recuperação após instalador corrompido'

    $interrupted = Start-Process $newInstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru
    $interruptDeadline = (Get-Date).AddSeconds(5)
    do {
      Start-Sleep -Milliseconds 250
      $interrupted.Refresh()
    } while (-not $interrupted.HasExited -and (Get-Date) -lt $interruptDeadline -and $interrupted.TotalProcessorTime.TotalMilliseconds -lt 250)
    if (-not $interrupted.HasExited) { Stop-Process -Id $interrupted.Id -Force }
    [void](Install-Silent $oldInstaller 'reparo após encerramento durante atualização')
    Assert-InstalledVersion $previousVersion 'recuperação após encerramento'
    Invoke-Fixture partial $databasePath

    if ((Install-Silent $newInstaller "upgrade para v$currentVersion") -ne 0) { throw 'Upgrade falhou.' }
    Assert-InstalledVersion $currentVersion 'upgrade'
    Start-Smoke 'abertura pós-upgrade'
    Invoke-Fixture verify $databasePath $backupFile

    if ((Install-Silent $newInstaller 'reinstalação sobre a mesma versão') -ne 0) { throw 'Reinstalação falhou.' }
    Assert-InstalledVersion $currentVersion 'reinstalação da mesma versão'

    if ((Install-Silent $oldInstaller "rollback para $tag") -ne 0) { throw 'Rollback falhou.' }
    Assert-InstalledVersion $previousVersion 'rollback'
    if ((Install-Silent $newInstaller 'recuperação pós-rollback') -ne 0) { throw 'Recuperação pós-rollback falhou.' }
    Assert-InstalledVersion $currentVersion 'recuperação pós-rollback'

    Uninstall-Silent
    if (Test-Path $installed) { throw 'Executável permaneceu após desinstalação.' }
    if (-not (Test-Path $backupFile)) { throw 'Backup real foi removido durante desinstalação.' }
    if ((Install-Silent $newInstaller 'reinstalação preservando dados') -ne 0) { throw 'Reinstalação falhou.' }
    Assert-InstalledVersion $currentVersion 'reinstalação preservando dados'
    Start-Smoke 'reabertura após desinstalar e reinstalar'
    Invoke-Fixture verify $databasePath $backupFile

    Write-Host "Matriz instalada concluída de $tag para v$currentVersion."
  } finally {
    Uninstall-Silent
    if (Test-Path $appData) { Remove-Item -LiteralPath $appData -Recurse -Force }
    Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
  }
}
