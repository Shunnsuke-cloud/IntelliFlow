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

  const samples = [
    {
      id: `sample-1-${Date.now()}`,
      input: '来週までに在庫確認とSNS投稿を進める。会議で告知方針を決める。',
      saved_at: new Date().toISOString(),
    },
    {
      id: `sample-2-${Date.now()}`,
      input: '今週中に見積もり整理と取引先へ返信する。採用方針を次回会議で決定。',
      saved_at: new Date().toISOString(),
    },
  ];

  try {
    const { data, error } = await client.from(table).insert(samples).select('id,input,saved_at');
    if (error) {
      console.error('insert error', error);
      process.exit(1);
    }

    console.log(JSON.stringify(data ?? [], null, 2));
  } catch (e) {
    console.error('unexpected error', e.message || e);
    process.exit(1);
  }
}

run();
