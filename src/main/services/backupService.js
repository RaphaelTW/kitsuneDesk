const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AppError = require('../utils/AppError');

const LIBRARY_FORMAT = 'kitsunedesk-library';
const PROFILE_FORMAT = 'kitsunedesk-profiles-encrypted';
const PROFILE_PAYLOAD_FORMAT = 'kitsunedesk-profiles';
const BACKUP_FREQUENCIES = new Set(['off', 'daily', 'weekly', 'monthly']);
const SCHEDULE_INTERVAL_MS = Object.freeze({
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
});

class BackupService {
  constructor({ app, database, sessionRepository }) {
    this.app = app;
    this.database = database;
    this.sessionRepository = sessionRepository;
  }

  exportLibrary(filePath) {
    const userId = getAuthHelpers().requireUserId(this.sessionRepository);
    const payload = this.createLibraryPayload(userId);
    writeJson(filePath, payload);
    return {
      exported: true,
      path: filePath,
      summary: summarizeLibrary(payload.data)
    };
  }

  importLibrary(filePath, mode = 'merge') {
    const userId = getAuthHelpers().requireUserId(this.sessionRepository);
    const validation = this.validateLibraryBackup(filePath);
    const payload = validation.payload;
    const importMode = mode === 'replace' ? 'replace' : 'merge';
    if (importMode === 'replace') {
      for (const table of ['favorites', 'watchlist', 'watch_history', 'playback_sessions']) {
        this.database.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      }
    }

    importCollection(this.database, 'favorites', userId, payload.data?.favorites);
    importCollection(this.database, 'watchlist', userId, payload.data?.watchlist);
    importHistory(this.database, userId, payload.data?.history);
    importPlaybackSessions(this.database, userId, payload.data?.playbackSessions);
    if (payload.data?.settings) importSettings(this.database, userId, payload.data.settings);

    return {
      imported: true,
      mode: importMode,
      path: filePath,
      summary: validation.summary
    };
  }

  exportProfilesEncrypted(filePath, password) {
    getAuthHelpers().requireAdmin(this.sessionRepository);
    const secret = normalizeBackupPassword(password);
    const result = this.writeProfilesEncrypted(filePath, secret);
    this.validateProfilesBackup(filePath, secret);
    return result;
  }

  importProfilesEncrypted(filePath, password) {
    const currentAdmin = getAuthHelpers().requireAdmin(this.sessionRepository);
    const secret = normalizeBackupPassword(password);
    const validation = this.validateProfilesBackup(filePath, secret);
    const payload = validation.payload;

    let imported = 0;
    let updated = 0;
    for (const profile of payload.users) {
      const username = String(profile.username || '')
        .trim()
        .toLowerCase();
      if (!username) continue;
      const protectsCurrentAdmin = username === currentAdmin.username;
      const existing = this.database.get('SELECT id FROM users WHERE username = ?', [username]);
      let userId;
      if (existing) {
        userId = existing.id;
        this.database.run(
          `UPDATE users SET
             password_hash = ?, name = ?, role = ?, must_change_password = ?, active = ?,
             profile_color = ?, avatar_seed = ?, avatar_style = ?, parental_level = ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            profile.password_hash,
            profile.name,
            protectsCurrentAdmin || profile.role === 'ADMIN' ? 'ADMIN' : 'USER',
            profile.must_change_password ? 1 : 0,
            protectsCurrentAdmin ? 1 : profile.active ? 1 : 0,
            profile.profile_color || '#6f5cff',
            profile.avatar_seed || username,
            profile.avatar_style || 'thumbs',
            profile.parental_level || 'ADULT',
            userId
          ]
        );
        updated += 1;
      } else {
        const result = this.database.run(
          `INSERT INTO users (
             username, password_hash, name, role, must_change_password, active,
             profile_color, avatar_seed, avatar_style, parental_level
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            username,
            profile.password_hash,
            profile.name || username,
            protectsCurrentAdmin || profile.role === 'ADMIN' ? 'ADMIN' : 'USER',
            profile.must_change_password ? 1 : 0,
            protectsCurrentAdmin ? 1 : profile.active ? 1 : 0,
            profile.profile_color || '#6f5cff',
            profile.avatar_seed || username,
            profile.avatar_style || 'thumbs',
            profile.parental_level || 'ADULT'
          ]
        );
        userId = result.lastInsertRowid;
        imported += 1;
      }
      if (profile.settings) importSettings(this.database, userId, profile.settings);
    }

    const activeAdmins = Number(
      this.database.get("SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND active = 1")
        ?.total || 0
    );
    if (activeAdmins === 0) {
      this.database.run(
        "UPDATE users SET role = 'ADMIN', active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [currentAdmin.id]
      );
    }
    return { imported: true, createdProfiles: imported, updatedProfiles: updated };
  }

