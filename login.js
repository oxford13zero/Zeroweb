import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { username, password } = req.body

  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('username', username)
    .single()

  if (error || !data) {
    return res.status(401).json({ error: 'Usuario no encontrado' })
  }

  // 🔹 comparación directa (texto plano)
  if (data.password !== password) {
    return res.status(401).json({ error: 'Contraseña incorrecta' })
  }

  return res.status(200).json({
    school_id: data.id,
    school_name: data.name
  })
}
