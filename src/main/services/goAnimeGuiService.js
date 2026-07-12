const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { spawn, spawnSync } = require('child_process');
const AppError = require('../utils/AppError');

const BRIDGE_VERSION = '1.5.1';
const TOOLS_ROOT = path.join(
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
  'KitsuneDesk',
  'tools'
);
const BRIDGE_DIRECTORY = path.join(TOOLS_ROOT, 'goanime-bridge');
const BRIDGE_PATH = path.join(BRIDGE_DIRECTORY, 'goanime-bridge.exe');
const BRIDGE_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
const BRIDGE_STATUS_PROBE_TIMEOUT_MS = 1200;

class GoAnimeGuiService extends EventEmitter {
  constructor() {
    super();
    this.mpvProcess = null;
    this.playbackBridgeProcess = null;
    this.playbackMpvPid = null;
    this.ipcPath = null;
    this.pollTimer = null;
    this.consecutivePollErrors = 0;
    this.playerState = createIdleState();
    this.stopRequested = false;
    this.bridgeStatusCache = null;
  }

  status(force = false) {
    if (!force && this.bridgeStatusCache && this.bridgeStatusCache.expiresAt > Date.now()) {
      return this.bridgeStatusCache.value;
    }
    const candidates = [
      BRIDGE_PATH,
      path.join(process.cwd(), 'resources', 'goanime-bridge', 'goanime-bridge.exe'),
      path.join(__dirname, '..', '..', '..', 'resources', 'goanime-bridge', 'goanime-bridge.exe')
    ];
    const bridgePath = candidates.find((candidate) => fs.existsSync(candidate)) ?? null;

    if (!bridgePath) {
      return this.rememberBridgeStatus({
        available: false,
        installed: false,
        path: null,
        version: null,
        expectedVersion: BRIDGE_VERSION
      });
    }

    const probe = spawnSync(bridgePath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: BRIDGE_STATUS_PROBE_TIMEOUT_MS
    });
    const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim();
    const versionMatch = output.match(/([0-9]+\.[0-9]+\.[0-9]+)/);
    const version = versionMatch?.[1] ?? null;
    const executableHealthy = probe.status === 0;
    const versionCompatible = executableHealthy && version === BRIDGE_VERSION;

