// /api/list-schools.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdminAuth } from "./_lib/adminAuth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const adminAuth = await requireAdminAuth(req, res);
    if (!adminAuth?.ok) return;

    // Fetch schools with their encargado in one query
    const { data: schools, error } = await supabaseAdmin
      .from("schools")
      .select(`
        id,
        name,
        username,
        country,
        address,
        phone,
        is_active,
        students_primaria,
        students_secundaria,
        students_preparatoria,
        encargado_escolar (
          enc_escolar_id,
          first_name,
          pat_last_name,
          mat_last_name,
          email,
          phone,
          cargo
        )
      `)
      .order("created_at", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      console.error("list-schools error:", error);
      return res.status(500).json({ ok: false, error: "DB_ERROR", detail: error.message });
    }

    // Fetch latest survey stats per school
    const { data: surveyStats } = await supabaseAdmin
      .from("survey_responses")
      .select("school_id, status, analysis_requested_dt, analysis_approved, submitted_at")
      .in("school_id", (schools || []).map(s => s.id))
      .eq("status", "submitted")
      .order("analysis_requested_dt", { ascending: false });

    // Group stats by school_id
    const statsMap = {};
    for (const r of surveyStats || []) {
      if (!statsMap[r.school_id]) {
        statsMap[r.school_id] = {
          submitted_count: 0,
          latest_survey_date: r.analysis_requested_dt,
          survey_status: r.analysis_approved ? 'closed' : r.analysis_requested_dt ? 'analysis_requested' : 'in_progress'
        };
      }
      statsMap[r.school_id].submitted_count++;
    }
    
    // Normalize encargado (it comes as array from 1-to-many relation)
    const result = (schools || []).map(s => ({
      id: s.id,
      name: s.name,
      username: s.username,
      country: s.country,
      address: s.address || null,
      phone: s.phone || null,
      students_primaria: s.students_primaria || 0,
      students_secundaria: s.students_secundaria || 0,
      students_preparatoria: s.students_preparatoria || 0,
      is_active: s.is_active !== false,
      encargado: s.encargado_escolar?.[0] || null,
      submitted_count: statsMap[s.id]?.submitted_count || null,
      latest_survey_date: statsMap[s.id]?.latest_survey_date || null,
      survey_status: statsMap[s.id]?.survey_status || null
    }));

    return res.status(200).json({ ok: true, schools: result });

  } catch (e) {
    console.error("Unhandled error in list-schools:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR", detail: e?.message || String(e) });
  }
}
