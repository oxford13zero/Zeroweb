// /api/save-answer.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  // 3) Limpiar selecciones previas
  await supabaseAdmin
    .from("answer_selected_options")
    .delete()
    .eq("question_answer_id", answerId);

  const values = Array.isArray(selectedOptionIds)
    ? selectedOptionIds.filter(Boolean)
    : [];

  if (values.length === 0) {
    return res.status(200).json({ ok: true, answerId });
  }

  // 4) Separar UUIDs reales vs códigos legacy
  const optionIdsDirect = values.filter(v => UUID_REGEX.test(String(v)));
  const optionCodes = values.filter(v => !UUID_REGEX.test(String(v)));

  let optionIds = [...optionIdsDirect];

  // 5) Resolver option_code -> option_id (solo si es necesario)
  if (optionCodes.length > 0) {
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

    const map = new Map(
      (opts || []).map(o => [String(o.option_code), o.id])
    );

    optionCodes.forEach(code => {
      const id = map.get(String(code));
      if (id) optionIds.push(id);
    });
  }

  // 6) Insertar opciones seleccionadas
  if (optionIds.length > 0) {
    const rows = optionIds.map(optId => ({
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
  }

  return res.status(200).json({ ok: true, answerId });
}
