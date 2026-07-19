const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

const args = process.argv.slice(2);
const iterations = readNumber('--iterations', 20);
const projectRoot = path.resolve(readValue('--project-root') || path.join(__dirname, '..'));
const label = readValue('--label') || require(path.join(projectRoot, 'package.json')).version;
const electronExecutable = readValue('--electron-executable');
const output = path.resolve(
  readValue('--output') || path.join(process.cwd(), 'artifacts', `startup-${label}.json`)
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-benchmark-'));
const template = path.join(root, 'template');
const warmData = path.join(root, 'warm');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run() {
  try {
    await prepareTemplate();
    const cold = [];
    for (let index = 0; index < iterations; index += 1) {
      const userData = path.join(root, `cold-${index}`);
      fs.cpSync(template, userData, { recursive: true });
      cold.push(await measure(userData));
      fs.rmSync(userData, { recursive: true, force: true });
      process.stdout.write(`cold ${index + 1}/${iterations}\r`);
    }

    fs.cpSync(template, warmData, { recursive: true });
    await measure(warmData);
    await clearMetrics(warmData);
    const warm = [];
    for (let index = 0; index < iterations; index += 1) {
      warm.push(await measure(warmData));
      process.stdout.write(`warm ${index + 1}/${iterations}\r`);
    }

    const report = {
      label,
      iterations,
      createdAt: new Date().toISOString(),
      projectRoot,
      electronExecutable: electronExecutable || 'playwright-default',
      runtime: cold[0]?.runtime || warm[0]?.runtime || null,
      gpuFeatureStatus: cold[0]?.gpuFeatureStatus || warm[0]?.gpuFeatureStatus || null,
      hardwareAccelerationPreserved:
        (cold[0]?.hardwareAccelerationEnabled ?? warm[0]?.hardwareAccelerationEnabled) === true &&
        !(cold[0]?.disabledGpuSwitches || warm[0]?.disabledGpuSwitches || []).length,
      cold: summarize(cold),
      warm: summarize(warm),
      samples: { cold, warm }
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nBenchmark salvo em ${output}`);
    console.log(JSON.stringify({ cold: report.cold, warm: report.warm }, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function prepareTemplate() {
  fs.mkdirSync(template, { recursive: true });
  const launched = await launch(template);
  try {
    const window = await launched.application.firstWindow();
    await window.waitForSelector('#login-form:not(.d-none)', { timeout: 30000 });
    await window.fill('#username', 'admin');
    await window.fill('#password', 'admin123');
    await window.click('#login-button');
    await window.waitForURL(/change-password\.html/, { timeout: 30000 });
    await window.fill('#current-password', 'admin123');
    await window.fill('#new-password', 'Senha123!');
    await window.fill('#confirm-password', 'Senha123!');
    await window.click('#password-button');
    await window.waitForURL(/home\.html/, { timeout: 30000 });
    await window.evaluate(async () => {
      const current = await window.animeDesk.settings.get();
      await window.animeDesk.settings.update({
        ...(current.data || {}),
        startupMetricsEnabled: true,
        startupMetricsRetentionDays: 0
      });
      await window.animeDesk.diagnostics.clearFailures();
      localStorage.removeItem('kitsunedesk.startup-snapshot.v1');
      localStorage.removeItem('kitsunedesk.startup-marker.v1');
    });
  } finally {
    await launched.application.close();
  }
}

async function measure(userData) {
  const launched = await launch(userData);
  try {
    const window = await launched.application.firstWindow();
    await loginIfNeeded(window);
    await window.waitForURL(/home\.html/, { timeout: 30000 });
    const metric = await window.evaluate(async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const result = await window.animeDesk.diagnostics.startupPerformance();
        if (result?.ok && result.data?.recent?.length) return result.data.recent[0];
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Métrica de abertura não foi registrada.');
    });
    const processSnapshot = await launched.application.evaluate(({ app }) => ({
      disabledGpuSwitches: ['disable-gpu', 'disable-gpu-compositing'].filter((name) =>
        app.commandLine.hasSwitch(name)
      ),
      gpuFeatureStatus: app.getGPUFeatureStatus(),
      hardwareAccelerationEnabled: app.isHardwareAccelerationEnabled(),
      metrics: app.getAppMetrics().map((item) => ({
        name: item.name || item.serviceName || '',
        type: item.type,
        workingSetSize: item.memory.workingSetSize
      })),
      runtime: {
        chrome: process.versions.chrome,
        electron: process.versions.electron,
        node: process.versions.node
      }
    }));
    const workingSetKb = processSnapshot.metrics.reduce(
      (total, item) => total + item.workingSetSize,
      0
    );
    return {
      ...metric,
      disabledGpuSwitches: processSnapshot.disabledGpuSwitches,
      gpuFeatureStatus: processSnapshot.gpuFeatureStatus,
      hardwareAccelerationEnabled: processSnapshot.hardwareAccelerationEnabled,
      processMemoryMb: groupProcessMemory(processSnapshot.metrics),
      runtime: processSnapshot.runtime,
      workingSetMb: toMb(workingSetKb)
    };
  } finally {
    await launched.application.close();
  }
}

async function clearMetrics(userData) {
  const launched = await launch(userData);
  try {
    const window = await launched.application.firstWindow();
    await loginIfNeeded(window);
    await window.waitForURL(/home\.html/, { timeout: 30000 });
    await window.evaluate(() => window.animeDesk.diagnostics.clearFailures());
  } finally {
    await launched.application.close();
  }
}

async function launch(userData) {
  const env = {
    ...process.env,
    KITSUNEDESK_USER_DATA_DIR: userData,
    NODE_ENV: 'test'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launchOptions = { args: [projectRoot], cwd: projectRoot, env };
  if (electronExecutable) launchOptions.executablePath = path.resolve(electronExecutable);
  const application = await electron.launch(launchOptions);
  return { application };
}

async function loginIfNeeded(window) {
  if (/home\.html/.test(window.url())) return;
  await window.waitForSelector('#login-form:not(.d-none)', { timeout: 30000 });
  await window.fill('#username', 'admin');
  await window.fill('#password', 'Senha123!');
  await window.click('#login-button');
}

function summarize(samples) {
  const core = samples.map((item) => Number(item.coreReadyMs || 0));
  const memory = samples.map((item) => Number(item.workingSetMb || 0));
  const processTypes = new Set(samples.flatMap((item) => Object.keys(item.processMemoryMb || {})));
  return {
    coreMedianMs: percentile(core, 50),
    coreP95Ms: percentile(core, 95),
    memoryMedianMb: percentile(memory, 50),
    processMemoryMedianMb: Object.fromEntries(
      [...processTypes].sort().map((type) => [
        type,
        percentile(
          samples.map((item) => Number(item.processMemoryMb?.[type] || 0)),
          50
        )
      ])
    )
  };
}

function groupProcessMemory(metrics) {
  const groupedKb = {};
  for (const metric of metrics) {
    const key = metric.type === 'Utility' && metric.name ? `Utility:${metric.name}` : metric.type;
    groupedKb[key] = (groupedKb[key] || 0) + metric.workingSetSize;
  }
  return Object.fromEntries(
    Object.entries(groupedKb).map(([type, workingSetKb]) => [type, toMb(workingSetKb)])
  );
}

function toMb(valueInKb) {
  return Math.round((Number(valueInKb || 0) / 1024) * 10) / 10;
}

function percentile(values, target) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((target / 100) * sorted.length) - 1)] || 0;
}

function readValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readNumber(name, fallback) {
  const value = Number(readValue(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
