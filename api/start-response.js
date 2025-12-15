// /api/start-response.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });

  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const { surveyId } = req.body || {};
  if (!surveyId) return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });

  // 1) Resolver survey UUID:
  // - si surveyId ya es UUID, lo usamos tal cual
  // - si es "survey_001", lo buscamos por code (o slug) en tabla surveys
  let surveyUuid = null;

  const looksLikeUuid = typeof surveyId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(surveyId);

  if (looksLikeUuid) {
    surveyUuid = surveyId;
  } else {
    const { data: s, error: sErr } = await supabaseAdmin
      .from("surveys")
      .select("id")
      .eq("code", surveyId)   // <-- IMPORTANTE: tu surveys debe tener columna code = 'survey_001'
      .single();

    if (sErr || !s) {
      return res.status(400).json({ ok: false, error: "SURVEY_NOT_FOUND", detail: sErr?.message });
    }
    surveyUuid = s.id;
  }

  // 2) Crear response
  const { data, error } = await supabaseAdmin
    .from("survey_responses")
    .insert({
      school_id: auth.school.id,
      survey_id: surveyUuid,
      status: "in_progress"
    })
    .select("id")
    .single();

  if (error || !data) {
    return res.status(500).json({ ok: false, error: "DB_INSERT_FAILED", detail: error?.message });
  }

  return res.status(200).json({ ok: true, responseId: data.id, survey_id: surveyUuid });
}


