// /api/debug-surveys.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  const { data, error } = await supabaseAdmin
    .from("surveys")
    .select("*")
    .limit(10);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  // devuelve solo claves principales para no exponer todo
  const rows = (data || []).map(r => ({
    id: r.id,
    code: r.code,
    slug: r.slug,
    name: r.name,
    title: r.title
  }));

  return res.status(200).json({ ok: true, count: rows.length, rows });
}
