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
      await window.click('#password-button');
      await window.waitForURL(/home\.html/, { timeout: 30000 });

      const appName = await window.locator('.brand-block strong').textContent();
      assert.equal(appName, 'KitsuneDesk');
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
