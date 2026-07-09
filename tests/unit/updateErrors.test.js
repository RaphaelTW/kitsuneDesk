const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdateErrorPayload } = require('../../src/main/services/updateErrors');

test('erro de latest.yml vira mensagem pública curta e segura', () => {
  const error = new Error(
    'Cannot find latest.yml in the latest release artifacts: HttpError: 404 Headers: secret'
  );
  const result = createUpdateErrorPayload(error, { automatic: false });

  assert.equal(result.code, 'UPDATE_RELEASE_INCOMPLETE');
  assert.equal(result.automatic, false);
  assert.match(result.message, /arquivos necessários para atualização/i);
  assert.doesNotMatch(result.message, /latest\.yml|headers|github\.com/i);
  assert.match(result.technicalMessage, /latest\.yml/i);
});

test('erro de rede recebe orientação de conexão', () => {
  const result = createUpdateErrorPayload(new Error('connect ETIMEDOUT'));

  assert.equal(result.code, 'UPDATE_NETWORK_ERROR');
  assert.match(result.message, /conexão com a internet/i);
});

test('erro desconhecido não expõe detalhes técnicos ao usuário', () => {
  const result = createUpdateErrorPayload(new Error('falha interna confidencial'));

  assert.equal(result.code, 'UPDATE_CHECK_FAILED');
  assert.doesNotMatch(result.message, /confidencial/i);
  assert.match(result.technicalMessage, /confidencial/i);
});
