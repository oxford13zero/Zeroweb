// /dashboard/dashboard.js
// Handles token verification, data loading, chart rendering, and PDF generation.

(function () {
  'use strict';

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

  let token    = null;
  let dashData = null;

  const $  = id => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const e = document.createElement(tag);
    Object.assign(e, props);
    children.forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  Chart.defaults.color       = '#ffffff';
  Chart.defaults.borderColor = C.border;
  Chart.defaults.font.family = "'Open Sans', sans-serif";
  Chart.defaults.font.size   = 11;

  function getTokenFromUrl() {
    return new URLSearchParams(window.location.search).get('token');
  }

  async function init() {
    token = getTokenFromUrl();
    if (!token) { showAuthError('Acceso no autorizado. Regresa a la página principal.'); return; }

    try {
      const res  = await fetch('/api/verify-dashboard-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      
const data = await res.json();
      if (!data.ok) {
        showAuthError(data.error === 'TOKEN_EXPIRED'
          ? 'El enlace ha expirado. Por favor solicita un nuevo acceso desde Resultados.'
          : 'Acceso no válido. Por favor solicita un nuevo acceso desde Resultados.');
        return;
      }
      // Hide report buttons for non-admin users
      if (data.role !== 'admin') {
        const pdfRow = document.querySelector('.pdf-row');
        if (pdfRow) pdfRow.style.display = 'none';
      }
    } catch (e) { showAuthError('Error de conexión. Por favor intenta nuevamente.'); return; }
    

    

    try {
      const res  = await fetch('/api/dashboard-data', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (!data.ok) { showAuthError('No se encontraron datos para este análisis. ' + (data.error || '')); return; }
      dashData = data;
    } catch (e) { showAuthError('Error cargando los datos. Por favor intenta nuevamente.'); return; }

    $('authScreen').style.display = 'none';
    $('dashboard').style.display  = 'flex';
    renderAll();
  }

  function showAuthError(msg) {
    const errEl = $('authError');
    errEl.textContent = msg; errEl.style.display = 'block';
    const spinner = document.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
    const p = document.querySelector('.auth-box p');
    if (p) p.textContent = 'No se puede mostrar el dashboard';
  }

  function renderAll() {
    renderHeader();
    renderMetrics();
    renderPrevalenceChart();
    renderGradeGenderCharts();
    renderOlweusChart();
    renderEcology();
    renderCyberChart();
  }

  function renderHeader() {
    const d = dashData;
    $('hdrSchool').textContent = d.escuela;
    $('hdrMeta').textContent   = `${d.n_estudiantes} estudiantes · ${formatDate(d.analysis_dt)}`;
    const victPrev = getPrevalence('Victimización');
    const cat      = victPrev?.categoria || 'SIN_DATOS';
    const labels   = { CRISIS:'CRISIS', INTERVENCION:'INTERVENCIÓN', ATENCION:'ATENCIÓN', MONITOREO:'MONITOREO', SIN_DATOS:'SIN DATOS' };
    const sem = $('hdrSemaforo');
    sem.textContent = labels[cat] || cat;
    sem.className   = `semaforo-pill pill-${cat}`;
  }

  function renderMetrics() {
    const d = dashData;
    const vict = getPrevalence('Victimización');
    if (vict) {
      $('metVict').textContent = `${vict.pct}%`;
      $('subVict').innerHTML   = tagHtml(vict.categoria) + ` · ${vict.n_true} de ${vict.n_total}`;
      $('cardVict').className  = 'metric-card ' + catClass(vict.categoria);
    }
    const perp = getPrevalence('Perpetración / Agresión');
    if (perp) {
      $('metPerp').textContent = `${perp.pct}%`;
      $('subPerp').innerHTML   = tagHtml(perp.categoria) + ` · ${perp.n_true} de ${perp.n_total}`;
      $('cardPerp').className  = 'metric-card ' + catClass(perp.categoria);
    }
    const cyber = getPrevalence('Cybervictimización');
    if (cyber) {
      $('metCyber').textContent = `${cyber.pct}%`;
      $('subCyber').innerHTML   = tagHtml(cyber.categoria) + ` · ${cyber.n_true} de ${cyber.n_total}`;
      $('cardCyber').className  = 'metric-card ' + catClass(cyber.categoria);
    }
    const risk = d.indice_riesgo;
    if (risk?.indice !== null && risk?.indice !== undefined) {
      $('metRisk').textContent = `${risk.indice}/100`;
      const riskCat = risk.indice >= 60 ? 'CRISIS' : risk.indice >= 40 ? 'INTERVENCION' : risk.indice >= 20 ? 'ATENCION' : 'MONITOREO';
      $('subRisk').innerHTML   = tagHtml(riskCat);
      $('cardRisk').className  = 'metric-card ' + catClass(riskCat);
    }
    $('metN').textContent = d.n_estudiantes;
    $('subN').textContent = `Análisis: ${formatDate(d.analysis_dt)}`;

    // Representativeness
    const rep     = d.representatividad;
    const repCard = $('cardRep');
    if (rep && repCard) {
      const ok = rep.es_representativa;
      $('metRep').innerHTML = ok
        ? '<span style="color:#9FE1CB;">✓ Representativa</span>'
        : '<span style="color:#f09595;">✗ Insuficiente</span>';
      $('subRep').innerHTML =
        `${rep.pct_encuestados}% encuestados · ±${rep.margen_error_real}% error<br>` +
        `<span style="font-size:10px;color:#7a9aaa;">Mínimo: ${rep.muestra_minima} de ${rep.total_matriculados}</span>`;
      repCard.className = 'metric-card ' + (ok ? 'ok' : 'danger');
    } else if (repCard) {
      $('metRep').textContent = '—';
      $('subRep').textContent = 'Sin datos de matrícula';
    }
  }

  function renderPrevalenceChart() {
    const d      = dashData;
    const keys   = Object.keys(d.prevalencias);
    const values = keys.map(k => d.prevalencias[k]?.pct || 0);
    const colors = keys.map(k => catColor(d.prevalencias[k]?.categoria || 'SIN_DATOS'));
    new Chart($('chartPrevalence'), {
      type: 'bar',
      data: { labels: keys, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}%` } } },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: v => `${v}%`, color: '#ffffff' }, grid: { color: C.border } },
          y: { grid: { display: false }, ticks: { color: '#ffffff' } },
        },
      },
    });
  }

  // ── Semáforo helpers ───────────────────────────────────────────────────────
  const CAT_STYLE = {
    CRISIS:       { label:'CRISIS',        color:'#f09595', bg:'#2a0a0a', border:'#a32d2d' },
    INTERVENCION: { label:'INTERVENCIÓN',  color:'#FAC775', bg:'#2a1500', border:'#854F0B' },
    ATENCION:     { label:'ATENCIÓN',      color:'#FAC775', bg:'#1a1500', border:'#634806' },
    MONITOREO:    { label:'MONITOREO',     color:'#9FE1CB', bg:'#0a1a0a', border:'#0F6E56' },
  };

  function getSem(pct) {
    if (pct >= 20) return CAT_STYLE.CRISIS;
    if (pct >= 10) return CAT_STYLE.INTERVENCION;
    if (pct >= 5)  return CAT_STYLE.ATENCION;
    return CAT_STYLE.MONITOREO;
  }

  function semTag(pct) {
    const s = getSem(pct);
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;color:${s.color};background:${s.bg};border:0.5px solid ${s.border};">${s.label}</span>`;
  }

  // ── 4-panel grade/gender section ───────────────────────────────────────────
  function renderGradeGenderCharts() {
    const sub = dashData.subgrupos_reporte;
    renderGradeBarChart('chartVicGrade', (sub.victimizacion_por_grado || []).slice(0, 7), '% Victimización');
    renderGradeBarChart('chartAgrGrade', (sub.agresion_por_grado      || []).slice(0, 7), '% Agresión');
    renderGenderTable('tableVicGen', sub.victimizacion_por_genero || []);
    renderGenderTable('tableAgrGen', sub.agresion_por_genero      || []);
  }

  function renderGradeBarChart(canvasId, rows, yLabel) {
    const canvas = $(canvasId);
    if (!canvas) return;
    if (!rows || rows.length === 0) {
      canvas.style.display = 'none';
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#ffffff;font-size:13px;padding:20px 0;';
      msg.textContent = 'Sin datos de grado para este análisis.';
      canvas.parentElement.appendChild(msg);
      return;
    }
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.grupo),
        datasets: [{
          data: rows.map(r => r.pct),
          backgroundColor: rows.map(r => getSem(r.pct).color),
          borderRadius: 4, borderSkipped: false,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}% (${rows[ctx.dataIndex].n} de ${rows[ctx.dataIndex].n_total})` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#ffffff' } },
          y: { min: 0, max: 100, ticks: { callback: v => `${v}%`, color: '#ffffff' }, grid: { color: C.border }, title: { display: true, text: yLabel, color: '#ffffff' } },
        },
      },
    });
  }

  function renderGenderTable(containerId, rows) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!rows || rows.length === 0) {
      container.innerHTML = '<div style="color:#ffffff;font-size:13px;padding:12px 0;">Sin datos de género.</div>';
      return;
    }
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    table.innerHTML = `<thead><tr style="border-bottom:0.5px solid #1e3040;">
      <th style="text-align:left;padding:8px 6px;color:#ffffff;font-weight:600;">Género</th>
      <th style="text-align:right;padding:8px 6px;color:#ffffff;font-weight:600;">%</th>
      <th style="text-align:right;padding:8px 6px;color:#ffffff;font-weight:600;">N</th>
      <th style="text-align:center;padding:8px 6px;color:#ffffff;font-weight:600;">Nivel</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      tr.style.cssText = `border-bottom:0.5px solid #1e3040;${i % 2 === 0 ? 'background:#0f1923;' : ''}`;
      tr.innerHTML = `
        <td style="padding:8px 6px;color:#ffffff;">${row.grupo}</td>
        <td style="padding:8px 6px;color:#ffffff;text-align:right;font-weight:600;">${row.pct}%</td>
        <td style="padding:8px 6px;color:#7a9aaa;text-align:right;">${row.n} / ${row.n_total}</td>
        <td style="padding:8px 6px;text-align:center;">${semTag(row.pct)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderOlweusChart() {
    const t      = dashData.tipologia;
    const order  = ['Agresor-Víctima', 'Víctima', 'Agresor', 'No Involucrado'];
    const colors = [C.danger, C.warning, '#FAC775', C.ok];
    new Chart($('chartOlweus'), {
      type: 'doughnut',
      data: { labels: order.map(k => `${k} (${t[k]?.pct || 0}%)`), datasets: [{ data: order.map(k => t[k]?.n || 0), backgroundColor: colors, borderWidth: 2, borderColor: C.bg }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, color: '#ffffff' } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} estudiantes` } },
        },
      },
    });
  }

  function renderEcology() {
    const eco       = dashData.ecologia_reporte;
    const container = $('ecologyBars');
    container.innerHTML = '';
    if (!eco.length) { container.innerHTML = '<div style="color:#ffffff;font-size:13px;">Sin datos de espacios</div>'; return; }
    eco.forEach(e => {
      const pct = Math.round(e.puntuacion_media / 4 * 100);
      container.appendChild(el('div', { className: 'bar-row' }, [
        el('div', { className: 'bar-lbl', textContent: e.lugar }),
        el('div', { className: 'bar-track' }, [el('div', { className: 'bar-fill', style: `width:${pct}%` })]),
        el('div', { className: 'bar-val', textContent: e.puntuacion_media.toFixed(1) }),
      ]));
    });
  }

  function renderCyberChart() {
    const co = dashData.cyber_overlap;
    if (!co) { $('chartCyber').parentElement.innerHTML = '<div style="color:#ffffff;font-size:13px;">Sin datos de cyberbullying</div>'; return; }
    new Chart($('chartCyber'), {
      type: 'bar',
      data: {
        labels: ['Bullying tradicional', 'Cyberbullying', 'Afectados en ambos'],
        datasets: [{ data: [co.pct_tradicionales, co.pct_cyber, co.pct_ambos_de_trad], backgroundColor: [C.danger, C.purple, C.warning], borderRadius: 4, borderSkipped: false }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
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

  // ── Report generation ──────────────────────────────────────────────────────
  window.generateReport = async function (type) {
    const btnDiag = $('btnGenDiag');
    const btnPlan = $('btnGenPlan');
    if (btnDiag) btnDiag.disabled = true;
    if (btnPlan) btnPlan.disabled = true;
    $('pdfProgress').style.display = 'block';
    const labels = { diagnostic: 'Informe de Diagnóstico', action_plan: 'Plan de Acción' };
    const setProgress = (pct, label) => { $('progressFill').style.width = pct + '%'; $('progressLabel').textContent = label; };
    try {
      setProgress(10, `Generando ${labels[type]}...`);
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type, dashData }),
      });
      setProgress(80, 'Finalizando documento...');
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
      const disposition = res.headers.get('Content-Disposition') || '';
      const match       = disposition.match(/filename="([^"]+)"/);
      const filename    = match ? match[1] : `${type}_TECH4ZERO.md`;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
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
  function getPrevalence(name) { return dashData?.prevalencias?.[name] || null; }
  function catClass(cat) { return { CRISIS:'danger', INTERVENCION:'warning', ATENCION:'warning', MONITOREO:'ok' }[cat] || ''; }
  function catColor(cat) { return { CRISIS:C.danger, INTERVENCION:C.warning, ATENCION:'#FAC775', MONITOREO:C.ok, SIN_DATOS:C.muted }[cat] || C.muted; }
  function tagHtml(cat) {
    const labels = { CRISIS:'CRISIS', INTERVENCION:'INTERVENCIÓN', ATENCION:'ATENCIÓN', MONITOREO:'MONITOREO', SIN_DATOS:'SIN DATOS' };
    const cls    = { CRISIS:'tag-red', INTERVENCION:'tag-amber', ATENCION:'tag-amber', MONITOREO:'tag-green', SIN_DATOS:'tag-gray' };
    return `<span class="tag ${cls[cat] || 'tag-gray'}">${labels[cat] || cat}</span>`;
  }
  function formatDate(dtStr) {
    if (!dtStr) return '—';
    try { return new Date(dtStr).toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' }); }
    catch { return dtStr; }
  }

  init();
})();
