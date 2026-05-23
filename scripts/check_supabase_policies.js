const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const env = {};
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n]*))?/i);
      if (m) {
        env[m[1]] = m[2] ?? m[3] ?? (m[4] ? m[4].trim() : '');
      }
    }
    return env;
  } catch (e) {
    return {};
  }
}

async function run() {
  const env = loadEnv('.env.local');
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL or KEY not set');
    process.exit(2);
  }

  const client = createClient(url.replace(/\/rest\/v1\/?$/, ''), key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    console.log('--- Attempting select from notes ---');
    const { data: notes, error: notesErr } = await client.from('notes').select('id,input,saved_at').limit(5).order('saved_at', { ascending: false });
    if (notesErr) {
      console.error('notes select error:', notesErr);
    } else {
      console.log('notes rows sample:', JSON.stringify(notes ?? [], null, 2));
    }

    console.log('\n--- Attempting to read pg_policies (may be restricted) ---');
    try {
      const { data: policies, error: polErr } = await client.from('pg_policies').select('*');
      if (polErr) {
        console.error('pg_policies read error:', polErr.message || polErr);
      } else {
        console.log('pg_policies:', JSON.stringify(policies, null, 2));
      }
    } catch (e) {
      console.error('pg_policies fetch exception:', e.message || e);
    }
  } catch (e) {
    console.error('unexpected', e.message || e);
  }
}

run();
