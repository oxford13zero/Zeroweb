// /api/generate-dashboard-token.js
//
// Generates a signed, time-limited token that authorizes access to the
// dashboard for a specific school + analysis. Replaces the direct Streamlit
// URL which was publicly accessible to anyone with the link.
//
// Called by: index.html and en/index.html before opening /dashboard/
// Token expires in: 2 hours
// Signed with: JWT_SECRET environment variable (already set in Vercel)

import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function signToken(payload) {
  const header  = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = base64url(JSON.stringify(payload));
  const signing = `${header}.${body}`;
  const sig     = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signing)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${signing}.${sig}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "JWT_SECRET_NOT_CONFIGURED" });
  }

  const { school_id, analysis_dt, role } = req.body || {};

  if (!school_id || !analysis_dt) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }

  // Validate role — only school users and admins can generate tokens
  const allowedRoles = ["school", "admin"];
  const tokenRole = allowedRoles.includes(role) ? role : "school";

  const now = Date.now();
  const payload = {
    school_id,
    analysis_dt,
    role:    tokenRole,
    iat:     Math.floor(now / 1000),
    exp:     Math.floor((now + TOKEN_TTL_MS) / 1000),
  };

  const token = signToken(payload);

  return res.status(200).json({ ok: true, token });
}
