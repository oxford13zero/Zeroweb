import crypto from "crypto";

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
  // base64url -> base64
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

function verifySignedSession(token, secret) {
  // token: payload.sig
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

  // compare safely
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return { ok: false };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false };

  const payloadJson = base64urlDecode(payloadB64Url);
  const payload = JSON.parse(payloadJson);

  if (!payload.exp || Date.now() > payload.exp) return { ok: false };

  return { ok: true, payload };
}

export default function handler(req, res) {
  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies["t4z_session"];
    if (!token) return res.status(200).json({ ok: false });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "MISSING_JWT_SECRET" });

    const result = verifySignedSession(token, secret);
    if (!result.ok) return res.status(200).json({ ok: false });

    const { school_id, school_name } = result.payload;
    return res.status(200).json({ ok: true, school_id, school_name });
  } catch (e) {
    console.error("me error:", e);
    return res.status(200).json({ ok: false });
  }
}
