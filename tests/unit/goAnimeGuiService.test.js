const test = require('node:test');
const assert = require('node:assert/strict');
const GoAnimeGuiService = require('../../src/main/services/goAnimeGuiService');
const { normalizeQuality, parseBridgeResponse } = GoAnimeGuiService.testHelpers;

test('qualidade automática vira melhor disponível', () => {
  assert.equal(normalizeQuality('auto'), 'best');
  assert.equal(normalizeQuality('720'), '720p');
  assert.equal(normalizeQuality('1080p'), '1080p');
});

test('pesquisa valida o tamanho e encaminha idioma', async () => {
  const service = new GoAnimeGuiService();
  service.runBridge = async (command, payload) => ({ command, payload });
  await assert.rejects(() => service.search({ query: 'a' }), /dois caracteres/);
  const result = await service.search({ query: 'Naruto', language: 'dub' });
  assert.equal(result.command, 'search');
  assert.equal(result.payload.language, 'dub');
});

test('interpreta a última resposta JSON do bridge', () => {
  const response = parseBridgeResponse('log antigo\n{"ok":true,"data":{"pid":10}}\n');
  assert.equal(response.ok, true);
  assert.equal(response.data.pid, 10);
});
