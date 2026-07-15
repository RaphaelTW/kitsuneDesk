const fs = require('fs');
const { getDatabase } = require('../database/connection');
const { getAppPaths } = require('../utils/paths');
const logger = require('../utils/logger');

/**
 * @param {Electron.App} app
 * @returns {import('better-sqlite3').Database}
 */
async function initializeFirstRun(app) {
  const paths = getAppPaths(app);

  await Promise.all([
    fs.promises.mkdir(paths.databaseDir, { recursive: true }),
    fs.promises.mkdir(paths.logsDir, { recursive: true })
  ]);

  const database = await getDatabase(app);
  await database.initialize();

  logger.info('FIRST_RUN_READY', 'Inicializacao local concluida.', {
    databasePath: paths.databasePath,
    databaseMode: database.mode
  });

  return database;
}

module.exports = {
  initializeFirstRun
};
