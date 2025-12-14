import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(req, res) {
  if(req.method === 'POST') {
    try {
      const { school_id, student_id, responses } = req.body

      if(!school_id || !student_id || !responses) {
        return res.status(400).json({ error: 'Faltan datos obligatorios' })
      }

      // Construir el arreglo para insertar cada respuesta con question_id
      const dataToInsert = responses.map((response, index) => ({
        school_id,
        student_id,
        question_id: index + 1,
        response
      }))

      const { error } = await supabase
        .from('survey_responses')
        .insert(dataToInsert)

      if(error) {
        throw error
      }

      res.status(200).json({ message: 'Encuesta enviada con éxito!' })
    } catch(err) {
      res.status(500).json({ error: err.message })
    }
  } else {
    res.status(405).json({ error: 'Método no permitido' })
  }
}
