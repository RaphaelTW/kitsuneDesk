const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AppError = require('../utils/AppError');
const { requireAdmin, requireUserId } = require('./authService');

const LIBRARY_FORMAT = 'kitsunedesk-library';
const PROFILE_FORMAT = 'kitsunedesk-profiles-encrypted';
const SCHEDULER_KEY_FILE = 'backup-scheduler.key';
const CADENCES = new Set(['daily', 'weekly', 'monthly']);

class BackupService {
  constructor({ app, database, sessionRepository }) {
    this.app = app;
    this.database = database;
    this.sessionRepository = sessionRepository;
  }

  async exportLibrary(filePath) {
    const userId = requireUserId(this.sessionRepository);
    const profile = await this.database.get(
      `SELECT id, username, name, role, profile_color, avatar_seed, avatar_style, parental_level
       FROM users WHERE id = ?`,
      [userId]
    );
    const [favorites, watchlist, history, playbackSessions, settings] = await Promise.all([
      this.database.all('SELECT * FROM favorites WHERE user_id = ?', [userId]),
      this.database.all('SELECT * FROM watchlist WHERE user_id = ?', [userId]),
      this.database.all('SELECT * FROM watch_history WHERE user_id = ?', [userId]),
      this.database.all('SELECT * FROM playback_sessions WHERE user_id = ?', [userId]),
      this.database.get('SELECT * FROM settings WHERE user_id = ?', [userId])
    ]);
    const payload = {
      format: LIBRARY_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: this.app.getVersion(),
      profile,
      data: {
        favorites,
        watchlist,
        history,
        playbackSessions,
        settings: sanitizeSettings(settings)
      }
    };
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return {
      exported: true,
      path: filePath,
      summary: summarizeLibrary(payload.data)
    };
  }

  async importLibrary(filePath, mode = 'merge') {
    const userId = requireUserId(this.sessionRepository);
    const payload = parseJsonFile(filePath);
    if (payload?.format !== LIBRARY_FORMAT || payload?.version !== 1) {
      throw new AppError('BACKUP_INVALID', 'O arquivo não é um backup de biblioteca válido.', {
        status: 400
      });
    }
    const importMode = mode === 'replace' ? 'replace' : 'merge';
    if (importMode === 'replace') {
      for (const table of ['favorites', 'watchlist', 'watch_history', 'playback_sessions']) {
        await this.database.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      }
    }

    await importCollection(this.database, 'favorites', userId, payload.data?.favorites);
    await importCollection(this.database, 'watchlist', userId, payload.data?.watchlist);
    await importHistory(this.database, userId, payload.data?.history);
    await importPlaybackSessions(this.database, userId, payload.data?.playbackSessions);
    if (payload.data?.settings) await importSettings(this.database, userId, payload.data.settings);

    return {
      imported: true,
      mode: importMode,
      path: filePath,
      summary: summarizeLibrary(payload.data || {}),
      themePreserved: true
    };
  }

  async exportProfilesEncrypted(filePath, password) {
    requireAdmin(this.sessionRepository);
    const secret = normalizeBackupPassword(password);
    const users = await this.database.all('SELECT * FROM users ORDER BY id');
    const usersWithSettings = await Promise.all(
      users.map(async (user) => ({
        ...user,
        settings: await this.database.get('SELECT * FROM settings WHERE user_id = ?', [user.id])
      }))
    );
    const payload = {
      format: 'kitsunedesk-profiles',
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: this.app.getVersion(),
      users: usersWithSettings
    };
    const encrypted = encryptPayload(payload, secret);
    await fs.promises.writeFile(filePath, JSON.stringify(encrypted, null, 2), 'utf8');
    return { exported: true, path: filePath, profiles: users.length, encrypted: true };
  }

