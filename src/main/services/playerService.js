const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const dns = require('dns').promises;
const https = require('https');
const AppError = require('../utils/AppError');
const GoAnimeGuiService = require('./goAnimeGuiService');

const SUPPORTED_PROVIDERS = new Set(['auto', 'goanime', 'anime-cli-br', 'ani-cli']);
const SUPPORTED_INSTALL_TARGETS = new Set([
  'goanime',
  'goanime-gui',
  'anime-cli-br',
  'ani-cli',
  'fast-anime-vsr'
]);
const SUPPORTED_QUALITIES = new Set(['auto', '360', '480', '720', '1080']);
const SUPPORTED_LANGUAGES = new Set(['sub', 'dub']);

class PlayerService {
  constructor() {
    this.goAnimeGui = new GoAnimeGuiService();
  }

  /**
   * Pesquisa animes usando o motor GoAnime sem abrir terminal.
   *
   * @param {unknown} payload
   * @returns {Promise<object[]>}
   */
  searchAnimes(payload) {
    return this.goAnimeGui.search(payload);
  }

  /**
   * Lista os episodios do resultado selecionado dentro da interface grafica.
   *
   * @param {unknown} payload
   * @returns {Promise<object[]>}
   */
  listEpisodes(payload) {
    return this.goAnimeGui.episodes(payload);
  }

  /**
   * Resolve o stream pelo GoAnime e abre somente o MPV, sem terminal.
   *
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  playEpisode(payload) {
    const status = this.status();

    if (!status.providers.goAnime.ready) {
      throw new AppError(
        'GOANIME_GUI_NOT_READY',
        'A interface grafica do GoAnime ainda nao esta pronta. Clique em Ativar GoAnime GUI.',
        { status: 424 }
      );
    }

    return this.goAnimeGui.playEpisode(payload, status.dependencies.mpv.path);
  }

  /**
   * Mantem os provedores de terminal como opcoes manuais e experimentais.
   * Eles nunca sao usados automaticamente pela interface grafica.
   *
   * @param {unknown} payload
   * @returns {Promise<{launched: boolean, provider: string, providerName: string, terminal: string}>}
   */
  async play(payload) {
    const request = normalizePlayPayload(payload);
    const status = this.status();
    const provider = resolveProvider(request.provider, status);

    if (provider === 'goanime') {
      const terminal = launchGoAnime({ request, status });
      return {
        launched: true,
        provider,
        providerName: 'GoAnime classico',
        terminal
      };
    }

    if (provider === 'anime-cli-br') {
      await assertAnimeFireReachable();
      const terminal = launchAnimeCliBr({ request, status });
      return {
        launched: true,
        provider,
        providerName: 'anime-cli-br',
        terminal
      };
    }

    const terminal = launchAniCli({ request, status });
    return {
      launched: true,
      provider,
      providerName: 'ani-cli experimental',
      terminal
    };
  }

