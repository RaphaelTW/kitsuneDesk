const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'resources', 'providers');
const providers = ['goanime', 'anime-cli-br', 'ani-cli', 'fast-anime-vsr'];
const manifestPath = path.join(root, 'manifest.json');
const signaturePath = path.join(root, 'manifest.sig');
const publicKeyPath = path.join(root, 'manifest.pub');
const manifest = {
  format: 'kitsunedesk-provider-bundles',
  version: 2,
  signature: {
    algorithm: 'ed25519',
    requiredForRelease: true
  },
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

manifest.files.sort((left, right) => left.path.localeCompare(right.path));
const canonicalManifest = JSON.stringify(manifest, null, 2);
fs.writeFileSync(manifestPath, `${canonicalManifest}\n`);

const privateKey = process.env.PROVIDER_MANIFEST_PRIVATE_KEY || '';
const publicKey = process.env.PROVIDER_MANIFEST_PUBLIC_KEY || '';
const releaseTag = String(process.env.GITHUB_REF_NAME || '').startsWith('v');

if (privateKey.trim()) {
  const keyObject = crypto.createPrivateKey(privateKey.replace(/\\n/g, '\n'));
  const signature = crypto.sign(null, Buffer.from(canonicalManifest), keyObject).toString('base64');
  fs.writeFileSync(signaturePath, `${signature}\n`, 'utf8');
  if (publicKey.trim()) fs.writeFileSync(publicKeyPath, publicKey.replace(/\\n/g, '\n'), 'utf8');
  console.log(
    `${manifest.files.length} arquivo(s) de provedores offline verificados e manifesto assinado.`
  );
} else {
  fs.rmSync(signaturePath, { force: true });
  if (releaseTag || process.env.REQUIRE_PROVIDER_MANIFEST_SIGNATURE === '1') {
    console.error('Assinatura Ed25519 do manifesto de provedores obrigatória para release.');
    console.error('Configure PROVIDER_MANIFEST_PRIVATE_KEY nos secrets do GitHub Actions.');
    process.exit(1);
  }
  console.log(
    `${manifest.files.length} arquivo(s) de provedores offline verificados; assinatura pulada fora de release.`
  );
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}
