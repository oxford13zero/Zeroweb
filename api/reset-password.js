// /api/reset-password.js
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const { token, newPassword } = await readJsonBody(req);

    // Validate inputs
    if (!token) {
      return res.status(400).json({ ok: false, error: "MISSING_TOKEN" });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "PASSWORD_TOO_SHORT",
        detail: "La contraseña debe tener al menos 8 caracteres"
      });
    }

    // 1. Look up token
    const { data: resetToken, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("id, school_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !resetToken) {
      return res.status(400).json({ ok: false, error: "INVALID_TOKEN" });
    }

    if (resetToken.used_at) {
      return res.status(400).json({ ok: false, error: "TOKEN_ALREADY_USED" });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "TOKEN_EXPIRED" });
    }

    // 2. Hash new password
    const newHash = await bcrypt.hash(newPassword, 12);

    // 3. Update school password
    const { error: updateError } = await supabase
      .from("schools")
      .update({
        password_hash: newHash,
        password: null,
        must_change_password: false
      })
      .eq("id", resetToken.school_id);

    if (updateError) {
      console.error("Password update error:", updateError);
      return res.status(500).json({ ok: false, error: "UPDATE_FAILED" });
    }

    // 4. Mark token as used
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetToken.id);

    return res.status(200).json({
      ok: true,
      message: "Contraseña actualizada correctamente"
    });

  } catch (e) {
    console.error("reset-password error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