  /**
   * Retorna o estado dos provedores, ferramentas e dependencias locais.
   *
   * @returns {object}
   */
  status() {
    const goAnime = findGoAnime();
    const goAnimeBridge = this.goAnimeGui.status();
    const mpv = findMpv(goAnime.path);
    const animeCliBr = findAnimeCliBr();
    const vlc = findVlc();
    const aniCli = findCommand('ani-cli');
    const fzf = findCommand('fzf');
    const ffmpeg = findCommand('ffmpeg');
    const openssl = findCommand('openssl');
    const git = findCommand('git');
    const python = findPython();
    const nvidia = findNvidia();
    const fastAnimeVsr = findFastAnimeVsr({ python, ffmpeg, nvidia });
    const gitBash = findGitBash();
    const windowsTerminal = findCommand('wt');
    const cmd = findCommand('cmd.exe');

    const goAnimeClassicReady = Boolean(goAnime.available && mpv.available);
    const goAnimeGuiReady = Boolean(goAnimeBridge.available && mpv.available);
    const animeCliBrReady = Boolean(animeCliBr.available && vlc.available);
    const aniCliReady = Boolean(
      aniCli.available &&
      mpv.available &&
      fzf.available &&
      ffmpeg.available &&
      openssl.available &&
      gitBash.available
    );

    return {
      ready: goAnimeGuiReady,
      recommendedProvider: goAnimeGuiReady ? 'goanime-gui' : null,
      providers: {
        goAnime: {
          id: 'goanime-gui',
          name: 'GoAnime GUI',
          ready: goAnimeGuiReady,
          bridge: goAnimeBridge,
          executable: goAnime,
          classicReady: goAnimeClassicReady,
          mpv,
          stability: 'recommended',
          description:
            'Pesquisa, resultados, episodios e qualidade dentro do KitsuneDesk; apenas o MPV abre para reproduzir.'
        },
        animeCliBr: {
          id: 'anime-cli-br',
          name: 'anime-cli-br',
          ready: animeCliBrReady,
          executable: animeCliBr,
          vlc,
          stability: 'legacy-source',
          knownIssue: {
            code: 'ANIMEFIRE_DNS',
            message:
              'A fonte animefire.net pode ficar indisponivel por DNS. O KitsuneDesk verifica a fonte antes de abrir e evita o traceback.'
          },
          description: 'Alternativa brasileira legada baseada em AnimeFire e VLC.'
        },
        aniCli: {
          id: 'ani-cli',
          name: 'ani-cli',
          ready: aniCliReady,
          executable: aniCli,
          stability: 'upstream-issue',
          knownIssue: {
            code: 'NO_VALID_SOURCES',
            message:
              'A versao 4.14.1 pode encontrar o episodio sem receber um link valido dos provedores externos.'
          },
          description: 'Mantido como opcao experimental no Git Bash; nunca e usado automaticamente.'
        }
      },
      tools: {
        fastAnimeVsr: {
          id: 'fast-anime-vsr',
          name: 'FAST Anime VSR',
          installed: fastAnimeVsr.installed,
          ready: fastAnimeVsr.ready,
          path: fastAnimeVsr.path,
          runtime: fastAnimeVsr.runtime,
          description:
            'Ferramenta opcional de super-resolucao para arquivos locais; nao e provedor de streaming.'
        }
      },
      dependencies: {
        goAnime,
        goAnimeBridge,
        animeCliBr,
        aniCli,
        mpv,
        vlc,
        fzf,
        ffmpeg,
        openssl,
        git,
        python,
        nvidia,
        fastAnimeVsr,
        gitBash,
        windowsTerminal,
        cmd
      },
      installCommands: {
        goAnimeGui: [
          'Instala ou confirma GoAnime + MPV',
          'Instala Go 1.26 ou superior',
          'Compila o bridge grafico oficial baseado no codigo do GoAnime v1.8.5'
        ],
        animeCliBr: [
          'Ambiente Python dedicado do KitsuneDesk',
          'VLC Media Player',
          'Verificacao da disponibilidade do AnimeFire antes de abrir'
        ],
        aniCli: [
          'scoop install git',
          'scoop bucket add extras',
          'scoop install ani-cli fzf ffmpeg mpv openssl'
        ],
        fastAnimeVsr: [
          'Python 3.10 localizado pelo PATH, registro ou instalador oficial',
          'NVIDIA GPU, CUDA, cuDNN e PyTorch conforme a placa de video'
        ]
      }
    };
  }

