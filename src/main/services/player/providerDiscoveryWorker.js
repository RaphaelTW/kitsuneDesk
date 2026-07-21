const { parentPort } = require('worker_threads');
const GoAnimeGuiService = require('../goAnimeGuiService');
const { discoverProviderStatus } = require('../playerService');

try {
  const bridge = new GoAnimeGuiService().status();
  parentPort.postMessage({ ok: true, status: discoverProviderStatus(bridge) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || String(error) });
}
