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
    return this.run('initialize');
  }

  /**
   * @param {string} username
   * @returns {object | undefined}
   */
  findUserByUsername(username) {
    return this.run('findUserByUsername', { username });
  }

  /**
   * @param {number} userId
   * @returns {object | undefined}
   */
  findUserById(userId) {
    return this.run('findUserById', { userId });
  }

  /**
   * @param {number} userId
   * @param {string} passwordHash
   */
  updateUserPassword(userId, passwordHash) {
    this.run('updateUserPassword', { userId, passwordHash });
  }

  close() {
    // O worker abre e fecha a conexao por chamada.
  }

  /**
   * @param {string} action
   * @param {Record<string, unknown>} [payload]
   * @returns {unknown}
   */
  run(action, payload = {}) {
    const nodeExecutable = process.env.KITSUNEDESK_NODE_PATH || 'node';
    const result = spawnSync(
      nodeExecutable,
      [this.workerPath, action, this.databasePath, JSON.stringify(payload)],
      {
        encoding: 'utf8',
        windowsHide: true
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
