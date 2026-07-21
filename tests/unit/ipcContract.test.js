const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

test('todo canal IPC invocado pelo preload possui handler no processo principal', () => {
  const preload = fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8');
  const invokedKeys = new Set(
    [...preload.matchAll(/invoke\(channels\.([A-Za-z0-9]+)(?:,|\))/g)].map((match) => match[1])
  );
  const channelEntries = new Map(
    [...preload.matchAll(/^\s*([A-Za-z0-9]+):\s*'([^']+)'/gm)].map((match) => [match[1], match[2]])
  );
  const mainSources = [
    fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8'),
    ...fs
      .readdirSync(path.join(root, 'src', 'main', 'ipc'))
      .filter((name) => name.startsWith('register') && name.endsWith('.js'))
      .map((name) => fs.readFileSync(path.join(root, 'src', 'main', 'ipc', name), 'utf8'))
  ].join('\n');
  const registered = new Set(
    [...mainSources.matchAll(/(?:ipcMain\.handle|handle)\(\s*'([^']+)'/g)].map((match) => match[1])
  );
  const missing = [...invokedKeys]
    .map((key) => channelEntries.get(key))
    .filter((channel) => !registered.has(channel));
  assert.deepEqual(missing, []);
});
