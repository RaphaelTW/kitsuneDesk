const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'resources', 'providers');
const checksumPath = path.join(root, 'SHA256SUMS');
const signaturePath = path.join(root, 'SHA256SUMS.sig');
const ignored = new Set(['SHA256SUMS', 'SHA256SUMS.sig']);

if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

const files = walk(root)
  .filter((file) => !ignored.has(path.basename(file)))
  .filter((file) => !file.endsWith(`${path.sep}.gitkeep`))
  .sort((left, right) => left.localeCompare(right));

const lines = files.map((file) => {
  const content = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  return `${sha256}  ${relative}`;
});

const checksumContent = `${lines.join('\n')}\n`;
fs.writeFileSync(checksumPath, checksumContent, 'utf8');

const privateKey = readPrivateKey();
if (!privateKey) {
  if (requiresSignedChecksums()) {
    console.error(
      'Assinatura dos checksums não configurada. Defina KITSUNEDESK_CHECKSUM_PRIVATE_KEY com o caminho do PEM ou KITSUNEDESK_CHECKSUM_PRIVATE_KEY_B64 com o PEM em base64.'
    );
    process.exit(1);
  }
  fs.writeFileSync(signaturePath, 'UNSIGNED-DEVELOPMENT-BUILD\n', 'utf8');
  console.warn(
    'Checksums gerados sem assinatura real para build local. Releases devem definir KITSUNEDESK_REQUIRE_SIGNED_CHECKSUMS=1 e uma chave privada.'
  );
  process.exit(0);
}

const signature = crypto.createSign('RSA-SHA256').update(checksumContent).end().sign(privateKey);
fs.writeFileSync(signaturePath, `${signature.toString('base64')}\n`, 'utf8');
console.log(`Checksums assinados gerados em resources/providers (${lines.length} arquivo(s)).`);

function requiresSignedChecksums() {
  return ['1', 'true', 'yes'].includes(
    String(process.env.KITSUNEDESK_REQUIRE_SIGNED_CHECKSUMS || '').toLowerCase()
  );
}

function readPrivateKey() {
  const keyPath = process.env.KITSUNEDESK_CHECKSUM_PRIVATE_KEY;
  if (keyPath && fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8');
  const keyBase64 = process.env.KITSUNEDESK_CHECKSUM_PRIVATE_KEY_B64;
  if (keyBase64) return Buffer.from(keyBase64, 'base64').toString('utf8');
  return null;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}
