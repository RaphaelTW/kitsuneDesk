const test = require('node:test');
const assert = require('node:assert/strict');
const PlayerService = require('../../src/main/services/playerService');

test('reprodução gráfica aplica volume, posição e salva histórico', async () => {
  const saved = [];
  const service = new PlayerService({
    settingsService: {
      get: () => ({ playerVolume: 65, rememberPosition: true, defaultQuality: 'auto' })
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
  await service.playEpisode({
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
  assert.equal(saved.length, 1);
  assert.equal(saved[0].animeTitle, 'Teste');
});
