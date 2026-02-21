// /api/_lib/adminAuth.js
import { supabaseAdmin } from "./supabaseAdmin.js";
import { isValidTokenFormat } from "./generateSessionToken.js";

/**
 * Require admin authentication for API endpoints
 * Validates session token against admin_sessions table
 * 
 * @param {Request} req - HTTP request object
 * @param {Response} res - HTTP response object
 * @returns {Object|null} Admin user object if authenticated, null otherwise
 */
export async function requireAdminAuth(req, res) {
  try {
    // Extract session token from cookie
    const cookies = req.headers.cookie || '';
    const adminCookie = cookies.split(';')
      .find(c => c.trim().startsWith('t4z_admin_session='));
    
    if (!adminCookie) {
      res.status(401).json({ 
        ok: false, 
        error: 'ADMIN_AUTH_REQUIRED',
        detail: 'Admin session cookie not found'
      });
      return null;
    }

    const sessionToken = adminCookie.split('=')[1]?.trim();
    
    if (!sessionToken) {
      res.status(401).json({ 
        ok: false, 
        error: 'INVALID_SESSION_TOKEN',
        detail: 'Session token is empty'
      });
      return null;
    }

    // Validate token format (security: prevent SQL injection)
    if (!isValidTokenFormat(sessionToken)) {
      res.status(401).json({ 
        ok: false, 
        error: 'INVALID_TOKEN_FORMAT',
        detail: 'Session token format is invalid'
      });
      return null;
    }

    // Query session with admin user data in single query (performance optimization)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('admin_sessions')
      .select(`
        id,
        admin_id,
        expires_at,
        admin_users!inner (
          id,
          username,
          full_name,
          role,
          is_active
        )
      `)
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      res.status(401).json({ 
        ok: false, 
        error: 'INVALID_ADMIN_SESSION',
        detail: 'Session not found or expired'
      });
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    
    if (expiresAt < now) {
      // Clean up expired session
      await supabaseAdmin
        .from('admin_sessions')
        .delete()
        .eq('id', session.id);

      res.status(401).json({ 
        ok: false, 
        error: 'ADMIN_SESSION_EXPIRED',
        detail: 'Session has expired, please login again'
      });
      return null;
    }

    // Check if admin user is active
    const admin = session.admin_users;
    
    if (!admin || !admin.is_active) {
      res.status(401).json({ 
        ok: false, 
        error: 'ADMIN_INACTIVE',
        detail: 'Admin account is inactive'
      });
      return null;
    }

    // Update last_accessed_at timestamp (fire and forget - don't await)
    supabaseAdmin
      .from('admin_sessions')
      .update({ last_accessed_at: now.toISOString() })
      .eq('id', session.id)
      .then(() => {})
      .catch(err => console.error('Failed to update session access time:', err));

    // Return authenticated admin info
    return {
      ok: true,
      admin: {
        id: admin.id,
        username: admin.username,
        full_name: admin.full_name,
        role: admin.role
      },
      session: {
        id: session.id,
        expires_at: session.expires_at
      }
    };

  } catch (e) {
    console.error('Admin auth error:', e);
    res.status(500).json({ 
      ok: false, 
      error: 'AUTH_ERROR',
      detail: 'Internal authentication error'
    });
    return null;
  }
}

/**
 * Optional: Get admin info without requiring auth (doesn't send 401)
 * Useful for endpoints that work differently for authenticated vs anonymous
 */
export async function getAdminIfAuthenticated(req) {
  try {
    const cookies = req.headers.cookie || '';
    const adminCookie = cookies.split(';')
      .find(c => c.trim().startsWith('t4z_admin_session='));
    
    if (!adminCookie) return null;

    const sessionToken = adminCookie.split('=')[1]?.trim();
    if (!sessionToken || !isValidTokenFormat(sessionToken)) return null;

    const { data: session } = await supabaseAdmin
      .from('admin_sessions')
      .select(`
        admin_id,
        expires_at,
        admin_users!inner (id, username, full_name, role, is_active)
      `)
      .eq('session_token', sessionToken)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) return null;
    if (!session.admin_users?.is_active) return null;

    return {
      id: session.admin_users.id,
      username: session.admin_users.username,
      full_name: session.admin_users.full_name,
      role: session.admin_users.role
    };

  } catch (e) {
    return null;
  }
}
