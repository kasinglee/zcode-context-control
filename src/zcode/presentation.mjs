import path from 'node:path';
import {estimateGlmConversation} from './cost-estimate.mjs';
import {compactUsage} from './usage-ledger.mjs';
export function defaultWorkspace(cwd){
 if(typeof cwd!=='string'||!cwd.trim())return true;
 const normalized=cwd.replaceAll('\\','/').replace(/\/+$/,'');
 // Only ZCode-owned scratch roots are grouped; an actual project named
 // "default", a timestamp, or "draft-*" elsewhere keeps its own identity.
 return /(?:^|\/)\.zcode\/workspace(?:\/(?:default|draft-[a-f\d-]+|\d{13}-[a-f\d-]+))?$/i.test(normalized);
}
export function zcodeSidebar(threads){
 const projects=new Map(),standaloneThreadIds=[];
 for(const thread of threads){
  if(defaultWorkspace(thread.cwd)){
   const id='zcode:default';
   if(!projects.has(id))projects.set(id,{id,name:'default',roots:[],threadIds:[]});
   projects.get(id).threadIds.push(thread.id);continue;
  }
  const id=thread.cwd;
  if(!projects.has(id))projects.set(id,{id,name:path.basename(id.replaceAll('\\','/'))||id,roots:[id],threadIds:[]});projects.get(id).threadIds.push(thread.id);}
 return {projects:[...projects.values()],standaloneThreadIds};
}
export function zcodeStatistics(thread){
 const usage=thread.nativeUsage??{},now=new Date().toISOString(),used=thread.lastUsage?.totalTokens??null;
 return {schemaVersion:1,threadId:thread.id,generatedAt:now,snapshotAt:thread.observedAt?new Date(thread.observedAt).toISOString():null,snapshotKind:'zcode-native',model:thread.model,
  inputTokens:used,cachedInputTokens:usage.cacheReadTokens??null,cacheWriteTokens:usage.cacheWriteTokens??null,visibleTokens:0,
  unclassified:{tokensEstimate:used,status:'native-total-only',opaqueItems:0,images:0,reasoningItems:0,compactionItems:0},
  categories:[],toolCalls:[],reasoningGenerated:0,sampledResponses:0,compactionCount:0,plaintextSummaryItems:0,tokenizer:'ZCode native usage',responses:[],timelineEvents:[],
  cumulativeUsage:compactUsage(thread.ledgerUsage),
  cost:thread.ledgerUsage?.cost??thread.nativeBilling?.cost??estimateGlmConversation([]),
  notes:['费用按本聊天已完成响应的原生输入、缓存命中与输出 token 累加；不使用当前上下文大小推算累计费用。','思考 token 已包含在输出中，不重复计费；未知模型或缺失用量的请求不计入估算。','缓存未命中部分按普通输入计费；缓存命中享受单独费率。','仅保存数字用量、模型标识和响应 ID，不保存消息正文。']};
}
