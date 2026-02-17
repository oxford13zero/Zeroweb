import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password required' });
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

    // Get admin user
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('id, username, password_hash, email, full_name, role, is_active')
      .eq('username', username)
      .maybeSingle();

    if (error || !adminUser) {
      console.log('Admin not found:', username);
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    // Check if active
    if (!adminUser.is_active) {
      return res.status(401).json({ ok: false, error: 'Account disabled' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, adminUser.password_hash);

    if (!isValid) {
      console.log('Invalid password for:', username);
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    // Update last login
    await supabase
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', adminUser.id);

    // Set session cookie (cleared when browser closes)
    res.setHeader('Set-Cookie', [
      `t4z_admin_session=${adminUser.id}; Path=/; HttpOnly; SameSite=Strict`,
      `t4z_admin_username=${adminUser.username}; Path=/; SameSite=Strict`,
      `t4z_admin_role=${adminUser.role}; Path=/; SameSite=Strict`
    ]);

    return res.json({
      ok: true,
      admin: {
        id: adminUser.id,
        username: adminUser.username,
        full_name: adminUser.full_name,
        role: adminUser.role
      }
    });

  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}