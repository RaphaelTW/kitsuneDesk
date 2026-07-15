const DEFAULTS = Object.freeze({
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
  local_telemetry_enabled: 0,
  startup_metrics_enabled: 0,
  startup_metrics_retention_days: 30,
  interface_language: 'pt-BR'
});

class SettingsRepository {
  constructor(database) {
    this.database = database;
  }

  findByUserId(userId) {
    return this.database.get('SELECT * FROM settings WHERE user_id = ?', [userId]);
  }

  createDefaultForUser(userId) {
    return this.database.run(
      `INSERT OR IGNORE INTO settings (
         user_id, default_language, default_quality, auto_play_next,
         player_volume, theme, default_provider, downloads_path,
         audio_preference, parental_control_enabled, max_content_rating,
         remember_position, check_updates, player_mode, local_telemetry_enabled,
         startup_metrics_enabled, startup_metrics_retention_days, interface_language
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        DEFAULTS.default_language,
        DEFAULTS.default_quality,
        DEFAULTS.auto_play_next,
        DEFAULTS.player_volume,
        DEFAULTS.theme,
        DEFAULTS.default_provider,
        DEFAULTS.downloads_path,
        DEFAULTS.audio_preference,
        DEFAULTS.parental_control_enabled,
        DEFAULTS.max_content_rating,
        DEFAULTS.remember_position,
        DEFAULTS.check_updates,
        DEFAULTS.player_mode,
        DEFAULTS.local_telemetry_enabled,
        DEFAULTS.startup_metrics_enabled,
        DEFAULTS.startup_metrics_retention_days,
        DEFAULTS.interface_language
      ]
    );
  }

  async update(userId, settings) {
    await this.createDefaultForUser(userId);
    return this.database.run(
      `UPDATE settings SET
         default_provider = ?, default_language = ?, default_quality = ?,
         auto_play_next = ?, player_volume = ?, theme = ?, downloads_path = ?,
         audio_preference = ?, parental_control_enabled = ?, max_content_rating = ?,
         remember_position = ?, check_updates = ?, player_mode = ?,
         local_telemetry_enabled = ?, startup_metrics_enabled = ?,
         startup_metrics_retention_days = ?, interface_language = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [
        settings.defaultProvider,
        settings.defaultLanguage,
        settings.defaultQuality,
        settings.autoPlayNext ? 1 : 0,
        settings.playerVolume,
        settings.theme,
        settings.downloadsPath,
        settings.audioPreference,
        settings.parentalControlEnabled ? 1 : 0,
        settings.maxContentRating,
        settings.rememberPosition ? 1 : 0,
        settings.checkUpdates ? 1 : 0,
        settings.playerMode,
        settings.localTelemetryEnabled ? 1 : 0,
        settings.startupMetricsEnabled ? 1 : 0,
        settings.startupMetricsRetentionDays,
        settings.interfaceLanguage || 'pt-BR',
        userId
      ]
    );
  }

  async updateParentalPin(userId, pinHash) {
    await this.createDefaultForUser(userId);
    return this.database.run(
      `UPDATE settings
       SET parental_pin_hash = ?, parental_control_enabled = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [pinHash, userId]
    );
  }
}

module.exports = SettingsRepository;
