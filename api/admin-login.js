// /api/admin-login.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { generateSessionToken, getSessionExpiration } from "./_lib/generateSessionToken.js";
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_CREDENTIALS",
        detail: "Username and password are required"
      });
    }

    // 1. Validate credentials against admin_users table
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("id, username, password_hash, full_name, role, is_active")
      .eq("username", username)
      .maybeSingle();

    if (adminError || !admin) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_CREDENTIALS",
        detail: "Invalid username or password"
      });
    }

    // Check if admin account is active
    if (!admin.is_active) {
      return res.status(401).json({
        ok: false,
        error: "ACCOUNT_INACTIVE",
        detail: "Admin account is inactive"
      });
    }

    // 2. Verify password using bcrypt
    let isValid = false;
    
    try {
      isValid = await bcrypt.compare(password, admin.password_hash);
    } catch (bcryptError) {
      console.error("Bcrypt error:", bcryptError);
      return res.status(500).json({
        ok: false,
        error: "PASSWORD_VERIFICATION_FAILED",
        detail: "Error verifying password"
      });
    }

    if (!isValid) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_CREDENTIALS",
        detail: "Invalid username or password"
      });
    }

    // 3. Generate secure session token
    const sessionToken = generateSessionToken();
    const expiresAt = getSessionExpiration(8); // 8 hours

    // 4. Get client info for audit trail
    const ipAddress = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.socket?.remoteAddress || 
                     'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // 5. Create session record in database
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("admin_sessions")
      .insert({
        admin_id: admin.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent
      })
      .select("id, expires_at")
      .single();

    if (sessionError || !session) {
      console.error("Session creation failed:", sessionError);
      return res.status(500).json({
        ok: false,
        error: "SESSION_CREATION_FAILED",
        detail: "Failed to create session"
      });
    }

    // 6. Update last login timestamp
    await supabaseAdmin
      .from("admin_users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", admin.id);

    // 7. Set secure cookies
    const cookieOptions = [
      `t4z_admin_session=${sessionToken}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${8 * 60 * 60}`, // 8 hours in seconds
      // Add 'Secure' in production (requires HTTPS)
      // process.env.NODE_ENV === 'production' ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    // Set additional cookies for client-side access (non-sensitive data)
    const usernameCookie = `t4z_admin_username=${admin.username}; Path=/; Max-Age=${8 * 60 * 60}; SameSite=Lax`;
    const roleCookie = `t4z_admin_role=${admin.role}; Path=/; Max-Age=${8 * 60 * 60}; SameSite=Lax`;

    res.setHeader('Set-Cookie', [
      cookieOptions,
      usernameCookie,
      roleCookie
    ]);

    // 8. Return success response
    return res.status(200).json({
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
    });

  } catch (e) {
    console.error("Admin login error:", e);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR",
      detail: e?.message || String(e)
    });
  }
}
