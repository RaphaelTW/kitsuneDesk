const path = require('path');
const { Worker } = require('worker_threads');

async function createSqlJsCompatibilityDatabase(databasePath) {
  const client = new SqlJsWorkerClient(databasePath);
  await client.ready;
  return client;
}

class SqlJsWorkerClient {
  constructor(databasePath) {
    this.mode = 'compatibility-worker';
    this.databasePath = databasePath;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.worker = new Worker(path.join(__dirname, 'sqlJsDatabaseWorker.js'), {
      workerData: { databasePath }
    });
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.worker.on('message', (message) => this.handleMessage(message));
    this.worker.on('error', (error) => this.fail(error));
    this.worker.on('exit', (code) => {
      if (code !== 0) this.fail(new Error(`Worker SQLite encerrado com código ${code}.`));
    });
  }

  handleMessage(message) {
    if (message?.type === 'ready') {
      this.readyResolve();
      return;
    }
    const request = this.pending.get(message?.id);
    if (!request) return;
    this.pending.delete(message.id);
    if (message.ok) request.resolve(message.result);
    else {
      const error = new Error(message.error?.message || 'Falha no worker SQLite.');
      error.stack = message.error?.stack || error.stack;
      request.reject(error);
    }
  }

  fail(error) {
    this.readyReject(error);
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  request(operation, payload = {}) {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, operation, ...payload });
    });
  }

  initialize() {
    return this.request('initialize');
  }

  get(sql, params = []) {
    return this.request('get', { sql, params: normalizeParams(params) });
  }

  all(sql, params = []) {
    return this.request('all', { sql, params: normalizeParams(params) });
  }

  run(sql, params = []) {
    return this.request('run', { sql, params: normalizeParams(params) });
  }

  exec(sql) {
    return this.request('exec', { sql });
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

  async close() {
    if (!this.worker) return;
    await this.request('close');
    await this.worker.terminate();
    this.worker = null;
  }
}

function normalizeParams(params) {
  return Array.isArray(params) ? params : (params ?? []);
}

module.exports = { createSqlJsCompatibilityDatabase, SqlJsWorkerClient };
