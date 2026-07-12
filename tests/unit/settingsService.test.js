const test = require('node:test');
const assert = require('node:assert/strict');
const SettingsService = require('../../src/main/services/settingsService');

function createService() {
  let row = {
    user_id: 1,
    default_provider: 'goanime-gui',
    default_language: 'sub',
    default_quality: 'auto',
    auto_play_next: 0,
    player_volume: 80,
    player_mode: 'external',
    theme: 'dark',
    downloads_path: '',
    audio_preference: 'sub',
    parental_control_enabled: 0,
    parental_pin_hash: null,
    max_content_rating: '18',
    remember_position: 1,
    check_updates: 1,
    local_telemetry_enabled: 0
  };
  const repository = {
    createDefaultForUser() {},
    findByUserId() {
      return row;
    },
    update(_userId, input) {
      row = {
        ...row,
        default_provider: input.defaultProvider,
        default_language: input.defaultLanguage,
        default_quality: input.defaultQuality,
        auto_play_next: input.autoPlayNext ? 1 : 0,
        player_volume: input.playerVolume,
        player_mode: input.playerMode,
        theme: input.theme,
        downloads_path: input.downloadsPath,
        audio_preference: input.audioPreference,
        parental_control_enabled: input.parentalControlEnabled ? 1 : 0,
        max_content_rating: input.maxContentRating,
        remember_position: input.rememberPosition ? 1 : 0,
        check_updates: input.checkUpdates ? 1 : 0,
        local_telemetry_enabled: input.localTelemetryEnabled ? 1 : 0
      };
    },
    updateParentalPin(_userId, hash) {
      row.parental_pin_hash = hash;
      row.parental_control_enabled = 1;
    }
  };
  const sessionRepository = { getCurrent: () => ({ user: { id: 1 } }) };
  return new SettingsService({ settingsRepository: repository, sessionRepository });
}

test('normaliza e persiste configurações do usuário', () => {
  const service = createService();
  const settings = service.update({
    defaultProvider: 'ani-cli',
    defaultLanguage: 'dub',
    defaultQuality: '720',
    autoPlayNext: true,
    playerVolume: 150,
    playerMode: 'embedded',
    theme: 'dracula',
    downloadsPath: 'C:/Videos',
    audioPreference: 'dub',
    parentalControlEnabled: true,
    maxContentRating: '14',
    rememberPosition: true,
    checkUpdates: false,
    localTelemetryEnabled: true
  });

  assert.equal(settings.defaultProvider, 'ani-cli');
  assert.equal(settings.theme, 'dracula');
  assert.equal(settings.defaultLanguage, 'dub');
  assert.equal(settings.playerVolume, 100);
  assert.equal(settings.playerMode, 'embedded');
  assert.equal(settings.autoPlayNext, true);
  assert.equal(settings.maxContentRating, '14');
  assert.equal(settings.checkUpdates, false);
  assert.equal(settings.localTelemetryEnabled, true);
});

test('configura e valida PIN parental', async () => {
  const service = createService();
  await service.setParentalPin({ pin: '1234' });
  const result = await service.verifyParentalPin({ pin: '1234' });
  assert.equal(result.verified, true);
  await assert.rejects(() => service.verifyParentalPin({ pin: '9999' }), /PIN parental incorreto/);
});

test('aceita os novos temas da v0.11.0', () => {
  const service = createService();
  for (const theme of [
    'older-brother-core',
    'dreamcore',
    'cottagecore',
    'cyberpunk',
    'synthwave'
  ]) {
    const settings = service.update({ theme });
    assert.equal(settings.theme, theme);
  }
});
