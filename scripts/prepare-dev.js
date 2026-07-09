const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const markerPath = path.join(projectRoot, 'node_modules', '.kitsunedesk-native.json');
const nativeBinary = path.join(
  projectRoot,
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

function readElectronVersion() {
  try {
    return require('electron/package.json').version;
  } catch {
    return null;
  }
}

function nativeIsPrepared(electronVersion) {
  if (!electronVersion || !fs.existsSync(nativeBinary) || !fs.existsSync(markerPath)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    return marker.electronVersion === electronVersion;
  } catch {
    return false;
  }
}

function prepareNativeModule() {
  const electronVersion = readElectronVersion();
  if (!electronVersion) {
    console.warn('[KitsuneDesk] Electron não encontrado; execute npm install antes de iniciar.');
    return;
  }
  if (nativeIsPrepared(electronVersion)) return;

  console.log(`[KitsuneDesk] Preparando better-sqlite3 para Electron ${electronVersion}...`);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'rebuild:native'], {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 10 * 60 * 1000
  });

  if (result.status === 0 && fs.existsSync(nativeBinary)) {
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ electronVersion, preparedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
    console.log('[KitsuneDesk] Módulo SQLite preparado para o Electron.');
    return;
  }

  console.warn(
    '[KitsuneDesk] Não foi possível reconstruir o better-sqlite3 automaticamente. ' +
      'O aplicativo tentará usar o modo de compatibilidade.'
  );
}

prepareNativeModule();
