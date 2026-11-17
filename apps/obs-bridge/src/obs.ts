import OBSWebSocket from 'obs-websocket-js';
import type {ObsSnapshot,TreeItem} from '@tally/shared';

// OBS response arrays contain generic JSON objects. Validate their fields before using
// scene names as Record keys; an arbitrary JsonValue is not a safe property key.
const asRecord=(value:unknown):Record<string,unknown>|null=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)
    ? value as Record<string,unknown> : null;
const readSceneName=(value:unknown,legacyKey:'currentProgramSceneName'|'currentPreviewSceneName'):string|null=>{
  const record=asRecord(value);
  const name=record?.sceneName ?? record?.[legacyKey];
  return typeof name==='string'&&name.length>0?name:null;
};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export class OBSConnector {
 private obs=new OBSWebSocket();
 private lastStreamSample:{bytes:number;at:number;duration:number}|null=null;
 private connected=false;
 private active=true;
 private reconnectAttempts=0;
 private pending=false;
 private structureDirty=true;
 private treeCache=new Map<string,TreeItem[]>();
 private processing=false;
 private transitionFrom:string|null=null;
 private lastProgram:string|null=null;
 private snapshot:ObsSnapshot={connected:false,studioMode:false,program:null,preview:null,scenes:{},sceneUuids:{},streaming:false,recording:false};
 private timer?:ReturnType<typeof setInterval>;
 constructor(private readonly url:string,private readonly password:string,private readonly onUpdate:(s:ObsSnapshot)=>void){
   const o=this.obs as unknown as {on:(event:string,fn:(data:any)=>void)=>void};
   o.on('ConnectionClosed',()=>this.onDisconnected());
   o.on('ConnectionError',()=>this.onDisconnected());
   const structuralEvents=new Set(['CurrentSceneCollectionChanged','SceneCreated','SceneRemoved','SceneNameChanged',
    'SceneItemCreated','SceneItemRemoved','SceneItemEnableStateChanged','SceneItemListReindexed','InputCreated','InputRemoved','InputNameChanged']);
   for(const event of [
     'CurrentProgramSceneChanged','CurrentPreviewSceneChanged','StudioModeStateChanged',
     'CurrentSceneCollectionChanged','SceneCreated','SceneRemoved','SceneNameChanged',
     'SceneItemCreated','SceneItemRemoved','SceneItemEnableStateChanged','SceneItemListReindexed',
     'InputCreated','InputRemoved','InputNameChanged','SceneTransitionEnded','StreamStateChanged','RecordStateChanged'
   ])o.on(event,()=>{
     if(event==='SceneTransitionEnded')this.transitionFrom=null;
     if(structuralEvents.has(event)){this.structureDirty=true;this.treeCache.clear();}
     this.requestSync();
   });
   o.on('SceneTransitionStarted',()=>{this.transitionFrom=this.lastProgram;this.requestSync();});
 }
 start(){
   void this.reconnectLoop();
   this.timer=setInterval(async()=>{
     if(!this.connected)return;
     try{await this.obs.call('GetVersion');}
     catch{this.onDisconnected();return;}
     // Periodic reconciliation handles any missed OBS notifications.
     this.requestSync();
   },20_000);
 }
 async screenshot(sourceName:string):Promise<string|null>{
   if(!this.connected||!sourceName||sourceName.length>150)return null;
   try{
     const response=await this.obs.call('GetSourceScreenshot',{sourceName,imageFormat:'jpg',imageWidth:512,imageCompressionQuality:38});
     const result=response.imageData;
     if(typeof result!=='string'||!/^data:image\/jpeg;base64,/.test(result)||result.length>195000)return null;
     return result.slice('data:image/jpeg;base64,'.length);
   }catch(e){console.warn('OBS preview unavailable',e instanceof Error?e.message:'unknown');return null;}
 }
 async switchScene(name:string):Promise<void>{
   if(!this.connected)throw new Error('OBS disconnected');
   if(!name||name.length>150||!this.snapshot.scenes[name])throw new Error('OBS scene not found');
   await this.obs.call('SetCurrentProgramScene',{sceneName:name});
   this.requestSync();
 }
 stop(){this.active=false;if(this.timer)clearInterval(this.timer);void this.obs.disconnect();}
 getSnapshot(){return this.snapshot;}
 private onDisconnected(){
   if(!this.connected)return;
   this.connected=false;this.transitionFrom=null;this.lastProgram=null;this.structureDirty=true;this.treeCache.clear();
   this.snapshot={connected:false,studioMode:false,program:null,preview:null,scenes:{},sceneUuids:{},streaming:false,recording:false};
   this.onUpdate(this.snapshot);
   console.warn('OBS connection lost; all tally cameras are now untrusted');
 }
 private async reconnectLoop(){
   while(this.active){
     if(this.connected){await wait(1000);continue;}
     try{
       await this.obs.connect(this.url,this.password||undefined,{rpcVersion:1});
       this.connected=true;this.reconnectAttempts=0;this.structureDirty=true;this.treeCache.clear();
       console.log('OBS WebSocket connected');
       await this.sync();
     }catch(e){
       this.onDisconnected();
       console.warn('OBS unavailable or authentication failed',e instanceof Error?e.message:'unknown');
       await wait(Math.min(30_000,1000*2**Math.min(5,this.reconnectAttempts++)));
     }
   }
 }
 private requestSync(){if(!this.connected)return;this.pending=true;if(!this.processing)void this.sync();}
 private async children(name:string,group:boolean,ancestors:Set<string>,depth:number):Promise<TreeItem[]> {
   const key=`${group?'group':'scene'}:${name}`;
   if(depth>20||ancestors.has(key))return [];
   if(!this.structureDirty&&this.treeCache.has(key))return this.treeCache.get(key)!;
   const next=new Set(ancestors);next.add(key);
   const response=group?await this.obs.call('GetGroupSceneItemList',{sceneName:name}):await this.obs.call('GetSceneItemList',{sceneName:name});
   const result:TreeItem[]=[];
   const itemRows:unknown[]=Array.isArray(response.sceneItems)?response.sceneItems:[];
   for(const row of itemRows){
     const item=asRecord(row);
     const sourceName=item?.sourceName;
     if(typeof sourceName!=='string'||sourceName.length===0)continue;
     const isGroup=item?.isGroup===true;
     const isScene=item?.sourceType==='OBS_SOURCE_TYPE_SCENE';
     const enabled=item?.sceneItemEnabled===true;
     const sourceUuid=typeof item?.sourceUuid==='string'?item.sourceUuid:undefined;
     let nested:TreeItem[]|undefined;
     if(enabled&&(isGroup||isScene)){
       try{nested=await this.children(sourceName,isGroup,next,depth+1);}catch{nested=[];}
     }
     result.push({name:sourceName,uuid:sourceUuid,enabled,
       kind:isGroup?'group':isScene?'scene':'source',children:nested});
   }
   this.treeCache.set(key,result);
   return result;
 }
 // Capture actual OBS statistics and an OBS-derived catalogue for guided camera setup.
 // This is read-only and never controls switching or exposes OBS credentials.
 async getTelemetry(){
   const snapshot=this.snapshot;
   const sourceMap=new Map<string,{kind:'SCENE'|'SOURCE';name:string;uuid:string|null}>();
   const put=(kind:'SCENE'|'SOURCE',name:string,uuid?:string|null)=>{
     if(!name||name.length>150)return;
     const key=kind+':'+(uuid||name);
     if(!sourceMap.has(key))sourceMap.set(key,{kind,name,uuid:uuid||null});
   };
   const seen=new Set<TreeItem[]>();
   function walk(items:TreeItem[],depth:number){
     if(depth>12||seen.has(items))return;
     seen.add(items);
     for(const item of items){put(item.kind==='source'?'SOURCE':'SCENE',item.name,item.uuid);
       if(item.children)walk(item.children,depth+1);
     }
   }
   for(const [name,items] of Object.entries(snapshot.scenes)){
     put('SCENE',name,snapshot.sceneUuids[name]);walk(items,0);
   }
   const stats:Record<string,number>={};
   const stream:Record<string,number|boolean>={active:false,duration_ms:0,bytes:0,bitrate_kbps:0,congestion:0,skipped_frames:0,total_frames:0};
   const record:Record<string,number|boolean>={active:false,duration_ms:0,bytes:0,paused:false};
   if(this.connected){
     const [st,ss,rs]=await Promise.allSettled([this.obs.call('GetStats'),this.obs.call('GetStreamStatus'),this.obs.call('GetRecordStatus')]);
     const num=(x:unknown):number=>typeof x==='number'&&Number.isFinite(x)?x:0;
     if(st.status==='fulfilled'){
       const d=asRecord(st.value);if(d){
         stats.cpu_pct=num(d.cpuUsage);stats.fps=num(d.activeFps);stats.memory_mb=num(d.memoryUsage);
         stats.disk_gb=num(d.availableDiskSpace)/1024;stats.render_ms=num(d.averageFrameRenderTime);
         stats.render_skipped=num(d.renderSkippedFrames);stats.render_total=num(d.renderTotalFrames);
         stats.output_skipped=num(d.outputSkippedFrames);stats.output_total=num(d.outputTotalFrames);
       }
     }
     if(ss.status==='fulfilled'){
       const d=asRecord(ss.value);if(d){
         stream.active=d.outputActive===true;stream.duration_ms=num(d.outputDuration);
         stream.bytes=num(d.outputBytes);stream.congestion=num(d.outputCongestion);
         stream.skipped_frames=num(d.outputSkippedFrames);stream.total_frames=num(d.outputTotalFrames);
         const stamp=Date.now(), bytes=num(d.outputBytes), duration=num(d.outputDuration);
         const prior=this.lastStreamSample;
         if(stream.active && prior && bytes>=prior.bytes && duration>=prior.duration && stamp>prior.at+1000){
           stream.bitrate_kbps=Math.max(0,Math.round(((bytes-prior.bytes)*8)/(stamp-prior.at)));
         }
         this.lastStreamSample=stream.active?{bytes,at:stamp,duration}:null;
       }
     }
     if(rs.status==='fulfilled'){
       const d=asRecord(rs.value);if(d){
         record.active=d.outputActive===true;record.duration_ms=num(d.outputDuration);
         record.bytes=num(d.outputBytes);record.paused=d.outputPaused===true;
       }
     }
   }
   if(!this.connected||stream.active!==true)this.lastStreamSample=null;
   return {observed_at:new Date().toISOString(),obs_connected:this.connected,studio_mode:snapshot.studioMode,
     program_scene:snapshot.program,preview_scene:snapshot.preview,streaming:stream.active,recording:record.active,
     source_count:sourceMap.size,scene_count:Object.keys(snapshot.scenes).length,
     sources:[...sourceMap.values()].slice(0,350),stats,stream,record};
 }
 private async safeStatus(request:'GetStreamStatus'|'GetRecordStatus',key:'outputActive'){
   try{return Boolean((await this.obs.call(request))[key]);}catch{return false;}
 }
 private async sync(){
   if(!this.connected)return;
   if(this.processing){this.pending=true;return;}
   this.processing=true;
   try{
     do{
       this.pending=false;
       const [list,mode,program]=await Promise.all([
         this.obs.call('GetSceneList'),this.obs.call('GetStudioModeEnabled'),this.obs.call('GetCurrentProgramScene')
       ]);
       const studioMode=Boolean(mode.studioModeEnabled);
       const preview=studioMode?await this.obs.call('GetCurrentPreviewScene'):null;
       const scenes:Record<string,TreeItem[]>={},sceneUuids:Record<string,string>={};
       // `list.scenes` is typed as generic JSON by obs-websocket-js.
       // Ignore malformed scene entries instead of indexing with non-string values.
       const sceneRows:unknown[]=Array.isArray(list.scenes)?list.scenes:[];
       for(const row of sceneRows){
         const sc=asRecord(row);
         const sceneName=sc?.sceneName;
         if(typeof sceneName!=='string'||sceneName.length===0)continue;
         if(typeof sc?.sceneUuid==='string')sceneUuids[sceneName]=sc.sceneUuid;
         try{scenes[sceneName]=await this.children(sceneName,false,new Set(),0);}
         catch{scenes[sceneName]=[];}
       }
       const [streaming,recording]=await Promise.all([this.safeStatus('GetStreamStatus','outputActive'),this.safeStatus('GetRecordStatus','outputActive')]);
       this.snapshot={connected:true,studioMode,program:readSceneName(program,'currentProgramSceneName'),preview:studioMode?readSceneName(preview,'currentPreviewSceneName'):null,
         sceneUuids,scenes,transitionFrom:this.transitionFrom,streaming,recording};
       this.lastProgram=this.snapshot.program;
       this.structureDirty=false;
       this.onUpdate(this.snapshot);
     }while(this.pending&&this.connected);
   }catch(e){
     console.warn('OBS synchronization failed, clearing trusted state',e instanceof Error?e.message:'unknown');
     this.onDisconnected();
     try{await this.obs.disconnect();}catch{/* disconnected */}
   }finally{this.processing=false;}
 }
}
