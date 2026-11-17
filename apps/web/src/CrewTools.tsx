import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './client';

type Camera={id:string;number:number;name:string;enabled:boolean;state:string;preview_at:string|null};
type View={production_id:string;production_name:string;bridge_online:boolean;last_bridge_at:string|null;cameras:Camera[]};
type Message={id:string;sender_id:string;sender_kind:string;audience:string;target_camera_ids:string[];body:string;quick_command:boolean;created_at:string};
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const fmt=(v:string)=>new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const canPreview=(cam:Camera,own?:string)=>!own||cam.id===own;
const cls=(s:string)=>s==='PROGRAM'?'live':s==='PREVIEW'?'standby':s==='IDLE'?'idle':'offline';

function useCrewView(productionId:string){
 const [data,setData]=useState<View|null>(null);
 const [error,setError]=useState('');
 const reload=useCallback(async()=>{
  if(!productionId)return;
  const r=await supabase.rpc('crew_multiview_snapshot',{pid:productionId});
  if(r.error){setError(r.error.message);return;}
  setData(r.data as View);setError('');
 },[productionId]);
 useEffect(()=>{
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
 },[productionId,reload]);
 return {data,error,reload};
}

function Preview({camera,productionId,allowed}:{camera:Camera;productionId:string;allowed:boolean}){
 const [url,setUrl]=useState<string|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  if(!allowed||!camera.preview_at||Date.now()-new Date(camera.preview_at).getTime()>90000){setUrl(null);return;}
  let refreshTimer:ReturnType<typeof setInterval>;
  async function load(){
   const path=`${productionId}/${camera.id}.jpg`;
   const r=await supabase.storage.from('tally-private-previews').createSignedUrl(path,35);
   if(!alive)return;
   if(r.error){setUrl(null);setError(r.error.message);return;}
   setUrl(r.data?.signedUrl||null);setError('');
  }
  void load();refreshTimer=setInterval(()=>void load(),18000);
  return()=>{alive=false;clearInterval(refreshTimer);};
 },[allowed,camera.id,camera.preview_at,productionId]);
 if(!allowed)return <div className="crew-preview-empty">Private camera preview</div>;
 if(!url)return <div className="crew-preview-empty">{error?'Preview unavailable':'Awaiting authenticated OBS thumbnail'}</div>;
 return <img className="crew-preview" src={url} alt={`OBS preview ${camera.name}`} loading="lazy" decoding="async" onError={()=>setUrl(null)}/>;
}

