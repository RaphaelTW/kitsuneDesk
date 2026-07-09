const signingLink = process.env.CSC_LINK || process.env.WINDOWS_CSC_LINK || '';
const signingPassword = process.env.CSC_KEY_PASSWORD || process.env.WINDOWS_CSC_KEY_PASSWORD || '';

const hasCertificate = Boolean(signingLink.trim() && signingPassword.trim());

if (!hasCertificate) {
  console.warn('Certificado de assinatura Windows não configurado.');
  console.warn('A versão será gerada sem assinatura digital.');
  console.warn('O Windows poderá exibir o aviso de editor desconhecido.');

  process.exit(0);
}

console.log('Assinatura Windows configurada para o electron-builder.');
