const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..', 'resources', 'providers');
const providers = ['goanime', 'anime-cli-br', 'ani-cli', 'fast-anime-vsr'];
const manifest = {
  format: 'kitsunedesk-provider-bundles',
  version: 1,
  generatedAt: new Date().toISOString(),
  files: []
};
for (const provider of providers) {
  const directory = path.join(root, provider);
  if (!fs.existsSync(directory)) continue;
  for (const file of walk(directory)) {
    const content = fs.readFileSync(file);
    manifest.files.push({
      provider,
      path: path.relative(root, file).replaceAll('\\', '/'),
      size: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    });
  }
}
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${manifest.files.length} arquivo(s) de provedores offline verificados.`);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}
