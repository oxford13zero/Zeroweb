// /api/question-id-by-external.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const externalId = (req.query.externalId || "").trim();
  if (!externalId) {
    return res.status(400).json({ ok: false, error: "MISSING_EXTERNAL_ID" });
  }

  const { data, error } = await supabaseAdmin
    .from("questions")
    .select("id")
    .eq("external_id", externalId)
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  if (!data) {
    return res.status(404).json({ ok: false, error: "QUESTION_NOT_FOUND" });
  }

  return res.status(200).json({ ok: true, questionId: data.id });
}