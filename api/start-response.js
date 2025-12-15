// /api/start-response.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  // 1) Auth por cookie t4z_session
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  // 2) Input
  const { surveyId } = req.body || {};
  if (!surveyId) {
    return res.status(400).json({ ok: false, error: "MISSING_SURVEY_ID" });
  }

  // 3) Resolver survey UUID
  const looksLikeUuid =
    typeof surveyId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(surveyId);

  let surveyUuid = null;

  async function findSurveyIdBy(col) {
    let q = supabaseAdmin.from("surveys").select("id");

    // case-insensitive para columnas típicas
    if (col === "code" || col === "slug" || col === "name" || col === "title") {
      q = q.ilike(col, surveyId);
    } else {
      q = q.eq(col, surveyId);
    }

    const { data, error } = await q;

    if (error) return { ok: false, error };
    if (!Array.isArray(data) || data.length === 0) return { ok: false, notFound: true };
    if (data.length > 1) return { ok: false, multiple: true, count: data.length, col };
    return { ok: true, id: data[0].id };
  }

  if (looksLikeUuid) {
    surveyUuid = surveyId;
  } else {
    // intentos en orden
    let found = await findSurveyIdBy("code");
    if (!found.ok && found.notFound) found = await findSurveyIdBy("slug");
    if (!found.ok && found.notFound) found = await findSurveyIdBy("name");
    if (!found.ok && found.notFound) found = await findSurveyIdBy("title");

    if (!found.ok) {
      if (found.multiple) {
        return res.status(400).json({
          ok: false,
          error: "SURVEY_NOT_UNIQUE",
          detail: `Multiple surveys match ${found.col}=${surveyId} (count=${found.count})`
        });
      }
      return res.status(400).json({
        ok: false,
        error: "SURVEY_NOT_FOUND",
        detail: `No survey found matching code/slug/name/title = ${surveyId}`
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
}
