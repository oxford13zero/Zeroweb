// /api/me.js
import { createClient } from "@supabase/supabase-js";

function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

export default async function handler(req, res) {
  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const school_id = cookies["t4z_session"];
    if (!school_id) return res.status(200).json({ ok: false, error: "NO_SESSION" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL) return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_URL" });
    if (!SUPABASE_KEY) return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_SERVICE_KEY" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    const { data: school, error } = await supabase
      .from("schools")
      .select("id, name")
      .eq("id", school_id)
      .maybeSingle();

    if (error || !school) return res.status(200).json({ ok: false, error: "SCHOOL_NOT_FOUND" });

    return res.status(200).json({ ok: true, school_id: school.id, school_name: school.name });
  } catch (e) {
    console.error("me error:", e);
    return res.status(200).json({ ok: false, error: "SERVER_ERROR" });
  }
}
