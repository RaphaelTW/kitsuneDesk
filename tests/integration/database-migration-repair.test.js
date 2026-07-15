const test = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations } = require('../../src/main/database/migrations');

let Database = null;
try {
  const BetterSqlite3 = require('better-sqlite3');
  const probe = new BetterSqlite3(':memory:');
  probe.close();
  Database = BetterSqlite3;
} catch {
  // Ignorado quando o binário nativo ainda não foi compilado para o Node atual.
}

test(
  'repara banco v0.13.0 parcial com settings sem interface_language',
  { skip: !Database },
  () => {
    const database = new Database(':memory:');

    database.exec(`
    CREATE TABLE schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      must_change_password INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      profile_color TEXT NOT NULL DEFAULT '#6f5cff',
      parental_level TEXT NOT NULL DEFAULT 'ADULT',
      avatar_seed TEXT,
      avatar_style TEXT NOT NULL DEFAULT 'thumbs'
    );

    CREATE TABLE settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      default_language TEXT NOT NULL DEFAULT 'sub',
      default_quality TEXT NOT NULL DEFAULT 'auto',
      auto_play_next INTEGER NOT NULL DEFAULT 0,
      player_volume INTEGER NOT NULL DEFAULT 80,
      theme TEXT NOT NULL DEFAULT 'dark',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      default_provider TEXT NOT NULL DEFAULT 'goanime-gui',
      downloads_path TEXT NOT NULL DEFAULT '',
      audio_preference TEXT NOT NULL DEFAULT 'sub',
      parental_control_enabled INTEGER NOT NULL DEFAULT 0,
      parental_pin_hash TEXT,
      max_content_rating TEXT NOT NULL DEFAULT '18',
      remember_position INTEGER NOT NULL DEFAULT 1,
      check_updates INTEGER NOT NULL DEFAULT 1,
      player_mode TEXT NOT NULL DEFAULT 'external',
      local_telemetry_enabled INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE watch_history (
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
      episode_title TEXT,
      source TEXT,
      anime_payload TEXT,
      episode_payload TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE playback_sessions (
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
      anime_cover TEXT,
      episode_title TEXT,
      duration INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      anime_payload TEXT,
      episode_payload TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE application_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE cache_entries (
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

    INSERT INTO schema_migrations (id, name) VALUES
      (1, 'create-initial-schema'),
      (2, 'library-settings-security'),
      (3, 'history-uniqueness-and-app-state'),
      (4, 'playback-payloads'),
      (5, 'player-window-preference'),
      (6, 'stable-external-player'),
      (7, 'default-admin-avatars-local-telemetry'),
      (8, 'cache-and-backup-foundation'),
      (9, 'v0130-backup-schedules-and-i18n');
  `);

    runMigrations(database);

    const settingsColumns = database
      .prepare('PRAGMA table_info(settings)')
      .all()
      .map((row) => row.name);
    assert.ok(settingsColumns.includes('interface_language'));

    const backupSchedules = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'backup_schedules'")
      .get();
    assert.equal(backupSchedules.name, 'backup_schedules');

    const defaultLanguage = database
      .prepare(
        "SELECT dflt_value FROM pragma_table_info('settings') WHERE name = 'interface_language'"
      )
      .get();
    assert.equal(String(defaultLanguage.dflt_value).replaceAll("'", ''), 'pt-BR');

    database.close();
  }
);
