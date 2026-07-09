const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('bridge mantém fallback, IPC e player MPV externo', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'resources', 'goanime-bridge', 'main.go'),
    'utf8'
  );
  assert.match(source, /alternateMode/);
  assert.match(source, /fallbackUsed/);
  assert.match(source, /--input-ipc-server=/);
  assert.doesNotMatch(source, /--wid=/);
  assert.doesNotMatch(source, /WindowID/);
  assert.match(source, /bridgeVersion = "1\.5\.1"/);
});
