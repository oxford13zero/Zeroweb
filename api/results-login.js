import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// cookie independiente
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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: 'MISSING_CREDENTIALS' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // valida escuela
  const { data, error } = await supabase
    .from('schools')
    .select('id,name,username,password')
    .eq('username', username)
    .limit(1);

  if (error || !data || data.length === 0) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

  const school = data[0];
  if (school.password !== password) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

  // guardar sesión simple en cookie (id escuela)
  // (después lo mejoramos a JWT)
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(String(school.id))}; Path=/; HttpOnly; SameSite=Lax; Secure`);

  return res.json({ ok: true, school_id: school.id, school_name: school.name });
}
