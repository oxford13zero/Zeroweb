// /api/routing-config.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  const { data: school, error: schoolError } = await supabaseAdmin
    .from("schools")
    .select("country, language")
    .eq("id", auth.school.id)
    .maybeSingle();

  if (schoolError || !school) {
    return res.status(500).json({ ok: false, error: "SCHOOL_NOT_FOUND" });
  }

  const country  = school.country  || "MX";
  const language = school.language || "es";

  // Build the DB language filter:
  // - 'es' or 'en' → filter to that language only
  // - 'both'       → return all active routes for the country (student will choose language first)
  let query = supabaseAdmin
    .from("survey_routing_configs")
    .select("route_key, label, grade_codes, survey_file, display_order, language")
    .eq("country", country)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (language !== "both") {
    query = query.eq("language", language);
  }

  const { data: configs, error: configError } = await query;

  if (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

  // Build the options list and routing rules for the frontend
  const options = [];
  const routing_rules = {};

  for (const config of configs || []) {
    routing_rules[config.route_key] = {
      grade_codes: config.grade_codes,
      survey_file: config.survey_file
    };
    for (const code of config.grade_codes) {
      options.push({
        code,
        text: gradeLabel(code, config.label, language),
        route_key: config.route_key
      });
    }
  }

  // Question text in the correct language
  const question_text = language === "en" || language === "both"
    ? "What grade are you in?"
    : "¿En qué grado estás?";

  return res.status(200).json({
    ok: true,
    country,
    language,
    question_text,
    options,
    routing_rules
  });
}

// Builds individual grade option text from the group label
function gradeLabel(code, groupLabel, language) {
  const groupName = groupLabel.split("(")[0].trim();
  if (language === "en") {
    return `${groupName} — Grade ${code}`;
  }
  return `${code}° de ${groupName}`;
}
