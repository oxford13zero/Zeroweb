import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS básico (por si lo llamas desde HTML estático)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "Faltan campos: name, email, message" });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ ok: false, error: "Falta RESEND_API_KEY en Vercel" });
    }

    // IMPORTANTE: from debe ser un dominio verificado en Resend
    const from = process.env.CONTACT_FROM || "Tech4Zero <onboarding@resend.dev>";

    const to = (process.env.CONTACT_TO || "oxford13@gmail.com,rodolfo.lino.ramos@gmail.com")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const subject = `Contacto Tech4Zero: ${name}`;

    const { data, error } = await resend.emails.send({
      from,
      to,
      reply_to: email,
      subject,
      text: `Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${message}`,
    });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message || "Resend error" });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
