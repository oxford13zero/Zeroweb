// /api/verify-exit-pin.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { responseId, pin } = req.body || {};
  if (!responseId || !pin) {
    return res.status(400).json({ ok: false, error: "responseId and pin are required" });
  }

  // Get the survey_id associated with this response
  const { data: response, error: responseError } = await supabaseAdmin
    .from("survey_responses")
    .select("id, survey_id, status")
    .eq("id", responseId)
    .maybeSingle();

  if (responseError || !response) {
    return res.status(404).json({ ok: false, error: "Response not found" });
  }

  if (response.status === "submitted") {
    return res.status(400).json({ ok: false, error: "Survey already submitted" });
  }

  // Get the exit_pin from the survey
  const { data: survey, error: surveyError } = await supabaseAdmin
    .from("surveys")
    .select("exit_pin")
    .eq("id", response.survey_id)
    .maybeSingle();

  if (surveyError || !survey) {
    return res.status(404).json({ ok: false, error: "Survey not found" });
  }

  if (!survey.exit_pin) {
    return res.status(400).json({ ok: false, error: "This survey has no exit PIN configured" });
  }

  // Compare PINs
  if (pin !== survey.exit_pin) {
    return res.status(401).json({ ok: false, error: "PIN incorrecto" });
  }

  // PIN correct — just return ok, response stays as in_progress
  return res.status(200).json({ ok: true });
}
