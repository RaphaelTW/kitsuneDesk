const E2E_FIXTURES =
  process.env.NODE_ENV === 'test' && process.env.KITSUNEDESK_E2E_FIXTURES === '1';

function shouldUseE2eFixtures() {
  return E2E_FIXTURES;
}

function buildProviderStatus(dependencies) {
  const {
    aniCli,
    animeCliBr,
    cmd,
    fastAnimeVsr,
    ffmpeg,
    fzf,
    git,
    gitBash,
    goAnime,
    goAnimeBridge,
    mpv,
    nvidia,
    openssl,
    python,
    vlc,
    windowsTerminal
  } = dependencies;
  const goAnimeClassicReady = Boolean(goAnime.available && mpv.available);
  const goAnimeGuiReady = Boolean(goAnimeBridge.available && mpv.available);
  const animeCliBrReady = Boolean(animeCliBr.available && vlc.available);
  const aniCliReady = Boolean(
    aniCli.available &&
    mpv.available &&
    fzf.available &&
    ffmpeg.available &&
    openssl.available &&
    gitBash.available
  );

  return {
    ready: goAnimeGuiReady,
    recommendedProvider: goAnimeGuiReady ? 'goanime-gui' : null,
    providers: {
      goAnime: {
        id: 'goanime-gui',
        name: 'GoAnime GUI',
        ready: goAnimeGuiReady,
        bridge: goAnimeBridge,
        executable: goAnime,
        classicReady: goAnimeClassicReady,
        mpv,
        stability: 'recommended',
        description:
          'Pesquisa, episódios e reprodução em uma janela externa do MPV, com controles integrados ao KitsuneDesk.'
      },
      animeCliBr: {
        id: 'anime-cli-br',
        name: 'anime-cli-br',
        ready: animeCliBrReady,
        executable: animeCliBr,
        vlc,
        stability: 'legacy-source',
        knownIssue: {
          code: 'ANIMEFIRE_DNS',
          message:
            'A fonte animefire.net pode ficar indisponivel por DNS. O KitsuneDesk verifica a fonte antes de abrir e evita o traceback.'
        },
        description: 'Alternativa brasileira legada baseada em AnimeFire e VLC.'
      },
      aniCli: {
        id: 'ani-cli',
        name: 'ani-cli',
        ready: aniCliReady,
        executable: aniCli,
        stability: 'upstream-issue',
        knownIssue: {
          code: 'NO_VALID_SOURCES',
          message:
            'A versao 4.14.1 pode encontrar o episodio sem receber um link valido dos provedores externos.'
        },
        description: 'Mantido como opcao experimental no Git Bash; nunca e usado automaticamente.'
      }
    },
    tools: {
      fastAnimeVsr: {
        id: 'fast-anime-vsr',
        name: 'FAST Anime VSR',
        installed: fastAnimeVsr.installed,
        ready: fastAnimeVsr.ready,
        accelerated: fastAnimeVsr.accelerated,
        path: fastAnimeVsr.path,
        runtime: fastAnimeVsr.runtime,
        description:
          'Ferramenta opcional de super-resolucao para arquivos locais; nao e provedor de streaming.'
      }
    },
    dependencies: {
      goAnime,
      goAnimeBridge,
      animeCliBr,
      aniCli,
      mpv,
      vlc,
      fzf,
      ffmpeg,
      openssl,
      git,
      python,
      nvidia,
      fastAnimeVsr,
      gitBash,
      windowsTerminal,
      cmd
    },
    installCommands: {
      goAnimeGui: [
        'Instalacao automatica e silenciosa de GoAnime + MPV',
        'Runtime Go portatil somente quando o bridge precisar ser compilado',
        'Progresso e verificacao exibidos dentro do KitsuneDesk'
      ],
      animeCliBr: [
        'Python 3.12 isolado e VLC instalados automaticamente',
        'Codigo e dependencias preparados sem usar o Python global',
        'Aviso claro quando a fonte AnimeFire estiver indisponivel'
      ],
      aniCli: [
        'Scoop, Git Bash, fzf, FFmpeg, MPV e OpenSSL',
        'Instalacao oculta com progresso dentro do aplicativo',
        'Aviso preservado sobre a instabilidade das fontes externas'
      ],
      fastAnimeVsr: [
        'Python 3.10, FFmpeg, bibliotecas e PyTorch',
        'Deteccao de NVIDIA/CUDA ao final da preparacao',
        'Ambiente base concluido mesmo quando a aceleracao nao estiver ativa'
      ]
    }
  };
}

function createE2eProviderStatus() {
  const available = { available: true, installed: true, path: 'e2e-fixture' };
  return {
    ready: true,
    recommendedProvider: 'goanime-gui',
    providers: {
      goAnime: {
        id: 'goanime-gui',
        name: 'GoAnime GUI',
        ready: true,
        classicReady: true,
        bridge: { ...available, version: 'e2e' },
        executable: available,
        mpv: available,
        stability: 'recommended'
      },
      animeCliBr: {
        id: 'anime-cli-br',
        name: 'anime-cli-br',
        ready: true,
        executable: available,
        vlc: available,
        stability: 'e2e-fixture'
      },
      aniCli: {
        id: 'ani-cli',
        name: 'ani-cli',
        ready: true,
        executable: available,
        stability: 'e2e-fixture'
      }
    },
    tools: {
      fastAnimeVsr: { id: 'fast-anime-vsr', name: 'FAST Anime VSR', installed: true, ready: true }
    },
    dependencies: {
      goAnime: available,
      goAnimeBridge: available,
      animeCliBr: available,
      aniCli: available,
      mpv: available,
      vlc: available,
      fzf: available,
      ffmpeg: available,
      openssl: available,
      git: available,
      python: available,
      nvidia: available,
      fastAnimeVsr: available,
      gitBash: available,
      windowsTerminal: available,
      cmd: available
    },
    installCommands: {}
  };
}

module.exports = { buildProviderStatus, createE2eProviderStatus, shouldUseE2eFixtures };
