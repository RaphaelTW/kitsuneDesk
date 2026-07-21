const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateAddress } = require('../../src/main/utils/networkPolicy');

test('politica de rede bloqueia destinos locais e permite enderecos publicos', () => {
  for (const address of ['127.0.0.1', '10.0.0.2', '172.16.1.1', '192.168.1.2', '::1', 'fd00::1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('1.1.1.1'), false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});
