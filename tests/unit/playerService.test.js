const test = require('node:test');
const assert = require('node:assert/strict');
const PlayerService = require('../../src/main/services/playerService');

test('reprodução externa aplica volume, posição e salva histórico', async () => {
  const saved = [];
  const service = new PlayerService({
    settingsService: {
      get: () => ({
        playerVolume: 65,
        playerMode: 'external',
        rememberPosition: true,
        defaultQuality: 'auto'
      })
    },
    libraryService: {
      savePlayback: async (payload) => saved.push(payload)
    }
  });
  service.status = () => ({
    providers: { goAnime: { ready: true } },
    dependencies: { mpv: { path: 'C:/mpv.exe' } }
  });
  let received;
  service.goAnimeGui = {
    playEpisode: async (payload) => {
      received = payload;
      return { source: 'AllAnime', quality: 'best', mode: 'sub', pid: 55 };
    },
    getPlayerState: () => ({ active: true, position: 42, duration: 120, source: 'AllAnime' })
  };

  const anime = { name: 'Teste', url: 'abc123', imageUrl: '', source: 'AllAnime' };
  const episode = { number: '1', num: 1, title: 'Piloto' };
  const result = await service.playEpisode({
    anime,
    episode,
    episodes: [episode],
    episodeIndex: 0,
    language: 'sub',
    quality: 'auto',
    resumePosition: 42
  });

  assert.equal(received.volume, 65);
  assert.equal(received.startPosition, 42);
  assert.equal('windowId' in received, false);
  assert.equal(result.playerMode, 'external');
  assert.equal(result.embedded, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].animeTitle, 'Teste');
});

test('player embutido resolve o stream sem iniciar o MPV', async () => {
  const service = new PlayerService({
    settingsService: {
      get: () => ({
        playerVolume: 80,
        playerMode: 'embedded',
        rememberPosition: true,
        defaultQuality: 'auto'
      })
    },
    libraryService: { savePlayback: async () => {} }
  });
  service.status = () => ({
    providers: { goAnime: { ready: true } },
    dependencies: { mpv: { path: 'C:/mpv.exe' } }
  });
  service.goAnimeGui = {
    resolveStream: async () => ({ url: 'https://cdn.example/video.m3u8', metadata: {} }),
    getPlayerState: () => ({ active: true, position: 0, duration: 0 })
  };

  const episode = { number: '1', num: 1, title: 'Piloto' };
  const result = await service.playEpisode({
    anime: { name: 'Teste', url: 'abc123', source: 'AllAnime' },
    episode,
    episodes: [episode],
    episodeIndex: 0
  });

  assert.equal(result.playerMode, 'embedded');
  assert.equal(result.embedded, true);
  assert.equal(result.embeddedFallback, false);
  assert.equal(result.streamUrl, 'https://cdn.example/video.m3u8');
});

test('fila de reproducao pode ser reordenada', async () => {
  const service = new PlayerService({
    settingsService: {
      get: () => ({
        playerVolume: 80,
        playerMode: 'external',
        rememberPosition: true,
        defaultQuality: 'auto'
      })
    },
    libraryService: { savePlayback: async () => {} }
  });
  service.status = () => ({
    providers: { goAnime: { ready: true } },
    dependencies: { mpv: { path: 'C:/mpv.exe' } }
  });
  service.goAnimeGui = {
    playEpisode: async () => ({ source: 'AllAnime', quality: 'best', mode: 'sub', pid: 100 }),
    getPlayerState: () => ({ active: true, position: 0, duration: 0 })
  };

  const episodes = [
    { number: '1', num: 1, title: 'Um' },
    { number: '2', num: 2, title: 'Dois' },
    { number: '3', num: 3, title: 'Tres' }
  ];
  await service.playEpisode({
    anime: { name: 'Teste', url: 'abc123', source: 'AllAnime' },
    episode: episodes[0],
    episodes,
    episodeIndex: 0
  });

  const result = service.reorderQueue({ fromIndex: 2, toIndex: 1 });

  assert.deepEqual(
    result.items.map((episode) => episode.num),
    [1, 3, 2]
  );
});
