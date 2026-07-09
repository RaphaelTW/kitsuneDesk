const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = String(packageJson.version || '').trim();
const tag = String(process.env.GITHUB_REF_NAME || process.argv[2] || '').trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Versão inválida no package.json: ${version || '(vazia)'}`);
  process.exit(1);
}

if (tag) {
  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    console.error(`A tag ${tag} não corresponde ao package.json (${expectedTag}).`);
    console.error(
      `Atualize a versão com: npm version ${tag.replace(/^v/, '')} --no-git-tag-version`
    );
    process.exit(1);
  }
}

console.log(`Release validada: KitsuneDesk v${version}${tag ? ` · tag ${tag}` : ''}`);
