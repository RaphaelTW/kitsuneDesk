const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
const distDir = path.join(projectRoot, 'dist');
const installerName = `KitsuneDesk-Setup-${version}.exe`;
const expectedFiles = [installerName, `${installerName}.blockmap`, 'latest.yml'];

const errors = [];

for (const fileName of expectedFiles) {
  const filePath = path.join(distDir, fileName);
  if (!fs.existsSync(filePath)) {
    errors.push(`Arquivo ausente: dist/${fileName}`);
    continue;
  }

  const size = fs.statSync(filePath).size;
  if (size <= 0) errors.push(`Arquivo vazio: dist/${fileName}`);
}

const providerChecksumFiles = [
  path.join(projectRoot, 'resources', 'providers', 'SHA256SUMS'),
  path.join(projectRoot, 'resources', 'providers', 'SHA256SUMS.sig')
];
for (const filePath of providerChecksumFiles) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Arquivo ausente: ${path.relative(projectRoot, filePath).replaceAll('\\', '/')}`);
    continue;
  }
  const size = fs.statSync(filePath).size;
  if (size <= 0) {
    errors.push(`Arquivo vazio: ${path.relative(projectRoot, filePath).replaceAll('\\', '/')}`);
  }
}
const checksumSignaturePath = providerChecksumFiles[1];
if (fs.existsSync(checksumSignaturePath)) {
  const signature = fs.readFileSync(checksumSignaturePath, 'utf8').trim();
  if (requiresSignedChecksums() && signature === 'UNSIGNED-DEVELOPMENT-BUILD') {
    errors.push(
      'resources/providers/SHA256SUMS.sig contém assinatura de desenvolvimento, não de release.'
    );
  }
}

const metadataPath = path.join(distDir, 'latest.yml');
if (fs.existsSync(metadataPath)) {
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const metadataVersion = readYamlScalar(metadata, 'version');
  const metadataPathValue = readYamlScalar(metadata, 'path');
  const sha512 = readYamlScalar(metadata, 'sha512');

  if (metadataVersion !== version) {
    errors.push(
      `latest.yml aponta para a versão ${metadataVersion || '(ausente)'}, mas o package.json usa ${version}.`
    );
  }

  if (metadataPathValue !== installerName) {
    errors.push(
      `latest.yml aponta para ${metadataPathValue || '(ausente)'}, mas o instalador esperado é ${installerName}.`
    );
  }

  if (!sha512) errors.push('latest.yml não contém o hash sha512 do instalador.');

  const installerUrlPattern = new RegExp(
    `^\\s*-?\\s*url:\\s*['"]?${escapeRegExp(installerName)}['"]?\\s*$`,
    'm'
  );
  if (!installerUrlPattern.test(metadata)) {
    errors.push(`latest.yml não lista ${installerName} na seção files.`);
  }
}

if (errors.length > 0) {
  console.error(
    'A release não pode ser publicada porque os artefatos do atualizador estão incompletos:'
  );
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Artefatos validados para KitsuneDesk v${version}:`);
for (const fileName of expectedFiles) console.log(`- dist/${fileName}`);

function requiresSignedChecksums() {
  return ['1', 'true', 'yes'].includes(
    String(process.env.KITSUNEDESK_REQUIRE_SIGNED_CHECKSUMS || '').toLowerCase()
  );
}

function readYamlScalar(content, key) {
  const expression = new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, 'm');
  const match = content.match(expression);
  if (!match) return '';
  return match[1].replace(/^['"]|['"]$/g, '').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
