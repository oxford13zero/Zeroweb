import { createClient } from '@supabase/supabase-js';

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check admin session
    const cookies = parseCookies(req.headers.cookie || "");
    const admin_id = cookies["t4z_admin_session"];

    if (!admin_id) {
      return res.status(401).json({ ok: false, error: 'Admin authentication required' });
    }

    const { school_id, analysis_dt } = req.body;

    if (!school_id || !analysis_dt) {
      return res.status(400).json({ ok: false, error: 'Missing school_id or analysis_dt' });
    }

    // Initialize Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });

    // Approve the survey - ONLY 2 COLUMNS
    const { data, error } = await supabase
      .from('survey_responses')
      .update({
        analysis_approved: true,
        analysis_approved_at: new Date().toISOString()
      })
      .eq('school_id', school_id)
      .eq('analysis_requested_dt', analysis_dt)
      .eq('status', 'submitted');

    if (error) {
      console.error('Approve error:', error);
      return res.status(500).json({
        ok: false,
        error: 'Database error: ' + error.message
      });
    }

    console.log(`✅ Approved survey for school ${school_id}, analysis ${analysis_dt}`);

    return res.json({
      ok: true,
      message: 'Survey approved successfully'
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server error: ' + err.message
    });
  }
}