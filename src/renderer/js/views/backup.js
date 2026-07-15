export function createBackupFeature(context) {
  const {
    $,
    animeDesk,
    applyTheme,
    formatBytes,
    hydrateDashboard,
    notifyResult,
    notifyResultError,
    showToast,
    state
  } = context;

  function bind() {
    $('export-library-button').addEventListener('click', async () => {
      const result = await animeDesk.backup.exportLibrary();
      if (!result.ok) return notifyResultError(result);
      if (!result.data?.canceled)
        showToast({
          title: 'Biblioteca exportada',
          message: formatSummary(result.data.summary),
          variant: 'success'
        });
    });
    $('import-library-button').addEventListener('click', async () => {
      const replace = window.confirm(
        'Deseja substituir a biblioteca atual? Clique em Cancelar para mesclar os dados.'
      );
      const result = await animeDesk.backup.importLibrary(replace ? 'replace' : 'merge');
      if (!result.ok) return notifyResultError(result);
      if (!result.data?.canceled) {
        showToast({
          title: 'Biblioteca restaurada',
          message: formatSummary(result.data.summary),
          variant: 'success'
        });
        await hydrateDashboard();
      }
    });
    $('export-profiles-button').addEventListener('click', async () => {
      const password = window.prompt(
        'Digite uma senha com pelo menos 8 caracteres para proteger o backup:'
      );
      if (!password) return;
      const result = await animeDesk.backup.exportProfiles(password);
      if (!result.ok) return notifyResultError(result);
      if (!result.data?.canceled)
        showToast({
          title: 'Perfis protegidos',
          message: `${result.data.profiles} perfil(is) exportado(s).`,
          variant: 'success'
        });
    });
    $('import-profiles-button').addEventListener('click', async () => {
      const password = window.prompt('Digite a senha do backup criptografado:');
      if (!password) return;
      const result = await animeDesk.backup.importProfiles(password);
      if (!result.ok) return notifyResultError(result);
      if (!result.data?.canceled) {
        showToast({
          title: 'Perfis restaurados',
          message: `${result.data.createdProfiles} criado(s) e ${result.data.updatedProfiles} atualizado(s). Tema preservado.`,
          variant: 'success'
        });
        applyTheme(state.settings?.theme || document.body.dataset.theme || 'dark');
      }
    });
    $('schedule-profiles-button').addEventListener('click', schedule);
    $('run-scheduled-backup-button').addEventListener('click', runScheduled);
    $('validate-profiles-backup-button').addEventListener('click', validate);
    $('clear-app-cache-button').addEventListener('click', async () => {
      if (!window.confirm('Limpar resultados, capas e avatares armazenados localmente?')) return;
      notifyResult(await animeDesk.cache.clear());
      await hydrateCache();
    });
  }

  async function hydrateCache() {
    const result = await animeDesk.cache.stats();
    if (!result.ok) return;
    const entries = (result.data.entries || []).reduce(
      (total, item) => total + Number(item.total || 0),
      0
    );
    const bytes = (result.data.disk || []).reduce(
      (total, item) => total + Number(item.bytes || 0),
      0
    );
    $('cache-summary').textContent =
      `${entries} resultado(s) em cache · ${formatBytes(bytes)} em capas e avatares.`;
  }

  async function schedule() {
    const password = window.prompt('Digite uma senha com pelo menos 8 caracteres para a agenda:');
    if (!password) return;
    const cadence =
      window.prompt('Frequência do backup: daily, weekly ou monthly', 'daily') || 'daily';
    const result = await animeDesk.backup.scheduleProfiles({
      password,
      cadence: cadence.trim(),
      validateRestore: true
    });
    if (!result.ok) return notifyResultError(result);
    if (!result.data?.canceled) {
      showToast({
        title: 'Backup agendado',
        message: 'A agenda criptografada foi salva e validará os arquivos automaticamente.',
        variant: 'success'
      });
      await renderSchedules();
    }
  }

  async function runScheduled() {
    const result = await animeDesk.backup.runScheduledProfiles();
    if (!result.ok) return notifyResultError(result);
    if (result.data?.executed) {
      showToast({
        title: 'Backup agendado executado',
        message: `${result.data.profiles} perfil(is) exportado(s) e validação concluída.`,
        variant: 'success'
      });
      await renderSchedules();
    }
  }

  async function validate() {
    const password = window.prompt('Digite a senha do backup criptografado:');
    if (!password) return;
    const result = await animeDesk.backup.validateProfiles(password);
    if (!result.ok) return notifyResultError(result);
    if (!result.data?.canceled)
      showToast({
        title: 'Backup validado',
        message: `${result.data.profiles} perfil(is) lido(s). Nenhum dado foi restaurado.`,
        variant: 'success'
      });
  }

  async function renderSchedules() {
    if (state.session?.user?.role !== 'ADMIN' || !animeDesk.backup?.listSchedules) return;
    const summary = $('backup-schedule-summary');
    const result = await animeDesk.backup.listSchedules();
    if (!result.ok) {
      summary.textContent = 'Não foi possível carregar a agenda de backup.';
      return;
    }
    const schedule = (result.data || [])[0];
    if (!schedule) {
      summary.textContent = 'Nenhum backup criptografado agendado.';
      return;
    }
    const last = schedule.lastRunAt
      ? new Date(schedule.lastRunAt).toLocaleString('pt-BR')
      : 'ainda não executado';
    summary.textContent = `Agenda: ${schedule.cadence} · pasta: ${schedule.targetPath} · último: ${last} · ${schedule.validateRestore ? 'validação ativa' : 'sem validação'}`;
  }

  async function runDue() {
    if (!animeDesk.backup?.runDue || state.session?.user?.role !== 'ADMIN') return;
    try {
      const result = await animeDesk.backup.runDue();
      if (result.ok && result.data?.executed) await renderSchedules();
    } catch {
      // A agenda nunca atrasa a abertura.
    }
  }

  return { bind, hydrateCache, renderSchedules, runDue };
}

function formatSummary(summary = {}) {
  return `${summary.favorites || 0} favorito(s), ${summary.watchlist || 0} item(ns) na lista, ${summary.history || 0} registro(s) de histórico e ${summary.playbackSessions || 0} progresso(s).`;
}
