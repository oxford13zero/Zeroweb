// /api/generate-report.js
//
// Generates a diagnostic report or action plan as Markdown using Claude.
// Returns the markdown as a downloadable .md file.
//
// Auth: Bearer token in Authorization header (same JWT as dashboard)
// Body: { type: 'diagnostic' | 'action_plan', dashData: {...} }

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const JWT_SECRET    = process.env.JWT_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ── Token verification ────────────────────────────────────────────────────────

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const signing = `${header}.${body}`;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signing)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Country context ───────────────────────────────────────────────────────────

const COUNTRY_CTX = {
  MX: {
    pais: "México", idioma: "español mexicano",
    marco: "Nueva Escuela Mexicana (NEM)",
    ley: "Ley General de Educación y protocolos SEP",
    director: "Director(a)", bullying: "acoso escolar",
  },
  CL: {
    pais: "Chile", idioma: "español chileno",
    marco: "Política de Convivencia Educativa del MINEDUC",
    ley: "Ley de Violencia Escolar (Ley 20.536)",
    director: "Director(a)", bullying: "acoso escolar",
  },
  US: {
    pais: "United States", idioma: "English",
    marco: "School Safety and Anti-Bullying Policy",
    ley: "Every Student Succeeds Act (ESSA)",
    director: "Principal", bullying: "bullying",
  },
};

// ── Semáforo ──────────────────────────────────────────────────────────────────

function semaforo(pct) {
  if (pct === null || pct === undefined) return "SIN DATOS";
  if (pct >= 20) return "CRISIS";
  if (pct >= 10) return "INTERVENCIÓN";
  if (pct >= 5)  return "ATENCIÓN";
  return "MONITOREO";
}

function riskLabel(idx) {
  if (!idx && idx !== 0) return "no disponible";
  if (idx >= 60) return "ALTO";
  if (idx >= 40) return "MODERADO-ALTO";
  if (idx >= 20) return "MODERADO";
  return "BAJO";
}

// ── Data summary for prompt ───────────────────────────────────────────────────

