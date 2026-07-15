const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const release = path.join(
  root,
  'dist',
  'win-unpacked',
  'resources',
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release'
);
const binary = path.join(release, 'better_sqlite3.node');

if (!fs.existsSync(binary) || fs.statSync(binary).size === 0) {
  console.error('better_sqlite3.node não foi incluído no aplicativo empacotado.');
  process.exit(1);
}

const forbidden = [
  'obj',
  'better_sqlite3.iobj',
  'better_sqlite3.ipdb',
  'sqlite3.lib',
  'test_extension.node'
];
const included = forbidden.filter((entry) => fs.existsSync(path.join(release, entry)));
if (included.length) {
  console.error(`Artefatos de compilação indevidos no pacote: ${included.join(', ')}`);
  process.exit(1);
}

console.log(`SQLite nativo validado no pacote (${fs.statSync(binary).size} bytes).`);
