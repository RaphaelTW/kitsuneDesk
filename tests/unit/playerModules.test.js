const test = require('node:test');
const assert = require('node:assert/strict');
const embeddedCompatibility = require('../../src/main/services/player/embeddedCompatibility');
const embeddedPlayer = require('../../src/main/services/player/embeddedPlayer');
const externalMpv = require('../../src/main/services/player/externalMpv');
const playbackQueue = require('../../src/main/services/player/playbackQueue');
const playbackState = require('../../src/main/services/player/playbackState');
const providerAdapters = require('../../src/main/services/player/providerAdapters');
const providerStatus = require('../../src/main/services/player/providerStatus');

test('modulo de fila posiciona o episodio atual e preserva o estado ao reordenar', () => {
  const episodes = [
    { num: 1, title: 'Um' },
    { num: 2, title: 'Dois' },
    { num: 3, title: 'Tres' }
  ];
  const queue = playbackQueue.buildPlaybackQueue(episodes, 1, [
    episodes[2],
    episodes[0],
    episodes[1]
  ]);
  assert.deepEqual(
    queue.map(({ num }) => num),
    [3, 2, 1]
  );

  const context = { queue, episode: episodes[1], queueIndex: 1 };
  const state = playbackState.reorder(context, { fromIndex: 2, toIndex: 0 });
  assert.deepEqual(
    state.items.map(({ num }) => num),
    [1, 3, 2]
  );
  assert.equal(state.currentIndex, 2);
});

test('player embutido e MPV externo produzem contextos equivalentes', async () => {
  const episode = { num: 1, number: '1', title: 'Piloto' };
  const payload = {
    anime: { name: 'Teste', source: 'AllAnime' },
    episode,
    episodes: [episode],
    language: 'sub',
    quality: '720'
  };
  const settings = { defaultQuality: 'auto', playerVolume: 70 };
  const embedded = embeddedPlayer.createEmbeddedPlayback(payload, {
    settings,
    stream: { url: 'https://cdn.example/video.mp4', metadata: { container: 'mp4' } },
    queue: [episode],
    queueIndex: 0,
    startPosition: 12
  });
  assert.equal(embedded.result.playerMode, 'embedded');

  let launchPayload;
  const external = await externalMpv.launchExternalMpv(
    {
      playEpisode: async (received) => {
        launchPayload = received;
        return { source: 'AllAnime', quality: '720', pid: 15 };
      }
    },
    payload,
    {
      settings,
      status: { dependencies: { mpv: { path: 'C:/mpv.exe' } } },
      queue: [episode],
      queueIndex: 0,
      startPosition: 12
    }
  );
  assert.equal(external.result.playerMode, 'external');
  assert.equal(external.context.providerId, embedded.context.providerId);
  assert.equal(launchPayload.volume, 70);
  assert.equal(launchPayload.startPosition, 12);
});

test('compatibilidade embutida encaminha HLS e codecs sem garantia para o MPV', () => {
  assert.equal(
    embeddedCompatibility.analyzeEmbeddedCompatibility({
      url: 'https://cdn.example/master.m3u8'
    }).compatible,
    false
  );
  assert.equal(
    embeddedCompatibility.analyzeEmbeddedCompatibility({
      url: 'https://cdn.example/video.mp4',
      metadata: { codec: 'hevc' }
    }).compatible,
    false
  );
  assert.equal(
    embeddedCompatibility.analyzeEmbeddedCompatibility({
      url: 'https://cdn.example/video.mp4'
    }).compatible,
    true
  );
});

test('adaptador valida providers e escolhe o primeiro caminho estavel disponivel', () => {
  const status = {
    providers: {
      goAnime: { classicReady: true },
      animeCliBr: { ready: true },
      aniCli: { ready: true }
    },
    dependencies: {
      goAnime: { available: true },
      mpv: { available: true },
      animeCliBr: { available: true },
      vlc: { available: true },
      aniCli: { available: true },
      gitBash: { available: true },
      fzf: { available: true },
      ffmpeg: { available: true },
      openssl: { available: true }
    }
  };
  assert.equal(providerAdapters.resolveProvider('auto', status), 'goanime');
  assert.deepEqual(providerAdapters.normalizePayload({ query: ' Naruto ', quality: '720' }), {
    query: 'Naruto',
    provider: 'auto',
    language: 'sub',
    quality: '720'
  });
  assert.throws(() => providerAdapters.normalizePayload({ query: 'x' }), {
    code: 'ANIME_NOT_FOUND'
  });
});

test('status dos provedores e composto sem depender do orquestrador do player', () => {
  const available = { available: true, path: 'fixture' };
  const unavailable = { available: false, path: null };
  const status = providerStatus.buildProviderStatus({
    aniCli: available,
    animeCliBr: available,
    cmd: available,
    fastAnimeVsr: {
      installed: true,
      ready: false,
      accelerated: false,
      path: 'fixture-vsr',
      runtime: { configured: true, cuda: false }
    },
    ffmpeg: available,
    fzf: available,
    git: available,
    gitBash: available,
    goAnime: available,
    goAnimeBridge: available,
    mpv: available,
    nvidia: unavailable,
    openssl: available,
    python: available,
    vlc: unavailable,
    windowsTerminal: available
  });

  assert.equal(status.ready, true);
  assert.equal(status.providers.goAnime.classicReady, true);
  assert.equal(status.providers.animeCliBr.ready, false);
  assert.equal(status.providers.aniCli.ready, true);
  assert.equal(status.tools.fastAnimeVsr.ready, false);
  assert.equal(status.dependencies.cmd, available);
});

test('status permanece seguro quando todos os executaveis estao ausentes', () => {
  const missing = { available: false, path: null };
  const status = providerStatus.buildProviderStatus({
    aniCli: missing,
    animeCliBr: missing,
    cmd: missing,
    fastAnimeVsr: {
      installed: false,
      ready: false,
      accelerated: false,
      path: null,
      runtime: { configured: false, cuda: false, message: 'Ausente' }
    },
    ffmpeg: missing,
    fzf: missing,
    git: missing,
    gitBash: missing,
    goAnime: missing,
    goAnimeBridge: missing,
    mpv: missing,
    nvidia: missing,
    openssl: missing,
    python: missing,
    vlc: missing,
    windowsTerminal: missing
  });

  assert.equal(status.ready, false);
  assert.equal(status.recommendedProvider, null);
  assert.equal(status.providers.goAnime.ready, false);
  assert.equal(status.providers.goAnime.classicReady, false);
  assert.equal(status.providers.animeCliBr.ready, false);
  assert.equal(status.providers.aniCli.ready, false);
  assert.equal(status.tools.fastAnimeVsr.installed, false);
});
