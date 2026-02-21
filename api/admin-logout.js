// /api/admin-logout.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { isValidTokenFormat } from "./_lib/generateSessionToken.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    // Extract session token from cookie
    const cookies = req.headers.cookie || '';
    const adminCookie = cookies.split(';')
      .find(c => c.trim().startsWith('t4z_admin_session='));
    
    if (adminCookie) {
      const sessionToken = adminCookie.split('=')[1]?.trim();
      
      // Delete session from database if token is valid format
      if (sessionToken && isValidTokenFormat(sessionToken)) {
        const { error } = await supabaseAdmin
          .from("admin_sessions")
          .delete()
          .eq("session_token", sessionToken);

        if (error) {
          console.error("Failed to delete session:", error);
          // Don't fail the logout - still clear cookies
        }
      }
    }

    // Clear all admin cookies
    const cookiesToClear = [
      't4z_admin_session',
      't4z_admin_username',
      't4z_admin_role'
    ];

    const clearCookies = cookiesToClear.map(name => 
      `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );

    res.setHeader('Set-Cookie', clearCookies);

    return res.status(200).json({
      ok: true,
      message: "Logged out successfully"
    });

  } catch (e) {
    console.error("Admin logout error:", e);
    
    // Even on error, try to clear cookies
    const clearCookies = [
      't4z_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      't4z_admin_username=; Path=/; Max-Age=0',
      't4z_admin_role=; Path=/; Max-Age=0'
    ];
    res.setHeader('Set-Cookie', clearCookies);

    return res.status(500).json({
      ok: false,
      error: "LOGOUT_ERROR",
      detail: e?.message || String(e)
    });
  }
}
