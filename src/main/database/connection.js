const fs = require('fs');
const { getAppPaths } = require('../utils/paths');
const logger = require('../utils/logger');
const BridgeDatabaseClient = require('./databaseBridge');
const NativeDatabaseClient = require('./nativeDatabaseClient');

let database = null;

/**
 * @param {Electron.App} app
 * @returns {Database.Database}
 */
function getDatabase(app) {
  if (database) {
    return database;
  }

  const paths = getAppPaths(app);
  fs.mkdirSync(paths.databaseDir, { recursive: true });

  try {
    database = new NativeDatabaseClient(paths.databasePath);
    return database;
  } catch (error) {
    logger.warning(
      'DATABASE_NATIVE_UNAVAILABLE',
      'Usando worker Node para SQLite em desenvolvimento.',
      {
        technicalMessage: error.message
      }
    );
  }

  database = new BridgeDatabaseClient(paths.databasePath);
  return database;
}

function closeDatabase() {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}

module.exports = {
  closeDatabase,
  getDatabase
};
