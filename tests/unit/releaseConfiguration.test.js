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

test('configuração do electron-builder possui uma única fonte', () => {
  assert.equal(packageJson.build, undefined);
  assert.match(packageJson.scripts['build:win'], /--config electron-builder\.yml --win/);
  assert.match(packageJson.scripts['release:build'], /--publish never/);
  assert.match(builderConfig, /artifactName:\s*KitsuneDesk-Setup-\$\{version\}\.\$\{ext\}/);
  assert.match(builderConfig, /provider:\s*github/);
  assert.match(builderConfig, /owner:\s*RaphaelTW/);
  assert.match(builderConfig, /repo:\s*kitsuneDesk/);
});

test('workflow só publica release com metadados do atualizador', () => {
  assert.match(workflow, /npm run release:verify-artifacts/);
  assert.match(workflow, /dist\/latest\.yml/);
  assert.match(workflow, /gh release create[\s\S]*--latest/);
  assert.match(workflow, /gh release upload[\s\S]*--clobber/);
  assert.match(workflow, /gh release edit[\s\S]*--latest/);
});