    return this.rememberBridgeStatus({
      available: versionCompatible,
      installed: executableHealthy,
      needsUpdate: executableHealthy && !versionCompatible,
      path: bridgePath,
      version,
      expectedVersion: BRIDGE_VERSION,
      output,
      checkedAt: new Date().toISOString()
    });
  }

  rememberBridgeStatus(value) {
    this.bridgeStatusCache = { value, expiresAt: Date.now() + BRIDGE_STATUS_CACHE_TTL_MS };
    return value;
  }

  invalidateStatusCache() {
    this.bridgeStatusCache = null;
  }

  async search(payload) {
    const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
    const language = payload?.language === 'dub' ? 'dub' : 'sub';

    if (query.length < 2) {
      throw new AppError('ANIME_NOT_FOUND', 'Digite pelo menos dois caracteres para pesquisar.', {
        status: 400
      });
    }

    return this.runBridge('search', { query, language }, 25000);
  }

  async episodes(payload) {
    const anime = normalizeAnime(payload?.anime);
    const language = payload?.language === 'dub' ? 'dub' : 'sub';
    return this.runBridge('episodes', { anime, language }, 30000);
  }

  async resolveStream(payload) {
    const anime = normalizeAnime(payload?.anime);
    const episode = normalizeEpisode(payload?.episode);
    const language = payload?.language === 'dub' ? 'dub' : 'sub';
    const quality = normalizeQuality(payload?.quality);
    const stream = await this.runBridge('stream', { anime, episode, language, quality }, 90000);
    if (!stream?.url || !/^https?:\/\//i.test(stream.url)) {
      throw new AppError('STREAM_UNAVAILABLE', 'A fonte não forneceu um stream compatível.', {
        status: 502
      });
    }
    return stream;
  }

  async playEpisode(payload, mpvPath) {
    const anime = normalizeAnime(payload?.anime);
    const episode = normalizeEpisode(payload?.episode);
    const language = payload?.language === 'dub' ? 'dub' : 'sub';
    const quality = normalizeQuality(payload?.quality);
    const startPosition = Math.max(0, Number(payload?.startPosition ?? 0));
    const volume = clamp(Number(payload?.volume ?? 80), 0, 100, 80);

    if (!mpvPath || !fs.existsSync(mpvPath)) {
      throw new AppError(
        'PLAYER_NOT_FOUND',
        'MPV não foi encontrado. Reinstale o GoAnime mantendo a opção de incluir o MPV.',
        { status: 424 }
      );
    }

    this.stopRequested = false;
    const ipcPath = createMpvIpcPath();
    const playback = await this.runBridgePlayback(
      { anime, episode, language, quality, mpvPath, ipcPath, startPosition, volume },
      90000
    );

    this.ipcPath = playback.ipcPath || ipcPath;
    this.playerState = {
      ...createIdleState(),
      active: true,
      paused: false,
      position: startPosition,
      volume,
      animeTitle: anime.name,
      episodeNumber: episode.num || parseFloat(episode.number) || 1,
      episodeTitle: episode.title,
      source: playback.source || anime.source,
      quality: playback.quality || quality,
      language: playback.mode || language,
      pid: playback.pid,
      ipcPath: this.ipcPath,
      fallbackUsed: Boolean(playback.fallbackUsed),
      embedded: false
    };
    this.emitState();
    this.startPolling();

    return {
      launched: true,
      provider: 'goanime-gui',
      providerName: 'GoAnime GUI',
      player: 'MPV',
      anime: anime.name,
      episode: episode.number,
      source: playback.source || anime.source,
      requestedSource: playback.requestedSource || anime.source,
      quality: playback.quality || quality,
      requestedQuality: playback.requestedQuality || quality,
      mode: playback.mode || language,
      requestedMode: playback.requestedMode || language,
      fallbackUsed: Boolean(playback.fallbackUsed),
      embedded: false,
      pid: playback.pid,
      ipcPath: this.ipcPath,
      resumedAt: startPosition
    };
  }

  getPlayerState() {
    return { ...this.playerState };
  }

  async pause() {
    await this.setProperty('pause', true);
    return this.refreshState();
  }

  async resume() {
    await this.setProperty('pause', false);
    return this.refreshState();
  }

  async togglePause() {
    await this.command(['cycle', 'pause']);
    return this.refreshState();
  }

  async seek(value, mode = 'relative') {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
      throw new AppError('INVALID_SEEK', 'Posição de reprodução inválida.', { status: 400 });
    }
    await this.command(['seek', seconds, mode === 'absolute' ? 'absolute' : 'relative']);
    return this.refreshState();
  }

  async setVolume(value) {
    const volume = clamp(Number(value), 0, 100, 80);
    await this.setProperty('volume', volume);
    return this.refreshState();
  }

  async stop() {
    let stopped = false;
    this.stopRequested = true;
    this.stopPolling();

    const bridgeProcess = this.playbackBridgeProcess;
    const mpvPid = this.playbackMpvPid;
    const mpvProcess = this.mpvProcess;

    if (this.ipcPath) {
      try {
        await this.command(['quit']);
        stopped = true;
      } catch {
        // O processo pode já ter encerrado.
      }
    }

    // Desvincula os processos antes de encerrá-los para que eventos tardios de
    // "close" não sejam interpretados como fim natural nem acionem auto-play.
    this.playbackBridgeProcess = null;
    this.playbackMpvPid = null;
    this.mpvProcess = null;

    if (mpvPid && process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(mpvPid), '/T', '/F'], {
        windowsHide: true,
        timeout: 10000
      });
      stopped = true;
    }

    if (bridgeProcess && !bridgeProcess.killed) {
      bridgeProcess.kill();
      stopped = true;
    }

    if (mpvProcess && !mpvProcess.killed) {
      mpvProcess.kill();
      stopped = true;
    }

    this.ipcPath = null;
    this.playerState = createIdleState();
    this.emitState();
    this.stopRequested = false;

    return stopped
      ? { stopped: true }
      : { stopped: false, message: 'Nenhuma reprodução iniciada pelo KitsuneDesk.' };
  }

  startPolling() {
    this.stopPolling();
    this.consecutivePollErrors = 0;
    const tick = async () => {
      try {
        await this.refreshState();
        this.consecutivePollErrors = 0;
      } catch {
        this.consecutivePollErrors += 1;
        if (this.consecutivePollErrors >= 4) {
          this.stopPolling();
          const previous = this.playerState;
          this.playerState = { ...previous, active: false, ended: true };
          this.emitState();
          this.emit('ended', { ...this.playerState });
        }
      }
    };
    this.pollTimer = setInterval(tick, 1000);
    setTimeout(tick, 350);
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async refreshState() {
    if (!this.ipcPath) return this.getPlayerState();
    const result = await this.sendMpvCommands([
      ['get_property', 'pause'],
      ['get_property', 'time-pos'],
      ['get_property', 'duration'],
      ['get_property', 'volume'],
      ['get_property', 'media-title'],
      ['get_property', 'eof-reached']
    ]);

    const [paused, position, duration, volume, mediaTitle, eofReached] = result;
    const ended = Boolean(eofReached);
    this.playerState = {
      ...this.playerState,
      active: !ended,
      paused: Boolean(paused),
      position: Number(position ?? this.playerState.position ?? 0),
      duration: Number(duration ?? this.playerState.duration ?? 0),
      volume: Number(volume ?? this.playerState.volume ?? 80),
      mediaTitle: String(mediaTitle ?? this.playerState.mediaTitle ?? ''),
      ended,
      updatedAt: new Date().toISOString()
    };
    this.emitState();
    if (ended) {
      this.stopPolling();
      this.emit('ended', { ...this.playerState });
    }
    return this.getPlayerState();
  }

  command(command) {
    return this.sendMpvCommands([command]).then((result) => result[0]);
  }

  setProperty(property, value) {
    return this.command(['set_property', property, value]);
  }

  sendMpvCommands(commands) {
    if (!this.ipcPath) {
      throw new AppError('PLAYER_NOT_ACTIVE', 'Nenhum episódio está sendo reproduzido.', {
        status: 409
      });
    }

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.ipcPath);
      let buffer = '';
      const responses = new Map();
      let settled = false;
      const timer = setTimeout(() => finishError(new Error('Tempo limite do IPC do MPV.')), 2500);

      const finishError = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(
          error instanceof AppError
            ? error
            : new AppError('PLAYER_IPC_ERROR', 'Não foi possível controlar o MPV.', {
                status: 502,
                technicalMessage: error.message
              })
        );
      };

      const finishSuccess = () => {
        if (settled || responses.size < commands.length) return;
        settled = true;
        clearTimeout(timer);
        socket.end();
        const ordered = commands.map((_command, index) => responses.get(index + 1));
        resolve(ordered);
      };

      socket.once('connect', () => {
        commands.forEach((command, index) => {
          socket.write(`${JSON.stringify({ command, request_id: index + 1 })}\n`);
        });
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.request_id && parsed.error === 'success') {
              responses.set(Number(parsed.request_id), parsed.data);
            } else if (parsed.request_id && parsed.error && parsed.error !== 'success') {
              finishError(new Error(`MPV: ${parsed.error}`));
              return;
            }
          } catch {
            // Eventos sem request_id são ignorados.
          }
        }
        finishSuccess();
      });
      socket.once('error', finishError);
      socket.once('close', () => {
        if (!settled && responses.size < commands.length) {
          finishError(new Error('Conexão IPC do MPV encerrada.'));
        }
      });
    });
  }

  emitState() {
    this.emit('state', { ...this.playerState });
  }

  async runBridgePlayback(payload, timeoutMs) {
    const bridge = this.status();
    if (!bridge.available || !bridge.path) {
      throw new AppError(
        'GOANIME_GUI_NOT_READY',
        'A interface gráfica do GoAnime precisa ser ativada ou atualizada.',
        { status: 424 }
      );
    }

    if (this.playbackBridgeProcess && !this.playbackBridgeProcess.killed) {
      await this.stop();
      this.stopRequested = false;
    }

    return new Promise((resolve, reject) => {
      const child = spawn(bridge.path, ['play'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdoutBuffer = '';
      let stderr = '';
      let answered = false;

      const timer = setTimeout(() => {
        if (answered) return;
        answered = true;
        child.kill();
        reject(
          new AppError(
            'SOURCE_TIMEOUT',
            'O GoAnime demorou demais para preparar o vídeo. Tente outro resultado.',
            { status: 504, technicalMessage: stderr }
          )
        );
      }, timeoutMs);

      const handleResponseLine = (line) => {
        if (answered || !line.trim()) return;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }

        if (parsed.type === 'progress') {
          this.emit('progress', {
            stage: parsed.stage || 'source',
            message: parsed.message || 'Consultando fontes...',
            attempt: Number(parsed.attempt || 0),
            total: Number(parsed.total || 0),
            at: new Date().toISOString()
          });
          return;
        }

        answered = true;
        clearTimeout(timer);

        if (!parsed.ok) {
          child.kill();
          reject(
            new AppError(
              parsed.error?.code ?? 'GOANIME_ERROR',
              parsed.error?.message ?? 'O GoAnime não conseguiu iniciar a reprodução.',
              {
                status: mapBridgeStatus(parsed.error?.code),
                technicalMessage: parsed.error?.detail ?? stderr
              }
            )
          );
          return;
        }

        this.playbackBridgeProcess = child;
        this.playbackMpvPid = Number(parsed.data?.pid ?? 0) || null;
        resolve(parsed.data);
      };

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        lines.forEach(handleResponseLine);
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
        if (stderr.length > 16000) stderr = stderr.slice(-16000);
      });

      child.once('error', (error) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        reject(
          new AppError('GOANIME_BRIDGE_ERROR', 'Não foi possível iniciar o motor do GoAnime.', {
            status: 500,
            technicalMessage: error.message
          })
        );
      });

      child.once('close', (code) => {
        const wasCurrentPlayback = this.playbackBridgeProcess === child;
        if (wasCurrentPlayback) {
          this.playbackBridgeProcess = null;
          this.playbackMpvPid = null;
        }

        if (answered) {
          // Um bridge antigo pode encerrar depois que o próximo episódio já foi
          // iniciado. Nesse caso ele não deve interromper o polling do novo MPV.
          if (!wasCurrentPlayback || this.stopRequested) return;
          this.stopPolling();
          if (this.playerState.active) {
            this.playerState = { ...this.playerState, active: false, ended: true };
            this.emitState();
            this.emit('ended', { ...this.playerState });
          }
          return;
        }
        if (stdoutBuffer.trim()) handleResponseLine(stdoutBuffer);
        if (answered) return;

        answered = true;
        clearTimeout(timer);
        reject(
          new AppError('PLAYER_START_FAILED', 'O MPV encerrou antes de iniciar o episódio.', {
            status: 502,
            technicalMessage: stderr || `Bridge finalizado com código ${code ?? 'desconhecido'}.`
          })
        );
      });

      child.stdin.end(JSON.stringify(payload));
    });
  }

  runBridge(command, payload, timeoutMs) {
    const bridge = this.status();
    if (!bridge.available || !bridge.path) {
      throw new AppError(
        'GOANIME_GUI_NOT_READY',
        'A interface gráfica do GoAnime ainda não foi preparada. Clique em instalar ou reparar.',
        { status: 424 }
      );
    }

    return new Promise((resolve, reject) => {
      const child = spawn(bridge.path, [command], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      let finished = false;

      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        child.kill();
        reject(
          new AppError(
            'SOURCE_TIMEOUT',
            'As fontes demoraram demais para responder. Tente novamente em alguns instantes.',
            { status: 504 }
          )
        );
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(
          new AppError(
            'GOANIME_BRIDGE_ERROR',
            'Não foi possível iniciar o motor gráfico do GoAnime.',
            {
              status: 500,
              technicalMessage: error.message
            }
          )
        );
      });
      child.on('close', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        const parsed = parseBridgeResponse(stdout);
        if (!parsed) {
          reject(
            new AppError(
              'GOANIME_BRIDGE_ERROR',
              'O motor GoAnime retornou uma resposta inválida.',
              {
                status: 502,
                technicalMessage: `${stdout}\n${stderr}`.trim()
              }
            )
          );
          return;
        }

        if (!parsed.ok) {
          reject(
            new AppError(
              parsed.error?.code ?? 'GOANIME_ERROR',
              parsed.error?.message ?? 'O GoAnime não conseguiu concluir esta operação.',
              {
                status: mapBridgeStatus(parsed.error?.code),
                technicalMessage: parsed.error?.detail ?? stderr
              }
            )
          );
          return;
        }

        resolve(parsed.data);
      });

      child.stdin.end(JSON.stringify(payload));
    });
  }
}

