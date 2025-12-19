// /api/request-analysis.js
import crypto from "crypto";
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

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

function verifySignedSession(token, secret) {
  const parts = (token || "").split(".");
  if (parts.length !== 2) return { ok: false };

  const [payloadB64Url, sig] = parts;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64Url)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return { ok: false };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false };

  const payloadJson = base64urlDecode(payloadB64Url);
  const payload = JSON.parse(payloadJson);

  if (!payload.exp || Date.now() > payload.exp) return { ok: false };

  return { ok: true, payload };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies["t4z_session"];
    if (!token) return res.status(200).json({ ok: false, error: "NO_SESSION" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "MISSING_JWT_SECRET" });

    const result = verifySignedSession(token, secret);
    if (!result.ok) return res.status(200).json({ ok: false, error: "INVALID_SESSION" });

    const { school_id } = result.payload || {};
    if (!school_id) return res.status(200).json({ ok: false, error: "MISSING_SCHOOL_ID" });

    const SUPABASE_URL =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    // Recomendado: usar SERVICE ROLE en backend.
    // Si no existe, cae a ANON (puede fallar por RLS).
    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ ok: false, error: "MISSING_SUPABASE_CONFIG" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });

    // TIMESTAMPTZ: ISO8601 se guarda como timestamptz sin problema
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
    return res.status(200).json({ ok: true, school_id, updated_count, analysis_requested_dt: ts });
  } catch (e) {
    console.error("request-analysis error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
