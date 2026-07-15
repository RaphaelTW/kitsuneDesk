const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const sourceConfig = path.join(root, 'electron-builder.yml');
const resolvedConfig = path.join(root, '.electron-builder.resolved.yml');
const certificate = String(process.env.CSC_LINK || process.env.WINDOWS_CSC_LINK || '').trim();
const password = String(
  process.env.CSC_KEY_PASSWORD || process.env.WINDOWS_CSC_KEY_PASSWORD || ''
).trim();

if (Boolean(certificate) !== Boolean(password)) {
  console.error('A assinatura Windows está parcialmente configurada. Informe certificado e senha.');
  process.exit(1);
}

const signed = Boolean(certificate && password);
const config = fs
  .readFileSync(sourceConfig, 'utf8')
  .replace(
    /verifyUpdateCodeSignature:\s*(?:true|false)/,
    `verifyUpdateCodeSignature: ${signed ? 'true' : 'false'}`
  );
fs.writeFileSync(resolvedConfig, config, 'utf8');

const electronBuilder = require.resolve('electron-builder/out/cli/cli.js');
const args = ['--config', resolvedConfig, '--win'];
if (process.argv.includes('--publish-never')) args.push('--publish', 'never');

const result = spawnSync(process.execPath, [electronBuilder, ...args], {
  cwd: root,
  env: {
    ...process.env,
    CSC_LINK: certificate,
    CSC_KEY_PASSWORD: password,
    KITSUNEDESK_SIGNING_EXPECTED: signed ? '1' : '0'
  },
  stdio: 'inherit',
  windowsHide: true
});

fs.rmSync(resolvedConfig, { force: true });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
