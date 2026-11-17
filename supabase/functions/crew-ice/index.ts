// Authenticated, production-scoped ICE configuration. No TURN secret is sent to clients.
import {createClient} from 'npm:@supabase/supabase-js@2';
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'}});
const hex=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return json({ok:true});
 if(req.method!=='POST')return json({error:'POST required'},405);
 try{
  const {production_id}=await req.json();
  if(typeof production_id!=='string'||!hex.test(production_id))return json({error:'Invalid production'},400);
  const raw=req.headers.get('authorization')||'';
  const token=raw.startsWith('Bearer ')?raw.slice(7):'';
  if(!token||token.length>8192)return json({error:'Authentication required'},401);
  const key=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if(!key)return json({error:'Authentication service unavailable'},503);
  const url=Deno.env.get('SUPABASE_URL')!;
  const sb=createClient(url,key,{global:{headers:{Authorization:raw}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:who}=await sb.auth.getUser(token);
  if(who||!user)return json({error:'Invalid session'},401);
  const {data:allowed,error:access}=await sb.rpc('can_access_crew_production',{pid:production_id});
  if(access||allowed!==true)return json({error:'Production access denied'},403);
  const iceServers:Record<string,unknown>[]=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
  const secret=Deno.env.get('TURN_SHARED_SECRET')||'';
  const urls=(Deno.env.get('TURN_URLS')||'').split(',').map(x=>x.trim()).filter(x=>/^turns?:[^\s,?#]+(?:\?transport=(?:udp|tcp))?$/.test(x));
  let relayConfigured=false;
  if(secret.length>=24&&urls.length){
   const expiry=Math.floor(Date.now()/1000)+600;
   const username=`${expiry}:${user.id}`;
   const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
   const signature=await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(username));
   const credential=btoa(String.fromCharCode(...new Uint8Array(signature)));
   iceServers.push({urls:urls.slice(0,6),username,credential});relayConfigured=true;
  }
  return json({iceServers,relayConfigured,validForSeconds:600});
 }catch{return json({error:'ICE configuration unavailable'},503);}
});