  /**
   * Abre o instalador do provedor ou ferramenta escolhida.
   *
   * @param {unknown} payload
   * @returns {{launched: boolean, provider: string, terminal: string, scriptPath: string}}
   */
  installDependencies(payload) {
    const provider = normalizeInstallProvider(payload);
    const status = this.status();
    const terminal = choosePowerShellTerminal(status);
    const scriptPath = createInstallScript(provider);

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

  pause() {
    return this.notImplemented('O MPV continua com os controles nativos de reproducao.');
  }

  resume() {
    return this.notImplemented('O MPV continua com os controles nativos de reproducao.');
  }

  next() {
    return this.notImplemented('Escolha o proximo episodio diretamente na lista do KitsuneDesk.');
  }

  previous() {
    return this.notImplemented('Escolha o episodio anterior diretamente na lista do KitsuneDesk.');
  }

  stop() {
    return this.goAnimeGui.stop();
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
 * @returns {{query: string, provider: 'auto'|'goanime'|'anime-cli-br'|'ani-cli', language: 'sub'|'dub', quality: string}}
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
 * @returns {'goanime'|'goanime-gui'|'anime-cli-br'|'ani-cli'|'fast-anime-vsr'}
 */
function normalizeInstallProvider(payload) {
  const provider = String(payload?.provider ?? 'goanime');
  return SUPPORTED_INSTALL_TARGETS.has(provider) ? provider : 'goanime';
}

/**
 * @param {string} provider
 * @returns {string}
 */
function createInstallScript(provider) {
  switch (provider) {
    case 'goanime-gui':
      return writeGoAnimeGuiInstallScript();
    case 'anime-cli-br':
      return writeAnimeCliBrInstallScript();
    case 'ani-cli':
      return writeAniCliInstallScript();
    case 'fast-anime-vsr':
      return writeFastAnimeVsrInstallScript();
    case 'goanime':
    default:
      return writeGoAnimeInstallScript();
  }
}

/**
 * @param {'auto'|'goanime'|'anime-cli-br'|'ani-cli'} requestedProvider
 * @param {object} status
 * @returns {'goanime'|'anime-cli-br'|'ani-cli'}
 */
function resolveProvider(requestedProvider, status) {
  if (requestedProvider === 'goanime') {
    assertGoAnimeReady(status);
    return 'goanime';
  }

  if (requestedProvider === 'anime-cli-br') {
    assertAnimeCliBrReady(status);
    return 'anime-cli-br';
  }

  if (requestedProvider === 'ani-cli') {
    assertAniCliReady(status);
    return 'ani-cli';
  }

  if (status.providers.goAnime.classicReady) return 'goanime';
  if (status.providers.animeCliBr.ready) return 'anime-cli-br';
  if (status.providers.aniCli.ready) return 'ani-cli';

  throw new AppError(
    'PROVIDER_UNAVAILABLE',
    'Nenhum provedor esta pronto. Instale o GoAnime pelo botao Instalar GoAnime.',
    { status: 424 }
  );
}

/** @param {object} status */
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

/** @param {object} status */
function assertAnimeCliBrReady(status) {
  const missing = [];
  if (!status.dependencies.animeCliBr.available) missing.push('anime-cli-br');
  if (!status.dependencies.vlc.available) missing.push('VLC');

  if (missing.length > 0) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `O anime-cli-br nao esta pronto. Faltando: ${missing.join(', ')}.`,
      { status: 424 }
    );
  }
}

/** @param {object} status */
function assertAniCliReady(status) {
  const missing = [];

  if (!status.dependencies.aniCli.available) missing.push('ani-cli');
  if (!status.dependencies.gitBash.available) missing.push('Git Bash');
  if (!status.dependencies.mpv.available) missing.push('MPV');
  if (!status.dependencies.fzf.available) missing.push('fzf');
  if (!status.dependencies.ffmpeg.available) missing.push('ffmpeg');
  if (!status.dependencies.openssl.available) missing.push('OpenSSL');

  if (missing.length > 0) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `O provedor ani-cli nao esta pronto. Faltando: ${missing.join(', ')}.`,
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

  if (request.language === 'dub') {
    args.push('--source', 'ptbr');
  }

  args.push(request.query);
  return args;
}

/** @param {string} quality @returns {string} */
function normalizeGoAnimeQuality(quality) {
  return quality === 'auto' ? 'best' : `${quality}p`;
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
 * Verifica a fonte do anime-cli-br antes de abrir o terminal. Isso evita que
 * falhas de DNS gerem um traceback Python enorme para o usuario.
 *
 * @returns {Promise<void>}
 */
async function assertAnimeFireReachable() {
  try {
    await Promise.race([
      dns.lookup('animefire.net'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 5000))
    ]);
    await probeHttpsHost('https://animefire.net/', 7000);
  } catch (error) {
    throw new AppError(
      'ANIMEFIRE_UNAVAILABLE',
      'A fonte animefire.net nao esta acessivel neste momento. O anime-cli-br nao foi aberto para evitar o traceback. Use o GoAnime GUI e tente novamente mais tarde.',
      { status: 502, technicalMessage: error?.message ?? String(error) }
    );
  }
}

/**
 * @param {string} target
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function probeHttpsHost(target, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'KitsuneDesk/0.4.0', Range: 'bytes=0-0' }
      },
      (response) => {
        response.resume();
        resolve();
      }
    );

    request.on('timeout', () => request.destroy(new Error('HTTPS timeout')));
    request.on('error', reject);
    request.end();
  });
}

/**
 * @param {{request: object, status: object}} options
 * @returns {string}
 */
function launchAnimeCliBr({ request, status }) {
  assertAnimeCliBrReady(status);

  const terminal = chooseInteractiveWindowsTerminal(status);
  const scriptPath = writeAnimeCliBrLaunchScript({ request, status });
  launchCommandScript({ terminal, scriptPath, title: 'KitsuneDesk anime-cli-br' });
  return terminal.name;
}

/**
 * @param {{request: object, status: object}} options
 * @returns {string}
 */
function writeAnimeCliBrLaunchScript({ request, status }) {
  const scriptPath = path.join(
    os.tmpdir(),
    `kitsunedesk-anime-cli-br-${process.pid}-${Date.now()}.cmd`
  );
  const directories = getAnimeCliBrDirectories(status);
  const pathPrefix = directories.length > 0 ? `${directories.join(';')};` : '';
  const executable = quoteForCmd(status.dependencies.animeCliBr.path);
  const safeQuery = escapeForEcho(request.query);
  const script = `@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\nset "PATH=${escapeForSet(pathPrefix)}%PATH%"\r\ntitle KitsuneDesk anime-cli-br\r\necho KitsuneDesk - anime-cli-br\r\necho.\r\necho Pesquisa solicitada: ${safeQuery}\r\necho O anime-cli-br nao recebe a pesquisa por argumento. Digite o nome novamente quando solicitado.\r\necho O idioma e a qualidade serao escolhidos dentro do proprio terminal.\r\necho.\r\n${executable}\r\nset "exit_code=%ERRORLEVEL%"\r\necho.\r\nif not "%exit_code%"=="0" echo O anime-cli-br foi encerrado com o codigo %exit_code%.\r\necho Pressione qualquer tecla para fechar esta janela.\r\npause >nul\r\nexit /b %exit_code%\r\n`;

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
  const args = ['-q', normalizeAniCliQuality(request.quality)];

  if (request.language === 'dub') {
    args.push('--dub');
  }

  args.push(request.query);
  return `${executable} ${args.map(quoteForBash).join(' ')}`;
}

/** @param {string} quality @returns {string} */
function normalizeAniCliQuality(quality) {
  return quality === 'auto' ? 'best' : `${quality}p`;
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

log_file="$(mktemp)"
printf 'KitsuneDesk - ani-cli experimental\\n'
printf 'Atualizando o script antes da pesquisa...\\n\\n'
${pathPrefix}ani-cli -U >/dev/null 2>&1 || true

set -o pipefail
${pathPrefix}${command} 2>&1 | tee "$log_file"
exit_code=\${PIPESTATUS[0]}
set +o pipefail

printf '\\n'
if grep -qi 'Episode is released, but no valid sources' "$log_file"; then
  printf 'O ani-cli encontrou o episodio, mas a fonte externa nao entregou um link valido.\\n'
  printf 'Este e um problema upstream conhecido da versao 4.14.1.\\n'
  printf 'Use o GoAnime no KitsuneDesk enquanto a origem do ani-cli estiver instavel.\\n'
fi

if [ "$exit_code" -ne 0 ]; then
  printf 'O ani-cli foi encerrado com o codigo %s.\\n' "$exit_code"
fi

rm -f "$log_file"
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

/** @param {{terminal: object, scriptPath: string}} options */
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
 * Copia um script PowerShell versionado para a pasta temporaria.
 *
 * @param {string} fileName
 * @returns {string}
 */
function copyPowerShellInstaller(fileName) {
  const sourcePath = path.join(__dirname, '..', '..', '..', 'scripts', 'windows', fileName);

  if (!fs.existsSync(sourcePath)) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `O script de instalacao ${fileName} nao foi encontrado.`,
      { status: 500 }
    );
  }

