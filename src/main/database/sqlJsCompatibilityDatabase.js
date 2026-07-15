const fs = require('fs');
const initSqlJs = require('sql.js/dist/sql-asm.js');

let sqlModulePromise = null;

async function loadSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

async function createSqlJsCompatibilityDatabase(databasePath) {
  const SQL = await loadSqlModule();
  const existingDatabase = fs.existsSync(databasePath)
    ? new Uint8Array(fs.readFileSync(databasePath))
    : undefined;
  const rawDatabase = new SQL.Database(existingDatabase);
  return new SqlJsCompatibilityDatabase(rawDatabase, databasePath);
}

class SqlJsCompatibilityDatabase {
  constructor(rawDatabase, databasePath) {
    this.rawDatabase = rawDatabase;
    this.databasePath = databasePath;
  }

  pragma(sql) {
    if (typeof sql !== 'string' || !sql.trim()) return;
    try {
      this.rawDatabase.exec(`PRAGMA ${sql}`);
    } catch {
      // Algumas pragmas de desempenho, como WAL, não são suportadas pelo sql.js.
      // O modo de compatibilidade prioriza não travar a aplicação.
    }
  }

  prepare(sql) {
    return new SqlJsCompatibilityStatement(this.rawDatabase, sql);
  }

  exec(sql) {
    if (typeof sql !== 'string' || !sql.trim()) return { ok: true };
    this.rawDatabase.exec(sql);
    return { ok: true };
  }

  transaction(callback) {
    return (...args) => {
      this.rawDatabase.exec('BEGIN TRANSACTION;');
      try {
        const result = callback(...args);
        this.rawDatabase.exec('COMMIT;');
        return result;
      } catch (error) {
        try {
          this.rawDatabase.exec('ROLLBACK;');
        } catch {
          // A exceção original é mais útil para o chamador.
        }
        throw error;
      }
    };
  }

  exportToFile() {
    const exported = this.rawDatabase.export();
    fs.writeFileSync(this.databasePath, Buffer.from(exported));
  }

  close() {
    this.rawDatabase.close();
  }
}

class SqlJsCompatibilityStatement {
  constructor(rawDatabase, sql) {
    this.rawDatabase = rawDatabase;
    this.sql = assertSql(sql);
  }

  get(...params) {
    const statement = this.rawDatabase.prepare(this.sql);
    try {
      statement.bind(normalizeParams(params));
      if (!statement.step()) return undefined;
      return normalizeRow(statement.getAsObject());
    } finally {
      statement.free();
    }
  }

  all(...params) {
    const statement = this.rawDatabase.prepare(this.sql);
    const rows = [];
    try {
      statement.bind(normalizeParams(params));
      while (statement.step()) {
        rows.push(normalizeRow(statement.getAsObject()));
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  run(...params) {
    const statement = this.rawDatabase.prepare(this.sql);
    try {
      statement.bind(normalizeParams(params));
      while (statement.step()) {
        // Consome resultados para manter comportamento equivalente ao better-sqlite3.
      }
    } finally {
      statement.free();
    }

    return {
      changes: Number(readScalar(this.rawDatabase, 'SELECT changes() AS value') ?? 0),
      lastInsertRowid: Number(
        readScalar(this.rawDatabase, 'SELECT last_insert_rowid() AS value') ?? 0
      )
    };
  }
}

function assertSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('SQL inválido.');
  }
  return sql;
}

function normalizeParams(params) {
  if (params.length === 0) return [];
  if (params.length === 1) {
    const [first] = params;
    if (Array.isArray(first)) return first;
    if (first && typeof first === 'object' && !Buffer.isBuffer(first)) return first;
    return [first];
  }
  return params;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return normalized;
}

function readScalar(rawDatabase, sql) {
  const result = rawDatabase.exec(sql);
  return result?.[0]?.values?.[0]?.[0];
}

module.exports = {
  createSqlJsCompatibilityDatabase
};
