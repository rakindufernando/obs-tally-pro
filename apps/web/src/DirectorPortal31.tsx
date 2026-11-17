import {useCallback,useEffect,useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {createClient} from '@supabase/supabase-js';
import {CrewPanel,HealthPanel,CrewClientProvider31} from './CrewTools';
import {CallCenter31} from './CallCenter31';
import type {Production} from './client';

const url=import.meta.env.VITE_SUPABASE_URL as string;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
/** Auth session is deliberately isolated from admin or paired-camera auth on the same browser. */
export const directorClient31=createClient(url||'https://unconfigured.invalid',key||'not-configured',{
 auth:{storageKey:'bumbi-director-v31-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
type Camera={id:string;number:number;name:string;cameraman:string;enabled:boolean;tally_states:{state:string}|null;camera_mappings:{kind:'SCENE'|'SOURCE';obs_name:string}[];
 camera_devices:{id:string;user_id:string;device_name:string;revoked_at:string|null;last_seen_at:string|null}[]};
type Tab='overview'|'multiview'|'cameras'|'messages'|'calls'|'health'|'settings';
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
const brand=`${import.meta.env.BASE_URL}bumbi-logo.png`;

export function DirectorPortal31(){
 const [userId,setUserId]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [role,setRole]=useState('');const [loading,setLoading]=useState(true);const [logging,setLogging]=useState(false);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [productions,setProductions]=useState<Production[]>([]);const [productionId,setProductionId]=useState('');
 const [cameras,setCameras]=useState<Camera[]>([]);const [tab,setTab]=useState<Tab>('overview');
 const [clock,setClock]=useState(Date.now());const [cameraEditing,setCameraEditing]=useState<Camera|null|undefined>(undefined);
 const [camName,setCamName]=useState('');const [camNumber,setCamNumber]=useState(1);const [camOperator,setCamOperator]=useState('');
 const [sourceKey,setSourceKey]=useState('');const [saving,setSaving]=useState(false);
 const [scene,setScene]=useState('');const [lastSceneCommand,setLastSceneCommand]=useState('');
 const [mediaUrl,setMediaUrl]=useState('');
 const [callRequest,setCallRequest]=useState<{id:string;name:string;key:number}|null>(null);
 const production=useMemo(()=>productions.find(p=>p.id===productionId),[productions,productionId]);
 const online=Boolean(production?.obs_connected&&production.last_bridge_at&&(clock-new Date(production.last_bridge_at).getTime())<30000);
 const authorized=role==='director';
 const verify=useCallback(async()=>{
  const {data:{user}}=await directorClient31.auth.getUser();
  if(!user){setUserId('');setRole('');setLoading(false);return;}
  const r=await directorClient31.from('profiles').select('role').eq('id',user.id).maybeSingle();
  const got=r.data?.role||'';if(got!=='director'){
   setRole('');setUserId('');setError('An assigned director account is required. Administrators use the original admin login');
   await directorClient31.auth.signOut();setLoading(false);return;
  }
  setRole(got);setUserId(user.id);setLoading(false);
 },[]);
 useEffect(()=>{let active=true;
  void verify().catch(e=>{if(active){setError(msg(e));setLoading(false);}});
  const {data:{subscription}}=directorClient31.auth.onAuthStateChange(()=>{
   // Defer requests outside the Supabase authentication callback lock.
   if(active)setTimeout(()=>{if(active)void verify().catch(e=>{setError(msg(e));setLoading(false);});},0);
  });
  return()=>{active=false;subscription.unsubscribe();};
 },[verify]);
 const refresh=useCallback(async()=>{
  if(!authorized||!userId)return;
  const rp=await directorClient31.from('productions').select('*').order('created_at',{ascending:false});
  if(rp.error){setError(rp.error.message);return;}
  const ps=(rp.data||[]) as Production[];setProductions(ps);
  const id=ps.some(p=>p.id===productionId)?productionId:ps[0]?.id||'';
  if(id!==productionId){setProductionId(id);return;}
  if(!id){setCameras([]);return;}
  const [cams,media]=await Promise.all([
   directorClient31.from('cameras').select('*,tally_states(*),camera_mappings(*),camera_devices(*)').eq('production_id',id).order('number'),
   directorClient31.from('production_media_settings').select('whep_url').eq('production_id',id).maybeSingle()
  ]);
  if(cams.error){setError(cams.error.message);return;}
  setCameras((cams.data||[]).map((c:any)=>({...c,tally_states:Array.isArray(c.tally_states)?c.tally_states[0]:c.tally_states,
   camera_mappings:c.camera_mappings||[],camera_devices:c.camera_devices||[]})) as Camera[]);
  if(!media.error)setMediaUrl(media.data?.whep_url||'');
  setClock(Date.now());
 },[userId,role,productionId,authorized]);
 useEffect(()=>{if(!userId)return;
  let active=true;let channel:ReturnType<typeof directorClient31.channel>|null=null;
  void directorClient31.auth.getSession().then(({data})=>{
   if(!active||!data.session)return;
   directorClient31.realtime.setAuth(data.session.access_token);
   if(!productionId)return;
   channel=directorClient31.channel(`production:${productionId}`,{config:{private:true}})
    .on('broadcast',{event:'tally'},()=>{void refresh();})
    .on('postgres_changes',{event:'*',schema:'public',table:'cameras'},()=>{void refresh();})
    .on('postgres_changes',{event:'*',schema:'public',table:'camera_mappings'},()=>{void refresh();})
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'obs_scene_commands'},()=>{void refresh();})
    .subscribe(status=>{if(active&&(status==='CHANNEL_ERROR'||status==='TIMED_OUT'))setError('Realtime sync interrupted. Automatic fallback refresh remains active.');});
  });
  void refresh();const timer=setInterval(()=>{setClock(Date.now());void refresh();},7000);
  const resume=()=>{if(document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);
   if(channel)void directorClient31.removeChannel(channel);};
 },[userId,productionId,refresh]);
 const signIn=async(e:FormEvent)=>{
  e.preventDefault();setLogging(true);setError('');
  try{const r=await directorClient31.auth.signInWithPassword({email:email.trim(),password});if(r.error)throw r.error;
   setPassword('');await verify();}catch(e){setError(msg(e));}finally{setLogging(false);}
 };
 const edit=(c:Camera|null)=>{
  setCameraEditing(c);setCamName(c?.name||`Camera ${String(cameras.length+1).padStart(2,'0')}`);
  setCamNumber(c?.number||Math.max(0,...cameras.map(x=>x.number))+1);setCamOperator(c?.cameraman||'');
  const first=c?.camera_mappings.find(m=>m.kind==='SOURCE'||m.kind==='SCENE');setSourceKey(first?`${first.kind}|${first.obs_name}`:'');
 };
 const saveCamera=async(e:FormEvent)=>{
  e.preventDefault();if(!production)return;
  const [kind,name]=sourceKey.split('|',2);
  setSaving(true);setError('');
  const result=await directorClient31.rpc('save_camera_assignment_31',{
   pid:production.id,cid:cameraEditing?.id||null,cam_number:camNumber,cam_name:camName,operator_name:camOperator,source_kind:kind,source_name:name
  });
  if(result.error)setError(result.error.message);
  else{setCameraEditing(undefined);setNotice('Camera saved and OBS source mapping validated');await refresh();}
  setSaving(false);
 };
 const switchScene=async()=>{
  if(!production||!scene)return;setError('');
  const r=await directorClient31.rpc('request_obs_scene_switch',{pid:production.id,requested_scene:scene});
  if(r.error)setError(r.error.message);
  else{
   const id=r.data as string;setLastSceneCommand(id);setNotice('Switch submitted to the authenticated OBS Bridge');
   const check=async()=>{const row=await directorClient31.from('obs_scene_commands').select('status,result_message').eq('id',id).maybeSingle();
    if(row.data?.status==='completed')setNotice(`OBS confirmed ${scene} is now Program`);
    if(row.data?.status==='failed')setError(`OBS scene switch failed. ${row.data.result_message}`);
    return row.data?.status;};
   for(let n=0;n<5;n++){await new Promise(resolve=>setTimeout(resolve,1200));const status=await check();if(status==='completed'||status==='failed')break;}
  }
 };
 const saveMedia=async(e:FormEvent)=>{
  e.preventDefault();if(!production)return;setError('');
  if(!mediaUrl.trim()){
   const r=await directorClient31.from('production_media_settings').delete().eq('production_id',production.id);
   if(r.error)setError(r.error.message);else setNotice('Program relay removed');return;
  }
  const expected=`/program-${production.id}/whep`;
  if(!mediaUrl.startsWith('https://')||!mediaUrl.endsWith(expected)){
   setError('Enter an HTTPS WHEP URL ending in '+expected);return;
  }
  const r=await directorClient31.from('production_media_settings').upsert({production_id:production.id,whep_url:mediaUrl.trim(),updated_by:userId,updated_at:new Date().toISOString()});
  if(r.error)setError(r.error.message);else setNotice('Relay endpoint saved. The media server must independently verify Supabase bearer tokens.');
 };
 if(loading)return <main className="director31-login"><p>Checking director authorization</p></main>;
 if(!userId||!authorized)return <main className="director31-login"><div className="director31-auth-card">
  <img src={brand} alt="Original BUMBI logo"/><span className="director31-eyebrow">BUMBI SOFTWARE SOLUTIONS</span>
  <h1>Director Control Panel</h1><p>Independent director sign-in. An administrator must assign your director profile to a production. Other account sessions remain separate.</p>
  <form onSubmit={e=>void signIn(e)}><label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button disabled={logging} type="submit">{logging?'Authenticating':'Sign in securely'}</button></form>
  {error&&<p role="alert" className="director31-alert">{error}</p>}
  <p className="director31-foot">Developed by BUMBI Software Solutions</p>
 </div></main>;
 const scenes=(production?.obs_sources||[]).filter(s=>s.kind==='SCENE').map(s=>s.name);
 const sources=(production?.obs_sources||[]).filter(s=>s.kind==='SOURCE'||s.kind==='SCENE');
 const effective=(c:Camera)=>online&&c.enabled?(c.tally_states?.state||'OFFLINE'):'OFFLINE';
 const onlineOperators=cameras.flatMap(c=>c.camera_devices.filter(d=>!d.revoked_at&&d.last_seen_at&&clock-new Date(d.last_seen_at).getTime()<90000)).length;
 return <div className="director31-shell">
  <header className="director31-header"><img src={brand} alt="BUMBI"/><div><span className="director31-eyebrow">BROADCAST OPERATIONS</span><h1>Director Control Panel <small>v3.1</small></h1>
   <p>Developed by BUMBI Software Solutions</p></div><div className="director31-session"><span className={online?'director31-green':'director31-red'}>{online?'OBS CONNECTED':'OBS OFFLINE'}</span>
    <button onClick={()=>void directorClient31.auth.signOut()}>Sign out</button></div></header>
  <nav className="director31-nav">{([['overview','Overview'],['multiview','Multiview'],['cameras','Cameras & Sources'],['messages','Messages'],['calls','Calls'],['health','Stream Health'],['settings','Settings']] as [Tab,string][]).map(([id,label])=>
   <button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
  <div className="director31-production"><label>Production <select value={productionId} onChange={e=>setProductionId(e.target.value)}>
   {productions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <span>{onlineOperators} operator devices recently online</span><button onClick={()=>void refresh()}>Sync now</button></div>
  {error&&<p className="director31-alert" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></p>}
  {notice&&<p className="director31-success" role="status">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></p>}
  {!production?<section className="director31-empty">No production assigned to this director. Ask an administrator to grant production access.</section>:<>
  {tab==='overview'&&<section><div className="director31-metrics">
   <div><small>Cameras</small><strong>{cameras.length}</strong></div><div><small>On air</small><strong>{cameras.filter(c=>effective(c)==='PROGRAM').length}</strong></div>
   <div><small>Standby</small><strong>{cameras.filter(c=>effective(c)==='PREVIEW').length}</strong></div><div><small>Connected operators</small><strong>{onlineOperators}</strong></div></div>
   <div className="director31-panel"><h2>Program control</h2><p>Current Program · <strong>{online?production.program_scene||'None':'Unknown until OBS reconnects'}</strong></p>
    <p>Preview · <strong>{online?production.preview_scene||'None':'Unknown'}</strong></p>
    <div className="director31-controls"><select value={scene} onChange={e=>setScene(e.target.value)}><option value="">Choose a detected OBS scene</option>{scenes.map(s=><option key={s}>{s}</option>)}</select>
    <button disabled={!online||!scene} onClick={()=>void switchScene()}>SWITCH PROGRAM</button></div>
    {lastSceneCommand&&<small>Command confirmation tracked from OBS Bridge</small>}</div>
   <div className="director31-cards">{cameras.map(c=><div key={c.id} className={`director31-camera ${effective(c).toLowerCase()}`}>
    <span>CAM {c.number}</span><strong>{c.name}</strong><b>{effective(c)==='PROGRAM'?'ON AIR':effective(c)==='PREVIEW'?'PREVIEW':effective(c)==='OFFLINE'?'DISCONNECTED':'IDLE'}</b>
    <p>{c.cameraman||'Unassigned'}</p>
    <button onClick={()=>edit(c)}>Assign source</button>
    {c.camera_devices.filter(d=>!d.revoked_at&&d.last_seen_at&&clock-new Date(d.last_seen_at).getTime()<90000).map(d=><button key={d.id} onClick={()=>{setCallRequest({id:d.user_id,name:c.name,key:Date.now()});setTab('calls');}}>CALL {d.device_name}</button>)}
   </div>)}</div></section>}
  {tab==='multiview'&&<CrewClientProvider31 client={directorClient31}><CrewPanel productionId={production.id} director scenes={scenes} initialTab="multiview" hideLegacyTalkback/></CrewClientProvider31>}
  {tab==='messages'&&<CrewClientProvider31 client={directorClient31}><CrewPanel productionId={production.id} director initialTab="messages" hideLegacyTalkback/></CrewClientProvider31>}
  {tab==='cameras'&&<section className="director31-panel"><div className="director31-inline"><h2>Camera and source assignments</h2><button onClick={()=>edit(null)}>Add camera</button></div>
   <p>Only actual source names reported by the local OBS Bridge can be assigned. Changes use a single authorized database transaction.</p>
   {cameras.map(c=><div className="director31-assignment" key={c.id}><span>CAM {c.number}</span><strong>{c.name}</strong>
    <span>{c.camera_mappings.map(m=>m.kind+' '+m.obs_name).join(' · ')||'Unmapped'}</span><button onClick={()=>edit(c)}>Configure</button></div>)}</section>}
  {tab==='health'&&<HealthPanel stats={production.obs_stats as Record<string,unknown>|undefined} connected={online}/>}
  {tab==='settings'&&<section className="director31-panel"><h2>Authenticated OBS Program video</h2>
   <p>Live program video requires a separately deployed HTTPS WHEP relay, such as MediaMTX. The relay must authenticate the Supabase bearer token and restrict access to this production. OBS WebSocket cannot provide continuous video.</p>
   <form onSubmit={e=>void saveMedia(e)}><label>Protected WHEP endpoint
    <input type="url" placeholder={`https://relay.example.com/program-${production.id}/whep`} value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)}/></label>
    <button type="submit">Save verified relay endpoint</button></form>
   <p>No public or unprotected OBS feed should be entered here.</p></section>}
  <div className={`director31-call-dock ${tab==='calls'?'director31-call-expanded':''}`}>
   <CallCenter31 client={directorClient31} productionId={production.id} director compact={tab!=='calls'} dialRequest={callRequest}/></div>
  </>}
  {cameraEditing!==undefined&&production&&<div className="director31-modal-bg" role="dialog" aria-modal="true"><form onSubmit={e=>void saveCamera(e)} className="director31-modal">
   <h2>{cameraEditing?'Edit camera assignment':'Add camera'}</h2><p>Preserves existing camera IDs and paired phone links.</p>
   <label>Camera number<input required type="number" min={1} max={999} value={camNumber} onChange={e=>setCamNumber(Number(e.target.value))}/></label>
   <label>Camera name<input required maxLength={80} value={camName} onChange={e=>setCamName(e.target.value)}/></label>
   <label>Cameraman name<input maxLength={80} value={camOperator} onChange={e=>setCamOperator(e.target.value)}/></label>
   <label>Detected OBS source<select required value={sourceKey} onChange={e=>setSourceKey(e.target.value)}><option value="">Choose detected source</option>
    {sources.map(s=><option key={`${s.kind}:${s.uuid||s.name}`} value={`${s.kind}|${s.name}`}>{s.kind} · {s.name}</option>)}</select></label>
   {!online&&<p className="director31-alert">OBS is currently offline. Source discovery may be outdated.</p>}
   <div><button disabled={saving||!sourceKey} type="submit">{saving?'Saving':'Save mapping'}</button><button type="button" onClick={()=>setCameraEditing(undefined)}>Cancel</button></div>
  </form></div>}
 </div>;
}