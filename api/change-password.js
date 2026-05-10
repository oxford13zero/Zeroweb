import { createClient } from "@supabase/supabase-js";
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    // Verify session
    const cookies = parseCookies(req.headers.cookie || "");
    const school_id = cookies["t4z_session"];

    if (!school_id) {
      return res.status(401).json({ ok: false, error: "NOT_AUTHENTICATED" });
    }

    const { currentPassword, newPassword } = await readJsonBody(req);

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_FIELDS",
        detail: "Se requieren la contraseña actual y la nueva contraseña"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        ok: false,
        error: "PASSWORD_TOO_SHORT",
        detail: "La nueva contraseña debe tener al menos 8 caracteres"
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        ok: false,
        error: "SAME_PASSWORD",
        detail: "La nueva contraseña debe ser diferente a la actual"
      });
    }

    // Fetch school record
    const { data: school, error } = await supabase
      .from("schools")
      .select("id, password, password_hash, must_change_password")
      .eq("id", school_id)
      .maybeSingle();

    if (error || !school) {
      return res.status(404).json({ ok: false, error: "SCHOOL_NOT_FOUND" });
    }

    // Verify current password — same two-path logic as login.js
    let isValid = false;

    if (school.password_hash) {
      isValid = await bcrypt.compare(currentPassword, school.password_hash);
    } else if (school.password) {
      isValid = (school.password === currentPassword);
    }

    if (!isValid) {
      return res.status(401).json({
        ok: false,
        error: "WRONG_CURRENT_PASSWORD",
        detail: "La contraseña actual es incorrecta"
      });
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabase
      .from("schools")
      .update({
        password_hash: newHash,
        password: null,
        must_change_password: false
      })
      .eq("id", school_id);

    if (updateError) {
      console.error("Password update error:", updateError);
      return res.status(500).json({ ok: false, error: "UPDATE_FAILED" });
    }

    return res.status(200).json({
      ok: true,
      message: "Contraseña actualizada correctamente"
    });

  } catch (e) {
    console.error("change-password error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
