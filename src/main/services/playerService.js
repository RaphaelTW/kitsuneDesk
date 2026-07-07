const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const AppError = require('../utils/AppError');

const SUPPORTED_PROVIDERS = new Set(['auto', 'goanime', 'ani-cli']);
const SUPPORTED_QUALITIES = new Set(['auto', '360', '480', '720', '1080']);
const SUPPORTED_LANGUAGES = new Set(['sub', 'dub']);

class PlayerService {
  /**
   * Abre o provedor escolhido em um terminal interativo.
   * O modo automatico prioriza o GoAnime e usa ani-cli como fallback.
   *
   * @param {unknown} payload
   * @returns {{launched: boolean, provider: string, providerName: string, terminal: string}}
   */
  play(payload) {
    const request = normalizePlayPayload(payload);
    const status = this.status();
    const provider = resolveProvider(request.provider, status);

    if (provider === 'goanime') {
      const terminal = launchGoAnime({ request, status });

      return {
        launched: true,
        provider,
        providerName: 'GoAnime',
        terminal
      };
    }

    const terminal = launchAniCli({ request, status });

    return {
      launched: true,
      provider,
      providerName: 'ani-cli',
      terminal
    };
  }

  /**
   * Retorna o estado dos provedores e dependencias locais.
   *
   * @returns {object}
   */
  status() {
    const goAnime = findGoAnime();
    const mpv = findMpv(goAnime.path);
    const aniCli = findCommand('ani-cli');
    const fzf = findCommand('fzf');
    const ffmpeg = findCommand('ffmpeg');
    const openssl = findCommand('openssl');
    const gitBash = findGitBash();
    const windowsTerminal = findCommand('wt');
    const cmd = findCommand('cmd.exe');

    const goAnimeReady = Boolean(goAnime.available && mpv.available);
    const aniCliReady = Boolean(
      aniCli.available && mpv.available && fzf.available && ffmpeg.available && gitBash.available
    );

    return {
      ready: goAnimeReady || aniCliReady,
      recommendedProvider: goAnimeReady ? 'goanime' : aniCliReady ? 'ani-cli' : null,
      providers: {
        goAnime: {
          id: 'goanime',
          name: 'GoAnime',
          ready: goAnimeReady,
          executable: goAnime,
          mpv,
          description: 'Provedor recomendado com TUI, historico e suporte a fontes PT-BR.'
        },
        aniCli: {
          id: 'ani-cli',
          name: 'ani-cli',
          ready: aniCliReady,
          executable: aniCli,
          description: 'Provedor alternativo executado pelo Git Bash.'
        }
      },
      dependencies: {
        goAnime,
        aniCli,
        mpv,
        fzf,
        ffmpeg,
        openssl,
        gitBash,
        windowsTerminal,
        cmd
      },
      installCommands: {
        goAnime: [
          'Instalador oficial: GitHub Releases do GoAnime',
          'O instalador inclui o MPV e pode adicionar ambos ao PATH.'
        ],
        aniCli: [
          'scoop install git',
          'scoop bucket add extras',
          'scoop install ani-cli fzf ffmpeg mpv openssl'
        ]
      }
    };
  }

  /**
   * Abre o instalador do provedor escolhido.
   *
   * @param {unknown} payload
   * @returns {{launched: boolean, provider: string, terminal: string, scriptPath: string}}
   */
  installDependencies(payload) {
    const provider = normalizeInstallProvider(payload);
    const status = this.status();
    const terminal = choosePowerShellTerminal(status);
    const scriptPath =
      provider === 'ani-cli' ? writeAniCliInstallScript() : writeGoAnimeInstallScript();

    if (!terminal.path) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'PowerShell nao foi encontrado para abrir o instalador.',
        { status: 424 }
      );
    }

    launchPowerShellScript({ terminal, scriptPath });

    return {
      launched: true,
      provider,
      terminal: terminal.name,
      scriptPath
    };
  }

  /**
   * @param {string} message
   * @returns {{available: false, message: string}}
   */
  notImplemented(message) {
    return {
      available: false,
      message
    };
  }
}