  const targetPath = path.join(os.tmpdir(), `kitsunedesk-${process.pid}-${Date.now()}-${fileName}`);

  fs.writeFileSync(targetPath, fs.readFileSync(sourcePath, 'utf8'), 'utf8');
  return targetPath;
}

/** @returns {string} */
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

/** @returns {string} */
function writeGoAnimeGuiInstallScript() {
  const installerSource = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'windows',
    'install-goanime-gui.ps1'
  );
  const bridgeSource = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'resources',
    'goanime-bridge',
    'main.go'
  );

  if (!fs.existsSync(installerSource) || !fs.existsSync(bridgeSource)) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'Os arquivos necessarios para ativar o GoAnime GUI nao foram encontrados.',
      { status: 500 }
    );
  }

  const bridgeTarget = path.join(
    os.tmpdir(),
    `kitsunedesk-${process.pid}-${Date.now()}-goanime-bridge-main.go`
  );
  const scriptTarget = path.join(
    os.tmpdir(),
    `kitsunedesk-${process.pid}-${Date.now()}-install-goanime-gui.ps1`
  );

  fs.copyFileSync(bridgeSource, bridgeTarget);
  const escapedBridgePath = bridgeTarget.replace(/'/g, "''");
  const script = fs
    .readFileSync(installerSource, 'utf8')
    .replace('__BRIDGE_SOURCE_PATH__', escapedBridgePath);
  fs.writeFileSync(scriptTarget, script, 'utf8');
  return scriptTarget;
}

