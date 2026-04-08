// /dashboard/dashboard.js
// Handles token verification, data loading, chart rendering, and PDF generation.

(function () {
  'use strict';

  // ── Color palette ──────────────────────────────────────────────────────────
  const C = {
    gold:    '#D6A21C',
    danger:  '#E24B4A',
    warning: '#EF9F27',
    ok:      '#1D9E75',
    purple:  '#7F77DD',
    teal:    '#5DCAA5',
    muted:   '#7a9aaa',
    border:  '#1e3040',
    text:    '#d0e8f0',
    bg:      '#0a1218',
  };

  const GENDER_COLORS = [C.gold, C.purple, C.teal, '#f09595', C.ok];

  // ── State ──────────────────────────────────────────────────────────────────
  let token     = null;
  let dashData  = null;

  // ── DOM helpers ────────────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const e = document.createElement(tag);
    Object.assign(e, props);
    children.forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  // ── Chart.js defaults ─────────────────────────────────────────────────────
  Chart.defaults.color          = '#ffffff';
  Chart.defaults.borderColor    = C.border;
  Chart.defaults.font.family    = "'Open Sans', sans-serif";
  Chart.defaults.font.size      = 11;

  // ── Token from URL ─────────────────────────────────────────────────────────
  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  // ── Main init ──────────────────────────────────────────────────────────────
  async function init() {
    token = getTokenFromUrl();

    if (!token) {
      showAuthError('Acceso no autorizado. Regresa a la página principal para ver los resultados.');
      return;
    }

    // Verify token with server
    let payload;
    try {
      const res  = await fetch('/api/verify-dashboard-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.ok) {
        showAuthError(
          data.error === 'TOKEN_EXPIRED'
            ? 'El enlace ha expirado. Por favor solicita un nuevo acceso desde Resultados.'
            : 'Acceso no válido. Por favor solicita un nuevo acceso desde Resultados.'
        );
        return;
      }
      payload = data;
    } catch (e) {
      showAuthError('Error de conexión. Por favor intenta nuevamente.');
      return;
    }

    // Load dashboard data
    try {
      const res  = await fetch('/api/dashboard-data', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) {
        showAuthError('No se encontraron datos para este análisis. ' + (data.error || ''));
        return;
      }
      dashData = data;
    } catch (e) {
      showAuthError('Error cargando los datos. Por favor intenta nuevamente.');
      return;
    }

    // Show dashboard
    $('authScreen').style.display = 'none';
    $('dashboard').style.display  = 'flex';

    renderAll();
  }

  function showAuthError(msg) {
    const errEl = $('authError');
    errEl.textContent  = msg;
    errEl.style.display = 'block';
    // Hide spinner
    const spinner = document.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
    const p = document.querySelector('.auth-box p');
    if (p) p.textContent = 'No se puede mostrar el dashboard';
  }

  // ── Render all sections ────────────────────────────────────────────────────
  function renderAll() {
    renderHeader();
    renderMetrics();
    renderPrevalenceChart();
    renderGradeGenderCharts();
    renderOlweusChart();
    renderEcology();
    renderCyberChart();
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  function renderHeader() {
    const d = dashData;
    $('hdrSchool').textContent = d.escuela;
    $('hdrMeta').textContent   = `${d.n_estudiantes} estudiantes · ${formatDate(d.analysis_dt)}`;

    // Semáforo from victimization
    const victPrev = getPrevalence('Victimización');
    const cat      = victPrev?.categoria || 'SIN_DATOS';
    const labels   = { CRISIS: 'CRISIS', INTERVENCION: 'INTERVENCIÓN', ATENCION: 'ATENCIÓN', MONITOREO: 'MONITOREO', SIN_DATOS: 'SIN DATOS' };
    const sem = $('hdrSemaforo');
    sem.textContent  = labels[cat] || cat;
    sem.className    = `semaforo-pill pill-${cat}`;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  function renderMetrics() {
    const d = dashData;

    // Victimization
    const vict = getPrevalence('Victimización');
    if (vict) {
      $('metVict').textContent = `${vict.pct}%`;
      $('subVict').innerHTML   = tagHtml(vict.categoria) + ` · ${vict.n_true} de ${vict.n_total}`;
      $('cardVict').className  = 'metric-card ' + catClass(vict.categoria);
    }

    // Perpetration
    const perp = getPrevalence('Perpetración / Agresión');
    if (perp) {
      $('metPerp').textContent = `${perp.pct}%`;
      $('subPerp').innerHTML   = tagHtml(perp.categoria) + ` · ${perp.n_true} de ${perp.n_total}`;
      $('cardPerp').className  = 'metric-card ' + catClass(perp.categoria);
    }

    // Cyber
    const cyber = getPrevalence('Cybervictimización');
    if (cyber) {
      $('metCyber').textContent = `${cyber.pct}%`;
      $('subCyber').innerHTML   = tagHtml(cyber.categoria) + ` · ${cyber.n_true} de ${cyber.n_total}`;
      $('cardCyber').className  = 'metric-card ' + catClass(cyber.categoria);
    }

    // Risk index
    const risk = d.indice_riesgo;
    if (risk?.indice !== null && risk?.indice !== undefined) {
      $('metRisk').textContent = `${risk.indice}/100`;
      const riskCat = risk.indice >= 60 ? 'CRISIS' : risk.indice >= 40 ? 'INTERVENCION' : risk.indice >= 20 ? 'ATENCION' : 'MONITOREO';
      $('subRisk').innerHTML   = tagHtml(riskCat);
      $('cardRisk').className  = 'metric-card ' + catClass(riskCat);
    }

    // N
    $('metN').textContent = d.n_estudiantes;
    $('subN').textContent = `Análisis: ${formatDate(d.analysis_dt)}`;
  }

  // ── Prevalence horizontal bar chart ───────────────────────────────────────
  function renderPrevalenceChart() {
    const d     = dashData;
    const keys  = Object.keys(d.prevalencias);
    const labels = keys;
    const values = keys.map(k => d.prevalencias[k]?.pct || 0);
    const cats   = keys.map(k => d.prevalencias[k]?.categoria || 'SIN_DATOS');
    const colors = cats.map(catColor);

    new Chart($('chartPrevalence'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ` ${ctx.parsed.x}%` }
        }},
        scales: {
          x: { min: 0, max: 100, ticks: { callback: v => `${v}%`, color: '#ffffff' }, grid: { color: C.border } },
          y: { grid: { display: false }, ticks: { color: '#ffffff' } },
        },
      },
    });
  }

  // ── Grade × Gender grouped bar charts ─────────────────────────────────────
  function renderGradeGenderCharts() {
    renderGGChart('chartAgr', dashData.subgrupos_reporte.agresion_por_grado,     dashData.subgrupos_reporte.agresion_por_genero,     '% Agresores');
    renderGGChart('chartVic', dashData.subgrupos_reporte.victimizacion_por_grado, dashData.subgrupos_reporte.victimizacion_por_genero, '% Víctimas');
  }

  function renderGGChart(canvasId, byGrade, byGender, yLabel) {
    const canvas = $(canvasId);
    if (!canvas) return;

    // If no grade data, show "sin datos" message instead of empty chart
    if (!byGrade || byGrade.length === 0) {
      canvas.style.display = 'none';
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#ffffff;font-size:13px;padding:20px 0;';
      msg.textContent = 'Sin datos de grado para este análisis.';
      canvas.parentElement.appendChild(msg);
      return;
    }

    const grades  = byGrade.map(r => r.grupo);
    const genders = [...new Set((byGender || []).map(r => r.grupo))];

    const datasets = [];
    if (genders.length > 0) {
      genders.forEach((gender, i) => {
        const genderTotal = byGender.find(r => r.grupo === gender);
        if (!genderTotal) return;
        const total = byGender.reduce((s, g) => s + g.pct, 0) || 1;
        datasets.push({
          label: gender,
          data: byGrade.map(r => Math.round(r.pct * (genderTotal.pct / total) * 10) / 10),
          backgroundColor: GENDER_COLORS[i % GENDER_COLORS.length],
          borderRadius: 3,
          borderSkipped: false,
        });
      });
    } else {
      // No gender data — show plain grade bars
      datasets.push({
        label: yLabel,
        data: byGrade.map(r => r.pct),
        backgroundColor: C.gold,
        borderRadius: 3,
        borderSkipped: false,
      });
    }

    new Chart(canvas, {
      type: 'bar',
      data: { labels: grades, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 12, color: '#ffffff' },
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` }
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#ffffff' },
          },
          y: {
            min: 0, max: 100,
            ticks: { callback: v => `${v}%`, color: '#ffffff' },
            grid: { color: C.border },
            title: { display: true, text: yLabel, color: '#ffffff' },
          },
        },
      },
    });
  }

  // ── Olweus donut ───────────────────────────────────────────────────────────
  function renderOlweusChart() {
    const t = dashData.tipologia;
    const order  = ['Agresor-Víctima', 'Víctima', 'Agresor', 'No Involucrado'];
    const colors = [C.danger, C.warning, '#FAC775', C.ok];
    const values = order.map(k => t[k]?.n || 0);
    const labels = order.map((k, i) => `${k} (${t[k]?.pct || 0}%)`);

    new Chart($('chartOlweus'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: C.bg }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, color: '#ffffff' } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} estudiantes` } },
        },
      },
    });
  }

  // ── Ecology bars ───────────────────────────────────────────────────────────
  function renderEcology() {
    const eco    = dashData.ecologia_reporte;
    const maxVal = eco.length ? Math.max(...eco.map(e => e.puntuacion_media)) : 4;
    const container = $('ecologyBars');
    container.innerHTML = '';

    if (!eco.length) {
      container.innerHTML = '<div style="color:#ffffff;font-size:13px;">Sin datos de espacios</div>';
      return;
    }

    eco.forEach(e => {
      const pct = Math.round(e.puntuacion_media / 4 * 100);
      const row = el('div', { className: 'bar-row' }, [
        el('div', { className: 'bar-lbl', textContent: e.lugar }),
        el('div', { className: 'bar-track' }, [
          el('div', { className: 'bar-fill', style: `width:${pct}%` }),
        ]),
        el('div', { className: 'bar-val', textContent: e.puntuacion_media.toFixed(1) }),
      ]);
      container.appendChild(row);
    });
  }

  // ── Cyber overlap bar chart ────────────────────────────────────────────────
  function renderCyberChart() {
    const co = dashData.cyber_overlap;
    if (!co) {
      $('chartCyber').parentElement.innerHTML = '<div style="color:var(--muted);font-size:13px;">Sin datos de cyberbullying</div>';
      return;
    }

    new Chart($('chartCyber'), {
      type: 'bar',
      data: {
        labels: ['Bullying tradicional', 'Cyberbullying', 'Afectados en ambos'],
        datasets: [{
          data: [co.pct_tradicionales, co.pct_cyber, co.pct_ambos_de_trad],
          backgroundColor: [C.danger, C.purple, C.warning],
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}%` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#ffffff' } },
          y: { min: 0, max: 100, ticks: { callback: v => `${v}%`, color: '#ffffff' }, grid: { color: C.border } },
        },
      },
    });

    $('cyberText').textContent =
      `${co.pct_ambos_de_trad}% de las víctimas tradicionales también sufren cyberbullying. ` +
      `Esto significa que ${co.ambos} estudiantes enfrentan agresiones en dos frentes simultáneamente.`;
  }

  // ── Priority actions ───────────────────────────────────────────────────────
  function renderActions() {
    const d       = dashData;
    const top3    = d.top3_riesgo || [];
    const eco     = d.ecologia_reporte || [];
    const actions = [];

    // Action 1: based on highest risk area
    if (top3.length) {
      const top = top3[0];
      actions.push({
        icon: '⚠️', bg: '#2a0a0a',
        text: `Intervención urgente — ${top.area}`,
        sub:  `${top.pct}% de estudiantes afectados (${top.n} de ${top.n_total}). Nivel: ${top.categoria}`,
        tag:  'tag-red', tagText: 'Esta semana',
      });
    }

    // Action 2: safety zone in hotspot
    if (eco.length) {
      actions.push({
        icon: '🏫', bg: '#0f1923',
        text: `Zona de Seguridad — ${eco[0].lugar}`,
        sub:  `Espacio más crítico (puntuación ${eco[0].puntuacion_media}). Asignar supervisión activa.`,
        tag:  'tag-amber', tagText: 'Este mes',
      });
    }

    // Action 3: Equipo Zero
    actions.push({
      icon: '👥', bg: '#0f1923',
      text: 'Formar Equipo Zero Bullying',
      sub:  'Director(a), orientador(a), 2 docentes, representante estudiantes y apoderados.',
      tag:  'tag-amber', tagText: 'Este mes',
    });

    // Action 4: re-survey
    actions.push({
      icon: '📋', bg: '#0f1923',
      text: 'Encuesta de seguimiento al final del año',
      sub:  'La única forma de medir el impacto del plan de acción es volver a medir.',
      tag:  'tag-green', tagText: 'Fin de año',
    });

    const list = $('actionsList');
    list.innerHTML = '';
    actions.forEach(a => {
      const item = el('div', { className: 'action-item' }, [
        el('div', { className: 'action-icon', style: `background:${a.bg}`, textContent: a.icon }),
        el('div', {}, [
          el('div', { className: 'action-text', textContent: a.text }),
          el('div', { className: 'action-sub', textContent: a.sub }),
          el('span', { className: `tag ${a.tag}`, textContent: a.tagText, style: 'display:inline-block;margin-top:6px;' }),
        ]),
      ]);
      list.appendChild(item);
    });
  }

  // ── Report generation ──────────────────────────────────────────────────────
  window.generateReport = async function (type) {
    const btnDiag = $('btnGenDiag');
    const btnPlan = $('btnGenPlan');
    if (btnDiag) btnDiag.disabled = true;
    if (btnPlan) btnPlan.disabled = true;
    $('pdfProgress').style.display = 'block';

    const labels = { diagnostic: 'Informe de Diagnóstico', action_plan: 'Plan de Acción' };

    const setProgress = (pct, label) => {
      $('progressFill').style.width  = pct + '%';
      $('progressLabel').textContent = label;
    };

    try {
      setProgress(10, `Generando ${labels[type]}...`);

      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ type, dashData }),
      });

      setProgress(80, 'Finalizando documento...');

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Get filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition') || '';
      const match       = disposition.match(/filename="([^"]+)"/);
      const filename    = match ? match[1] : `${type}_TECH4ZERO.md`;

      // Trigger browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100, `✅ ${labels[type]} descargado`);

    } catch (e) {
      setProgress(0, `❌ Error: ${e.message}. Intenta nuevamente.`);
    } finally {
      if (btnDiag) btnDiag.disabled = false;
      if (btnPlan) btnPlan.disabled = false;
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getPrevalence(name) {
    return dashData?.prevalencias?.[name] || null;
  }

  function catClass(cat) {
    return { CRISIS: 'danger', INTERVENCION: 'warning', ATENCION: 'warning', MONITOREO: 'ok' }[cat] || '';
  }

  function catColor(cat) {
    return { CRISIS: C.danger, INTERVENCION: C.warning, ATENCION: '#FAC775', MONITOREO: C.ok, SIN_DATOS: C.muted }[cat] || C.muted;
  }

  function tagHtml(cat) {
    const labels = { CRISIS: 'CRISIS', INTERVENCION: 'INTERVENCIÓN', ATENCION: 'ATENCIÓN', MONITOREO: 'MONITOREO', SIN_DATOS: 'SIN DATOS' };
    const cls    = { CRISIS: 'tag-red', INTERVENCION: 'tag-amber', ATENCION: 'tag-amber', MONITOREO: 'tag-green', SIN_DATOS: 'tag-gray' };
    return `<span class="tag ${cls[cat] || 'tag-gray'}">${labels[cat] || cat}</span>`;
  }

  function formatDate(dtStr) {
    if (!dtStr) return '—';
    try {
      return new Date(dtStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return dtStr; }
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  init();

})();
