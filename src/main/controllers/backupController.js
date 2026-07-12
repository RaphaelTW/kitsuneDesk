class BackupController {
  constructor(backupService) {
    this.backupService = backupService;
  }

  exportLibrary(filePath) {
    return this.backupService.exportLibrary(filePath);
  }

  importLibrary(filePath, mode) {
    return this.backupService.importLibrary(filePath, mode);
  }

  exportProfiles(filePath, password) {
    return this.backupService.exportProfilesEncrypted(filePath, password);
  }

  importProfiles(filePath, password) {
    return this.backupService.importProfilesEncrypted(filePath, password);
  }

  scheduleStatus() {
    return this.backupService.scheduleStatus();
  }

  configureSchedule(payload) {
    return this.backupService.configureSchedule(payload);
  }

  runScheduled(payload) {
    return this.backupService.runScheduledBackup(payload);
  }
}

module.exports = BackupController;
