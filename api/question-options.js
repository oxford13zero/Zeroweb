// api/question-options.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_KEY" });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const questionId = (req.query.questionId || "").trim();
    if (!questionId) {
      return res.status(400).json({ ok: false, error: "Missing questionId" });
    }

    const { data, error } = await supabase
      .from("question_options")
      .select("id, option_code, option_text, position, is_active")
      .eq("question_id", questionId)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("option_code", { ascending: true });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, questionId, options: data || [] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