/** @returns {string} */
function writeAnimeCliBrInstallScript() {
  return copyPowerShellInstaller('install-anime-cli-br.ps1');
}

/** @returns {string} */
function writeAniCliInstallScript() {
  return copyPowerShellInstaller('install-ani-cli.ps1');
}

/** @returns {string} */
function writeFastAnimeVsrInstallScript() {
  return copyPowerShellInstaller('prepare-fast-anime-vsr.ps1');
}

/** @returns {{available: boolean, path: string | null}} */
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

  return { available: Boolean(match), path: match ?? null };
}

/** @returns {{available: boolean, path: string | null}} */
function findAnimeCliBr() {
  const localToolsRoot = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
    'KitsuneDesk',
    'tools',
    'anime-cli-br',
    '.venv',
    'Scripts'
  );
  const candidates = [
    path.join(localToolsRoot, 'anime-cli-br.exe'),
    path.join(localToolsRoot, 'anime-cli-br'),
    findCommandOnPath('anime-cli-br'),
    findPythonScriptsExecutable('anime-cli-br.exe'),
    findPythonScriptsExecutable('anime-cli-br')
  ].filter(Boolean);
  const match = candidates.find(
    (candidate) => fs.existsSync(candidate) && !/Python31[3-9]/i.test(candidate)
  );

  return { available: Boolean(match), path: match ?? null };
}

/** @returns {{available: boolean, path: string | null}} */
function findVlc() {
  const candidates = [
    findCommandOnPath('vlc'),
    findVlcFromRegistry(),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'VideoLAN', 'VLC', 'vlc.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'VideoLAN',
      'VLC',
      'vlc.exe'
    ),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'VideoLAN', 'VLC', 'vlc.exe'),
    findScoopAppExecutable('vlc')
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  return { available: Boolean(match), path: match ?? null };
}

