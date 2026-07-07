const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const AppError = require('../utils/AppError');

const SUPPORTED_QUALITIES = new Set(['auto', '360', '480', '720', '1080']);
const SUPPORTED_LANGUAGES = new Set(['sub', 'dub']);

class PlayerService {
  /**
   * @param {unknown} payload
   * @returns {{launched: boolean, command: string, terminal: string}}
   */
  play(payload) {
    const request = normalizePlayPayload(payload);
    const status = this.status();

    if (!status.dependencies.aniCli.available) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'ani-cli nao foi encontrado. Instale pelo Scoop e tente novamente.',
        { status: 424 }
      );
    }

    if (!status.dependencies.mpv.available) {
      throw new AppError(
        'PLAYER_NOT_FOUND',
        'MPV nao foi encontrado. Instale o MPV e tente novamente.',
        {
          status: 424
        }
      );
    }

    if (!status.dependencies.gitBash.available) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'Git Bash nao foi encontrado. Instale o Git pelo Scoop e reabra o app.',
        { status: 424 }
      );
    }

    const terminal = chooseTerminal(status);
    const command = buildAniCliCommand(request, status.dependencies.aniCli.path);
    launchTerminal({ terminal, gitBash: status.dependencies.gitBash.path, command, status });

    return {
      launched: true,
      command,
      terminal: terminal.name
    };
  }

  /**
   * @returns {object}
   */
  status() {
    const aniCli = findCommand('ani-cli');
    const mpv = findCommand('mpv');
    const fzf = findCommand('fzf');
    const ffmpeg = findCommand('ffmpeg');
    const gitBash = findGitBash();
    const windowsTerminal = findCommand('wt');

    return {
      ready: Boolean(
        aniCli.available && mpv.available && fzf.available && ffmpeg.available && gitBash.available
      ),
      dependencies: {
        aniCli,
        mpv,
        fzf,
        ffmpeg,
        gitBash,
        windowsTerminal
      },
      installCommands: [
        'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser',
        'Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression',
        'scoop install git',
        'scoop bucket add extras',
        'scoop install ani-cli fzf ffmpeg mpv'
      ]
    };
  }

  /**
   * @returns {{launched: boolean, terminal: string, scriptPath: string}}
   */
  installDependencies() {
    const status = this.status();
    const terminal = status.dependencies.windowsTerminal.available
      ? {
          name: 'Windows Terminal',
          type: 'windows-terminal',
          path: status.dependencies.windowsTerminal.path
        }
      : {
          name: 'PowerShell',
          type: 'powershell',
          path: findPowerShell()
        };
    const scriptPath = writeInstallScript();

    if (!terminal.path) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        'PowerShell nao foi encontrado para instalar as dependencias.',
        { status: 424 }
      );
    }

    if (terminal.type === 'windows-terminal') {
      spawn(
        terminal.path,
        [
          'new-tab',
          '--title',
          'KitsuneDesk setup',
          'powershell.exe',
          '-NoExit',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath
        ],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        }
      ).unref();
    } else {
      spawn(terminal.path, ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      }).unref();
    }

    return {
      launched: true,
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
 * @returns {{query: string, language: 'sub'|'dub', quality: string}}
 */
function normalizePlayPayload(payload) {
  const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
  const language = SUPPORTED_LANGUAGES.has(payload?.language) ? payload.language : 'sub';
  const quality = SUPPORTED_QUALITIES.has(String(payload?.quality))
    ? String(payload.quality)
    : 'auto';

  if (query.length < 2) {
    throw new AppError('ANIME_NOT_FOUND', 'Digite pelo menos dois caracteres para pesquisar.', {
      status: 400
    });
  }

  return { query, language, quality };
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
 * @param {string} value
 * @returns {string}
 */
function quoteForBash(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/**
 * @param {{terminal: object, gitBash: string, command: string, status: object}} options
 */
function launchTerminal({ terminal, gitBash, command, status }) {
  const scriptPath = writeAniCliLaunchScript(command, status);
  const bashScriptPath = toBashPath(scriptPath);
  const env = {
    ...process.env,
    PATH: buildWindowsPathPrefix(status) + (process.env.PATH ?? '')
  };

  if (terminal.type === 'windows-terminal') {
    spawn(
      terminal.path,
      ['new-tab', '--title', 'KitsuneDesk ani-cli', gitBash, '--login', bashScriptPath],
      {
        detached: true,
        env,
        stdio: 'ignore',
        windowsHide: false
      }
    ).unref();
    return;
  }

  spawn(gitBash, ['--login', bashScriptPath], {
    detached: true,
    env,
    stdio: 'ignore',
    windowsHide: false
  }).unref();
}

/**
 * O Windows Terminal interpreta ponto e virgula como separador de comandos.
 * Por isso, a sequencia Bash e gravada em um arquivo temporario e executada
 * como script, evitando que `read` seja tratado como um executavel do Windows.
 *
 * @param {string} command
 * @param {object} status
 * @returns {string}
 */
function writeAniCliLaunchScript(command, status) {
  const scriptPath = path.join(
    os.tmpdir(),
    `kitsunedesk-ani-cli-${process.pid}-${Date.now()}.sh`
  );
  const pathPrefix = buildBashPathPrefix(status);
  const script = `#!/usr/bin/env bash
set +e

${pathPrefix}${command}
exit_code=$?

printf '\\n'
if [ "$exit_code" -ne 0 ]; then
  printf 'O ani-cli foi encerrado com o codigo %s.\\n' "$exit_code"
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
function chooseTerminal(status) {
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
 * @param {string} command
 * @returns {{available: boolean, path: string | null}}
 */
function findCommand(command) {
  const result = spawnSync('where.exe', [command], {
    encoding: 'utf8',
    windowsHide: true
  });

  const firstMatchFromPath = result.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const firstMatch =
    firstMatchFromPath ?? findScoopShim(command) ?? findScoopAppExecutable(command);

  return {
    available: Boolean(firstMatch),
    path: firstMatch ?? null
  };
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
 * @returns {string}
 */
function buildWindowsPathPrefix(status) {
  const directories = getDependencyDirectories(status);

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
  const directories = getDependencyDirectories(status).map(toBashPath).map(quoteForBash);

  if (directories.length === 0) {
    return '';
  }

  return `export PATH=${directories.join(':')}:$PATH; `;
}

/**
 * @param {object} status
 * @returns {string[]}
 */
function getDependencyDirectories(status) {
  const paths = [
    status.dependencies.aniCli.path,
    status.dependencies.mpv.path,
    status.dependencies.fzf.path,
    status.dependencies.ffmpeg.path
  ].filter(Boolean);

  return [...new Set(paths.map((dependencyPath) => path.dirname(dependencyPath)))];
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
  return (
    findCommand('powershell.exe').path ??
    findCommand('powershell').path ??
    path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  );
}

/**
 * @returns {string}
 */
function writeInstallScript() {
  const scriptPath = path.join(os.tmpdir(), 'kitsunedesk-install-dependencies.ps1');
  const script = `\
$ErrorActionPreference = 'Continue'

Write-Host 'KitsuneDesk - instalando dependencias locais' -ForegroundColor Cyan
Write-Host ''

$scoopShims = Join-Path $env:USERPROFILE 'scoop\\shims'
if (Test-Path $scoopShims) {
  $env:PATH = "$scoopShims;$env:PATH"
}

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

if (-not (Get-Command scoop -ErrorAction SilentlyContinue)) {
  Write-Host 'Instalando Scoop...'
  Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
} else {
  Write-Host 'Scoop encontrado.'
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

scoop install ani-cli fzf ffmpeg mpv

Write-Host ''
Write-Host 'Instalacao concluida. Feche e abra o KitsuneDesk novamente, ou clique em Atualizar status.' -ForegroundColor Green
`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
}

module.exports = PlayerService;
