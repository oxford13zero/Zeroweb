// /api/_lib/auth.js
import { parse } from "cookie";
import { supabaseAdmin } from "./supabaseAdmin.js";

// Lee cookie HttpOnly "t4z_session" (contiene school.id)
export async function requireAuth(req, res) {
  try {
    const cookieHeader = req.headers.cookie || "";
    const cookies = parse(cookieHeader);

    const schoolId = cookies.t4z_session;

    if (!schoolId) {
      res.status(401).json({ ok: false, error: "NOT_AUTH" });
      return { ok: false };
    }

    const { data: school, error } = await supabaseAdmin
      .from("schools")
      .select("id, name")
      .eq("id", schoolId)
      .single();

    if (error || !school) {
      res.status(401).json({ ok: false, error: "NOT_AUTH" });
      return { ok: false };
    }

    return { ok: true, school: { id: school.id, name: school.name } };
  } catch (e) {
    res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    return { ok: false };
  }
}
