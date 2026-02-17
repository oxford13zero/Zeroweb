import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  console.log('========================================');
  console.log('API CALLED: list-approved-analyses');
  console.log('Method:', req.method);
  console.log('Has session?', !!req.session);
  console.log('School ID:', req.session?.school_id);
  console.log('========================================');

  // Allow GET only
  if (req.method !== 'GET') {
    console.log('❌ Wrong method');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Check session
  if (!req.session || !req.session.ok || !req.session.school_id) {
    console.log('❌ No valid session');
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }

  const schoolId = req.session.school_id;
  console.log('✅ School ID:', schoolId);

  try {
    console.log('Starting query...');
    
    const { data, error } = await supabase
      .from('survey_responses')
      .select('school_id, analysis_requested_dt, analysis_approved_at, submitted_at')
      .eq('school_id', schoolId)
      .eq('status', 'submitted')
      .eq('analysis_approved', true)
      .not('analysis_requested_dt', 'is', null);

    console.log('Query completed');
    console.log('Error?', error);
    console.log('Data rows:', data?.length);

    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ 
        ok: false, 
        error: 'Error en base de datos: ' + error.message 
      });
    }

    if (!data || data.length === 0) {
      console.log('⚠️ No data found');
      return res.json({ 
        ok: true, 
        analyses: [],
        message: 'No hay análisis aprobados'
      });
    }

    console.log(`✅ Found ${data.length} rows, grouping...`);

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

    const analyses = Object.values(analysesMap).sort((a, b) => {
      return new Date(b.analysis_date) - new Date(a.analysis_date);
    });

    console.log(`✅ Returning ${analyses.length} analyses`);
    console.log('First analysis:', JSON.stringify(analyses[0]));

    const response = { 
      ok: true, 
      analyses: analyses,
      school_id: schoolId
    };

    console.log('========================================');

    return res.json(response);

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    console.error('Stack:', err.stack);
    return res.status(500).json({ 
      ok: false, 
      error: 'Error del servidor: ' + err.message 
    });
  }
}
