import {useCallback,useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

type Msg={id:string;sender_id:string;body:string;quick_command:boolean;target_camera_ids:string[];created_at:string;audience:string};
/** Always active on the paired cameraman tally page, not a hidden Messages tab. */
export function TallyMessages31({client,productionId,cameraId}:{client:SupabaseClient;productionId:string;cameraId:string}){
 const [current,setCurrent]=useState<Msg|null>(null);
 const [unread,setUnread]=useState(0);
 const [error,setError]=useState('');
 const [duration,setDuration]=useState(Number(localStorage.getItem('bumbi-message-duration-31')||15));
 const [all,setAll]=useState<Msg[]>([]);
 const [expanded,setExpanded]=useState(false);
 const newest=useRef('');const mounted=useRef(true);
 const currentRef=useRef<Msg|null>(null);
 const clock=useRef(Date.now());
 const seenKey=`bumbi-notifications-31:${productionId}:${cameraId}`;
 const seen=useRef(new Set<string>());
 useEffect(()=>{try{seen.current=new Set(JSON.parse(sessionStorage.getItem(seenKey)||'[]') as string[]);}catch{seen.current=new Set();}},[seenKey]);
 const load=useCallback(async()=>{
  const result=await client.from('operator_messages').select('id,sender_id,body,quick_command,target_camera_ids,created_at,audience')
   .eq('production_id',productionId).eq('audience','crew').order('created_at',{ascending:false}).limit(35);
  if(result.error){if(mounted.current)setError(result.error.message);return;}
  if(!mounted.current)return;
  const rows=(result.data||[]).filter((m:Msg)=>!m.target_camera_ids?.length||m.target_camera_ids.includes(cameraId)) as Msg[];
  setAll(rows);setUnread(rows.filter(x=>!seen.current.has(x.id)).length);
  const latest=rows.find(x=>!seen.current.has(x.id)&&Date.now()-new Date(x.created_at).getTime()<120000);
  if(latest&&latest.id!==newest.current){
   newest.current=latest.id;currentRef.current=latest;setCurrent(latest);
   if(latest.quick_command){try{navigator.vibrate?.([130,80,130]);}catch{}}
  }
  setError('');
 },[client,productionId,cameraId]);
 useEffect(()=>{
  mounted.current=true;clock.current=Date.now();let channel:ReturnType<typeof client.channel>|null=null;
  void client.auth.getSession().then(({data})=>{
   if(!mounted.current||!data.session)return;
   client.realtime.setAuth(data.session.access_token);
   channel=client.channel(`tally-messages31:${productionId}:${cameraId}`,{config:{private:true}})
    .on('broadcast',{event:'message'},()=>void load())
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'operator_messages',filter:`production_id=eq.${productionId}`},()=>void load())
    .subscribe();
  });
  void load();const t=setInterval(()=>void load(),5500);
  const online=()=>void load();const resume=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener('online',online);document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;clearInterval(t);window.removeEventListener('online',online);document.removeEventListener('visibilitychange',resume);
   if(channel)void client.removeChannel(channel);};
 },[client,productionId,cameraId,load]);
 useEffect(()=>{if(!current)return;const id=setTimeout(()=>{setCurrent(null);currentRef.current=null;},Math.max(6,Math.min(60,duration))*1000);
  return()=>clearTimeout(id);
 },[current,duration]);
 const acknowledge=async(id:string)=>{
  seen.current.add(id);const ids=[...seen.current].slice(-100);
  sessionStorage.setItem(seenKey,JSON.stringify(ids));
  setUnread(n=>Math.max(0,n-1));setCurrent(null);currentRef.current=null;
  await client.rpc('mark_operator_message_read',{mid:id});
 };
 return <div className="tally-message31">
  {current&&<aside className={`tally-message31-banner ${current.quick_command?'urgent':''}`} role="alert" aria-live="assertive">
   <div><strong>{current.quick_command?'URGENT DIRECTOR INSTRUCTION':'DIRECTOR MESSAGE'}</strong>
    <span>{new Date(current.created_at).toLocaleTimeString()}</span></div>
   <p>{current.body}</p>
   <div><button onClick={()=>void acknowledge(current.id)}>ACKNOWLEDGE</button>
    <button onClick={()=>setCurrent(null)}>Hide</button></div>
  </aside>}
  <button type="button" className="tally-message31-toggle" onClick={()=>setExpanded(x=>!x)}>
   Director messages {unread>0?<strong>{unread} unread</strong>:<span>All seen</span>}
  </button>
  {expanded&&<div className="tally-message31-history"><h3>Director instructions</h3>
   <label>Banner duration <select value={duration} onChange={e=>{setDuration(Number(e.target.value));localStorage.setItem('bumbi-message-duration-31',e.target.value);}}>
    <option value={8}>8 seconds</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option></select></label>
   {all.map(m=><article key={m.id}><strong>{m.quick_command?'URGENT':'DIRECTOR'} · {new Date(m.created_at).toLocaleTimeString()}</strong>
    <p>{m.body}</p><button type="button" onClick={()=>void acknowledge(m.id)}>{seen.current.has(m.id)?'Acknowledged':'Acknowledge'}</button></article>)}
   {!all.length&&<p>No director messages yet</p>}{error&&<p role="alert">{error}</p>}
  </div>}
 </div>;
}