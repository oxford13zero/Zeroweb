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

    // 2) Input
    const { surveyId } = req.body || {};
    const surveyKey = typeof surveyId === "string" ? surveyId.trim() : "";

    if (!surveyKey) {
      return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });
    }

    // 3) Resolver survey UUID
    const looksLikeUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        surveyKey
      );

    let surveyUuid = null;

    async function findSurveyIdByCode(code) {
      // en tu BD existe: surveys.code
      const { data, error } = await supabaseAdmin
        .from("surveys")
        .select("id")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();

      if (error) return { ok: false, error };
      if (!data?.id) return { ok: false, notFound: true };
      return { ok: true, id: data.id };
    }

    async function findSurveyIdByTitle(title) {
      // en tu BD existe: surveys.title
      // (búsqueda flexible, por si alguna vez envías el título)
      const { data, error } = await supabaseAdmin
        .from("surveys")
        .select("id")
        .ilike("title", title) // exacto si no hay %
        .eq("is_active", true);

      if (error) return { ok: false, error };
      if (!Array.isArray(data) || data.length === 0) return { ok: false, notFound: true };
      if (data.length > 1) return { ok: false, multiple: true, count: data.length, col: "title" };
      return { ok: true, id: data[0].id };
    }

    if (looksLikeUuid) {
      surveyUuid = surveyKey;
    } else {
      // 1) Primero, match EXACTO por code (recomendado)
      let found = await findSurveyIdByCode(surveyKey);

      // 2) Si no encuentra, intenta por title (opcional)
      if (!found.ok && found.notFound) {
        found = await findSurveyIdByTitle(surveyKey);
      }

      if (!found.ok) {
        if (found.multiple) {
          return res.status(400).json({
            ok: false,
            error: "SURVEY_NOT_UNIQUE",
            detail: `Multiple surveys match ${found.col}=${surveyKey} (count=${found.count})`
          });
        }
        if (found.error) {
          return res.status(500).json({
            ok: false,
            error: "SURVEY_LOOKUP_FAILED",
            detail: found.error.message || String(found.error)
          });
        }
        return res.status(400).json({
          ok: false,
          error: "SURVEY_NOT_FOUND",
          detail: `No survey found matching code/title = ${surveyKey}`
        });
      }

      surveyUuid = found.id;
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
