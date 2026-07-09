const Database = require('better-sqlite3');
const { runMigrations } = require('./migrations');
const { seedInitialData } = require('./seed');

const [, , action, databasePath, rawPayload = '{}'] = process.argv;

try {
  const payload = JSON.parse(rawPayload);
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  const result = executeAction(database, action, payload);
  database.close();

  if (typeof result !== 'undefined') {
    process.stdout.write(JSON.stringify(result));
  }
} catch (error) {
  process.stderr.write(error.stack || error.message || String(error));
  process.exitCode = 1;
}

function executeAction(database, action, payload) {
  if (action === 'initialize') {
    runMigrations(database);
    seedInitialData(database);
    return { ok: true };
  }

  if (action === 'get') {
    return database.prepare(assertSql(payload.sql)).get(normalizeParams(payload.params));
  }

  if (action === 'all') {
    return database.prepare(assertSql(payload.sql)).all(normalizeParams(payload.params));
  }

  if (action === 'run') {
    const result = database.prepare(assertSql(payload.sql)).run(normalizeParams(payload.params));
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid)
    };
  }

  if (action === 'exec') {
    database.exec(assertSql(payload.sql));
    return { ok: true };
  }

  throw new Error(`Ação de banco desconhecida: ${action}`);
}

function assertSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('SQL inválido.');
  }
  return sql;
}

function normalizeParams(params) {
  return Array.isArray(params) ? params : (params ?? []);
}
