const fs = require('fs');
const { getDatabase } = require('../database/connection');
const { getAppPaths } = require('../utils/paths');
const logger = require('../utils/logger');

/**
 * @param {Electron.App} app
 * @returns {import('better-sqlite3').Database}
 */
function initializeFirstRun(app) {
  const paths = getAppPaths(app);

  fs.mkdirSync(paths.databaseDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });

  const database = getDatabase(app);
  database.initialize();

  logger.info('FIRST_RUN_READY', 'Inicializacao local concluida.', {
    databasePath: paths.databasePath,
    databaseMode: database.mode
  });

  return database;
}

module.exports = {
  initializeFirstRun
};
