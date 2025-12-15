// /api/start-response.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const { surveyId } = req.body || {};
  if (!surveyId) return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });

  // OJO: aquí guardamos surveyId tal cual lo envías ("survey_001" o UUID).
  // En el siguiente paso lo amarramos al ID real de la tabla surveys.
  const { data, error } = await supabaseAdmin
    .from("survey_responses")
    .insert({
      school_id: auth.school.id,
      survey_id: surveyId,
      status: "in_progress"
    })
    .select("id")
    .single();

  if (error || !data) {
    return res.status(500).json({ ok: false, error: "DB_INSERT_FAILED", detail: error?.message });
  }

  return res.status(200).json({ ok: true, responseId: data.id });
}

