// /api/save-answer.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
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
  // Para combobox/radio -> answer_text debe ser null (correcto).
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

  // 3) Siempre limpiar selecciones previas (idempotente)
  await supabaseAdmin.from("answer_selected_options").delete().eq("question_answer_id", answerId);

  // 4) Procesar selectedOptionIds (puede venir como UUIDs o como codes)
  const incoming = Array.isArray(selectedOptionIds) ? selectedOptionIds.filter(Boolean) : [];

  if (incoming.length === 0) {
    return res.status(200).json({ ok: true, answerId, inserted: 0 });
  }

  let optionIds = [];

  // Caso A: el frontend manda option_id UUID (question_options.id)
  if (incoming.every(isUuid)) {
    // Validar que esos option_ids pertenecen a la pregunta (seguridad)
    const { data: validOpts, error: vErr } = await supabaseAdmin
      .from("question_options")
      .select("id")
      .eq("question_id", questionId)
      .in("id", incoming);

    if (vErr) {
      return res.status(500).json({
        ok: false,
        error: "FAILED_VALIDATE_OPTIONS",
        detail: vErr.message,
      });
    }

    optionIds = (validOpts || []).map((o) => o.id);
  } else {
    // Caso B: el frontend manda codes (option_code), hay que mapearlos a option_id
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
    optionIds = incoming.map((c) => map.get(String(c))).filter(Boolean);
  }

  if (optionIds.length === 0) {
    // No es un error fatal: significa que llegaron valores no válidos
    return res.status(200).json({
      ok: true,
      answerId,
      inserted: 0,
      warning: "NO_VALID_OPTIONS_MATCHED",
    });
  }

  // 5) Insertar filas en answer_selected_options
  const rows = optionIds.map((optId) => ({
    question_answer_id: answerId,
    option_id: optId,
  }));

  const { error: insErr } = await supabaseAdmin.from("answer_selected_options").insert(rows);

  if (insErr) {
    return res.status(500).json({
      ok: false,
      error: "OPTIONS_INSERT_FAILED",
      detail: insErr.message,
    });
  }

  return res.status(200).json({ ok: true, answerId, inserted: rows.length });
}
