const path = require('path');
const { dialog } = require('electron');
const handleRequest = require('./handleRequest');

function registerDiagnosticsHandlers(ipcMain, diagnosticsController) {
  const handle = (channel, action) => {
    ipcMain.handle(channel, (event, payload) =>
      handleRequest('DIAGNOSTICS', () => action(payload, event.sender))
    );
  };

  handle('diagnostics:run', () => diagnosticsController.run());
  handle('diagnostics:repair-native', (payload, sender) =>
    diagnosticsController.repairNative(payload, sender)
  );
  handle('diagnostics:clear-cache', () => diagnosticsController.clearCache());
  handle('diagnostics:restore-components', () => diagnosticsController.restoreComponents());
  handle('diagnostics:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Exportar diagnóstico do KitsuneDesk',
      defaultPath: path.join(
        process.env.USERPROFILE || process.cwd(),
        `kitsunedesk-diagnostico-${Date.now()}.json`
      ),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { exported: false, canceled: true };
    return diagnosticsController.exportReport(result.filePath);
  });
  handle('updates:check', () => diagnosticsController.checkUpdates());
  handle('updates:install', () => diagnosticsController.installUpdate());
  handle('updates:status', () => diagnosticsController.updateStatus());
}

module.exports = { registerDiagnosticsHandlers };
