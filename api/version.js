// /api/version.js
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    version: "start-response-v3-2025-12-14"
  });
}
