// /api/import-csv.js
//
// Imports survey responses from a CSV file uploaded by the school encargado.
// The school_id comes from the authenticated session (JWT cookie).
// The survey is detected automatically from the grado column + country.
//
// Flow:
//   POST /api/import-csv  (multipart/form-data, field: "file")
//     → { ok, preview: [...], errors: [...], survey_code, n_rows }
//
//   POST /api/import-csv  (multipart/form-data, field: "file", confirm: "true")
//     → { ok, imported: N }

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY;
const NOW                 = () => new Date().toISOString();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Session via cookie (same as /api/me.js) ──────────────────────────────────
function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

// ── Routing map: grado code → survey_uuid ────────────────────────────────────
const ROUTING = {
  MX: {
    grades: {
      "1":  "aaaaaaaa-0002-4000-a000-000000000002", // MX_PRIMARIA
      "2":  "aaaaaaaa-0002-4000-a000-000000000002",
      "3":  "aaaaaaaa-0002-4000-a000-000000000002",
      "4":  "aaaaaaaa-0002-4000-a000-000000000002",
      "5":  "aaaaaaaa-0002-4000-a000-000000000002",
      "6":  "aaaaaaaa-0002-4000-a000-000000000002",
      "1S": "aaaaaaaa-0001-4000-a000-000000000001", // MX
      "2S": "aaaaaaaa-0001-4000-a000-000000000001",
      "3S": "aaaaaaaa-0001-4000-a000-000000000001",
      "1P": "aaaaaaaa-0001-4000-a000-000000000001",
      "2P": "aaaaaaaa-0001-4000-a000-000000000001",
      "3P": "aaaaaaaa-0001-4000-a000-000000000001",
    }
  },
  CL: {
    grades: {
      "1B": "aaaaaaaa-0004-4000-a000-000000000004", // CL_BASICA
      "2B": "aaaaaaaa-0004-4000-a000-000000000004",
      "3B": "aaaaaaaa-0004-4000-a000-000000000004",
      "4B": "aaaaaaaa-0004-4000-a000-000000000004",
      "5B": "aaaaaaaa-0004-4000-a000-000000000004",
      "6B": "aaaaaaaa-0004-4000-a000-000000000004",
      "7B": "aaaaaaaa-0004-4000-a000-000000000004",
      "8B": "aaaaaaaa-0004-4000-a000-000000000004",
      "1M": "aaaaaaaa-0003-4000-a000-000000000003", // CL
      "2M": "aaaaaaaa-0003-4000-a000-000000000003",
      "3M": "aaaaaaaa-0003-4000-a000-000000000003",
      "4M": "aaaaaaaa-0003-4000-a000-000000000003",
    }
  }
};

// ── CSV column → question external_id map ─────────────────────────────────────
// For MX/CL secondary surveys (q7-q57)
const COL_TO_EXTERNAL_SEC = {
  grado:        "zero_general_curso",
  edad:         "zero_general_edad_v2",
  genero:       "zero_general_genero_v2",
  lengua:       "zero_general_lengua_v2",
  tiempo:       "zero_general_tiempo_v2",
  tipo_escuela: "zero_general_tipo_escuela_v2",
  q7:  "zero_autoridad_normas",        q8:  "zero_autoridad_escucha",
  q9:  "zero_autoridad_interviene",    q10: "zero_autoridad_seguimiento",
  q11: "zero_autoridad_accion_digital",q12: "zero_autoridad_coordina",
  q13: "zero_autoridad_bienestar",     q14: "zero_normas_reaccion_v2",
  q15: "zero_normas_defensa_observada",q16: "zero_normas_defensa_apoyo",
  q17: "zero_normas_intervencion_activa_v2",
  q18: "zero_institucional_protege",   q19: "zero_institucional_seguimiento",
  q20: "zero_institucional_orientador",q21: "zero_institucional_acceso_adulto",
  q22: "zero_institucional_sin_represalia", q23: "zero_institucional_protocolo",
  q24: "zero_internivel_supervision",  q25: "zero_internivel_intervencion",
  q26: "zero_internivel_norma",        q27: "zero_internivel_intimidacion",
  q28: "zero_internivel_coercion",     q29: "zero_victima_agresion_fisica_v2",
  q30: "zero_victima_amenazas_v2",     q31: "zero_victima_insultos_v2",
  q32: "zero_victima_rumores_v2",      q33: "zero_victima_exclusion_v2",
  q34: "zero_victima_coercion_v2",     q35: "zero_victima_discriminacion_v2",
  q36: "zero_victima_acoso_sexual",    q37: "zero_agresor_agresion_fisica_v2",
  q38: "zero_agresor_amenazas_v2",     q39: "zero_agresor_insultos_v2",
  q40: "zero_agresor_rumores_v2",      q41: "zero_agresor_exclusion_v2",
  q42: "zero_agresor_coercion_v2",     q43: "zero_agresor_discriminacion_v2",
  q44: "zero_cybervictima_mensajes",   q45: "zero_cybervictima_anonimo",
  q46: "zero_cybervictima_fotos",      q47: "zero_cybervictima_extorsion",
  q48: "zero_cybervictima_continua",   q49: "zero_cybervictima_masivo",
  q50: "zero_cyberagresor_mensajes",   q51: "zero_cyberagresor_exclusion",
  q52: "zero_ecologia_aula_v2",        q53: "zero_ecologia_patio_v2",
  q54: "zero_ecologia_banos",          q55: "zero_ecologia_entrada_salida_v2",
  q56: "zero_ecologia_transporte_v2",  q57: "zero_ecologia_cafeteria_v2",
};

