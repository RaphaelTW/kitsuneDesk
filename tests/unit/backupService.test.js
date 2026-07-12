const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptPayload,
  decryptPayload,
  testHelpers
} = require('../../src/main/services/backupService');

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


test('agenda de backup calcula vencimento e próximo horário', () => {
  assert.equal(testHelpers.isBackupDue('off'), false);
  assert.equal(testHelpers.isBackupDue('daily', '2000-01-01T00:00:00.000Z'), true);
  assert.equal(testHelpers.isBackupDue('weekly', new Date().toISOString()), false);
  assert.equal(typeof testHelpers.nextRunAt('daily', '2000-01-01T00:00:00.000Z'), 'string');
  assert.equal(testHelpers.nextRunAt('off', null), null);
});

test('backup remove segredos locais das preferências exportadas', () => {
  const sanitized = testHelpers.sanitizeSettings({
    id: 10,
    user_id: 5,
    theme: 'cyberpunk',
    parental_pin_hash: 'pin-hash',
    backup_secret_encrypted: 'secret',
    backup_frequency: 'daily'
  });

  assert.equal(sanitized.theme, 'cyberpunk');
  assert.equal(sanitized.backup_frequency, 'daily');
  assert.equal('parental_pin_hash' in sanitized, false);
  assert.equal('backup_secret_encrypted' in sanitized, false);
  assert.equal('id' in sanitized, false);
  assert.equal('user_id' in sanitized, false);
});
