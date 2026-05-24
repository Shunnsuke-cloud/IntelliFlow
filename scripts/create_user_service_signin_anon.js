#!/usr/bin/env node
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;
if(!url||!serviceKey||!anon){
  console.error('Require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY'); process.exit(2);
}
const fetch = global.fetch;
function uid(){return crypto.randomUUID();}
(async()=>{
  try{
    const email = `svc-rls-${Date.now()}@example.com`;
    const password = 'Test1234!';

    // create via admin
    let res = await fetch(`${url.replace(/\/$/,'')}/auth/v1/admin/users`,{
      method:'POST', headers:{'Content-Type':'application/json','apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`},
      body: JSON.stringify({email,password})
    });
    const created = await res.json();
    console.log('admin create status', res.status, created);

    // sign in with anon key
    const params = new URLSearchParams(); params.append('grant_type','password'); params.append('email',email); params.append('password',password);
    res = await fetch(`${url.replace(/\/$/,'')}/auth/v1/token`,{
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','apikey': anon}, body: params,
    });
    const token = await res.json();
    console.log('token status', res.status, token.error ? token : {access_token: token.access_token, user: token.user?.id});
    if(!token.access_token){ console.error('Failed to obtain access_token'); process.exit(2); }
    const access = token.access_token;
    const userId = token.user?.id ?? created?.id;

    // insert via REST as user
    const noteId = uid();
    const payload = { id: noteId, input: 'RLS production test note', saved_at: new Date().toISOString(), owner: userId };
    res = await fetch(`${url.replace(/\/$/,'')}/rest/v1/notes`,{
      method:'POST', headers:{'Content-Type':'application/json','apikey': anon, 'Authorization': `Bearer ${access}`, 'Prefer':'return=representation'},
      body: JSON.stringify(payload)
    });
    const insert = await res.json();
    console.log('insert status', res.status, insert);

    // select via REST
    res = await fetch(`${url.replace(/\/$/,'')}/rest/v1/notes?owner=eq.${encodeURIComponent(userId)}`,{
      method:'GET', headers:{'apikey': anon, 'Authorization': `Bearer ${access}`}
    });
    const rows = await res.json();
    console.log('select status', res.status, rows);

    process.exit(0);
  }catch(err){ console.error(err); process.exit(2); }
})();
