import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COOKIE_NAME = 'results_session';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
      const idx = v.indexOf('=');
      return [v.slice(0, idx), decodeURIComponent(v.slice(idx + 1))];
    })
  );
}

export default async function handler(req, res) {
  const cookies = parseCookies(req);
  const schoolId = cookies[COOKIE_NAME];
  if (!schoolId) return res.status(401).json({ ok: false });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  const { data, error } = await supabase
    .from('schools')
    .select('id,name')
    .eq('id', Number(schoolId))
    .limit(1);

  if (error || !data || data.length === 0) return res.status(401).json({ ok: false });

  return res.json({ ok: true, school_id: data[0].id, school_name: data[0].name });
}
