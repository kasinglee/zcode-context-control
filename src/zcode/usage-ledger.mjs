import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {estimateGlmConversation} from './cost-estimate.mjs';
const integer=value=>Number.isSafeInteger(value)&&value>=0;

export function summarizeUsage(rows){
 const unique=[...new Map(rows.filter(row=>typeof row.id==='string').map(row=>[row.id,row])).values()];
 let inputTokens=0,outputTokens=0,cachedInputTokens=0,reasoningTokens=0,measuredRequests=0,missingUsageRequests=0;
 for(const row of unique){
  if(!integer(row.inputTokens)||!integer(row.outputTokens)){missingUsageRequests++;continue;}
  measuredRequests++;inputTokens+=row.inputTokens;outputTokens+=row.outputTokens;
  if(integer(row.cachedInputTokens)&&row.cachedInputTokens<=row.inputTokens)cachedInputTokens+=row.cachedInputTokens;
  if(integer(row.reasoningTokens)&&row.reasoningTokens<=row.outputTokens)reasoningTokens+=row.reasoningTokens;
 }
 const cost=estimateGlmConversation(unique);
 cost.scopeNote='包含本任务的模型调用、压缩、标题生成和子任务；失败或取消的调用如已记录用量也计入。';
 cost.notice=cost.notice.replace('工具费及子代理费用','工具费');
 return {available:true,totalTokens:inputTokens+outputTokens,inputTokens,outputTokens,cachedInputTokens,reasoningTokens,requestCount:unique.length,measuredRequests,missingUsageRequests,cost};
}

export function aggregateUsageLedger(rows,sessions){
 const metadata=new Map(sessions.map(session=>[session.id,session]));
 const rootFor=id=>{
  let current=id;const seen=new Set();
  while(metadata.get(current)?.parent_id){
   if(seen.has(current))return id;seen.add(current);
   // An interactive fork is a separate task; only child agents roll up.
   const session=metadata.get(current);
   if(!['subagent_child','workflow_child','nested_workflow_child'].includes(session.task_type))break;
   current=session.parent_id;
  }
  return current;
 };
 const grouped=new Map();
 for(const session of sessions){const root=rootFor(session.id);if(!grouped.has(root))grouped.set(root,[]);}
 const unique=new Map();
 for(const row of rows){if(typeof row.id==='string'&&!['running','pending'].includes(row.status))unique.set(row.id,row);}
 for(const row of unique.values()){
  const id=rootFor(row.sessionId);if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(row);
 }
 const tasks=new Map([...grouped].map(([id,items])=>[id,{...summarizeUsage(items),taskId:id}]));
 return {tasks,summary:{...summarizeUsage([...unique.values()]),taskCount:tasks.size,tasksWithUsage:[...tasks.values()].filter(t=>t.requestCount>0).length}};
}

export function compactUsage(summary){
 if(!summary)return {available:false};
 const {cost,...usage}=summary;
 return {...usage,cost:cost?Object.fromEntries(['currency','amount','amountUSD','pricedRequests','totalRequests','unpricedRequests','unknownModel','unknownUsage','unsupportedRate'].map(key=>[key,cost[key]])):null};
}

export class NativeUsageLedger {
 constructor({DatabaseSync,file=process.env.ZCODE_CONTROL_USAGE_DB??path.join(os.homedir(),'.zcode','cli','db','db.sqlite'),now=Date.now}={}){
  Object.assign(this,{DatabaseSync,file,now});this.tasks=new Map();this.summary={available:false,source:'local_ledger',status:'unavailable'};this.checkedAt=0;
 }
 refresh(force=false){
  if(!force&&this.now()-this.checkedAt<15000)return;this.checkedAt=this.now();let db;
  try{
   if(!this.DatabaseSync||!fs.existsSync(this.file))throw Error('尚未找到 ZCode 本地用量账本');
   db=new this.DatabaseSync(this.file,{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN');
   const sessions=db.prepare('SELECT id,parent_id,task_type FROM session').all();
   // Numeric counters and identifiers only: never read messages, prompts,
   // raw_usage_json, credentials, or provider request/response payloads.
   const rows=db.prepare(`SELECT id,session_id AS sessionId,provider_id,model_id,status,
    input_tokens AS inputTokens,output_tokens AS outputTokens,reasoning_tokens AS reasoningTokens,
    cache_read_input_tokens AS cachedInputTokens,completed_at AS completedAt
    FROM model_usage WHERE status NOT IN ('pending','running') AND
    (input_tokens>0 OR output_tokens>0 OR cache_read_input_tokens>0 OR status='completed') ORDER BY completed_at,id`).all()
    .map(({provider_id,model_id,...row})=>({...row,model:`${provider_id}/${model_id}`}));
   db.exec('COMMIT');const result=aggregateUsageLedger(rows,sessions);
   this.tasks=result.tasks;this.summary={...result.summary,source:'local_ledger',status:'ready',stale:false,updatedAt:new Date(this.now()).toISOString()};
  }catch(error){this.summary={...this.summary,status:this.summary.available?'cached':'unavailable',stale:!!this.summary.available,error:error.message};}
  finally{db?.close();}
 }
 task(id){const task=this.tasks.get(id);return task?{...task,stale:this.summary.stale,updatedAt:this.summary.updatedAt}:null;}
}
