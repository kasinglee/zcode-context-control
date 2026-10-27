import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
// Multiplex our RPCs without changing or consuming the desktop's request IDs.
export class ZcodeProtocol extends EventEmitter {
 constructor({send,forward,maxFrame=16*1024*1024,timeout=30000}){super();Object.assign(this,{send,forward,maxFrame,timeout});this.prefix='zcc:'+randomUUID()+':';this.pending=new Map();this.buffer=Buffer.alloc(0);this.serial=0;}
 ingest(chunk){
  this.buffer=Buffer.concat([this.buffer,Buffer.from(chunk)]);
  let index;while((index=this.buffer.indexOf(10))>=0){
   const frame=this.buffer.subarray(0,index+1);this.buffer=this.buffer.subarray(index+1);
   if(frame.length>this.maxFrame)throw Error('ZCode RPC frame exceeds limit');
   let message;try{message=JSON.parse(frame.toString('utf8'));}catch{this.forward(frame);continue;}
   const own=typeof message.id==='string'&&message.id.startsWith(this.prefix)&&!message.method;
   if(own){const item=this.pending.get(message.id);if(!item)continue;this.pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Object.assign(Error(message.error.message),{code:message.error.code})):item.resolve(message.result);}
   else{this.forward(frame);this.emit('message',message);}
  }
  if(this.buffer.length>this.maxFrame)throw Error('ZCode incomplete RPC frame exceeds limit');
 }
 call(method,params={}){
  const id=this.prefix+(++this.serial);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('ZCode RPC timeout: '+method));},this.timeout);
   this.pending.set(id,{resolve,reject,timer});
   try{this.send(Buffer.from(JSON.stringify({id,method,params})+'\n'));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
  });
 }
 close(){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(Error('ZCode runtime disconnected'));}this.pending.clear();if(this.buffer.length)this.forward(this.buffer);this.buffer=Buffer.alloc(0);}
}
export function snapshotThread(snapshot){
 const s=snapshot?.session,p=snapshot?.projection,r=snapshot?.runtime;
 if(!s||typeof s.sessionId!=='string'||s.sessionId.length>180||['__proto__','constructor','prototype'].includes(s.sessionId)||!p||!r)return null;
 const native=r.contextUsage?.size??p.contextWindow,used=r.contextUsage?.used??p.contextUsed;
 const selection=s.model??snapshot.settings?.model?.current;const model=selection?.modelId?(selection.providerId+'/'+selection.modelId):'zcode-native';
 const busy=['running','busy','compacting'].includes(p.status),waiting=!!p.pendingPermissions?.length;
 return {id:s.sessionId,name:s.title?.slice(0,120),cwd:s.workspace?.workspacePath,model,
  status:busy?'inProgress':waiting?'waitingForApproval':'idle',phase:busy?'running':'observed',
  message:'已读取 ZCode 原生用量；窗口读数为模型原生上限。',turnId:p.currentTurnId??r.activeTurnId??null,forkedFromId:s.parentSessionId,
  lastUsage:Number.isFinite(used)?{totalTokens:used}:null,observedWindow:native,freshUsage:Number.isFinite(used),usageFresh:Number.isFinite(used),
  nativeModel:Number.isSafeInteger(native)&&native>0?{slug:model,display_name:model,context_window:native,max_context_window:native,effective_context_window_percent:100}:null,
  nativeUsage:{cacheReadTokens:r.contextUsage?.cache?.totalCacheReadTokens??null,cacheWriteTokens:r.contextUsage?.cache?.totalCacheWriteTokens??null},nativeActivityAt:typeof s.updatedAt==='number'?s.updatedAt:Date.parse(s.updatedAt),threadSource:'user',canAcceptDirectInput:!['subagent_child','workflow_child','nested_workflow_child'].includes(s.sessionKind)};
}
