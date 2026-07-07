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

/**
 * @param {import('better-sqlite3').Database} database
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @returns {unknown}
 */
function executeAction(database, action, payload) {
  if (action === 'initialize') {
    runMigrations(database);
    seedInitialData(database);
    return { ok: true };
  }

  if (action === 'findUserByUsername') {
    return database.prepare('SELECT * FROM users WHERE username = ?').get(payload.username);
  }

  if (action === 'findUserById') {
    return database.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
  }

  if (action === 'updateUserPassword') {
    database
      .prepare(
        `
        UPDATE users
        SET password_hash = ?,
            must_change_password = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(payload.passwordHash, payload.userId);
    return { ok: true };
  }

  throw new Error(`Acao de banco desconhecida: ${action}`);
}
