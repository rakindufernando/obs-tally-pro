import {useCallback,useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

type Message={id:string;body:string;quick_command:boolean;target_camera_ids:string[];created_at:string};
type Props={client:SupabaseClient;productionId:string;cameraId:string;online:boolean};

/** Compact, in-flow tally alerts. No camera video, microphone or long-term history. */
export function TallyMessages31({client,productionId,cameraId,online}:Props){
 const [messages,setMessages]=useState<Message[]>([]);
 const [readIds,setReadIds]=useState<Set<string>>(new Set());
 const [current,setCurrent]=useState<Message|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [duration,setDuration]=useState(Number(localStorage.getItem('bumbi-message-duration-31')||15));
 const active=useRef(false);
 const ignored=useRef(new Set<string>());
 const announced=useRef(new Set<string>());
 const loading=useRef(false);
 const sync=useCallback(async()=>{
  if(loading.current)return;
  loading.current=true;
  try{
   const [items,user]=await Promise.all([
    client.from('operator_messages').select('id,body,quick_command,target_camera_ids,created_at')
     .eq('production_id',productionId).eq('audience','crew').order('created_at',{ascending:false}).limit(60),
    client.auth.getUser()
   ]);
   if(items.error)throw items.error;
   if(user.error)throw user.error;
   const rows=((items.data||[]) as Message[]).filter(m=>
    !m.target_camera_ids.length||m.target_camera_ids.includes(cameraId));
   let ack:string[]=[];
   if(user.data.user&&rows.length){
    const result=await client.from('operator_message_reads').select('message_id')
      .eq('reader_id',user.data.user.id).in('message_id',rows.map(m=>m.id));
    if(result.error)throw result.error;
    ack=(result.data||[]).map(v=>v.message_id);
   }
   if(!active.current)return;
   const known=new Set(ack);
   const currentIds=new Set(rows.map(m=>m.id));
   for(const id of ignored.current)if(!currentIds.has(id))ignored.current.delete(id);
   setMessages(rows);setReadIds(known);
   const pending=rows.find(m=>!known.has(m.id)&&!ignored.current.has(m.id));
   setCurrent(online?pending||null:null);
   if(pending&&!announced.current.has(pending.id)){
    announced.current.add(pending.id);
    if(pending.quick_command&&online)try{navigator.vibrate?.([100,60,100]);}catch{/* Browser support varies */}
   }
   setError('');
  }catch(e){if(active.current)setError(e instanceof Error?e.message:String(e));}
  finally{loading.current=false;}
 },[client,productionId,cameraId,online]);
 useEffect(()=>{
  active.current=true;ignored.current.clear();announced.current.clear();
  let channel:ReturnType<typeof client.channel>|null=null;
  void sync();
  void client.auth.getSession().then(({data})=>{
   if(!active.current||!data.session)return;
   client.realtime.setAuth(data.session.access_token);
   channel=client.channel(`ops:${productionId}`,{config:{private:true}})
    .on('broadcast',{event:'message'},()=>void sync())
    .on('postgres_changes',{event:'*',schema:'public',table:'operator_messages',filter:`production_id=eq.${productionId}`},()=>void sync())
    .subscribe();
  });
  const timer=setInterval(()=>void sync(),3000);
  const resume=()=>{if(document.visibilityState==='visible')void sync();};
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{active.current=false;clearInterval(timer);window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);if(channel)void client.removeChannel(channel);};
 },[client,productionId,cameraId,sync]);
 useEffect(()=>{
  if(!online)setCurrent(null);
 },[online]);
 useEffect(()=>{
  if(!current)return;
  const timer=setTimeout(()=>{
   ignored.current.add(current.id);
   setCurrent(prev=>prev?.id===current.id?null:prev);
  },Math.max(6,Math.min(60,duration))*1000);
  return()=>clearTimeout(timer);
 },[current,duration]);
 const unread=online?messages.filter(m=>!readIds.has(m.id)).length:0;
 const acknowledge=async(id:string)=>{
  setBusy(true);setError('');
  const result=await client.rpc('mark_operator_message_read',{mid:id});
  if(result.error)setError(result.error.message);
  else{
   ignored.current.add(id);
   setReadIds(old=>new Set([...old,id]));
   setCurrent(m=>m?.id===id?null:m);
   await sync();
  }
  setBusy(false);
 };
 const acknowledgeAll=async()=>{
  setBusy(true);setError('');
  const result=await client.rpc('acknowledge_camera_messages',{pid:productionId,cid:cameraId});
  if(result.error)setError(result.error.message);
  else{setCurrent(null);messages.forEach(m=>ignored.current.add(m.id));await sync();}
  setBusy(false);
 };
 return <section className="tally-message31" aria-label="Director messages">
  {online&&current&&<aside className={`tally-message31-banner ${current.quick_command?'urgent':''}`} role="alert" aria-live={current.quick_command?'assertive':'polite'}>
   <div className="tally-message31-heading"><strong>{current.quick_command?'URGENT DIRECTOR MESSAGE':'DIRECTOR MESSAGE'}</strong><time>{new Date(current.created_at).toLocaleTimeString()}</time></div>
   <p>{current.body}</p>
   <div className="tally-message31-controls"><button disabled={busy} onClick={()=>void acknowledge(current.id)}>ACKNOWLEDGE</button>
    <button disabled={busy} onClick={()=>{ignored.current.add(current.id);setCurrent(null);}}>Hide</button></div>
  </aside>}
  <div className="tally-message31-toolbar"><button className="tally-message31-toggle" onClick={()=>setExpanded(x=>!x)}>
   Director messages {unread>0?<strong>{unread} unread</strong>:<span>{online?'Up to date':'OBS offline'}</span>}
  </button>
  {online&&unread>0&&<button className="tally-message31-ack-all" disabled={busy} onClick={()=>void acknowledgeAll()}>Acknowledge all</button>}</div>
  {expanded&&<div className="tally-message31-history">
   <div className="tally-message31-heading"><strong>Recent instructions</strong><button onClick={()=>setExpanded(false)}>Close</button></div>
   <label>Banner duration <select value={duration} onChange={e=>{setDuration(Number(e.target.value));localStorage.setItem('bumbi-message-duration-31',e.target.value);}}>
    <option value={8}>8 seconds</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></label>
   {messages.map(m=><article key={m.id}>
    <strong>{m.quick_command?'URGENT':'Director'} · {new Date(m.created_at).toLocaleTimeString()}</strong>
    <p>{m.body}</p>
    <button disabled={busy||readIds.has(m.id)} onClick={()=>void acknowledge(m.id)}>{readIds.has(m.id)?'Acknowledged':'Acknowledge'}</button>
   </article>)}
   {!messages.length&&<p>No active director instructions</p>}
  </div>}
  {error&&<p className="tally-message31-error" role="alert">{error}</p>}
 </section>;
}
