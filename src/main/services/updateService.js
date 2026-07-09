const { EventEmitter } = require('events');
const { Notification } = require('electron');

const { createUpdateErrorPayload } = require('./updateErrors');

const DEFAULT_INITIAL_DELAY_MS = 7000;
const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;

class UpdateService extends EventEmitter {
  constructor({ app, focusApp = () => {} }) {
    super();
    this.app = app;
    this.focusApp = focusApp;
    this.configured = false;
    this.checkPromise = null;
    this.initialTimer = null;
    this.intervalTimer = null;
    this.autoUpdater = null;
    this.notifiedVersions = new Set();
    this.lastState = {
      state: 'idle',
      currentVersion: app.getVersion(),
      checkedAt: null,
      automatic: false
    };
  }

  configure() {
    if (this.configured) return;
    this.configured = true;

    const autoUpdater = this.getAutoUpdater();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => this.relay('checking'));
    autoUpdater.on('update-available', (info) => {
      const normalized = normalizeInfo(info);
      this.relay('available', { info: normalized });
      this.showSystemNotification({
        key: `available:${normalized.version}`,
        title: `KitsuneDesk ${normalized.version} disponível`,
        body: 'A atualização começou a ser baixada em segundo plano.'
      });
    });
    autoUpdater.on('update-not-available', (info) =>
      this.relay('not-available', { info: normalizeInfo(info) })
    );
    autoUpdater.on('download-progress', (progress) =>
      this.relay('downloading', {
        progress: {
          percent: Number(progress?.percent || 0),
          transferred: Number(progress?.transferred || 0),
          total: Number(progress?.total || 0),
          bytesPerSecond: Number(progress?.bytesPerSecond || 0)
        }
      })
    );
    autoUpdater.on('update-downloaded', (info) => {
      const normalized = normalizeInfo(info);
      this.relay('downloaded', { info: normalized });
      this.showSystemNotification({
        key: `downloaded:${normalized.version}`,
        title: `KitsuneDesk ${normalized.version} pronto`,
        body: 'Abra o KitsuneDesk para instalar e reiniciar agora, ou feche o aplicativo para atualizar.'
      });
    });
    autoUpdater.on('error', (error) => this.relay('error', createUpdateErrorPayload(error)));
  }

  relay(state, payload = {}) {
    const previousInfo = this.lastState.info;
    this.lastState = {
      ...this.lastState,
      state,
      currentVersion: this.app.getVersion(),
      checkedAt: new Date().toISOString(),
      ...payload
    };

    if (!this.lastState.info && previousInfo) this.lastState.info = previousInfo;
    this.emit('state', this.status());
  }

  async check(options = {}) {
    this.configure();
    const autoUpdater = this.getAutoUpdater();
    const automatic = Boolean(options?.automatic);

    if (!this.app.isPackaged) {
      this.lastState = {
        state: 'development',
        currentVersion: this.app.getVersion(),
        checkedAt: new Date().toISOString(),
        automatic,
        message: 'A atualização automática funciona apenas no instalador publicado pelo GitHub.'
      };
      return this.status();
    }

    if (this.checkPromise) return this.checkPromise;

    this.lastState = { ...this.lastState, automatic };
    this.checkPromise = autoUpdater
      .checkForUpdates()
      .then(() => this.status())
      .catch((error) => {
        this.relay('error', createUpdateErrorPayload(error, { automatic }));
        return this.status();
      })
      .finally(() => {
        this.checkPromise = null;
      });

    return this.checkPromise;
  }

  startAutomaticChecks({
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    intervalMs = DEFAULT_INTERVAL_MS
  } = {}) {
    this.configure();
    if (!this.app.isPackaged || this.initialTimer || this.intervalTimer) return;

    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.check({ automatic: true });
    }, initialDelayMs);

    this.intervalTimer = setInterval(() => {
      void this.check({ automatic: true });
    }, intervalMs);
  }

  stopAutomaticChecks() {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.initialTimer = null;
    this.intervalTimer = null;
  }

  install() {
    if (this.lastState.state !== 'downloaded') {
      return { installed: false, message: 'Nenhuma atualização foi baixada ainda.' };
    }

    setImmediate(() => this.getAutoUpdater().quitAndInstall(false, true));
    return {
      installed: true,
      message: 'O KitsuneDesk será reiniciado para concluir a atualização.'
    };
  }

  status() {
    return JSON.parse(JSON.stringify(this.lastState));
  }

  getAutoUpdater() {
    if (!this.autoUpdater) {
      this.autoUpdater = require('electron-updater').autoUpdater;
    }
    return this.autoUpdater;
  }

  showSystemNotification({ key, title, body }) {
    if (!Notification.isSupported() || this.notifiedVersions.has(key)) return;
    this.notifiedVersions.add(key);

    const notification = new Notification({ title, body, silent: false });
    notification.on('click', () => {
      this.focusApp();
      this.emit('notification-click', this.status());
    });
    notification.show();
  }
}

function normalizeInfo(info) {
  if (!info || typeof info !== 'object') return null;
  return {
    version: String(info.version || ''),
    releaseName: String(info.releaseName || ''),
    releaseDate: info.releaseDate || null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes)
  };
}

function normalizeReleaseNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return stripHtml(notes).trim().slice(0, 4000);
  if (Array.isArray(notes)) {
    return notes
      .map((item) => (typeof item === 'string' ? item : item?.note || ''))
      .filter(Boolean)
      .map(stripHtml)
      .join('\n')
      .trim()
      .slice(0, 4000);
  }
  return '';
}

function stripHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

module.exports = UpdateService;
