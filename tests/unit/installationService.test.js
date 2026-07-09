const test = require('node:test');
const assert = require('node:assert/strict');
const InstallationService = require('../../src/main/services/installationService');

test('recusa alvo de instalação não suportado antes de abrir PowerShell', () => {
  const service = new InstallationService();
  assert.throws(
    () => service.start('provedor-inexistente', {}),
    /nao possui instalacao automatica/i
  );
});
