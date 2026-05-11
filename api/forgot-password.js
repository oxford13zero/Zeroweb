// /api/forgot-password.js
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const RESET_EXPIRY_MINUTES = 60;
const APP_URL = process.env.APP_URL || "https://tech4zero.com";

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

  // Always return the same response to prevent username enumeration
  const SUCCESS = {
    ok: true,
    message: "Si el usuario existe y tiene email registrado, recibirás instrucciones en breve."
  };

  try {
    const { username } = await readJsonBody(req);

    if (!username?.trim()) {
      return res.status(400).json({ ok: false, error: "MISSING_USERNAME" });
    }

    // 1. Find school by username
    const { data: school } = await supabase
      .from("schools")
      .select("id, name, username, is_active")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (!school || school.is_active === false) {
      return res.status(200).json(SUCCESS);
    }

    // 2. Find encargado email
    const { data: encargado } = await supabase
      .from("encargado_escolar")
      .select("first_name, email")
      .eq("school_id", school.id)
      .maybeSingle();

    if (!encargado?.email) {
      return res.status(200).json(SUCCESS);
    }

    // 3. Invalidate any existing unused tokens for this school
    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("school_id", school.id)
      .is("used_at", null);

    // 4. Create new reset token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);

    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        school_id: school.id,
        token,
        expires_at: expiresAt.toISOString()
      });

    if (insertError) {
      console.error("Token insert error:", insertError);
      return res.status(200).json(SUCCESS);
    }

    // 5. Send reset email via Resend
    const resetLink = `${APP_URL}/reset-password.html?token=${token}`;

    const { error: emailError } = await resend.emails.send({
      from: "Tech4Zero <no-reply@tech4zero.com>",
      to: encargado.email,
      subject: "Restablecer contraseña — TECH4ZERO",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1d27;color:#fff;border-radius:12px;overflow:hidden;">
          <div style="background:#1E2F3F;padding:28px 32px;border-bottom:1px solid #365468;">
            <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">
              TECH4<span style="color:#D6A21C;">ZERO</span>
            </div>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">Hola ${encargado.first_name},</h2>
            <p style="color:#a9c0d3;line-height:1.6;margin:0 0 24px;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta 
              <strong style="color:#fff;">${school.name}</strong> en TECH4ZERO.
            </p>
            <a href="${resetLink}"
               style="display:inline-block;background:#D6A21C;color:#0f1d27;font-weight:700;
                      font-size:15px;padding:13px 28px;border-radius:8px;text-decoration:none;">
              Restablecer contraseña
            </a>
            <p style="color:#4a6070;font-size:13px;margin:24px 0 0;line-height:1.6;">
              Este enlace expira en ${RESET_EXPIRY_MINUTES} minutos.<br>
              Si no solicitaste este cambio, puedes ignorar este correo.
            </p>
          </div>
          <div style="padding:20px 32px;border-top:1px solid #365468;font-size:12px;color:#4a6070;">
            © 2025 TECH4ZERO – Educational Designs
          </div>
        </div>
      `
    });

    if (emailError) {
      console.error("Resend error:", emailError);
    }

    return res.status(200).json(SUCCESS);

  } catch (e) {
    console.error("forgot-password error:", e);
    return res.status(200).json(SUCCESS);
  }
}
