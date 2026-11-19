import {useCallback,useEffect,useRef,useState,useContext,createContext} from 'react';
import type {ReactNode} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from './client';
const CrewClientContext31=createContext<SupabaseClient>(supabase);
export function CrewClientProvider31({client,children}:{client:SupabaseClient;children:ReactNode}){return <CrewClientContext31.Provider value={client}>{children}</CrewClientContext31.Provider>;}

type Camera={id:string;number:number;name:string;enabled:boolean;state:string;preview_at:string|null};
type View={production_id:string;production_name:string;bridge_online:boolean;last_bridge_at:string|null;cameras:Camera[]};
type Message={id:string;sender_id:string;sender_kind:string;audience:string;target_camera_ids:string[];body:string;quick_command:boolean;created_at:string};
const fmt=(v:string)=>new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const cls=(s:string)=>s==='PROGRAM'?'live':s==='PREVIEW'?'standby':s==='IDLE'?'idle':'offline';

function useCrewView(productionId:string,enabled=true){
 const supabase=useContext(CrewClientContext31);
 const [data,setData]=useState<View|null>(null);
 const [error,setError]=useState('');
 const reload=useCallback(async()=>{
  if(!productionId||!enabled)return;
  const r=await supabase.rpc('crew_multiview_snapshot',{pid:productionId});
  if(r.error){setError(r.error.message);return;}
  setData(r.data as View);setError('');
 },[productionId,enabled,supabase]);
 useEffect(()=>{
  if(!enabled)return;
  void reload();
  const timer=setInterval(()=>void reload(),4500);
  let channel:ReturnType<typeof supabase.channel>|undefined;
  void supabase.auth.getSession().then(({data})=>{
   if(!data.session)return;
   supabase.realtime.setAuth(data.session.access_token);
   channel=supabase.channel(`ops:${productionId}`,{config:{private:true}})
    .on('broadcast',{event:'message'},()=>void reload())
    .subscribe();
  });
  return()=>{clearInterval(timer);if(channel)void supabase.removeChannel(channel);};
 },[productionId,reload,enabled,supabase]);
 return {data,error,reload};
}

