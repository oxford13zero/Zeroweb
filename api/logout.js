// /api/logout.js
import { serialize } from "cookie";

export default function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const cookie = serialize("t4z_session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    res.setHeader("Set-Cookie", cookie);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("logout error:", e);
    return res.status(200).json({ ok: false });
  }
}
