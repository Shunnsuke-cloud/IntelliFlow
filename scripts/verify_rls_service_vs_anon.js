#!/usr/bin/env node
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;
if(!url||!serviceKey||!anon){ console.error('Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY'); process.exit(2); }
const fetch = global.fetch;
function uid(){return crypto.randomUUID();}
(async()=>{
  try{
    const email = `verify-rls-${Date.now()}@example.com`;
    const password = 'Test1234!';
    // create user via admin
    let res = await fetch(`${url.replace(/\/$/,'')}/auth/v1/admin/users`,{
      method:'POST', headers:{'Content-Type':'application/json','apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`},
      body: JSON.stringify({email,password})
    });
    const created = await res.json();
    console.log('created user', created.id);
    const userId = created.id;

    // insert note via service role
    const noteId = uid();
    const payload = { id: noteId, input: 'RLS verify note', saved_at: new Date().toISOString(), owner: userId };
    res = await fetch(`${url.replace(/\/$/,'')}/rest/v1/notes`,{
      method:'POST', headers:{'Content-Type':'application/json','apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Prefer':'return=representation'},
      body: JSON.stringify(payload)
    });
    const insert = await res.json();
    console.log('inserted (service):', insert);

    // try select as anon
    res = await fetch(`${url.replace(/\/$/,'')}/rest/v1/notes?id=eq.${noteId}`,{
      method:'GET', headers:{'apikey': anon, 'Authorization': `Bearer ${anon}`}
    });
    const anonRows = await res.json();
    console.log('select as anon status', res.status, anonRows);

    // select as service_role
    res = await fetch(`${url.replace(/\/$/,'')}/rest/v1/notes?id=eq.${noteId}`,{
      method:'GET', headers:{'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`}
    });
    const svcRows = await res.json();
    console.log('select as service status', res.status, svcRows);

    process.exit(0);
  }catch(err){ console.error(err); process.exit(2); }
})();