  scheduleStatus() {
    const userId = getAuthHelpers().requireUserId(this.sessionRepository);
    const row = this.getSettingsRow(userId);
    return mapSchedule(row, this.defaultBackupDirectory());
  }

  configureSchedule(payload = {}) {
    const userId = getAuthHelpers().requireUserId(this.sessionRepository);
    const current = this.getSettingsRow(userId);
    const frequency = BACKUP_FREQUENCIES.has(payload.frequency)
      ? payload.frequency
      : current.backup_frequency || 'off';
    const directory = normalizeDirectory(payload.directory || current.backup_directory);
    const includeProfiles = Boolean(payload.includeProfiles);
    let encryptedSecret = current.backup_secret_encrypted || null;

    if (includeProfiles) {
      getAuthHelpers().requireAdmin(this.sessionRepository);
      if (payload.password) {
        encryptedSecret = protectLocalSecret(normalizeBackupPassword(payload.password));
      }
      if (!encryptedSecret) {
        throw new AppError(
          'BACKUP_PASSWORD_REQUIRED',
          'Informe uma senha para ativar backup criptografado de perfis no agendamento.',
          { status: 400 }
        );
      }
    } else if (payload.clearProfilePassword) {
      encryptedSecret = null;
    }

    this.database.run(
      `UPDATE settings
       SET backup_frequency = ?, backup_directory = ?, backup_include_profiles = ?,
           backup_secret_encrypted = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [frequency, directory, includeProfiles ? 1 : 0, encryptedSecret, userId]
    );
    return this.scheduleStatus();
  }

  runScheduledBackup(payload = {}) {
    const userId = getAuthHelpers().requireUserId(this.sessionRepository);
    const row = this.getSettingsRow(userId);
    const schedule = mapSchedule(row, this.defaultBackupDirectory());
    const force = Boolean(payload.force);

    if (schedule.frequency === 'off') {
      return { skipped: true, reason: 'Agendamento desativado.', schedule };
    }
    if (!force && !isBackupDue(schedule.frequency, row.backup_last_run_at)) {
      return { skipped: true, reason: 'Backup ainda dentro da janela configurada.', schedule };
    }

    const directory = schedule.directory || this.defaultBackupDirectory();
    fs.mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const libraryPath = path.join(directory, `kitsunedesk-biblioteca-auto-${stamp}.json`);
    const libraryPayload = this.createLibraryPayload(userId);
    writeJson(libraryPath, libraryPayload);
    const libraryValidation = this.validateLibraryBackup(libraryPath);

    const status = {
      ok: true,
      ranAt: new Date().toISOString(),
      library: {
        path: libraryPath,
        valid: libraryValidation.valid,
        summary: libraryValidation.summary
      },
      profiles: null
    };

    if (schedule.includeProfiles) {
      try {
        getAuthHelpers().requireAdmin(this.sessionRepository);
        const password = unprotectLocalSecret(row.backup_secret_encrypted);
        const profilePath = path.join(directory, `kitsunedesk-perfis-auto-${stamp}.kitsunebackup`);
        const profileResult = this.writeProfilesEncrypted(profilePath, password);
        const profileValidation = this.validateProfilesBackup(profilePath, password);
        status.profiles = {
          path: profilePath,
          valid: profileValidation.valid,
          profiles: profileResult.profiles
        };
      } catch (error) {
        status.ok = false;
        status.profiles = {
          valid: false,
          message: error.publicMessage || error.message || 'Falha no backup de perfis.'
        };
      }
    }

    this.database.run(
      `UPDATE settings
       SET backup_last_run_at = ?, backup_last_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [status.ranAt, JSON.stringify(status), userId]
    );

    return { backedUp: true, schedule: this.scheduleStatus(), ...status };
  }

