const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const version = require('../package.json').version;
const installer = path.join(root, 'dist', `KitsuneDesk-Setup-${version}.exe`);
const certificate = String(process.env.CSC_LINK || process.env.WINDOWS_CSC_LINK || '').trim();
const password = String(
  process.env.CSC_KEY_PASSWORD || process.env.WINDOWS_CSC_KEY_PASSWORD || ''
).trim();

if (Boolean(certificate) !== Boolean(password)) {
  console.error('A assinatura Windows está parcialmente configurada. Informe certificado e senha.');
  process.exit(1);
}

if (!certificate) {
  console.log('Authenticode opcional: certificado ausente, artefato unsigned permitido.');
  process.exit(0);
}

if (!fs.existsSync(installer)) {
  console.error(`Instalador não encontrado para validar assinatura: ${installer}`);
  process.exit(1);
}

const escaped = installer.replaceAll("'", "''");
const command = [
  `$signature = Get-AuthenticodeSignature -LiteralPath '${escaped}'`,
  `if ($signature.Status -ne 'Valid') { Write-Error ('Assinatura inválida: ' + $signature.Status); exit 2 }`,
  `if (-not $signature.SignerCertificate) { Write-Error 'Certificado do assinante ausente.'; exit 3 }`,
  `if (-not $signature.TimeStamperCertificate) { Write-Error 'Carimbo de tempo ausente.'; exit 4 }`,
  `Write-Output ('Authenticode válido: ' + $signature.SignerCertificate.Subject)`
].join('; ');
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
  encoding: 'utf8',
  windowsHide: true
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
