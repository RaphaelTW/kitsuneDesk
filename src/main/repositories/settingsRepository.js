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
  ui_language: 'pt-BR',
  backup_frequency: 'off',
  backup_directory: '',
  backup_include_profiles: 0,
  backup_secret_encrypted: null,
  backup_last_run_at: null,
  backup_last_status: null
});

class SettingsRepository {
  constructor(database) {
    this.database = database;
  }

  findByUserId(userId) {
    return this.database.get('SELECT * FROM settings WHERE user_id = ?', [userId]);
  }

  createDefaultForUser(userId) {
    this.database.run(
      `INSERT OR IGNORE INTO settings (
         user_id, default_language, default_quality, auto_play_next,
         player_volume, theme, default_provider, downloads_path,
         audio_preference, parental_control_enabled, max_content_rating,
         remember_position, check_updates, player_mode, local_telemetry_enabled, ui_language, backup_frequency,
         backup_directory, backup_include_profiles
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        DEFAULTS.ui_language,
        DEFAULTS.backup_frequency,
        DEFAULTS.backup_directory,
        DEFAULTS.backup_include_profiles
      ]
    );
  }

  update(userId, settings) {
    this.createDefaultForUser(userId);
    return this.database.run(
      `UPDATE settings SET
         default_provider = ?, default_language = ?, default_quality = ?,
         auto_play_next = ?, player_volume = ?, theme = ?, downloads_path = ?,
         audio_preference = ?, parental_control_enabled = ?, max_content_rating = ?,
         remember_position = ?, check_updates = ?, player_mode = ?,
         local_telemetry_enabled = ?, ui_language = ?, backup_frequency = ?,
         backup_directory = ?, backup_include_profiles = ?, updated_at = CURRENT_TIMESTAMP
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
        settings.uiLanguage,
        settings.backupFrequency,
        settings.backupDirectory,
        settings.backupIncludeProfiles ? 1 : 0,
        userId
      ]
    );
  }

  updateBackupSecret(userId, encryptedSecret) {
    this.createDefaultForUser(userId);
    return this.database.run(
      `UPDATE settings
       SET backup_secret_encrypted = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [encryptedSecret || null, userId]
    );
  }

  updateBackupStatus(userId, status) {
    this.createDefaultForUser(userId);
    return this.database.run(
      `UPDATE settings
       SET backup_last_run_at = ?, backup_last_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [new Date().toISOString(), JSON.stringify(status || {}), userId]
    );
  }

  updateParentalPin(userId, pinHash) {
    this.createDefaultForUser(userId);
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
