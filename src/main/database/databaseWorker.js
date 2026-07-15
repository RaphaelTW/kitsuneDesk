const { runMigrations } = require('./migrations');
const { seedInitialData } = require('./seed');
const { createSqlJsCompatibilityDatabase } = require('./sqlJsCompatibilityDatabase');

const [, , action, databasePath, rawPayload = '{}'] = process.argv;

runWorker().catch((error) => {
  process.stderr.write(error.stack || error.message || String(error));
  process.exitCode = 1;
});

async function runWorker() {
  const payload = JSON.parse(rawPayload);
  const { database, compatibilityMode } = await openDatabase(databasePath);

  try {
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');

    const result = executeAction(database, action, payload);

    if (compatibilityMode && shouldPersist(action)) {
      database.exportToFile();
    }

    if (typeof result !== 'undefined') {
      process.stdout.write(JSON.stringify(result));
    }
  } finally {
    database.close();
  }
}

async function openDatabase(databasePath) {
  try {
    const Database = require('better-sqlite3');
    return { database: new Database(databasePath), compatibilityMode: false };
  } catch {
    return {
      database: await createSqlJsCompatibilityDatabase(databasePath),
      compatibilityMode: true
    };
  }
}

function shouldPersist(action) {
  return action === 'initialize' || action === 'run' || action === 'exec';
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
