const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');
const initSqlJs = require('sql.js/dist/sql-asm.js');
const { runMigrations } = require('./migrations');
const { seedInitialData } = require('./seed');

let database;
let persistTimer;
let dirty = false;

void initializeWorker();

async function initializeWorker() {
  try {
    const SQL = await initSqlJs();
    const bytes = fs.existsSync(workerData.databasePath)
      ? new Uint8Array(await fs.promises.readFile(workerData.databasePath))
      : undefined;
    database = new SQL.Database(bytes);
    parentPort.on('message', (message) => void handleMessage(message));
    parentPort.postMessage({ type: 'ready' });
  } catch (error) {
    throw serializeError(error);
  }
}

async function handleMessage(message) {
  const { id, operation } = message;
  try {
    let result;
    if (operation === 'initialize') result = initializeDatabase();
    else if (operation === 'get') result = get(message.sql, message.params);
    else if (operation === 'all') result = all(message.sql, message.params);
    else if (operation === 'run') result = run(message.sql, message.params);
    else if (operation === 'exec') result = exec(message.sql);
    else if (operation === 'close') {
      await persistNow();
      database.close();
      result = { closed: true };
    } else throw new Error(`Operação SQLite desconhecida: ${operation}`);
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: serializeError(error) });
  }
}

function initializeDatabase() {
  const facade = createMigrationFacade();
  runMigrations(facade);
  seedInitialData(facade);
  markDirty();
  return { initialized: true };
}

function createMigrationFacade() {
  return {
    exec,
    pragma(value) {
      try {
        database.exec(`PRAGMA ${value}`);
      } catch {
        // WAL não existe no sql.js; o worker continua isolando o processo principal.
      }
    },
    prepare(sql) {
      return {
        get: (...params) => get(sql, normalizeStatementParams(params)),
        all: (...params) => all(sql, normalizeStatementParams(params)),
        run: (...params) => run(sql, normalizeStatementParams(params))
      };
    },
    transaction(callback) {
      return (...args) => {
        database.exec('BEGIN TRANSACTION;');
        try {
          const result = callback(...args);
          database.exec('COMMIT;');
          markDirty();
          return result;
        } catch (error) {
          database.exec('ROLLBACK;');
          throw error;
        }
      };
    }
  };
}

function get(sql, params = []) {
  const statement = database.prepare(assertSql(sql));
  try {
    statement.bind(params);
    return statement.step() ? normalizeRow(statement.getAsObject()) : undefined;
  } finally {
    statement.free();
  }
}

function all(sql, params = []) {
  const statement = database.prepare(assertSql(sql));
  const rows = [];
  try {
    statement.bind(params);
    while (statement.step()) rows.push(normalizeRow(statement.getAsObject()));
    return rows;
  } finally {
    statement.free();
  }
}

function run(sql, params = []) {
  const statement = database.prepare(assertSql(sql));
  try {
    statement.bind(params);
    while (statement.step()) {
      // Consome resultados para equivalência com better-sqlite3.
    }
  } finally {
    statement.free();
  }
  markDirty();
  return {
    changes: Number(readScalar('SELECT changes() AS value') || 0),
    lastInsertRowid: Number(readScalar('SELECT last_insert_rowid() AS value') || 0)
  };
}

function exec(sql) {
  if (!String(sql || '').trim()) return { ok: true };
  database.exec(sql);
  markDirty();
  return { ok: true };
}

function markDirty() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 50);
  persistTimer.unref?.();
}

async function persistNow() {
  if (!dirty) return;
  dirty = false;
  const temporaryPath = `${workerData.databasePath}.tmp`;
  await fs.promises.mkdir(path.dirname(workerData.databasePath), { recursive: true });
  await fs.promises.writeFile(temporaryPath, Buffer.from(database.export()));
  await fs.promises.rename(temporaryPath, workerData.databasePath);
}

function readScalar(sql) {
  return database.exec(sql)?.[0]?.values?.[0]?.[0];
}

function assertSql(sql) {
  if (!String(sql || '').trim()) throw new Error('SQL inválido.');
  return sql;
}

function normalizeStatementParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [
      key,
      typeof value === 'bigint' ? Number(value) : value
    ])
  );
}

function serializeError(error) {
  return { message: error?.message || String(error), stack: error?.stack || '' };
}
