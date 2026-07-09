const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AppError = require('../utils/AppError');

const SUPPORTED_TARGETS = new Set(['goanime', 'anime-cli-br', 'ani-cli', 'fast-anime-vsr']);
const MAX_PARALLEL_INSTALLATIONS = 4;
const EVENT_PREFIX = 'KITSUNE_EVENT ';

class InstallationService {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Inicia uma instalacao silenciosa e envia progresso para o renderer.
   *
   * @param {string} provider
   * @param {Electron.WebContents} webContents
   * @returns {{started: boolean, jobId: string, provider: string, hidden: true}}
   */
  start(provider, webContents) {
    const target = normalizeTarget(provider);
    const existing = [...this.jobs.values()].find(
      (job) => job.provider === target && job.state === 'running'
    );

    if (existing) {
      return { started: false, jobId: existing.id, provider: target, hidden: true };
    }

    const runningCount = [...this.jobs.values()].filter((job) => job.state === 'running').length;
    if (runningCount >= MAX_PARALLEL_INSTALLATIONS) {
      throw new AppError(
        'INSTALLATION_LIMIT',
        'Ja existem quatro instalacoes em andamento. Aguarde uma delas terminar.',
        { status: 429 }
      );
    }

    const powershellPath = findPowerShell();
    if (!powershellPath) {
      throw new AppError(
        'POWERSHELL_NOT_FOUND',
        'O PowerShell do Windows nao foi encontrado para executar a instalacao automatica.',
        { status: 424 }
      );
    }

    const jobId = crypto.randomUUID();
    const files = prepareInstallerFiles(jobId);
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      files.scriptPath,
      '-Provider',
      target,
      '-BridgeSourcePath',
      files.bridgePath
    ];

    const child = spawn(powershellPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KITSUNEDESK_JOB_ID: jobId
      }
    });

    const job = {
      id: jobId,
      provider: target,
      state: 'running',
      child,
      webContents,
      files,
      stdoutBuffer: '',
      stderrBuffer: '',
      lastPercent: 0,
      lastMessage: 'Preparando instalacao automatica...'
    };
    this.jobs.set(jobId, job);

    this.emit(job, {
      type: 'started',
      percent: 0,
      component: 'installer',
      state: 'running',
      message: 'Instalacao iniciada dentro do KitsuneDesk.'
    });

    child.stdout.on('data', (chunk) => this.consumeOutput(job, chunk.toString('utf8'), false));
    child.stderr.on('data', (chunk) => this.consumeOutput(job, chunk.toString('utf8'), true));

    child.once('error', (error) => {
      if (job.state !== 'running') return;
      job.state = 'failed';
      this.emit(job, {
        type: 'error',
        percent: job.lastPercent,
        component: 'installer',
        state: 'error',
        message: 'Nao foi possivel iniciar a instalacao automatica.',
        detail: error.message
      });
      this.cleanup(job);
    });

    child.once('close', (code) => {
      this.flushBuffers(job);
      if (job.state !== 'running') {
        this.cleanup(job);
        return;
      }

      if (code === 0) {
        job.state = 'completed';
        this.emit(job, {
          type: 'complete',
          percent: 100,
          component: 'installer',
          state: 'installed',
          message: 'Instalacao concluida. O status sera atualizado automaticamente.'
        });
      } else {
        job.state = 'failed';
        this.emit(job, {
          type: 'error',
          percent: job.lastPercent,
          component: 'installer',
          state: 'error',
          message: 'A instalacao nao foi concluida.',
          detail:
            trimLog(job.stderrBuffer) ||
            `PowerShell finalizado com codigo ${code ?? 'desconhecido'}.`
        });
      }
      this.cleanup(job);
    });

    return { started: true, jobId, provider: target, hidden: true };
  }

  /** @param {string} jobId */
  cancel(jobId) {
    const job = this.jobs.get(String(jobId ?? ''));
    if (!job || job.state !== 'running') {
      return { cancelled: false, message: 'Nenhuma instalacao ativa foi encontrada.' };
    }

    job.state = 'cancelled';
    if (process.platform === 'win32' && job.child.pid) {
      spawn('taskkill.exe', ['/PID', String(job.child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      }).unref();
    } else {
      job.child.kill();
    }

    this.emit(job, {
      type: 'cancelled',
      percent: job.lastPercent,
      component: 'installer',
      state: 'cancelled',
      message: 'Instalacao cancelada pelo usuario.'
    });
    this.cleanup(job);
    return { cancelled: true, jobId: job.id };
  }

  consumeOutput(job, text, isError) {
    const key = isError ? 'stderrBuffer' : 'stdoutBuffer';
    job[key] += text;
    const lines = job[key].split(/\r?\n/);
    job[key] = lines.pop() ?? '';
    lines.forEach((line) => this.consumeLine(job, line, isError));
  }

  consumeLine(job, line, isError) {
    const cleanLine = stripAnsi(String(line ?? '')).trim();
    if (!cleanLine) return;

    if (cleanLine.startsWith(EVENT_PREFIX)) {
      try {
        const event = JSON.parse(cleanLine.slice(EVENT_PREFIX.length));
        const percent = clampPercent(event.percent);
        job.lastPercent = Math.max(job.lastPercent, percent);
        job.lastMessage = String(event.message ?? job.lastMessage);
        this.emit(job, {
          type: String(event.type ?? 'progress'),
          percent,
          component: String(event.component ?? 'installer'),
          state: String(event.state ?? 'running'),
          message: String(event.message ?? ''),
          purpose: String(event.purpose ?? ''),
          detail: String(event.detail ?? '')
        });
        return;
      } catch {
        // A linha sera exibida como log comum quando o JSON estiver incompleto.
      }
    }

    this.emit(job, {
      type: 'log',
      percent: job.lastPercent,
      component: 'installer',
      state: isError ? 'warning' : 'running',
      message: cleanLine.slice(0, 1000)
    });
  }

  flushBuffers(job) {
    if (job.stdoutBuffer.trim()) this.consumeLine(job, job.stdoutBuffer, false);
    if (job.stderrBuffer.trim()) this.consumeLine(job, job.stderrBuffer, true);
    job.stdoutBuffer = '';
    job.stderrBuffer = '';
  }

  emit(job, event) {
    if (!job.webContents || job.webContents.isDestroyed()) return;
    job.webContents.send('player:installation-progress', {
      jobId: job.id,
      provider: job.provider,
      timestamp: new Date().toISOString(),
      ...event
    });
  }

  cleanup(job) {
    for (const filePath of Object.values(job.files ?? {})) {
      try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // Arquivos temporarios tambem sao removidos pelo Windows posteriormente.
      }
    }

    setTimeout(() => this.jobs.delete(job.id), 10 * 60 * 1000).unref?.();
  }
}

