import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  const contentType = (req.headers["content-type"] || "").toLowerCase();

  // JSON
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }

  // x-www-form-urlencoded
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }

  // fallback
  return {};
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ ok: false, error: "Falta RESEND_API_KEY en Vercel" });
    }

    const body = await readBody(req);
    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const message = (body.message || "").trim();

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: "Faltan campos: name, email, message" });
    }

    // OJO: idealmente usa un dominio verificado en Resend (ej: no-reply@tech4zero.com)
    const from = process.env.CONTACT_FROM || "Tech4Zero <onboarding@resend.dev>";

    const to = (process.env.CONTACT_TO || "oxford13@gmail.com,rodolfo.lino.ramos@gmail.com")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const subject = `Contacto Tech4Zero: ${name}`;

    const { data, error } = await resend.emails.send({
      from,
      to,
      replyTo: email, // <-- camelCase (más compatible con el SDK)
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