/**
 * @param {unknown} payload
 * @returns {{query: string, provider: 'auto'|'goanime'|'ani-cli', language: 'sub'|'dub', quality: string}}
 */
function normalizePlayPayload(payload) {
  const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
  const provider = SUPPORTED_PROVIDERS.has(payload?.provider) ? payload.provider : 'auto';
  const language = SUPPORTED_LANGUAGES.has(payload?.language) ? payload.language : 'sub';
  const quality = SUPPORTED_QUALITIES.has(String(payload?.quality))
    ? String(payload.quality)
    : 'auto';

  if (query.length < 2) {
    throw new AppError('ANIME_NOT_FOUND', 'Digite pelo menos dois caracteres para pesquisar.', {
      status: 400
    });
  }

  return { query, provider, language, quality };
}

/**
 * @param {unknown} payload
 * @returns {'goanime'|'ani-cli'}
 */
function normalizeInstallProvider(payload) {
  return payload?.provider === 'ani-cli' ? 'ani-cli' : 'goanime';
}

/**
 * @param {'auto'|'goanime'|'ani-cli'} requestedProvider
 * @param {object} status
 * @returns {'goanime'|'ani-cli'}
 */
function resolveProvider(requestedProvider, status) {
  if (requestedProvider === 'goanime') {
    assertGoAnimeReady(status);
    return 'goanime';
  }

  if (requestedProvider === 'ani-cli') {
    assertAniCliReady(status);
    return 'ani-cli';
  }

  if (status.providers.goAnime.ready) {
    return 'goanime';
  }

  if (status.providers.aniCli.ready) {
    return 'ani-cli';
  }

  throw new AppError(
    'PROVIDER_UNAVAILABLE',
    'Nenhum provedor esta pronto. Instale o GoAnime pelo botao Instalar GoAnime.',
    { status: 424 }
  );
}

/**
 * @param {object} status
 */
function assertGoAnimeReady(status) {
  if (!status.dependencies.goAnime.available) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'GoAnime nao foi encontrado. Use o botao Instalar GoAnime e atualize o status.',
      { status: 424 }
    );
  }

  if (!status.dependencies.mpv.available) {
    throw new AppError(
      'PLAYER_NOT_FOUND',
      'MPV nao foi encontrado. Reinstale o GoAnime mantendo a opcao de incluir o MPV.',
      { status: 424 }
    );
  }
}

/**
 * @param {object} status
 */
function assertAniCliReady(status) {
  const missing = [];

  if (!status.dependencies.aniCli.available) missing.push('ani-cli');
  if (!status.dependencies.gitBash.available) missing.push('Git Bash');
  if (!status.dependencies.mpv.available) missing.push('MPV');
  if (!status.dependencies.fzf.available) missing.push('fzf');
  if (!status.dependencies.ffmpeg.available) missing.push('ffmpeg');

  if (missing.length > 0) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `O fallback ani-cli nao esta pronto. Faltando: ${missing.join(', ')}.`,
      { status: 424 }
    );
  }
}

/**
 * @param {{request: object, status: object}} options
 * @returns {string}
 */
function launchGoAnime({ request, status }) {
  assertGoAnimeReady(status);

  const executablePath = status.dependencies.goAnime.path;
  const args = buildGoAnimeArgs(request);
  const scriptPath = writeGoAnimeLaunchScript({ executablePath, args, status });
  const terminal = chooseInteractiveWindowsTerminal(status);

  launchCommandScript({ terminal, scriptPath, title: 'KitsuneDesk GoAnime' });
  return terminal.name;
}

/**
 * @param {{query: string, language: 'sub'|'dub', quality: string}} request
 * @returns {string[]}
 */
