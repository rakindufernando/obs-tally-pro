import {useCallback,useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

type Person={user_id:string;camera_id:string;camera_name:string;device_name:string;last_seen_at:string|null;online:boolean};
type Participants={directors:string[];cameramen:Person[]};
type Signal={id:number;sender_id:string;receiver_id:string;call_id:string;kind:'offer'|'ringing'|'answer'|'ice'|'decline'|'busy'|'hangup';payload:Record<string,unknown>;created_at:string};
type CallStatus='idle'|'calling'|'ringing'|'incoming'|'connecting'|'connected'|'busy'|'declined'|'missed'|'ended'|'disconnected'|'error';
const messageOf=(e:unknown)=>e instanceof Error?e.message:String(e);
const uuid=()=>crypto.randomUUID();

export function CallCenter31({client,productionId,director,compact=false,dialRequest}:{client:SupabaseClient;productionId:string;director:boolean;compact?:boolean;dialRequest?:{id:string;name:string;key:number}|null}){
 const [people,setPeople]=useState<Participants>({directors:[],cameramen:[]});
 const [status,setStatus]=useState<CallStatus>('idle');
 const [detail,setDetail]=useState('');
 const [incoming,setIncoming]=useState<Signal|null>(null);
 const [panelOpen,setPanelOpen]=useState(!compact);
 const [muted,setMuted]=useState(false);
 const [connectedAt,setConnectedAt]=useState(0);
 const [seconds,setSeconds]=useState(0);
 const [quality,setQuality]=useState('Not measured');
 const [turnAvailable,setTurnAvailable]=useState<boolean|null>(null);
 const [deviceList,setDeviceList]=useState<Person[]>([]);
 const [error,setError]=useState('');
 const peer=useRef<RTCPeerConnection|null>(null);
 const localStream=useRef<MediaStream|null>(null);
 const remote=useRef<MediaStream|null>(null);
 const remoteId=useRef('');
 const callId=useRef('');
 const incomingRef=useRef<Signal|null>(null);
 const lastEvent=useRef(0);
 const mounted=useRef(true);
 const iceQueue=useRef<RTCIceCandidateInit[]>([]);
 const callTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const audio=useRef<HTMLAudioElement>(null);
 const ring=useRef<HTMLAudioElement>(null);
 const remoteName=useRef('Director');
 const send=useCallback(async(to:string,cid:string,kind:Signal['kind'],payload:Record<string,unknown>={})=>{
  const r=await client.rpc('send_crew_rtc_signal',{pid:productionId,receiver:to,session_id:cid,signal_type:kind,signal_body:payload});
  if(r.error)throw r.error;
 },[client,productionId]);
 const clearCall=useCallback((next:CallStatus='ended',notify=false)=>{
  if(notify&&remoteId.current&&callId.current)void send(remoteId.current,callId.current,'hangup').catch(()=>{});
  if(callTimer.current){clearTimeout(callTimer.current);callTimer.current=null;}
  peer.current?.close();peer.current=null;localStream.current?.getTracks().forEach(t=>t.stop());localStream.current=null;
  if(audio.current){audio.current.pause();audio.current.srcObject=null;}
  if(ring.current){ring.current.pause();ring.current.currentTime=0;}
  remote.current=null;remoteId.current='';callId.current='';incomingRef.current=null;iceQueue.current=[];
  setIncoming(null);setMuted(false);setConnectedAt(0);setSeconds(0);setQuality('Not measured');setStatus(next);
 },[send]);
 const getIce=useCallback(async()=>{
  try{
   const r=await client.functions.invoke('crew-ice',{body:{production_id:productionId}});
   if(r.error||!Array.isArray(r.data?.iceServers))throw new Error('Secure ICE configuration unavailable');
   setTurnAvailable(r.data.relayConfigured===true);
   return r.data.iceServers as RTCIceServer[];
  }catch{
   setTurnAvailable(false);
   return [{urls:'stun:stun.cloudflare.com:3478'}] as RTCIceServer[];
  }
 },[client,productionId]);
 const ensureMic=useCallback(async()=>{
  if(localStream.current)return localStream.current;
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS and a supported browser');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(!mounted.current){stream.getTracks().forEach(t=>t.stop());throw new Error('Call view closed');}
  localStream.current=stream;
  return stream;
 },[]);
 const setupPeer=useCallback(async(to:string,cid:string)=>{
  const iceServers=await getIce();
  if(peer.current)peer.current.close();
  const pc=new RTCPeerConnection({iceServers});
  peer.current=pc;remoteId.current=to;callId.current=cid;
  // Candidates may arrive while the receiver is still granting microphone access.
  // Do not erase queued ICE candidates for the pending incoming offer.
  pc.onicecandidate=(ev)=>{if(ev.candidate)void send(to,cid,'ice',{candidate:ev.candidate.toJSON()}).catch(e=>setError(messageOf(e)));};
  pc.ontrack=(ev)=>{
   const stream=ev.streams[0]||new MediaStream([ev.track]);remote.current=stream;
   if(audio.current){audio.current.srcObject=stream;void audio.current.play().catch(()=>setDetail('Tap Play audio to allow incoming sound'));}
  };
  pc.onconnectionstatechange=()=>{
   if(pc!==peer.current)return;
   if(pc.connectionState==='connected'){
    setStatus('connected');setConnectedAt(Date.now());setDetail('Encrypted WebRTC audio connected');
   }else if(pc.connectionState==='failed'){
    setDetail('Peer connection failed. Check TURN server and mobile network');clearCall('disconnected',true);
   }else if(pc.connectionState==='disconnected'){
    setStatus('disconnected');setDetail('Network interrupted; attempting ICE recovery');
    try{pc.restartIce();}catch{/* browser unsupported */}
   }
  };
  return pc;
 },[getIce,send,clearCall]);
 const flushIce=useCallback(async()=>{
  const p=peer.current;if(!p?.remoteDescription)return;
  for(const c of iceQueue.current.splice(0))try{await p.addIceCandidate(c);}catch{/* invalid candidate */}
 },[]);
 const startCall=useCallback(async(to:string,name:string)=>{
  if(!to||peer.current||incomingRef.current)return;
  iceQueue.current=[];
  setError('');setDetail('Requesting microphone permission');
  try{
   const stream=await ensureMic(),cid=uuid();remoteName.current=name;
   const p=await setupPeer(to,cid);
   stream.getAudioTracks().forEach(t=>p.addTrack(t,stream));
   setStatus('calling');setPanelOpen(true);
   const offer=await p.createOffer();await p.setLocalDescription(offer);
   await send(to,cid,'offer',{sdp:p.localDescription?.toJSON()});
   setDetail(`Calling ${name}`);
   callTimer.current=setTimeout(()=>{if(['calling','ringing','connecting'].includes(statusRef.current)){
    clearCall('missed',true);setDetail('Call not answered within 35 seconds');
   }},35000);
  }catch(e){setError(messageOf(e));clearCall('error',true);}
 },[ensureMic,setupPeer,send,clearCall]);
 const statusRef=useRef<CallStatus>(status);
 useEffect(()=>{statusRef.current=status;},[status]);
 const accept=useCallback(async()=>{
  const s=incomingRef.current;if(!s)return;
  setError('');
  try{
   const stream=await ensureMic();
   if(incomingRef.current?.call_id!==s.call_id){stream.getTracks().forEach(t=>t.stop());localStream.current=null;return;}
   const p=await setupPeer(s.sender_id,s.call_id);
   const desc=s.payload.sdp as RTCSessionDescriptionInit|undefined;
   if(desc?.type!=='offer')throw new Error('Caller provided an invalid offer');
   await p.setRemoteDescription(desc);
   stream.getAudioTracks().forEach(t=>p.addTrack(t,stream));
   const answer=await p.createAnswer();await p.setLocalDescription(answer);
   await send(s.sender_id,s.call_id,'answer',{sdp:p.localDescription?.toJSON()});
   incomingRef.current=null;setIncoming(null);setStatus('connecting');setDetail('Connecting encrypted audio');
   if(ring.current){ring.current.pause();ring.current.currentTime=0;}
   await flushIce();
  }catch(e){setError(messageOf(e));clearCall('error',true);}
 },[ensureMic,setupPeer,send,flushIce,clearCall]);
 const decline=useCallback(()=>{
  const s=incomingRef.current;if(s)void send(s.sender_id,s.call_id,'decline').catch(()=>{});
  clearCall('declined',false);setDetail('Incoming call declined');
 },[send,clearCall]);
 const receive=useCallback(async(s:Signal)=>{
  if(s.id<=lastEvent.current)return;
  lastEvent.current=s.id;
  if(s.kind==='offer'){
   if(Date.now()-new Date(s.created_at).getTime()>40000)return;
   iceQueue.current=[];
   if(incomingRef.current||peer.current){void send(s.sender_id,s.call_id,'busy').catch(()=>{});return;}
   incomingRef.current=s;setIncoming(s);setStatus('incoming');setPanelOpen(true);setDetail('Incoming voice call');
   void send(s.sender_id,s.call_id,'ringing').catch(()=>{});
   try{if(navigator.vibrate)navigator.vibrate([200,100,200,100,200]);}catch{}
   if(ring.current){ring.current.currentTime=0;void ring.current.play().catch(()=>{});}
   if(document.visibilityState==='hidden'&&'Notification'in window&&Notification.permission==='granted'){
    try{new Notification('OBS TALLY PRO incoming call',{body:'Director is calling. Open your tally screen to answer.'});}catch{}
   }
   return;
  }
  const waiting=incomingRef.current;
  if(waiting&&s.call_id===waiting.call_id&&s.sender_id===waiting.sender_id){
   if(s.kind==='hangup'){clearCall('missed');setDetail('Caller ended the call');}
   else if(s.kind==='decline'||s.kind==='busy'){clearCall(s.kind);setDetail('Call was cancelled');}
   else if(s.kind==='ice'){
    const c=s.payload.candidate as RTCIceCandidateInit|undefined;if(c)iceQueue.current.push(c);
   }return;
  }
  if(s.call_id!==callId.current||s.sender_id!==remoteId.current)return;
  if(s.kind==='ringing'){setStatus('ringing');setDetail('Ringing on cameraman phone');}
  if(s.kind==='busy'){clearCall('busy');setDetail('Operator is already on a call');}
  if(s.kind==='decline'){clearCall('declined');setDetail('Operator declined your call');}
  if(s.kind==='hangup'){clearCall('ended');setDetail('Call ended by other participant');}
  if(s.kind==='answer'){
   const desc=s.payload.sdp as RTCSessionDescriptionInit|undefined;
   if(desc?.type==='answer'&&peer.current){
    try{await peer.current.setRemoteDescription(desc);setStatus('connecting');await flushIce();}
    catch(e){setError(messageOf(e));clearCall('error',true);}
   }
  }
  if(s.kind==='ice'){
   const c=s.payload.candidate as RTCIceCandidateInit|undefined;
   if(c){if(peer.current?.remoteDescription)try{await peer.current.addIceCandidate(c);}catch{}
    else iceQueue.current.push(c);}
  }
 },[send,clearCall,flushIce]);
 const previousDial=useRef(0);
 useEffect(()=>{if(dialRequest&&dialRequest.key!==previousDial.current){previousDial.current=dialRequest.key;void startCall(dialRequest.id,dialRequest.name);}},[dialRequest,startCall]);
 useEffect(()=>{
  mounted.current=true;let channel:ReturnType<typeof client.channel>|null=null;let alive=true;let running=false;
  const init=async()=>{
   const {data:{user}}=await client.auth.getUser();if(!user)return;
   const participant=await client.rpc('crew_participants',{pid:productionId});
   if(alive&&!participant.error){const p=participant.data as Participants;setPeople(p);setDeviceList(p.cameramen||[]);
}
   const {data:{session}}=await client.auth.getSession();if(!alive||!session)return;
   client.realtime.setAuth(session.access_token);
   channel=client.channel(`crew-signals:${productionId}:${user.id}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'crew_rtc_signals',filter:`receiver_id=eq.${user.id}`},p=>{void receive(p.new as Signal);})
    .subscribe();
  };
  const poll=async()=>{
   if(!alive||running)return;running=true;
   try{
    const since=new Date(Date.now()-70_000).toISOString();
    const r=await client.from('crew_rtc_signals').select('id,receiver_id,sender_id,call_id,kind,payload,created_at')
     .gte('created_at',since).gt('id',lastEvent.current).order('id').limit(100);
    if(!r.error)for(const s of r.data||[])await receive(s as Signal);
   }catch{}finally{running=false;}
  };
  void init();void poll();const timer=setInterval(()=>void poll(),2500);
  const presence=setInterval(()=>void client.rpc('crew_participants',{pid:productionId}).then(r=>{
   if(!r.error&&alive){const p=r.data as Participants;setPeople(p);setDeviceList(p.cameramen||[]);}
  }),20000);
  return()=>{alive=false;mounted.current=false;clearInterval(timer);clearInterval(presence);
   if(channel)void client.removeChannel(channel);if(peer.current)clearCall('ended');};
 },[client,productionId,director,receive,clearCall]);
 useEffect(()=>{
  const tick=setInterval(()=>{if(connectedAt)setSeconds(Math.max(0,Math.floor((Date.now()-connectedAt)/1000)));},1000);
  const sample=setInterval(async()=>{
   const p=peer.current;if(!p||p.connectionState!=='connected')return;
   try{const report=await p.getStats();let lost=0,packets=0,rtt=0;
    report.forEach(x=>{const x2=x as RTCStats & {kind?:string;packetsLost?:number;packetsReceived?:number;currentRoundTripTime?:number};
     if(x.type==='inbound-rtp'&&x2.kind==='audio'){lost+=x2.packetsLost||0;packets+=x2.packetsReceived||0;}
     if(x.type==='candidate-pair'&&'state'in x&&x.state==='succeeded')rtt=x2.currentRoundTripTime||0;
    });const pct=packets+lost?100*lost/(packets+lost):0;
    setQuality(pct>5||rtt>0.8?'Poor':pct>2||rtt>0.35?'Fair':'Good');
   }catch{setQuality('Unavailable');}
  },4000);
  return()=>{clearInterval(tick);clearInterval(sample);};
 },[connectedAt]);
 const toggleMute=()=>{
  const next=!muted;localStream.current?.getAudioTracks().forEach(t=>{t.enabled=!next;});setMuted(next);
 };
 const format=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
 const active=Boolean(peer.current||incoming);
 return <section className={`call31 ${compact?'call31-compact':''}`} aria-label="Private mobile talkback">
  <audio ref={audio} autoPlay playsInline/>
  <audio ref={ring} src={`${import.meta.env.BASE_URL}incoming-call.wav`} preload="auto" loop/>
  {compact&&<button type="button" className="call31-toggle" onClick={()=>setPanelOpen(v=>!v)}>
   <span className={active?'call31-dot-active':'call31-dot'}/> Calls · {status==='idle'?'Ready':status}
  </button>}
  {(panelOpen||!compact)&&<div className="call31-card">
   <div className="call31-head"><h3>{director?'Director calls':'Camera talkback'}</h3><span>{status.toUpperCase()}</span></div>
   <p className="call31-detail" role="status">{detail||'Calls operate only while the browser page remains open and connected.'}</p>
   {director&&<div className="call31-contacts">{deviceList.map(p=><button type="button" key={p.user_id}
     disabled={active} onClick={()=>void startCall(p.user_id,`${p.camera_name} · ${p.device_name}`)}>
    <span className={p.online?'call31-online':'call31-offline'}/><span>{p.camera_name}<small>{p.device_name} · {p.online?'Online':'Offline'}</small></span><strong>CALL</strong>
   </button>)}{!deviceList.length&&<p>No paired cameramen available.</p>}</div>}
   {!director&&!active&&<p>Directors can call this paired phone. Keep this tally page open to receive calls.</p>}
   {status==='connected'&&<div className="call31-timer">{format(seconds)} <small>Connection quality · {quality}</small></div>}
   {active&&<div className="call31-buttons">
    <button type="button" onClick={toggleMute} disabled={!localStream.current}>{muted?'UNMUTE':'MUTE'}</button>
    <button type="button" onClick={()=>{if(audio.current)void audio.current.play().catch(()=>setDetail('Tap again to allow playback'));}}>PLAY AUDIO</button>
    <button type="button" className="call31-end" onClick={()=>clearCall('ended',true)}>END CALL</button>
   </div>}
   <p className="call31-hint">TURN relay {turnAvailable===null?'not checked':turnAvailable?'configured':'not configured'}. Only HTTPS mobile browsers can request microphone access. No call audio is stored or sent to OBS.</p>
   {error&&<p className="call31-error" role="alert">{error}</p>}
  </div>}
  {incoming&&<div className="call31-incoming" role="dialog" aria-label="Incoming voice call" aria-modal="false">
   <div className="call31-incoming-ring">◉</div><strong>INCOMING DIRECTOR CALL</strong>
   <p>{director?'Operator is calling':'Director is calling your camera'}</p>
   <p>Answer to request microphone permission. Your LIVE/PREVIEW tally remains visible.</p>
   <div><button type="button" className="call31-answer" onClick={()=>void accept()}>ANSWER</button>
   <button type="button" className="call31-decline" onClick={decline}>DECLINE</button></div>
  </div>}
 </section>;
}