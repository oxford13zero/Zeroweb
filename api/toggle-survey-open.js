import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdminAuth } from "./_lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const adminAuth = await requireAdminAuth(req, res);
  if (!adminAuth?.ok) return;

  const { school_id, survey_open } = req.body;
  if (!school_id || survey_open === undefined) {
    return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });
  }

  const { error } = await supabaseAdmin
    .from('schools')
    .update({ survey_open })
    .eq('id', school_id);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true, survey_open });
}