// For MX/CL primaria surveys (q1-q38)
// Note: edad uses p4_edad, genero uses p4_genero (not the zero_general_* versions)
const COL_TO_EXTERNAL_PRI = {
  grado: "zero_general_curso",
  q1:  "zero_general_edad_v2",
  q2:  "zero_general_genero_v2",
  q3:  "p4_primer_anio",
  q4:  "p4_maestro_reglas",          q5:  "p4_maestro_detiene_bullying",
  q6:  "p4_maestro_ayuda_conflictos",q7:  "p4_amigos_defienden",
  q8:  "p4_pertenencia_grupo",       q9:  "p4_apoyo_companeros",
  q10: "p4_grupo_evita_bullying",    q11: "p4_apoyo_al_defender",
  q12: "p4_adultos_ayudan",          q13: "p4_conoce_adulto_ayuda",
  q14: "p4_confianza_pedir_ayuda",   q15: "p4_victima_fisica",
  q16: "p4_victima_verbal",          q17: "p4_victima_exclusion",
  q18: "p4_victima_amenazas",        q19: "p4_victima_discriminacion",
  q20: "p4_agresor_fisico_verbal",   q21: "p4_defensor_activo",
  q22: "p4_inclusion_activa",        q23: "p4_agresor_exclusion",
  q24: "p4_cyber_victima_mensajes",  q25: "p4_cyber_victima_foto",
  q26: "p4_cyber_victima_exclusion", q27: "p4_cyber_confianza_adulto",
  q28: "p4_cyber_educacion_maestro", q29: "p4_cyber_victima_general",
  q30: "p4_cyber_agresor",           q31: "p4_internivel_trato",
  q32: "p4_mapa_patio",              q33: "p4_mapa_banos_pasillos",
  q34: "p4_mapa_biblioteca",         q35: "p4_mapa_entrada_salida",
  q36: "p4_bienestar_gusto",         q37: "p4_bienestar_seguridad",
  q38: "p4_bienestar_general",
};

const PRIMARIA_SURVEY_IDS = new Set([
  "aaaaaaaa-0002-4000-a000-000000000002",
  "aaaaaaaa-0004-4000-a000-000000000004",
]);

// ── Parse CSV ─────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n")
    .filter(l => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").trim(); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
  return { headers, rows };
}

