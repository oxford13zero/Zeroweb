// /api/save-answer.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const { responseId, questionId, answerText, selectedOptionIds } = req.body || {};

  if (!responseId || !questionId) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }

  // 1) Verificar ownership del response
  const { data: resp, error: respErr } = await supabaseAdmin
    .from("survey_responses")
    .select("id, school_id")
    .eq("id", responseId)
    .single();

  if (respErr || !resp) {
    return res.status(404).json({ ok: false, error: "RESPONSE_NOT_FOUND" });
  }
  if (resp.school_id !== auth.school.id) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }

  // 2) Upsert question_answers
  const baseAnswer = {
    survey_response_id: responseId,
    question_id: questionId,
    answer_text: typeof answerText === "string" ? answerText : null,
  };

  const { data: ans, error: ansErr } = await supabaseAdmin
    .from("question_answers")
    .upsert(baseAnswer, { onConflict: "survey_response_id,question_id" })
    .select("id")
    .single();

  if (ansErr || !ans) {
    return res.status(500).json({
      ok: false,
      error: "ANSWER_UPSERT_FAILED",
      detail: ansErr?.message,
    });
  }

  const answerId = ans.id;

  // 3) Normalizar selectedOptionIds
  const rawList = Array.isArray(selectedOptionIds) ? selectedOptionIds : [];
  const cleaned = rawList
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);

  // 4) Borrar opciones previas (idempotente)
  const { error: delErr } = await supabaseAdmin
    .from("answer_selected_options")
    .delete()
    .eq("question_answer_id", answerId);

  if (delErr) {
    return res.status(500).json({
      ok: false,
      error: "OPTIONS_DELETE_FAILED",
      detail: delErr.message,
    });
  }

  if (cleaned.length === 0) {
    // nada que insertar
    return res.status(200).json({ ok: true, answerId, insertedOptions: 0 });
  }

  // 5) Determinar si vienen UUIDs (option_id) o codes (option_code)
  const allUuids = cleaned.every(isUuid);

  let optionIds = [];

  if (allUuids) {
    // Caso nuevo: index.html manda option_id (UUID real)
    // Validamos que esos option_ids existan y pertenezcan a la pregunta
    const { data: opts, error: optErr } = await supabaseAdmin
      .from("question_options")
      .select("id, question_id")
      .in("id", cleaned);

    if (optErr) {
      return res.status(500).json({
        ok: false,
        error: "FAILED_VALIDATE_OPTIONS",
        detail: optErr.message,
      });
    }

    const valid = (opts || []).filter((o) => o.question_id === questionId);
    optionIds = valid.map((o) => o.id);
  } else {
    // Caso antiguo: UI manda codes, hay que mapear option_code -> id
    const { data: opts, error: optErr } = await supabaseAdmin
      .from("question_options")
      .select("id, option_code")
      .eq("question_id", questionId);

    if (optErr) {
      return res.status(500).json({
        ok: false,
        error: "FAILED_LOAD_OPTIONS",
        detail: optErr.message,
      });
    }

    const map = new Map((opts || []).map((o) => [String(o.option_code), o.id]));
    optionIds = cleaned.map((c) => map.get(String(c))).filter(Boolean);
  }

  // Si no quedó nada válido, devolvemos ok pero avisamos (te ayuda para debug)
  if (optionIds.length === 0) {
    return res.status(200).json({
      ok: true,
      answerId,
      insertedOptions: 0,
      warning: "NO_VALID_OPTIONS_AFTER_MAPPING",
      received: cleaned,
      mode: allUuids ? "uuid_option_ids" : "option_codes",
    });
  }

  // 6) Insertar en answer_selected_options
  const rows = optionIds.map((optId) => ({
    question_answer_id: answerId,
    option_id: optId,
  }));

  const { error: insErr } = await supabaseAdmin
    .from("answer_selected_options")
    .insert(rows);

  if (insErr) {
    return res.status(500).json({
      ok: false,
      error: "OPTIONS_INSERT_FAILED",
      detail: insErr.message,
    });
  }

  return res.status(200).json({
    ok: true,
    answerId,
    insertedOptions: rows.length,
    mode: allUuids ? "uuid_option_ids" : "option_codes",
  });
}

