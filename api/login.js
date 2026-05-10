import { serialize } from "cookie";
import { createClient } from "@supabase/supabase-js";
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

function setSessionCookie(res, schoolId) {
  const cookie = serialize("t4z_session", schoolId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24
  });
  res.setHeader("Set-Cookie", cookie);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const { username, password } = await readJsonBody(req);

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }



    
const { data: school, error } = await supabase
  .from("schools")
  .select("id, name, username, password, password_hash, must_change_password, is_active")
  .eq("username", username)
  .single();

if (error || !school) {
  return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
}

if (school.is_active === false) {
  return res.status(403).json({
    ok: false,
    error: "ACCOUNT_DISABLED",
    detail: "Esta cuenta ha sido desactivada. Contacta al administrador."
  });
}



    
    // New schools: use bcrypt hash
    // Existing schools: use plaintext comparison (unchanged)
    let isValid = false;

    if (school.password_hash) {
      isValid = await bcrypt.compare(password, school.password_hash);
    } else if (school.password) {
      isValid = (school.password === password);
    }

    if (!isValid) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    setSessionCookie(res, school.id);

    return res.status(200).json({
      ok: true,
      school_id: school.id,
      school_name: school.name,
      must_change_password: school.must_change_password ?? false
    });

  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
