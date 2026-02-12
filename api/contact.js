module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const { name, email, subject, message, hp } = req.body || {};

    // Honeypot anti-bots: si viene lleno, cortamos silenciosamente
    if (hp && String(hp).trim().length > 0) {
      res.status(200).json({ ok: true });
      return;
    }

    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim();
    const cleanSubject = String(subject || "").trim();
    const cleanMessage = String(message || "").trim();

    if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
      res.status(400).json({ ok: false, error: "Missing fields" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ ok: false, error: "Invalid email" });
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      res.status(500).json({ ok: false, error: "RESEND_API_KEY is not set" });
      return;
    }

    // Si no has verificado dominio aún, esto funciona:
    const from = process.env.CONTACT_FROM || "TECH4ZERO <onboarding@resend.dev>";

    const payload = {
      from,
      to: ["oxford13@gmail.com", "rodolfo.lino.ramos@gmail.com"],
      subject: `Contacto TECH4ZERO: ${cleanSubject}`,
      reply_to: cleanEmail,
      text:
`Nuevo mensaje desde TECH4ZERO

Nombre: ${cleanName}
Email: ${cleanEmail}
Asunto: ${cleanSubject}

Mensaje:
${cleanMessage}
`,
      html:
`<div style="font-family:Arial,sans-serif;line-height:1.45">
  <h2>Nuevo mensaje desde TECH4ZERO</h2>
  <p><b>Nombre:</b> ${escapeHtml(cleanName)}</p>
  <p><b>Email:</b> ${escapeHtml(cleanEmail)}</p>
  <p><b>Asunto:</b> ${escapeHtml(cleanSubject)}</p>
  <hr />
  <p style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</p>
</div>`
    };

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await r.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!r.ok) {
      // Devuelve detalle real de Resend para depurar
      res.status(500).json({
        ok: false,
        error: data?.message || data?.error || data?.raw || raw || "Resend error"
      });
      return;
    }

    res.status(200).json({ ok: true, id: data?.id || data?.data?.id || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