function buildDataSummary(d) {
  const prev = d.prevalencias || {};
  const risk = d.indice_riesgo || {};
  const eco  = d.ecologia_reporte || [];
  const tipo = d.tipologia || {};
  const sub  = d.subgrupos_reporte || {};
  const co   = d.cyber_overlap || null;

  const prevLines = Object.entries(prev)
    .filter(([, v]) => v?.pct !== null && v?.pct !== undefined)
    .map(([k, v]) => `  - ${k}: ${v.pct}% (${v.n_true} de ${v.n_total}) — ${semaforo(v.pct)}`)
    .join("\n");

  const ecoLines = eco
    .map(e => `  - ${e.lugar}: puntuación ${e.puntuacion_media} (${e.pct_alta_frecuencia}% alta frecuencia)`)
    .join("\n");

  const tipoLines = Object.entries(tipo)
    .map(([k, v]) => `  - ${k}: ${v.n} estudiantes (${v.pct}%)`)
    .join("\n");

  const subVicGrado = (sub.victimizacion_por_grado || []).slice(0, 5)
    .map(r => `  - ${r.grupo}: ${r.pct}% (${r.n} de ${r.n_total})`)
    .join("\n");

  const subAgrGrado = (sub.agresion_por_grado || []).slice(0, 5)
    .map(r => `  - ${r.grupo}: ${r.pct}% (${r.n} de ${r.n_total})`)
    .join("\n");

  const subVicGen = (sub.victimizacion_por_genero || [])
    .map(r => `  - ${r.grupo}: ${r.pct}%`)
    .join("\n");

  const subAgrGen = (sub.agresion_por_genero || [])
    .map(r => `  - ${r.grupo}: ${r.pct}%`)
    .join("\n");

const cyberStr = co
    ? `  - Víctimas tradicionales: ${co.pct_tradicionales}% (${co.victimas_tradicionales})\n` +
      `  - Cybervíctimas: ${co.pct_cyber}% (${co.cibervictimas})\n` +
      `  - Afectados en ambos: ${co.pct_ambos_de_trad}% de las víctimas tradicionales`
    : "  - Sin datos";

  // Bystander behavior (from normas_grupo construct)
  const normas = d.prevalencias?.["Normas del Grupo"];
  const bystanderStr = normas
    ? `  - ${normas.pct}% de estudiantes muestra comportamiento activo de defensa/intervención (${normas.n_true} de ${normas.n_total}) — ${semaforo(normas.pct)}`
    : "  - Sin datos";

  // New students
  const primerAnio = (d.demograficos?.primer_anio || []);
  const newStudents = primerAnio.find(r =>
    r.val === 'Sí, es mi primer año aquí' || r.val === 'Menos de 1 año'
  );
  const newStudentsStr = newStudents
    ? `  - ${newStudents.pct}% son nuevos en la escuela (${newStudents.n} estudiantes) — grupo de mayor vulnerabilidad`
    : "  - Sin datos o todos llevan más de 1 año";

  return `
ESCUELA: ${d.escuela}

  return `
ESCUELA: ${d.escuela}
PAÍS: ${d.school_country || "MX"}
FECHA ANÁLISIS: ${d.analysis_dt}
ESTUDIANTES ENCUESTADOS: ${d.n_estudiantes}
ÍNDICE DE RIESGO: ${risk.indice ?? "N/A"}/100 — ${riskLabel(risk.indice)}

PREVALENCIAS POR ÁREA:
${prevLines || "  Sin datos"}

ESPACIOS DE RIESGO (ecología):
${ecoLines || "  Sin datos"}

PERFILES OLWEUS:
${tipoLines || "  Sin datos"}

VICTIMIZACIÓN POR GRADO (top 5):
${subVicGrado || "  Sin datos"}

AGRESIÓN POR GRADO (top 5):
${subAgrGrado || "  Sin datos"}

VICTIMIZACIÓN POR GÉNERO:
${subVicGen || "  Sin datos"}

AGRESIÓN POR GÉNERO:
${subAgrGen || "  Sin datos"}

BULLYING TRADICIONAL VS CYBERBULLYING:
${cyberStr}

OBSERVADORES/DEFENSORES (Bystanders):
${bystanderStr}

ESTUDIANTES NUEVOS EN LA ESCUELA:
${newStudentsStr}
`.trim();
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildDiagnosticPrompt(data, cc) {
  return `Eres un especialista senior en convivencia escolar del Programa ZERO (Universidad de Stavanger, Noruega).
Idioma: ${cc.idioma}. País: ${cc.pais}. Marco: ${cc.marco}.

Escribe el INFORME DE DIAGNÓSTICO para ${data.escuela} en formato Markdown.

REGLAS ABSOLUTAS:
- NUNCA uses términos estadísticos sin explicarlos: prohibido "prevalencia", "IC 95%", "Cronbach", "percentil", "p-valor". Usa lenguaje cotidiano.
- Menciona grados y géneros específicos cuando los datos lo permitan.
- Máximo 800 palabras en total.
- Usa el formato Markdown con encabezados ##, negritas y listas.

ESTRUCTURA OBLIGATORIA:

# Informe de Diagnóstico — ${data.escuela}
**Fecha:** ${new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
**Estudiantes encuestados:** ${data.n_estudiantes}
**Marco:** ${cc.marco}

## 1. ¿Qué encontramos en tu escuela?
Párrafo directo con el hallazgo más importante. Menciona el índice de riesgo en lenguaje simple (${riskLabel(data.indice_riesgo?.indice)}). Cuántos estudiantes están afectados en las áreas más críticas.

## 2. Áreas más críticas
Lista con las 3 áreas de mayor preocupación con datos exactos y nivel de semáforo.

## 3. ¿Quiénes son más afectados?
Párrafo con grados y géneros específicos. Si hay estudiantes nuevos en la escuela, menciona su mayor vulnerabilidad. Basarse en los datos de subgrupos y nuevos estudiantes.

## 3b. Observadores y defensores
Párrafo sobre el rol de los estudiantes que observan o defienden a las víctimas. Usa los datos de bystanders. Si el porcentaje es bajo, señala la oportunidad de activar más defensores.
  
## 4. Espacios de riesgo
Menciona los espacios físicos donde más ocurren las agresiones según la encuesta.

## 5. Lo que está funcionando
2-3 fortalezas de la escuela basadas en los datos de factores protectores.

## 6. Próximos pasos
1 párrafo de transición hacia el Plan de Acción.

---
*Informe generado por TECH4ZERO · Programa ZERO · Universidad de Stavanger*

DATOS DE LA ENCUESTA:
${buildDataSummary(data)}`;
}

function buildActionPlanPrompt(data, cc) {
  const topRisk = data.top3_riesgo?.[0];
  const eco     = data.ecologia_reporte?.[0];
  const riskIdx = data.indice_riesgo?.indice;
  const urgency = riskIdx >= 60 ? "ESTA SEMANA"
                : riskIdx >= 40 ? "ESTE MES"
                : "ESTE TRIMESTRE";

  return `Eres un especialista senior en convivencia escolar del Programa ZERO (Universidad de Stavanger, Noruega).
Idioma: ${cc.idioma}. País: ${cc.pais}. Marco: ${cc.marco}. Ley: ${cc.ley}.

Escribe el PLAN DE ACCIÓN para ${data.escuela} en formato Markdown.

REGLAS ABSOLUTAS:
- Lenguaje cotidiano, directo, sin jerga estadística.
- Cada acción tiene: QUÉ hacer y POR QUÉ (con datos reales). El equipo escolar completará QUIÉN y CUÁNDO.
- Los espacios con ___ son para que la escuela complete.
- Máximo 1000 palabras.

ESTRUCTURA OBLIGATORIA:

# Plan de Acción — ${data.escuela}
**Fecha:** ${new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
**Basado en:** ${data.n_estudiantes} estudiantes encuestados
**Urgencia:** ${urgency}

## Objetivo del plan
1 objetivo cuantificable y realista para este año escolar. Máximo 15% de reducción en el primer año.

## Pilar 1 — Descubrir
**Acción 1.1 — Equipo Zero Bullying**
- Qué hacer: [descripción concreta]
- Por qué: [justificación con datos de esta escuela]
- Responsable: ___________________
- Fecha de inicio: ___________________

## Pilar 2 — Resolver
**Acción 2.1 — Protocolo de intervención**
- Qué hacer: [descripción concreta del protocolo]
- Por qué prioritaria: [basado en las áreas en ${topRisk ? topRisk.categoria : "CRISIS"} de esta escuela]
- Responsable: ___________________
- Fecha de implementación: ___________________

## Pilar 3 — Prevenir
  **Acción 3.0 — Integración de estudiantes nuevos**
- Qué hacer: Programa de bienvenida y seguimiento para estudiantes que llevan menos de 1 año en la escuela.
- Por qué: Los datos muestran que los estudiantes nuevos tienen mayor vulnerabilidad al bullying. [Usar datos de nuevos estudiantes]
- Responsable: ___________________
- Fecha de inicio: ___________________
**Acción 3.1 — Zona de Seguridad${eco ? " — " + eco.lugar : ""}**
- Qué hacer: Supervisión adulta activa y visible en los espacios críticos identificados por la encuesta.
- Por qué: [justificación con datos de ecología]
- Responsable: ___________________
- Horario: ___________________

**Acción 3.2 — Involucramiento de familias**
- Qué hacer: [descripción concreta]
- Por qué: [justificación]
- Responsable: ___________________
- Instancia: ___________________

## Pilar 4 — Sostener
**Acción 4.1 — Encuesta de seguimiento**
- Qué hacer: Aplicar la encuesta TECH4ZERO al final del año escolar.
- Por qué es obligatoria: Es la única forma de medir si el plan funcionó.
- Responsable: ___________________
- Fecha propuesta: ___________________

---
*Plan elaborado por TECH4ZERO · Programa ZERO · Universidad de Stavanger*
*"Este remedio está garantizado que sí funciona. Lo que resta ahora es saber tomárselo." — Prof. Erling Roland*

DATOS DE LA ENCUESTA:
${buildDataSummary(data)}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // Auth
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  }

  const { type, dashData } = req.body || {};

  if (!type || !dashData) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }

  if (!["diagnostic", "action_plan"].includes(type)) {
    return res.status(400).json({ ok: false, error: "INVALID_TYPE" });
  }

  // Country context
  const country = (dashData.school_country || "MX").toUpperCase().slice(0, 2);
  const cc = COUNTRY_CTX[country] || COUNTRY_CTX.MX;

  // Build prompt
  const prompt = type === "diagnostic"
    ? buildDiagnosticPrompt(dashData, cc)
    : buildActionPlanPrompt(dashData, cc);

  // Call Claude
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const message = await client.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 2000,
      messages:   [{ role: "user", content: prompt }],
    });

    const markdown = message.content[0]?.text || "";

    // Return as downloadable .md file
    const escuela  = (dashData.escuela || "escuela").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    const dateStr  = new Date().toISOString().slice(0, 10);
    const typeStr  = type === "diagnostic" ? "diagnostico" : "plan_accion";
    const filename = `${typeStr}_TECH4ZERO_${escuela}_${dateStr}.md`;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(markdown);

  } catch (e) {
    console.error("Anthropic error:", e);
    return res.status(500).json({ ok: false, error: "GENERATION_FAILED", detail: e.message });
  }
}
