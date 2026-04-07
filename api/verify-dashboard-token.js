// /api/verify-dashboard-token.js
//
// Verifies a dashboard token and returns the decoded payload.
// Called by /dashboard/index.html on page load to confirm the user
// is authorized before showing any data.
//
// Returns: { ok: true, school_id, analysis_dt, role } or { ok: false, error }

import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const signing = `${header}.${body}`;

  const expectedSig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(signing)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expectedSig.length) return null;
  const sigBuf      = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "JWT_SECRET_NOT_CONFIGURED" });
  }

  const { token } = req.body || {};

  if (!token) {
    return res.status(400).json({ ok: false, error: "MISSING_TOKEN" });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return res.status(401).json({ ok: false, error: "TOKEN_EXPIRED" });
  }

  return res.status(200).json({
    ok:          true,
    school_id:   payload.school_id,
    analysis_dt: payload.analysis_dt,
    role:        payload.role,
  });
}
