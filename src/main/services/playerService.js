const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const AppError = require('../utils/AppError');
const GoAnimeGuiService = require('./goAnimeGuiService');
const InstallationService = require('./installationService');
const embeddedCompatibilityModel = require('./player/embeddedCompatibility');
const embeddedPlayer = require('./player/embeddedPlayer');
const EpisodeResolver = require('./player/episodeResolver');
const externalMpv = require('./player/externalMpv');
const networkDiagnostics = require('./player/networkDiagnostics');
const playbackQueue = require('./player/playbackQueue');
const playbackStateModel = require('./player/playbackState');
const providerAdapters = require('./player/providerAdapters');

const SUPPORTED_INSTALL_TARGETS = new Set([
  'goanime',
  'goanime-gui',
  'anime-cli-br',
  'ani-cli',
  'fast-anime-vsr'
]);
const STATUS_CACHE_TTL_MS = 60 * 1000;
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
const E2E_FIXTURES =
  process.env.NODE_ENV === 'test' && process.env.KITSUNEDESK_E2E_FIXTURES === '1';

class PlayerService extends EventEmitter {
  constructor({ settingsService = null, libraryService = null, cacheService = null } = {}) {
    super();
    this.goAnimeGui = new GoAnimeGuiService();
    this.installationService = new InstallationService();
    this.settingsService = settingsService;
    this.libraryService = libraryService;
    this.cacheService = cacheService;
    this.episodeResolver = new EpisodeResolver({
      engine: this.goAnimeGui,
      cacheService
    });
    this.statusCache = null;
    this.healthCache = null;
    this.currentPlayback = null;
    this.lastProgressSaveAt = 0;
    this.autoNextInProgress = false;

    this.goAnimeGui.on('state', (state) => this.handlePlayerState(state));
    this.goAnimeGui.on('ended', (state) => this.handlePlaybackEnded(state));
    this.goAnimeGui.on('progress', (progress) => this.emit('source-progress', progress));
  }

  /**
   * Pesquisa animes usando o motor GoAnime sem abrir terminal.
   *
   * @param {unknown} payload
   * @returns {Promise<object[]>}
   */
  async searchAnimes(payload) {
    this.episodeResolver.engine = this.goAnimeGui;
    return this.episodeResolver.search(payload);
  }

  /**
   * Lista os episodios do resultado selecionado dentro da interface grafica.
   *
   * @param {unknown} payload
   * @returns {Promise<object[]>}
   */
  async listEpisodes(payload) {
    this.episodeResolver.engine = this.goAnimeGui;
    return this.episodeResolver.episodes(payload);
  }

  /**
   * Resolve o stream pelo GoAnime e abre somente o MPV, sem terminal.
   *
   * @param {unknown} payload
   * @returns {Promise<object>}
   */
  async playEpisode(payload) {
    const status = this.status();

    if (!status.providers.goAnime.ready) {
      throw new AppError(
        'GOANIME_GUI_NOT_READY',
        'A interface gráfica do GoAnime ainda não está pronta. Use Instalar ou reparar.',
        { status: 424 }
      );
    }

    const settings = await this.getUserSettings();
    const episodes = Array.isArray(payload?.episodes) ? payload.episodes : [];
    const episodeIndex = Number.isInteger(payload?.episodeIndex)
      ? payload.episodeIndex
      : episodes.findIndex((item) => String(item?.number) === String(payload?.episode?.number));
    const queue = playbackQueue.buildPlaybackQueue(
      episodes,
      Math.max(0, episodeIndex),
      payload?.queue
    );
    const queueIndex = playbackQueue.findEpisodeIndexInList(queue, payload.episode);
    const startPosition = settings.rememberPosition
      ? Math.max(0, Number(payload?.resumePosition ?? payload?.startPosition ?? 0))
      : 0;

    let embeddedCompatibility = null;
    if (settings.playerMode === 'embedded') {
      this.episodeResolver.engine = this.goAnimeGui;
      const stream = await this.episodeResolver.resolveStream(payload);
      embeddedCompatibility = embeddedCompatibilityModel.analyzeEmbeddedCompatibility(stream);
      if (embeddedCompatibility.compatible) {
        const playback = embeddedPlayer.createEmbeddedPlayback(payload, {
          settings,
          stream,
          queue,
          queueIndex,
          startPosition
        });
        this.currentPlayback = playback.context;
        this.lastProgressSaveAt = 0;
        this.emit('playback-started', { ...playback.result, context: this.currentPlayback });
        return { ...playback.result, context: this.currentPlayback };
      }
    }

    const normalizedResult = await this.launchExternalEpisode(payload, {
      settings,
      status,
      startPosition,
      queue,
      queueIndex,
      embeddedFallback: settings.playerMode === 'embedded',
      embeddedFallbackReason: embeddedCompatibility?.reason || null
    });
    return normalizedResult;
  }

