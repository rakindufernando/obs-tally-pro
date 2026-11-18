import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReactNode,FormEvent} from 'react';
import type {Session,User} from '@supabase/supabase-js';
import {Link,NavLink,Navigate,Route,Routes,useLocation,useNavigate,useParams} from 'react-router-dom';
import {QRCodeSVG} from 'qrcode.react';
import {Activity,AlertTriangle,ArrowRight,Camera,Check,ChevronDown,CircleHelp,Clipboard,Cloud,
 Cog,Eye,Film,Hash,Link2,Lock,LogOut,Maximize,Menu,Monitor,Plus,Power,
 Radio,RefreshCw,Settings,Shield,Smartphone,Trash2,Wifi,WifiOff,X,Volume2,VolumeX} from 'lucide-react';
import {freshness} from '@tally/shared';
import {supabase,configured,unwrap} from './client';
import {CrewPanel,HealthPanel} from './CrewTools';
import {DirectorPortal31} from './DirectorPortal31';
import {ProgramFeed31} from './ProgramFeed31';
import {TallyMessages31} from './TallyMessages31';
import type {CameraRow,CameraSnapshot,Production} from './client';

type AuthInfo={user:User;role:string};
const relativeTime=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleTimeString():'Not connected';
const toError=(e:unknown)=>e instanceof Error?e.message:String(e);
const buttonCopy=async(text:string)=>{await navigator.clipboard.writeText(text);};
const stateClass=(state:string)=>`status-${state.toLowerCase()}`;
const bumbiLogo=`${import.meta.env.BASE_URL}bumbi-logo.png`;
function BrandCredit(){return <div className="bumbi-credit"><img src={bumbiLogo} alt="BUMBI logo"/><span>Developed by <strong>BUMBI Software Solutions</strong></span></div>;} 

function useIdentity(){
 const [loading,setLoading]=useState(true);const [auth,setAuth]=useState<AuthInfo|null>(null);
 useEffect(()=>{
  let alive=true;
  async function update(session:Session|null){
   if(!alive)return;
   if(!session){setAuth(null);setLoading(false);return;}
   const {data}=await supabase.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
   if(alive){setAuth({user:session.user,role:data?.role||'cameraman'});setLoading(false);}
  }
  void supabase.auth.getSession().then(({data})=>update(data.session));
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{void update(session);});
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);
 return{loading,auth};
}
function ActionButton({children,onClick,disabled=false,secondary=false}: {children:ReactNode;onClick:()=>void;disabled?:boolean;secondary?:boolean}){
 return <button type="button" className={`btn ${secondary?'secondary':''}`} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Login(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [error,setError]=useState('');const [working,setWorking]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setWorking(true);setError('');
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)setError(error.message);setWorking(false);
 }
 return <div className="auth-layout"><div className="auth-card">
  <div className="brand brand-large"><img className="bumbi-header-logo" src={bumbiLogo} alt="BUMBI Software Solutions"/><div>OBS <strong>TALLY PRO</strong><small>WIRELESS LIVE PRODUCTION</small></div></div>
  <span className="eyebrow">SECURE DIRECTOR ACCESS</span><h1>Production starts here.</h1>
  <p>Sign in to your Supabase director account to manage real OBS tally lights.</p>
  <form onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="director@example.com"/></label>
  <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
  {error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
  <button disabled={working} className="btn full" type="submit">{working?'Signing in…':'Sign in securely'} <ArrowRight size={17}/></button></form>
  <p className="auth-foot">Administrator provisioning is performed once using Supabase Auth and the setup SQL in the README.</p><BrandCredit/>
 </div></div>;
}
const navItems=[['/dashboard','Overview',Monitor],['/cameras','Cameras',Camera],['/mapping','OBS mapping',Film],
 ['/productions','Productions',Radio],['/devices','Device access',Smartphone],['/events','Event history',Activity],
 ['/diagnostics','Diagnostics',Wifi],['/crew','Crew messages',Radio],['/settings','Settings',Cog],['/help','Help',CircleHelp]] as const;
