// /api/add-school.js
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdminAuth } from "./_lib/adminAuth.js";

const VALID_COUNTRIES = ["MX", "CL", "CR", "DO", "US"];
const APP_URL = process.env.APP_URL || "https://tech4zero.com";
const resend = new Resend(process.env.RESEND_API_KEY);

function getLanguageFromCountry(country) {
  return country === "US" ? "en" : "es";
}

function calcMinSample(population) {
  if (!population || population === 0) return null;
  const Z = 1.96, p = 0.5, e = 0.05;
  const n_inf = (Z * Z * p * (1 - p)) / (e * e);
  return Math.ceil(n_inf / (1 + (n_inf - 1) / population));
}

function buildWelcomeEmail({ schoolName, username, password, encFirstName, language, primaria, secundaria, preparatoria, country }) {
  const totalStudents = primaria + secundaria + preparatoria;
  const minSample     = calcMinSample(totalStudents);
  const hasKids       = primaria > 0;
  const hasOlder      = secundaria > 0 || preparatoria > 0;

  if (language === "en") {
    const kidsLabel  = "Elementary / Primary";
    const olderLabel = "Secondary / High School";
    const pinSection = (hasOlder || hasKids) ? `
      <div style="border-top:1px solid #1e3040;padding-top:20px;margin-bottom:20px;">
        <p style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Survey exit PIN</p>
        <table style="width:100%;border-collapse:collapse;">
          ${hasOlder ? `<tr><td style="padding:6px 0;color:#a9c0d3;font-size:13px;">${olderLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#fff;text-align:right;">1234</td></tr>` : ''}
          ${hasKids  ? `<tr><td style="padding:6px 0;color:#a9c0d3;font-size:13px;">${kidsLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#fff;text-align:right;">5678</td></tr>` : ''}
        </table>
      </div>` : '';

    const sampleSection = minSample ? `
      <div style="border-top:1px solid #1e3040;padding-top:20px;margin-bottom:20px;">
        <p style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">How many students do you need to survey?</p>
        <p style="color:#a9c0d3;font-size:13px;line-height:1.6;margin:0;">For results to be statistically valid (95% confidence, ±5% margin of error), your school needs a minimum of <strong style="color:#fff;">${minSample} students</strong> surveyed out of <strong style="color:#fff;">${totalStudents} enrolled</strong>.</p>
      </div>` : '';

    return {
      subject: `Welcome to TECH4ZERO! Your school account is ready`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f172a;border-radius:12px;overflow:hidden;">
          <div style="background:#1e3a5f;padding:28px 24px;text-align:center;border-bottom:1px solid #1e3040;">
            <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:1px;">TECH4<span style="color:#D6A21C;">ZERO</span></span>
            <p style="color:#7a9aaa;font-size:12px;margin:6px 0 0;">School Bullying Prevention Platform</p>
          </div>
          <div style="padding:28px 24px;">
            <p style="font-size:17px;font-weight:500;color:#fff;margin:0 0 12px;">Welcome, ${encFirstName}!</p>
            <p style="color:#a9c0d3;font-size:13px;line-height:1.6;margin:0 0 16px;">Great news! Your school <strong style="color:#fff;">${schoolName}</strong> has been registered on <strong style="color:#D6A21C;">TECH4ZERO</strong>, a bullying prevention platform designed to help schools create safer and healthier learning environments.</p>
            <p style="color:#a9c0d3;font-size:13px;margin:0 0 16px;">Your account is ready — here are your login credentials:</p>
            <div style="border-left:3px solid #D6A21C;padding-left:16px;margin-bottom:20px;">
              <div style="margin-bottom:10px;"><span style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Username</span><br/><strong style="color:#fff;font-size:15px;">${username}</strong></div>
              <div><span style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Temporary password</span><br/><strong style="color:#fff;font-size:15px;">${password}</strong></div>
            </div>
            <a href="${APP_URL}" style="display:block;text-align:center;background:#D6A21C;color:#0f1d27;font-weight:700;font-size:14px;padding:13px 22px;border-radius:8px;text-decoration:none;margin-bottom:20px;">Log in now</a>
            <div style="background:rgba(214,162,28,0.06);border:1px solid rgba(214,162,28,0.2);border-radius:8px;padding:12px 14px;margin-bottom:24px;">
              <p style="color:#D6A21C;font-size:12px;margin:0;line-height:1.6;">The first time you log in, the system will ask you to create a new personal password.</p>
            </div>
            ${sampleSection}
            ${pinSection}
            <div style="border-top:1px solid #1e3040;padding-top:20px;">
              <p style="color:#a9c0d3;font-size:13px;line-height:1.6;margin:0;">Please find attached the <strong style="color:#fff;">User Manual</strong> with step-by-step instructions to get started.</p>
            </div>
            <p style="color:#4a6070;font-size:12px;margin:20px 0 0;text-align:center;">Together we make schools safer!</p>
          </div>
          <div style="padding:14px 24px;border-top:1px solid #1e3040;font-size:11px;color:#4a6070;text-align:center;">© 2025 TECH4ZERO – Educational Designs</div>
        </div>`
    };
  }

  // Spanish — default
  const kidsLabel  = country === "CL" ? "Básica" : "Primaria";
  const olderLabel = country === "CL" ? "Media" : "Secundaria / Preparatoria";

  const pinSection = (hasOlder || hasKids) ? `
    <div style="border-top:1px solid #1e3040;padding-top:20px;margin-bottom:20px;">
      <p style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Clave para salir de la encuesta</p>
      <table style="width:100%;border-collapse:collapse;">
        ${hasOlder ? `<tr><td style="padding:6px 0;color:#a9c0d3;font-size:13px;">${olderLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#fff;text-align:right;">1234</td></tr>` : ''}
        ${hasKids  ? `<tr><td style="padding:6px 0;color:#a9c0d3;font-size:13px;">${kidsLabel}</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#fff;text-align:right;">5678</td></tr>` : ''}
      </table>
    </div>` : '';

  const sampleSection = minSample ? `
    <div style="border-top:1px solid #1e3040;padding-top:20px;margin-bottom:20px;">
      <p style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">¿Cuántos estudiantes necesitas encuestar?</p>
      <p style="color:#a9c0d3;font-size:13px;line-height:1.6;margin:0;">Para que los resultados sean estadísticamente válidos (95% de confianza, ±5% de margen de error), tu escuela necesita un mínimo de <strong style="color:#fff;">${minSample} estudiantes</strong> encuestados de un total de <strong style="color:#fff;">${totalStudents} registrados</strong>.</p>
    </div>` : '';

  return {
    subject: `¡Bienvenido a TECH4ZERO! Tu cuenta escolar está lista`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f172a;border-radius:12px;overflow:hidden;">
        <div style="background:#1e3a5f;padding:28px 24px;text-align:center;border-bottom:1px solid #1e3040;">
          <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:1px;">TECH4<span style="color:#D6A21C;">ZERO</span></span>
          <p style="color:#7a9aaa;font-size:12px;margin:6px 0 0;">Plataforma de Prevención del Acoso Escolar</p>
        </div>
        <div style="padding:28px 24px;">
          <p style="font-size:17px;font-weight:500;color:#fff;margin:0 0 12px;">¡Hola ${encFirstName}!</p>
          <p style="color:#a9c0d3;font-size:13px;line-height:1.6;margin:0 0 16px;">¡Tenemos buenas noticias! Tu escuela <strong style="color:#fff;">${schoolName}</strong> ha sido registrada en <strong style="color:#D6A21C;">TECH4ZERO</strong>, una plataforma de prevención del acoso escolar diseñada para ayudar a las escuelas a crear entornos más seguros.</p>
          <p style="color:#a9c0d3;font-size:13px;margin:0 0 16px;">Tu cuenta ya está lista — aquí están tus credenciales:</p>
          <div style="border-left:3px solid #D6A21C;padding-left:16px;margin-bottom:20px;">
            <div style="margin-bottom:10px;"><span style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Usuario</span><br/><strong style="color:#fff;font-size:15px;">${username}</strong></div>
            <div><span style="color:#7a9aaa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Contraseña temporal</span><br/><strong style="color:#fff;font-size:15px;">${password}</strong></div>
          </div>
          <a href="${APP_URL}" style="display:block;text-align:center;background:#D6A21C;color:#0f1d27;font-weight:700;font-size:14px;padding:13px 22px;border-radius:8px;text-decoration:none;margin-bottom:20px;">Ingresar ahora</a>
          <div style="background:rgba(214,162,28,0.06);border:1px solid rgba(214,162,28,0.2);border-radius:8px;padding:12px 14px;margin-bottom:24px;">
            <p style="color:#D6A21C;font-size:12px;margin:0;line-height:1.6;">Al ingresar por primera vez se te pedirá crear una nueva contraseña personal.</p>
          </div>
          ${sampleSection}
          ${pinSection}
          <div style="border-top:1px solid #1e3040;padding-top:20px;">
            <p style="color:#a9c0d3;font-size:13px;line-height:1.6;margin:0 0 10px;">Encuentra el <strong style="color:#fff;">Manual de Usuario</strong> con instrucciones paso a paso para comenzar.</p>
            <a href="https://tech4zero.com/instrucciones.pdf" style="display:inline-block;color:#D6A21C;font-size:13px;font-weight:600;text-decoration:underline;">Descargar Manual de Usuario</a>
          </div>
          
          <p style="color:#4a6070;font-size:12px;margin:20px 0 0;text-align:center;">¡Juntos hacemos escuelas más seguras!</p>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #1e3040;font-size:11px;color:#4a6070;text-align:center;">© 2025 TECH4ZERO – Educational Designs</div>
      </div>`
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const adminAuth = await requireAdminAuth(req, res);
    if (!adminAuth?.ok) return;

    const {
      schoolName, username, password, country, address, phone,
      studentsPrimaria, studentsSecundaria, studentsPreparatoria,
      encFirstName, encPatLastName, encMatLastName,
      encEmail, encPhone, encCargo,
      sendWelcomeEmail
    } = req.body || {};

    if (!schoolName || !username || !password) {
      return res.status(400).json({ ok: false, error: "MISSING_REQUIRED_FIELDS" });
    }
    if (!encFirstName || !encPatLastName) {
      return res.status(400).json({ ok: false, error: "MISSING_ENCARGADO_INFO" });
    }

    const schoolCountry = (country || "MX").toUpperCase();
    if (!VALID_COUNTRIES.includes(schoolCountry)) {
      return res.status(400).json({ ok: false, error: "INVALID_COUNTRY" });
    }

    const primaria     = parseInt(studentsPrimaria)     || 0;
    const secundaria   = parseInt(studentsSecundaria)   || 0;
    const preparatoria = parseInt(studentsPreparatoria) || 0;

    if (primaria < 0 || secundaria < 0 || preparatoria < 0) {
      return res.status(400).json({ ok: false, error: "INVALID_STUDENT_COUNTS" });
    }

    const { data: existingSchool } = await supabaseAdmin
      .from("schools").select("id").eq("username", username).maybeSingle();

    if (existingSchool) {
      return res.status(409).json({ ok: false, error: "USERNAME_EXISTS" });
    }

    const schoolLanguage = getLanguageFromCountry(schoolCountry);
    const passwordHash   = await bcrypt.hash(password, 12);

    const { data: school, error: schoolError } = await supabaseAdmin
      .from("schools")
      .insert({
        name: schoolName, username, password_hash: passwordHash,
        must_change_password: true, country: schoolCountry,
        language: schoolLanguage, address: address || null,
        phone: phone || null, students_primaria: primaria,
        students_secundaria: secundaria, students_preparatoria: preparatoria
      })
      .select("id, name, username, country, language")
      .single();

    if (schoolError || !school) {
      return res.status(500).json({ ok: false, error: "SCHOOL_CREATION_FAILED", detail: schoolError?.message });
    }

    const { data: encargado, error: encargadoError } = await supabaseAdmin
      .from("encargado_escolar")
      .insert({
        school_id: school.id, first_name: encFirstName,
        pat_last_name: encPatLastName, mat_last_name: encMatLastName || null,
        email: encEmail || null, phone: encPhone || null, cargo: encCargo || null
      })
      .select("enc_escolar_id, first_name, pat_last_name")
      .single();

    if (encargadoError || !encargado) {
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      return res.status(500).json({ ok: false, error: "ENCARGADO_CREATION_FAILED", detail: encargadoError?.message });
    }

    // Send welcome email if checkbox was checked and encargado has email
    let emailSent = false;
    if (sendWelcomeEmail !== false && encEmail?.trim()) {
      try {
        // Get all active admin emails for CC
        const { data: admins } = await supabaseAdmin
          .from('admin_users')
          .select('email')
          .eq('is_active', true)
          .not('email', 'is', null);

        const adminEmails = (admins || []).map(a => a.email).filter(Boolean);

        const emailContent = buildWelcomeEmail({
          schoolName, username, password,
          encFirstName, language: schoolLanguage,
          primaria, secundaria, preparatoria,
          country: schoolCountry
        });

        await resend.emails.send({
          from:    "TECH4ZERO <no-reply@tech4zero.com>",
          to:      encEmail.trim(),
          cc:      adminEmails,
          subject: emailContent.subject,
          html:    emailContent.html,
        });

        emailSent = true;
      } catch (emailErr) {
        console.error("Welcome email failed:", emailErr);
      }
    }

    return res.status(201).json({
      ok: true,
      school: {
        id: school.id, name: school.name,
        username: school.username, country: school.country,
        language: school.language,
        students: { primaria, secundaria, preparatoria, total: primaria + secundaria + preparatoria }
      },
      encargado: {
        id: encargado.enc_escolar_id,
        name: `${encargado.first_name} ${encargado.pat_last_name}`
      },
      email_sent: emailSent
    });

  } catch (e) {
    console.error("Unhandled error in add-school:", e);
    return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR", detail: e?.message });
  }
}
