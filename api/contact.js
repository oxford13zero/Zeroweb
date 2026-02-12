import { Resend } from "resend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { name, email, subject, message, hp } = req.body || {};

    // Honeypot anti-bots: si viene lleno, cortamos silenciosamente
    if (hp && String(hp).trim().length > 0) {
      return res.status(200).json({ ok: true });
    }

    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim();
    const cleanSubject = String(subject || "").trim();
    const cleanMessage = String(message || "").trim();

    if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    // Validación simple de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ ok: false, error: "Invalid email" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "RESEND_API_KEY is not set" });
    }

    const resend = new Resend(apiKey);

    // IMPORTANTE:
    // - Si aún NO has verificado tu dominio en Resend, usa "onboarding@resend.dev"
    // - Cuando verifiques "tech4zero.org", cambia FROM a algo como "contacto@tech4zero.org"
    const FROM = process.env.CONTACT_FROM || "TECH4ZERO <onboarding@resend.dev>";

    const to = [
      "oxford13@gmail.com",
      "rodolfo.lino.ramos@gmail.com",
    ];

    const text =
`Nuevo mensaje desde TECH4ZERO

Nombre: ${cleanName}
Email: ${cleanEmail}
Asunto: ${cleanSubject}

Mensaje:
${cleanMessage}
`;

    const html =
`<div style="font-family:Arial,sans-serif;line-height:1.45">
  <h2>Nuevo mensaje desde TECH4ZERO</h2>
  <p><b>Nombre:</b> ${escapeHtml(cleanName)}</p>
  <p><b>Email:</b> ${escapeHtml(cleanEmail)}</p>
  <p><b>Asunto:</b> ${escapeHtml(cleanSubject)}</p>
  <hr />
  <p style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</p>
</div>`;

    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `Contacto TECH4ZERO: ${cleanSubject}`,
      reply_to: cleanEmail, // para que al responder vaya al usuario
      text,
      html,
    });

    return res.status(200).json({ ok: true, id: result?.data?.id || null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}