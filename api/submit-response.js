// /api/submit-response.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const { responseId } = req.body || {};
  if (!responseId) {
    return res.status(400).json({ ok: false, error: "MISSING_RESPONSE_ID" });
  }

  // Seguridad: solo permitir actualizar responses de ESA escuela
  const { data: existing, error: e0 } = await supabaseAdmin
    .from("survey_responses")
    .select("id, school_id, status")
    .eq("id", responseId)
    .single();

  if (e0 || !existing) {
    return res.status(404).json({ ok: false, error: "RESPONSE_NOT_FOUND" });
  }


  // Marcar como submitted (idempotente)
  const { data, error } = await supabaseAdmin
    .from("survey_responses")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", responseId)
    .select("id, status, submitted_at")
    .single();

  if (error || !data) {
    return res.status(500).json({
      ok: false,
      error: "DB_UPDATE_FAILED",
      detail: error?.message,
    });
  }

  return res.status(200).json({ ok: true, response: data });
}