  async launchExternalEpisode(payload, options) {
    const playback = await externalMpv.launchExternalMpv(this.goAnimeGui, payload, options);
    this.currentPlayback = playback.context;
    this.lastProgressSaveAt = 0;
    await this.persistPlayback(this.goAnimeGui.getPlayerState());
    this.emit('playback-started', { ...playback.result, context: this.currentPlayback });
    return { ...playback.result, context: this.currentPlayback };
  }

  /**
   * Mantem os provedores de terminal como opcoes manuais e experimentais.
   * Eles nunca sao usados automaticamente pela interface grafica.
   *
   * @param {unknown} payload
   * @returns {Promise<{launched: boolean, provider: string, providerName: string, terminal: string}>}
   */
  async play(payload) {
    return providerAdapters.launchLegacyProvider(payload, {
      status: () => this.status(),
      assertAnimeFireReachable: networkDiagnostics.assertAnimeFireReachable,
      launchGoAnime,
      launchAnimeCliBr,
      launchAniCli
    });
  }

  /**
   * Abre uma ferramenta local que nao funciona como provedor de streaming.
   *
   * @param {unknown} payload
   * @returns {{launched: boolean, tool: string, toolName: string, terminal: string, scriptPath: string}}
   */
  openTool(payload) {
    const tool = String(payload?.tool ?? '');
    if (tool !== 'fast-anime-vsr') {
      throw new AppError('TOOL_UNAVAILABLE', 'A ferramenta solicitada nao e suportada.', {
        status: 400
      });
    }

    const status = this.status();
    const fast = status.tools.fastAnimeVsr;

    if (!fast.installed || !fast.path) {
      throw new AppError(
        'TOOL_UNAVAILABLE',
        'FAST Anime VSR ainda nao foi preparado. Use o botao Preparar / reparar ambiente.',
        { status: 424 }
      );
    }

    if (!fast.ready) {
      throw new AppError(
        'TOOL_UNAVAILABLE',
        `FAST Anime VSR ainda nao esta pronto. ${fast.runtime.message}`,
        { status: 424 }
      );
    }

    const terminal = choosePowerShellTerminal(status);
    if (!terminal.path) {
      throw new AppError('TOOL_UNAVAILABLE', 'PowerShell nao foi encontrado.', { status: 424 });
    }

    const scriptPath = writeFastAnimeVsrOpenScript(fast);
    launchPowerShellScript({ terminal, scriptPath });

    return {
      launched: true,
      tool,
      toolName: 'FAST Anime VSR',
      terminal: terminal.name,
      scriptPath
    };
  }

