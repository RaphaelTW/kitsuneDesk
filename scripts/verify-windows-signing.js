const signingLink = process.env.CSC_LINK || process.env.WINDOWS_CSC_LINK || '';
const signingPassword = process.env.CSC_KEY_PASSWORD || process.env.WINDOWS_CSC_KEY_PASSWORD || '';

const hasCertificate = Boolean(signingLink.trim() && signingPassword.trim());

if (!hasCertificate) {
  console.error('Certificado de assinatura Windows obrigatório para publicar uma release.');
  process.exit(1);
}

console.log('Assinatura Windows configurada para o electron-builder.');
