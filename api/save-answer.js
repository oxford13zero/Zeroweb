// /api/save-answer.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

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

  // Verificar ownership del response
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

  // Upsert question_answers (TU esquema: answer_text)
  const baseAnswer = {
    survey_response_id: responseId,
    question_id: questionId,
    answer_text: typeof answerText === "string" ? answerText : null
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
      detail: ansErr?.message
    });
  }

  const answerId = ans.id;

  // selectedOptionIds llega como CODES desde UI (ej: ["2"])
  const codes = Array.isArray(selectedOptionIds) ? selectedOptionIds.filter(Boolean) : [];

  // Borrar opciones previas
  await supabaseAdmin
    .from("answer_selected_options")
    .delete()
    .eq("question_answer_id", answerId);

  if (codes.length > 0) {
    // Traducir option_code -> option_id (question_options.id)
    const { data: opts, error: optErr } = await supabaseAdmin
      .from("question_options")
      .select("id, option_code")
      .eq("question_id", questionId);

    if (optErr) {
      return res.status(500).json({ ok: false, error: "FAILED_LOAD_OPTIONS", detail: optErr.message });
    }

    const map = new Map((opts || []).map(o => [String(o.option_code), o.id]));
    const optionIds = codes.map(c => map.get(String(c))).filter(Boolean);

    if (optionIds.length > 0) {
      const rows = optionIds.map(optId => ({
        question_answer_id: answerId,
        option_id: optId
      }));

      const { error: insErr } = await supabaseAdmin
        .from("answer_selected_options")
        .insert(rows);

      if (insErr) {
        return res.status(500).json({ ok: false, error: "OPTIONS_INSERT_FAILED", detail: insErr.message });
      }
    }
  }

  return res.status(200).json({ ok: true, answerId });
}
