// /api/questions-map.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const { surveyId } = req.query;
  if (!surveyId) return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });

  // Map: position -> question_id
  const { data, error } = await supabaseAdmin
    .from("survey_questions")
    .select("position, question_id")
    .eq("survey_id", surveyId)
    .order("position", { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const map = {};
  for (const row of data || []) {
    map[String(row.position)] = row.question_id;
  }

  return res.status(200).json({ ok: true, map });
}


