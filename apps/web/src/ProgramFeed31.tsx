import {useCallback,useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

type Access={available:boolean;reason?:string;url?:string;relay_auth_required?:boolean};
const errText=(e:unknown)=>e instanceof Error?e.message:String(e);
/** Real WHEP video only. Never substitute OBS GetSourceScreenshot or fabricated frames. */
export function ProgramFeed31({client,productionId,compact=true}:{client:SupabaseClient;productionId:string;compact?:boolean}){
 const [access,setAccess]=useState<Access>({available:false,reason:'Checking authorized OBS program stream'});
 const [connected,setConnected]=useState(false);
 const [error,setError]=useState('');
 const [unmuted,setUnmuted]=useState(false);
 const [playing,setPlaying]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const video=useRef<HTMLVideoElement>(null);
 const currentPc=useRef<RTCPeerConnection|null>(null);
 const lastAccess=useRef('');
 const loadAccess=useCallback(async()=>{
  const r=await client.rpc('program_feed_access',{pid:productionId});
  if(r.error){setAccess({available:false,reason:r.error.message});return;}
  const next=r.data as Access;
  if(!next.available||!next.url){lastAccess.current='';setAccess({available:false,reason:next.reason||'OBS Program unavailable'});return;}
  if(!/^https:\/\/[^/?#]+\/program-[0-9a-f-]{36}\/whep$/.test(next.url)){
   setAccess({available:false,reason:'Video relay endpoint must be an authorized HTTPS WHEP URL'});return;
  }
  if(lastAccess.current!==next.url){lastAccess.current=next.url;setAccess(next);}
 },[client,productionId]);
 useEffect(()=>{
  void loadAccess();const timer=setInterval(()=>void loadAccess(),9000);
  const restore=()=>{if(document.visibilityState==='visible')void loadAccess();};
  window.addEventListener('online',restore);document.addEventListener('visibilitychange',restore);
  return()=>{clearInterval(timer);window.removeEventListener('online',restore);document.removeEventListener('visibilitychange',restore);};
 },[loadAccess]);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();let sessionUrl='';let token='';
  setConnected(false);setPlaying(false);setError('');
  if(!access.available||!access.url)return;
  const pc=new RTCPeerConnection();currentPc.current=pc;
  pc.addTransceiver('video',{direction:'recvonly'});
  pc.addTransceiver('audio',{direction:'recvonly'});
  const media=new MediaStream();
  pc.ontrack=e=>{
   if(!alive||!video.current)return;
   if(!media.getTracks().some(t=>t.id===e.track.id))media.addTrack(e.track);
   if(video.current.srcObject!==media)video.current.srcObject=media;
   void video.current.play().then(()=>setPlaying(true)).catch(()=>setError('Tap Play to allow the video in this browser'));
  };
  pc.onconnectionstatechange=()=>{
   if(!alive)return;
   if(pc.connectionState==='connected'){setConnected(true);setError('');}
   else if(['failed','closed','disconnected'].includes(pc.connectionState)){
    setConnected(false);setPlaying(false);
    if(pc.connectionState==='failed')setError('Live program WebRTC failed. Check the WHEP relay and ICE connectivity.');
   }
  };
  const begin=async()=>{
   try{
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Sign in to view the private OBS Program stream');
    token=session.access_token;
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await Promise.race([new Promise<void>(resolve=>{
     if(pc.iceGatheringState==='complete'){resolve();return;}
     const fn=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',fn);resolve();}};
     pc.addEventListener('icegatheringstatechange',fn);
    }),new Promise<void>(resolve=>setTimeout(resolve,5000))]);
    if(!alive||controller.signal.aborted)return;
    const response=await fetch(access.url!,{method:'POST',headers:{'Content-Type':'application/sdp','Authorization':`Bearer ${token}`},body:pc.localDescription?.sdp||'',signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(`Authorized WHEP relay rejected playback (${response.status})`);
    const sdp=await response.text();
    if(!sdp.startsWith('v=0'))throw new Error('WHEP endpoint did not return SDP');
    const location=response.headers.get('Location');if(location)sessionUrl=new URL(location,access.url!).href;
    if(!alive)return;
    await pc.setRemoteDescription({type:'answer',sdp});
   }catch(e){if(alive){setError(errText(e));setConnected(false);}}
  };
  void begin();
  return()=>{alive=false;controller.abort();pc.close();if(currentPc.current===pc)currentPc.current=null;
   if(video.current){video.current.pause();video.current.srcObject=null;}
   if(sessionUrl)void fetch(sessionUrl,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}}).catch(()=>{});
  };
 },[client,productionId,access.available,access.url,attempt]);
 const retry=()=>{setError('');setAttempt(n=>n+1);};
 const allowAudio=async()=>{
  if(!video.current)return;
  video.current.muted=false;setUnmuted(true);
  try{await video.current.play();setPlaying(true);}catch(e){setError(errText(e));}
 };
 return <section className={`program31 ${compact?'program31-compact':''}`} aria-label="Actual OBS program live video">
  <div className="program31-head"><strong>OBS PROGRAM LIVE FEED</strong><span className={connected?'program31-online':'program31-offline'}>{connected?'LIVE VIDEO':'VIDEO UNAVAILABLE'}</span></div>
  {access.available?<div className="program31-player"><video ref={video} autoPlay muted={!unmuted} playsInline controls={false}/>
   {!playing&&<div className="program31-wait">{error||'Connecting to the authenticated program video relay'}</div>}</div>
  :<div className="program31-unavailable"><span>◉</span><strong>No active authenticated program video</strong><p>{access.reason||'OBS stream is unavailable'}</p></div>}
  <div className="program31-actions"><button onClick={retry} type="button">Reconnect video</button>
   {access.available&&<button onClick={()=>void allowAudio()} type="button">{unmuted?'Play with audio':'Enable program audio'}</button>}</div>
  <small>Continuous program video requires a configured HTTPS WebRTC WHEP relay. This is not a camera screenshot or a simulated feed. OBS credentials are never shared with this browser.</small>
 </section>;
}