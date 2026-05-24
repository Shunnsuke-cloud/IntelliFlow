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
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const table = env.SUPABASE_NOTES_TABLE || 'notes';

  if (!url || !key) {
    console.error('SUPABASE_URL or SERVICE_ROLE_KEY not set');
    process.exit(2);
  }

  const client = createClient(url.replace(/\/rest\/v1\/?$/, ''), key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data, error } = await client.from(table).select('id,input,saved_at').order('saved_at', { ascending: false });
    if (error) {
      console.error('query error', error);
      process.exit(1);
    }

    console.log(JSON.stringify(data ?? [], null, 2));
  } catch (e) {
    console.error('unexpected error', e.message || e);
    process.exit(1);
  }
}

run();
