const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const InstallationService = require('../../src/main/services/installationService');

test('recusa alvo de instalação não suportado antes de abrir PowerShell', () => {
  const service = new InstallationService();
  assert.throws(
    () => service.start('provedor-inexistente', {}),
    /nao possui instalacao automatica/i
  );
});

test('script de instalacao verifica integridade de downloads', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', '..', 'scripts', 'windows', 'install-provider.ps1'),
    'utf8'
  );

  assert.match(script, /Assert-FileSha256/);
  assert.match(script, /Get-FileHash/);
  assert.match(script, /Assert-AuthenticodeSignature/);
  assert.match(script, /Get-AuthenticodeSignature/);
  assert.match(script, /Resolve-AssetSha256/);
});
