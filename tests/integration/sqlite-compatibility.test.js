const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createSqlJsCompatibilityDatabase
} = require('../../src/main/database/sqlJsCompatibilityDatabase');

test('SQLite de compatibilidade inicializa sem criar processo por consulta', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-sqlite-compat-'));
  const databasePath = path.join(tempDir, 'compat.db');

  try {
    const database = await createSqlJsCompatibilityDatabase(databasePath);
    await database.initialize();
    const admin = await database.get(
      'SELECT username, role, must_change_password FROM users WHERE username = ?',
      ['admin']
    );

    assert.equal(admin.username, 'admin');
    assert.equal(admin.role, 'ADMIN');
    assert.equal(admin.must_change_password, 1);
    await database.close();
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('SQLite persistente repara banco existente e preserva dados', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-sqlite-repair-'));
  const databasePath = path.join(tempDir, 'compat-repair.db');

  try {
    const database = await createSqlJsCompatibilityDatabase(databasePath);
    await database.exec(`
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
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        FOREIGN KEY (user_id) REFERENCES users(id)
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
    await database.initialize();

    assert.equal(
      (
        await database.get("SELECT name FROM pragma_table_info('settings') WHERE name = ?", [
          'interface_language'
        ])
      ).name,
      'interface_language'
    );
    assert.equal(
      (
        await database.get("SELECT name FROM pragma_table_info('settings') WHERE name = ?", [
          'startup_metrics_enabled'
        ])
      ).name,
      'startup_metrics_enabled'
    );
    assert.equal(
      (
        await database.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
          'backup_schedules'
        ])
      ).name,
      'backup_schedules'
    );
    assert.equal(
      (
        await database.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
          'startup_performance'
        ])
      ).name,
      'startup_performance'
    );
    await database.close();

    const reopened = await createSqlJsCompatibilityDatabase(databasePath);
    assert.equal((await reopened.findUserByUsername('admin')).username, 'admin');
    await reopened.close();
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
