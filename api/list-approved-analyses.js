const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  console.log('list-approved-analyses called');

  // Check session
  if (!req.session || !req.session.ok || !req.session.school_id) {
    console.log('❌ No session');
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }

  const schoolId = req.session.school_id;
  console.log('✅ School ID:', schoolId);

  try {
    console.log('Querying database...');
    
    const { data, error } = await supabase
      .from('survey_responses')
      .select('school_id, analysis_requested_dt, analysis_approved_at, submitted_at')
      .eq('school_id', schoolId)
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

    console.log(`✅ Found ${data ? data.length : 0} rows`);

    if (!data || data.length === 0) {
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

    const analyses = Object.values(analysesMap).sort((a, b) => {
      return new Date(b.analysis_date) - new Date(a.analysis_date);
    });

    console.log(`✅ Returning ${analyses.length} grouped analyses`);

    return res.json({ 
      ok: true, 
      analyses: analyses,
      school_id: schoolId
    });

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: 'Error del servidor: ' + err.message 
    });
  }

};
