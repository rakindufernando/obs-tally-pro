export type TallyState = 'PROGRAM'|'PREVIEW'|'IDLE'|'OFFLINE';
export type MappingRule = {kind:'SCENE'|'SOURCE';name:string;uuid?:string|null;excluded?:boolean};
export type CameraConfig = { id:string;number:number;name:string;enabled:boolean;mappings:MappingRule[] };
export type TreeItem = {name:string;uuid?:string|null;enabled:boolean;kind:'scene'|'group'|'source';children?:TreeItem[]};
export type ObsSnapshot = {connected:boolean;studioMode:boolean;program:string|null;preview:string|null;
 programUuid?:string|null;previewUuid?:string|null;scenes:Record<string,TreeItem[]>;sceneUuids:Record<string,string>;
 transitionFrom?:string|null;streaming:boolean;recording:boolean};
export function sceneContains(scene:string|null,s:ObsSnapshot,rules:MappingRule[]):boolean {
 if(!scene) return false;
 const matches=(rule:MappingRule,name:string,uuid:string|null|undefined,kind:'SCENE'|'SOURCE')=>
   rule.kind===kind && (rule.uuid ? rule.uuid===uuid : rule.name===name);
 const rootUuid=s.sceneUuids[scene];
 if(rules.some(r=>r.excluded && matches(r,scene,rootUuid,'SCENE')))return false;
 if(rules.some(r=>!r.excluded && matches(r,scene,rootUuid,'SCENE')))return true;
 const ancestors=new Set<string>();
 function walk(items:TreeItem[],level:number):boolean {
   if(level>24) return false;
   for(const item of items){
     if(!item.enabled)continue;
     const kind=item.kind==='source'?'SOURCE':'SCENE';
     if(rules.some(r=>r.excluded&&matches(r,item.name,item.uuid,kind)))continue;
     if(rules.some(r=>!r.excluded&&matches(r,item.name,item.uuid,kind)))return true;
     if(item.children && walk(item.children,level+1))return true;
     if(item.kind==='scene' && !ancestors.has(item.name)){
       ancestors.add(item.name);
       if(walk(s.scenes[item.name]||[],level+1))return true;
       ancestors.delete(item.name);
     }
   }
   return false;
 }
 ancestors.add(scene);return walk(s.scenes[scene]||[],0);
}
export function calculateTally(c:CameraConfig,s:ObsSnapshot):TallyState {
 if(!s.connected) return 'OFFLINE';
 if(!c.enabled) return 'IDLE';
 if(sceneContains(s.program,s,c.mappings)||sceneContains(s.transitionFrom||null,s,c.mappings))return 'PROGRAM';
 if(s.studioMode&&sceneContains(s.preview,s,c.mappings))return 'PREVIEW';
 return 'IDLE';
}
export function freshness(bridgeTime:string|null|undefined,obsConnected:boolean,now=Date.now(),timeoutMs=30_000):boolean {
 if(!obsConnected||!bridgeTime)return false;
 const age=now-new Date(bridgeTime).getTime();
 return Number.isFinite(age)&&age>=-5000&&age<=timeoutMs;
}
