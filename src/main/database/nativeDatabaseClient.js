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

  /**
   * @param {string} username
   * @returns {object | undefined}
   */
  findUserByUsername(username) {
    return this.database.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  /**
   * @param {number} userId
   * @returns {object | undefined}
   */
  findUserById(userId) {
    return this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }

  /**
   * @param {number} userId
   * @param {string} passwordHash
   */
  updateUserPassword(userId, passwordHash) {
    this.database
      .prepare(
        `
        UPDATE users
        SET password_hash = ?,
            must_change_password = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      )
      .run(passwordHash, userId);
  }

  close() {
    this.database.close();
  }
}

module.exports = NativeDatabaseClient;