function CrewMultiview({productionId,ownCameraId,scenes}:{productionId:string;ownCameraId?:string;scenes?:string[]}){
 const supabase=useContext(CrewClientContext31);
 const {data,error,reload}=useCrewView(productionId);
 const [layout,setLayout]=useState('4');
 const [chosen,setChosen]=useState<string[]>([]);
 const [fullscreen,setFullscreen]=useState(false);
 const [selectedScene,setSelectedScene]=useState('');
 const [notice,setNotice]=useState('');
 const ref=useRef<HTMLDivElement>(null);
 const cameras=data?.cameras||[];
 const max=Math.min(16,layout==='custom'?16:Number(layout));
 const display=cameras.filter(c=>chosen.length===0||chosen.includes(c.id)).slice(0,max);
 const [switching,setSwitching]=useState(false);
 const switchScene=async()=>{
  if(!selectedScene||!scenes?.includes(selectedScene)||switching)return;
  const requested=selectedScene;
  setSwitching(true);setNotice('');
  try{
   const r=await supabase.rpc('request_obs_scene_switch',{pid:productionId,requested_scene:requested});
   if(r.error)throw r.error;
   const commandId=r.data as string;
   let finished=false;
   for(let attempt=0;attempt<15;attempt++){
    await new Promise(resolve=>setTimeout(resolve,1200));
    const status=await supabase.from('obs_scene_commands').select('status,result_message').eq('id',commandId).maybeSingle();
    if(status.error)throw status.error;
    if(status.data?.status==='completed'){setNotice(`OBS confirmed Program scene ${requested}`);finished=true;break;}
    if(status.data?.status==='failed'){setNotice(`Scene switch failed. ${status.data.result_message}`);finished=true;break;}
   }
   if(!finished)setNotice('OBS Bridge has not confirmed this command. Check connection and activity before retrying.');
  }catch(e){setNotice(`Scene request failed. ${e instanceof Error?e.message:String(e)}`);}
  finally{setSwitching(false);}
 };
 const enterFullscreen=async()=>{
  try{if(!document.fullscreenElement)await ref.current?.requestFullscreen();else await document.exitFullscreen();}
  catch{setNotice('Fullscreen is not supported in this browser.');}
 };
 useEffect(()=>{const fn=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',fn);return()=>document.removeEventListener('fullscreenchange',fn);},[]);
 return <div className="crew-panel" ref={ref}>
  <div className="crew-top"><div><h2>Director camera status grid</h2><p>Live OBS tally states from the secure Bridge. No video feeds or relay services are required.</p></div>
   <div className="crew-actions"><label>Layout <select value={layout} onChange={e=>setLayout(e.target.value)}><option value="2">2 cameras</option><option value="4">4 cameras</option><option value="9">9 cameras</option><option value="custom">Custom 16</option></select></label>
   <button onClick={()=>void reload()}>Refresh</button><button onClick={()=>void enterFullscreen()}>{fullscreen?'Exit fullscreen':'Fullscreen'}</button></div></div>
  {error&&<p className="crew-error" role="alert">{error}</p>}
  <p className={`crew-service ${data?.bridge_online?'good':'bad'}`}>{data?.bridge_online?'OBS synchronized':'OBS unavailable or stale'}</p>
  {cameras.length>max&&<details className="crew-camera-filter"><summary>Choose cameras to display</summary><div>{cameras.map(c=><label key={c.id}><input type="checkbox" checked={!chosen.length||chosen.includes(c.id)} onChange={e=>{
    setChosen(old=>{const current=old.length?old:cameras.map(c=>c.id);const next=e.target.checked?[...new Set([...current,c.id])]:current.filter(x=>x!==c.id);return next;});
  }}/>{c.name}</label>)}<button onClick={()=>setChosen([])}>Show all</button></div></details>}
  <div className="crew-cam-grid" style={{gridTemplateColumns:`repeat(${layout==='2'?2:layout==='9'?3:layout==='custom'?4:2}, minmax(0,1fr))`}}>
   {display.map(cam=><div key={cam.id} className={`crew-tile crew-${cls(cam.state)} ${cam.id===ownCameraId?'crew-own':''}`}>
     <div className="crew-tile-meta"><strong>CAM {String(cam.number).padStart(2,'0')} · {cam.name}</strong><span className={`crew-status ${cls(cam.state)}`}>{cam.state==='PROGRAM'?'LIVE':cam.state==='PREVIEW'?'PREVIEW':cam.state==='OFFLINE'?'DISCONNECTED':'IDLE'}</span></div>
     <div className={`crew-state-preview crew-state-${cls(cam.state)}`} aria-label={`Camera ${cam.number} ${cam.state}`}>
       <span className="crew-state-orb" aria-hidden="true"/><strong>{cam.state==='PROGRAM'?'ON AIR':cam.state==='PREVIEW'?'STANDBY':cam.state==='OFFLINE'?'NO SIGNAL':'IDLE'}</strong>
      </div>
     {cam.id===ownCameraId&&<strong className="crew-identity">YOUR CAMERA</strong>}
   </div>)}
  </div>
  {!display.length&&<p className="crew-empty">No cameras are configured in this production.</p>}
  {scenes&&scenes.length>0&&<div className="crew-switch"><h3>Director scene control</h3><p>Scene switching is sent through the registered OBS Bridge. It does not expose OBS WebSocket credentials.</p>
   <select value={selectedScene} onChange={e=>setSelectedScene(e.target.value)}><option value="">Choose an OBS scene</option>{scenes.map(s=><option key={s} value={s}>{s}</option>)}</select>
   <button disabled={!selectedScene||switching||!data?.bridge_online} onClick={()=>void switchScene()}>Switch Program scene</button></div>}
  {notice&&<p className="crew-notice" role="status">{notice}</p>}
 </div>;
}

function CrewChat({productionId,director,ownCameraId,cameras}:{productionId:string;director:boolean;ownCameraId?:string;cameras:Camera[]}){
 const supabase=useContext(CrewClientContext31);
 const [msgs,setMsgs]=useState<Message[]>([]);
 const [message,setMessage]=useState('');
 const [targets,setTargets]=useState<string[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [readCount,setReadCount]=useState<Record<string,number>>({});
 const [me,setMe]=useState('');
 const [notice,setNotice]=useState('');
 const [refreshing,setRefreshing]=useState(false);
 const refresh=useCallback(async()=>{
  const r=await supabase.from('operator_messages').select('*').eq('production_id',productionId).order('created_at',{ascending:false}).limit(100);
  if(r.error){setError(r.error.message);return;}
  const m=(r.data||[] as Message[]).slice().reverse() as Message[];
  setMsgs(m);
  const {data:{user}}=await supabase.auth.getUser();
  if(user)setMe(user.id);
  if(director&&m.length){
   const ids=m.filter(x=>x.sender_id===user?.id).map(x=>x.id);
   if(ids.length){
    const z=await supabase.from('operator_message_reads').select('message_id').in('message_id',ids);
    if(!z.error){const counts:Record<string,number>={};for(const row of z.data||[])counts[row.message_id]=(counts[row.message_id]||0)+1;setReadCount(counts);}
   }
  }
  setError('');
 },[productionId,director,supabase]);
 useEffect(()=>{
  let active=true;let channel:ReturnType<typeof supabase.channel>|null=null;
  void refresh();
  void supabase.auth.getSession().then(({data})=>{
   if(!active||!data.session)return;
   supabase.realtime.setAuth(data.session.access_token);
   channel=supabase.channel(`ops:${productionId}`,{config:{private:true}})
     .on('broadcast',{event:'message'},()=>void refresh())
     .on('postgres_changes',{event:'*',schema:'public',table:'operator_messages',filter:`production_id=eq.${productionId}`},()=>void refresh())
     .subscribe();
  });
  const id=setInterval(()=>void refresh(),3000);
  const online=()=>void refresh();
  const visibility=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('online',online);document.addEventListener('visibilitychange',visibility);
  return()=>{active=false;clearInterval(id);window.removeEventListener('online',online);
   document.removeEventListener('visibilitychange',visibility);if(channel)void supabase.removeChannel(channel);};
 },[refresh,productionId,supabase]);
 const send=async(content=message,quick=false)=>{
  const txt=content.trim();if(!txt)return;
  setBusy(true);setError('');
  const r=await supabase.rpc('send_operator_message',{pid:productionId,recipient:director?'crew':'directors',targets:director?targets:[],message_text:txt,quick});
  if(r.error)setError(r.error.message);
  else{setMessage('');setNotice('Message saved to the realtime queue. Await cameraman acknowledgement.');await refresh();}
  setBusy(false);
 };
 const deleteOne=async(id:string)=>{
  if(!window.confirm('Delete this message for everyone immediately?'))return;
  setBusy(true);setError('');
  const r=await supabase.rpc('delete_operator_message',{mid:id});
  if(r.error)setError(r.error.message);
  else{setNotice('Message deleted for all devices.');await refresh();}
  setBusy(false);
 };
 const clearAll=async()=>{
  if(!director||!window.confirm('Delete every message and acknowledgement in this production? This cannot be undone.'))return;
  setBusy(true);setError('');
  const r=await supabase.rpc('clear_operator_messages',{pid:productionId});
  if(r.error)setError(r.error.message);
  else{setNotice('All production messages deleted.');setReadCount({});await refresh();}
  setBusy(false);
 };
 const refreshNow=async()=>{
  setRefreshing(true);await refresh();setRefreshing(false);
 };
 return <div className="crew-panel"><div className="crew-top"><div><h2>Live operator messages</h2><p>Individual, group, and broadcast instructions. Messages are cleared when OBS disconnects, or can be deleted manually.</p></div>
  <div className="crew-message-actions"><button onClick={()=>void refreshNow()} disabled={refreshing}>{refreshing?'Refreshing':'Refresh'}</button>
   {director&&<button className="crew-delete-all" disabled={busy||!msgs.length} onClick={()=>void clearAll()}>Clear all messages</button>}</div></div>
  {director&&<div className="crew-target"><strong>Message recipients</strong><p>{targets.length?targets.length===1?'Individual camera message':`Group message to ${targets.length} cameras`:'Broadcast to all paired cameramen'}</p>
   <div className="crew-recipient-grid">{cameras.map(c=><label key={c.id}>
    <input type="checkbox" checked={targets.includes(c.id)}
     onChange={e=>setTargets(current=>e.target.checked?[...current,c.id]:current.filter(id=>id!==c.id))}/>
    CAM {String(c.number).padStart(2,'0')} · {c.name}</label>)}</div>
   <button type="button" onClick={()=>setTargets([])}>Broadcast to all</button><small>Choose one camera for individual messages, several for a group, or none for broadcast.</small>
 </div>}
  <div className="crew-quick">{(director?['STAND BY','GET READY','CHECK FRAMING','ZOOM IN','ZOOM OUT','PREPARE FOR LIVE']:['READY','ACKNOWLEDGED','TECHNICAL ISSUE','PLEASE REPEAT']).map(cmd=><button key={cmd} disabled={busy} onClick={()=>void send(cmd,true)}>{cmd}</button>)}</div>
  <div className="crew-message-list" role="log" aria-live="polite">{msgs.map(m=><div key={m.id} className={`crew-message ${m.sender_id===me?'mine':''}`}><div><strong>{m.sender_id===me?'You':m.sender_kind==='director'?'Director':'Cameraman'}</strong><span>{fmt(m.created_at)}{director&&m.sender_id===me?` · ${readCount[m.id]||0} acknowledged`:''}</span></div>
   <p>{m.body}</p>{(director||m.sender_id===me)&&<button type="button" className="crew-delete-one" disabled={busy} onClick={()=>void deleteOne(m.id)}>Delete</button>}</div>)}</div>
  {!msgs.length&&<p className="crew-empty">No messages received yet.</p>}
  <form className="crew-compose" onSubmit={e=>{e.preventDefault();void send();}}><input value={message} onChange={e=>setMessage(e.target.value)} maxLength={500} required placeholder={director?'Send a secure camera instruction':'Reply to directors'}/><button type="submit" disabled={busy||!message.trim()}>Send</button></form>
  {notice&&<p className="crew-notice" role="status">{notice}</p>}
  {error&&<p className="crew-error" role="alert">{error}</p>}
 </div>;
}

export function CrewPanel({productionId,director,ownCameraId,scenes,initialTab,hideMultiview=false,cameraChoices}:{productionId:string;director:boolean;ownCameraId?:string;scenes?:string[];initialTab?:'multiview'|'messages';hideMultiview?:boolean;cameraChoices?:{id:string;number:number;name:string}[]}){
 const [tab,setTab]=useState<'multiview'|'messages'>(initialTab|| (director&&!hideMultiview?'multiview':'messages'));
 const {data}=useCrewView(productionId,director&&!hideMultiview);
 const cams=data?.cameras||cameraChoices?.map(c=>({...c,enabled:true,state:'IDLE',preview_at:null}))||[];
 return <section className="crew-shell">
   <div className="crew-tabs">{([...(director&&!hideMultiview?[['multiview','Multiview'] as const]:[]),['messages','Operator messages'] as const] as const).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
   {tab==='multiview'&&director&&!hideMultiview&&<CrewMultiview productionId={productionId} scenes={scenes}/>}
   {tab==='messages'&&<CrewChat productionId={productionId} director={director} ownCameraId={ownCameraId} cameras={cams}/>}
 </section>;
}

export function HealthPanel({stats,connected}:{stats:Record<string,unknown>|undefined;connected:boolean}){
 const [history,setHistory]=useState<{cpu:number;fps:number;drop:number}[]>([]);
 const [cpuLimit,setCpuLimit]=useState(Number(localStorage.getItem('tally-health-cpu')||85));
 const [fpsLimit,setFpsLimit]=useState(Number(localStorage.getItem('tally-health-fps')||24));
 const [alerts,setAlerts]=useState(false);
 const lastAlert=useRef(0);
 const cpu=Number(stats?.cpu_pct||0),fps=Number(stats?.fps||0);
 const stream=stats?.stream as Record<string,unknown>|undefined;
 const skipped=Number(stream?.skipped_frames||0),total=Number(stream?.total_frames||0);
 const drop=total>0?100*skipped/total:0;
 const bitrate=Number(stream?.bitrate_kbps||0);
 useEffect(()=>{if(!connected)return;setHistory(h=>[...h.slice(-29),{cpu,fps,drop}]);},[connected,cpu,fps,drop]);
 const problems=connected?[
  cpu>cpuLimit?`OBS CPU usage exceeds ${cpuLimit}%`:'',
  fps>0&&fps<fpsLimit?`OBS FPS below ${fpsLimit}`:'',
  drop>3?`${drop.toFixed(1)}% dropped stream frames`:'',
  stream?.active===false?'Streaming is stopped':''
 ].filter(Boolean):['OBS Bridge disconnected or telemetry stale'];
 useEffect(()=>{
  if(!alerts||!problems.length||!('Notification' in window)||Notification.permission!=='granted')return;
  if(Date.now()-lastAlert.current<60000)return;
  lastAlert.current=Date.now();
  new Notification('OBS TALLY PRO health warning',{body:problems.join('. ')});
 },[alerts,problems.join('|')]);
 const grant=async()=>{if(!('Notification'in window))return;const r=await Notification.requestPermission();setAlerts(r==='granted');};
 const chart=(key:'cpu'|'fps'|'drop',max:number)=>{
  const pts=history.map((v,i)=>`${(i/Math.max(1,history.length-1))*100},${100-Math.min(100,(v[key]/max)*100)}`).join(' ');
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${key} history`}><polyline points={pts} stroke="#54dfba" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>;
 };
 return <section className="crew-health"><div className="crew-top"><div><h2>Stream health monitoring</h2><p>Real OBS telemetry. Graphs track the last 30 readings while this dashboard remains open.</p></div><button onClick={()=>void grant()}>{alerts?'Browser alerts enabled':'Enable browser alerts'}</button></div>
 <div className="crew-health-charts"><div><strong>Bitrate · {connected?bitrate.toFixed(0)+' kbps':'Unknown'}</strong><p>Measured from OBS stream output bytes over time</p></div><div><strong>CPU · {connected?cpu.toFixed(1)+'%':'Unknown'}</strong>{chart('cpu',100)}</div><div><strong>Render FPS · {connected?fps.toFixed(1):'Unknown'}</strong>{chart('fps',60)}</div><div><strong>Dropped frames · {connected?drop.toFixed(1)+'%':'Unknown'}</strong>{chart('drop',10)}</div></div>
 <div className="crew-health-options"><label>CPU warning (%) <input type="number" min="30" max="99" value={cpuLimit} onChange={e=>{setCpuLimit(+e.target.value);localStorage.setItem('tally-health-cpu',e.target.value);}}/></label><label>Minimum FPS <input type="number" min="1" max="120" value={fpsLimit} onChange={e=>{setFpsLimit(+e.target.value);localStorage.setItem('tally-health-fps',e.target.value);}}/></label></div>
 <div className={problems.length?'crew-health-warnings':'crew-health-clear'}>{problems.length?problems.map(p=><p key={p}>⚠ {p}</p>):'OBS stream health within configured limits'}</div>
 </section>;
}