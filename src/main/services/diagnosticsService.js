const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { getAppPaths } = require('../utils/paths');
const AppError = require('../utils/AppError');

class DiagnosticsService {
  constructor({ app, database, playerService }) {
    this.app = app;
    this.database = database;
    this.playerService = playerService;
  }

  run() {
    const paths = getAppPaths(this.app);
    const player = this.playerService.status();
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
      }
    };
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

  clearCache() {
    const removed = [];
    const candidates = [
      path.join(this.app.getPath('userData'), 'Cache'),
      path.join(this.app.getPath('userData'), 'Code Cache'),
      path.join(this.app.getPath('userData'), 'GPUCache')
    ];

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      try {
        fs.rmSync(candidate, { recursive: true, force: true });
        removed.push(candidate);
      } catch {
        // Arquivos em uso são ignorados e poderão ser limpos no próximo reinício.
      }
    }

    const tempEntries = fs
      .readdirSync(os.tmpdir(), { withFileTypes: true })
      .filter((entry) => entry.name.toLowerCase().startsWith('kitsunedesk-'));
    for (const entry of tempEntries) {
      const candidate = path.join(os.tmpdir(), entry.name);
      try {
        fs.rmSync(candidate, { recursive: true, force: true });
        removed.push(candidate);
      } catch {
        // Ignora arquivos bloqueados.
      }
    }

    return { cleared: true, removed };
  }

  restoreComponents() {
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
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(target);
    }
    return {
      restored: true,
      removed,
      historyPreserved: true,
      message: 'Componentes removidos. Use Instalar automaticamente em cada item necessário.'
    };
  }

  exportReport(filePath) {
    const report = this.run();
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    return { exported: true, path: filePath };
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
