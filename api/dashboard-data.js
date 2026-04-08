// /api/dashboard-data.js
//
// Fetches survey data from Supabase and computes all statistical metrics
// needed by the dashboard. Replaces Streamlit as the analytics engine.
//
// Authentication: requires a valid dashboard token in the Authorization header.
// Called by: /dashboard/index.html
//
// Returns a single JSON object with all metrics pre-computed.

import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;

// ── Token verification (same logic as verify-dashboard-token.js) ─────────────

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const signing = `${header}.${body}`;
  const expectedSig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signing)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  if (sig.length !== expectedSig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Statistical helpers ───────────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// Wilson score confidence interval for proportions
function wilsonCI(k, n, z = 1.96) {
  if (n === 0) return [0, 0];
  const p = k / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denom;
  return [
    Math.max(0, Math.round((center - margin) * 1000) / 10),
    Math.min(100, Math.round((center + margin) * 1000) / 10),
  ];
}

// Prevalence: % of responses with mean score >= 2 (frequent)
function calcPrevalence(scores) {
  if (!scores.length) return null;
  const n_true = scores.filter(s => s >= 2).length;
  const pct    = Math.round(n_true / scores.length * 1000) / 10;
  const [ci_lower, ci_upper] = wilsonCI(n_true, scores.length);
  return { pct, n_true, n_total: scores.length, ci_lower, ci_upper };
}

// Semáforo threshold for victimization
function semaforo(pct) {
  if (pct === null) return "SIN_DATOS";
  if (pct >= 20)   return "CRISIS";
  if (pct >= 10)   return "INTERVENCION";
  if (pct >= 5)    return "ATENCION";
  return "MONITOREO";
}

// Cronbach alpha from item scores matrix (array of arrays)
function cronbachAlpha(matrix) {
  // matrix: each row = one respondent, each column = one item
  if (!matrix.length || !matrix[0].length) return null;
  const k = matrix[0].length;
  if (k < 2) return null;
  const itemVars = [];
  for (let j = 0; j < k; j++) {
    const col = matrix.map(row => row[j]).filter(v => v !== null && !isNaN(v));
    itemVars.push(col.length > 1 ? stddev(col) ** 2 : 0);
  }
  const totalScores = matrix.map(row =>
    row.reduce((s, v) => s + (v || 0), 0)
  );
  const totalVar = stddev(totalScores) ** 2;
  if (totalVar === 0) return null;
  const alpha = (k / (k - 1)) * (1 - itemVars.reduce((a, b) => a + b, 0) / totalVar);
  return Math.round(alpha * 1000) / 1000;
}

// Olweus typology: classify each student
// aggressor: perpetracion mean >= 1.0
// victim:    victimizacion mean >= 1.0
function classifyOlweus(perpScore, victScore) {
  const isAggr = perpScore !== null && perpScore >= 1.0;
  const isVict = victScore !== null && victScore >= 1.0;
  if (isAggr && isVict) return "Agresor-Víctima";
  if (isVict)           return "Víctima";
  if (isAggr)           return "Agresor";
  return "No Involucrado";
}

// Risk index (0-100): combines risk factors and protective factors
function calcRiskIndex(prevalences) {
  const riskKeys       = ["victimizacion", "perpetracion", "cybervictimizacion", "cyberagresion", "internivel"];
  const protectiveKeys = ["autoridad_docente", "normas_grupo", "respuesta_institucional"];

  let riskSum = 0, riskCount = 0;
  for (const k of riskKeys) {
    if (prevalences[k]?.pct !== undefined && prevalences[k].pct !== null) {
      riskSum += prevalences[k].pct;
      riskCount++;
    }
  }

  let protSum = 0, protCount = 0;
  for (const k of protectiveKeys) {
    if (prevalences[k]?.pct !== undefined && prevalences[k].pct !== null) {
      // High prevalence of protective factor = low risk contribution
      protSum += 100 - prevalences[k].pct;
      protCount++;
    }
  }

  const riskComponent  = riskCount  ? Math.round(riskSum / riskCount)  : null;
  const protComponent  = protCount  ? Math.round(protSum / protCount)  : null;

  let index = null;
  if (riskComponent !== null && protComponent !== null) {
    index = Math.round(riskComponent * 0.65 + protComponent * 0.35);
  } else if (riskComponent !== null) {
    index = riskComponent;
  }

  return {
    indice:               index,
    componente_riesgo:    riskComponent,
    componente_protector: protComponent !== null ? 100 - protComponent : null,
  };
}

// ── Construct definitions (external_id → construct name) ────────────────────
// Covers all survey variants: SURVEY_004, SURVEY_004_MX, SURVEY_004_CL,
// SURVEY_004_EN, and all PRIMARIA variants.

const CONSTRUCT_MAP = {
  // ── Victimization (zero_* format) ──────────────────────────────────────────
  "zero_victima_agresion_fisica_v2":  "victimizacion",
  "zero_victima_insultos_v2":         "victimizacion",
  "zero_victima_rumores_v2":          "victimizacion",
  "zero_victima_exclusion_v2":        "victimizacion",
  "zero_victima_amenazas_v2":         "victimizacion",
  "zero_victima_coercion_v2":         "victimizacion",
  "zero_victima_discriminacion_v2":   "victimizacion",
  "zero_victima_acoso_sexual":        "victimizacion",

  // ── Perpetration (zero_* format) ───────────────────────────────────────────
  "zero_agresor_agresion_fisica_v2":  "perpetracion",
  "zero_agresor_insultos_v2":         "perpetracion",
  "zero_agresor_rumores_v2":          "perpetracion",
  "zero_agresor_exclusion_v2":        "perpetracion",
  "zero_agresor_amenazas_v2":         "perpetracion",
  "zero_agresor_coercion_v2":         "perpetracion",
  "zero_agresor_discriminacion_v2":   "perpetracion",

  // ── Cybervictimization (zero_* format) ─────────────────────────────────────
  "zero_cybervictima_mensajes":       "cybervictimizacion",
  "zero_cybervictima_fotos":          "cybervictimizacion",
  "zero_cybervictima_exclusion":      "cybervictimizacion",  // if present
  "zero_cybervictima_anonimo":        "cybervictimizacion",
  "zero_cybervictima_continua":       "cybervictimizacion",
  "zero_cybervictima_extorsion":      "cybervictimizacion",
  "zero_cybervictima_masivo":         "cybervictimizacion",

  // ── Cyberaggression (zero_* format) ────────────────────────────────────────
  "zero_cyberagresor_mensajes":       "cyberagresion",
  "zero_cyberagresor_exclusion":      "cyberagresion",

  // ── Teacher / Adult authority (zero_* format) ──────────────────────────────
  "zero_autoridad_normas":            "autoridad_docente",
  "zero_autoridad_interviene":        "autoridad_docente",
  "zero_autoridad_escucha":           "autoridad_docente",
  "zero_autoridad_coordina":          "autoridad_docente",
  "zero_autoridad_bienestar":         "autoridad_docente",
  "zero_autoridad_seguimiento":       "autoridad_docente",
  "zero_autoridad_accion_digital":    "autoridad_docente",

  // ── Group norms (zero_* format) ────────────────────────────────────────────
  "zero_normas_reaccion_v2":              "normas_grupo",
  "zero_normas_intervencion_activa_v2":   "normas_grupo",
  "zero_normas_defensa_apoyo":            "normas_grupo",
  "zero_normas_defensa_observada":        "normas_grupo",

  // ── Institutional response (zero_* format) ─────────────────────────────────
  "zero_institucional_protege":       "respuesta_institucional",
  "zero_institucional_protocolo":     "respuesta_institucional",
  "zero_institucional_orientador":    "respuesta_institucional",
  "zero_institucional_acceso_adulto": "respuesta_institucional",
  "zero_institucional_sin_represalia":"respuesta_institucional",
  "zero_institucional_seguimiento":   "respuesta_institucional",

  // ── Inter-level / older students (zero_* format) ───────────────────────────
  "zero_internivel_intimidacion":     "internivel",
  "zero_internivel_coercion":         "internivel",
  "zero_internivel_norma":            "internivel",
  "zero_internivel_supervision":      "internivel",
  "zero_internivel_intervencion":     "internivel",

  // ── Ecology spaces (zero_* format) ─────────────────────────────────────────
  "zero_ecologia_patio_v2":           "ecologia_patio",
  "zero_ecologia_banos":              "ecologia_banos",
  "zero_ecologia_aula_v2":            "ecologia_aula",
  "zero_ecologia_cafeteria_v2":       "ecologia_cafeteria",
  "zero_ecologia_entrada_salida_v2":  "ecologia_entrada",
  "zero_ecologia_transporte_v2":      "ecologia_transporte",
};

const ECOLOGY_LABELS = {
  "ecologia_patio":      "Patio principal",
  "ecologia_banos":      "Baños y pasillos",
  "ecologia_aula":       "Sala de clases",
  "ecologia_cafeteria":  "Cafetería",
  "ecologia_entrada":    "Entrada / salida",
  "ecologia_transporte": "Transporte",
  "ecologia_biblioteca": "Biblioteca",
};

const DISPLAY_NAMES = {
  "victimizacion":          "Victimización",
  "perpetracion":           "Perpetración / Agresión",
  "cybervictimizacion":     "Cybervictimización",
  "cyberagresion":          "Cyberagresión",
  "autoridad_docente":      "Autoridad Docente",
  "normas_grupo":           "Normas del Grupo",
  "respuesta_institucional":"Respuesta Institucional",
  "internivel":             "Bullying entre niveles",
};

// p4_* surveys are legacy dev data only — not supported in production
const FULL_CONSTRUCT_MAP = { ...CONSTRUCT_MAP };

// Demographic external IDs
const DEMO_MAP = {
  "zero_general_genero_v2":       "genero",
  "zero_general_edad_v2":         "edad",
  "zero_general_curso":           "grado",
  "zero_general_tipo_escuela_v2": "tipo_escuela",
};

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // 1) Verify token from Authorization header
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "MISSING_TOKEN" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  }

  const { school_id, analysis_dt } = payload;

  // 2) Load survey responses for this school + analysis date
  const { data: responses, error: respErr } = await supabaseAdmin
    .from("survey_responses")
    .select("id, survey_id, status, analysis_requested_dt")
    .eq("school_id", school_id)
    .eq("analysis_requested_dt", analysis_dt)
    .eq("status", "submitted");

  if (respErr) {
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail: respErr.message });
  }

  if (!responses || responses.length === 0) {
    return res.status(404).json({ ok: false, error: "NO_RESPONSES_FOUND" });
  }

  const responseIds = responses.map(r => r.id);
  const n = responseIds.length;

  // 3) Load school info
  const { data: schoolData } = await supabaseAdmin
    .from("schools")
    .select("name, country, students_primaria, students_secundaria, students_preparatoria")
    .eq("id", school_id)
    .single();

  const schoolName    = schoolData?.name    || "Escuela";
  const schoolCountry = schoolData?.country || "MX";

  // Enrollment and sample representativeness
  const enrollment_primaria      = schoolData?.students_primaria      || 0;
  const enrollment_secundaria    = schoolData?.students_secundaria    || 0;
  const enrollment_preparatoria  = schoolData?.students_preparatoria  || 0;
  const total_matriculados       = enrollment_primaria + enrollment_secundaria + enrollment_preparatoria;

  // 4) Load all question answers in chunks
  const CHUNK = 100;
  let answersData = [];
  for (let i = 0; i < responseIds.length; i += CHUNK) {
    const chunk = responseIds.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("question_answers")
      .select("id, survey_response_id, question_id")
      .in("survey_response_id", chunk);
    if (data) answersData.push(...data);
  }

  // 5) Load question external IDs
  const questionIds = [...new Set(answersData.map(a => a.question_id))];
  let questionsData = [];
  for (let i = 0; i < questionIds.length; i += CHUNK) {
    const chunk = questionIds.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("questions")
      .select("id, external_id, question_text")
      .in("id", chunk);
    if (data) questionsData.push(...data);
  }

  const questionMap = Object.fromEntries(questionsData.map(q => [q.id, q]));

  // 6) Load selected options
  const answerIds = answersData.map(a => a.id);
  let selectedData = [];
  for (let i = 0; i < answerIds.length; i += CHUNK) {
    const chunk = answerIds.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("answer_selected_options")
      .select("question_answer_id, option_id")
      .in("question_answer_id", chunk);
    if (data) selectedData.push(...data);
  }

  // 7) Load option details
  const optionIds = [...new Set(selectedData.map(s => s.option_id))];
  let optionsData = [];
  for (let i = 0; i < optionIds.length; i += CHUNK) {
    const chunk = optionIds.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("question_options")
      .select("id, option_code, option_text")
      .in("id", chunk);
    if (data) optionsData.push(...data);
  }

  const optionMap = Object.fromEntries(optionsData.map(o => [o.id, o]));

  // 8) Build answer lookup: answerId → optionCode (numeric score)
  const answerToOption = Object.fromEntries(
    selectedData.map(s => [s.question_answer_id, s.option_id])
  );

  // 9) Build per-response data structure
  // responseData[responseId] = { external_id → score, demographics }
  const responseData = {};
  for (const rid of responseIds) {
    responseData[rid] = { items: {}, genero: null, edad: null, grado: null, tipo_escuela: null };
  }

  for (const answer of answersData) {
    const q = questionMap[answer.question_id];
    if (!q) continue;
    const extId = q.external_id;
    const optId = answerToOption[answer.id];
    const opt   = optId ? optionMap[optId] : null;

    // Demographic
    const demoCol = DEMO_MAP[extId];
    if (demoCol && opt) {
      responseData[answer.survey_response_id][demoCol] = opt.option_text;
      continue;
    }

    // Construct item — numeric score from option_code
    const construct = FULL_CONSTRUCT_MAP[extId];
    if (construct && opt) {
      const score = parseFloat(opt.option_code);
      if (!isNaN(score)) {
        if (!responseData[answer.survey_response_id].items[construct]) {
          responseData[answer.survey_response_id].items[construct] = [];
        }
        responseData[answer.survey_response_id].items[construct].push(score);
      }
    }
  }

  // 10) Compute per-student construct mean scores
  // studentScores[responseId][construct] = mean score
  const studentScores = {};
  for (const [rid, data] of Object.entries(responseData)) {
    studentScores[rid] = {};
    for (const [construct, scores] of Object.entries(data.items)) {
      studentScores[rid][construct] = scores.length ? mean(scores) : null;
    }
  }

  // 11) Aggregate scores per construct across all students
  const constructScores = {};
  const allConstructs = [...new Set(Object.values(FULL_CONSTRUCT_MAP))];

  for (const construct of allConstructs) {
    constructScores[construct] = responseIds
      .map(rid => studentScores[rid]?.[construct])
      .filter(v => v !== undefined && v !== null);
  }

  // 12) Compute prevalences
  const prevalences = {};
  for (const [construct, scores] of Object.entries(constructScores)) {
    if (!ECOLOGY_LABELS[construct]) { // skip ecology from prevalence
      prevalences[construct] = calcPrevalence(scores);
    }
  }

  // Add semáforo to prevalences
  for (const [k, v] of Object.entries(prevalences)) {
    if (v) v.categoria = semaforo(v.pct);
  }

  // 13) Top 3 risk areas
  const top3 = Object.entries(prevalences)
    .filter(([k, v]) => v && v.pct !== null && ["victimizacion","perpetracion","cybervictimizacion"].includes(k))
    .sort((a, b) => b[1].pct - a[1].pct)
    .slice(0, 3)
    .map(([k, v]) => ({
      area:      DISPLAY_NAMES[k] || k,
      pct:       v.pct,
      n:         v.n_true,
      n_total:   v.n_total,
      categoria: v.categoria,
    }));

  // 14) Ecology hotspots
  const ecologia = Object.entries(ECOLOGY_LABELS)
    .map(([construct, label]) => {
      const scores = constructScores[construct] || [];
      if (!scores.length) return null;
      const m = mean(scores);
      return {
        lugar:               label,
        puntuacion_media:    Math.round(m * 100) / 100,
        pct_alta_frecuencia: Math.round(scores.filter(s => s >= 2).length / scores.length * 1000) / 10,
        n:                   scores.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.puntuacion_media - a.puntuacion_media);

  // 15) Olweus typology
  const typology = { "Agresor-Víctima": 0, "Víctima": 0, "Agresor": 0, "No Involucrado": 0 };
  let classified = 0;
  for (const rid of responseIds) {
    const perp = studentScores[rid]?.perpetracion ?? null;
    const vict = studentScores[rid]?.victimizacion ?? null;
    if (perp !== null || vict !== null) {
      typology[classifyOlweus(perp, vict)]++;
      classified++;
    }
  }

  const typologyPct = {};
  for (const [k, v] of Object.entries(typology)) {
    typologyPct[k] = {
      n:   v,
      pct: classified ? Math.round(v / classified * 1000) / 10 : 0,
    };
  }

  // 16) Demographics breakdown
  const demoBreakdown = {};
  for (const col of ["genero", "grado", "tipo_escuela"]) {
    const counts = {};
    for (const rid of responseIds) {
      const val = responseData[rid][col];
      if (val) counts[val] = (counts[val] || 0) + 1;
    }
    demoBreakdown[col] = Object.entries(counts)
      .map(([val, count]) => ({ val, n: count, pct: Math.round(count / n * 1000) / 10 }))
      .sort((a, b) => b.n - a.n);
  }

  // 17) Subgroups: aggressors and victims by grade and gender
  const subgrupos = {
    agresion_por_grado: [], victimizacion_por_grado: [],
    agresion_por_genero: [], victimizacion_por_genero: [],
    victimizacion_grado_genero: [], agresion_grado_genero: [],
  };

  function prevByGroup(groupCol, freqConstruct) {
    const groups = {};
    for (const rid of responseIds) {
      const grp = responseData[rid][groupCol];
      if (!grp) continue;
      if (!groups[grp]) groups[grp] = { total: 0, freq: 0 };
      groups[grp].total++;
      const score = studentScores[rid]?.[freqConstruct];
      if (score !== null && score !== undefined && score >= 2) groups[grp].freq++;
    }
    return Object.entries(groups)
      .map(([grupo, { total, freq }]) => ({
        grupo,
        pct:     Math.round(freq / total * 1000) / 10,
        n:       freq,
        n_total: total,
      }))
      .sort((a, b) => b.pct - a.pct);
  }

  function prevByGradeGender(freqConstruct) {
    const groups = {};
    for (const rid of responseIds) {
      const grado  = responseData[rid].grado;
      const genero = responseData[rid].genero;
      if (!grado || !genero) continue;
      const key = `${grado}|||${genero}`;
      if (!groups[key]) groups[key] = { grado, genero, total: 0, freq: 0 };
      groups[key].total++;
      const score = studentScores[rid]?.[freqConstruct];
      if (score !== null && score !== undefined && score >= 2) groups[key].freq++;
    }
    return Object.values(groups)
      .map(({ grado, genero, total, freq }) => ({
        grado,
        genero,
        pct:     Math.round(freq / total * 1000) / 10,
        n:       freq,
        n_total: total,
      }))
      .sort((a, b) => b.pct - a.pct);
  }

  subgrupos.agresion_por_grado            = prevByGroup("grado",  "perpetracion");
  subgrupos.victimizacion_por_grado       = prevByGroup("grado",  "victimizacion");
  subgrupos.agresion_por_genero           = prevByGroup("genero", "perpetracion");
  subgrupos.victimizacion_por_genero      = prevByGroup("genero", "victimizacion");
  subgrupos.victimizacion_grado_genero    = prevByGradeGender("victimizacion");
  subgrupos.agresion_grado_genero         = prevByGradeGender("perpetracion");

  // 18) Cyber overlap
  let cyberOverlap = null;
  const n_trad  = responseIds.filter(rid => (studentScores[rid]?.victimizacion    ?? 0) >= 2).length;
  const n_cyber = responseIds.filter(rid => (studentScores[rid]?.cybervictimizacion ?? 0) >= 2).length;
  const n_both  = responseIds.filter(rid =>
    (studentScores[rid]?.victimizacion ?? 0) >= 2 &&
    (studentScores[rid]?.cybervictimizacion ?? 0) >= 2
  ).length;

  if (n > 0) {
    cyberOverlap = {
      victimas_tradicionales: n_trad,
      pct_tradicionales:      Math.round(n_trad / n * 1000) / 10,
      cibervictimas:          n_cyber,
      pct_cyber:              Math.round(n_cyber / n * 1000) / 10,
      ambos:                  n_both,
      pct_ambos_de_trad:      n_trad ? Math.round(n_both / n_trad * 1000) / 10 : 0,
    };
  }

  // 19) Cronbach alpha per construct (basic)
  const reliability = {};
  const mainConstructs = ["victimizacion", "perpetracion", "cybervictimizacion", "cyberagresion", "autoridad_docente", "normas_grupo", "respuesta_institucional", "internivel"];

  for (const construct of mainConstructs) {
    // Build item matrix: each row = one respondent, columns = items for this construct
    const itemExtIds = Object.entries(FULL_CONSTRUCT_MAP)
      .filter(([, c]) => c === construct)
      .map(([extId]) => extId);

    if (itemExtIds.length < 2) continue;

    // Find question IDs for these external IDs
    const qIds = questionsData
      .filter(q => itemExtIds.includes(q.external_id))
      .map(q => q.id);

    if (qIds.length < 2) continue;

    const matrix = responseIds.map(rid => {
      return qIds.map(qId => {
        const ans = answersData.find(a => a.survey_response_id === rid && a.question_id === qId);
        if (!ans) return null;
        const opt = optionMap[answerToOption[ans.id]];
        if (!opt) return null;
        const score = parseFloat(opt.option_code);
        return isNaN(score) ? null : score;
      });
    }).filter(row => row.some(v => v !== null));

    if (matrix.length > 1) {
      reliability[construct] = {
        cronbach_alpha: cronbachAlpha(matrix),
        n_items: qIds.length,
        n_respondents: matrix.length,
      };
    }
  }

  // 20) Risk index
  const riskIndex = calcRiskIndex(prevalences);

  // 21) Prevalence summary with display names
  const prevalenceSummary = {};
  for (const [k, v] of Object.entries(prevalences)) {
    if (!v) continue;
    prevalenceSummary[DISPLAY_NAMES[k] || k] = v;
  }

  // 22) Sample representativeness (Wilson formula, 95% confidence, ±5% margin)
  function calcRepresentativeness(population, sample) {
    if (!population || population === 0) return null;
    const Z = 1.96;   // 95% confidence
    const p = 0.5;    // most conservative proportion
    const e = 0.05;   // ±5% margin of error

    // Minimum sample size needed (infinite population)
    const n_inf = (Z * Z * p * (1 - p)) / (e * e);
    // Correction for finite population
    const n_min = Math.ceil(n_inf / (1 + (n_inf - 1) / population));

    // Actual margin of error achieved with this sample
    const actual_e = sample >= population
      ? 0
      : Math.round(Z * Math.sqrt((p * (1 - p) / sample) * (1 - sample / population)) * 1000) / 10;

    const pct_encuestados = Math.round(sample / population * 1000) / 10;
    const is_representative = sample >= n_min;

    return {
      total_matriculados:  population,
      n_encuestados:       sample,
      pct_encuestados,
      muestra_minima:      n_min,
      margen_error_real:   actual_e,
      es_representativa:   is_representative,
      nivel_confianza:     95,
      margen_objetivo:     5,
    };
  }

  const representatividad = total_matriculados > 0
    ? calcRepresentativeness(total_matriculados, n)
    : null;

  // 23) Assemble final response
  const result = {
    ok:           true,
    escuela:      schoolName,
    school_id,
    school_country: schoolCountry,
    analysis_dt,
    n_estudiantes: n,
    fecha:         new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }),

    prevalencias:       prevalenceSummary,
    top3_riesgo:        top3,
    ecologia_reporte:   ecologia,
    tipologia:          typologyPct,
    subgrupos_reporte:  subgrupos,
    cyber_overlap:      cyberOverlap,
    indice_riesgo:      riskIndex,
    fiabilidad:         reliability,
    demograficos:       demoBreakdown,
    representatividad,
  };

  return res.status(200).json(result);
}