function CrewMultiview({productionId,ownCameraId,scenes}:{productionId:string;ownCameraId?:string;scenes?:string[]}){
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
  if(!selectedScene||!scenes?.includes(selectedScene))return;
  setSwitching(true);setNotice('');
  const r=await supabase.rpc('request_obs_scene_switch',{pid:productionId,requested_scene:selectedScene});
  setNotice(r.error?`Scene request failed. ${r.error.message}`:'Scene switch requested. Verify OBS Program status.');
  setSwitching(false);
 };
 const enterFullscreen=async()=>{
  try{if(!document.fullscreenElement)await ref.current?.requestFullscreen();else await document.exitFullscreen();}
  catch{setNotice('Fullscreen is not supported in this browser.');}
 };
 useEffect(()=>{const fn=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',fn);return()=>document.removeEventListener('fullscreenchange',fn);},[]);
 return <div className="crew-panel" ref={ref}>
  <div className="crew-top"><div><h2>Production multiview</h2><p>Live tally states with bandwidth-limited private OBS thumbnails. Previews are periodic still frames, not continuous video.</p></div>
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
     <div className="crew-video"><Preview camera={cam} productionId={productionId} allowed={canPreview(cam,ownCameraId)&&data?.bridge_online===true}/></div>
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
 const [msgs,setMsgs]=useState<Message[]>([]);
 const [message,setMessage]=useState('');
 const [targets,setTargets]=useState<string[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [readCount,setReadCount]=useState<Record<string,number>>({});
 const [me,setMe]=useState('');
 const refresh=useCallback(async()=>{
  const r=await supabase.from('operator_messages').select('*').eq('production_id',productionId).order('created_at',{ascending:false}).limit(90);
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
  const unseen=m.filter(x=>x.sender_id!==user?.id);
  for(const x of unseen.slice(-12))void supabase.rpc('mark_operator_message_read',{mid:x.id});
  setError('');
 },[productionId,director]);
 useEffect(()=>{void refresh();const id=setInterval(()=>void refresh(),4200);return()=>clearInterval(id);},[refresh]);
 const send=async(content=message,quick=false)=>{
  const txt=content.trim();if(!txt)return;
  setBusy(true);setError('');
  const r=await supabase.rpc('send_operator_message',{pid:productionId,recipient:director?'crew':'directors',targets:director?targets:[],message_text:txt,quick});
  if(r.error)setError(r.error.message);
  else{setMessage('');void refresh();}
  setBusy(false);
 };
 return <div className="crew-panel"><div className="crew-top"><div><h2>Operator communication</h2><p>Private, authorized text commands and crew replies. Messages retained for 14 days by access policy.</p></div><button onClick={()=>void refresh()}>Refresh</button></div>
  {director&&<div className="crew-target"><strong>Message recipients</strong><p>{targets.length?targets.length===1?'Individual camera message':`Group message to ${targets.length} cameras`:'Broadcast to all paired cameramen'}</p>
   <select multiple aria-label="Select cameras for private messages" size={Math.min(6,Math.max(2,cameras.length))}
    value={targets} onChange={e=>setTargets(Array.from(e.target.selectedOptions,option=>option.value))}>
   {cameras.map(c=><option key={c.id} value={c.id}>{c.name} · CAM {c.number}</option>)}</select>
   <button onClick={()=>setTargets([])}>Broadcast to all</button><small>Hold Ctrl to select multiple cameras. No selection means broadcast.</small>
 </div>}
  <div className="crew-quick">{(director?['STANDBY','READY CAMERA','CHECK AUDIO','GO LIVE SOON','THANK YOU']:['READY','ACKNOWLEDGED','TECHNICAL ISSUE','PLEASE REPEAT']).map(cmd=><button key={cmd} disabled={busy} onClick={()=>void send(cmd,true)}>{cmd}</button>)}</div>
  <div className="crew-message-list" role="log" aria-live="polite">{msgs.map(m=><div key={m.id} className={`crew-message ${m.sender_id===me?'mine':''}`}><div><strong>{m.sender_id===me?'You':m.sender_kind==='director'?'Director':'Cameraman'}</strong><span>{fmt(m.created_at)}{director&&m.sender_id===me?` · ${readCount[m.id]||0} read`:''}</span></div><p>{m.body}</p></div>)}</div>
  {!msgs.length&&<p className="crew-empty">No messages received yet.</p>}
  <form className="crew-compose" onSubmit={e=>{e.preventDefault();void send();}}><input value={message} onChange={e=>setMessage(e.target.value)} maxLength={500} required placeholder={director?'Send a secure camera instruction':'Reply to directors'}/><button type="submit" disabled={busy||!message.trim()}>Send</button></form>
  {error&&<p className="crew-error" role="alert">{error}</p>}
 </div>;
}

type Participant={user_id:string;camera_id:string;camera_name:string;device_name:string};
type Participants={directors:string[];cameramen:Participant[]};
type Signal={id:number;sender_id:string;receiver_id:string;call_id:string;kind:'offer'|'answer'|'ice'|'hangup';payload:Record<string,unknown>};

function CrewTalkback({productionId,director,ownCameraId}:{productionId:string;director:boolean;ownCameraId?:string}){
 const [people,setPeople]=useState<Participants>({directors:[],cameramen:[]});
 const [target,setTarget]=useState('');
 const [status,setStatus]=useState('Not connected');
 const [error,setError]=useState('');
 const [micReady,setMicReady]=useState(false);
 const [holding,setHolding]=useState(false);
 const [connected,setConnected]=useState(false);
 const [incoming,setIncoming]=useState<Signal|null>(null);
 const incomingRef=useRef<Signal|null>(null);
 const local=useRef<MediaStream|null>(null);
 const pc=useRef<RTCPeerConnection|null>(null);
 const other=useRef('');
 const session=useRef('');
 const latest=useRef(0);
 const pendingIce=useRef<RTCIceCandidateInit[]>([]);
 const speaker=useRef<HTMLAudioElement>(null);
 const started=useRef(Date.now());
 const active=useRef(true);
 const send=useCallback(async(receiver:string,callId:string,kind:string,payload:Record<string,unknown>)=>{
  if(!receiver||!callId)return;
  const r=await supabase.rpc('send_crew_rtc_signal',{pid:productionId,receiver,session_id:callId,signal_type:kind,signal_body:payload});
  if(r.error)throw new Error(r.error.message);
 },[productionId]);
 const close=useCallback((remote=false)=>{
  if(!remote&&other.current&&session.current)void send(other.current,session.current,'hangup',{});
  pc.current?.close();pc.current=null;other.current='';session.current='';pendingIce.current=[];incomingRef.current=null;setIncoming(null);
  local.current?.getTracks().forEach(t=>t.stop());local.current=null;setMicReady(false);setHolding(false);setConnected(false);setStatus('Not connected');
 },[send]);
 const makePC=useCallback((to:string,sid:string)=>{
  if(pc.current)pc.current.close();
  const peer=new RTCPeerConnection({iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']}]});
  pc.current=peer;other.current=to;session.current=sid;
  peer.onicecandidate=e=>{if(e.candidate)void send(to,sid,'ice',{candidate:e.candidate.toJSON()}).catch(err=>setError(errorText(err)));};
  peer.onconnectionstatechange=()=>{
   if(peer.connectionState==='connected'){setStatus('Encrypted audio connected');setConnected(true);}
   else if(peer.connectionState==='failed'||peer.connectionState==='disconnected'){setStatus('Connection interrupted. A TURN relay may be required.');setConnected(false);}
  };
  peer.ontrack=e=>{if(speaker.current){speaker.current.srcObject=e.streams[0];void speaker.current.play().catch(()=>setStatus('Tap Play audio to hear talkback'));}};
  return peer;
 },[send]);
 const flushIce=async()=>{
  const peer=pc.current;if(!peer?.remoteDescription)return;
  for(const ice of pendingIce.current.splice(0))try{await peer.addIceCandidate(ice);}catch{}
 };
 const ensureMic=async()=>{
  if(local.current)return local.current;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  stream.getAudioTracks().forEach(t=>t.enabled=false);
  local.current=stream;setMicReady(true);return stream;
 };
 const call=async(id:string)=>{
  setError('');
  try{
   const stream=await ensureMic();
   const sid=crypto.randomUUID(),peer=makePC(id,sid);
   for(const track of stream.getAudioTracks())peer.addTrack(track,stream);
   const offer=await peer.createOffer();await peer.setLocalDescription(offer);
   await send(id,sid,'offer',{sdp:peer.localDescription?.toJSON()});
   setStatus('Calling. Waiting for audio connection');
  }catch(e){setError(errorText(e));close(true);}
 };
 const receive=useCallback(async(s:Signal)=>{
  try{
   if(s.kind==='offer'){
    if(pc.current||incomingRef.current)return;
    const desc=s.payload.sdp as RTCSessionDescriptionInit|undefined;
    if(!desc||desc.type!=='offer')return;
    incomingRef.current=s;setIncoming(s);
    setStatus('Incoming call. Accept explicitly to start WebRTC and request microphone permission.');
   }else if(incomingRef.current && s.call_id===incomingRef.current.call_id && s.sender_id===incomingRef.current.sender_id){
    if(s.kind==='ice'){
      const candidate=s.payload.candidate as RTCIceCandidateInit|undefined;
      if(candidate)pendingIce.current.push(candidate);
    } else if(s.kind==='hangup'){
      incomingRef.current=null;setIncoming(null);setStatus('Incoming call cancelled');
    }
   }else if(s.call_id===session.current&&s.sender_id===other.current){
    const peer=pc.current;if(!peer)return;
    if(s.kind==='answer'){const desc=s.payload.sdp as RTCSessionDescriptionInit|undefined;if(desc?.type==='answer')await peer.setRemoteDescription(desc);await flushIce();}
    else if(s.kind==='ice'){const ice=s.payload.candidate as RTCIceCandidateInit|undefined;if(ice){if(peer.remoteDescription)await peer.addIceCandidate(ice);else pendingIce.current.push(ice);}}
    else if(s.kind==='hangup')close(true);
   }
  }catch(e){setError(`Talkback failed. ${errorText(e)}`);}
 },[makePC,send,close]);
 useEffect(()=>{
  active.current=true;started.current=Date.now();
  const init=async()=>{
   const r=await supabase.rpc('crew_participants',{pid:productionId});
   if(!r.error&&active.current){
    const value=r.data as Participants;setPeople(value);
    const choices=director?value.cameramen.map(p=>p.user_id):value.directors;
    if(choices[0])setTarget(choices[0]);
   }
   const session=await supabase.auth.getUser();
   if(!session.data.user&&active.current)setError('Sign in to use private talkback.');
  };
  void init();
  const poll=async()=>{
   if(!active.current)return;
   const r=await supabase.from('crew_rtc_signals').select('id,sender_id,receiver_id,call_id,kind,payload').gt('id',latest.current).gte('created_at',new Date(started.current-3000).toISOString()).order('id').limit(90);
   if(r.error)return;
   for(const s of (r.data||[]) as Signal[]){
    latest.current=Math.max(latest.current,s.id);
    await receive(s);
   }
  };
  const id=setInterval(()=>void poll(),1200);void poll();
  return()=>{active.current=false;clearInterval(id);close(true);};
 },[productionId,director,receive,close]);
 const accept=async()=>{
  const offer=incomingRef.current;
  if(!offer)return;
  setError('');
  try{
   // Permission is requested only from the receiving user's explicit click.
   const stream=await ensureMic();
   const peer=makePC(offer.sender_id,offer.call_id);
   const description=offer.payload.sdp as RTCSessionDescriptionInit|undefined;
   if(!description||description.type!=='offer')throw new Error('Invalid incoming offer');
   await peer.setRemoteDescription(description);
   for(const track of stream.getAudioTracks())peer.addTrack(track,stream);
   const answer=await peer.createAnswer();
   await peer.setLocalDescription(answer);
   await send(offer.sender_id,offer.call_id,'answer',{sdp:peer.localDescription?.toJSON()});
   incomingRef.current=null;setIncoming(null);
   setStatus('Audio connection requested. Hold to talk once connected.');
   await flushIce();
  }catch(e){setError('Unable to accept talkback. '+errorText(e));close(true);}
 };
 const reject=()=>{
  const offer=incomingRef.current;
  if(offer)void send(offer.sender_id,offer.call_id,'hangup',{}).catch(e=>setError(errorText(e)));
  incomingRef.current=null;setIncoming(null);setStatus('Call declined');
 };
 const push=async()=>{
  try{
   const stream=await ensureMic();
   if(!connected){setError('Connect audio before speaking.');return;}
   stream.getAudioTracks().forEach(t=>t.enabled=true);setHolding(true);
  }catch(e){setError(errorText(e));}
 };
 const release=()=>{
  local.current?.getAudioTracks().forEach(t=>t.enabled=false);setHolding(false);
 };
 const recipients=director?people.cameramen.map(p=>({id:p.user_id,label:`${p.camera_name} · ${p.device_name}`})):people.directors.map((id,i)=>({id,label:`Director ${i+1}`}));
 return <div className="crew-panel"><div className="crew-top"><div><h2>Mobile remote talkback</h2><p>Encrypted browser WebRTC audio. Never connected to OBS recording or streaming. Microphone access requires your permission.</p></div></div>
 <p className="crew-service">Audio stays peer-to-peer where networks allow. Different mobile networks may require a separately configured TURN relay. No relay is configured in this version.</p>
 <div className="crew-talkback-row"><label>Call recipient <select value={target} onChange={e=>setTarget(e.target.value)} disabled={!!pc.current}><option value="">Select an authorized device</option>{recipients.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
  <button onClick={()=>void call(target)} disabled={!target||Boolean(pc.current)}>Start secure call</button><button onClick={()=>close()} disabled={!pc.current}>End call</button></div>
 {incoming&&<div className="crew-incoming"><strong>Incoming encrypted talkback call</strong><p>Accepting requests this phone's microphone. It stays muted until you hold the talk button.</p><button onClick={()=>void accept()}>Accept call</button><button onClick={reject}>Decline</button></div>}
 <p className={`crew-service ${connected?'good':'bad'}`}>Status · {status}</p>
 <button className={`crew-ptt ${holding?'active':''}`} disabled={!connected} onPointerDown={e=>{e.preventDefault();void push();}} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();void push();}}} onKeyUp={release}> {holding?'MICROPHONE LIVE · RELEASE TO MUTE':'HOLD TO TALK'} </button>
 <button onClick={()=>void speaker.current?.play().catch(e=>setError(errorText(e)))}>Play incoming audio</button>
 <audio ref={speaker} autoPlay playsInline/>
 <p>Microphone is off while not speaking. End call stops and releases all audio tracks. Cameramen can initiate a return call to directors.</p>
 {error&&<p className="crew-error" role="alert">{error}</p>}
 </div>;
}

export function CrewPanel({productionId,director,ownCameraId,scenes,initialTab}:{productionId:string;director:boolean;ownCameraId?:string;scenes?:string[];initialTab?:'multiview'|'messages'|'talkback'}){
 const [tab,setTab]=useState<'multiview'|'messages'|'talkback'>(initialTab||'multiview');
 const {data}=useCrewView(productionId);
 const cams=data?.cameras||[];
 return <section className="crew-shell">
   <div className="crew-tabs">{([['multiview','Multiview'],['messages','Operator messages'],['talkback','Mobile talkback']] as const).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
   {tab==='multiview'&&<CrewMultiview productionId={productionId} ownCameraId={ownCameraId} scenes={director?scenes:undefined}/>}
   {tab==='messages'&&<CrewChat productionId={productionId} director={director} ownCameraId={ownCameraId} cameras={cams}/>}
   {tab==='talkback'&&<CrewTalkback productionId={productionId} director={director} ownCameraId={ownCameraId}/>}
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