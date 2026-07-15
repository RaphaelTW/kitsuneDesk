const migrations = [
  {
    id: 1,
    name: 'create-initial-schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        must_change_password INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        default_language TEXT NOT NULL DEFAULT 'sub',
        default_quality TEXT NOT NULL DEFAULT 'auto',
        auto_play_next INTEGER NOT NULL DEFAULT 0,
        player_volume INTEGER NOT NULL DEFAULT 80,
        theme TEXT NOT NULL DEFAULT 'dark',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS watch_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        anime_id TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        anime_cover TEXT,
        episode_number REAL NOT NULL,
        language TEXT NOT NULL,
        quality TEXT,
        playback_position INTEGER NOT NULL DEFAULT 0,
        duration INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        watched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS playback_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        anime_id TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        current_episode REAL NOT NULL,
        language TEXT NOT NULL,
        quality TEXT NOT NULL,
        playback_position INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS application_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        message TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_watch_history_anime_id ON watch_history(anime_id);
      CREATE INDEX IF NOT EXISTS idx_playback_sessions_user_id ON playback_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_playback_sessions_anime_id ON playback_sessions(anime_id);
    `
  },
  {
    id: 2,
    name: 'library-settings-security',
    sql: `
      ALTER TABLE users ADD COLUMN profile_color TEXT NOT NULL DEFAULT '#6f5cff';
      ALTER TABLE users ADD COLUMN parental_level TEXT NOT NULL DEFAULT 'ADULT';

      ALTER TABLE settings ADD COLUMN default_provider TEXT NOT NULL DEFAULT 'goanime-gui';
      ALTER TABLE settings ADD COLUMN downloads_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE settings ADD COLUMN audio_preference TEXT NOT NULL DEFAULT 'sub';
      ALTER TABLE settings ADD COLUMN parental_control_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE settings ADD COLUMN parental_pin_hash TEXT;
      ALTER TABLE settings ADD COLUMN max_content_rating TEXT NOT NULL DEFAULT '18';
      ALTER TABLE settings ADD COLUMN remember_position INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE settings ADD COLUMN check_updates INTEGER NOT NULL DEFAULT 1;

      ALTER TABLE playback_sessions ADD COLUMN anime_cover TEXT;
      ALTER TABLE playback_sessions ADD COLUMN episode_title TEXT;
      ALTER TABLE playback_sessions ADD COLUMN duration INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE playback_sessions ADD COLUMN source TEXT;

      ALTER TABLE watch_history ADD COLUMN episode_title TEXT;
      ALTER TABLE watch_history ADD COLUMN source TEXT;

      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        anime_id TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        anime_cover TEXT,
        anime_payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, provider_id, anime_id)
      );

      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        anime_id TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        anime_cover TEXT,
        anime_payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, provider_id, anime_id)
      );

      CREATE TABLE IF NOT EXISTS episode_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        anime_id TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        episode_number REAL NOT NULL,
        language TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        source TEXT,
        error_code TEXT,
        technical_error TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS login_security (
        username TEXT PRIMARY KEY,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reports_user ON episode_reports(user_id, created_at DESC);

      DELETE FROM settings
      WHERE id NOT IN (SELECT MIN(id) FROM settings GROUP BY user_id);
      DELETE FROM playback_sessions
      WHERE id NOT IN (
        SELECT MAX(id) FROM playback_sessions
        GROUP BY user_id, provider_id, anime_id, language
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_unique ON settings(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_playback_session_unique
        ON playback_sessions(user_id, provider_id, anime_id, language);
    `
  },
  {
    id: 3,
    name: 'history-uniqueness-and-app-state',
    sql: `
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_history_latest
        ON watch_history(user_id, watched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_latest
        ON playback_sessions(user_id, updated_at DESC);
    `
  },
  {
    id: 4,
    name: 'playback-payloads',
    sql: `
      ALTER TABLE playback_sessions ADD COLUMN anime_payload TEXT;
      ALTER TABLE playback_sessions ADD COLUMN episode_payload TEXT;
      ALTER TABLE watch_history ADD COLUMN anime_payload TEXT;
      ALTER TABLE watch_history ADD COLUMN episode_payload TEXT;
    `
  },
  {
    id: 5,
    name: 'player-window-preference',
    sql: `
      ALTER TABLE settings ADD COLUMN player_mode TEXT NOT NULL DEFAULT 'external';
    `
  },
  {
    id: 6,
    name: 'stable-external-player',
    sql: `
      UPDATE settings SET player_mode = 'external' WHERE player_mode <> 'external';
    `
  },
  {
    id: 7,
    name: 'default-admin-avatars-local-telemetry',
    sql: `
      ALTER TABLE users ADD COLUMN avatar_seed TEXT;
      ALTER TABLE users ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'thumbs';

      ALTER TABLE settings ADD COLUMN local_telemetry_enabled INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS failure_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        scope TEXT NOT NULL,
        event TEXT NOT NULL,
        message TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_failure_telemetry_user_created
        ON failure_telemetry(user_id, created_at DESC);
    `
  },
  {
    id: 8,
    name: 'cache-and-backup-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS cache_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        stale_until TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(namespace, cache_key)
      );

      CREATE INDEX IF NOT EXISTS idx_cache_expiration
        ON cache_entries(stale_until);
      CREATE INDEX IF NOT EXISTS idx_cache_access
        ON cache_entries(last_accessed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_failure_telemetry_filters
        ON failure_telemetry(user_id, scope, event, created_at DESC);
    `
  },
  {
    id: 9,
    name: 'v0130-backup-schedules-and-i18n',
    sql: `
      CREATE TABLE IF NOT EXISTS backup_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'profiles',
        target_path TEXT NOT NULL,
        cadence TEXT NOT NULL DEFAULT 'daily',
        password_secret TEXT NOT NULL,
        validate_restore INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        last_status TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, kind)
      );

      CREATE INDEX IF NOT EXISTS idx_backup_schedules_due
        ON backup_schedules(user_id, enabled, kind, last_run_at);
    `
  },
  {
    id: 10,
    name: 'v0140-startup-performance-metrics',
    sql: `
      ALTER TABLE settings ADD COLUMN startup_metrics_enabled INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS startup_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        shell_ready_ms INTEGER NOT NULL,
        core_ready_ms INTEGER NOT NULL,
        snapshot_restored INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_startup_performance_user_created
        ON startup_performance(user_id, created_at DESC);
    `
  }
];

/**
 * @param {import('better-sqlite3').Database} database
 */
function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hasMigration = database.prepare('SELECT id FROM schema_migrations WHERE id = ?');
  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (id, name) VALUES (?, ?)'
  );

  const transaction = database.transaction(() => {
    for (const migration of migrations) {
      if (hasMigration.get(migration.id)) {
        continue;
      }

      database.exec(migration.sql);
      insertMigration.run(migration.id, migration.name);
    }
  });

  transaction();
  repairPortableSchema(database);
}