function normalizeTarget(provider) {
  const value = String(provider ?? '').trim();
  const normalized = value === 'goanime-gui' ? 'goanime' : value;
  if (!SUPPORTED_TARGETS.has(normalized)) {
    throw new AppError(
      'INSTALLATION_UNSUPPORTED',
      'Este componente nao possui instalacao automatica.',
      {
        status: 400
      }
    );
  }
  return normalized;
}

function prepareInstallerFiles(jobId) {
  const installerSource = findPackagedFile(path.join('scripts', 'windows', 'install-provider.ps1'));
  const bridgeSource = findPackagedFile(path.join('resources', 'goanime-bridge', 'main.go'));

  if (!installerSource || !bridgeSource) {
    throw new AppError(
      'INSTALLER_FILES_MISSING',
      'Os arquivos da instalacao automatica nao foram encontrados.',
      { status: 500 }
    );
  }

  const scriptPath = path.join(os.tmpdir(), `kitsunedesk-${jobId}-installer.ps1`);
  const bridgePath = path.join(os.tmpdir(), `kitsunedesk-${jobId}-bridge.go`);

  // Windows PowerShell 5.1 interpreta arquivos UTF-8 sem BOM usando a pagina de
  // codigo local. O BOM preserva acentos e evita mensagens com acentuação corrompida.
  const installerText = fs.readFileSync(installerSource, 'utf8').replace(/^\uFEFF/, '');
  fs.writeFileSync(scriptPath, `\uFEFF${installerText}`, 'utf8');
  fs.copyFileSync(bridgeSource, bridgePath);
  return { scriptPath, bridgePath };
}

function findPackagedFile(relativePath) {
  const projectRoot = path.join(__dirname, '..', '..', '..');
  const candidates = [
    path.join(projectRoot, relativePath),
    process.resourcesPath
      ? path.join(process.resourcesPath, 'app.asar.unpacked', relativePath)
      : null,
    process.resourcesPath ? path.join(process.resourcesPath, relativePath) : null
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function findPowerShell() {
  const candidates = [
    process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : null,
    'powershell.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'powershell.exe' || fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function stripAnsi(value) {
  const escape = String.fromCharCode(27);
  const pattern = new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, 'g');
  return String(value).replace(pattern, '');
}

function trimLog(value) {
  return String(value ?? '')
    .trim()
    .slice(-4000);
}

module.exports = InstallationService;
