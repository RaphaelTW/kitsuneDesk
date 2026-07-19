const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

test(
  'Electron Windows abre login padrao e exige troca de senha',
  { skip: process.platform !== 'win32' },
  async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-e2e-'));
    let app = null;
    const childEnvironment = {
      ...process.env,
      KITSUNEDESK_USER_DATA_DIR: userDataDir,
      NODE_ENV: 'test'
    };
    delete childEnvironment.ELECTRON_RUN_AS_NODE;

    try {
      app = await electron.launch({
        args: ['.'],
        env: childEnvironment
      });

      const window = await app.firstWindow();
      await window.waitForSelector('#login-form:not(.d-none)', { timeout: 30000 });
      await assertElementText(window, '#auth-title', 'Entrar');

      await window.fill('#username', 'admin');
      await window.fill('#password', 'admin123');
      await window.click('#login-button');
      await window.waitForURL(/change-password\.html/, { timeout: 30000 });

      await window.fill('#current-password', 'admin123');
      await window.fill('#new-password', 'Senha123!');
      await window.fill('#confirm-password', 'Senha123!');
      await window.click('#password-button', { noWaitAfter: true });
      await window.waitForURL(/home\.html/, { timeout: 30000 });

      const appName = await window.locator('.brand-block strong').textContent();
      assert.equal(appName, 'KitsuneDesk');

      await window.waitForFunction(
        () =>
          globalThis.document.querySelector('#provider-health-summary')?.textContent ===
          'Clique para verificar'
      );
      const firstInteraction = await window.evaluate(() => {
        globalThis.document.querySelector('[data-view="tools"]').click();
        const navigation = {
          active: globalThis.document
            .querySelector('[data-view="tools"]')
            .classList.contains('is-active'),
          visible: !globalThis.document
            .querySelector('[data-view-panel="tools"]')
            .classList.contains('d-none')
        };
        globalThis.document.querySelector('#provider-health-button').click();
        return {
          navigation,
          providerSummary: globalThis.document.querySelector('#provider-health-summary').textContent
        };
      });
      assert.deepEqual(firstInteraction.navigation, { active: true, visible: true });
      assert.equal(firstInteraction.providerSummary, 'Verificando provedores');
    } finally {
      if (app) await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
);

test(
  'Electron cobre idiomas, métricas opt-in, provedores e formatos de stream',
  { skip: process.platform !== 'win32' },
  async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsunedesk-e2e-matrix-'));
    let app = null;
    const childEnvironment = {
      ...process.env,
      KITSUNEDESK_USER_DATA_DIR: userDataDir,
      KITSUNEDESK_E2E_FIXTURES: '1',
      NODE_ENV: 'test'
    };
    delete childEnvironment.ELECTRON_RUN_AS_NODE;

    try {
      app = await electron.launch({ args: ['.'], env: childEnvironment });
      const window = await app.firstWindow();
      await window.waitForSelector('#login-form:not(.d-none)', { timeout: 30000 });
      await window.fill('#username', 'admin');
      await window.fill('#password', 'admin123');
      await window.click('#login-button');
      await window.waitForURL(/change-password\.html/, { timeout: 30000 });
      await window.fill('#current-password', 'admin123');
      await window.fill('#new-password', 'Senha123!');
      await window.fill('#confirm-password', 'Senha123!');
      await window.click('#password-button', { noWaitAfter: true });
      await window.waitForURL(/home\.html/, { timeout: 30000 });

      const languages = await window
        .locator('#setting-interface-language option')
        .evaluateAll((options) => options.map((option) => option.value));
      assert.deepEqual(languages, ['pt-BR', 'en-US', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP']);

      const result = await window.evaluate(async () => {
        const unwrap = (response) => {
          if (!response?.ok) throw new Error(response?.error?.message || 'E2E IPC failure');
          return response.data;
        };
        unwrap(
          await window.animeDesk.settings.update({
            playerMode: 'embedded',
            startupMetricsEnabled: true,
            startupMetricsRetentionDays: 7,
            interfaceLanguage: 'ja-JP'
          })
        );
        unwrap(
          await window.animeDesk.diagnostics.recordStartupPerformance({
            shellReadyMs: 120,
            coreReadyMs: 480,
            snapshotRestored: true,
            startupType: 'snapshot'
          })
        );
        const performance = unwrap(await window.animeDesk.diagnostics.startupPerformance());
        const status = unwrap(await window.animeDesk.player.status());
        const streams = {};
        for (const format of ['mp4', 'hls', 'headers']) {
          const anime = unwrap(
            await window.animeDesk.animes.search({ query: `fixture-${format}`, language: 'sub' })
          )[0];
          const episodes = unwrap(
            await window.animeDesk.animes.episodes({ anime, language: 'sub' })
          );
          streams[format] = unwrap(
            await window.animeDesk.player.playEpisode({
              anime,
              episode: episodes[0],
              episodes,
              episodeIndex: 0,
              language: 'sub',
              quality: 'auto'
            })
          );
        }
        return { performance, status, streams };
      });

      assert.equal(result.performance.enabled, true);
      assert.equal(result.performance.count, 1);
      assert.equal(result.performance.averageCoreMs, 480);
      assert.equal(result.performance.medianCoreMs, 480);
      assert.equal(result.performance.p95CoreMs, 480);
      assert.equal(result.performance.retentionDays, 7);
      assert.equal(result.status.providers.goAnime.ready, true);
      assert.equal(result.status.providers.goAnime.classicReady, true);
      assert.equal(result.status.providers.animeCliBr.ready, true);
      assert.equal(result.status.providers.aniCli.ready, true);
      assert.equal(result.streams.mp4.embedded, true);
      assert.equal(result.streams.hls.embeddedFallback, true);
      assert.equal(result.streams.headers.embeddedFallback, true);

      const lazyViews = {
        continue: '#continue-list',
        lists: '#favorites-list',
        history: '#history-list',
        tools: '#tool-grid',
        diagnostics: '#diagnostic-grid',
        admin: '#users-list'
      };
      for (const [view, selector] of Object.entries(lazyViews)) {
        await window.click(`[data-view="${view}"]`);
        await window.waitForSelector(selector, { state: 'attached' });
        assert.equal(
          await window.locator(`[data-view-panel="${view}"]`).getAttribute('data-fragment-loaded'),
          'true'
        );
      }

      await window.click('[data-view="telemetry"]');
      await window.waitForSelector('#startup-metrics-cards article');
      assert.equal(await window.locator('#startup-metrics-cards article').count(), 4);
      assert.equal(await window.locator('#setting-startup-retention option').count(), 4);

      await window.reload();
      await window.waitForSelector('[data-i18n="navHome"]', {
        state: 'attached',
        timeout: 30000
      });
      await assertElementText(window, '[data-i18n="navHome"]', 'ホーム');
    } finally {
      if (app) await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
);

async function assertElementText(page, selector, expected) {
  const text = await page.locator(selector).textContent();
  assert.equal(text, expected);
}
