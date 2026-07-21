const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { getAppPaths } = require('../utils/paths');
const AppError = require('../utils/AppError');

class DiagnosticsService {
  constructor({
    app,
    database,
    playerService,
    telemetryRepository = null,
    sessionRepository = null,
    cacheService = null
  }) {
    this.app = app;
    this.database = database;
    this.playerService = playerService;
    this.telemetryRepository = telemetryRepository;
    this.sessionRepository = sessionRepository;
    this.cacheService = cacheService;
  }

  async run() {
    const paths = getAppPaths(this.app);
    const playerPromise = this.playerService.statusAsync();
    const userId = this.currentUserId();
    const [player, telemetryEnabled, telemetryPage, startupPerformance, cache] = await Promise.all([
      playerPromise,
      this.telemetryRepository?.enabledForUser(userId) ?? false,
      this.telemetryRepository?.list(userId, { pageSize: 10 }) ?? { items: [] },
      this.telemetryRepository?.startupSummary(userId) ?? {
        enabled: false,
        count: 0,
        recent: []
      },
      this.cacheService?.stats() ?? { entries: [], disk: [] }
    ]);
    return {
      checkedAt: new Date().toISOString(),
      app: {
        name: this.app.getName(),
        version: this.app.getVersion(),
        packaged: this.app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node
      },
      database: {
        mode: this.database.mode,
        path: paths.databasePath,
        exists: fs.existsSync(paths.databasePath),
        nativeModule: this.database.mode === 'native' ? 'ok' : 'fallback-worker'
      },
      providers: player.providers,
      tools: player.tools,
      dependencies: player.dependencies,
      paths: {
        userData: paths.userData,
        logs: paths.logsDir,
        temp: os.tmpdir(),
        cache: this.app.getPath('cache')
      },
      storage: {
        freeMemory: os.freemem(),
        totalMemory: os.totalmem()
      },
      telemetry: {
        enabled: telemetryEnabled,
        recentFailures: telemetryPage.items ?? []
      },
      startupPerformance,
      cache
    };
  }

  recordFailure(payload) {
    const userId = this.currentUserId();
    return (
      this.telemetryRepository?.record(userId, {
        scope: payload?.scope || 'RENDERER',
        event: payload?.event || 'ERROR',
        message: payload?.message || '',
        metadata: payload?.metadata || {}
      }) ?? { recorded: false, reason: 'unavailable' }
    );
  }

  recordStartupPerformance(payload) {
    return (
      this.telemetryRepository?.recordStartup(this.currentUserId(), payload) ?? {
        recorded: false,
        reason: 'unavailable'
      }
    );
  }

  startupPerformance() {
    return (
      this.telemetryRepository?.startupSummary(this.currentUserId()) ?? {
        enabled: false,
        count: 0,
        recent: []
      }
    );
  }

  listFailureTelemetry(filters) {
    return (
      this.telemetryRepository?.list(this.currentUserId(), filters) ?? {
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        pages: 1,
        facets: { scopes: [], events: [] }
      }
    );
  }

  removeFailureTelemetry(payload) {
    return this.telemetryRepository?.remove(this.currentUserId(), payload?.ids) ?? { removed: 0 };
  }

  exportFailureTelemetry(format, filters) {
    return (
      this.telemetryRepository?.export(this.currentUserId(), format, filters) ?? {
        content: '[]',
        extension: 'json'
      }
    );
  }

  clearFailureTelemetry() {
    return this.telemetryRepository?.clear(this.currentUserId()) ?? { cleared: false };
  }

  async repairNative(webContents) {
    if (this.app.isPackaged) {
      throw new AppError(
        'REPAIR_REQUIRES_INSTALLER',
        'No aplicativo instalado, use Restaurar componentes ou reinstale a versão atual.',
        { status: 409 }
      );
    }

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    return this.runProcess(
      npmCommand,
      ['run', 'rebuild:native'],
      process.cwd(),
      webContents,
      'better-sqlite3'
    );
  }

  async clearCache() {
    const removed = [];
    const candidates = [
      path.join(this.app.getPath('userData'), 'Cache'),
      path.join(this.app.getPath('userData'), 'Code Cache'),
      path.join(this.app.getPath('userData'), 'GPUCache')
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      try {
        await fs.promises.rm(candidate, { recursive: true, force: true });
        removed.push(candidate);
      } catch {
        // Arquivos em uso são ignorados e poderão ser limpos no próximo reinício.
      }
    }

    const tempEntries = (await fs.promises.readdir(os.tmpdir(), { withFileTypes: true })).filter(
      (entry) => entry.name.toLowerCase().startsWith('kitsunedesk-')
    );
    for (const entry of tempEntries) {
      const candidate = path.join(os.tmpdir(), entry.name);
      try {
        await fs.promises.rm(candidate, { recursive: true, force: true });
        removed.push(candidate);
      } catch {
        // Ignora arquivos bloqueados.
      }
    }

    const appCache = await this.cacheService?.clear();
    if (Array.isArray(appCache?.removed)) removed.push(...appCache.removed);
    return { cleared: true, removed, appCache };
  }

  async restoreComponents() {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    const toolsRoot = path.join(localAppData, 'KitsuneDesk', 'tools');
    const targets = [
      path.join(toolsRoot, 'goanime-bridge'),
      path.join(toolsRoot, 'GoAnime-source'),
      path.join(toolsRoot, 'anime-cli-br'),
      path.join(toolsRoot, 'FAST-Anime-VSR')
    ];
    const removed = [];
    for (const target of targets) {
      if (!fs.existsSync(target)) continue;
      await fs.promises.rm(target, { recursive: true, force: true });
      removed.push(target);
    }
    return {
      restored: true,
      removed,
      historyPreserved: true,
      message: 'Componentes removidos. Use Instalar automaticamente em cada item necessário.'
    };
  }

  async exportReport(filePath) {
    const report = await this.run();
    await fs.promises.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
    return { exported: true, path: filePath };
  }

  currentUserId() {
    return Number(this.sessionRepository?.getCurrent()?.user?.id || 0);
  }

  runProcess(command, args, cwd, webContents, component) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        shell: false,
        env: { ...process.env }
      });
      let output = '';
      const send = (stream, chunk) => {
        const text = chunk.toString('utf8');
        output += text;
        if (output.length > 50000) output = output.slice(-50000);
        if (!webContents.isDestroyed()) {
          webContents.send('diagnostics:progress', {
            component,
            stream,
            message: text.trim(),
            at: new Date().toISOString()
          });
        }
      };
      child.stdout.on('data', (chunk) => send('stdout', chunk));
      child.stderr.on('data', (chunk) => send('stderr', chunk));
      child.once('error', (error) => {
        reject(
          new AppError('REPAIR_FAILED', 'Não foi possível iniciar o reparo.', {
            status: 500,
            technicalMessage: error.message
          })
        );
      });
      child.once('close', (code) => {
        if (code === 0) {
          resolve({ repaired: true, component, output });
          return;
        }
        reject(
          new AppError('REPAIR_FAILED', 'O reparo não foi concluído.', {
            status: 500,
            technicalMessage: output || `Processo encerrado com código ${code}.`
          })
        );
      });
    });
  }
}

module.exports = DiagnosticsService;
