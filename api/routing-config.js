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

  const country    = school.country  || "MX";
  const schoolLang = school.language || "es";

  // When school is 'both', the frontend sends ?lang=es or ?lang=en
  // based on what the student picked in the language selector.
  const chosenLang = (schoolLang === "both" && req.query?.lang)
    ? req.query.lang
    : schoolLang;

  // Effective language for filtering routes — never 'both'
  const effectiveLang = (chosenLang === "both") ? "en" : chosenLang;

  const { data: configs, error: configError } = await supabaseAdmin
    .from("survey_routing_configs")
    .select("route_key, label, grade_codes, survey_file, display_order, language")
    .eq("country", country)
    .eq("language", effectiveLang)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (configError) {
    return res.status(500).json({ ok: false, error: configError.message });
  }

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
        text: gradeLabel(code, config.label, effectiveLang),
        route_key: config.route_key
      });
    }
  }

  const question_text = effectiveLang === "en"
    ? "What grade are you in?"
    : "¿En qué grado estás?";

  return res.status(200).json({
    ok: true,
    country,
    language: effectiveLang,
    question_text,
    options,
    routing_rules
  });
}

function gradeLabel(code, groupLabel, language) {
  const groupName = groupLabel.split("(")[0].trim();

  // Strip trailing letter(s) to get numeric part
  // "1S" → "1", "3B" → "3", "1M" → "1"
  // Pure letters like "K" stay as-is
  // Pure numbers like "1","2" stay as-is
  const numericPart = /^\d+[A-Za-z]+$/.test(code)
    ? code.replace(/[A-Za-z]+$/, '')
    : code;

  if (language === "en") {
    const gradeDisplay = code === 'K' ? 'Kindergarten' : `Grade ${numericPart}`;
    return `${groupName} — ${gradeDisplay}`;
  }
  return `${numericPart}° de ${groupName}`;
}
