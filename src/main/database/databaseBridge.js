const path = require('path');
const { spawnSync } = require('child_process');
const AppError = require('../utils/AppError');

class BridgeDatabaseClient {
  /**
   * @param {string} databasePath
   */
  constructor(databasePath) {
    this.mode = 'node-bridge';
    this.databasePath = databasePath;
    this.workerPath = path.join(__dirname, 'databaseWorker.js');
  }

  initialize() {
    return this.call('initialize');
  }

  get(sql, params = []) {
    return this.call('get', { sql, params });
  }

  all(sql, params = []) {
    return this.call('all', { sql, params });
  }

  run(sql, params = []) {
    return this.call('run', { sql, params });
  }

  exec(sql) {
    return this.call('exec', { sql });
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
    // O worker abre e fecha a conexão por chamada.
  }

  call(action, payload = {}) {
    const nodeExecutable = process.env.KITSUNEDESK_NODE_PATH || 'node';
    const result = spawnSync(
      nodeExecutable,
      [this.workerPath, action, this.databasePath, JSON.stringify(payload)],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      }
    );

    if (result.error || result.status !== 0) {
      throw new AppError('DATABASE_ERROR', 'Erro ao acessar os dados locais.', {
        status: 500,
        technicalMessage: result.error?.message || result.stderr || 'Falha no worker SQLite.'
      });
    }

    if (!result.stdout.trim()) {
      return undefined;
    }

    return JSON.parse(result.stdout);
  }
}

module.exports = BridgeDatabaseClient;