function repairPortableSchema(database) {
  ensureColumn(database, 'users', 'profile_color', "TEXT NOT NULL DEFAULT '#6f5cff'");
  ensureColumn(database, 'users', 'parental_level', "TEXT NOT NULL DEFAULT 'ADULT'");
  ensureColumn(database, 'users', 'avatar_seed', 'TEXT');
  ensureColumn(database, 'users', 'avatar_style', "TEXT NOT NULL DEFAULT 'thumbs'");

  ensureColumn(database, 'settings', 'default_provider', "TEXT NOT NULL DEFAULT 'goanime-gui'");
  ensureColumn(database, 'settings', 'downloads_path', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, 'settings', 'audio_preference', "TEXT NOT NULL DEFAULT 'sub'");
  ensureColumn(database, 'settings', 'parental_control_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'settings', 'parental_pin_hash', 'TEXT');
  ensureColumn(database, 'settings', 'max_content_rating', "TEXT NOT NULL DEFAULT '18'");
  ensureColumn(database, 'settings', 'remember_position', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(database, 'settings', 'check_updates', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(database, 'settings', 'player_mode', "TEXT NOT NULL DEFAULT 'external'");
  ensureColumn(database, 'settings', 'local_telemetry_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'settings', 'interface_language', "TEXT NOT NULL DEFAULT 'pt-BR'");
  ensureColumn(database, 'settings', 'startup_metrics_enabled', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn(database, 'playback_sessions', 'anime_cover', 'TEXT');
  ensureColumn(database, 'playback_sessions', 'episode_title', 'TEXT');
  ensureColumn(database, 'playback_sessions', 'duration', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(database, 'playback_sessions', 'source', 'TEXT');
  ensureColumn(database, 'playback_sessions', 'anime_payload', 'TEXT');
  ensureColumn(database, 'playback_sessions', 'episode_payload', 'TEXT');

  ensureColumn(database, 'watch_history', 'episode_title', 'TEXT');
  ensureColumn(database, 'watch_history', 'source', 'TEXT');
  ensureColumn(database, 'watch_history', 'anime_payload', 'TEXT');
  ensureColumn(database, 'watch_history', 'episode_payload', 'TEXT');

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      anime_title TEXT NOT NULL,
      anime_cover TEXT,
      anime_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, provider_id, anime_id)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider_id TEXT NOT NULL,
      anime_id TEXT NOT NULL,
      anime_title TEXT NOT NULL,
      anime_cover TEXT,
      anime_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, provider_id, anime_id)
    );

    CREATE TABLE IF NOT EXISTS episode_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      anime_id TEXT NOT NULL,
      anime_title TEXT NOT NULL,
      episode_number REAL NOT NULL,
      language TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      source TEXT,
      error_code TEXT,
      technical_error TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS login_security (
      username TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS failure_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      scope TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cache_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      stale_until TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(namespace, cache_key)
    );

    CREATE TABLE IF NOT EXISTS backup_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'profiles',
      target_path TEXT NOT NULL,
      cadence TEXT NOT NULL DEFAULT 'daily',
      password_secret TEXT NOT NULL,
      validate_restore INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_status TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, kind)
    );

    CREATE TABLE IF NOT EXISTS startup_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      shell_ready_ms INTEGER NOT NULL,
      core_ready_ms INTEGER NOT NULL,
      snapshot_restored INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_user ON episode_reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_failure_telemetry_user_created
      ON failure_telemetry(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_failure_telemetry_filters
      ON failure_telemetry(user_id, scope, event, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cache_expiration
      ON cache_entries(stale_until);
    CREATE INDEX IF NOT EXISTS idx_cache_access
      ON cache_entries(last_accessed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backup_schedules_due
      ON backup_schedules(user_id, enabled, kind, last_run_at);
    CREATE INDEX IF NOT EXISTS idx_startup_performance_user_created
      ON startup_performance(user_id, created_at DESC);
  `);
}

function ensureColumn(database, tableName, columnName, definition) {
  if (!hasTable(database, tableName) || hasColumn(database, tableName, columnName)) {
    return;
  }

  database.exec(
    `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition};`
  );
}

function hasTable(database, tableName) {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function hasColumn(database, tableName, columnName) {
  return database
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all()
    .some((column) => column.name === columnName);
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Identificador SQLite inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}

module.exports = {
  migrations,
  repairPortableSchema,
  runMigrations
};
