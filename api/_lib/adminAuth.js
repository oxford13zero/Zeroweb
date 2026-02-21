// /api/_lib/adminAuth.js
import { supabaseAdmin } from "./supabaseAdmin.js";

/**
 * Require admin authentication for API endpoints
 * Checks for admin session cookie and validates against admin_users table
 */
export async function requireAdminAuth(req, res) {
  try {
    // Get admin session cookie
    const cookies = req.headers.cookie || '';
    const adminCookie = cookies.split(';')
      .find(c => c.trim().startsWith('t4z_admin_session='));
    
    if (!adminCookie) {
      res.status(401).json({ ok: false, error: 'ADMIN_AUTH_REQUIRED' });
      return null;
    }

    const sessionToken = adminCookie.split('=')[1];
    
    if (!sessionToken) {
      res.status(401).json({ ok: false, error: 'INVALID_ADMIN_SESSION' });
      return null;
    }

    // Validate session token against admin_sessions table
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('admin_sessions')
      .select('admin_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      res.status(401).json({ ok: false, error: 'INVALID_ADMIN_SESSION' });
      return null;
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      res.status(401).json({ ok: false, error: 'ADMIN_SESSION_EXPIRED' });
      return null;
    }

    // Get admin user details
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, username, full_name, role, is_active')
      .eq('id', session.admin_id)
      .single();

    if (adminError || !admin || !admin.is_active) {
      res.status(401).json({ ok: false, error: 'ADMIN_NOT_FOUND_OR_INACTIVE' });
      return null;
    }

    return {
      ok: true,
      admin: {
        id: admin.id,
        username: admin.username,
        full_name: admin.full_name,
        role: admin.role
      }
    };

  } catch (e) {
    console.error('Admin auth error:', e);
    res.status(500).json({ ok: false, error: 'AUTH_ERROR' });
    return null;
  }
}