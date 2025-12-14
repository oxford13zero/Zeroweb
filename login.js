import { createClient } from '@supabase/supabase-js'

// Crear cliente de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  // Línea de diagnóstico
  console.log('login.js ejecutándose')

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' })
    }

    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Faltan username o password' })
    }

    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !data) {
      return res.status(401).json({ error: 'Usuario no encontrado' })
    }

    if (data.password !== password) {
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    return res.status(200).json({
      school_id: data.id,
      school_name: data.name
    })

  } catch (err) {
    console.error('Error login:', err.message)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
