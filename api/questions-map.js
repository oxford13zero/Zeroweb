// /api/questions-map.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const { surveyId } = req.query;
  if (!surveyId) {
    return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });
  }

  // Obtener preguntas del survey
  const { data, error } = await supabaseAdmin
    .from("survey_questions")
    .select(`
      questions (
        id,
        code
      )
    `)
    .eq("survey_id", surveyId);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  const map = {};
  for (const row of data || []) {
    if (row.questions?.code) {
      map[row.questions.code] = row.questions.id;
    }
  }

  return res.status(200).json({ ok: true, map });
}
