import {readFileSync,writeFileSync,mkdirSync,renameSync,chmodSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
import type {CameraConfig,ObsSnapshot,TallyState} from '@tally/shared';
import {calculateTally} from '@tally/shared';

const savePath=process.env.BRIDGE_CONFIG_PATH||join(homedir(),'.obs-tally-pro','bridge-config.json');
type Saved={url:string;token:string;sequence:number;productionId:string};
export class CloudBridge {
 private saved!:Saved;
 private cameras:CameraConfig[]=[];
 private pending:{snapshot:ObsSnapshot;signature:string}|null=null;
 private lastAcceptedSignature="";
 private activeSignature="";
 private processing=false;
 private connected=false;
 private lastSnapshot:ObsSnapshot|null=null;
 constructor(private readonly url:string){}
 private async call(action:string,body:Record<string,unknown>,token?:string) {
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
   try{
    const res=await fetch(`${this.url.replace(/\/$/,'')}/functions/v1/bridge`,{
      method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
      body:JSON.stringify({action,...body}),signal:controller.signal
    });
    const json=await res.json() as Record<string,unknown>;
    if(!res.ok)throw new Error(`Cloud ${action} failed (${res.status}) ${String(json.error||'')}`);
    return json;
   }finally{clearTimeout(timer);}
 }
 private persist(){
   mkdirSync(dirname(savePath),{recursive:true,mode:0o700});
   const tmp=savePath+'.tmp';writeFileSync(tmp,JSON.stringify(this.saved,null,2),{mode:0o600});
   renameSync(tmp,savePath);
   try{chmodSync(savePath,0o600);}catch{/* Windows file permissions need OS protections */}
 }
 async initialize(){
   try{this.saved=JSON.parse(readFileSync(savePath,'utf8')) as Saved;}catch{
     const code=process.env.BRIDGE_REGISTRATION_CODE;
     if(!code)throw new Error('Bridge is not paired. Set BRIDGE_REGISTRATION_CODE from the director dashboard.');
     console.log('Registering the local bridge with the cloud');
     const data=await this.call('register',{code});
     this.saved={url:this.url,token:String(data.token),sequence:0,productionId:String(data.production_id)};
     this.persist();
   }
   if(this.saved.url!==this.url)throw new Error('Cloud URL does not match the paired bridge. Re-register this device.');
   await this.refreshConfig();
 }
 async refreshConfig(){
   const data=await this.call('config',{},this.saved.token);
   if(data.production_id!==this.saved.productionId)throw new Error('Cloud production identity changed');
   const newCameras=(data.cameras||[]) as CameraConfig[];
   const updated=JSON.stringify(newCameras)!==JSON.stringify(this.cameras);
   this.cameras=newCameras;
   if(updated&&this.lastSnapshot)this.publish(this.lastSnapshot,true);
   this.connected=true;
 }
 async heartbeat(){
   try{await this.call('heartbeat',{},this.saved.token);this.connected=true;}
   catch(e){this.connected=false;console.error('Cloud heartbeat',e instanceof Error?e.message:e);}
 }
 // Bridge-token protected, read-only OBS metrics sent separately from authoritative tally snapshots.
 async sendTelemetry(telemetry:Record<string,unknown>){
   try{await this.call('telemetry',{telemetry},this.saved.token);this.connected=true;}
   catch(e){console.warn('Cloud telemetry',e instanceof Error?e.message:'unavailable');}
 }
 getCameraCount(){return this.cameras.length;}
 async fetchCommands():Promise<{id:string;scene_name:string}[]>{
   const data=await this.call('commands',{},this.saved.token);
   return Array.isArray(data.commands)?data.commands as {id:string;scene_name:string}[]:[];
 }
 async commandResult(id:string,success:boolean,message:string){
   await this.call('command-result',{id,success,message:message.slice(0,200)},this.saved.token);
 }
 getCloudConnected(){return this.connected;}
 private signature(snapshot:ObsSnapshot){
   const states=this.cameras.map(c=>({id:c.id,state:calculateTally(c,snapshot)}));
   return JSON.stringify({connected:snapshot.connected,studio:snapshot.studioMode,
     program:snapshot.program,preview:snapshot.preview,stream:snapshot.streaming,record:snapshot.recording,states});
 }
 publish(snapshot:ObsSnapshot,force=false){
   this.lastSnapshot=snapshot;
   const signature=this.signature(snapshot);
   if(!force && ((!this.processing&&this.lastAcceptedSignature===signature)||this.pending?.signature===signature||
     (this.processing&&this.activeSignature===signature&&!this.pending)))return;
   this.pending={snapshot,signature};
   void this.drain();
 }
 private async drain(){
   if(this.processing)return;
   this.processing=true;
   try{
     let retry=1000;
     while(this.pending){
       const item=this.pending;this.pending=null;this.activeSignature=item.signature;
       const current=item.snapshot;
       const states=this.cameras.map(c=>({camera_id:c.id,state:calculateTally(c,current) as TallyState}));
       this.saved.sequence++;
       this.persist(); // Persist BEFORE publish; restart cannot replay an earlier sequence.
       try{
         await this.call('publish',{
           sequence:this.saved.sequence,obs_connected:current.connected,studio_mode:current.studioMode,
           program_scene:current.program,preview_scene:current.preview,
           streaming:current.streaming,recording:current.recording,states
         },this.saved.token);
         this.connected=true;retry=1000;this.lastAcceptedSignature=item.signature;
         console.log(`Published #${this.saved.sequence} ${current.program||'offline'} [${states.map(s=>s.state).join(',')}]`);
       }catch(e){
         this.connected=false;console.error('Cloud publish',e instanceof Error?e.message:e);
         this.pending=this.pending||item;
         await new Promise(resolve=>setTimeout(resolve,retry));
         retry=Math.min(20000,retry*2);
       }
     }
   }finally{this.processing=false;this.activeSignature='';}
 }
}
