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

  recordStartupPerformance(payload) {
    return this.diagnosticsService.recordStartupPerformance(payload);
  }

  startupPerformance() {
    return this.diagnosticsService.startupPerformance();
  }

  listFailureTelemetry(payload) {
    return this.diagnosticsService.listFailureTelemetry(payload);
  }

  removeFailureTelemetry(payload) {
    return this.diagnosticsService.removeFailureTelemetry(payload);
  }

  exportFailureTelemetry(format, filters) {
    return this.diagnosticsService.exportFailureTelemetry(format, filters);
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
