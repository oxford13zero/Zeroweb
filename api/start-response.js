import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

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

  const payload = JSON.parse(base64urlDecode(payloadB64Url));
  if (!payload.exp || Date.now() > payload.exp) return { ok: false };

  return { ok: true, payload };
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  // 1) Validar sesión (cookie)
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies["t4z_session"];
  const session = verifySignedSession(token, process.env.JWT_SECRET);

  if (!session.ok) return res.status(401).json({ ok: false, error: "NOT_AUTH" });

  // 2) Crear survey_response
  const { survey_id, student_external_id } = await readJsonBody(req);

  if (!survey_id) return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });

  const school_id = session.payload.school_id; // <-- este debe ser INT en tu BD (OJO: en la cookie debe venir como número)

  const { data, error } = await supabase
    .from("survey_responses")
    .insert([{
      survey_id,
      school_id,
      student_external_id: student_external_id || null,
      status: "in_progress"
    }])
    .select("id")
    .single();

  if (error) {
    console.error("start-response error:", error);
    return res.status(500).json({ ok: false, error: "DB_ERROR" });
  }

  return res.status(200).json({ ok: true, survey_response_id: data.id });
}
