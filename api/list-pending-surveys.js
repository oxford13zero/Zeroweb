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
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  console.log('list-pending-surveys called');

  try {
    // Check admin session
    const cookies = parseCookies(req.headers.cookie || "");
    const admin_id = cookies["t4z_admin_session"];

    if (!admin_id) {
      console.log('❌ No admin session');
      return res.status(401).json({ ok: false, error: 'Admin authentication required' });
    }

    // Initialize Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });

    console.log('✅ Querying pending surveys...');

    // Get all pending surveys (not approved) - ONLY 2 COLUMNS
    const { data, error } = await supabase
      .from('survey_responses')
      .select('school_id, analysis_requested_dt, submitted_at')
      .eq('status', 'submitted')
      .eq('analysis_approved', false)
      .not('analysis_requested_dt', 'is', null);

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({
        ok: false,
        error: 'Database error: ' + error.message
      });
    }

    console.log(`✅ Found ${data?.length || 0} pending response rows`);

    if (!data || data.length === 0) {
      return res.json({
        ok: true,
        pending: [],
        message: 'No pending surveys'
      });
    }

    // Group by school_id + analysis_requested_dt
    const pendingMap = {};

    for (const row of data) {
      const key = `${row.school_id}_${row.analysis_requested_dt}`;

      if (!pendingMap[key]) {
        pendingMap[key] = {
          school_id: row.school_id,
          analysis_date: row.analysis_requested_dt,
          total_students: 0,
          earliest_response: row.submitted_at,
          latest_response: row.submitted_at
        };
      }

      pendingMap[key].total_students += 1;

      if (row.submitted_at) {
        if (!pendingMap[key].earliest_response || row.submitted_at < pendingMap[key].earliest_response) {
          pendingMap[key].earliest_response = row.submitted_at;
        }
        if (!pendingMap[key].latest_response || row.submitted_at > pendingMap[key].latest_response) {
          pendingMap[key].latest_response = row.submitted_at;
        }
      }
    }

    const pending = Object.values(pendingMap);

    // Get school names
    const schoolIds = [...new Set(pending.map(p => p.school_id))];
    
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);

    if (!schoolError && schools) {
      const schoolMap = {};
      schools.forEach(s => {
        schoolMap[s.id] = s.name;
      });

      pending.forEach(p => {
        p.school_name = schoolMap[p.school_id] || `Escuela ${p.school_id}`;
      });
    } else {
      pending.forEach(p => {
        p.school_name = `Escuela ${p.school_id}`;
      });
    }

    // Sort by most recent first
    pending.sort((a, b) => {
      return new Date(b.analysis_date) - new Date(a.analysis_date);
    });

    console.log(`✅ Returning ${pending.length} grouped pending surveys`);

    return res.json({
      ok: true,
      pending: pending
    });

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server error: ' + err.message
    });
  }
}

