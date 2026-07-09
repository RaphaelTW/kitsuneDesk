const path = require('path');
const { dialog } = require('electron');
const handleRequest = require('./handleRequest');

function registerBackupHandlers(ipcMain, backupController) {
  ipcMain.handle('backup:export-library', (_event, payload) =>
    handleRequest('BACKUP', async () => {
      const result = await dialog.showSaveDialog({
        title: 'Exportar biblioteca do KitsuneDesk',
        defaultPath: path.join(
          process.env.USERPROFILE || process.cwd(),
          `kitsunedesk-biblioteca-${new Date().toISOString().slice(0, 10)}.json`
        ),
        filters: [{ name: 'Backup JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) return { exported: false, canceled: true };
      return backupController.exportLibrary(result.filePath, payload);
    })
  );

  ipcMain.handle('backup:import-library', (_event, payload) =>
    handleRequest('BACKUP', async () => {
      const result = await dialog.showOpenDialog({
        title: 'Restaurar biblioteca do KitsuneDesk',
        properties: ['openFile'],
        filters: [{ name: 'Backup JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePaths[0]) return { imported: false, canceled: true };
      return backupController.importLibrary(result.filePaths[0], payload?.mode);
    })
  );

  ipcMain.handle('backup:export-profiles', (_event, payload) =>
    handleRequest('BACKUP', async () => {
      const result = await dialog.showSaveDialog({
        title: 'Exportar perfis criptografados',
        defaultPath: path.join(
          process.env.USERPROFILE || process.cwd(),
          `kitsunedesk-perfis-${new Date().toISOString().slice(0, 10)}.kitsunebackup`
        ),
        filters: [{ name: 'Backup criptografado', extensions: ['kitsunebackup'] }]
      });
      if (result.canceled || !result.filePath) return { exported: false, canceled: true };
      return backupController.exportProfiles(result.filePath, payload?.password);
    })
  );

  ipcMain.handle('backup:import-profiles', (_event, payload) =>
    handleRequest('BACKUP', async () => {
      const result = await dialog.showOpenDialog({
        title: 'Restaurar perfis criptografados',
        properties: ['openFile'],
        filters: [{ name: 'Backup criptografado', extensions: ['kitsunebackup'] }]
      });
      if (result.canceled || !result.filePaths[0]) return { imported: false, canceled: true };
      return backupController.importProfiles(result.filePaths[0], payload?.password);
    })
  );
}

module.exports = { registerBackupHandlers };