  validateLibraryBackup(filePath) {
    const payload = parseJsonFile(filePath);
    if (payload?.format !== LIBRARY_FORMAT || payload?.version !== 1) {
      throw new AppError('BACKUP_INVALID', 'O arquivo não é um backup de biblioteca válido.', {
        status: 400
      });
    }
    return { valid: true, path: filePath, payload, summary: summarizeLibrary(payload.data || {}) };
  }

  validateProfilesBackup(filePath, password) {
    const secret = normalizeBackupPassword(password);
    const container = parseJsonFile(filePath);
    if (container?.format !== PROFILE_FORMAT || container?.version !== 1) {
      throw new AppError('BACKUP_INVALID', 'O arquivo criptografado não é compatível.', {
        status: 400
      });
    }
    let payload;
    try {
      payload = decryptPayload(container, secret);
    } catch (error) {
      throw new AppError('BACKUP_PASSWORD_INVALID', 'Senha incorreta ou backup alterado.', {
        status: 401,
        technicalMessage: error.message
      });
    }
    if (payload?.format !== PROFILE_PAYLOAD_FORMAT || !Array.isArray(payload.users)) {
      throw new AppError('BACKUP_INVALID', 'O conteúdo do backup não é válido.', { status: 400 });
    }
    return { valid: true, path: filePath, payload, profiles: payload.users.length };
  }

  createLibraryPayload(userId) {
    const profile = this.database.get(
      `SELECT id, username, name, role, profile_color, avatar_seed, avatar_style, parental_level
       FROM users WHERE id = ?`,
      [userId]
    );
    return {
      format: LIBRARY_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: this.app.getVersion(),
      profile,
      data: {
        favorites: this.database.all('SELECT * FROM favorites WHERE user_id = ?', [userId]),
        watchlist: this.database.all('SELECT * FROM watchlist WHERE user_id = ?', [userId]),
        history: this.database.all('SELECT * FROM watch_history WHERE user_id = ?', [userId]),
        playbackSessions: this.database.all('SELECT * FROM playback_sessions WHERE user_id = ?', [
          userId
        ]),
        settings: sanitizeSettings(
          this.database.get('SELECT * FROM settings WHERE user_id = ?', [userId])
        )
      }
    };
  }

  writeProfilesEncrypted(filePath, password) {
    const users = this.database.all('SELECT * FROM users ORDER BY id');
    const payload = {
      format: PROFILE_PAYLOAD_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: this.app.getVersion(),
      users: users.map((user) => ({
        ...user,
        settings: sanitizeSettings(
          this.database.get('SELECT * FROM settings WHERE user_id = ?', [user.id])
        )
      }))
    };
    const encrypted = encryptPayload(payload, password);
    writeJson(filePath, encrypted);
    return { exported: true, path: filePath, profiles: users.length, encrypted: true };
  }

  getSettingsRow(userId) {
    return this.database.get('SELECT * FROM settings WHERE user_id = ?', [userId]) || {};
  }

  defaultBackupDirectory() {
    return path.join(this.app.getPath('userData'), 'backups');
  }
}

