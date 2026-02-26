// /api/routing-config.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAuth } from "./_lib/auth.js";

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth?.ok) return;

  // auth.school_id comes from requireAuth (same session cookie pattern)
  const { data: school, error: schoolError } = await supabaseAdmin
    .from("schools")
    .select("country")
    .eq("id", auth.school.id)
    .maybeSingle();

  if (schoolError || !school) {
    return res.status(500).json({ ok: false, error: "SCHOOL_NOT_FOUND" });
  }

  const country = school.country || "MX";

  const { data: configs, error: configError } = await supabaseAdmin
    .from("survey_routing_configs")
    .select("route_key, label, grade_codes, survey_file, display_order")
    .eq("country", country)
    .order("display_order", { ascending: true });

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
        text: gradeLabel(code, config.label),
        route_key: config.route_key
      });
    }
  }

  return res.status(200).json({
    ok: true,
    country,
    question_text: "¿En qué grado estás?",
    options,
    routing_rules
  });
}

// Builds individual grade option text from the group label
// e.g. label="Primaria (1°–6°)", code="3" → "3° de Primaria"
function gradeLabel(code, groupLabel) {
  const groupName = groupLabel.split("(")[0].trim(); // e.g. "Primaria", "Básica"
  return `${code}° de ${groupName}`;
}
