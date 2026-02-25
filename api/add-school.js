// /api/add-school.js
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdminAuth } from "./_lib/adminAuth.js";

const VALID_COUNTRIES = ["MX", "CL", "CR", "DO", "US"];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const adminAuth = await requireAdminAuth(req, res);
    if (!adminAuth?.ok) return;

    const {
      schoolName,
      username,
      password,
      country,
      studentsPrimaria,
      studentsSecundaria,
      studentsPreparatoria,
      encFirstName,
      encPatLastName,
      encMatLastName
    } = req.body || {};

    // Validate required fields
    if (!schoolName || !username || !password) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_REQUIRED_FIELDS",
        detail: "School name, username, and password are required"
      });
    }

    if (!encFirstName || !encPatLastName) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_ENCARGADO_INFO",
        detail: "Encargado first name and paternal last name are required"
      });
    }

    // Validate country
    const schoolCountry = (country || "MX").toUpperCase();
    if (!VALID_COUNTRIES.includes(schoolCountry)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_COUNTRY",
        detail: `Country must be one of: ${VALID_COUNTRIES.join(", ")}`
      });
    }

    // Validate student counts
    const primaria = parseInt(studentsPrimaria) || 0;
    const secundaria = parseInt(studentsSecundaria) || 0;
    const preparatoria = parseInt(studentsPreparatoria) || 0;

    if (primaria < 0 || secundaria < 0 || preparatoria < 0) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_STUDENT_COUNTS",
        detail: "Student counts must be non-negative numbers"
      });
    }

    // Check if username already exists
    const { data: existingSchool } = await supabaseAdmin
      .from("schools")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();

    if (existingSchool) {
      return res.status(409).json({
        ok: false,
        error: "USERNAME_EXISTS",
        detail: `Username '${username}' is already taken`
      });
    }

    // 1. Create school
    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .insert({
        name: schoolName,
        username: username,
        password: password,
        country: schoolCountry,
        students_primaria: primaria,
        students_secundaria: secundaria,
        students_preparatoria: preparatoria
      })
      .select("id, name, username, country")
      .single();

    if (schoolError || !school) {
      console.error("School creation failed:", schoolError);
      return res.status(500).json({
        ok: false,
        error: "SCHOOL_CREATION_FAILED",
        detail: schoolError?.message || "Failed to create school"
      });
    }

    // 2. Create encargado_escolar
    const { data: encargado, error: encargadoError } = await supabaseAdmin
      .from("encargado_escolar")
      .insert({
        school_id: school.id,
        first_name: encFirstName,
        pat_last_name: encPatLastName,
        mat_last_name: encMatLastName || null
      })
      .select("enc_escolar_id, first_name, pat_last_name")
      .single();

    if (encargadoError || !encargado) {
      console.error("Encargado creation failed:", encargadoError);

      // Rollback: delete the school we just created
      await supabaseAdmin
        .from("schools")
        .delete()
        .eq("id", school.id);

      return res.status(500).json({
        ok: false,
        error: "ENCARGADO_CREATION_FAILED",
        detail: encargadoError?.message || "Failed to create encargado"
      });
    }

    return res.status(201).json({
      ok: true,
      school: {
        id: school.id,
        name: school.name,
        username: school.username,
        country: school.country,
        students: {
          primaria,
          secundaria,
          preparatoria,
          total: primaria + secundaria + preparatoria
        }
      },
      encargado: {
        id: encargado.enc_escolar_id,
        name: `${encargado.first_name} ${encargado.pat_last_name}`
      }
    });

  } catch (e) {
    console.error("Unhandled error in add-school:", e);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR",
      detail: e?.message || String(e)
    });
  }
}
