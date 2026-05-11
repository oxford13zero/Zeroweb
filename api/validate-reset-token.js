// /api/validate-reset-token.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ ok: false, error: "MISSING_TOKEN" });
    }

    // Look up token joining school name
    const { data: resetToken, error } = await supabase
      .from("password_reset_tokens")
      .select("id, school_id, expires_at, used_at, schools(name)")
      .eq("token", token)
      .maybeSingle();

    if (error || !resetToken) {
      return res.status(200).json({ ok: false, valid: false, reason: "INVALID_TOKEN" });
    }

    if (resetToken.used_at) {
      return res.status(200).json({ ok: false, valid: false, reason: "TOKEN_ALREADY_USED" });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(200).json({ ok: false, valid: false, reason: "TOKEN_EXPIRED" });
    }

    return res.status(200).json({
      ok: true,
      valid: true,
      school_name: resetToken.schools?.name || ""
    });

  } catch (e) {
    console.error("validate-reset-token error:", e);
    return res.status(500).json({ ok: false, valid: false, reason: "SERVER_ERROR" });
  }
}
