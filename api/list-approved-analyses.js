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
  console.log('========================================');
  console.log('API CALLED: list-approved-analyses');
  
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Parse cookies to get school_id
    const cookies = parseCookies(req.headers.cookie || "");
    const school_id = cookies["t4z_session"];

    console.log('Cookie school_id:', school_id);

    if (!school_id) {
      console.log('❌ No session cookie');
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }

    // Initialize Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('❌ Missing Supabase credentials');
      return res.status(500).json({ ok: false, error: 'Configuración incorrecta' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { 
      auth: { persistSession: false } 
    });

    console.log('✅ Querying approved analyses for school_id:', school_id);

    // Query approved analyses
    const { data, error } = await supabase
      .from('survey_responses')
      .select('school_id, analysis_requested_dt, analysis_approved_at, submitted_at')
      .eq('school_id', school_id)
      .eq('status', 'submitted')
      .eq('analysis_approved', true)
      .not('analysis_requested_dt', 'is', null);

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ 
        ok: false, 
        error: 'Error en base de datos: ' + error.message 
      });
    }

    console.log(`✅ Found ${data?.length || 0} rows`);

    if (!data || data.length === 0) {
      console.log('No approved analyses found');
      return res.json({ 
        ok: true, 
        analyses: [],
        message: 'No hay análisis aprobados'
      });
    }

    // Group by analysis_requested_dt
    const analysesMap = {};

    data.forEach(row => {
      const dt = row.analysis_requested_dt;
      
      if (!analysesMap[dt]) {
        analysesMap[dt] = {
          analysis_date: dt,
          approved_at: row.analysis_approved_at,
          total_students: 0,
          earliest_response: row.submitted_at,
          latest_response: row.submitted_at
        };
      }

      analysesMap[dt].total_students += 1;

      if (row.submitted_at) {
        if (!analysesMap[dt].earliest_response || row.submitted_at < analysesMap[dt].earliest_response) {
          analysesMap[dt].earliest_response = row.submitted_at;
        }
        if (!analysesMap[dt].latest_response || row.submitted_at > analysesMap[dt].latest_response) {
          analysesMap[dt].latest_response = row.submitted_at;
        }
      }
    });

    // Convert to array and sort by most recent first
    const analyses = Object.values(analysesMap).sort((a, b) => {
      return new Date(b.analysis_date) - new Date(a.analysis_date);
    });

    console.log(`✅ Returning ${analyses.length} grouped analyses`);
    console.log('========================================');

    return res.json({ 
      ok: true, 
      analyses: analyses,
      school_id: school_id
    });

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: 'Error del servidor: ' + err.message 
    });
  }
}
