const fs = require('fs');
const { getAppPaths } = require('../utils/paths');
const logger = require('../utils/logger');
const NativeDatabaseClient = require('./nativeDatabaseClient');
const { createSqlJsCompatibilityDatabase } = require('./sqlJsCompatibilityDatabase');

let database = null;

/**
 * @param {Electron.App} app
 * @returns {Database.Database}
 */
async function getDatabase(app) {
  if (database) {
    return database;
  }

  const paths = getAppPaths(app);
  await fs.promises.mkdir(paths.databaseDir, { recursive: true });

  try {
    database = new NativeDatabaseClient(paths.databasePath);
    return database;
  } catch (error) {
    logger.warning(
      'DATABASE_NATIVE_UNAVAILABLE',
      'Usando modo de compatibilidade SQLite em desenvolvimento.',
      {
        technicalMessage: error.message
      }
    );
  }

  database = await createSqlJsCompatibilityDatabase(paths.databasePath);
  return database;
}

async function closeDatabase() {
  if (!database) {
    return;
  }

  await database.close();
  database = null;
}

module.exports = {
  closeDatabase,
  getDatabase
};
