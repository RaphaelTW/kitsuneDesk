const dns = require('dns').promises;
const https = require('https');
const AppError = require('../../utils/AppError');

async function assertAnimeFireReachable() {
  try {
    await Promise.race([
      Promise.all([dns.lookup('animefire.net'), probeHttpsHost('https://animefire.net/', 5000)]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Provider timeout')), 5500))
    ]);
  } catch (error) {
    throw new AppError(
      'ANIMEFIRE_UNAVAILABLE',
      'A fonte animefire.net nao esta acessivel neste momento. O anime-cli-br nao foi aberto para evitar o traceback. Use o GoAnime GUI e tente novamente mais tarde.',
      { status: 502, technicalMessage: error?.message ?? String(error) }
    );
  }
}

async function buildProviderHealth(status) {
  let animeFireOnline = false;
  let animeFireMessage = 'AnimeFire indisponivel';
  try {
    await assertAnimeFireReachable();
    animeFireOnline = true;
    animeFireMessage = 'Online';
  } catch (error) {
    animeFireMessage = error.publicMessage || error.message || animeFireMessage;
  }
  return {
    checkedAt: new Date().toISOString(),
    providers: [
      provider(
        'goanime-gui',
        'GoAnime GUI',
        status.providers.goAnime.ready,
        'Bridge ou MPV nao esta pronto'
      ),
      provider(
        'goanime',
        'GoAnime classico',
        status.providers.goAnime.classicReady,
        'GoAnime ou MPV nao esta pronto'
      ),
      {
        id: 'anime-cli-br',
        name: 'anime-cli-br',
        state: animeFireOnline && status.providers.animeCliBr.ready ? 'online' : 'offline',
        message: status.providers.animeCliBr.ready
          ? animeFireMessage
          : 'Dependencias nao instaladas'
      },
      {
        id: 'ani-cli',
        name: 'ani-cli',
        state: status.providers.aniCli.ready ? 'unstable' : 'offline',
        message: status.providers.aniCli.ready
          ? 'Instavel: depende de fontes externas'
          : 'Dependencias nao instaladas'
      }
    ]
  };
}

function probeHttpsHost(target, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'KitsuneDesk/0.16.0', Range: 'bytes=0-0' }
      },
      (response) => {
        response.resume();
        resolve();
      }
    );
    request.on('timeout', () => request.destroy(new Error('HTTPS timeout')));
    request.on('error', reject);
    request.end();
  });
}

function provider(id, name, online, offlineMessage) {
  return {
    id,
    name,
    state: online ? 'online' : 'offline',
    message: online ? 'Online' : offlineMessage
  };
}

module.exports = { assertAnimeFireReachable, buildProviderHealth, probeHttpsHost };
