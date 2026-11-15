import 'dotenv/config';
import {CloudBridge} from './cloud.js';
import {OBSConnector} from './obs.js';

async function main(){
 const cloudUrl=process.env.SUPABASE_URL;
 if(!cloudUrl||!/^https:\/\//.test(cloudUrl))throw new Error('Set HTTPS SUPABASE_URL in the bridge environment');
 const cloud=new CloudBridge(cloudUrl);
 // When Windows starts before networking is ready, retry cloud initialization.
 // Invalid/revoked pairing credentials are not transient and must be fixed by the user.
 let startupAttempt=0;
 for(;;){
  try{await cloud.initialize();break;}
  catch(e){
   const message=e instanceof Error?e.message:String(e);
   if(/not paired|registration code|cloud url does not match|\b40[13]\b|unauthorized|not authorized|expired|used/i.test(message))throw e;
   const delay=Math.min(30000,2000*2**Math.min(startupAttempt++,4));
   console.warn(`Cloud startup connection unavailable: ${message}. Retrying in ${Math.round(delay/1000)}s`);
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }

 const obs=new OBSConnector(process.env.OBS_URL||'ws://127.0.0.1:4455',process.env.OBS_PASSWORD||'',s=>cloud.publish(s));
 obs.start();
 // Reconcile cloud camera mappings and connection health continuously.
 const configTimer=setInterval(async()=>{try{await cloud.refreshConfig();}catch(e){console.error('Bridge config sync',e instanceof Error?e.message:e);}},15000);
 const heartbeatTimer=setInterval(async()=>{await cloud.heartbeat();},10000);
 console.log(`OBS TALLY PRO bridge started. Cameras ${cloud.getCameraCount()}. No inbound ports opened.`);
 const stop=()=>{clearInterval(configTimer);clearInterval(heartbeatTimer);obs.stop();process.exit(0);};
 process.once('SIGINT',stop);
 process.once('SIGTERM',stop);
}
void main().catch(e=>{console.error('Bridge start failed:',e instanceof Error?e.message:e);process.exitCode=1;});
