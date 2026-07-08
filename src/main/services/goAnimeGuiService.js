const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const AppError = require('../utils/AppError');

const BRIDGE_VERSION = '1.2.0';
const TOOLS_ROOT = path.join(
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
  'KitsuneDesk',
  'tools'
);
const BRIDGE_DIRECTORY = path.join(TOOLS_ROOT, 'goanime-bridge');
const BRIDGE_PATH = path.join(BRIDGE_DIRECTORY, 'goanime-bridge.exe');

class GoAnimeGuiService {
  constructor() {
    this.mpvProcess = null;
    this.playbackBridgeProcess = null;
    this.playbackMpvPid = null;
  }

  status() {
    const candidates = [
      BRIDGE_PATH,
      path.join(process.cwd(), 'resources', 'goanime-bridge', 'goanime-bridge.exe'),
      path.join(__dirname, '..', '..', '..', 'resources', 'goanime-bridge', 'goanime-bridge.exe')
    ];
    const bridgePath = candidates.find((candidate) => fs.existsSync(candidate)) ?? null;

    if (!bridgePath) {
      return {
        available: false,
        path: null,
        version: null,
        expectedVersion: BRIDGE_VERSION
      };
    }

    const probe = spawnSync(bridgePath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    });
    const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim();
    const versionMatch = output.match(/([0-9]+\.[0-9]+\.[0-9]+)/);

    const version = versionMatch?.[1] ?? null;
    const executableHealthy = probe.status === 0;
    const versionCompatible = executableHealthy && version === BRIDGE_VERSION;

    return {
      available: versionCompatible,
      installed: executableHealthy,
      needsUpdate: executableHealthy && !versionCompatible,
      path: bridgePath,
      version,
      expectedVersion: BRIDGE_VERSION,
      output
    };
  }

  async search(payload) {
    const query = typeof payload?.query === 'string' ? payload.query.trim() : '';
    const language = payload?.language === 'dub' ? 'dub' : 'sub';

    if (query.length < 2) {
      throw new AppError('ANIME_NOT_FOUND', 'Digite pelo menos dois caracteres para pesquisar.', {
        status: 400
      });
    }

    return this.runBridge('search', { query, language }, 45000);
  }

  async episodes(payload) {
    const anime = normalizeAnime(payload?.anime);
    const language = payload?.language === 'dub' ? 'dub' : 'sub';

    return this.runBridge('episodes', { anime, language }, 45000);
  }

  async playEpisode(payload, mpvPath) {
    const anime = normalizeAnime(payload?.anime);
    const episode = normalizeEpisode(payload?.episode);
    const language = payload?.language === 'dub' ? 'dub' : 'sub';
    const quality = normalizeQuality(payload?.quality);

    if (!mpvPath || !fs.existsSync(mpvPath)) {
      throw new AppError(
        'PLAYER_NOT_FOUND',
        'MPV nao foi encontrado. Reinstale o GoAnime mantendo a opcao de incluir o MPV.',
        { status: 424 }
      );
    }

    const playback = await this.runBridgePlayback(
      { anime, episode, language, quality, mpvPath },
      90000
    );

    return {
      launched: true,
      provider: 'goanime-gui',
      providerName: 'GoAnime GUI',
      player: 'MPV',
      anime: anime.name,
      episode: episode.number,
      source: anime.source,
      quality,
      pid: playback.pid
    };
  }

  stop() {
    let stopped = false;

    if (this.playbackMpvPid && process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(this.playbackMpvPid), '/T', '/F'], {
        windowsHide: true,
        timeout: 10000
      });
      stopped = true;
    }

    if (this.playbackBridgeProcess && !this.playbackBridgeProcess.killed) {
      this.playbackBridgeProcess.kill();
      stopped = true;
    }

    if (this.mpvProcess && !this.mpvProcess.killed) {
      this.mpvProcess.kill();
      stopped = true;
    }

    this.playbackBridgeProcess = null;
    this.playbackMpvPid = null;
    this.mpvProcess = null;

    return stopped
      ? { stopped: true }
      : { stopped: false, message: 'Nenhuma reproducao iniciada pelo KitsuneDesk.' };
  }

  runBridgePlayback(payload, timeoutMs) {
    const bridge = this.status();

    if (!bridge.available || !bridge.path) {
      throw new AppError(
        'GOANIME_GUI_NOT_READY',
        'A interface grafica do GoAnime precisa ser ativada ou atualizada.',
        { status: 424 }
      );
    }

    if (this.playbackBridgeProcess && !this.playbackBridgeProcess.killed) {
      this.stop();
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

        answered = true;
        clearTimeout(timer);

        if (!parsed.ok) {
          child.kill();
          reject(
            new AppError(
              parsed.error?.code ?? 'GOANIME_ERROR',
              parsed.error?.message ?? 'O GoAnime nao conseguiu iniciar a reproducao.',
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
          new AppError('GOANIME_BRIDGE_ERROR', 'Nao foi possivel iniciar o motor do GoAnime.', {
            status: 500,
            technicalMessage: error.message
          })
        );
      });

      child.once('close', (code) => {
        if (this.playbackBridgeProcess === child) {
          this.playbackBridgeProcess = null;
          this.playbackMpvPid = null;
        }

        if (answered) return;
        if (stdoutBuffer.trim()) handleResponseLine(stdoutBuffer);
        if (answered) return;

        answered = true;
        clearTimeout(timer);
        reject(
          new AppError('PLAYER_START_FAILED', 'O MPV encerrou antes de iniciar o episódio.', {
            status: 502,
            technicalMessage: stderr || `Bridge finalizado com codigo ${code ?? 'desconhecido'}.`
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
        'A interface grafica do GoAnime ainda nao foi preparada. Clique em Ativar GoAnime GUI.',
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
            'Nao foi possivel iniciar o motor grafico do GoAnime.',
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
              'O motor GoAnime retornou uma resposta invalida.',
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
              parsed.error?.message ?? 'O GoAnime nao conseguiu concluir esta operacao.',
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
    throw new AppError('INVALID_ANIME', 'O anime selecionado nao possui dados suficientes.', {
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
    throw new AppError('INVALID_EPISODE', 'O episodio selecionado e invalido.', { status: 400 });
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

module.exports = GoAnimeGuiService;
module.exports.constants = {
  BRIDGE_DIRECTORY,
  BRIDGE_PATH,
  BRIDGE_VERSION,
  TOOLS_ROOT
};
