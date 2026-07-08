$ErrorActionPreference = 'Continue'

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $scoopShims = Join-Path $env:USERPROFILE 'scoop\shims'
    $env:Path = "$scoopShims;$machinePath;$userPath"
}

function Ensure-ScoopPackage([string]$Name, [string]$CommandName) {
    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        Write-Host "$Name ja esta instalado." -ForegroundColor DarkGreen
        return
    }

    scoop install $Name
    Refresh-Path

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        Write-Host "Nao foi possivel localizar $Name depois da instalacao." -ForegroundColor Red
    }
}

Write-Host 'KitsuneDesk - instalando ani-cli experimental' -ForegroundColor Cyan
Write-Host 'O ani-cli sera mantido como provedor opcional e fallback.' -ForegroundColor DarkCyan
Write-Host 'Aviso: existe uma falha upstream aberta relacionada a fontes de video.' -ForegroundColor Yellow
Write-Host ''

Refresh-Path
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host 'Instalando Scoop...'
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    Refresh-Path
}

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host 'Scoop ainda nao esta disponivel nesta sessao.' -ForegroundColor Red
    return
}

$hasExtras = scoop bucket list | Select-String -Quiet '^extras\b'
if (-not $hasExtras) {
    scoop bucket add extras
}

Ensure-ScoopPackage 'git' 'git.exe'
Ensure-ScoopPackage 'ani-cli' 'ani-cli'
Ensure-ScoopPackage 'fzf' 'fzf.exe'
Ensure-ScoopPackage 'ffmpeg' 'ffmpeg.exe'
Ensure-ScoopPackage 'mpv' 'mpv.exe'
Ensure-ScoopPackage 'openssl' 'openssl.exe'

Refresh-Path
if (Get-Command ani-cli -ErrorAction SilentlyContinue) {
    ani-cli -U
}

Write-Host ''
Write-Host 'ani-cli preservado e configurado como provedor opcional.' -ForegroundColor Green
Write-Host 'Volte ao KitsuneDesk e clique em Atualizar status.' -ForegroundColor Green
