import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(req,res){
  if(req.method==='POST'){
    const { username, password } = req.body
    const { data, error } = await supabase.from('schools').select('*').eq('username',username).single()
    if(error || !data) return res.status(401).json({error:'Usuario no encontrado'})
    const match = await bcrypt.compare(password,data.password_hash)
    if(!match) return res.status(401).json({error:'Contraseña incorrecta'})
    res.status(200).json({school_id:data.id, school_name:data.name})
  } else res.status(405).json({error:'Método no permitido'})
}