/** @returns {string | null} */
function findVlcFromRegistry() {
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\vlc.exe',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\vlc.exe',
    'HKLM\\SOFTWARE\\VideoLAN\\VLC',
    'HKLM\\SOFTWARE\\WOW6432Node\\VideoLAN\\VLC',
    'HKCU\\SOFTWARE\\VideoLAN\\VLC'
  ];

  for (const key of keys) {
    const result = spawnSync('reg.exe', ['query', key, '/s'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const executableMatch = output.match(/([A-Za-z]:\\[^\r\n]*?vlc\.exe)/i);
    if (executableMatch && fs.existsSync(executableMatch[1].trim())) {
      return executableMatch[1].trim();
    }

    const directoryMatch = output.match(/InstallDir\s+REG_(?:SZ|EXPAND_SZ)\s+([^\r\n]+)/i);
    if (directoryMatch) {
      const candidate = path.join(directoryMatch[1].trim(), 'vlc.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * @param {string | null} goAnimePath
 * @returns {{available: boolean, path: string | null, bundledWithGoAnime: boolean}}
 */
function findMpv(goAnimePath) {
  const goAnimeDirectory = goAnimePath ? path.dirname(goAnimePath) : null;
  const bundledCandidate = goAnimeDirectory ? path.join(goAnimeDirectory, 'bin', 'mpv.exe') : null;
  const candidates = [
    bundledCandidate,
    findCommandOnPath('mpv'),
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

/** @returns {{available: boolean, path: string | null, version: string | null, argsPrefix: string[]}} */
function findPython() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Python310', 'python.exe'),
    findPythonFromRegistry('3.10')
  ].filter(Boolean);

  const launcher = findCommandOnPath('py.exe');
  if (launcher && fs.existsSync(launcher)) {
    const launcherResult = spawnSync(
      launcher,
      ['-3.10', '-c', 'import sys; print(sys.executable)'],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000
      }
    );
    const launcherPython = launcherResult.stdout?.trim();
    if (launcherResult.status === 0 && launcherPython) candidates.unshift(launcherPython);
  }

  for (const candidate of [...new Set(candidates)]) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const result = spawnSync(
      candidate,
      ['-c', "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000
      }
    );
    const version = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (result.status === 0 && version === '3.10') {
      return { available: true, path: candidate, version: `Python ${version}`, argsPrefix: [] };
    }
  }

  return { available: false, path: null, version: null, argsPrefix: [] };
}

/** @param {string} version @returns {string | null} */
function findPythonFromRegistry(version) {
  const keys = [
    `HKCU\\SOFTWARE\\Python\\PythonCore\\${version}\\InstallPath`,
    `HKLM\\SOFTWARE\\Python\\PythonCore\\${version}\\InstallPath`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Python\\PythonCore\\${version}\\InstallPath`
  ];

  for (const key of keys) {
    const result = spawnSync('reg.exe', ['query', key, '/ve'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const match = output.match(/REG_(?:SZ|EXPAND_SZ)\s+([^\r\n]+)/i);
    if (!match) continue;
    const candidate = path.join(match[1].trim(), 'python.exe');
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/** @returns {{available: boolean, path: string | null}} */
function findNvidia() {
  const candidates = [
    findCommandOnPath('nvidia-smi.exe'),
    path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'DriverStore', 'FileRepository')
  ].filter(Boolean);
  const directMatch = candidates[0] && fs.existsSync(candidates[0]) ? candidates[0] : null;
  return { available: Boolean(directMatch), path: directMatch };
}

/**
 * @param {{python: object, ffmpeg: object, nvidia: object}} dependencies
 * @returns {object}
 */
function findFastAnimeVsr(dependencies) {
  const localRoot = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
    'KitsuneDesk',
    'tools',
    'FAST_Anime_VSR'
  );
  const projectRoot = path.join(process.cwd(), 'resources', 'fast-anime-vsr');
  const candidates = [localRoot, projectRoot];
  const root =
    candidates.find((candidate) => fs.existsSync(path.join(candidate, 'main.py'))) ?? null;
  const venvPython = root ? path.join(root, '.venv', 'Scripts', 'python.exe') : null;
  const runtime = probeFastAnimeVsrRuntime(venvPython);

  return {
    installed: Boolean(root),
    ready: Boolean(
      root && runtime.configured && dependencies.ffmpeg.available && dependencies.nvidia.available
    ),
    path: root,
    venvPython: venvPython && fs.existsSync(venvPython) ? venvPython : null,
    runtime,
    requirements: {
      nvidia: dependencies.nvidia.available,
      ffmpeg: dependencies.ffmpeg.available,
      python: dependencies.python.available
    }
  };
}

/** @param {string | null} pythonPath @returns {{configured: boolean, cuda: boolean, message: string}} */
function probeFastAnimeVsrRuntime(pythonPath) {
  if (!pythonPath || !fs.existsSync(pythonPath)) {
    return { configured: false, cuda: false, message: 'Ambiente Python ainda nao preparado.' };
  }

  const code =
    "import torch, cv2, numpy, moviepy; print('CUDA=' + str(bool(torch.cuda.is_available())))";
  const result = spawnSync(pythonPath, ['-c', code], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const configured = result.status === 0;
  const cuda = /CUDA=True/i.test(output);

  return {
    configured,
    cuda,
    message: configured
      ? cuda
        ? 'Runtime configurado com CUDA.'
        : 'Bibliotecas instaladas, mas CUDA nao esta ativa.'
      : 'Faltam PyTorch/CUDA ou outras dependencias manuais.'
  };
}

/** @param {string} command @returns {{available: boolean, path: string | null}} */
function findCommand(command) {
  const firstMatch =
    findCommandOnPath(command) ?? findScoopShim(command) ?? findScoopAppExecutable(command);
  return { available: Boolean(firstMatch), path: firstMatch ?? null };
}

/** @param {string} command @returns {string | null} */
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

/** @param {string} command @returns {string | null} */
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

/** @param {string} command @returns {string | null} */
function findScoopAppExecutable(command) {
  const appDir = path.join(os.homedir(), 'scoop', 'apps', command, 'current');
  const candidates = [
    path.join(appDir, `${command}.exe`),
    path.join(appDir, `${command}.cmd`),
    path.join(appDir, command)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** @param {string} fileName @returns {string | null} */
function findPythonScriptsExecutable(fileName) {
  const roots = [
    path.join(process.env.APPDATA ?? '', 'Python'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python')
  ].filter(Boolean);

  for (const root of roots) {
    const match = findFile(root, fileName, 4);
    if (match) return match;
  }

  return null;
}

/** @param {string} root @param {string} fileName @param {number} depth @returns {string | null} */
function findFile(root, fileName, depth) {
  if (!root || depth < 0 || !fs.existsSync(root)) return null;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return fullPath;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = findFile(path.join(root, entry.name), fileName, depth - 1);
    if (match) return match;
  }

  return null;
}

/** @returns {{available: boolean, path: string | null}} */
function findGitBash() {
  const candidates = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe'),
    path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'usr', 'bin', 'bash.exe')
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (match) return { available: true, path: match };

  const bashFromPath = findCommand('bash');
  const isGitBash = Boolean(
    bashFromPath.path &&
    /\\git\\|\/git\//i.test(bashFromPath.path) &&
    !/\\windowsapps\\/i.test(bashFromPath.path)
  );

  return { available: isGitBash, path: isGitBash ? bashFromPath.path : null };
}

/** @param {object} status @returns {string[]} */
function getGoAnimeDirectories(status) {
  const paths = [status.dependencies.goAnime.path, status.dependencies.mpv.path].filter(Boolean);
  return [...new Set(paths.map((dependencyPath) => path.dirname(dependencyPath)))];
}

/** @param {object} status @returns {string[]} */
function getAnimeCliBrDirectories(status) {
  const paths = [status.dependencies.animeCliBr.path, status.dependencies.vlc.path].filter(Boolean);
  return [...new Set(paths.map((dependencyPath) => path.dirname(dependencyPath)))];
}

/** @param {object} status @returns {string} */
function buildWindowsPathPrefix(status) {
  const directories = getAniCliDirectories(status);
  return directories.length === 0 ? '' : `${directories.join(path.delimiter)}${path.delimiter}`;
}

/** @param {object} status @returns {string} */
function buildBashPathPrefix(status) {
  const directories = getAniCliDirectories(status).map(toBashPath).map(quoteForBash);
  return directories.length === 0 ? '' : `export PATH=${directories.join(':')}:$PATH; `;
}

/** @param {object} status @returns {string[]} */
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

/** @param {string} value @returns {string} */
function quoteForBash(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

/** @param {string} value @returns {string} */
function quoteForCmd(value) {
  const escaped = String(value).replace(/%/g, '%%').replace(/"/g, '""');
  return `"${escaped}"`;
}

/** @param {string} value @returns {string} */
function escapeForSet(value) {
  return String(value).replace(/%/g, '%%').replace(/"/g, '');
}

/** @param {string} value @returns {string} */
function escapeForEcho(value) {
  return String(value)
    .replace(/%/g, '%%')
    .replace(/\^/g, '^^')
    .replace(/&/g, '^&')
    .replace(/\|/g, '^|')
    .replace(/</g, '^<')
    .replace(/>/g, '^>');
}

/** @param {string} windowsPath @returns {string} */
function toBashPath(windowsPath) {
  const normalized = windowsPath.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  return driveMatch ? `/${driveMatch[1].toLowerCase()}/${driveMatch[2]}` : normalized;
}

/** @returns {string | null} */
function findPowerShell() {
  const candidates = [
    findCommandOnPath('powershell.exe'),
    findCommandOnPath('powershell'),
    path.join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    )
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

/** @param {string} left @param {string} right @returns {boolean} */
function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

module.exports = PlayerService;