function StateBadge({state}:{state:string}){return <span className={`state-badge ${stateClass(state)}`}><span className="dot"/>{state==='PROGRAM'?'ON AIR':state==='PREVIEW'?'STANDBY':state==='OFFLINE'?'UNAVAILABLE':state}</span>;}
function CameraCard({camera,production,onPair,onEdit}:{camera:CameraRow;production:Production;onPair:(c:CameraRow)=>void;onEdit:(c:CameraRow)=>void}){
 const state=freshness(production.last_bridge_at,production.obs_connected)?camera.tally_states?.state||'OFFLINE':'OFFLINE';
 const devices=camera.camera_devices.filter(d=>!d.revoked_at&&d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<90_000).length;
 return <div className={`camera-card ${stateClass(state)}`}>
 <div className="cam-top"><span className="cam-number">CAM {String(camera.number).padStart(2,'0')}</span><StateBadge state={state}/></div>
 <div className="cam-middle"><div className="big-blob"><span/></div><h3>{camera.name}</h3><p>{camera.cameraman||'Unassigned operator'}</p></div>
 <div className="cam-info"><span><Smartphone size={14}/>{devices} online</span><span><Hash size={14}/>{camera.camera_mappings.length} mappings</span></div>
 <div className="cam-actions"><button onClick={()=>onPair(camera)}><Link2 size={16}/> Pair phone</button><button onClick={()=>onEdit(camera)}><Settings size={16}/> Configure</button></div>
 </div>;
}
function CameraEditor({camera,production,usedNumbers,onClose,onSaved,onRefresh}:{
 camera:CameraRow|null;production:Production;usedNumbers:number[];onClose:()=>void;onSaved:()=>void;onRefresh:()=>void;
}){
 const nextNumber=Math.max(0,...usedNumbers)+1;
 const [name,setName]=useState(camera?.name||`Camera ${String(nextNumber).padStart(2,'0')}`);
 const [number,setNumber]=useState(camera?.number||nextNumber);
 const [operator,setOperator]=useState(camera?.cameraman||'');
 const [enabled,setEnabled]=useState(camera?.enabled??true);
 const [rules,setRules]=useState(camera?.camera_mappings.map(m=>({...m}))||[]);
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [kind,setKind]=useState<'SCENE'|'SOURCE'>('SOURCE');
 const [mappingName,setMappingName]=useState('');
 const [query,setQuery]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const catalog=(production.obs_sources||[]).filter((s)=>s.name&&(['SOURCE','SCENE'] as string[]).includes(s.kind));
 const filtered=catalog.filter(s=>`${s.kind} ${s.name}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,36);
 const mapped=(s:{kind:'SCENE'|'SOURCE';name:string;uuid:string|null})=>rules.some(r=>r.kind===s.kind&&(r.obs_uuid&&s.uuid?r.obs_uuid===s.uuid:r.obs_name===s.name)&&!r.excluded);
 const choose=(s:{kind:'SCENE'|'SOURCE';name:string;uuid:string|null})=>setRules(old=>{
   if(old.some(r=>r.kind===s.kind&&r.obs_name===s.name&&r.excluded===false))return old;
   return [...old,{id:crypto.randomUUID(),kind:s.kind,obs_name:s.name,obs_uuid:s.uuid||null,excluded:false}];
 });
 async function save(){
  setBusy(true);setError('');
  let createdId:string|null=null;
  try{
   if(!name.trim())throw new Error('Enter a name for your camera.');
   if(!Number.isInteger(number)||number<1||number>9999)throw new Error('Camera number must be between 1 and 9999.');
   if(usedNumbers.includes(number)&&number!==camera?.number)throw new Error(`Camera ${number} already exists. Choose another number.`);
   if(!rules.length)throw new Error('Select at least one OBS scene or source before saving.');
   const values={name:name.trim(),number,cameraman:operator.trim(),enabled,production_id:production.id};
   let cid:string=camera?.id||'';
   if(!cid){const created=await supabase.from('cameras').insert(values).select('id').single();if(created.error)throw created.error;if(!created.data?.id)throw new Error('Camera was not saved. Please retry.');cid=created.data.id;createdId=cid;}
   // Insert the new rules first. A failed insertion will not wipe existing mappings.
   const inserted=await supabase.from('camera_mappings').insert(rules.map(r=>({
    camera_id:cid,kind:r.kind,obs_name:r.obs_name,obs_uuid:r.obs_uuid||null,excluded:r.excluded
   })));
   if(inserted.error)throw inserted.error;
   if(camera){
    if(camera.camera_mappings.length){const oldRules=await supabase.from('camera_mappings').delete().in('id',camera.camera_mappings.map(m=>m.id));
    if(oldRules.error)throw oldRules.error;}
    const updated=await supabase.from('cameras').update(values).eq('id',camera.id);
    if(updated.error)throw updated.error;
   }
   onSaved();onClose();
  }catch(e){
   if(createdId)await supabase.from('cameras').delete().eq('id',createdId);
   setError(toError(e));
  }finally{setBusy(false);}
 }
 return <div className="overlay" role="dialog" aria-modal="true"><div className="modal wide camera-wizard">
  <header><div><span className="eyebrow">GUIDED CAMERA SETUP</span><h2>{camera?'Edit camera':'Add a camera'}</h2><p className="muted">Name it, choose its real OBS source, then save.</p></div><button className="icon-btn" aria-label="Close editor" onClick={onClose}><X/></button></header>
  <div className="wizard-step"><span className="wizard-step-no">01</span><div><strong>Camera information</strong><small>Next camera number is suggested automatically</small></div></div>
  <div className="two-cols"><label>Camera number<input type="number" min={1} max={9999} value={number} onChange={e=>setNumber(Number(e.target.value))}/></label>
   <label>Display name<input value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="Camera 02"/></label></div>
  <label>Cameraman<input value={operator} onChange={e=>setOperator(e.target.value)} placeholder="Name displayed on director dashboard"/></label>
  <label className="checkline"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Camera enabled</label>
  <div className="wizard-step"><span className="wizard-step-no">02</span><div><strong>Choose the actual OBS scene or source</strong><small>No need to guess the spelling</small></div></div>
  <div className="wizard-catalog-head"><input aria-label="Search OBS sources" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search OBS sources and scenes..."/>
   <button type="button" className="btn secondary" onClick={onRefresh}><RefreshCw size={15}/> Refresh</button></div>
  {filtered.length>0?<div className="wizard-catalog">{filtered.map((s,i)=><button type="button" key={s.kind+':'+s.name+':'+i}
    className={'wizard-source '+(mapped(s)?'picked':'')} onClick={()=>choose(s)}>
    {s.kind==='SCENE'?<Film size={16}/>:<Camera size={16}/>}<span><strong>{s.name}</strong><small>{s.kind==='SCENE'?'OBS Scene':'OBS Source'}</small></span>{mapped(s)?<Check size={18}/>:<Plus size={18}/>}</button>)}</div>
   :<div className="wizard-empty"><WifiOff size={19}/><span>{catalog.length?'No matching OBS source. Try another search.':'No OBS sources detected yet. Start the updated Windows Bridge with OBS open and click Refresh, or enter a source manually below.'}</span></div>}
  <div className="wizard-step"><span className="wizard-step-no">03</span><div><strong>Assigned OBS mappings</strong><small>Camera turns red on Program and green on Preview</small></div></div>
  <div className="rule-list">{rules.map((r,i)=><div className="rule" key={r.id||i}><span>{r.excluded?'EXCLUDE':'INCLUDE'} · {r.kind} <strong>{r.obs_name}</strong></span><button className="icon-btn" aria-label="Remove mapping" onClick={()=>setRules(old=>old.filter((_,j)=>j!==i))}><X size={16}/></button></div>)}
    {!rules.length&&<div className="empty-small">Select a source above or use Manual mapping.</div>}</div>
  <button type="button" className="wizard-advanced-toggle" onClick={()=>setShowAdvanced(!showAdvanced)}>{showAdvanced?'Hide':'Show'} manual source entry <ChevronDown size={15}/></button>
  {showAdvanced&&<div className="wizard-advanced"><div className="two-cols"><label>Mapping type<select value={kind} onChange={e=>setKind(e.target.value as 'SCENE'|'SOURCE')}><option value="SOURCE">OBS source</option><option value="SCENE">OBS scene</option></select></label>
    <label>Exact OBS name<input value={mappingName} onChange={e=>setMappingName(e.target.value)} placeholder="Video Capture Device"/></label></div>
    <button type="button" className="btn secondary" onClick={()=>{const trimmed=mappingName.trim();if(!trimmed)return;choose({kind,name:trimmed,uuid:null});setMappingName('');}}><Plus size={16}/> Add manual mapping</button></div>}
  {error&&<div className="error"><AlertTriangle size={16}/>{error}</div>}
  <footer className="modal-footer"><ActionButton secondary onClick={onClose}>Cancel</ActionButton><ActionButton disabled={busy} onClick={()=>void save()}>{busy?'Saving camera…':'Save camera & mapping'}</ActionButton></footer>
  <p className="muted small">Existing phone pairing stays attached to this camera when you edit its mappings.</p>
 </div></div>;
}

function PairDialog({camera,onClose}:{camera:CameraRow;onClose:()=>void}){
 const [code,setCode]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const url=`${window.location.origin}${import.meta.env.BASE_URL}#/pair?code=${encodeURIComponent(code)}`;
 const issue=async()=>{setBusy(true);setError('');try{setCode(unwrap(await supabase.rpc('create_pairing_code',{cid:camera.id})) as string);}catch(e){setError(toError(e));}finally{setBusy(false);}};
 useEffect(()=>{void issue();},[camera.id]);
 return <div className="overlay" role="dialog" aria-modal="true"><div className="modal pair-modal"><header><div><span className="eyebrow">SECURE PHONE PAIRING</span><h2>{camera.name}</h2></div><button className="icon-btn" onClick={onClose}><X/></button></header>
 <p>Scan this one-time QR code using the assigned cameraman's phone. The code expires after 5 minutes.</p>
 {code&&<div className="qr-panel"><QRCodeSVG value={url} size={320} level="L" marginSize={4} bgColor="#FFFFFF" fgColor="#000000"/></div>}
 {error&&<div className="error">{error}</div>}
 <div className="pair-buttons"><ActionButton secondary disabled={!code} onClick={()=>void buttonCopy(url)}><Clipboard size={16}/> Copy link</ActionButton><ActionButton disabled={busy} onClick={()=>void issue()}><RefreshCw size={16}/> New code</ActionButton></div>
 <p className="muted small">If scanning fails, use Copy link and send it privately. The code expires after 5 minutes. Regenerate or revoke access if a phone is lost.</p></div></div>;
}

function OBSStatsPanel({production,clock}:{production:Production;clock:number}){
 const live=Boolean(production.obs_stats_at&&production.obs_connected&&clock-new Date(production.obs_stats_at).getTime()<17000);
 const d=production.obs_stats||{};
 const millis=(ms:number|undefined,active:boolean)=>{
   if(!live||!active)return '00:00:00';
   const delta=Math.max(0,Math.min(17000,clock-new Date(production.obs_stats_at!).getTime()));
   const seconds=Math.floor(((ms||0)+delta)/1000);
   const hours=Math.floor(seconds/3600);const mins=Math.floor(seconds%3600/60);const secs=seconds%60;
   return [hours,mins,secs].map(x=>String(x).padStart(2,'0')).join(':');
 };
 const metric=(label:string,value:string)=> <div className="obs-stat-tile" key={label}><small>{label}</small><strong>{live?value:'—'}</strong></div>;
 return <section className="obs-telemetry-panel">
   <div className="obs-telemetry-title"><div><span className="eyebrow">OBS LIVE TELEMETRY</span><h2>Streaming & performance</h2></div><span className={'obs-telemetry-fresh '+(live?'fresh':'stale')}><span/>{live?'Live OBS readings':'Waiting for updated Bridge'}</span></div>
   <div className="obs-time-grid"><div className={'obs-time-tile '+(live&&d.stream?.active?'is-live':'')}><span>LIVE STREAMING</span><strong>{millis(d.stream?.duration_ms,d.stream?.active===true)}</strong><small>{live&&d.stream?.active?'Streaming now':'Stream stopped'}</small></div>
     <div className={'obs-time-tile '+(live&&d.record?.active?'is-recording':'')}><span>RECORDING</span><strong>{millis(d.record?.duration_ms,d.record?.active===true)}</strong><small>{live&&d.record?.active?(d.record?.paused?'Paused':'Recording now'):'Recording stopped'}</small></div></div>
   <div className="obs-stat-grid">{metric('CPU',`${(d.cpu_pct||0).toFixed(1)}%`)}{metric('FPS',`${(d.fps||0).toFixed(1)}`)}{metric('Memory',`${Math.round(d.memory_mb||0)} MB`)}{metric('Render skipped',String(Math.round(d.render_skipped||0)))}{metric('Output skipped',String(Math.round(d.output_skipped||0)))}{metric('Free disk',`${(d.disk_gb||0).toFixed(1)} GB`)}{metric('OBS scenes / sources',String(production.obs_sources?.length||0))}</div>
   <p className="obs-telemetry-note">Metrics are read from OBS WebSocket on the connected streaming PC. The tally Bridge cannot start or stop a stream remotely.</p>
 </section>;
}

function Director({auth}:{auth:AuthInfo}){
 const location=useLocation();const [productions,setProductions]=useState<Production[]>([]);
 const [productionId,setProductionId]=useState(localStorage.getItem('tally-production')||'');
 const [cameras,setCameras]=useState<CameraRow[]>([]);const [events,setEvents]=useState<{id:number;state:string;created_at:string;camera_id:string}[]>([]);
 const [editor,setEditor]=useState<CameraRow|null|undefined>(undefined);const [pairing,setPairing]=useState<CameraRow|null>(null);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');const [clock,setClock]=useState(Date.now());
 const [showNav,setShowNav]=useState(false);const [busy,setBusy]=useState(false);
 const production=productions.find(p=>p.id===productionId);
 const refresh=useCallback(async()=>{
  if(!productionId)return;
  const [cs,ps,ev]=await Promise.all([
    supabase.from('cameras').select('*,tally_states(*),camera_mappings(*),camera_devices(*)').eq('production_id',productionId).order('number'),
    supabase.from('productions').select('*').eq('id',productionId).single(),
    supabase.from('tally_events').select('id,state,created_at,camera_id').eq('production_id',productionId).order('created_at',{ascending:false}).limit(30)
  ]);
  if(cs.error)throw cs.error;if(ps.error)throw ps.error;
  setCameras((cs.data||[]).map((c:any)=>({...c,tally_states:Array.isArray(c.tally_states)?c.tally_states[0]:c.tally_states,
   camera_mappings:c.camera_mappings||[],camera_devices:c.camera_devices||[]})) as CameraRow[]);
  setProductions(p=>p.map(x=>x.id===productionId?ps.data as Production:x));
  setEvents((ev.data||[]) as typeof events);
  setClock(Date.now());
 },[productionId]);
 const loadProductions=useCallback(async()=>{
  const result=await supabase.from('productions').select('*').order('created_at',{ascending:false});
  if(result.error)throw result.error;
  const rows=result.data as Production[];setProductions(rows);
  if(!rows.some(p=>p.id===productionId))setProductionId(rows[0]?.id||'');
 },[productionId]);
 useEffect(()=>{void loadProductions().catch(e=>setError(toError(e)));},[auth.user.id]);
 useEffect(()=>{localStorage.setItem('tally-production',productionId);if(!productionId)return;
  let alive=true;let request:ReturnType<typeof setTimeout>|null=null;
  const debounce=()=>{if(request)clearTimeout(request);request=setTimeout(()=>{if(alive)void refresh().catch(e=>setError(toError(e)));},75);};
  void supabase.auth.getSession().then(({data})=>{if(data.session)supabase.realtime.setAuth(data.session.access_token);});
  const ch=supabase.channel(`production:${productionId}`,{config:{private:true}})
    .on('broadcast',{event:'tally'},debounce)
    .subscribe(status=>{if(status==='SUBSCRIBED')debounce();else if(status==='CHANNEL_ERROR')setError('Realtime channel authorization or network failed');});
  debounce();
  const timer=setInterval(()=>{setClock(Date.now());void refresh().catch(e=>setError(toError(e)));},15_000);
  return()=>{alive=false;if(request)clearTimeout(request);clearInterval(timer);void supabase.removeChannel(ch);};
 },[productionId,refresh]);
 async function call(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();await refresh();}catch(e){setError(toError(e));}finally{setBusy(false);}}
 const good=Boolean(production&&freshness(production.last_bridge_at,production.obs_connected,clock));
 const effective=(c:CameraRow)=>good?(c.tally_states?.state||'OFFLINE'):'OFFLINE';
 useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(id);},[]);
 const live=cameras.filter(c=>effective(c)==='PROGRAM').length;
 const preview=cameras.filter(c=>effective(c)==='PREVIEW').length;
 const page=location.pathname.split('/')[1]||'dashboard';
 useEffect(()=>{const match=/^\/cameras\/([0-9a-f-]{36})$/i.exec(location.pathname);
  if(match&&cameras.length){const camera=cameras.find(c=>c.id===match[1]);if(camera)setEditor(camera);}
 },[location.pathname,cameras.length]);
 const heading=page==='dashboard'?'Production overview':navItems.find(x=>x[0]==='/'+page)?.[1]||'Camera configuration';
 const activeDevices=cameras.flatMap(c=>c.camera_devices.filter(d=>!d.revoked_at&&d.last_seen_at&&clock-new Date(d.last_seen_at).getTime()<90_000)).length;
 return <div className="app-shell">
 <aside className={`sidebar ${showNav?'open':''}`}><Link to="/dashboard" className="brand" onClick={()=>setShowNav(false)}><img className="bumbi-header-logo" src={bumbiLogo} alt="BUMBI Software Solutions"/><span>OBS <strong>TALLY PRO</strong><small>PRODUCTION CONTROL</small></span></Link>
 <div className="sidebar-label">WORKSPACE</div><nav>{navItems.map(([href,label,Icon])=><NavLink key={href} to={href} onClick={()=>setShowNav(false)} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={18}/>{label}</NavLink>)}</nav>
 <div className="sidebar-bottom"><div className={`bridge-health ${good?'online':'offline'}`}><span className="pulse"/> {good?'LIVE OBS SYNCHRONIZED':'SIGNAL UNAVAILABLE'}
 <small>{production?.last_bridge_at?'Bridge seen '+relativeTime(production.last_bridge_at):'Awaiting OBS Bridge'}</small></div>
 <button className="nav-item signout" onClick={()=>void supabase.auth.signOut()}><LogOut size={17}/> Sign out</button></div>
 </aside><main className="workspace"><header className="topbar"><button className="icon-btn mobile-nav" onClick={()=>setShowNav(!showNav)}><Menu/></button>
 <div><div className="eyebrow">BROADCAST OPERATIONS CENTER</div><h1>{heading}<span className="accent">.</span></h1></div>
 <div className="top-controls"><select aria-label="Production" value={productionId} onChange={e=>setProductionId(e.target.value)}>{productions.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
 <span className={`head-health ${good?'online':'offline'}`}><span/>{good?'OBS CONNECTED':'OBS OFFLINE'}</span>
 <Link className="icon-btn header-link" title="OBS dock" to="/dock"><Monitor size={19}/></Link></div></header>
 {error&&<div className="error banner"><AlertTriangle size={18}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
 {notice&&<div className="notice banner"><Check size={16}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
 {!production&&page!=='productions'&&<div className="empty big"><Cloud size={38}/><h2>No production selected</h2><p>Create your first production before adding cameras.</p><Link className="btn" to="/productions">Create production</Link></div>}
 {production&&page==='dashboard'&&<>
 <section className="hero-panel"><div><span className="eyebrow"><span className="live-dot"/> LIVE PRODUCTION WORKSPACE</span><h2>{production.name}</h2><p>Authoritative camera tally signals delivered from OBS through the secured cloud bridge.</p></div>
 <div className="hero-feed"><div><small>PROGRAM SCENE</small><strong>{good?production.program_scene||'None':'Unavailable'}</strong></div><div><small>PREVIEW SCENE</small><strong>{good?(production.studio_mode?production.preview_scene||'None':'Studio Mode OFF'):'Unavailable'}</strong></div></div></section>
 <div className="metrics"><div className="metric"><span>TOTAL CAMERAS</span><strong>{cameras.length.toString().padStart(2,'0')}</strong><Camera size={22}/></div>
 <div className="metric red"><span>ON PROGRAM</span><strong>{live.toString().padStart(2,'0')}</strong><Radio size={22}/></div>
 <div className="metric green"><span>ON PREVIEW</span><strong>{preview.toString().padStart(2,'0')}</strong><Eye size={22}/></div>
 <div className="metric blue"><span>ONLINE DEVICES</span><strong>{activeDevices.toString().padStart(2,'0')}</strong><Smartphone size={22}/></div></div>
 <OBSStatsPanel production={production} clock={clock}/>
 <HealthPanel stats={production.obs_stats as Record<string,unknown>|undefined} connected={good}/>
 <div className="section-heading"><div><span className="eyebrow">REALTIME TALLY MONITORING</span><h2>Camera lineup <span className="muted">({cameras.length})</span></h2></div><div className="heading-actions"><ActionButton secondary onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</ActionButton><ActionButton onClick={()=>setEditor(null)}><Plus size={17}/> Camera</ActionButton></div></div>
 <div className="camera-grid">{cameras.map(c=><CameraCard key={c.id} camera={c} production={production} onPair={setPairing} onEdit={setEditor}/>)}</div>
 {!cameras.length&&<div className="empty"><Camera/><h3>No cameras configured</h3><p>Add a camera, then map it to an OBS scene or source.</p></div>}
 <div className="section-heading"><h2>Recent activity</h2><Link className="text-link" to="/events">See all events <ArrowRight size={15}/></Link></div>
 <EventList events={events} cameras={cameras}/>
 </>}
 {production&&page==='cameras'&&<><div className="section-heading"><p>Manage camera identities, operator names, and securely paired phones.</p><ActionButton onClick={()=>setEditor(null)}><Plus size={17}/> Add camera</ActionButton></div>
 <div className="table-frame"><table><thead><tr><th>CAMERA</th><th>CAMERAMAN</th><th>MAPPINGS</th><th>TALLY</th><th>DEVICES</th><th>ACTIONS</th></tr></thead>
 <tbody>{cameras.map(c=><tr key={c.id}><td><strong>{String(c.number).padStart(2,'0')} · {c.name}</strong></td><td>{c.cameraman||'Unassigned'}</td>
 <td>{c.camera_mappings.length}</td><td><StateBadge state={effective(c)}/></td><td>{c.camera_devices.filter(d=>!d.revoked_at).length}</td>
 <td className="actions-cell"><button onClick={()=>setPairing(c)}><Link2 size={15}/> Pair</button><button onClick={()=>setEditor(c)}><Cog size={15}/> Edit</button>
 <button className="danger" onClick={()=>{if(window.confirm(`Delete ${c.name} and all paired access?`))void call(async()=>{const r=await supabase.from('cameras').delete().eq('id',c.id);if(r.error)throw r.error;});}}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div></>}
 {production&&page==='mapping'&&<><div className="subtext">Choose an OBS scene or source in the camera editor. Sources are detected by the connected Windows Bridge. Program has priority over Preview.</div>
 <div className="mapping-list">{cameras.map(c=><div className="mapping-card" key={c.id}><div><span className="cam-number">CAM {String(c.number).padStart(2,'0')}</span><h3>{c.name}</h3><p>{c.camera_mappings.length} mapping rules</p></div>
 <div className="mapping-tags">{c.camera_mappings.map(m=><span key={m.id} className={m.excluded?'excluded':''}>{m.excluded?'− ':'+ '}{m.kind} · {m.obs_name}</span>)}{!c.camera_mappings.length&&<span>Unmapped</span>}</div>
 <ActionButton secondary onClick={()=>setEditor(c)}><Cog size={16}/> Configure</ActionButton></div>)}</div></>}
 {page==='productions'&&<Productions auth={auth} productions={productions} onCreate={async name=>{await call(async()=>{
  const r=await supabase.from('productions').insert({name,created_by:auth.user.id}).select('*').single();const saved=unwrap(r) as Production;
  setProductions(old=>[saved,...old]);setProductionId(saved.id);
 });}} onChoose={setProductionId}/>}
 {production&&page==='devices'&&<><div className="subtext">Paired phones are camera-scoped. Revocation immediately rotates the camera broadcast channel.</div>
 <div className="table-frame"><table><thead><tr><th>CAMERA</th><th>DEVICE</th><th>PAIRED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
 {cameras.flatMap(c=>c.camera_devices.map(d=><tr key={d.id}><td>{c.name}</td><td>{d.device_name||'Phone'}</td><td>Registered</td>
 <td>{d.revoked_at?'Revoked':d.last_seen_at&&clock-new Date(d.last_seen_at).getTime()<90_000?'Online':'Not connected'}</td><td>{!d.revoked_at&&<button className="danger" onClick={()=>{if(window.confirm('Revoke this cameraman phone?'))void call(async()=>{const r=await supabase.from('camera_devices').update({revoked_at:new Date().toISOString()}).eq('id',d.id);if(r.error)throw r.error;});}}>Revoke phone</button>}</td></tr>))}</tbody></table></div></>}
 {production&&page==='events'&&<EventList events={events} cameras={cameras}/>}
 {production&&page==='diagnostics'&&<><div className="diagnostics-grid"><Diagnostic title="OBS WebSocket" value={good?'CONNECTED':'DISCONNECTED'} note="Authenticated OBS Bridge status"/><Diagnostic title="Cloud last heartbeat" value={relativeTime(production.last_bridge_at)} note="Stale after 30 seconds"/>
 <Diagnostic title="Last accepted sequence" value={String(production.last_sequence)} note="Monotonic state ordering"/><Diagnostic title="OBS Studio Mode" value={production.studio_mode?'ENABLED':'DISABLED'} note="Preview requires Studio Mode"/>
 <Diagnostic title="OBS streaming" value={good?(production.streaming?'ACTIVE':'STOPPED'):'UNKNOWN'} note="Independent of Program selection"/><Diagnostic title="OBS recording" value={good?(production.recording?'ACTIVE':'STOPPED'):'UNKNOWN'} note="Independent of Program selection"/></div>
 <OBSStatsPanel production={production} clock={clock}/>
 <div className="section-heading"><h2>Production data</h2></div><p className="subtext">Streaming indicators are informational. A camera can be on Program even when streaming is stopped.</p></>}
 {production&&page==='crew'&&<CrewPanel productionId={production.id} director initialTab="messages" hideMultiview cameraChoices={cameras.map(c=>({id:c.id,number:c.number,name:c.name}))}/>}
  {production&&page==='settings'&&<SettingsPage auth={auth} production={production} showNotice={setNotice}/>}
 {page==='help'&&<HelpPage/>}
 <footer className="app-footer"><span>OBS TALLY PRO © 2026</span><BrandCredit/></footer>
 </main>{production&&editor!==undefined&&<CameraEditor camera={editor} production={production} usedNumbers={cameras.map(c=>c.number)} onClose={()=>setEditor(undefined)} onSaved={()=>void refresh()} onRefresh={()=>void refresh()}/>}
 {pairing&&<PairDialog camera={pairing} onClose={()=>setPairing(null)}/>}</div>;
}
function Diagnostic({title,value,note}:{title:string;value:string;note:string}){return <div className="diagnostic"><span>{title}</span><strong>{value}</strong><small>{note}</small></div>;}
function EventList({events,cameras}:{events:{id:number;state:string;created_at:string;camera_id:string}[];cameras:CameraRow[]}){
 return <div className="event-list">{events.map(e=><div className="event-row" key={e.id}><span className={`event-light ${stateClass(e.state)}`}/><div><strong>{cameras.find(c=>c.id===e.camera_id)?.name||'Camera'} entered {e.state}</strong><small>{new Date(e.created_at).toLocaleString()}</small></div><StateBadge state={e.state}/></div>)}
 {!events.length&&<div className="empty-small">No tally changes yet</div>}</div>;
}
function Productions({auth,productions,onCreate,onChoose}:{auth:AuthInfo;productions:Production[];onCreate:(name:string)=>Promise<void>;onChoose:(id:string)=>void}){
 const [name,setName]=useState('');const [error,setError]=useState('');
 return <><p className="subtext">Each production has isolated camera mappings, authorizations, and tally states.</p>
 {auth.role==='administrator'&&<form className="create-form" onSubmit={e=>{e.preventDefault();setError('');void onCreate(name.trim()).then(()=>setName('')).catch(e=>setError(toError(e)));}}>
 <input value={name} onChange={e=>setName(e.target.value)} placeholder="New production name" required minLength={2}/><button className="btn" type="submit"><Plus size={16}/> Create production</button></form>}
 {error&&<div className="error">{error}</div>}
 <div className="production-list">{productions.map(p=><button key={p.id} className="production-tile" onClick={()=>onChoose(p.id)}><Radio/><strong>{p.name}</strong><span>{p.obs_connected?'OBS linked':'Awaiting OBS Bridge'}</span><ArrowRight size={18}/></button>)}</div>
 </>;
}
function SettingsPage({auth,production,showNotice}:{auth:AuthInfo;production:Production;showNotice:(v:string)=>void}){
 const [code,setCode]=useState('');const [error,setError]=useState('');
 const [directorEmail,setDirectorEmail]=useState('');const [directorAssigned,setDirectorAssigned]=useState('');
 const assignDirector=async()=>{setError('');setDirectorAssigned('');const result=await supabase.rpc('assign_production_director_31',{pid:production.id,director_email:directorEmail.trim()});
 if(result.error){setError(result.error.message);return;}setDirectorAssigned('Existing director account assigned to this production.');showNotice('Director access granted');setDirectorEmail('');};
 return <><div className="settings-panels"><section className="settings-panel"><div className="setting-icon"><Cloud/></div><h2>Local OBS Bridge registration</h2><p>Generate a 10-minute registration code for the Windows OBS computer. The bridge exchanges it for a private credential stored only on that PC.</p>
 <button className="btn" onClick={()=>void supabase.rpc('create_bridge_registration',{pid:production.id}).then(r=>{try{setCode(unwrap(r) as string);setError('');}catch(e){setError(toError(e));}})}><Lock size={16}/> Generate bridge code</button>
 {code&&<div className="copy-code"><code>{code}</code><button className="icon-btn" onClick={()=>void buttonCopy(code)}><Clipboard/></button></div>}
 {error&&<div className="error">{error}</div>}
 <p className="muted small">Replacing the registered bridge revokes the previous bridge and marks all cameras unavailable until a new snapshot arrives.</p></section>
 <section className="settings-panel"><div className="setting-icon"><Shield/></div><h2>Access & account security</h2><p>Signed in as {auth.user.email||'Anonymous user'}</p><div className="detail-line"><span>Role</span><strong>{auth.role.toUpperCase()}</strong></div><div className="detail-line"><span>Production ID</span><code>{production.id}</code></div>
 <p className="muted small">Camera links never contain the OBS password, Supabase secret key, or the bridge token.</p></section>
 {auth.role==='administrator'&&<section className="settings-panel"><div className="setting-icon"><Shield/></div><h2>Director accounts and production access</h2>
 <p>Director users must first be created in Supabase Authentication and assigned the director profile role. Then grant access to this production without changing the administrator account.</p>
 <label>Existing director email<input type="email" value={directorEmail} onChange={e=>setDirectorEmail(e.target.value)} placeholder="director@example.com"/></label>
 <button className="btn" onClick={()=>void assignDirector()} disabled={!directorEmail.trim()}>Assign verified director</button>
 {directorAssigned&&<p className="notice">{directorAssigned}</p>}
 <p><Link to="/director/login">Open separate Director Control Panel</Link></p></section>}
 <section className="settings-panel"><div className="setting-icon"><Monitor/></div><h2>OBS Custom Browser Dock</h2><p>The dock is read-only. Scene switching remains in OBS Studio, eliminating accidental remote cuts.</p><Link className="btn secondary" to="/dock"><Monitor size={16}/> Open dock</Link></section>
 </div></>;
}
function HelpPage(){return <div className="help-layout"><div className="settings-panel"><span className="eyebrow">FIRST-TIME SETUP</span><h2>From installation to ON AIR</h2>
 <ol><li>Create a Supabase project and enable Anonymous Sign-ins for phone pairing.</li><li>Apply the SQL migration and promote your first account to administrator.</li><li>Deploy the secure Bridge Edge Function.</li><li>Set GitHub Actions Pages deployment and the public Vite Supabase configuration.</li><li>Create a production, add cameras, and map each OBS scene or source.</li><li>Generate a Bridge registration code and run the local Bridge on the OBS PC.</li><li>Pair each cameraman's phone with a one-time QR code.</li><li>Enable Studio Mode in OBS to test Program and Preview independently.</li></ol></div>
 <div className="settings-panel"><h2>Critical production considerations</h2><p>GitHub Pages hosts only static browser files. The local OBS Bridge must run for actual live synchronization. Supabase Free can pause or impose quotas, and internet latency is not guaranteed.</p><p>Keep phones in the foreground, enable screen wake lock where supported, and always test on-site before a live event.</p></div></div>;
}
function PairPage(){
 const navigate=useNavigate();const location=useLocation();const code=new URLSearchParams(location.search).get('code')||'';
 const [name,setName]=useState('Camera phone');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function pair(){setBusy(true);setMessage('');try{
  let {data:{session}}=await supabase.auth.getSession();
  if(session&&!session.user.is_anonymous)throw new Error('Open this pairing link in a private browser window or another phone, not your director session.');
  if(!session){const res=await supabase.auth.signInAnonymously();if(res.error)throw res.error;session=res.data.session;}
  if(!session)throw new Error('Anonymous authentication failed. Enable Anonymous Sign-ins in Supabase.');
  const cid=unwrap(await supabase.rpc('claim_pairing_code',{code,device_name:name})) as string;
  navigate(`/tally/${cid}`,{replace:true});
 }catch(e){setMessage(toError(e));}finally{setBusy(false);}}
 return <div className="auth-layout"><div className="auth-card pairing-page"><div className="brand brand-large"><img className="bumbi-header-logo" src={bumbiLogo} alt="BUMBI Software Solutions"/><span>OBS <strong>TALLY PRO</strong><small>CAMERA DEVICE PAIRING</small></span></div>
 <span className="eyebrow">CAMERAMAN ACCESS</span><h1>Pair your camera.</h1><p>Accept your director's one-time invitation to turn this phone into a secure wireless tally light.</p>
 <label>Device name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label>
 <button className="btn full" disabled={!code||busy} onClick={()=>void pair()}><Smartphone size={18}/>{busy?'Pairing securely…':'Pair this phone'}</button>
 {!code&&<div className="error">Pairing code is missing. Scan the QR code given by your director.</div>}
 {message&&<div className="error">{message}</div>}
 <p className="auth-foot">Each device receives only its authorized camera's tally state.</p><BrandCredit/></div></div>;
}
function playBeep(freq:number,duration:number){
 try{const AudioCtor=window.AudioContext;const ctx=new AudioCtor();const oscillator=ctx.createOscillator();
  const gain=ctx.createGain();oscillator.frequency.value=freq;oscillator.type='sine';
  gain.gain.setValueAtTime(.065,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
  oscillator.connect(gain).connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+duration);
  oscillator.onended=()=>void ctx.close();
 }catch{/* permission not granted */}
}
function TallyPage(){
 const {cameraId}=useParams();const [snapshot,setSnapshot]=useState<CameraSnapshot|null>(null);
 const [transport,setTransport]=useState(false);const [reconnecting,setReconnecting]=useState(false);
 const [error,setError]=useState('');const [clock,setClock]=useState(Date.now());
 const [settings,setSettings]=useState(false);const [sound,setSound]=useState(localStorage.getItem('tally-sound')==='yes');
 const [vibration,setVibration]=useState(localStorage.getItem('tally-vibration')==='yes');
 const [wake,setWake]=useState(false);const [crewOpen,setCrewOpen]=useState(false);const [crewProductionId,setCrewProductionId]=useState('');const lastState=useRef('');
 const wakeRef=useRef<{release:()=>Promise<void>}|null>(null);
 useEffect(()=>{let alive=true;if(cameraId)void supabase.rpc('production_for_paired_camera',{cid:cameraId}).then(r=>{if(alive&& !r.error&&typeof r.data==='string')setCrewProductionId(r.data);});return()=>{alive=false;};},[cameraId]);
 const ready=Boolean(snapshot&&transport&&navigator.onLine&&freshness(snapshot.last_bridge_at,snapshot.obs_connected,clock));
 const state=ready?(snapshot!.enabled?snapshot!.state:'IDLE'):(reconnecting&&navigator.onLine?'RECONNECTING':'OFFLINE');
 const refresh=useCallback(async()=>{
  if(!cameraId)return null;
  const res=await supabase.rpc('camera_snapshot',{cid:cameraId});
  if(res.error||!res.data){setSnapshot(null);setError(res.error?.message||'Camera authorization was revoked');return null;}
  const next=res.data as CameraSnapshot;
  setSnapshot(prev=>!prev||next.version>=prev.version?next:prev);
  setError('');return next;
 },[cameraId]);
 useEffect(()=>{
  let alive=true;let channel:ReturnType<typeof supabase.channel>|null=null;
  setTransport(false);setSnapshot(null);setReconnecting(true);
  async function connect(){
   const {data:{session}}=await supabase.auth.getSession();
   if(!session){setError('Phone not paired. Scan the director QR code.');setReconnecting(false);return;}
   supabase.realtime.setAuth(session.access_token);
   const first=await refresh();if(!alive||!first)return;
   channel=supabase.channel(`camera:${cameraId}:${first.channel_nonce}`,{config:{private:true}})
    .on('broadcast',{event:'tally'},()=>{void refresh();})
    .subscribe(status=>{
     if(!alive)return;
     if(status==='SUBSCRIBED'){setTransport(true);setReconnecting(false);void refresh();}
     if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
      setTransport(false);setReconnecting(true);
     }
    });
  }
  void connect().catch(e=>{if(alive)setError(toError(e));});
  const ping=async()=>{if(!cameraId||!navigator.onLine)return;
   try{await supabase.rpc('camera_device_ping',{cid:cameraId});}catch{/* status refresh handles authorization */}
  };
  void ping();
  const tick=setInterval(()=>setClock(Date.now()),1000);
  const check=setInterval(()=>{if(navigator.onLine)void refresh().catch(e=>setError(toError(e)));},15_000);
  const pingTimer=setInterval(()=>{void ping();},30_000);
  const offline=()=>{setClock(Date.now());setTransport(false);setReconnecting(false);};
  const visible=()=>{setClock(Date.now());if(document.visibilityState==='visible'&&navigator.onLine)void refresh().catch(e=>setError(toError(e)));};
  window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;clearInterval(tick);clearInterval(check);clearInterval(pingTimer);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible);if(channel)void supabase.removeChannel(channel);};
 },[cameraId,refresh]);
 useEffect(()=>{if(lastState.current&&lastState.current!==state){
  if(state==='PROGRAM'){if(sound)playBeep(850,.18);if(vibration)navigator.vibrate?.([160,70,160]);}
  else if(state==='PREVIEW'){if(sound)playBeep(570,.12);if(vibration)navigator.vibrate?.(95);}
 }lastState.current=state;},[state,sound,vibration]);
 const wakeScreen=async()=>{
  try{
   if('wakeLock' in navigator){const lock=await (navigator as any).wakeLock.request('screen');wakeRef.current=lock;lock.addEventListener?.('release',()=>{wakeRef.current=null;});setWake(true);}
   else setError('Wake lock is unavailable in this browser. Adjust your phone screen timeout.');
  }catch{setError('Wake lock permission was denied. Keep the page visible and check your display settings.');}
 };
 useEffect(()=>{
  const visible=()=>{if(document.visibilityState==='visible'&&wake&&!wakeRef.current)void wakeScreen();};
  document.addEventListener('visibilitychange',visible);return()=>document.removeEventListener('visibilitychange',visible);
 },[wake]);
 const fullscreen=async()=>{try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else setError('Use Add to Home Screen for an app-like fullscreen display on iPhone.');}catch{setError('Fullscreen permission denied.');}};
 const screen=state==='PROGRAM'?'ON AIR':state==='PREVIEW'?'STANDBY':state==='IDLE'?'IDLE':state==='RECONNECTING'?'RECONNECTING':'SIGNAL UNAVAILABLE';
 return <div className={`tally-screen ${stateClass(state)}`}>
 <div className="tally-top"><span className="tally-brand"><img className="bumbi-tally-logo" src={bumbiLogo} alt="BUMBI Software Solutions"/> OBS TALLY PRO</span><button className="crew-crew-open" onClick={()=>setCrewOpen(true)}>CREW MESSAGES</button><button aria-label="Camera settings" className="tally-settings" onClick={()=>setSettings(!settings)}><Settings size={23}/></button></div>
 <div className="tally-center"><div className="tally-ring"><span/></div><div className="tally-headline">{screen}</div>
 <div className="tally-camera">{snapshot?`CAM ${String(snapshot.number).padStart(2,'0')}`:'CAMERA'}</div>
 <div className="tally-state-label">{state==='PROGRAM'?'PROGRAM':state==='PREVIEW'?'PREVIEW':state==='IDLE'?snapshot?.name||'NOT SELECTED':state==='RECONNECTING'?'CONNECTION INTERRUPTED':'OBS CONNECTION LOST'}</div>
 {state==='OFFLINE'&&<p className="tally-warning">{error||'Live status is not confirmed. Check connection or pairing.'}</p>}
 </div>{crewProductionId&&cameraId&&<div className="tally-v31-media"><ProgramFeed31 client={supabase} productionId={crewProductionId} compact/></div>}<div className="tally-bottom"><span><span className="status-orb"/> {state==='OFFLINE'?'NO TRUSTED SIGNAL':state==='RECONNECTING'?'RECONNECTING':`${snapshot?.production_name||'Production'} · SYNCED`}</span><span>{new Date(clock).toLocaleTimeString()}</span></div><div className="tally-brand-credit"><img src={bumbiLogo} alt="BUMBI"/> Developed by BUMBI Software Solutions</div>
 {crewProductionId&&cameraId&&<TallyMessages31 client={supabase} productionId={crewProductionId} cameraId={cameraId}/>}
  {settings&&<div className="mobile-settings"><div className="mobile-settings-head"><strong>Camera controls</strong><button className="icon-btn" onClick={()=>setSettings(false)}><X/></button></div>
 <button onClick={()=>void fullscreen()}><Maximize size={18}/> Enter fullscreen</button>
 <button onClick={()=>void wakeScreen()}><Power size={18}/> Keep screen awake {wake?'✓':''}</button>
 <button onClick={()=>{setSound(!sound);localStorage.setItem('tally-sound',!sound?'yes':'no');playBeep(850,.1);}}>{sound?<Volume2 size={18}/>:<VolumeX size={18}/>} Sound {sound?'ON':'OFF'}</button>
 <button onClick={()=>{setVibration(!vibration);localStorage.setItem('tally-vibration',!vibration?'yes':'no');navigator.vibrate?.(100);}}><Smartphone size={18}/> Vibration {vibration?'ON':'OFF'}</button>
 <button onClick={()=>void refresh()}><RefreshCw size={18}/> Refresh trusted state</button>
 {error&&<p className="error small">{error}</p>}
 <p>Foreground use is recommended. Browser vibration, fullscreen, and wake lock support varies by device.</p></div>}
 {crewOpen&&crewProductionId&&<div className="crew-mobile-view"><div className="crew-own-status"><strong>CAM {snapshot?.number} · {screen}</strong><span>Your personal tally remains visible</span><button onClick={()=>setCrewOpen(false)}>Return to tally</button></div><CrewPanel productionId={crewProductionId} director={false} ownCameraId={cameraId} initialTab="messages" hideMultiview/></div>}
 </div>;
}
function Dock(){
 const {auth,loading}=useIdentity();
 const [production,setProduction]=useState<Production|null>(null);const [cameras,setCameras]=useState<CameraRow[]>([]);
 const [productionId,setProductionId]=useState(localStorage.getItem('tally-dock-production')||'');
 const [options,setOptions]=useState<Production[]>([]);
 const [compact,setCompact]=useState(localStorage.getItem('dock-compact')!=='no');const [error,setError]=useState('');const [clock,setClock]=useState(Date.now());
 const fetchDock=useCallback(async()=>{
  const {data:all,error:pe}=await supabase.from('productions').select('*').order('created_at',{ascending:false});
  if(pe)throw pe;const rows=(all||[]) as Production[];setOptions(rows);
  const p=rows.find(v=>v.id===productionId)||rows[0];
  if(!p){setProduction(null);return;}
  const {data, error}=await supabase.from('cameras').select('*,tally_states(*)').eq('production_id',p.id).order('number');
  if(error)throw error;
  setClock(Date.now());setProduction(p as Production);setCameras((data||[]).map((c:any)=>({...c,tally_states:Array.isArray(c.tally_states)?c.tally_states[0]:c.tally_states,camera_mappings:[],camera_devices:[]})) as CameraRow[]);
 },[productionId]);
 useEffect(()=>{
  if(!auth||!['director','administrator'].includes(auth.role))return;
  let ch:ReturnType<typeof supabase.channel>|null=null;
  const id=setInterval(()=>{setClock(Date.now());void fetchDock().catch(e=>setError(toError(e)));},15_000);
  void fetchDock().then(async()=>{
   const {data:rows}=await supabase.from('productions').select('id').order('created_at',{ascending:false});
   const p=rows?.find(v=>v.id===productionId)||rows?.[0];
   const {data:{session}}=await supabase.auth.getSession();if(session)supabase.realtime.setAuth(session.access_token);
   if(p){ch=supabase.channel(`production:${p.id}`,{config:{private:true}}).on('broadcast',{event:'tally'},()=>void fetchDock()).subscribe();}
  }).catch(e=>setError(toError(e)));
  return()=>{clearInterval(id);if(ch)void supabase.removeChannel(ch);};
 },[auth?.user.id,fetchDock,productionId]);
 if(loading)return <div className="loading">Loading</div>;
 if(!auth||!['director','administrator'].includes(auth.role))return <Navigate to="/login"/>;
 const good=Boolean(production&&freshness(production.last_bridge_at,production.obs_connected,clock));
 return <div className={`dock-page ${compact?'compact':''}`}><div className="dock-bar"><strong><img className="bumbi-dock-logo" src={bumbiLogo} alt="BUMBI Software Solutions"/> OBS TALLY PRO</strong><span className={good?'good':'bad'}>{good?'● LIVE OBS':'● SIGNAL LOST'}</span><select aria-label="Dock production" value={production?.id||''} onChange={e=>{setProductionId(e.target.value);localStorage.setItem('tally-dock-production',e.target.value);}}>{options.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button onClick={()=>{setCompact(!compact);localStorage.setItem('dock-compact',compact?'no':'yes');}}>Density</button><Link to="/dashboard"><Cog size={18}/></Link></div>
 <div className="dock-scenes"><span>PGM <b>{good?production?.program_scene||'None':'Unavailable'}</b></span><span>PVW <b>{good?(production?.studio_mode?production?.preview_scene||'None':'Studio Mode off'):'Unavailable'}</b></span></div>
 {error&&<div className="error">{error}</div>}
 <div className="dock-grid">{cameras.map(c=>{const state=good?c.tally_states?.state||'OFFLINE':'OFFLINE';return <div className={`dock-tile ${stateClass(state)}`} key={c.id}><small>CAM {String(c.number).padStart(2,'0')}</small><strong>{c.name}</strong><b>{state==='PROGRAM'?'ON AIR':state==='PREVIEW'?'STANDBY':state}</b></div>;})}</div>
 <div className="dock-credit"><BrandCredit/></div></div>;
}

function CameraHome(){
 const [destination,setDestination]=useState<string|null>(null);
 useEffect(()=>{let active=true;
  void supabase.auth.getUser().then(async({data})=>{
   const id=data.user?.id;if(!id){if(active)setDestination('/pair');return;}
   const {data:device}=await supabase.from('camera_devices').select('camera_id').eq('user_id',id).is('revoked_at',null).maybeSingle();
   if(active)setDestination(device?.camera_id?`/tally/${device.camera_id}`:'/pair');
  }).catch(()=>{if(active)setDestination('/pair');});
  return()=>{active=false;};
 },[]);
 return destination?<Navigate to={destination} replace/>:<div className="loading">Checking camera pairing</div>;
}
export default function App(){const {auth,loading}=useIdentity();
 if(!configured)return <div className="auth-layout"><div className="auth-card"><h1>Supabase configuration required</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY and rebuild the frontend. No simulated live statuses are displayed.</p><BrandCredit/></div></div>;
 if(loading)return <div className="loading"><img className="bumbi-loading-logo" src={bumbiLogo} alt="BUMBI Software Solutions"/> OBS TALLY PRO <small>Authenticating</small></div>;
 return <Routes>
  <Route path="/login" element={auth&&['administrator','director'].includes(auth.role)?<Navigate to="/dashboard"/>:<Login/>}/>
  <Route path="/director/login" element={<DirectorPortal31/>}/>
  <Route path="/director" element={<DirectorPortal31/>}/>
  <Route path="/pair" element={<PairPage/>}/>
  <Route path="/tally/:cameraId" element={<TallyPage/>}/>
  <Route path="/dock" element={<Dock/>}/>
  <Route path="/*" element={auth&&['administrator','director'].includes(auth.role)?<Director auth={auth}/>:auth?<CameraHome/>:<Navigate to="/login"/>}/>
 </Routes>;
}
