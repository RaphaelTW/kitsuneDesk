const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'docs', 'INSTALLER_TERMS.txt'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'windows-build.yml'), 'utf8');
const errors = [];

expect(/license:\s*docs\/INSTALLER_TERMS\.txt/, builder, 'Instalador precisa exibir termos obrigatórios.');
expect(/oneClick:\s*false/, builder, 'Instalador precisa usar modo assistido com aceite explícito.');
expect(/signAndEditExecutable:\s*true/, builder, 'Executável precisa ser assinado/editado pelo electron-builder.');
expect(/signDlls:\s*true/, builder, 'DLLs precisam entrar no fluxo de assinatura.');
expect(/verifyUpdateCodeSignature:\s*true/, builder, 'Atualizador precisa verificar assinatura.');
expect(/não hospeda|nao hospeda/i, terms, 'Termos precisam declarar que o app não hospeda conteúdo.');
expect(/concorda|agree/i, terms, 'Termos precisam mencionar aceite do usuário.');
expect(/PROVIDER_MANIFEST_PRIVATE_KEY/, workflow, 'Workflow precisa assinar manifesto dos provedores offline.');
expect(/Get-AuthenticodeSignature/, workflow, 'Workflow precisa validar Authenticode do instalador.');
expect(/ValidateRollback/, workflow, 'Workflow precisa validar rollback instalado.');
expect(/ValidateInterruptedDownload/, workflow, 'Workflow precisa validar recuperação após download interrompido.');

if (errors.length > 0) {
  console.error('A release não atende aos requisitos de segurança/distribuição:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Requisitos de segurança e distribuição validados.');

function expect(pattern, content, message) {
  if (!pattern.test(content)) errors.push(message);
}
