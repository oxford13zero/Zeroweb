// /api/start-response.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    // 1) Auth por cookie t4z_session
    const auth = await requireAuth(req, res);
    if (!auth?.ok) return;

    // 2) Input - get surveyId from request body
    const { surveyId } = req.body || {};
    const surveyKey = typeof surveyId === "string" ? surveyId.trim() : "";

    if (!surveyKey) {
      return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });
    }

    // 3) Determine if surveyKey is UUID or code
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(surveyKey);

    let surveyUuid = null;

    if (looksLikeUuid) {
      // Direct UUID
      surveyUuid = surveyKey;
    } else {
      // Look up by code
      const { data: surveyByCode, error: codeError } = await supabaseAdmin
        .from("surveys")
        .select("id")
        .eq("code", surveyKey)
        .eq("is_active", true)
        .maybeSingle();

      if (codeError) {
        return res.status(500).json({
          ok: false,
          error: "SURVEY_LOOKUP_FAILED",
          detail: codeError.message || String(codeError)
        });
      }

      if (!surveyByCode?.id) {
        return res.status(400).json({
          ok: false,
          error: "SURVEY_NOT_FOUND",
          detail: `No survey found with code = ${surveyKey}`
        });
      }

      surveyUuid = surveyByCode.id;
    }

    // 4) Crear response
    const { data, error } = await supabaseAdmin
      .from("survey_responses")
      .insert({
        school_id: auth.school.id,
        survey_id: surveyUuid,
        status: "in_progress"
      })
      .select("id")
      .single();

    if (error || !data) {
      return res.status(500).json({
        ok: false,
        error: "DB_INSERT_FAILED",
        detail: error?.message
      });
    }

    return res.status(200).json({
      ok: true,
      responseId: data.id,
      survey_id: surveyUuid
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: "UNHANDLED_SERVER_ERROR",
      detail: e?.message || String(e)
    });
  }
}
