function parseCookies(cookieHeader = "") {
  const out = {};
  cookieHeader.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

export default async function handler(req, res) {
  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const admin_id = cookies["t4z_admin_session"];
    const username = cookies["t4z_admin_username"];
    const role = cookies["t4z_admin_role"];

    if (!admin_id) {
      return res.json({ ok: false, error: 'Not authenticated' });
    }

    return res.json({
      ok: true,
      admin: {
        id: admin_id,
        username: username,
        role: role
      }
    });

  } catch (err) {
    console.error('Admin session check error:', err);
    return res.json({ ok: false, error: 'Server error' });
  }
}