// ── Read multipart body ───────────────────────────────────────────────────────
async function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const body   = Buffer.concat(chunks);
      const ct     = req.headers["content-type"] || "";
      const bMatch = ct.match(/boundary=(.+)/);
      if (!bMatch) return reject(new Error("No boundary"));
      const boundary = "--" + bMatch[1].trim();
      const parts    = body.toString("binary").split(boundary)
        .filter(p => p.includes("Content-Disposition"));

      const fields = {};
      let fileText = null;

      for (const part of parts) {
        const [rawHeaders, ...bodyParts] = part.split("\r\n\r\n");
        const partBody = bodyParts.join("\r\n\r\n").replace(/\r\n--$/, "");
        const nameMatch = rawHeaders.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        if (rawHeaders.includes("filename=")) {
          fileText = partBody;
        } else {
          fields[name] = partBody.replace(/\r\n$/, "");
        }
      }
      resolve({ fields, fileText });
    });
    req.on("error", reject);
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // Auth — same as /api/me.js
  const cookies   = parseCookies(req.headers.cookie || "");
  const school_id = cookies["t4z_session"];
  if (!school_id) {
    return res.status(401).json({ ok: false, error: "NOT_AUTHENTICATED" });
  }
  const { data: school } = await supabase
    .from("schools")
    .select("id, country, language")
    .eq("id", school_id)
    .maybeSingle();
  if (!school) {
    return res.status(401).json({ ok: false, error: "SCHOOL_NOT_FOUND" });
  }
  const country  = (school.country || "MX").toUpperCase();
  const language = school.language === "en" ? "en" : "es";

  // Parse multipart
  let fields, fileText;
  try {
    ({ fields, fileText } = await readMultipart(req));
  } catch (e) {
    return res.status(400).json({ ok: false, error: "INVALID_MULTIPART" });
  }

  if (!fileText) {
    return res.status(400).json({ ok: false, error: "NO_FILE" });
  }

  const confirm = fields.confirm === "true";

  // Parse CSV
  const { headers, rows } = parseCSV(fileText);
  if (!rows.length) {
    return res.status(400).json({ ok: false, error: "EMPTY_CSV" });
  }
  if (!headers.includes("grado")) {
    return res.status(400).json({ ok: false, error: "MISSING_GRADO_COLUMN" });
  }

  // Detect survey from first non-empty grado
  const countryRouting = ROUTING[country];
  if (!countryRouting) {
    return res.status(400).json({ ok: false, error: `UNSUPPORTED_COUNTRY_${country}` });
  }

  const firstGrado = rows.find(r => r.grado)?.grado?.toUpperCase();
  const survey_id  = countryRouting.grades[firstGrado];
  if (!survey_id) {
    return res.status(400).json({ ok: false, error: `UNKNOWN_GRADO_${firstGrado}` });
  }

  const isPrimaria   = PRIMARIA_SURVEY_IDS.has(survey_id);
  const colMap       = isPrimaria ? COL_TO_EXTERNAL_PRI : COL_TO_EXTERNAL_SEC;

  // Load question + option maps from Supabase for this survey
  const externalIds = [...new Set(Object.values(colMap))];

  const { data: questionsData } = await supabase
    .from("questions")
    .select("id, external_id")
    .in("external_id", externalIds);

  const questionMap = {};
  (questionsData || []).forEach(q => { questionMap[q.external_id] = q.id; });

  const { data: optionsData } = await supabase
    .from("question_options")
    .select("id, question_id, option_code, language")
    .eq("survey_id", survey_id);

  // Build: questionId + optionCode + language → optionId
  const optionMap = {};
  (optionsData || []).forEach(o => {
    const key = `${o.question_id}__${o.option_code}__${o.language}`;
    if (!optionMap[key]) optionMap[key] = o.id;
  });

  // Validate and process rows
  const validRows   = [];
  const errorRows   = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2; // 1-based + header
    const rowErrors = [];

    const grado = (row.grado || "").toUpperCase();
    const rowSurveyId = countryRouting.grades[grado];
    if (!rowSurveyId) {
      rowErrors.push(`Fila ${rowNum}: grado inválido "${row.grado}"`);
    } else if (rowSurveyId !== survey_id) {
      rowErrors.push(`Fila ${rowNum}: grado "${row.grado}" corresponde a una encuesta diferente — el CSV debe tener un solo nivel`);
    }

    if (rowErrors.length) { errorRows.push(...rowErrors); continue; }

    // Build answer map for this row
    const answers = [];
    for (const [col, extId] of Object.entries(colMap)) {
      if (col === "grado") continue;
      const code = row[col];
      if (code === undefined || code === "") continue;

      const questionId = questionMap[extId];
      if (!questionId) continue;

      const lang = language;
      const key  = `${questionId}__${code}__${lang}`;
      const enKey= `${questionId}__${code}__en`;
      const optionId = optionMap[key] || optionMap[enKey];

      if (!optionId) {
        rowErrors.push(`Fila ${rowNum}: código "${code}" inválido para columna ${col}`);
        continue;
      }
      answers.push({ questionId, optionId });
    }

    if (rowErrors.length) { errorRows.push(...rowErrors); continue; }
    validRows.push({ grado, answers });
  }

  // Preview mode — return summary without inserting
  if (!confirm) {
    return res.status(200).json({
      ok:          true,
      survey_id,
      survey_code: isPrimaria
        ? (country === "CL" ? "SURVEY_004_CL_BASICA" : "SURVEY_004_MX_PRIMARIA")
        : (country === "CL" ? "SURVEY_004_CL"        : "SURVEY_004_MX"),
      n_total:   rows.length,
      n_valid:   validRows.length,
      n_errors:  errorRows.length,
      errors:    errorRows.slice(0, 20),
      preview:   validRows.slice(0, 5).map((r, i) => ({
        fila: i + 2,
        grado: r.grado,
        n_respuestas: r.answers.length,
      })),
    });
  }

  // Confirm mode — insert into Supabase
  if (!validRows.length) {
    return res.status(400).json({ ok: false, error: "NO_VALID_ROWS" });
  }

  const analysisNow = new Date().toISOString();
  let imported = 0;

  for (const row of validRows) {
    const responseId = crypto.randomUUID();

    // Insert survey_response
    const { error: respErr } = await supabase
      .from("survey_responses")
      .insert({
        id:          responseId,
        school_id,
        survey_id,
        status:      "submitted",
        started_at:  analysisNow,
        submitted_at:analysisNow,
        language,
        analysis_requested_dt: null,
      });
    if (respErr) { console.error("Response insert error:", respErr); continue; }

    // Insert question_answers + answer_selected_options
    for (const { questionId, optionId } of row.answers) {
      const qaId = crypto.randomUUID();
      const { error: qaErr } = await supabase
        .from("question_answers")
        .insert({ id: qaId, survey_response_id: responseId, question_id: questionId, created_at: analysisNow });
      if (qaErr) { console.error("QA insert error:", qaErr); continue; }

      await supabase
        .from("answer_selected_options")
        .insert({ id: crypto.randomUUID(), question_answer_id: qaId, option_id: optionId });
    }

    imported++;
  }

  return res.status(200).json({ ok: true, imported });
}
