const Database = require('better-sqlite3');
const { runMigrations } = require('./migrations');
const { seedInitialData } = require('./seed');

class NativeDatabaseClient {
  /**
   * @param {string} databasePath
   */
  constructor(databasePath) {
    this.mode = 'native';
    this.databasePath = databasePath;
    this.database = new Database(databasePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
  }

  initialize() {
    runMigrations(this.database);
    seedInitialData(this.database);
  }

  get(sql, params = []) {
    return this.database.prepare(sql).get(normalizeParams(params));
  }

  all(sql, params = []) {
    return this.database.prepare(sql).all(normalizeParams(params));
  }

  run(sql, params = []) {
    const result = this.database.prepare(sql).run(normalizeParams(params));
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid)
    };
  }

  exec(sql) {
    this.database.exec(sql);
    return { ok: true };
  }

  findUserByUsername(username) {
    return this.get('SELECT * FROM users WHERE username = ?', [username]);
  }

  findUserById(userId) {
    return this.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  updateUserPassword(userId, passwordHash) {
    return this.run(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [passwordHash, userId]
    );
  }

  close() {
    this.database.close();
  }
}

function normalizeParams(params) {
  return Array.isArray(params) ? params : (params ?? []);
}

module.exports = NativeDatabaseClient;
