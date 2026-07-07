const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const copyTargets = [
  {
    from: 'node_modules/bootstrap/dist/css/bootstrap.min.css',
    to: 'src/renderer/vendor/bootstrap/css/bootstrap.min.css'
  },
  {
    from: 'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
    to: 'src/renderer/vendor/bootstrap/js/bootstrap.bundle.min.js'
  },
  {
    from: 'node_modules/bootstrap-icons/font/bootstrap-icons.min.css',
    to: 'src/renderer/vendor/bootstrap-icons/font/bootstrap-icons.min.css'
  },
  {
    from: 'node_modules/bootstrap/LICENSE',
    to: 'resources/licenses/bootstrap.LICENSE'
  },
  {
    from: 'node_modules/bootstrap-icons/LICENSE',
    to: 'resources/licenses/bootstrap-icons.LICENSE'
  }
];

/**
 * Copia um arquivo garantindo a pasta de destino.
 *
 * @param {string} from
 * @param {string} to
 */
function copyFile(from, to) {
  const source = path.join(rootDir, from);
  const target = path.join(rootDir, to);

  if (!fs.existsSync(source)) {
    throw new Error(`Arquivo de origem nao encontrado: ${from}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

/**
 * Copia todos os arquivos de uma pasta.
 *
 * @param {string} fromDir
 * @param {string} toDir
 */
function copyDirectoryFiles(fromDir, toDir) {
  const sourceDir = path.join(rootDir, fromDir);
  const targetDir = path.join(rootDir, toDir);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Pasta de origem nao encontrada: ${fromDir}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const fileName of fs.readdirSync(sourceDir)) {
    const source = path.join(sourceDir, fileName);
    const target = path.join(targetDir, fileName);

    if (fs.statSync(source).isFile()) {
      fs.copyFileSync(source, target);
    }
  }
}

try {
  for (const target of copyTargets) {
    copyFile(target.from, target.to);
  }

  copyDirectoryFiles(
    'node_modules/bootstrap-icons/font/fonts',
    'src/renderer/vendor/bootstrap-icons/font/fonts'
  );

  console.log('Dependencias visuais copiadas para src/renderer/vendor.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
