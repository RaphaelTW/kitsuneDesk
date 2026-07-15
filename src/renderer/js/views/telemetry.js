export const features = Object.freeze(['telemetry']);

export function createTelemetryFeature(context) {
  const {
    $,
    animeDesk,
    emptyState,
    escapeHtml,
    notifyResult,
    notifyResultError,
    showToast,
    state
  } = context;

  function bind() {
    $('telemetry-filter-button').addEventListener('click', () => resetAndRender());
    $('telemetry-query').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void resetAndRender();
      }
    });
    $('telemetry-prev').addEventListener('click', () => changePage(-1));
    $('telemetry-next').addEventListener('click', () => changePage(1));
    $('clear-telemetry-button').addEventListener('click', async () => {
      if (!window.confirm('Apagar todos os registros locais de telemetria deste perfil?')) return;
      notifyResult(await animeDesk.diagnostics.clearFailures());
      await resetAndRender();
    });
    $('export-telemetry-json').addEventListener('click', () => exportData('json'));
    $('export-telemetry-csv').addEventListener('click', () => exportData('csv'));
  }

  async function resetAndRender() {
    state.telemetryPage = 1;
    await render();
  }

  function changePage(offset) {
    const next = state.telemetryPage + offset;
    if (next < 1 || next > state.telemetryPages) return;
    state.telemetryPage = next;
    void render();
  }

  function filters() {
    return {
      page: state.telemetryPage,
      pageSize: 25,
      query: $('telemetry-query').value,
      scope: $('telemetry-scope').value,
      event: $('telemetry-event').value,
      from: $('telemetry-from').value,
      to: $('telemetry-to').value
    };
  }

  async function render() {
    const [result, startupResult] = await Promise.all([
      animeDesk.diagnostics.listFailures(filters()),
      animeDesk.diagnostics.startupPerformance()
    ]);
    if (!result.ok) return notifyResultError(result);
    if (startupResult.ok) renderStartup(startupResult.data);
    const data = result.data;
    state.telemetryPages = data.pages || 1;
    state.telemetryPage = Math.min(data.page || 1, state.telemetryPages);
    populateFacets(data.facets);
    $('telemetry-summary').textContent =
      `${data.total || 0} registro(s) encontrado(s). A telemetria fica somente neste computador.`;
    $('telemetry-page').textContent = `Página ${state.telemetryPage} de ${state.telemetryPages}`;
    $('telemetry-prev').disabled = state.telemetryPage <= 1;
    $('telemetry-next').disabled = state.telemetryPage >= state.telemetryPages;
    const container = $('telemetry-list');
    container.replaceChildren();
    if (!data.items?.length) {
      container.append(emptyState('bi-activity', 'Nenhuma falha registrada com esses filtros.'));
      return;
    }
    data.items.forEach((item) => container.append(createItem(item)));
  }

  function renderStartup(summary = {}) {
    const cards = $('startup-metrics-cards');
    cards.replaceChildren();
    const retention = Number(summary.retentionDays || 0);
    $('startup-metrics-summary').textContent = summary.enabled
      ? `${summary.count || 0} abertura(s) local(is) · retenção ${retention ? `${retention} dias` : 'sem expiração'}.`
      : 'Ative as métricas de abertura nas configurações para gerar este gráfico local.';
    for (const [label, value] of [
      ['Mediana', summary.medianCoreMs],
      ['Percentil 95', summary.p95CoreMs],
      ['Mais rápida', summary.fastestCoreMs],
      ['Mais lenta', summary.slowestCoreMs]
    ]) {
      const article = document.createElement('article');
      const strong = document.createElement('strong');
      const small = document.createElement('small');
      strong.textContent = `${Math.round(Number(value || 0))} ms`;
      small.textContent = label;
      article.append(strong, small);
      cards.append(article);
    }
    renderChart(summary.series || []);
  }

  function renderChart(series) {
    const svg = $('startup-metrics-chart');
    svg.replaceChildren();
    const width = 720;
    const height = 240;
    const padding = 30;
    const maximum = Math.max(100, ...series.map((point) => Number(point.medianCoreMs || 0)));
    const days = [...new Set(series.map((point) => point.day))];
    const colors = { cold: '#ff6b9f', warm: '#56c8ff', snapshot: '#9c7cff' };
    const svgNode = (tag, attributes = {}) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      return node;
    };
    for (let line = 0; line <= 4; line += 1) {
      const y = padding + ((height - padding * 2) * line) / 4;
      svg.append(
        svgNode('line', {
          x1: padding,
          y1: y,
          x2: width - padding,
          y2: y,
          class: 'startup-chart-grid'
        })
      );
    }
    if (!days.length) return;
    for (const type of ['cold', 'warm', 'snapshot']) {
      const points = series
        .filter((point) => point.type === type)
        .map((point) => {
          const dayIndex = days.indexOf(point.day);
          const x =
            days.length === 1
              ? width / 2
              : padding + (dayIndex / (days.length - 1)) * (width - padding * 2);
          const y =
            height - padding - (Number(point.medianCoreMs || 0) / maximum) * (height - padding * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
      if (points.length)
        svg.append(
          svgNode('polyline', {
            points: points.join(' '),
            fill: 'none',
            stroke: colors[type],
            'stroke-width': 4,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          })
        );
    }
  }

  function populateFacets(facets = {}) {
    const fill = (select, rows, label) => {
      const current = select.value;
      select.replaceChildren(new Option(label, ''));
      (rows || []).forEach((row) =>
        select.append(new Option(`${row.value} (${row.total})`, row.value))
      );
      select.value = current;
    };
    fill($('telemetry-scope'), facets.scopes, 'Todos os contextos');
    fill($('telemetry-event'), facets.events, 'Todos os eventos');
  }

  function createItem(item) {
    const article = document.createElement('article');
    article.className = 'telemetry-item';
    const header = document.createElement('header');
    const title = document.createElement('div');
    title.innerHTML = `<code>${escapeHtml(item.scope)}</code> · <strong>${escapeHtml(item.event)}</strong>`;
    const time = document.createElement('small');
    time.textContent = new Date(`${item.created_at}Z`).toLocaleString('pt-BR');
    header.append(title, time);
    const message = document.createElement('p');
    message.textContent = item.message || 'Sem mensagem.';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Detalhes técnicos';
    const pre = document.createElement('pre');
    pre.textContent = formatJson(item.metadata);
    details.append(summary, pre);
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const copy = document.createElement('button');
    copy.className = 'btn btn-outline-light btn-sm';
    copy.type = 'button';
    copy.innerHTML = '<i class="bi bi-copy"></i> Copiar';
    copy.addEventListener('click', () =>
      navigator.clipboard.writeText(
        `${item.scope} · ${item.event}\n${item.message}\n${pre.textContent}`
      )
    );
    const remove = document.createElement('button');
    remove.className = 'btn btn-outline-danger btn-sm';
    remove.type = 'button';
    remove.innerHTML = '<i class="bi bi-trash"></i> Excluir';
    remove.addEventListener('click', async () => {
      const result = await animeDesk.diagnostics.removeFailures([item.id]);
      if (!result.ok) return notifyResultError(result);
      await render();
    });
    actions.append(copy, remove);
    article.append(header, message, details, actions);
    return article;
  }

  async function exportData(format) {
    const result = await animeDesk.diagnostics.exportFailures(format, filters());
    if (!result.ok) return notifyResultError(result);
    if (!result.data?.canceled)
      showToast({
        title: 'Telemetria exportada',
        message: 'O arquivo foi salvo com os filtros atuais.',
        variant: 'success'
      });
  }

  return { bind, render };
}

function formatJson(value) {
  try {
    return JSON.stringify(JSON.parse(value || '{}'), null, 2);
  } catch {
    return String(value || '');
  }
}
