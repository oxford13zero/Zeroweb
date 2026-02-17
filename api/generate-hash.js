import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  const password = 'Admin123!';
  
  try {
    const hash = await bcrypt.hash(password, 10);
    const testMatch = await bcrypt.compare(password, hash);
    
    return res.json({
      password: password,
      generatedHash: hash,
      selfTest: testMatch ? 'PASS ✅' : 'FAIL ❌',
      instructions: 'Copy the SQL below and run it in Supabase',
      sql: `UPDATE admin_users SET password_hash = '${hash}' WHERE username = 'admin';`
    });
  } catch (err) {
    return res.json({
      error: err.message,
      stack: err.stack
    });
  }
}