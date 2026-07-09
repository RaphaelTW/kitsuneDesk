const handleRequest = require('./handleRequest');

function registerSettingsHandlers(ipcMain, settingsController) {
  const handle = (channel, action) => {
    ipcMain.handle(channel, (_event, payload) => handleRequest('SETTINGS', () => action(payload)));
  };

  handle('settings:get', () => settingsController.get());
  handle('settings:update', (payload) => settingsController.update(payload));
  handle('settings:set-parental-pin', (payload) => settingsController.setParentalPin(payload));
  handle('settings:verify-parental-pin', (payload) =>
    settingsController.verifyParentalPin(payload)
  );
}

module.exports = { registerSettingsHandlers };
