// /api/request-analysis.js
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
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    // 1) Leer cookie tal como la crea login.js (t4z_session = schoolId)
    const cookies = parseCookies(req.headers.cookie || "");
    const school_id = (cookies["t4z_session"] || "").trim();

    if (!school_id) {
      return res.status(200).json({ ok: false, error: "NO_SESSION" });
    }

    // 2) Conectar a Supabase igual que login.js (mismas env vars)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_CONFIG" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });

    // 3) Guardar TIMESTAMPTZ (ISO8601) en analysis_requested_dt
    const ts = new Date().toISOString();

    const { data, error } = await supabase
      .from("survey_responses")
      .update({ analysis_requested_dt: ts })
      .eq("school_id", school_id)
      .is("analysis_requested_dt", null)
      .select("id");

    if (error) {
      console.error("request-analysis supabase error:", error);
      return res.status(500).json({ ok: false, error: error.message || "SUPABASE_UPDATE_FAILED" });
    }

    const updated_count = Array.isArray(data) ? data.length : 0;

    return res.status(200).json({
      ok: true,
      school_id,
      updated_count,
      analysis_requested_dt: ts
    });

  } catch (e) {
    console.error("request-analysis error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
