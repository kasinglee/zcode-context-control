import {policyForNewChat} from '../core/new-chat-defaults.mjs';
import {snapshotThread} from './protocol.mjs';
export class ZcodeBridge {
 constructor({rpc,notify,policyState}){Object.assign(this,{rpc,notify,policyState});this.records=new Map();this.tasks=new Map();this.refreshing=new Set();this.selections=new Map();}
 async observe(snapshot,{newSession=false}={}){
  const thread=snapshotThread(snapshot);if(!thread)return;
  const previous=this.records.get(thread.id),task=this.tasks.get(thread.id);
  const selection=snapshot.session.model??snapshot.settings?.model?.current;if(selection)this.selections.set(thread.id,selection);
  if(task?.status==='running'&&thread.status==='inProgress')task.observedRunning=true;
  // Completion needs a running observation; an acknowledgement alone is not completion.
  if(task?.status==='running'&&task.observedRunning&&thread.status==='idle'&&(task.acceptedRevision==null||snapshot.runtime.stateRevision>=task.acceptedRevision)){
   task.status=snapshot.projection.status==='error'?'error':snapshot.projection.status==='paused'?'interrupted':'completed';task.finishedAt=Date.now();
   if(task.status==='error'){task.error=snapshot.projection.lastError?.message||'ZCode turn failed';task.errorConfirmed=true;}
  }
  if(task)thread.automaticTask={...task};
  if(newSession&&!previous&&!snapshot.session.parentSessionId){const defaults=this.policyState.defaults?.();if(defaults&&thread.nativeModel){try{thread.newChatPolicy=policyForNewChat(defaults,thread.nativeModel);if(thread.newChatPolicy.compact>thread.newChatPolicy.window-21000)thread.newChatPolicy.compact=thread.newChatPolicy.window-21000;}catch{}}}
  this.records.set(thread.id,thread);
  const answer=await this.notify(thread);
  // Inherit a saved fork budget. Do not apply defaults to resumed history.
  if(answer?.policy?.enabled)this.policyState.set(thread.id,answer.policy);
  return previous;
 }
 async refresh(id){
  if(this.refreshing.has(id))return;
  this.refreshing.add(id);try{await this.observe(await this.rpc.call('session/read',{sessionId:id,contentProfile:'index'}));}finally{this.refreshing.delete(id);}
 }
 async command(op,p){
  const thread=this.records.get(p.id);
  if(!thread)throw Error('请先在 ZCode 中打开此聊天。');
  if(op==='setPolicy'){
   const policy=p.policy,native=thread.nativeModel?.max_context_window;
   if(!native||policy.window>native||policy.compact>policy.window-21000)throw Error('预算不得超过模型原生窗口，并须为输出预留至少 21K。');
   if(thread.lastUsage?.totalTokens+21000>=Math.min(policy.window,policy.compact))throw Error('当前上下文已达到新阈值，请先压缩并重新测量。');
   this.policyState.set(p.id,policy);return {ok:true,message:'已保存压缩预算；下一次原生压缩检查时生效。'};
  }
  if(op==='clearPolicy'){this.policyState.set(p.id,{enabled:false});return {ok:true};}
  if(op==='compact'){if(thread.status==='inProgress')throw Error('请等待当前轮次结束再压缩。');const result=await this.rpc.call('session/compact',{sessionId:p.id});if(result.snapshot)await this.observe(result.snapshot);return {ok:true};}
  if(op==='queue-prepare')return {ok:true};
  if(op==='queue-start'){
   const task=p.task;if(this.tasks.get(p.id)?.executionId===task.executionId)return this.tasks.get(p.id);
   if(this.tasks.get(p.id)?.status==='running'||thread.status==='inProgress')throw Error('当前轮次仍在运行。');
   if(task.adoptTurnId||task.settings?.approval&&task.settings.approval!=='inherit'||task.settings?.model&&task.settings.model!==thread.model||task.settings?.attachments?.length)throw Error('ZCode 首轮适配暂只支持当前模型、继承权限的文本队列。');
   const record={executionId:task.executionId,taskId:task.taskId,status:'running',observedRunning:false};this.tasks.set(p.id,record);
   // Persisted intent comes from the scheduler. Never replay an uncertain send.
   await this.notify({...thread,automaticTask:{...record}});
   try{const result=await this.rpc.call(task.prompt==='/compact'?'session/compact':'session/send',{sessionId:p.id,...(task.prompt==='/compact'?{}:{inputId:task.executionId,content:task.prompt,...(task.settings?.effort&&this.selections.has(p.id)?{modelSelection:{...this.selections.get(p.id),options:{...this.selections.get(p.id).options,reasoningLevel:task.settings.effort}}}:{})})});if(result?.accepted===true){record.observedRunning=true;record.acceptedRevision=result.stateRevision;}if(result?.snapshot)await this.observe(result.snapshot);return record;}
   catch(error){record.status='error';record.error=error.message;record.errorConfirmed=Number.isInteger(error.code);await this.notify({...thread,automaticTask:{...record}});return record;}
  }
  if(op==='queue-interrupt'){
   const task=this.tasks.get(p.id);if(task?.executionId!==p.executionId)throw Error('队列执行已变化，未停止其他任务。');
   await this.rpc.call('session/stop',{sessionId:p.id});task.status='interrupted';await this.notify({...thread,automaticTask:{...task}});return {ok:true};
  }
  throw Error('此 ZCode 适配层尚不支持该操作。');
 }
}
