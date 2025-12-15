// /api/debug-cookies.js
import { parse } from "cookie";

export default async function handler(req, res) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = parse(cookieHeader);

  const v = cookies.t4z_session || null;

  res.status(200).json({
    ok: true,
    cookieHeaderPresent: !!cookieHeader,
    cookieNames: Object.keys(cookies),
    has_t4z_session: !!v,
    // mostramos solo un pedacito para confirmar que existe
    t4z_session_tail: v ? String(v).slice(-6) : null
  });
}
