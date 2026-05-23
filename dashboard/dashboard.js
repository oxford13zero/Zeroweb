// ============================================================
// /dashboard/dashboard.js
// TECH4ZERO — Dashboard de Clima Escolar y Bullying
//
// PROPÓSITO
// Renderiza el dashboard de resultados por escuela a partir
// de los datos devueltos por /api/dashboard-data.
// Maneja: verificación de token JWT, carga de datos,
// renderizado de gráficas, y generación de informes PDF.
//
// ARQUITECTURA
// 1. init()         → verifica token y carga datos
// 2. renderAll()    → coordina todas las secciones
// 3. Cada sección   → función renderXxx() independiente
//
// DEPENDENCIAS
// - Chart.js        → gráficas de barras y doughnut
// - /api/verify-dashboard-token → valida JWT
// - /api/dashboard-data         → devuelve datos del análisis
// ============================================================

(function () {
  'use strict';

  // ── Paleta de colores global ────────────────────────────────────────────────
  // Todos los colores del dashboard se definen aquí para consistencia.
  // Modificar aquí afecta todas las gráficas simultáneamente.
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

  // Helpers DOM
  const $  = id => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const e = document.createElement(tag);
    Object.assign(e, props);
    children.forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  // Configuración global de Chart.js
  Chart.defaults.color       = '#ffffff';
  Chart.defaults.borderColor = C.border;
  Chart.defaults.font.family = "'Open Sans', sans-serif";
  Chart.defaults.font.size   = 11;

  // ── Autenticación ───────────────────────────────────────────────────────────
  // El dashboard requiere un token JWT firmado generado por
  // /api/generate-dashboard-token.js. El token expira en 2 horas
  // y está ligado a un school_id y analysis_dt específicos.
  // Esto evita que URLs de dashboard sean accesibles públicamente.

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
      // Solo admins ven los botones de generación de informes PDF
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
    renderNewStudentsCard();
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  // El semáforo del header se basa ÚNICAMENTE en victimización frecuente,
  // no en el índice de riesgo compuesto. Esto es intencional: el indicador
  // más directo de bienestar estudiantil es cuántos alumnos son víctimas,
  // no un índice ponderado que puede estar atenuado por factores protectores.

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

  // ── Métricas KPI ────────────────────────────────────────────────────────────
  // Los tres KPIs principales (victimización, agresión, cyberbullying)
  // muestran el % de estudiantes con puntaje promedio ≥ 2 en escala 0–4.
  //
  // UMBRAL ≥ 2 — JUSTIFICACIÓN METODOLÓGICA:
  // La escala 0–4 de SURVEY_004 fue diseñada con los siguientes anclajes:
  //   0 = Nunca
  //   1 = Una o dos veces en los últimos 2 meses
  //   2 = Un par de veces al mes     ← UMBRAL DE FRECUENCIA
  //   3 = Una vez a la semana
  //   4 = Varios días a la semana
  // El umbral ≥ 2 equivale al criterio de Olweus (1996) de "dos o tres
  // veces al mes o más", que es la definición estándar de bullying frecuente.
  // Referencia: Olweus, D. (1996). The Revised Olweus Bully/Victim
  // Questionnaire. Research Center for Health Promotion, University of Bergen.
  //
  // SEMÁFORO — UMBRALES Y FUENTES:
  // Los umbrales fueron calibrados con evidencia publicada para
  // contextos hispanohablantes y globales:
  //   > 7%  → ATENCIÓN    (sobre mínimo España: 6.2%, UCM/ColaCao 2023)
  //   > 15% → INTERVENCIÓN (sobre promedio México: 10–21%, Valdés-Cuervo 2019)
  //   > 25% → CRISIS      (sobre promedio global: 25%, Ariani et al. 2025)
  // Estos umbrales aplican para victimización FRECUENTE (≥2x/mes).
  // Son válidos para toda Latinoamérica + España porque están anclados
  // en los extremos documentados de la distribución regional.
  //
  // ÍNDICE DE RIESGO ESCOLAR — FÓRMULA:
  // index = (riesgoPromedio × 0.65) + (riesgoResidualProtección × 0.35)
  // donde riesgoResidualProtección = 100 - promedioFactoresProtectores
  // Los factores de riesgo pesan 65% y los protectores 35%.
  // Los umbrales del índice (20/40/60) son operativos propios de TECH4ZERO,
  // no tienen referencia externa publicada.
  //
  // REPRESENTATIVIDAD — FÓRMULA DE COCHRAN (1977):
  // n_min = n_inf / (1 + (n_inf - 1) / N)
  // donde n_inf = Z² × p(1-p) / e²  con Z=1.96, p=0.5, e=0.05
  // Si n_respondentes ≥ n_min → muestra representativa (95% confianza, ±5%)

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
      // Umbrales del índice de riesgo: operativos propios TECH4ZERO (no Olweus)
      const riskCat = risk.indice >= 60 ? 'CRISIS' : risk.indice >= 40 ? 'INTERVENCION' : risk.indice >= 20 ? 'ATENCION' : 'MONITOREO';
      $('subRisk').innerHTML   = tagHtml(riskCat);
      $('cardRisk').className  = 'metric-card ' + catClass(riskCat);
    }
    $('metN').textContent = d.n_estudiantes;
    $('subN').textContent = `Análisis: ${formatDate(d.analysis_dt)}`;

    // Representatividad estadística (Cochran 1977, población finita)
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

  // ── Gráfica de Prevalencia por Área ────────────────────────────────────────
  // DISEÑO INTENCIONAL — dos grupos con semántica opuesta:
  //
  // FACTORES DE RIESGO (barras en color del semáforo):
  //   "Victimización", "Perpetración / Agresión", "Cybervictimización",
  //   "Cyberagresión", "Bullying entre niveles"
  //   → Barra LARGA = MAL. % de estudiantes AFECTADOS frecuentemente.
  //   → Color según semáforo calibrado con evidencia regional.
  //
  // FACTORES PROTECTORES (barras siempre en verde):
  //   "Autoridad Docente", "Normas del Grupo", "Respuesta Institucional"
  //   → Barra LARGA = BIEN. % de estudiantes que LO PERCIBEN POSITIVAMENTE.
  //   → Siempre verde porque un valor alto es siempre deseable.
  //
  // IMPORTANTE: NO se invierten los valores de los factores protectores
  // en esta gráfica. Se muestran tal como vienen del API (% que responde
  // ≥2 en ítems positivos). El color verde es la señal visual de dirección.
  //
  // Mezclar ambos grupos bajo un solo label "% de estudiantes afectados"
  // era metodológicamente incorrecto. Por eso se usan tooltips distintos
  // y un separador visual entre grupos.

  function renderPrevalenceChart() {
    const d = dashData;

    // Clasificación de constructos por dirección
    const RISK_KEYS       = ["Victimización", "Perpetración / Agresión", "Cybervictimización", "Cyberagresión", "Bullying entre niveles"];
    const PROTECTIVE_KEYS = ["Autoridad Docente", "Normas del Grupo", "Respuesta Institucional"];
    const DISPLAY         = d.display_names || {};

    // Separar keys según tipo
    const allKeys  = Object.keys(d.prevalencias);
    const riskKeys = allKeys.filter(k =>  RISK_KEYS.includes(k));
    const protKeys = allKeys.filter(k =>  PROTECTIVE_KEYS.includes(k));

    // Orden: riesgo primero, luego protectores
    const orderedKeys = [...riskKeys, ...protKeys];
    const labels      = orderedKeys.map(k => DISPLAY[k] || k);
    const values      = orderedKeys.map(k => d.prevalencias[k]?.pct || 0);
    const colors      = orderedKeys.map(k =>
      PROTECTIVE_KEYS.includes(k)
        ? C.ok   // siempre verde — barra larga es BUENA señal
        : catColor(d.prevalencias[k]?.categoria || 'SIN_DATOS')
    );

    // Separador visual entre grupos
    const sepIndex = riskKeys.length;
    labels.splice(sepIndex, 0, '──────────────');
    values.splice(sepIndex, 0, 0);
    colors.splice(sepIndex, 0, 'transparent');

    new Chart($('chartPrevalence'), {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                // El separador no tiene tooltip
                if (ctx.dataIndex === sepIndex) return '';
                // ctx.dataIndex includes the separator row, so offset by 1 after it
                const rawIdx = ctx.dataIndex < sepIndex ? ctx.dataIndex : ctx.dataIndex - 1;
                const k = orderedKeys[rawIdx];
                if (!k) return ` ${ctx.parsed.x}%`;
                // Tooltip diferenciado por tipo de constructo
                const suffix = PROTECTIVE_KEYS.includes(k)
                  ? '% lo perciben positivamente'
                  : '% afectados frecuentemente';
                return ` ${ctx.parsed.x} ${suffix}`;
              }
            }
          }
        },
        scales: {
          x: { min: 0, max: 100, ticks: { callback: v => `${v}%`, color: '#ffffff' }, grid: { color: C.border } },
          y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 11 } } },
        },
      },
    });

    // Subtítulo dinámico que explica la leyenda de colores
    const sub = $('chartPrevalenceSub');
    if (sub) sub.textContent = 'Factores de riesgo (rojo/naranja) · Factores protectores (verde)';
  }

  // ── Semáforo helpers ────────────────────────────────────────────────────────
  // getSem() se usa para las gráficas de grado/género donde se colorea
  // cada barra según el nivel de riesgo del grupo.
  // NOTA: estos umbrales son los VIEJOS (20/10/5) y solo afectan las
  // gráficas de subgrupos. Los umbrales correctos (25/15/7) están en
  // /api/dashboard-data.js → función semaforo(pct).
  // TODO: unificar umbrales en un solo lugar para evitar inconsistencias.

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

  // ── Gráficas por grado y género ─────────────────────────────────────────────
  // Orden de grados: sistema chileno (Básico/Medio) primero, luego México
  // (Primaria/Secundaria/Preparatoria), luego sistema internacional.
  // Si el grado no está en la lista, se ordena alfabéticamente al final.

  const GRADE_ORDER = [
    '1° Básico','2° Básico','3° Básico','4° Básico','5° Básico','6° Básico','7° Básico','8° Básico',
    '1° Medio','2° Medio','3° Medio','4° Medio',
    '1° Primaria','2° Primaria','3° Primaria','4° Primaria','5° Primaria','6° Primaria',
    '1° Secundaria','2° Secundaria','3° Secundaria',
    '1° Preparatoria','2° Preparatoria','3° Preparatoria',
    'Kindergarten','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
    'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12',
  ];

  function sortByGrade(rows) {
    return [...rows].sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a.grupo);
      const bi = GRADE_ORDER.indexOf(b.grupo);
      if (ai === -1 && bi === -1) return a.grupo.localeCompare(b.grupo);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  function renderGradeGenderCharts() {
    const sub = dashData.subgrupos_reporte;
    renderGradeBarChart('chartVicGrade', sortByGrade(sub.victimizacion_por_grado || []).slice(0, 7), '% Victimización');
    renderGradeBarChart('chartAgrGrade', sortByGrade(sub.agresion_por_grado      || []).slice(0, 7), '% Agresión');
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

  // ── Tipología Olweus ────────────────────────────────────────────────────────
  // Clasifica a cada estudiante en uno de cuatro perfiles mutuamente
  // excluyentes según sus puntajes de victimización y perpetración.
  //
  // PERFILES (Olweus, 1993; Nansel et al., 2001 JAMA):
  //   Agresor-Víctima  → puntaje medio ≥ 1.0 en AMBOS constructos
  //                      Perfil de mayor riesgo psicosocial
  //   Víctima          → puntaje medio ≥ 1.0 solo en victimización
  //   Agresor          → puntaje medio ≥ 1.0 solo en perpetración
  //   No Involucrado   → ninguno supera el umbral
  //
  // UMBRAL 1.0 (escala 0–4): equivale a "una o dos veces en el período",
  // umbral inferior al de victimización frecuente (≥2) para capturar
  // cualquier involucración en roles de bullying, no solo los casos graves.
  //
  // Referencias:
  //   Olweus, D. (1993). Bullying at School. Blackwell.
  //   Nansel, T. et al. (2001). JAMA, 285(16), 2094-2100.

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

  // ── Espacios de riesgo (Ecología) ───────────────────────────────────────────
  // Muestra los espacios físicos del plantel ordenados por puntaje medio
  // de riesgo percibido (escala 0–4).
  // La barra se normaliza a 0–100% dividiendo por 4 (máximo posible).
  // Un puntaje alto significa que los estudiantes perciben ese espacio
  // como peligroso o donde ocurre más violencia.
  // Solo aplica a estudiantes que reportaron victimización (módulo condicional).

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

  // ── Solapamiento Bullying Tradicional vs. Cyberbullying ─────────────────────
  // Muestra qué proporción de víctimas presenciales TAMBIÉN sufren
  // cyberbullying. Un solapamiento alto (>50%) indica que son los mismos
  // estudiantes siendo afectados en ambos contextos, lo que justifica
  // intervenciones combinadas en lugar de separadas.
  //
  // Referencia metodológica:
  //   Kowalski et al. (2014). Bullying in the digital age.
  //   Psychological Bulletin, 140(4), 1073-1137.

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

  // ── Estudiantes nuevos ──────────────────────────────────────────────────────
  // Analiza por separado a los estudiantes con menos de 1 año en la escuela.
  // Justificación: los estudiantes recién llegados tienen mayor vulnerabilidad
  // al bullying por carecer de redes sociales establecidas en el plantel.
  // Si el 30% o más de los nuevos son víctimas, se muestra alerta prioritaria.

  function renderNewStudentsCard() {
    const ns = dashData.nuevos_estudiantes;
    const container = $('cyberText')?.parentElement?.parentElement;
    if (!container || !ns) return;

    const card = document.createElement('div');
    card.className = 'chart-card';
    card.style.cssText = 'margin-top:16px;';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div class="chart-title" style="margin:0;">Estudiantes nuevos en la escuela</div>
        <div class="info-icon-wrap">
          <span class="info-icon">i</span>
          <div class="info-popup">
            Los estudiantes que llevan menos de 1 año en la escuela tienen mayor vulnerabilidad al bullying por falta de redes sociales establecidas.
          </div>
        </div>
      </div>
      <div class="chart-sub">${ns.n_new} estudiantes nuevos · ${ns.pct_of_total}% del total encuestado</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:12px;">
        ${nsMetric('Víctimas', ns.n_victim, ns.pct_victim, ns.n_new, '#f09595')}
        ${nsMetric('Agresores', ns.n_aggr, ns.pct_aggr, ns.n_new, '#FAC775')}
        ${nsMetric('Víctima + Agresor', ns.n_both, ns.pct_both, ns.n_new, '#E24B4A')}
        ${nsMetric('Defensores activos', ns.n_bystander, ns.pct_bystander, ns.n_new, '#1D9E75')}
      </div>
      ${ns.pct_victim >= 30 ? `
      <div style="margin-top:14px;padding:10px 12px;background:#2a0a0a;border:0.5px solid #a32d2d;border-radius:6px;font-size:12px;color:#f09595;line-height:1.6;">
        ⚠️ <strong>${ns.pct_victim}% de los estudiantes nuevos son víctimas</strong> — los estudiantes recién llegados requieren atención prioritaria para su integración.
      </div>` : ''}
    `;

    const cyberCard = $('chartCyber')?.closest('.chart-card');
    if (cyberCard?.parentElement) {
      cyberCard.parentElement.insertAdjacentElement('afterend', card);
    } else {
      container.appendChild(card);
    }
  }

  function nsMetric(label, n, pct, total, color) {
    const barPct = total > 0 ? Math.round(n / total * 100) : 0;
    return `
      <div style="background:#0f1923;border:0.5px solid #1e3040;border-radius:8px;padding:12px;">
        <div style="font-size:11px;color:#7a9aaa;margin-bottom:4px;">${label}</div>
        <div style="font-size:22px;font-weight:600;color:${color};">${pct}%</div>
        <div style="font-size:11px;color:#7a9aaa;margin-bottom:8px;">${n} de ${total}</div>
        <div style="height:4px;background:#1e3040;border-radius:2px;">
          <div style="width:${barPct}%;height:100%;background:${color};border-radius:2px;"></div>
        </div>
      </div>`;
  }

  // ── Generación de informes PDF ──────────────────────────────────────────────
  // Solo disponible para usuarios con rol 'admin' (oculto para rol 'school').
  // Llama a /api/generate-report con el tipo (diagnostic | action_plan)
  // y los datos completos del dashboard. El servidor genera el PDF y
  // lo devuelve como blob para descarga directa en el browser.

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

  // ── Helpers generales ───────────────────────────────────────────────────────

  // Busca una prevalencia por nombre de display (ej: 'Victimización')
  function getPrevalence(name) { return dashData?.prevalencias?.[name] || null; }

  // Clase CSS para colorear metric-cards según categoría del semáforo
  function catClass(cat) { return { CRISIS:'danger', INTERVENCION:'warning', ATENCION:'warning', MONITOREO:'ok' }[cat] || ''; }

  // Color hex para barras de Chart.js según categoría del semáforo
  function catColor(cat) { return { CRISIS:C.danger, INTERVENCION:C.warning, ATENCION:'#FAC775', MONITOREO:C.ok, SIN_DATOS:C.muted }[cat] || C.muted; }

  // Badge HTML coloreado para mostrar categoría en tablas y subtítulos
  function tagHtml(cat) {
    const labels = { CRISIS:'CRISIS', INTERVENCION:'INTERVENCIÓN', ATENCION:'ATENCIÓN', MONITOREO:'MONITOREO', SIN_DATOS:'SIN DATOS' };
    const cls    = { CRISIS:'tag-red', INTERVENCION:'tag-amber', ATENCION:'tag-amber', MONITOREO:'tag-green', SIN_DATOS:'tag-gray' };
    return `<span class="tag ${cls[cat] || 'tag-gray'}">${labels[cat] || cat}</span>`;
  }

  // Formatea fecha ISO a formato legible en español (ej: "20 de mayo de 2026")
  function formatDate(dtStr) {
    if (!dtStr) return '—';
    try { return new Date(dtStr).toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' }); }
    catch { return dtStr; }
  }

  init();
})();