  /**
   * Retorna o estado dos provedores, ferramentas e dependencias locais.
   *
   * @returns {object}
   */
  status(force = false) {
    if (E2E_FIXTURES) return createE2eProviderStatus();
    if (!force && this.statusCache && this.statusCache.expiresAt > Date.now()) {
      return this.statusCache.value;
    }
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

    const value = {
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
            'Pesquisa, episódios e reprodução em uma janela externa do MPV, com controles integrados ao KitsuneDesk.'
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
          accelerated: fastAnimeVsr.accelerated,
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
          'Instalacao automatica e silenciosa de GoAnime + MPV',
          'Runtime Go portatil somente quando o bridge precisar ser compilado',
          'Progresso e verificacao exibidos dentro do KitsuneDesk'
        ],
        animeCliBr: [
          'Python 3.12 isolado e VLC instalados automaticamente',
          'Codigo e dependencias preparados sem usar o Python global',
          'Aviso claro quando a fonte AnimeFire estiver indisponivel'
        ],
        aniCli: [
          'Scoop, Git Bash, fzf, FFmpeg, MPV e OpenSSL',
          'Instalacao oculta com progresso dentro do aplicativo',
          'Aviso preservado sobre a instabilidade das fontes externas'
        ],
        fastAnimeVsr: [
          'Python 3.10, FFmpeg, bibliotecas e PyTorch',
          'Deteccao de NVIDIA/CUDA ao final da preparacao',
          'Ambiente base concluido mesmo quando a aceleracao nao estiver ativa'
        ]
      }
    };
    this.statusCache = { value, expiresAt: Date.now() + STATUS_CACHE_TTL_MS };
    return value;
  }

  invalidateStatusCache() {
    this.statusCache = null;
    this.healthCache = null;
  }

  /**
   * Executa a instalacao automatica em segundo plano e transmite o progresso ao renderer.
   *
   * @param {unknown} payload
   * @param {Electron.WebContents} webContents
   * @returns {{started: boolean, jobId: string, provider: string, hidden: true}}
   */
  installDependencies(payload, webContents) {
    const provider = normalizeInstallProvider(payload);
    this.invalidateStatusCache();
    return this.installationService.start(provider, webContents);
  }

  /** @param {unknown} payload */
  cancelInstallation(payload) {
    return this.installationService.cancel(payload?.jobId);
  }

  pause() {
    return this.goAnimeGui.pause();
  }

  resume() {
    return this.goAnimeGui.resume();
  }

  togglePause() {
    return this.goAnimeGui.togglePause();
  }

  seek(payload) {
    return this.goAnimeGui.seek(payload?.seconds, payload?.mode);
  }

  setVolume(payload) {
    return this.goAnimeGui.setVolume(payload?.volume);
  }

  playbackState() {
    return playbackStateModel.snapshot(this.goAnimeGui, this.currentPlayback);
  }

  queue() {
    return playbackStateModel.queue(this.currentPlayback);
  }

  reorderQueue(payload) {
    const result = playbackStateModel.reorder(this.currentPlayback, payload);
    this.emit('state', playbackStateModel.snapshot(this.goAnimeGui, this.currentPlayback));
    return result;
  }

  next() {
    return this.playAdjacent(1);
  }

  previous() {
    return this.playAdjacent(-1);
  }

  async stop() {
    await this.persistPlayback(this.goAnimeGui.getPlayerState());
    const result = await this.goAnimeGui.stop();
    this.currentPlayback = null;
    return result;
  }

  async playAdjacent(direction) {
    const context = this.currentPlayback;
    const queue = Array.isArray(context?.queue) ? context.queue : context?.episodes;
    if (!context || !Array.isArray(queue) || queue.length === 0) {
      throw new AppError(
        'EPISODE_NAVIGATION_UNAVAILABLE',
        'A lista de episódios não está disponível para esta reprodução.',
        { status: 409 }
      );
    }

    const currentIndex = Number.isInteger(context.queueIndex)
      ? context.queueIndex
      : Number.isInteger(context.episodeIndex)
        ? context.episodeIndex
        : 0;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= queue.length) {
      return {
        available: false,
        message:
          direction > 0 ? 'Este é o último episódio disponível.' : 'Este é o primeiro episódio.'
      };
    }

    await this.persistPlayback(this.goAnimeGui.getPlayerState());
    await this.goAnimeGui.stop();
    return this.playEpisode({
      anime: context.anime,
      episode: queue[targetIndex],
      episodes: queue,
      episodeIndex: targetIndex,
      queue,
      language: context.language,
      quality: context.quality,
      resumePosition: 0
    });
  }

  async providerHealth(force = false) {
    if (!force && this.healthCache && this.healthCache.expiresAt > Date.now()) {
      return this.healthCache.value;
    }
    const value = await networkDiagnostics.buildProviderHealth(this.status(force));
    this.healthCache = { value, expiresAt: Date.now() + HEALTH_CACHE_TTL_MS };
    return value;
  }

  async getUserSettings() {
    try {
      return (
        (await this.settingsService?.get()) ?? {
          playerVolume: 80,
          playerMode: 'external',
          autoPlayNext: false,
          rememberPosition: true,
          defaultQuality: 'auto'
        }
      );
    } catch {
      return {
        playerVolume: 80,
        playerMode: 'external',
        autoPlayNext: false,
        rememberPosition: true,
        defaultQuality: 'auto'
      };
    }
  }

  handlePlayerState(state) {
    this.emit('state', { ...state, context: this.currentPlayback });
    const now = Date.now();
    if (this.currentPlayback && now - this.lastProgressSaveAt >= 10000) {
      this.lastProgressSaveAt = now;
      void this.persistPlayback(state);
    }
  }

  async handlePlaybackEnded(state) {
    if (!this.currentPlayback) return;
    await this.persistPlayback({ ...state, completed: true });
    const settings = await this.getUserSettings();
    if (!settings.autoPlayNext || this.autoNextInProgress) return;
    this.autoNextInProgress = true;
    try {
      await this.playAdjacent(1);
    } catch {
      // O fim da lista não é tratado como falha de reprodução.
    } finally {
      this.autoNextInProgress = false;
    }
  }

  async persistPlayback(state) {
    if (!this.libraryService || !this.currentPlayback) return;
    const context = this.currentPlayback;
    try {
      await this.libraryService.savePlayback({
        providerId: context.providerId,
        animeId: context.anime?.url,
        animeTitle: context.anime?.name,
        animeCover: context.anime?.imageUrl,
        episodeNumber: context.episode?.num || Number.parseFloat(context.episode?.number) || 1,
        episodeTitle: context.episode?.title || context.episode?.number || '',
        language: context.language,
        quality: context.quality,
        position: state?.position || 0,
        duration: state?.duration || context.episode?.duration || 0,
        source: state?.source || context.source || '',
        completed: Boolean(state?.completed || state?.ended),
        animePayload: context.anime || {},
        episodePayload: context.episode || {}
      });
    } catch {
      // A reprodução não deve ser interrompida por uma falha de histórico.
    }
  }
}

