// /api/submit-response.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // Auth por cookie t4z_session
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

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

  if (existing.school_id !== auth.school.id) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
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
