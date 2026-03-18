// /api/question-options.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const { questionId, lang } = req.query;
    if (!questionId) return res.status(400).json({ ok: false, error: "Missing questionId" });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );

    // Filter by language if provided
    if (lang === 'en' || lang === 'es') {
      const { data: filtered, error: filteredErr } = await supabase
        .from("question_options")
        .select("id, option_text, option_code, language, position")
        .eq("question_id", questionId)
        .eq("language", lang)
        .order("position", { ascending: true });

      if (!filteredErr && filtered && filtered.length > 0) {
        return res.status(200).json({ ok: true, options: filtered });
      }
    }

    // No lang filter or no results — return all ordered by position
    const { data, error } = await supabase
      .from("question_options")
      .select("id, option_text, option_code, language, position")
      .eq("question_id", questionId)
      .order("position", { ascending: true });

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, options: data || [] });

  } catch (e) {
    console.error("question-options error:", e);
    return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
  }
}
