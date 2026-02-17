export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Clear admin cookies
  res.setHeader('Set-Cookie', [
    't4z_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    't4z_admin_username=; Path=/; SameSite=Strict; Max-Age=0',
    't4z_admin_role=; Path=/; SameSite=Strict; Max-Age=0'
  ]);

  return res.json({ ok: true });
}