function createE2eProviderStatus() {
  const available = { available: true, installed: true, path: 'e2e-fixture' };
  return {
    ready: true,
    recommendedProvider: 'goanime-gui',
    providers: {
      goAnime: {
        id: 'goanime-gui',
        name: 'GoAnime GUI',
        ready: true,
        classicReady: true,
        bridge: { ...available, version: 'e2e' },
        executable: available,
        mpv: available,
        stability: 'recommended'
      },
      animeCliBr: {
        id: 'anime-cli-br',
        name: 'anime-cli-br',
        ready: true,
        executable: available,
        vlc: available,
        stability: 'e2e-fixture'
      },
      aniCli: {
        id: 'ani-cli',
        name: 'ani-cli',
        ready: true,
        executable: available,
        stability: 'e2e-fixture'
      }
    },
    tools: {
      fastAnimeVsr: { id: 'fast-anime-vsr', name: 'FAST Anime VSR', installed: true, ready: true }
    },
    dependencies: {
      goAnime: available,
      goAnimeBridge: available,
      animeCliBr: available,
      aniCli: available,
      mpv: available,
      vlc: available,
      fzf: available,
      ffmpeg: available,
      openssl: available,
      git: available,
      python: available,
      nvidia: available,
      fastAnimeVsr: available,
      gitBash: available,
      windowsTerminal: available,
      cmd: available
    },
    installCommands: {}
  };
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
 * @param {{request: object, status: object}} options
 * @returns {string}
 */
function launchGoAnime({ request, status }) {
  providerAdapters.assertGoAnimeReady(status);

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
 * @param {{request: object, status: object}} options
 * @returns {string}
 */
function launchAnimeCliBr({ request, status }) {
  providerAdapters.assertAnimeCliBrReady(status);

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
  providerAdapters.assertAniCliReady(status);

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
 * Cria uma sessao PowerShell posicionada na ferramenta FAST Anime VSR.
 * O usuario pode ajustar o config.py e iniciar o processamento manualmente.
 *
 * @param {object} fast
 * @returns {string}
 */
function writeFastAnimeVsrOpenScript(fast) {
  const scriptPath = path.join(
    os.tmpdir(),
    `kitsunedesk-fast-vsr-open-${process.pid}-${Date.now()}.ps1`
  );
  const root = String(fast.path).replace(/'/g, "''");
  const venvPython = String(fast.venvPython ?? '').replace(/'/g, "''");
  const script = `$ErrorActionPreference = 'Continue'
$projectRoot = '${root}'
$venvPython = '${venvPython}'

Set-Location -LiteralPath $projectRoot
Write-Host 'KitsuneDesk - FAST Anime VSR' -ForegroundColor Cyan
Write-Host 'Esta ferramenta melhora arquivos de video locais e nao pesquisa animes.' -ForegroundColor DarkCyan
Write-Host ''
Write-Host "Pasta do projeto: $projectRoot" -ForegroundColor Gray

if (Test-Path -LiteralPath $venvPython) {
  Write-Host 'Ambiente Python dedicado encontrado.' -ForegroundColor Green
} else {
  Write-Host 'O ambiente Python dedicado nao foi encontrado.' -ForegroundColor Yellow
}

Start-Process explorer.exe -ArgumentList $projectRoot
Write-Host ''
Write-Host '1. Coloque ou selecione o video de entrada conforme o config.py.' -ForegroundColor Yellow
Write-Host '2. Ajuste as configuracoes de GPU e caminho do arquivo.' -ForegroundColor Yellow
Write-Host '3. Para iniciar, execute:' -ForegroundColor Yellow
Write-Host '   & $venvPython main.py' -ForegroundColor White
Write-Host ''
Write-Host 'Esta janela permanecera aberta para voce usar a ferramenta.' -ForegroundColor Green
`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  return scriptPath;
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

  const ready = Boolean(root && runtime.configured && dependencies.ffmpeg.available);
  const accelerated = Boolean(ready && dependencies.nvidia.available && runtime.cuda);

  return {
    installed: Boolean(root),
    ready,
    accelerated,
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
    timeout: 15000
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
