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
}

module.exports = {
  runMigrations
};
