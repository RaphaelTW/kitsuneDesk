export function createMaintenanceFeature(context) {
  const {
    $,
    animeDesk,
    applyTheme,
    hydratePlayerStatus,
    notifyResult,
    notifyResultError,
    showToast,
    startInstallation,
    state
  } = context;
  let bound = false;
  let providerHealthPromise = null;

  function bind() {
    if (bound) return;
    bound = true;
    $('run-diagnostics-button').addEventListener('click', runMaintenanceCheck);
    $('export-diagnostics-button').addEventListener('click', async () =>
      notifyResult(await animeDesk.diagnostics.export())
    );
    $('check-updates-button').addEventListener('click', () => checkUpdates(true));
    $('repair-native-button').addEventListener('click', async () => {
      appendLog('Iniciando reconstrução do better-sqlite3...');
      notifyResult(await animeDesk.diagnostics.repairNative());
      await runDiagnostics();
    });
    $('clear-cache-button').addEventListener('click', async () => {
      notifyResult(await animeDesk.diagnostics.clearCache());
      await runDiagnostics();
    });
    $('restore-components-button').addEventListener('click', async () => {
      if (
        !window.confirm(
          'Restaurar os componentes locais? Histórico e configurações serão preservados.'
        )
      )
        return;
      await preserveThemeAround(async () => {
        notifyResult(await animeDesk.diagnostics.restoreComponents());
        await hydratePlayerStatus();
        await runDiagnostics();
        await hydrateProviderHealth();
        await checkUpdates(false);
      });
    });
    document.querySelectorAll('[data-repair-provider]').forEach((button) => {
      button.addEventListener('click', () => startInstallation(button.dataset.repairProvider));
    });
  }

  async function openUpdates() {
    if (['available', 'downloading', 'downloaded'].includes(state.update?.state)) {
      state.updateBannerDismissed = false;
      renderUpdateBanner(state.update);
      return;
    }
    await checkUpdates(true);
  }

  function hydrateProviderHealth() {
    if (providerHealthPromise) return providerHealthPromise;
    providerHealthPromise = runProviderHealth().finally(() => {
      providerHealthPromise = null;
      $('provider-health-button').disabled = false;
    });
    return providerHealthPromise;
  }

  async function runProviderHealth() {
    const dot = $('provider-health-dot');
    $('provider-health-button').disabled = true;
    dot.className = 'status-dot is-checking';
    $('provider-health-summary').textContent = 'Verificando provedores';
    const result = await animeDesk.providers.health();
    if (!result.ok) {
      dot.className = 'status-dot is-offline';
      $('provider-health-summary').textContent = 'Falha na verificação';
      return;
    }
    const online = result.data.providers.filter((provider) => provider.state === 'online').length;
    const unstable = result.data.providers.filter(
      (provider) => provider.state === 'unstable'
    ).length;
    dot.className = `status-dot ${online >= 2 ? 'is-online' : online ? 'is-warning' : 'is-offline'}`;
    $('provider-health-summary').textContent =
      `${online} online${unstable ? ` · ${unstable} instável` : ''}`;
    showToast({
      title: 'Saúde dos provedores',
      message: result.data.providers
        .map((provider) => `${provider.name}: ${provider.message}`)
        .join(' | '),
      variant: online ? 'info' : 'warning'
    });
  }

  function renderIdle() {
    const container = $('diagnostic-grid');
    if (container.children.length > 0) return;
    container.append(
      diagnosticCard('Pronto para verificar', [
        ['Tema', state.settings?.theme || document.body.dataset.theme || 'dark'],
        ['Ação', 'Clique em Verificar sistema'],
        ['Escopo', 'Sistema, provedores e atualizações']
      ])
    );
    $('diagnostic-log').textContent =
      'Aguardando verificação manual para evitar travamento ao abrir.';
  }

  async function runMaintenanceCheck() {
    await preserveThemeAround(async () => {
      appendLog('Verificação manual iniciada. O tema atual será preservado.');
      appendLog('Restaurando componentes locais sem alterar tema, histórico ou perfis...');
      notifyResult(await animeDesk.diagnostics.restoreComponents());
      await runDiagnostics();
      await hydrateProviderHealth();
      await hydratePlayerStatus();
      await checkUpdates(false);
      appendLog('Sistema, provedores e atualizações verificados. Tema preservado.');
    });
  }

  async function preserveThemeAround(action) {
    const theme = state.settings?.theme || document.body.dataset.theme || 'dark';
    try {
      return await action();
    } finally {
      applyTheme(theme);
      if (state.settings) state.settings.theme = theme;
      const field = $('setting-theme');
      if (field) field.value = theme;
    }
  }

  async function runDiagnostics() {
    const result = await animeDesk.diagnostics.run();
    if (!result.ok) {
      notifyResultError(result);
      return;
    }
    const report = result.data;
    const container = $('diagnostic-grid');
    container.replaceChildren();
    container.append(
      diagnosticCard('Aplicativo', [
        ['Versão', report.app.version],
        ['Electron', report.app.electron],
        ['Node', report.app.node],
        ['Modo', report.app.packaged ? 'Instalado' : 'Desenvolvimento']
      ]),
      diagnosticCard('Banco local', [
        ['Modo', report.database.mode],
        ['Módulo nativo', report.database.nativeModule],
        ['Arquivo', report.database.exists ? 'Encontrado' : 'Ausente']
      ]),
      diagnosticCard('GoAnime', [
        ['GUI', report.providers.goAnime.ready ? 'Pronto' : 'Reparo necessário'],
        ['Clássico', report.providers.goAnime.classicReady ? 'Pronto' : 'Indisponível'],
        ['Bridge', report.providers.goAnime.bridge?.version || 'Não instalado'],
        ['MPV', report.dependencies.mpv.available ? 'Encontrado' : 'Ausente']
      ]),
      diagnosticCard('Ferramentas', [
        ['anime-cli-br', report.providers.animeCliBr.ready ? 'Pronto' : 'Indisponível'],
        ['ani-cli', report.providers.aniCli.ready ? 'Experimental' : 'Indisponível'],
        ['FAST Anime VSR', report.tools.fastAnimeVsr.ready ? 'Pronto' : 'Não preparado']
      ]),
      diagnosticCard('Telemetria local', [
        ['Estado', report.telemetry?.enabled ? 'Ativa' : 'Desativada'],
        ['Falhas recentes', report.telemetry?.recentFailures?.length || 0]
      ]),
      diagnosticCard('Tempo de abertura', [
        ['Estado', report.startupPerformance?.enabled ? 'Ativo' : 'Desativado'],
        ['Amostras', report.startupPerformance?.count || 0],
        ['Média da interface', formatDuration(report.startupPerformance?.averageShellMs)],
        ['Média dos dados principais', formatDuration(report.startupPerformance?.averageCoreMs)]
      ])
    );
    appendLog(`Verificação concluída em ${new Date(report.checkedAt).toLocaleString('pt-BR')}.`);
  }

  function diagnosticCard(title, rows) {
    const card = document.createElement('article');
    card.className = 'diagnostic-card';
    const header = document.createElement('header');
    const heading = document.createElement('strong');
    heading.textContent = title;
    header.append(heading);
    const list = document.createElement('dl');
    rows.forEach(([term, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = String(value);
      row.append(dt, dd);
      list.append(row);
    });
    card.append(header, list);
    return card;
  }

  function appendLog(message) {
    if (!message) return;
    const log = $('diagnostic-log');
    const current = log.textContent === 'Aguardando verificação...' ? '' : log.textContent;
    log.textContent = `${current}${current ? '\n' : ''}${new Date().toLocaleTimeString('pt-BR')}  ${message}`;
    log.scrollTop = log.scrollHeight;
  }

  function formatDuration(value) {
    const milliseconds = Number(value || 0);
    return milliseconds > 0 ? `${milliseconds.toLocaleString('pt-BR')} ms` : 'Sem amostras';
  }

  async function hydrateUpdateStatus() {
    const result = await animeDesk.updates.status();
    if (result.ok) handleUpdateState(result.data, false);
  }

  async function checkUpdates(showFeedback) {
    const result = await animeDesk.updates.check();
    if (!result.ok) {
      if (showFeedback) notifyResultError(result);
      return;
    }
    handleUpdateState(result.data, showFeedback);
  }

  async function installDownloadedUpdate() {
    const button = $('install-update-button');
    button.disabled = true;
    button.innerHTML = '<span class="neon-spinner neon-spinner-sm"></span> Reiniciando...';
    const result = await animeDesk.updates.install();
    if (!result.ok || !result.data?.installed) {
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-arrow-repeat"></i> Instalar e reiniciar';
      notifyResult(result);
    }
  }

  function handleUpdateState(update, showFeedback = false) {
    if (!update) return;
    const previousState = state.update?.state;
    const previousVersion = state.update?.info?.version;
    const incomingVersion = update.info?.version;
    if (incomingVersion && incomingVersion !== previousVersion) state.updateBannerDismissed = false;
    if (update.state === 'downloaded' && previousState !== 'downloaded')
      state.updateBannerDismissed = false;
    state.update = update;
    const available = ['available', 'downloading', 'downloaded'].includes(update.state);
    $('update-notification').classList.toggle('d-none', !available);
    renderUpdateBanner(update);
    const messages = {
      development: update.message,
      checking: 'Procurando uma nova versão no GitHub...',
      available: `Nova versão ${formatUpdateVersion(update)} encontrada. O download foi iniciado.`,
      downloading: `Baixando atualização: ${Math.round(update.progress?.percent || 0)}%`,
      downloaded: `A versão ${formatUpdateVersion(update)} está pronta para instalar.`,
      'not-available': 'Você já está usando a versão mais recente.',
      error: update.message || 'Não foi possível verificar atualizações.'
    };
    const important =
      ['available', 'downloaded', 'error'].includes(update.state) &&
      (previousState !== update.state || previousVersion !== update.info?.version);
    if (!showFeedback && !important) return;
    showToast({
      title: 'Atualizações',
      message: messages[update.state] || 'Estado de atualização recebido.',
      variant:
        update.state === 'error'
          ? 'error'
          : update.state === 'downloaded' || update.state === 'not-available'
            ? 'success'
            : 'info'
    });
  }

  function renderUpdateBanner(update) {
    const banner = $('update-banner');
    const visible = ['available', 'downloading', 'downloaded'].includes(update?.state);
    if (!visible || state.updateBannerDismissed) {
      banner.classList.add('d-none');
      return;
    }
    banner.classList.remove('d-none');
    const version = formatUpdateVersion(update);
    $('update-banner-version').textContent = version;
    $('update-banner-title').textContent =
      update.state === 'downloaded' ? 'Atualização pronta para instalar' : 'Nova versão disponível';
    const percent = Math.max(0, Math.min(100, Math.round(update.progress?.percent || 0)));
    $('update-progress-wrap').classList.toggle('d-none', update.state !== 'downloading');
    $('update-progress-bar').style.width = `${percent}%`;
    $('update-progress-label').textContent = `${percent}%`;
    const messages = {
      available:
        'O download foi iniciado em segundo plano. Você pode continuar usando o aplicativo.',
      downloading: `Baixando os arquivos da versão ${version}.`,
      downloaded:
        'Clique em Instalar e reiniciar, ou feche o aplicativo para atualizar automaticamente.'
    };
    $('update-banner-message').textContent = messages[update.state] || 'Preparando atualização...';
    const notes = String(update.info?.releaseNotes || '').trim();
    $('update-release-notes-wrap').classList.toggle('d-none', !notes);
    $('update-release-notes').textContent = notes;
    $('install-update-button').classList.toggle('d-none', update.state !== 'downloaded');
  }

  function formatUpdateVersion(update) {
    const version = String(update?.info?.version || '').trim();
    return version ? `v${version.replace(/^v/i, '')}` : 'mais recente';
  }

  return {
    bind,
    appendLog,
    checkUpdates,
    handleUpdateState,
    hydrateProviderHealth,
    hydrateUpdateStatus,
    installDownloadedUpdate,
    openUpdates,
    renderIdle
  };
}

export const features = ['diagnostics'];