function createMpvIpcPath() {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\kitsunedesk-mpv-${process.pid}-${Date.now()}`;
  }
  return path.join(os.tmpdir(), `kitsunedesk-mpv-${process.pid}-${Date.now()}.sock`);
}

function createIdleState() {
  return {
    active: false,
    paused: false,
    position: 0,
    duration: 0,
    volume: 80,
    animeTitle: '',
    episodeNumber: null,
    episodeTitle: '',
    source: '',
    quality: '',
    language: '',
    mediaTitle: '',
    fallbackUsed: false,
    embedded: false,
    ended: false,
    pid: null,
    ipcPath: null,
    updatedAt: new Date().toISOString()
  };
}

function parseBridgeResponse(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Tenta a linha anterior caso alguma biblioteca tenha escrito no stdout.
    }
  }

  return null;
}

function normalizeAnime(value) {
  const anime = value && typeof value === 'object' ? value : {};
  const normalized = {
    name: String(anime.name ?? '').trim(),
    url: String(anime.url ?? '').trim(),
    imageUrl: String(anime.imageUrl ?? '').trim(),
    source: String(anime.source ?? '').trim(),
    mediaType: String(anime.mediaType ?? 'anime').trim(),
    year: String(anime.year ?? '').trim(),
    anilistId: Number(anime.anilistId ?? 0),
    malId: Number(anime.malId ?? 0),
    description: String(anime.description ?? '').trim(),
    genres: Array.isArray(anime.genres) ? anime.genres.map(String) : [],
    averageScore: Number(anime.averageScore ?? 0),
    totalEpisodes: Number(anime.totalEpisodes ?? 0),
    status: String(anime.status ?? '').trim()
  };

  if (!normalized.url || !normalized.source) {
    throw new AppError('INVALID_ANIME', 'O anime selecionado não possui dados suficientes.', {
      status: 400
    });
  }

  return normalized;
}

function normalizeEpisode(value) {
  const episode = value && typeof value === 'object' ? value : {};
  const normalized = {
    number: String(episode.number ?? '').trim(),
    num: Number(episode.num ?? 0),
    url: String(episode.url ?? '').trim(),
    title: String(episode.title ?? '').trim(),
    aired: String(episode.aired ?? '').trim(),
    duration: Number(episode.duration ?? 0),
    isFiller: Boolean(episode.isFiller),
    isRecap: Boolean(episode.isRecap),
    synopsis: String(episode.synopsis ?? '').trim()
  };

  if (!normalized.number) {
    throw new AppError('INVALID_EPISODE', 'O episódio selecionado é inválido.', { status: 400 });
  }

  return normalized;
}

function normalizeQuality(value) {
  const quality = String(value ?? 'auto')
    .toLowerCase()
    .replace(/p$/, '');
  if (quality === 'auto' || quality === 'best') return 'best';
  if (quality === 'worst') return 'worst';
  if (['360', '480', '720', '1080'].includes(quality)) return `${quality}p`;
  return 'best';
}

function mapBridgeStatus(code) {
  if (code === 'ANIME_NOT_FOUND' || code === 'EPISODES_NOT_FOUND') return 404;
  if (code === 'SOURCE_TIMEOUT') return 504;
  if (code === 'SOURCE_DNS_ERROR' || code === 'STREAM_UNAVAILABLE') return 502;
  if (code === 'PLAYER_START_FAILED' || code === 'PLAYER_NOT_FOUND') return 502;
  if (code === 'SOURCE_UNSUPPORTED') return 422;
  return 500;
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

module.exports = GoAnimeGuiService;
module.exports.constants = {
  BRIDGE_DIRECTORY,
  BRIDGE_PATH,
  BRIDGE_VERSION,
  TOOLS_ROOT
};
module.exports.testHelpers = {
  createMpvIpcPath,
  normalizeAnime,
  normalizeEpisode,
  normalizeQuality,
  parseBridgeResponse
};
