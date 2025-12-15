// /api/save-answer.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 1) Validar sesión (escuela logueada)
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return; // requireAuth ya respondió (401) si falla
  const school = auth.school; // { id, ... }

  // 2) Validar payload
  const {
    responseId,     // UUID de survey_responses
    questionId,     // UUID de questions
    answerText,     // string (opcional)
    answerNumber,   // number (opcional)
    selectedOptionIds // array UUIDs (opcional)
  } = req.body || {};

  if (!responseId || !questionId) {
    return res.status(400).json({ error: "Missing responseId or questionId" });
  }

  const optionIds = Array.isArray(selectedOptionIds)
    ? selectedOptionIds.filter(Boolean)
    : [];

  // 3) Verificar que responseId pertenece a esta escuela
  const { data: respRow, error: respErr } = await supabaseAdmin
    .from("survey_responses")
    .select("id, school_id")
    .eq("id", responseId)
    .single();

  if (respErr || !respRow) return res.status(404).json({ error: "survey_response not found" });
  if (respRow.school_id !== school.id) return res.status(403).json({ error: "Forbidden" });

  // 4) Upsert de answer (1 fila por response+question)
  const baseAnswer = {
    survey_response_id: responseId,
    question_id: questionId,
    answer_text: typeof answerText === "string" ? answerText : null,
    answer_number: Number.isFinite(answerNumber) ? answerNumber : null,
  };

  const { data: answerRow, error: ansErr } = await supabaseAdmin
    .from("question_answers")
    .upsert(baseAnswer, { onConflict: "survey_response_id,question_id" })
    .select("id")
    .single();

  if (ansErr || !answerRow) {
    return res.status(500).json({ error: "Failed to upsert question_answers", detail: ansErr?.message });
  }

  const answerId = answerRow.id;

  // 5) Reemplazar opciones seleccionadas (si vienen)
  //    (borramos y reinsertamos para simplificar)
  if (Array.isArray(selectedOptionIds)) {
    const { error: delErr } = await supabaseAdmin
      .from("answer_selected_options")
      .delete()
      .eq("question_answer_id", answerId);

    if (delErr) return res.status(500).json({ error: "Failed to clear options", detail: delErr.message });

    if (optionIds.length > 0) {
      const rows = optionIds.map((optId) => ({
        question_answer_id: answerId,
        question_option_id: optId,
      }));

      const { error: insErr } = await supabaseAdmin
        .from("answer_selected_options")
        .insert(rows);

      if (insErr) return res.status(500).json({ error: "Failed to insert options", detail: insErr.message });
    }
  }

  return res.status(200).json({ ok: true, answerId });
}