function encryptPayload(payload, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    format: PROFILE_FORMAT,
    version: 1,
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptPayload(container, password) {
  const salt = Buffer.from(container.salt, 'base64');
  const iv = Buffer.from(container.iv, 'base64');
  const tag = Buffer.from(container.tag, 'base64');
  const encrypted = Buffer.from(container.data, 'base64');
  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}

function normalizeBackupPassword(value) {
  const password = String(value || '');
  if (password.length < 8) {
    throw new AppError(
      'BACKUP_PASSWORD_WEAK',
      'Use uma senha de backup com pelo menos 8 caracteres.',
      {
        status: 400
      }
    );
  }
  return password;
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new AppError('BACKUP_READ_FAILED', 'Não foi possível ler o arquivo de backup.', {
      status: 400,
      technicalMessage: error.message
    });
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function summarizeLibrary(data) {
  return {
    favorites: Array.isArray(data?.favorites) ? data.favorites.length : 0,
    watchlist: Array.isArray(data?.watchlist) ? data.watchlist.length : 0,
    history: Array.isArray(data?.history) ? data.history.length : 0,
    playbackSessions: Array.isArray(data?.playbackSessions) ? data.playbackSessions.length : 0
  };
}

function sanitizeSettings(settings) {
  if (!settings) return null;
  const safe = { ...settings };
  delete safe.parental_pin_hash;
  delete safe.backup_secret_encrypted;
  delete safe.id;
  delete safe.user_id;
  return safe;
}

function importCollection(database, table, userId, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, 10000)) {
    database.run(
      `INSERT INTO ${table} (
         user_id, provider_id, anime_id, anime_title, anime_cover, anime_payload, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider_id, anime_id) DO UPDATE SET
         anime_title = excluded.anime_title,
         anime_cover = excluded.anime_cover,
         anime_payload = excluded.anime_payload`,
      [
        userId,
        row.provider_id || 'goanime-gui',
        row.anime_id,
        row.anime_title,
        row.anime_cover || '',
        row.anime_payload || '{}',
        row.created_at || new Date().toISOString()
      ]
    );
  }
}

function importHistory(database, userId, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, 25000)) {
    database.run(
      `INSERT INTO watch_history (
         user_id, provider_id, anime_id, anime_title, anime_cover, episode_number,
         episode_title, language, quality, playback_position, duration, completed,
         source, anime_payload, episode_payload, watched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        row.provider_id || 'goanime-gui',
        row.anime_id,
        row.anime_title,
        row.anime_cover || '',
        Number(row.episode_number || 1),
        row.episode_title || '',
        row.language === 'dub' ? 'dub' : 'sub',
        row.quality || 'auto',
        Number(row.playback_position || 0),
        Number(row.duration || 0),
        row.completed ? 1 : 0,
        row.source || '',
        row.anime_payload || '{}',
        row.episode_payload || '{}',
        row.watched_at || new Date().toISOString()
      ]
    );
  }
}

function importPlaybackSessions(database, userId, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, 5000)) {
    database.run(
      `INSERT INTO playback_sessions (
         user_id, provider_id, anime_id, anime_title, anime_cover, current_episode,
         episode_title, language, quality, playback_position, duration, source,
         anime_payload, episode_payload, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider_id, anime_id, language) DO UPDATE SET
         anime_title = excluded.anime_title,
         anime_cover = excluded.anime_cover,
         current_episode = excluded.current_episode,
         episode_title = excluded.episode_title,
         quality = excluded.quality,
         playback_position = excluded.playback_position,
         duration = excluded.duration,
         source = excluded.source,
         anime_payload = excluded.anime_payload,
         episode_payload = excluded.episode_payload,
         updated_at = excluded.updated_at`,
      [
        userId,
        row.provider_id || 'goanime-gui',
        row.anime_id,
        row.anime_title,
        row.anime_cover || '',
        Number(row.current_episode || 1),
        row.episode_title || '',
        row.language === 'dub' ? 'dub' : 'sub',
        row.quality || 'auto',
        Number(row.playback_position || 0),
        Number(row.duration || 0),
        row.source || '',
        row.anime_payload || '{}',
        row.episode_payload || '{}',
        row.updated_at || new Date().toISOString()
      ]
    );
  }
}

function importSettings(database, userId, settings) {
  database.run(
    `INSERT INTO settings (
       user_id, default_language, default_quality, auto_play_next, player_volume, theme,
       default_provider, downloads_path, audio_preference, parental_control_enabled,
       parental_pin_hash, max_content_rating, remember_position, check_updates,
       player_mode, local_telemetry_enabled, ui_language, backup_frequency,
       backup_directory, backup_include_profiles, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       default_language = excluded.default_language,
       default_quality = excluded.default_quality,
       auto_play_next = excluded.auto_play_next,
       player_volume = excluded.player_volume,
       theme = excluded.theme,
       default_provider = excluded.default_provider,
       downloads_path = excluded.downloads_path,
       audio_preference = excluded.audio_preference,
       parental_control_enabled = excluded.parental_control_enabled,
       parental_pin_hash = COALESCE(excluded.parental_pin_hash, settings.parental_pin_hash),
       max_content_rating = excluded.max_content_rating,
       remember_position = excluded.remember_position,
       check_updates = excluded.check_updates,
       player_mode = excluded.player_mode,
       local_telemetry_enabled = excluded.local_telemetry_enabled,
       ui_language = excluded.ui_language,
       backup_frequency = excluded.backup_frequency,
       backup_directory = excluded.backup_directory,
       backup_include_profiles = excluded.backup_include_profiles,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      settings.default_language || 'sub',
      settings.default_quality || 'auto',
      settings.auto_play_next ? 1 : 0,
      Number(settings.player_volume ?? 80),
      settings.theme || 'dark',
      settings.default_provider || 'goanime-gui',
      settings.downloads_path || '',
      settings.audio_preference || 'sub',
      settings.parental_control_enabled ? 1 : 0,
      settings.parental_pin_hash || null,
      settings.max_content_rating || '18',
      settings.remember_position !== 0 ? 1 : 0,
      settings.check_updates !== 0 ? 1 : 0,
      settings.player_mode === 'embedded' ? 'embedded' : 'external',
      settings.local_telemetry_enabled ? 1 : 0,
      settings.ui_language === 'en-US' ? 'en-US' : 'pt-BR',
      BACKUP_FREQUENCIES.has(settings.backup_frequency) ? settings.backup_frequency : 'off',
      settings.backup_directory || '',
      settings.backup_include_profiles ? 1 : 0
    ]
  );
}

