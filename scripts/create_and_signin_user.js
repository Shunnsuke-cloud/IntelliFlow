#!/usr/bin/env node
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!serviceKey){
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(2);
}
const email = `test+${Date.now()}@example.com`;
const password = 'Test1234!';
(async()=>{
  // create user via admin
  const createRes = await fetch(`${url.replace(/\/$/,'')}/auth/v1/admin/users`,{
    method:'POST',headers:{
      'Content-Type':'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    },body:JSON.stringify({email,password})
  });
  const created = await createRes.json();
  console.log('create status',createRes.status, created);
  // sign in
  const signinRes = await fetch(`${url.replace(/\/$/,'')}/auth/v1/token`,{
    method:'POST', headers:{'Content-Type':'application/json','apikey': serviceKey}, body:JSON.stringify({grant_type:'password',email,password})
  });
  const signin = await signinRes.json();
  console.log('signin status',signinRes.status, signin);
})();
