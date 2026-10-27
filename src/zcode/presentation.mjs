import path from 'node:path';
export function zcodeSidebar(threads){
 const projects=new Map(),standaloneThreadIds=[];
 for(const thread of threads){if(!thread.cwd){standaloneThreadIds.push(thread.id);continue;}const id=thread.cwd;
  if(!projects.has(id))projects.set(id,{id,name:path.basename(id.replaceAll('\\','/'))||id,roots:[id],threadIds:[]});projects.get(id).threadIds.push(thread.id);}
 return {projects:[...projects.values()],standaloneThreadIds};
}
export function zcodeStatistics(thread){
 const usage=thread.nativeUsage??{},now=new Date().toISOString(),used=thread.lastUsage?.totalTokens??null;
 return {schemaVersion:1,threadId:thread.id,generatedAt:now,snapshotAt:thread.observedAt?new Date(thread.observedAt).toISOString():null,snapshotKind:'zcode-native',model:thread.model,
  inputTokens:used,cachedInputTokens:usage.cacheReadTokens??null,cacheWriteTokens:usage.cacheWriteTokens??null,visibleTokens:0,
  unclassified:{tokensEstimate:used,status:'native-total-only',opaqueItems:0,images:0,reasoningItems:0,compactionItems:0},
  categories:[],toolCalls:[],reasoningGenerated:0,sampledResponses:0,compactionCount:0,plaintextSummaryItems:0,tokenizer:'ZCode native usage',responses:[],timelineEvents:[],
  cost:{usd:null,upperUSD:null,maxWriteSurcharge:0,extraWriteTokens:0,pricedRequests:0,totalRequests:0,unpricedRequests:0,unknownTier:0,unknownModel:0,unknownUsage:0,unsupportedRate:0,longContextCount:0,unverifiedWriteRequests:0,groups:[],breakdown:[],checkedAt:now,source:'ZCode pricing not verified'},
  notes:['来自 ZCode 当前会话的原生用量。未提供的逐响应、内容分类和费用数据不作估算。']};
}