function normalizeDirectory(value) {
  const directory = String(value || '').trim();
  return directory ? path.normalize(directory).slice(0, 500) : '';
}

function getAuthHelpers() {
  return require('./authService');
}

function mapSchedule(row, fallbackDirectory) {
  const lastStatus = parseStatus(row?.backup_last_status);
  return {
    frequency: BACKUP_FREQUENCIES.has(row?.backup_frequency) ? row.backup_frequency : 'off',
    directory: row?.backup_directory || fallbackDirectory,
    includeProfiles: Boolean(row?.backup_include_profiles),
    profileSecretConfigured: Boolean(row?.backup_secret_encrypted),
    lastRunAt: row?.backup_last_run_at || null,
    lastStatus,
    nextRunAt: nextRunAt(row?.backup_frequency, row?.backup_last_run_at)
  };
}

function parseStatus(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return { ok: false, message: String(value) };
  }
}

function isBackupDue(frequency, lastRunAt) {
  if (frequency === 'off') return false;
  const interval = SCHEDULE_INTERVAL_MS[frequency];
  if (!interval) return false;
  const last = Date.parse(lastRunAt || '');
  return !Number.isFinite(last) || Date.now() - last >= interval;
}

function nextRunAt(frequency, lastRunAt) {
  if (frequency === 'off') return null;
  const interval = SCHEDULE_INTERVAL_MS[frequency];
  if (!interval) return null;
  const last = Date.parse(lastRunAt || '');
  if (!Number.isFinite(last)) return new Date().toISOString();
  return new Date(last + interval).toISOString();
}

function getSafeStorage() {
  try {
    return require('electron').safeStorage;
  } catch {
    return null;
  }
}

function protectLocalSecret(secret) {
  const safeStorage = getSafeStorage();
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new AppError(
      'BACKUP_SECRET_UNAVAILABLE',
      'O Windows não liberou o cofre local para salvar a senha do backup agendado.',
      { status: 424 }
    );
  }
  return Buffer.from(safeStorage.encryptString(secret)).toString('base64');
}

function unprotectLocalSecret(value) {
  const safeStorage = getSafeStorage();
  if (!value || !safeStorage?.isEncryptionAvailable?.()) {
    throw new AppError(
      'BACKUP_SECRET_UNAVAILABLE',
      'A senha local do backup agendado não está disponível.',
      { status: 424 }
    );
  }
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

module.exports = BackupService;
module.exports.encryptPayload = encryptPayload;
module.exports.decryptPayload = decryptPayload;
module.exports.testHelpers = {
  isBackupDue,
  nextRunAt,
  mapSchedule,
  sanitizeSettings
};
