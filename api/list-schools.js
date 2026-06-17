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
        survey_open,
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
      .select("school_id, status, analysis_requested_dt, analysis_approved, started_at")
      .in("school_id", (schools || []).map(s => s.id));

    // Group by school + batch (analysis_requested_dt)
    const batchMap = {};
    for (const r of surveyStats || []) {
      const key = `${r.school_id}__${r.analysis_requested_dt || 'none'}`;
      if (!batchMap[key]) {
        batchMap[key] = {
          school_id: r.school_id,
          batch_dt: r.analysis_requested_dt || null,
          latest_started_at: r.started_at,
          latest_submitted_started_at: null,
          is_approved: false,
          submitted_count: 0,
          in_progress_count: 0
        };
      }
      const b = batchMap[key];
      if (r.started_at && r.started_at > b.latest_started_at) b.latest_started_at = r.started_at;
      if (r.analysis_approved) b.is_approved = true;
      if (r.status === 'submitted') {
        b.submitted_count++;
        if (!b.latest_submitted_started_at || r.started_at > b.latest_submitted_started_at) {
          b.latest_submitted_started_at = r.started_at;
        }
      }
      if (r.status === 'in_progress') b.in_progress_count++;
    }

    // Find max batch_dt per school (most recent analysis_requested_dt)
    const maxBatchDt = {};
    for (const batch of Object.values(batchMap)) {
      if (batch.batch_dt) {
        if (!maxBatchDt[batch.school_id] || batch.batch_dt > maxBatchDt[batch.school_id]) {
          maxBatchDt[batch.school_id] = batch.batch_dt;
        }
      }
    }

    // Filter relevant batches — null batch only qualifies if it has submitted responses after max_batch_dt
    const relevantBatches = Object.values(batchMap).filter(b => {
      if (b.batch_dt !== null) return true;
      if (!maxBatchDt[b.school_id]) return true;
      return b.latest_submitted_started_at && b.latest_submitted_started_at > maxBatchDt[b.school_id];
    });

    // Find latest relevant batch per school
    const statsMap = {};
    for (const batch of relevantBatches) {
      const sid = batch.school_id;
      const batchKey = batch.batch_dt || batch.latest_submitted_started_at;
      const existingKey = statsMap[sid] ? (statsMap[sid].batch_dt || statsMap[sid].latest_submitted_started_at) : null;
      if (!statsMap[sid] || (batchKey && (!existingKey || batchKey > existingKey))) {
        statsMap[sid] = batch;
      }
    }

    // Determine status
    for (const sid of Object.keys(statsMap)) {
      const b = statsMap[sid];
      if (b.is_approved && b.in_progress_count === 0) {
        b.survey_status = 'closed';
      } else if (b.batch_dt && b.in_progress_count === 0 && !b.is_approved) {
        b.survey_status = 'under_t4z_review';
      } else if (b.submitted_count > 0 || b.in_progress_count > 0) {
        b.survey_status = 'in_progress';
      } else {
        b.survey_status = null;
      }
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
      survey_open: s.survey_open !== false,
      encargado: s.encargado_escolar?.[0] || null,
      submitted_count: statsMap[s.id]?.submitted_count || null,
      in_progress_count: statsMap[s.id]?.in_progress_count || null,
      survey_status: statsMap[s.id]?.survey_status || null
    }));

    return res.status(200).json({ ok: true, schools: result });

  } catch (e) {
    console.error("Unhandled error in list-schools:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR", detail: e?.message || String(e) });
  }
}
