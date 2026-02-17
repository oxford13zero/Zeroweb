import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  console.log('=== ADMIN LOGIN DEBUG START ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;
    console.log('1. Received username:', username);
    console.log('2. Password length:', password?.length);

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password required' });
    }

    // Initialize Supabase
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    console.log('3. Supabase URL exists:', !!SUPABASE_URL);
    console.log('4. Supabase KEY exists:', !!SUPABASE_KEY);

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });

    // Get admin user
    console.log('5. Querying database for username:', username);
    
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('id, username, password_hash, email, full_name, role, is_active')
      .eq('username', username)
      .maybeSingle();

    console.log('6. Query error:', error);
    console.log('7. User found:', !!adminUser);
    
    if (adminUser) {
      console.log('8. User details:', {
        username: adminUser.username,
        email: adminUser.email,
        is_active: adminUser.is_active,
        hash_length: adminUser.password_hash?.length,
        hash_start: adminUser.password_hash?.substring(0, 10)
      });
    }

    if (error || !adminUser) {
      console.log('Admin not found:', username);
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    // Check if active
    if (!adminUser.is_active) {
      console.log('9. Account is not active');
      return res.status(401).json({ ok: false, error: 'Account disabled' });
    }

    // Verify password
    console.log('10. Starting password verification...');
    console.log('11. Entered password:', password);
    console.log('12. Stored hash:', adminUser.password_hash);
    
    let isValid = false;
    
    try {
      isValid = await bcrypt.compare(password, adminUser.password_hash);
      console.log('13. Bcrypt compare result:', isValid);
    } catch (bcryptError) {
      console.error('14. Bcrypt error:', bcryptError);
      return res.status(500).json({ ok: false, error: 'Password verification failed' });
    }

    if (!isValid) {
      console.log('15. Password invalid - bcrypt compare returned false');
      
      // ADDITIONAL TEST: Try comparing with a freshly generated hash
      try {
        const testHash = await bcrypt.hash(password, 10);
        const testCompare = await bcrypt.compare(password, testHash);
        console.log('16. Test hash generation and compare:', testCompare);
      } catch (testError) {
        console.error('17. Test hash error:', testError);
      }
      
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    console.log('18. Password valid! Updating last login...');

    // Update last login
    await supabase
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', adminUser.id);

    // Set session cookie
    res.setHeader('Set-Cookie', [
      `t4z_admin_session=${adminUser.id}; Path=/; HttpOnly; SameSite=Strict`,
      `t4z_admin_username=${adminUser.username}; Path=/; SameSite=Strict`,
      `t4z_admin_role=${adminUser.role}; Path=/; SameSite=Strict`
    ]);

    console.log('19. Login successful!');
    console.log('=== ADMIN LOGIN DEBUG END ===');

    return res.json({
      ok: true,
      admin: {
        id: adminUser.id,
        username: adminUser.username,
        full_name: adminUser.full_name,
        role: adminUser.role
      }
    });

  } catch (err) {
    console.error('FATAL ERROR:', err);
    console.error('Stack:', err.stack);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
