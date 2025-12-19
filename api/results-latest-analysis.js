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
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    // 1) Leer cookie (misma lógica que tu login.js)
    const cookies = parseCookies(req.headers.cookie || "");
    const school_id = cookies["t4z_session"];
    if (!school_id) {
      return res.status(200).json({ ok: false, error: "NO_SESSION" });
    }

    // 2) Supabase backend (igual estilo login.js)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 3) Buscar el analysis_requested_dt más reciente para esa escuela
    const { data, error } = await supabase
      .from("survey_responses")
      .select("analysis_requested_dt")
      .eq("school_id", school_id)
      .not("analysis_requested_dt", "is", null)
      .order("analysis_requested_dt", { ascending: false })
      .limit(1)
      .maybeSing
