const signingLink = process.env.CSC_LINK || process.env.WINDOWS_CSC_LINK || '';
const signingPassword = process.env.CSC_KEY_PASSWORD || process.env.WINDOWS_CSC_KEY_PASSWORD || '';

const missing = [];
if (!signingLink.trim()) missing.push('CSC_LINK ou WINDOWS_CSC_LINK');
if (!signingPassword.trim()) missing.push('CSC_KEY_PASSWORD ou WINDOWS_CSC_KEY_PASSWORD');

if (missing.length > 0) {
  console.error('A release Windows precisa de certificado de assinatura digital.');
  for (const name of missing) console.error(`- Variavel ausente: ${name}`);
  console.error('Configure os secrets do certificado antes de criar a tag de release publicada.');
  process.exit(1);
}

console.log('Assinatura Windows configurada para o electron-builder.');
