// /api/edit-school.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdminAuth } from "./_lib/adminAuth.js";
import bcrypt from "bcryptjs";

export default async function handler(req, res) {
  try {
    if (req.method !== "PUT") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const adminAuth = await requireAdminAuth(req, res);
    if (!adminAuth?.ok) return;

    const {
      school_id,
      // School fields (editable)
      schoolName,
      address,
      phone,
      newPassword,
      // Enrollment
      studentsPrimaria,
      studentsSecundaria,
      studentsPreparatoria,
      // Encargado fields
      encFirstName,
      encPatLastName,
      encMatLastName,
      encEmail,
      encPhone,
      encCargo
    } = req.body || {};

    if (!school_id) {
      return res.status(400).json({ ok: false, error: "MISSING_SCHOOL_ID" });
    }
    if (!schoolName?.trim()) {
      return res.status(400).json({ ok: false, error: "MISSING_SCHOOL_NAME" });
    }
    if (!encFirstName?.trim() || !encPatLastName?.trim()) {
      return res.status(400).json({ ok: false, error: "MISSING_ENCARGADO_NAME" });
    }

    // Validate student counts
    const primaria     = Math.max(0, parseInt(studentsPrimaria)     || 0);
    const secundaria   = Math.max(0, parseInt(studentsSecundaria)   || 0);
    const preparatoria = Math.max(0, parseInt(studentsPreparatoria) || 0);

    // Verify school exists
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("schools")
      .select("id, name")
      .eq("id", school_id)
      .single();

    if (lookupError || !existing) {
      return res.status(404).json({ ok: false, error: "SCHOOL_NOT_FOUND" });
    }

    // Build school update payload — never touch username or country
    const schoolUpdate = {
      name: schoolName.trim(),
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      students_primaria: primaria,
      students_secundaria: secundaria,
      students_preparatoria: preparatoria
    };

    // Only update password if a new one was provided
    if (newPassword?.trim()) {
      if (newPassword.trim().length < 6) {
        return res.status(400).json({ ok: false, error: "PASSWORD_TOO_SHORT", detail: "Password must be at least 6 characters" });
      }
      const hash = await bcrypt.hash(newPassword.trim(), 10);
      schoolUpdate.password = hash;
    }

    // 1. Update school
    const { error: schoolError } = await supabaseAdmin
      .from("schools")
      .update(schoolUpdate)
      .eq("id", school_id);

    if (schoolError) {
      console.error("edit-school school update error:", schoolError);
      return res.status(500).json({ ok: false, error: "SCHOOL_UPDATE_FAILED", detail: schoolError.message });
    }

    // 2. Upsert encargado (UPDATE if exists, INSERT if not)
    const encargadoPayload = {
      school_id,
      first_name: encFirstName.trim(),
      pat_last_name: encPatLastName.trim(),
      mat_last_name: encMatLastName?.trim() || null,
      email: encEmail?.trim() || null,
      phone: encPhone?.trim() || null,
      cargo: encCargo?.trim() || null
    };

    // Check if encargado already exists for this school
    const { data: existingEnc } = await supabaseAdmin
      .from("encargado_escolar")
      .select("enc_escolar_id")
      .eq("school_id", school_id)
      .maybeSingle();

    if (existingEnc?.enc_escolar_id) {
      // UPDATE existing
      const { error: encError } = await supabaseAdmin
        .from("encargado_escolar")
        .update(encargadoPayload)
        .eq("school_id", school_id);

      if (encError) {
        console.error("edit-school encargado update error:", encError);
        return res.status(500).json({ ok: false, error: "ENCARGADO_UPDATE_FAILED", detail: encError.message });
      }
    } else {
      // INSERT new encargado
      const { error: encError } = await supabaseAdmin
        .from("encargado_escolar")
        .insert(encargadoPayload);

      if (encError) {
        console.error("edit-school encargado insert error:", encError);
        return res.status(500).json({ ok: false, error: "ENCARGADO_INSERT_FAILED", detail: encError.message });
      }
    }

    return res.status(200).json({
      ok: true,
      school: {
        id: school_id,
        name: schoolName.trim()
      }
    });

  } catch (e) {
    console.error("Unhandled error in edit-school:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR", detail: e?.message || String(e) });
  }
}
