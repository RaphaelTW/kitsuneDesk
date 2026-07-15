const AppError = require('../../utils/AppError');

const SUPPORTED_PROVIDERS = new Set(['auto', 'goanime', 'anime-cli-br', 'ani-cli']);
const SUPPORTED_QUALITIES = new Set(['auto', '360', '480', '720', '1080']);
const SUPPORTED_LANGUAGES = new Set(['sub', 'dub']);

async function launchLegacyProvider(payload, adapters) {
  const request = normalizePayload(payload);
  const status = adapters.status();
  const provider = resolveProvider(request.provider, status);

  if (provider === 'goanime') {
    return result(provider, 'GoAnime classico', adapters.launchGoAnime({ request, status }));
  }
  if (provider === 'anime-cli-br') {
    await adapters.assertAnimeFireReachable();
    return result(provider, 'anime-cli-br', adapters.launchAnimeCliBr({ request, status }));
  }
  return result(provider, 'ani-cli experimental', adapters.launchAniCli({ request, status }));
}

function normalizePayload(payload) {
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

function result(provider, providerName, terminal) {
  return { launched: true, provider, providerName, terminal };
}

module.exports = {
  assertAniCliReady,
  assertAnimeCliBrReady,
  assertGoAnimeReady,
  launchLegacyProvider,
  normalizePayload,
  resolveProvider
};
