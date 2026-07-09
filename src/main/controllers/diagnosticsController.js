class DiagnosticsController {
  constructor({ diagnosticsService, updateService }) {
    this.diagnosticsService = diagnosticsService;
    this.updateService = updateService;
  }

  run() {
    return this.diagnosticsService.run();
  }

  repairNative(_payload, sender) {
    return this.diagnosticsService.repairNative(sender);
  }

  clearCache() {
    return this.diagnosticsService.clearCache();
  }

  restoreComponents() {
    return this.diagnosticsService.restoreComponents();
  }

  recordFailure(payload) {
    return this.diagnosticsService.recordFailure(payload);
  }

  clearFailureTelemetry() {
    return this.diagnosticsService.clearFailureTelemetry();
  }

  exportReport(filePath) {
    return this.diagnosticsService.exportReport(filePath);
  }

  checkUpdates() {
    return this.updateService.check();
  }

  installUpdate() {
    return this.updateService.install();
  }

  updateStatus() {
    return this.updateService.status();
  }
}

module.exports = DiagnosticsController;
