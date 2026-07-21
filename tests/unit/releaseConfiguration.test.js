const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const packageJson = require('../../package.json');

const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const installerTerms = fs.readFileSync(path.join(root, 'docs', 'INSTALLER_TERMS.txt'));

const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'windows-build.yml'),
  'utf8'
);

test('configuração do electron-builder possui uma única fonte', () => {
  assert.equal(packageJson.build, undefined);

  assert.equal(packageJson.scripts['build:win'], 'node scripts/build-windows.js');

  assert.match(packageJson.scripts['release:build'], /--publish-never/);

  assert.match(builderConfig, /artifactName:\s*KitsuneDesk-Setup-\$\{version\}\.\$\{ext\}/);

  assert.match(builderConfig, /verifyUpdateCodeSignature:\s*false/);
  assert.match(builderConfig, /electronLanguages:[\s\S]*pt-BR[\s\S]*ja/);
  assert.match(builderConfig, /better-sqlite3\/build\/Release\/obj/);
  assert.match(builderConfig, /license:\s*docs\/INSTALLER_TERMS\.txt/);
  assert.deepEqual(
    [...installerTerms.subarray(0, 3)],
    [0xef, 0xbb, 0xbf],
    'a licença explícita do NSIS deve começar com BOM UTF-8'
  );

  assert.match(builderConfig, /provider:\s*github/);
  assert.match(builderConfig, /owner:\s*RaphaelTW/);
  assert.match(builderConfig, /repo:\s*kitsuneDesk/);
});

test('workflow só publica release com metadados do atualizador', () => {
  assert.match(workflow, /npm run release:verify-artifacts/);
  assert.match(workflow, /npm run test:e2e:electron/);
  assert.match(workflow, /test-installed-update\.ps1/);
  assert.match(workflow, /npm run release:verify-signing/);
  assert.match(workflow, /WINDOWS_CSC_LINK/);
  assert.match(packageJson.scripts['release:win'], /release:verify-signing/);
  assert.match(packageJson.scripts['release:stable'], /release:verify-signing/);
  assert.match(workflow, /-PreviousTag v0\.14\.0,v0\.15\.0,v0\.16\.0/);

  assert.match(workflow, /dist\/latest\.yml/);
  assert.match(workflow, /resources\/providers\/SHA256SUMS/);
  assert.doesNotMatch(workflow, /resources\/providers\/SHA256SUMS\.sig/);
  assert.match(workflow, /gh release create[\s\S]*--latest/);
  assert.match(workflow, /gh release upload[\s\S]*--clobber/);
  assert.match(workflow, /gh release edit[\s\S]*--latest/);
});
