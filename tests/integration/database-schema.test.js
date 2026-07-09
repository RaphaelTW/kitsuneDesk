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
    'login_security'
  ]) {
    assert.ok(tables.includes(table), `Tabela ausente: ${table}`);
  }
  const settingsColumns = database
    .prepare('PRAGMA table_info(settings)')
    .all()
    .map((row) => row.name);
  assert.ok(settingsColumns.includes('default_provider'));
  assert.ok(settingsColumns.includes('parental_pin_hash'));
  database.close();
});
