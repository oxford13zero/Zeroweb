import { serialize } from "cookie";
import { createClient } from "@supabase/supabase-js";


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
    path: "/",              // CLAVE
    maxAge: 60 * 60 * 24    // 1 día
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

    // Busca escuela por username
    const { data: school, error } = await supabase
      .from("schools")
      .select("id, name, username, password")
      .eq("username", username)
      .single();

    if (error || !school) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    // Password en texto plano por ahora (más adelante hash)
    if (school.password !== password) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

   // Login OK → crear cookie de sesión
setSessionCookie(res, school.id);

return res.status(200).json({
  ok: true,
  school_id: school.id,
  school_name: school.name
});


  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}

