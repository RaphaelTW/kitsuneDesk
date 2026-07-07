const path = require('path');

/**
 * @param {Electron.App} app
 * @returns {{userData: string, databaseDir: string, databasePath: string, logsDir: string}}
 */
function getAppPaths(app) {
  const userData = app.getPath('userData');

  return {
    userData,
    databaseDir: path.join(userData, 'database'),
    databasePath: path.join(userData, 'database', 'kitsunedesk.sqlite'),
    logsDir: path.join(userData, 'logs')
  };
}

module.exports = {
  getAppPaths
};
