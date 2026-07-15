const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workerPath = path.join(__dirname, '..', '..', 'src', 'main', 'database', 'databaseWorker.js');

test('worker SQLite inicializa mesmo quando better-sqlite3 nativo não está disponível', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-sqlite-compat-'));
  const databasePath = path.join(tempDir, 'compat.db');

  try {
    const init = runWorker('initialize', databasePath);
    assert.deepEqual(init, { ok: true });

    const admin = runWorker('get', databasePath, {
      sql: 'SELECT username, role, must_change_password FROM users WHERE username = ?',
      params: ['admin']
    });

    assert.equal(admin.username, 'admin');
    assert.equal(admin.role, 'ADMIN');
    assert.equal(admin.must_change_password, 1);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('worker repara banco existente quando falta interface_language em settings', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-sqlite-repair-'));
  const databasePath = path.join(tempDir, 'compat-repair.db');

  try {
    runWorker('exec', databasePath, {
      sql: `
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
      `
    });

    const init = runWorker('initialize', databasePath);
    assert.deepEqual(init, { ok: true });

    const interfaceLanguageColumn = runWorker('get', databasePath, {
      sql: "SELECT name FROM pragma_table_info('settings') WHERE name = ?",
      params: ['interface_language']
    });
    assert.equal(interfaceLanguageColumn.name, 'interface_language');

    const startupMetricsColumn = runWorker('get', databasePath, {
      sql: "SELECT name FROM pragma_table_info('settings') WHERE name = ?",
      params: ['startup_metrics_enabled']
    });
    assert.equal(startupMetricsColumn.name, 'startup_metrics_enabled');

    const backupSchedules = runWorker('get', databasePath, {
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      params: ['backup_schedules']
    });
    assert.equal(backupSchedules.name, 'backup_schedules');

    const startupPerformance = runWorker('get', databasePath, {
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      params: ['startup_performance']
    });
    assert.equal(startupPerformance.name, 'startup_performance');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

function runWorker(action, databasePath, payload = {}) {
  const result = spawnSync(
    process.execPath,
    [workerPath, action, databasePath, JSON.stringify(payload)],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      },
      windowsHide: true
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
}
