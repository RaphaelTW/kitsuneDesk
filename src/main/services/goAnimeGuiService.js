const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const AppError = require('../utils/AppError');

const BRIDGE_VERSION = '1.0.0';
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

    return {
      available: probe.status === 0,
      path: bridgePath,
      version: versionMatch?.[1] ?? null,
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

    const stream = await this.runBridge('stream', { anime, episode, language, quality }, 60000);

    await this.launchMpv({ mpvPath, stream, anime, episode });

    return {
      launched: true,
      provider: 'goanime-gui',
      providerName: 'GoAnime GUI',
      player: 'MPV',
      anime: anime.name,
      episode: episode.number,
      source: anime.source,
      quality
    };
  }

  stop() {
    if (!this.mpvProcess || this.mpvProcess.killed) {
      return { stopped: false, message: 'Nenhuma reproducao iniciada pelo KitsuneDesk.' };
    }

    this.mpvProcess.kill();
    this.mpvProcess = null;
    return { stopped: true };
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

  async launchMpv({ mpvPath, stream, anime, episode }) {
    const streamUrl = normalizeStreamUrl(stream?.url);
    const args = [
      '--force-window=yes',
      '--hwdec=auto-safe',
      '--keep-open=no',
      '--save-position-on-quit',
      `--title=KitsuneDesk - ${sanitizeTitle(anime.name)} - Episodio ${episode.number}`
    ];

    args.push(...buildMpvHeaderArgs(stream?.metadata));

    args.push('--', streamUrl);

    const child = spawn(mpvPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });

    this.mpvProcess = child;
    await waitForMpvStartup(child);
  }
}

function buildMpvHeaderArgs(metadata) {
  const headers = [];
  const normalizedMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const referer = pickMetadata(normalizedMetadata, ['referer', 'referrer', 'Referer', 'Referrer']);
  const origin = pickMetadata(normalizedMetadata, ['origin', 'Origin']);
  const cookie = pickMetadata(normalizedMetadata, ['cookie', 'Cookie']);
  const userAgent = pickMetadata(normalizedMetadata, [
    'user-agent',
    'User-Agent',
    'userAgent',
    'UserAgent'
  ]);

  if (referer) headers.push(`Referer: ${referer}`);
  if (origin) headers.push(`Origin: ${origin}`);
  if (cookie) headers.push(`Cookie: ${cookie}`);
  if (userAgent) headers.push(`User-Agent: ${userAgent}`);

  return headers.length > 0 ? [`--http-header-fields=${headers.join(',')}`] : [];
}

function pickMetadata(metadata, keys) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeStreamUrl(value) {
  const streamUrl = String(value ?? '').trim();

  try {
    const parsedUrl = new URL(streamUrl);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return streamUrl;
    }
  } catch {
    // Tratado abaixo com uma mensagem publica melhor.
  }

  throw new AppError(
    'STREAM_UNAVAILABLE',
    'A fonte encontrou o episodio, mas nao entregou um link de video valido.',
    { status: 502 }
  );
}

function waitForMpvStartup(child) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    }, 1500);

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new AppError('PLAYER_NOT_FOUND', 'Nao foi possivel iniciar o MPV.', {
          status: 500,
          technicalMessage: error.message
        })
      );
    });

    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new AppError(
          'PLAYER_CLOSED_IMMEDIATELY',
          'O MPV abriu e fechou imediatamente. A fonte pode ter recusado o link de video.',
          {
            status: 502,
            technicalMessage: `code=${code ?? 'null'} signal=${signal ?? 'null'}`
          }
        )
      );
    });
  });
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
  if (code === 'SOURCE_UNSUPPORTED') return 422;
  return 500;
}

function sanitizeTitle(value) {
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 120);
}

module.exports = GoAnimeGuiService;
module.exports.constants = {
  BRIDGE_DIRECTORY,
  BRIDGE_PATH,
  BRIDGE_VERSION,
  TOOLS_ROOT
};
