// MediaMTX HTTP external authentication. Configure MediaMTX authMethod=http and
// authHTTPAddress=https://<supabase-project>.supabase.co/functions/v1/media-auth
// Fail closed. Each WHEP read checks the viewer's current Supabase session AND pairing.
import {createClient} from 'npm:@supabase/supabase-js@2';
const out=(status:number)=>new Response(status===200?'OK':'Access denied',{status,headers:{'cache-control':'no-store'}});
const pathRx=/^program-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
Deno.serve(async req=>{
 if(req.method!=='POST')return out(405);
 try{
  const payload=await req.json();
  const action=payload?.action;const path=payload?.path;
  const match=typeof path==='string'?pathRx.exec(path):null;
  if(!match)return out(403);
  const token=typeof payload?.token==='string'&&payload.token.length<8192?payload.token:'';
  if(action==='publish'){
   // OBS publishing credential is stored on the OBS PC and in private Edge config.
   // Never allow the viewer's Supabase bearer to publish video.
   const secret=Deno.env.get('MEDIA_PUBLISH_TOKEN')||'';
   if(secret.length<32||!token)return out(403);
   const a=new TextEncoder().encode(secret),b=new TextEncoder().encode(token);
   if(a.length!==b.length)return out(403);
   let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
   return out(diff===0?200:403);
  }
  if(action!=='read'||!['webrtc','hls'].includes(payload?.protocol)||!token)return out(403);
  const key=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if(!key)return out(503);
  const sb=createClient(Deno.env.get('SUPABASE_URL')!,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await sb.auth.getUser(token);
  if(error||!user)return out(403);
  const {data:allowed,error:access}=await sb.rpc('can_access_crew_production',{pid:match[1]});
  return out(!access&&allowed===true?200:403);
 }catch{return out(403);}
});