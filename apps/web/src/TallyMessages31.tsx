import {useCallback,useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

type Msg={id:string;sender_id:string;body:string;quick_command:boolean;target_camera_ids:string[];created_at:string;audience:string};

/** The main tally surface always listens. Acknowledgements are server-side and survive refreshes. */
export function TallyMessages31({client,productionId,cameraId}:{client:SupabaseClient;productionId:string;cameraId:string}){
 const [current,setCurrent]=useState<Msg|null>(null);
 const [all,setAll]=useState<Msg[]>([]);
 const [acknowledged,setAcknowledged]=useState<Set<string>>(new Set());
 const [unread,setUnread]=useState(0);
 const [error,setError]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [duration,setDuration]=useState(Number(localStorage.getItem('bumbi-message-duration-31')||15));
 const active=useRef(false);
 const notified=useRef(new Set<string>());
 const inFlight=useRef(false);
 const ignored=useRef(new Set<string>());
 const load=useCallback(async()=>{
  if(inFlight.current)return;
  inFlight.current=true;
  try{
   const [messages,session]=await Promise.all([
    client.from('operator_messages').select('id,sender_id,body,quick_command,target_camera_ids,created_at,audience')
     .eq('production_id',productionId).eq('audience','crew').order('created_at',{ascending:false}).limit(90),
    client.auth.getUser()
   ]);
   if(messages.error)throw messages.error;
   const uid=session.data.user?.id;
   const rows=((messages.data||[]) as Msg[]).filter(m=>!m.target_camera_ids?.length||m.target_camera_ids.includes(cameraId));
   const ids=rows.map(m=>m.id);
   let reads:string[]=[];
   if(uid&&ids.length){
    const read=await client.from('operator_message_reads').select('message_id')
     .eq('reader_id',uid).in('message_id',ids);
    if(read.error)throw read.error;
    reads=(read.data||[]).map(r=>r.message_id as string);
   }
   if(!active.current)return;
   const known=new Set(reads);
   setAcknowledged(known);setAll(rows);
   setUnread(rows.filter(m=>!known.has(m.id)).length);
   const newest=rows.find(m=>!known.has(m.id)&&!ignored.current.has(m.id));
   if(newest){
    setCurrent(prev=>prev?.id===newest.id?prev:newest);
    if(!notified.current.has(newest.id)){
     notified.current.add(newest.id);
     if(newest.quick_command){try{navigator.vibrate?.([120,70,120]);}catch{/* Unsupported device */}}
    }
   }else setCurrent(null);
   setError('');
  }catch(e){if(active.current)setError(e instanceof Error?e.message:String(e));}
  finally{inFlight.current=false;}
 },[client,productionId,cameraId]);
 useEffect(()=>{
  active.current=true;ignored.current.clear();notified.current.clear();
  let ch:ReturnType<typeof client.channel>|null=null;
  void load();
  void client.auth.getSession().then(({data})=>{
   if(!active.current||!data.session)return;
   client.realtime.setAuth(data.session.access_token);
   ch=client.channel(`ops:${productionId}`,{config:{private:true}})
    .on('broadcast',{event:'message'},()=>void load())
    .subscribe();
  });
  const timer=setInterval(()=>void load(),6000);
  const online=()=>void load();
  const resume=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener('online',online);
  document.addEventListener('visibilitychange',resume);
  return()=>{active.current=false;clearInterval(timer);window.removeEventListener('online',online);
   document.removeEventListener('visibilitychange',resume);if(ch)void client.removeChannel(ch);};
 },[client,productionId,cameraId,load]);
 useEffect(()=>{
  if(!current)return;
  const timer=setTimeout(()=>{
   ignored.current.add(current.id);
   setCurrent(prev=>prev?.id===current.id?null:prev);
  },Math.max(6,Math.min(60,duration))*1000);
  return()=>clearTimeout(timer);
 },[current,duration]);
 const acknowledge=async(id:string)=>{
  const result=await client.rpc('mark_operator_message_read',{mid:id});
  if(result.error){setError(result.error.message);return;}
  ignored.current.add(id);
  setAcknowledged(prev=>new Set([...prev,id]));
  setCurrent(prev=>prev?.id===id?null:prev);
  void load();
 };
 const hide=()=>{if(current){ignored.current.add(current.id);setCurrent(null);}};
 return <div className="tally-message31">
  {current&&<aside className={`tally-message31-banner ${current.quick_command?'urgent':''}`} role="alert" aria-live="assertive">
   <div><strong>{current.quick_command?'URGENT DIRECTOR INSTRUCTION':'DIRECTOR MESSAGE'}</strong>
    <span>{new Date(current.created_at).toLocaleTimeString()}</span></div>
   <p>{current.body}</p><div><button onClick={()=>void acknowledge(current.id)}>ACKNOWLEDGE</button>
    <button onClick={hide}>Hide</button></div>
  </aside>}
  <button type="button" className="tally-message31-toggle" onClick={()=>setExpanded(x=>!x)}>
   Director messages {unread>0?<strong>{unread} unread</strong>:<span>All acknowledged</span>}
  </button>
  {expanded&&<div className="tally-message31-history"><h3>Director instructions</h3>
   <label>Banner duration <select value={duration} onChange={e=>{setDuration(Number(e.target.value));localStorage.setItem('bumbi-message-duration-31',e.target.value);}}>
    <option value={8}>8 seconds</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></label>
   {all.map(m=><article key={m.id}><strong>{m.quick_command?'URGENT':'DIRECTOR'} · {new Date(m.created_at).toLocaleString()}</strong>
    <p>{m.body}</p><button type="button" disabled={acknowledged.has(m.id)} onClick={()=>void acknowledge(m.id)}>{acknowledged.has(m.id)?'Acknowledged':'Acknowledge'}</button></article>)}
   {!all.length&&<p>No director messages yet</p>}{error&&<p role="alert">{error}</p>}
  </div>}
  {error&&!expanded&&<p role="status" className="tally-message31-error">{error}</p>}
 </div>;
}
