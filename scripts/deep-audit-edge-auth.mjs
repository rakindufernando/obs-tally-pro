// External read-only authentication fail-closed tests against live Supabase Edge Functions.
// Never uses a real camera, live stream, login, pairing token, admin key, or production mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const host=process.env.SUPABASE_EDGE_URL || 'https://lvzrhzlcyajhhgfqgdar.supabase.co/functions/v1';
const fakeId='00000000-0000-0000-0000-000000000000';
const audit=[];
const cases=[
 {name:'media-auth GET rejected',path:'media-auth',method:'GET',expected:405},
 {name:'media-auth missing credentials rejected',path:'media-auth',method:'POST',body:{action:'read',path:'program-'+fakeId,protocol:'webrtc',token:''},expected:403},
 {name:'media-auth invalid bearer rejected',path:'media-auth',method:'POST',body:{action:'read',path:'program-'+fakeId,protocol:'webrtc',token:'invalid-bearer'},expected:403},
 {name:'media-auth anonymous camera multiview rejected',path:'media-auth',method:'POST',body:{action:'read',path:'camera-'+fakeId,protocol:'webrtc',token:'invalid'},expected:403},
 {name:'media-auth unauthorized publishing rejected',path:'media-auth',method:'POST',body:{action:'publish',path:'camera-'+fakeId,protocol:'webrtc',token:'not-a-real-secret'},expected:403},
 {name:'media-auth invalid path rejected',path:'media-auth',method:'POST',body:{action:'read',path:'../../secrets',protocol:'webrtc',token:'invalid'},expected:403},
 {name:'crew-ice GET rejected',path:'crew-ice',method:'GET',expected:405},
 {name:'crew-ice rejects missing session',path:'crew-ice',method:'POST',body:{production_id:fakeId},expected:401},
 {name:'bridge GET rejected',path:'bridge',method:'GET',expected:405},
 {name:'bridge rejects missing registration token',path:'bridge',method:'POST',body:{action:'config'},expected:401}
];
for(const item of cases){
 let actual=null,error='';
 try{
  const res=await fetch(host+'/'+item.path,{method:item.method,
    headers:item.method==='POST'?{'content-type':'application/json'}:undefined,
    body:item.method==='POST'?JSON.stringify(item.body):undefined,
    signal:AbortSignal.timeout(15000)});
  actual=res.status;
  assert.equal(actual,item.expected,'Expected '+item.expected+', received '+actual);
  console.log('PASS '+item.name+' HTTP '+actual);
 }catch(e){error=e instanceof Error?e.message:String(e);console.error('FAIL '+item.name+' '+error);}
 audit.push({name:item.name,expected_status:item.expected,actual_status:actual,pass:!error,error});
}
const failures=audit.filter(a=>!a.pass);
fs.writeFileSync('deep-edge-results.json',JSON.stringify({tested_at:new Date().toISOString(),host,cases:audit,
  passing:audit.length-failures.length,failed:failures.length,
  limitation:'Only unauthenticated fail-closed behavior; authenticated role and actual video publishing require live sessions and relay'},null,2));
console.log('EDGE AUTH RESULT '+(audit.length-failures.length)+'/'+audit.length+' passed');
if(failures.length)process.exitCode=1;
