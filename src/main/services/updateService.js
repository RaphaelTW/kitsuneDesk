const { EventEmitter } = require('events');
const { autoUpdater } = require('electron-updater');

class UpdateService extends EventEmitter {
  constructor({ app }) {
    super();
    this.app = app;
    this.configured = false;
    this.lastState = { state: 'idle', currentVersion: app.getVersion() };
  }

  configure() {
    if (this.configured) return;
    this.configured = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    const relay = (state, payload = {}) => {
      this.lastState = { state, currentVersion: this.app.getVersion(), ...payload };
      this.emit('state', this.lastState);
    };

    autoUpdater.on('checking-for-update', () => relay('checking'));
    autoUpdater.on('update-available', (info) => relay('available', { info }));
    autoUpdater.on('update-not-available', (info) => relay('not-available', { info }));
    autoUpdater.on('download-progress', (progress) => relay('downloading', { progress }));
    autoUpdater.on('update-downloaded', (info) => relay('downloaded', { info }));
    autoUpdater.on('error', (error) => relay('error', { message: error.message }));
  }

  async check() {
    this.configure();
    if (!this.app.isPackaged) {
      this.lastState = {
        state: 'development',
        currentVersion: this.app.getVersion(),
        message: 'A atualização automática funciona no instalador publicado.'
      };
      return this.lastState;
    }
    await autoUpdater.checkForUpdatesAndNotify();
    return this.lastState;
  }

  install() {
    if (this.lastState.state !== 'downloaded') {
      return { installed: false, message: 'Nenhuma atualização baixada.' };
    }
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { installed: true };
  }

  status() {
    return this.lastState;
  }
}

module.exports = UpdateService;
