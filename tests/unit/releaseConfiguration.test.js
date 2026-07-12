const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const packageJson = require('../../package.json');

const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'windows-build.yml'),
  'utf8'
);
const releaseSecurity = fs.readFileSync(
  path.join(root, 'scripts', 'verify-release-security.js'),
  'utf8'
);
const providersBundle = fs.readFileSync(
  path.join(root, 'scripts', 'verify-provider-bundles.js'),
  'utf8'
);
const installerTerms = fs.readFileSync(path.join(root, 'docs', 'INSTALLER_TERMS.txt'), 'utf8');

test('configuração do electron-builder possui uma única fonte', () => {
  assert.equal(packageJson.build, undefined);
  assert.equal(packageJson.version, '0.14.0');

  assert.match(packageJson.scripts['build:win'], /--config electron-builder\.yml --win/);
  assert.match(packageJson.scripts['release:build'], /--publish never/);

  assert.match(builderConfig, /artifactName:\s*KitsuneDesk-Setup-\$\{version\}\.\$\{ext\}/);
  assert.match(builderConfig, /license:\s*docs\/INSTALLER_TERMS\.txt/);
  assert.match(builderConfig, /oneClick:\s*false/);
  assert.match(builderConfig, /installerLanguages:[\s\S]*pt_BR[\s\S]*en_US/);

  assert.match(builderConfig, /provider:\s*github/);
  assert.match(builderConfig, /owner:\s*RaphaelTW/);
  assert.match(builderConfig, /repo:\s*kitsuneDesk/);
});

test('workflow só publica release com metadados e teste de atualização', () => {
  assert.match(workflow, /npm run release:verify-artifacts/);
  assert.match(workflow, /npm run test:e2e:electron/);
  assert.match(workflow, /npm run providers:bundle/);
  assert.match(
    workflow,
    /test-installed-update\.ps1 -PreviousTag v0\.12\.0 -ValidateRollback -ValidateInterruptedDownload/
  );

  assert.match(
    workflow,
    /PROVIDER_MANIFEST_PRIVATE_KEY:\s*\$\{\{ secrets\.PROVIDER_MANIFEST_PRIVATE_KEY \}\}/
  );

  assert.match(workflow, /dist\/latest\.yml/);
  assert.match(workflow, /gh release create[\s\S]*--latest/);
  assert.match(workflow, /gh release upload[\s\S]*--clobber/);
  assert.match(workflow, /gh release edit[\s\S]*--latest/);
});

test('termos e validações de segurança cobrem distribuição responsável', () => {
  assert.match(installerTerms, /não hospeda|nao hospeda/i);
  assert.match(installerTerms, /provedores.*online|online providers/i);
  assert.match(installerTerms, /concorda|aceite/i);
  assert.match(installerTerms, /SmartScreen|assinatura|editor desconhecido/i);
  assert.match(releaseSecurity, /ValidateRollback/);
  assert.match(providersBundle, /PROVIDER_MANIFEST_PRIVATE_KEY/);
  assert.match(providersBundle, /manifest\.sig/);
  assert.match(providersBundle, /sha256/);
});
