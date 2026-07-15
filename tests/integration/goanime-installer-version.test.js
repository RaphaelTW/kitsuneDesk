const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('instalador, serviço e bridge GoAnime usam a mesma versão', () => {
  const root = path.join(__dirname, '..', '..');
  const installerScript = fs.readFileSync(
    path.join(root, 'scripts', 'windows', 'install-provider.ps1'),
    'utf8'
  );
  const bridgeSource = fs.readFileSync(
    path.join(root, 'resources', 'goanime-bridge', 'main.go'),
    'utf8'
  );
  const guiService = fs.readFileSync(
    path.join(root, 'src', 'main', 'services', 'goAnimeGuiService.js'),
    'utf8'
  );

  const installerVersion = installerScript.match(/\$GoAnimeBridgeVersion\s*=\s*'([^']+)'/)?.[1];
  const bridgeVersion = bridgeSource.match(/const bridgeVersion\s*=\s*"([^"]+)"/)?.[1];
  const serviceVersion = guiService.match(/const BRIDGE_VERSION\s*=\s*'([^']+)'/)?.[1];

  assert.ok(installerVersion, 'versão esperada do instalador não encontrada');
  assert.equal(installerVersion, bridgeVersion);
  assert.equal(installerVersion, serviceVersion);
});