  async importProfilesEncrypted(filePath, password) {
    const currentAdmin = requireAdmin(this.sessionRepository);
    const payload = (await this.validateProfilesEncrypted(filePath, password)).payload;

    let imported = 0;
    let updated = 0;
    for (const profile of payload.users) {
      const username = String(profile.username || '')
        .trim()
        .toLowerCase();
      if (!username) continue;
      const protectsCurrentAdmin = username === currentAdmin.username;
      const existing = await this.database.get('SELECT id FROM users WHERE username = ?', [
        username
      ]);
      let userId;
      if (existing) {
        userId = existing.id;
        await this.database.run(
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
        const result = await this.database.run(
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
      if (profile.settings) await importSettings(this.database, userId, profile.settings);
    }

    const activeAdminRow = await this.database.get(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND active = 1"
    );
    const activeAdmins = Number(activeAdminRow?.total || 0);
    if (activeAdmins === 0) {
      await this.database.run(
        "UPDATE users SET role = 'ADMIN', active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [currentAdmin.id]
      );
    }
    return {
      imported: true,
      createdProfiles: imported,
      updatedProfiles: updated,
      themePreserved: true
    };
  }

  validateProfilesEncrypted(filePath, password) {
    requireAdmin(this.sessionRepository);
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
    if (payload?.format !== 'kitsunedesk-profiles' || !Array.isArray(payload.users)) {
      throw new AppError('BACKUP_INVALID', 'O conteúdo do backup não é válido.', { status: 400 });
    }
    return {
      valid: true,
      payload,
      profiles: payload.users.length,
      exportedAt: payload.exportedAt || null,
      appVersion: payload.appVersion || null
    };
  }

  async listSchedules() {
    const userId = requireUserId(this.sessionRepository);
    return (
      await this.database.all(
        `SELECT id, kind, target_path, cadence, validate_restore, enabled,
                last_run_at, last_status, last_error, created_at, updated_at
         FROM backup_schedules WHERE user_id = ? ORDER BY updated_at DESC`,
        [userId]
      )
    ).map(mapScheduleRow);
  }

  async scheduleProfilesBackup(payload) {
    requireAdmin(this.sessionRepository);
    const userId = requireUserId(this.sessionRepository);
    const targetPath = normalizeBackupDirectory(payload?.directory || payload?.targetPath);
    const cadence = CADENCES.has(payload?.cadence) ? payload.cadence : 'daily';
    const password = normalizeBackupPassword(payload?.password);
    const validateRestore = payload?.validateRestore !== false;
    await fs.promises.mkdir(targetPath, { recursive: true });
    const secret = encryptSchedulerSecret(password, getSchedulerKey(this.app));

    const existing = await this.database.get(
      "SELECT id FROM backup_schedules WHERE user_id = ? AND kind = 'profiles'",
      [userId]
    );
    if (existing) {
      await this.database.run(
        `UPDATE backup_schedules SET
           target_path = ?, cadence = ?, password_secret = ?, validate_restore = ?, enabled = 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [targetPath, cadence, secret, validateRestore ? 1 : 0, existing.id, userId]
      );
    } else {
      await this.database.run(
        `INSERT INTO backup_schedules (
           user_id, kind, target_path, cadence, password_secret, validate_restore, enabled
         ) VALUES (?, 'profiles', ?, ?, ?, ?, 1)`,
        [userId, targetPath, cadence, secret, validateRestore ? 1 : 0]
      );
    }

    return {
      scheduled: true,
      schedule: (
        await this.database.all(
          `SELECT id, kind, target_path, cadence, validate_restore, enabled,
                  last_run_at, last_status, last_error, created_at, updated_at
           FROM backup_schedules WHERE user_id = ? AND kind = 'profiles'`,
          [userId]
        )
      ).map(mapScheduleRow)[0]
    };
  }

  async runScheduledProfilesBackup(payload = {}) {
    requireAdmin(this.sessionRepository);
    const userId = requireUserId(this.sessionRepository);
    const schedule = await this.findScheduleForRun(userId, payload?.scheduleId);
    if (!schedule) {
      throw new AppError('BACKUP_SCHEDULE_NOT_FOUND', 'Nenhuma agenda de perfis foi configurada.', {
        status: 404
      });
    }
    return this.executeSchedule(schedule, { force: true });
  }

  async runDueSchedules() {
    requireAdmin(this.sessionRepository);
    const userId = requireUserId(this.sessionRepository);
    const rows = await this.database.all(
      `SELECT * FROM backup_schedules
       WHERE user_id = ? AND enabled = 1 AND kind = 'profiles'
       ORDER BY updated_at DESC`,
      [userId]
    );
    const results = [];
    for (const row of rows) {
      if (!isScheduleDue(row)) continue;
      results.push(await this.executeSchedule(row, { force: false }));
    }
    return { checked: true, executed: results.length, results };
  }

  findScheduleForRun(userId, scheduleId) {
    if (scheduleId) {
      return this.database.get('SELECT * FROM backup_schedules WHERE id = ? AND user_id = ?', [
        Number(scheduleId),
        userId
      ]);
    }
    return this.database.get(
      "SELECT * FROM backup_schedules WHERE user_id = ? AND kind = 'profiles' ORDER BY updated_at DESC LIMIT 1",
      [userId]
    );
  }

  async executeSchedule(schedule, { force }) {
    if (!force && !isScheduleDue(schedule)) {
      return { skipped: true, reason: 'not-due', schedule: mapScheduleRow(schedule) };
    }

    const password = decryptSchedulerSecret(schedule.password_secret, getSchedulerKey(this.app));
    const fileName = `kitsunedesk-perfis-agendado-${timestampForFile(new Date())}.kitsunebackup`;
    const filePath = path.join(schedule.target_path, fileName);
    try {
      await fs.promises.mkdir(schedule.target_path, { recursive: true });
      const exported = await this.exportProfilesEncrypted(filePath, password);
      let validation = null;
      if (schedule.validate_restore) {
        const checked = await this.validateProfilesEncrypted(filePath, password);
        validation = {
          valid: checked.valid,
          profiles: checked.profiles,
          exportedAt: checked.exportedAt,
          appVersion: checked.appVersion
        };
      }
      await this.database.run(
        `UPDATE backup_schedules SET
           last_run_at = CURRENT_TIMESTAMP, last_status = 'success', last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [schedule.id]
      );
      return {
        executed: true,
        path: exported.path,
        profiles: exported.profiles,
        validation,
        schedule: mapScheduleRow({ ...schedule, last_status: 'success' })
      };
    } catch (error) {
      await this.database.run(
        `UPDATE backup_schedules SET
           last_run_at = CURRENT_TIMESTAMP, last_status = 'error', last_error = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error.publicMessage || error.message || String(error), schedule.id]
      );
      throw error;
    }
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

function normalizeBackupDirectory(value) {
  const candidate = path.resolve(String(value || '').trim());
  if (!candidate) {
    throw new AppError('BACKUP_PATH_INVALID', 'Escolha uma pasta para salvar os backups.', {
      status: 400
    });
  }
  return candidate;
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
  delete safe.id;
  delete safe.user_id;
  return safe;
}

async function importCollection(database, table, userId, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, 10000)) {
    await database.run(
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

async function importHistory(database, userId, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, 25000)) {
    await database.run(
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

async function importPlaybackSessions(database, userId, rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows.slice(0, 5000)) {
    await database.run(
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

async function importSettings(database, userId, settings) {
  const current = await database.get('SELECT theme FROM settings WHERE user_id = ?', [userId]);
  const preservedTheme = current?.theme || settings.theme || 'dark';
  await database.run(
    `INSERT INTO settings (
       user_id, default_language, default_quality, auto_play_next, player_volume, theme,
       default_provider, downloads_path, audio_preference, parental_control_enabled,
       parental_pin_hash, max_content_rating, remember_position, check_updates,
       player_mode, local_telemetry_enabled, startup_metrics_enabled, interface_language,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       default_language = excluded.default_language,
       default_quality = excluded.default_quality,
       auto_play_next = excluded.auto_play_next,
       player_volume = excluded.player_volume,
       theme = settings.theme,
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
       startup_metrics_enabled = excluded.startup_metrics_enabled,
       interface_language = excluded.interface_language,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      settings.default_language || 'sub',
      settings.default_quality || 'auto',
      settings.auto_play_next ? 1 : 0,
      Number(settings.player_volume ?? 80),
      preservedTheme,
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
      settings.startup_metrics_enabled ? 1 : 0,
      settings.interface_language || 'pt-BR'
    ]
  );
}

function getSchedulerKey(app) {
  const filePath = path.join(app.getPath('userData'), SCHEDULER_KEY_FILE);
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const key = crypto.randomBytes(32);
    fs.writeFileSync(filePath, key, { mode: 0o600 });
    return key;
  } catch (error) {
    throw new AppError('BACKUP_KEY_FAILED', 'Não foi possível acessar a chave local de backup.', {
      status: 500,
      technicalMessage: error.message
    });
  }
}

function encryptSchedulerSecret(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  });
}

function decryptSchedulerSecret(container, key) {
  try {
    const parsed = JSON.parse(container);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch (error) {
    throw new AppError('BACKUP_SECRET_INVALID', 'A senha salva da agenda não pôde ser lida.', {
      status: 500,
      technicalMessage: error.message
    });
  }
}

function isScheduleDue(row) {
  if (!row?.enabled) return false;
  if (!row.last_run_at) return true;
  const last = new Date(row.last_run_at).getTime();
  if (!Number.isFinite(last)) return true;
  const age = Date.now() - last;
  const day = 24 * 60 * 60 * 1000;
  const cadence = row.cadence || 'daily';
  if (cadence === 'weekly') return age >= 7 * day;
  if (cadence === 'monthly') return age >= 30 * day;
  return age >= day;
}

function timestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function mapScheduleRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    targetPath: row.target_path,
    cadence: row.cadence,
    validateRestore: Boolean(row.validate_restore),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at || null,
    lastStatus: row.last_status || null,
    lastError: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = BackupService;
module.exports.encryptPayload = encryptPayload;
module.exports.decryptPayload = decryptPayload;
module.exports.testHelpers = {
  isScheduleDue,
  mapScheduleRow,
  normalizeBackupPassword,
  timestampForFile
};