function buildGoAnimeArgs(request) {
  const args = ['--quality', normalizeGoAnimeQuality(request.quality)];

  // A fonte PT-BR e usada para priorizar resultados em portugues quando o
  // usuario seleciona Dublado. No modo Legendado, o GoAnime pesquisa em todas
  // as fontes ativas, comportamento padrao documentado pelo projeto.
  if (request.language === 'dub') {
    args.push('--source', 'ptbr');
  }

  args.push(request.query);
  return args;
}

/**
 * @param {string} quality
 * @returns {string}
 */
function normalizeGoAnimeQuality(quality) {
  if (quality === 'auto') {
    return 'best';
  }

  return `${quality}p`;
}

/**
 * @param {{executablePath: string, args: string[], status: object}} options
 * @returns {string}
 */
function writeGoAnimeLaunchScript({ executablePath, args, status }) {
  const scriptPath = path.join(os.tmpdir(), `kitsunedesk-goanime-${process.pid}-${Date.now()}.cmd`);
  const directories = getGoAnimeDirectories(status);
  const pathPrefix = directories.length > 0 ? `${directories.join(';')};` : '';
  const command = [quoteForCmd(executablePath), ...args.map(quoteForCmd)].join(' ');
  const script = `@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\nset "PATH=${escapeForSet(pathPrefix)}%PATH%"\r\ntitle KitsuneDesk GoAnime\r\necho KitsuneDesk - abrindo GoAnime...\r\necho.\r\n${command}\r\nset "exit_code=%ERRORLEVEL%"\r\necho.\r\nif not "%exit_code%"=="0" echo O GoAnime foi encerrado com o codigo %exit_code%.\r\necho Pressione qualquer tecla para fechar esta janela.\r\npause >nul\r\nexit /b %exit_code%\r\n`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

/**
 * @param {{request: object, status: object}} options
 * @returns {string}
 */
function launchAniCli({ request, status }) {
  assertAniCliReady(status);

  const terminal = chooseAniCliTerminal(status);
  const command = buildAniCliCommand(request, status.dependencies.aniCli.path);
  const scriptPath = writeAniCliLaunchScript(command, status);
  const bashScriptPath = toBashPath(scriptPath);
  const env = {
    ...process.env,
    MSYS: 'enable_pcon',
    PATH: buildWindowsPathPrefix(status) + (process.env.PATH ?? '')
  };

  if (terminal.type === 'windows-terminal') {
    spawn(
      terminal.path,
      [
        'new-tab',
        '--title',
        'KitsuneDesk ani-cli',
        status.dependencies.gitBash.path,
        '--login',
        bashScriptPath
      ],
      {
        detached: true,
        env,
        stdio: 'ignore',
        windowsHide: false
      }
    ).unref();
  } else {
    const startCommand = `start "" "${status.dependencies.gitBash.path}" --login "${bashScriptPath}"`;
    spawn('cmd.exe', ['/d', '/s', '/c', startCommand], {
      detached: true,
      env,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
  }

  return terminal.name;
}

/**
 * @param {{query: string, language: 'sub'|'dub', quality: string}} request
 * @param {string | null} executablePath
 * @returns {string}
 */
function buildAniCliCommand(request, executablePath) {
  const executable = executablePath ? quoteForBash(toBashPath(executablePath)) : 'ani-cli';
  const args = [];

  if (request.language === 'dub') {
    args.push('--dub');
  }

  if (request.quality !== 'auto') {
    args.push('-q', request.quality);
  }

  args.push(request.query);

  return `${executable} ${args.map(quoteForBash).join(' ')}`;
}

/**
 * @param {string} command
 * @param {object} status
 * @returns {string}
 */
function writeAniCliLaunchScript(command, status) {
  const scriptPath = path.join(os.tmpdir(), `kitsunedesk-ani-cli-${process.pid}-${Date.now()}.sh`);
  const pathPrefix = buildBashPathPrefix(status);
  const script = `#!/usr/bin/env bash
set +e

${pathPrefix}${command}
exit_code=$?

printf '\n'
if [ "$exit_code" -ne 0 ]; then
  printf 'O ani-cli foi encerrado com o codigo %s.\n' "$exit_code"
fi

read -r -p 'Pressione Enter para fechar...'
exit "$exit_code"
`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

/**
 * @param {object} status
 * @returns {{name: string, type: string, path: string}}
 */
function chooseInteractiveWindowsTerminal(status) {
  if (status.dependencies.windowsTerminal.available) {
    return {
      name: 'Windows Terminal',
      type: 'windows-terminal',
      path: status.dependencies.windowsTerminal.path
    };
  }

  const cmdPath = status.dependencies.cmd.path ?? findCommand('cmd').path;

  if (!cmdPath) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'Prompt de Comando nao foi encontrado.', {
      status: 424
    });
  }

  return {
    name: 'Prompt de Comando',
    type: 'cmd',
    path: cmdPath
  };
}

/**
 * @param {object} status
 * @returns {{name: string, type: string, path: string}}
 */
function chooseAniCliTerminal(status) {
  if (status.dependencies.windowsTerminal.available) {
    return {
      name: 'Windows Terminal',
      type: 'windows-terminal',
      path: status.dependencies.windowsTerminal.path
    };
  }

  return {
    name: 'Git Bash',
    type: 'git-bash',
    path: status.dependencies.gitBash.path
  };
}

/**
 * @param {{terminal: object, scriptPath: string, title: string}} options
 */
function launchCommandScript({ terminal, scriptPath, title }) {
  if (terminal.type === 'windows-terminal') {
    const cmdPath = findCommand('cmd.exe').path ?? 'cmd.exe';

    spawn(terminal.path, ['new-tab', '--title', title, cmdPath, '/d', '/q', '/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }).unref();
    return;
  }

  const startCommand = `start "" cmd.exe /d /q /c "${scriptPath}"`;
  spawn('cmd.exe', ['/d', '/s', '/c', startCommand], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

/**
 * @param {object} status
 * @returns {{name: string, type: string, path: string | null}}
 */
function choosePowerShellTerminal(status) {
  if (status.dependencies.windowsTerminal.available) {
    return {
      name: 'Windows Terminal',
      type: 'windows-terminal',
      path: status.dependencies.windowsTerminal.path
    };
  }

  return {
    name: 'PowerShell',
    type: 'powershell',
    path: findPowerShell()
  };
}

/**
 * @param {{terminal: object, scriptPath: string}} options
 */
function launchPowerShellScript({ terminal, scriptPath }) {
  const powerShellPath = findPowerShell() ?? 'powershell.exe';
  const args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];

  if (terminal.type === 'windows-terminal') {
    spawn(terminal.path, ['new-tab', '--title', 'KitsuneDesk setup', powerShellPath, ...args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }).unref();
    return;
  }

  spawn(terminal.path, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  }).unref();
}

/**
 * @returns {string}
 */
function writeGoAnimeInstallScript() {
  const scriptPath = path.join(os.tmpdir(), 'kitsunedesk-install-goanime.ps1');
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Write-Host 'KitsuneDesk - Instalador oficial do GoAnime' -ForegroundColor Cyan
Write-Host 'O pacote oficial inclui o GoAnime e o MPV.' -ForegroundColor DarkCyan
Write-Host ''

try {
  $headers = @{ 'User-Agent' = 'KitsuneDesk' }
  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/alvarorichard/GoAnime/releases/latest' -Headers $headers
  $asset = $release.assets |
    Where-Object { $_.name -match '^GoAnime-Installer-.*\\.exe$' -or $_.name -eq 'GoAnimeInstaller.exe' } |
    Select-Object -First 1

  if (-not $asset) {
    throw 'O instalador do Windows nao foi encontrado na release mais recente.'
  }

  $installerPath = Join-Path $env:TEMP $asset.name
  Write-Host "Baixando $($asset.name)..." -ForegroundColor Yellow
  Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $installerPath

  if (-not (Test-Path $installerPath) -or (Get-Item $installerPath).Length -lt 1MB) {
    throw 'O arquivo baixado parece invalido ou incompleto.'
  }

  Write-Host 'Abrindo o instalador. Mantenha marcada a opcao Add GoAnime and MPV to PATH.' -ForegroundColor Yellow
  Start-Process -FilePath $installerPath -Verb RunAs -Wait

  $goAnimePath = Join-Path $env:ProgramFiles 'GoAnime\\goanime.exe'
  if (Test-Path $goAnimePath) {
    Write-Host ''
    Write-Host 'GoAnime instalado com sucesso.' -ForegroundColor Green
    Write-Host 'Volte ao KitsuneDesk e clique em Atualizar status.' -ForegroundColor Green
  } else {
    Write-Host ''
    Write-Host 'O instalador terminou, mas o executavel ainda nao foi localizado.' -ForegroundColor Yellow
    Write-Host 'Confirme a instalacao e clique em Atualizar status no KitsuneDesk.'
  }
} catch {
  Write-Host ''
  Write-Host "Falha ao instalar o GoAnime: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Pagina oficial: https://github.com/alvarorichard/GoAnime/releases/latest'
}
`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

/**
 * @returns {string}
 */
function writeAniCliInstallScript() {
  const scriptPath = path.join(os.tmpdir(), 'kitsunedesk-install-ani-cli.ps1');
  const script = `$ErrorActionPreference = 'Continue'

Write-Host 'KitsuneDesk - instalando fallback ani-cli' -ForegroundColor Cyan
Write-Host ''

$scoopShims = Join-Path $env:USERPROFILE 'scoop\\shims'
if (Test-Path $scoopShims) {
  $env:PATH = "$scoopShims;$env:PATH"
}

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
  Write-Host 'Instalando Scoop...'
  Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
}

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
  Write-Host 'Scoop ainda nao esta disponivel nesta sessao.' -ForegroundColor Red
  Write-Host 'Feche e abra o terminal, depois rode o instalador novamente.'
  return
}

scoop install git

$hasExtras = scoop bucket list | Select-String -Quiet '^extras\\b'
if (-not $hasExtras) {
  scoop bucket add extras
}

scoop install ani-cli fzf ffmpeg mpv openssl

Write-Host ''
Write-Host 'Fallback instalado. Volte ao KitsuneDesk e clique em Atualizar status.' -ForegroundColor Green
`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

/**
 * @returns {{available: boolean, path: string | null}}
 */
function findGoAnime() {
  const pathMatch = findCommandOnPath('goanime');
  const candidates = [
    pathMatch,
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'GoAnime', 'goanime.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'GoAnime',
      'goanime.exe'
    ),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'GoAnime', 'goanime.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'GoAnime', 'goanime.exe'),
    path.join(os.homedir(), 'go', 'bin', 'goanime.exe'),
    path.join(process.cwd(), 'resources', 'goanime', 'goanime.exe'),
    path.join(__dirname, '..', '..', '..', 'resources', 'goanime', 'goanime.exe')
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  return {
    available: Boolean(match),
    path: match ?? null
  };
}

/**
 * @param {string | null} goAnimePath
 * @returns {{available: boolean, path: string | null, bundledWithGoAnime: boolean}}
 */
function findMpv(goAnimePath) {
  const goAnimeDirectory = goAnimePath ? path.dirname(goAnimePath) : null;
  const bundledCandidate = goAnimeDirectory ? path.join(goAnimeDirectory, 'bin', 'mpv.exe') : null;
  const pathMatch = findCommandOnPath('mpv');
  const candidates = [
    bundledCandidate,
    pathMatch,
    findScoopShim('mpv'),
    findScoopAppExecutable('mpv'),
    path.join(process.cwd(), 'resources', 'mpv', 'mpv.exe'),
    path.join(__dirname, '..', '..', '..', 'resources', 'mpv', 'mpv.exe')
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  return {
    available: Boolean(match),
    path: match ?? null,
    bundledWithGoAnime: Boolean(match && bundledCandidate && samePath(match, bundledCandidate))
  };
}

/**
 * @param {string} command
 * @returns {{available: boolean, path: string | null}}
 */
function findCommand(command) {
  const firstMatch =
    findCommandOnPath(command) ?? findScoopShim(command) ?? findScoopAppExecutable(command);

  return {
    available: Boolean(firstMatch),
    path: firstMatch ?? null
  };
}

/**
 * @param {string} command
 * @returns {string | null}
 */
function findCommandOnPath(command) {
  const result = spawnSync('where.exe', [command], {
    encoding: 'utf8',
    windowsHide: true
  });

  return (
    result.stdout
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

/**
 * @param {string} command
 * @returns {string | null}
 */
function findScoopShim(command) {
  const shimsDir = path.join(os.homedir(), 'scoop', 'shims');
  const candidates = [
    path.join(shimsDir, `${command}.exe`),
    path.join(shimsDir, `${command}.cmd`),
    path.join(shimsDir, `${command}.bat`),
    path.join(shimsDir, command)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/**
 * @param {string} command
 * @returns {string | null}
 */
function findScoopAppExecutable(command) {
  const appDir = path.join(os.homedir(), 'scoop', 'apps', command, 'current');
  const candidates = [
    path.join(appDir, `${command}.exe`),
    path.join(appDir, `${command}.cmd`),
    path.join(appDir, command)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/**
 * @returns {{available: boolean, path: string | null}}
 */
function findGitBash() {
  const candidates = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'),
    path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'usr', 'bin', 'bash.exe')
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (match) {
    return {
      available: true,
      path: match
    };
  }

  const bashFromPath = findCommand('bash');
  const isGitBash = Boolean(
    bashFromPath.path &&
    /\\git\\|\/git\//i.test(bashFromPath.path) &&
    !/\\windowsapps\\/i.test(bashFromPath.path)
  );

  return {
    available: isGitBash,
    path: isGitBash ? bashFromPath.path : null
  };
}

/**
 * @param {object} status
 * @returns {string[]}
 */
function getGoAnimeDirectories(status) {
  const paths = [status.dependencies.goAnime.path, status.dependencies.mpv.path].filter(Boolean);

  return [...new Set(paths.map((dependencyPath) => path.dirname(dependencyPath)))];
}

/**
 * @param {object} status
 * @returns {string}
 */
function buildWindowsPathPrefix(status) {
  const directories = getAniCliDirectories(status);

  if (directories.length === 0) {
    return '';
  }

  return `${directories.join(path.delimiter)}${path.delimiter}`;
}

/**
 * @param {object} status
 * @returns {string}
 */
function buildBashPathPrefix(status) {
  const directories = getAniCliDirectories(status).map(toBashPath).map(quoteForBash);

  if (directories.length === 0) {
    return '';
  }

  return `export PATH=${directories.join(':')}:$PATH; `;
}

/**
 * @param {object} status
 * @returns {string[]}
 */
function getAniCliDirectories(status) {
  const paths = [
    status.dependencies.aniCli.path,
    status.dependencies.mpv.path,
    status.dependencies.fzf.path,
    status.dependencies.ffmpeg.path,
    status.dependencies.openssl.path
  ].filter(Boolean);

  return [...new Set(paths.map((dependencyPath) => path.dirname(dependencyPath)))];
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteForBash(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteForCmd(value) {
  const escaped = String(value).replace(/%/g, '%%').replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeForSet(value) {
  return String(value).replace(/%/g, '%%').replace(/"/g, '');
}

/**
 * @param {string} windowsPath
 * @returns {string}
 */
function toBashPath(windowsPath) {
  const normalized = windowsPath.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);

  if (!driveMatch) {
    return normalized;
  }

  return `/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

/**
 * @returns {string | null}
 */
function findPowerShell() {
  const candidate =
    findCommandOnPath('powershell.exe') ??
    findCommandOnPath('powershell') ??
    path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );

  return fs.existsSync(candidate) || /powershell/i.test(candidate) ? candidate : null;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

module.exports = PlayerService;
