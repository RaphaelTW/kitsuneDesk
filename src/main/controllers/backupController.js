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

  validateProfiles(filePath, password) {
    const result = this.backupService.validateProfilesEncrypted(filePath, password);
    return {
      valid: result.valid,
      profiles: result.profiles,
      exportedAt: result.exportedAt,
      appVersion: result.appVersion
    };
  }

  listSchedules() {
    return this.backupService.listSchedules();
  }

  scheduleProfiles(payload) {
    return this.backupService.scheduleProfilesBackup(payload);
  }

  runScheduledProfiles(payload) {
    return this.backupService.runScheduledProfilesBackup(payload);
  }

  runDueSchedules() {
    return this.backupService.runDueSchedules();
  }
}

module.exports = BackupController;
