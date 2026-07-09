class SettingsController {
  constructor(settingsService) {
    this.settingsService = settingsService;
  }

  get() {
    return this.settingsService.get();
  }

  update(payload) {
    return this.settingsService.update(payload);
  }

  setParentalPin(payload) {
    return this.settingsService.setParentalPin(payload);
  }

  verifyParentalPin(payload) {
    return this.settingsService.verifyParentalPin(payload);
  }
}

module.exports = SettingsController;
