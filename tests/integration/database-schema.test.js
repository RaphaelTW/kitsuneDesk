const test = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations } = require('../../src/main/database/migrations');
const { seedInitialData } = require('../../src/main/database/seed');

let Database = null;
try {
  const BetterSqlite3 = require('better-sqlite3');
  const probe = new BetterSqlite3(':memory:');
  probe.close();
  Database = BetterSqlite3;
} catch {
  // Ignorado quando o binário nativo ainda não foi compilado para o Node atual.
}

test('migra banco vazio com biblioteca, segurança e relatórios', { skip: !Database }, () => {
  const database = new Database(':memory:');
  runMigrations(database);
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  for (const table of [
    'users',
    'settings',
    'favorites',
    'watchlist',
    'episode_reports',
    'login_security',
    'failure_telemetry',
    'cache_entries'
  ]) {
    assert.ok(tables.includes(table), `Tabela ausente: ${table}`);
  }
  const userColumns = database
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((row) => row.name);
  assert.ok(userColumns.includes('avatar_seed'));
  assert.ok(userColumns.includes('avatar_style'));
  const settingsColumns = database
    .prepare('PRAGMA table_info(settings)')
    .all()
    .map((row) => row.name);
  assert.ok(settingsColumns.includes('default_provider'));
  assert.ok(settingsColumns.includes('parental_pin_hash'));
  assert.ok(settingsColumns.includes('player_mode'));
  assert.ok(settingsColumns.includes('local_telemetry_enabled'));
  assert.ok(settingsColumns.includes('ui_language'));
  assert.ok(settingsColumns.includes('backup_frequency'));
  assert.ok(settingsColumns.includes('backup_directory'));
  assert.ok(settingsColumns.includes('backup_secret_encrypted'));
  assert.ok(settingsColumns.includes('backup_last_status'));
  const defaultMode = database
    .prepare("SELECT dflt_value FROM pragma_table_info('settings') WHERE name = 'player_mode'")
    .get();
  assert.equal(String(defaultMode.dflt_value).replaceAll("'", ''), 'external');
  seedInitialData(database);
  const admin = database.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  assert.equal(admin.role, 'ADMIN');
  assert.equal(admin.must_change_password, 1);
  assert.equal(admin.avatar_style, 'thumbs');
  database.close();
});
