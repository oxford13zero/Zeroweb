// /api/results-latest-analysis.js
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
  // SIEMPRE JSON
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    // 1) cookie => school_id
    const cookies = parseCookies(req.headers.cookie || "");
    const school_id = cookies["t4z_session"];
    if (!school_id) {
      return res.status(200).json({ ok: false, error: "NO_SESSION" });
    }

    // 2) config
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // ojo: mismo nombre que usas en login.js

    if (!SUPABASE_URL) {
      return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_URL" });
    }
    if (!SUPABASE_KEY) {
      return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_SERVICE_KEY" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    // 3) buscar max_dt
    const { data: latest, error: latestErr } = await supabase
      .from("survey_responses")
      .select("analysis_requested_dt")
      .eq("school_id", school_id)
      .not("analysis_requested_dt", "is", null)
      .order("analysis_requested_dt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_LATEST_FAILED",
        detail: latestErr.message || String(latestErr),
      });
    }

    const analysis_dt = latest?.analysis_requested_dt || null;

    return res.status(200).json({ ok: true, school_id, analysis_dt });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      detail: e?.message || String(e),
    });
  }
}
