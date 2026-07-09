const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptPayload, decryptPayload } = require('../../src/main/services/backupService');

test('backup de perfis usa criptografia autenticada', () => {
  const payload = {
    format: 'kitsunedesk-profiles',
    version: 1,
    users: [{ username: 'admin', password_hash: 'hash-seguro' }]
  };
  const encrypted = encryptPayload(payload, 'SenhaBackup123!');
  assert.equal(encrypted.format, 'kitsunedesk-profiles-encrypted');
  assert.equal(encrypted.cipher, 'aes-256-gcm');
  assert.equal(JSON.stringify(encrypted).includes('hash-seguro'), false);
  assert.deepEqual(decryptPayload(encrypted, 'SenhaBackup123!'), payload);
  assert.throws(() => decryptPayload(encrypted, 'SenhaIncorreta!'));
});
