import fs from 'node:fs';
export const glmPriceBook=JSON.parse(fs.readFileSync(new URL('./glm-prices.json',import.meta.url),'utf8'));
export const deepseekPriceBook=JSON.parse(fs.readFileSync(new URL('./deepseek-prices.json',import.meta.url),'utf8'));
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export const glmModelId=value=>typeof value==='string'?value.split('/').at(-1).toLowerCase():'';

// GLM: flat rates or input/output-length tiered rates (official segmented pricing).
// A tier applies when minInput<=input<maxInput and minOutput<=output<maxOutput
// (bounds default to unbounded). No matching tier -> unsupported rate, not invented.
function selectRates(rates,input,output){
 if(!rates.tiers)return rates;
 for(const tier of rates.tiers){
  if(input<(tier.minInput??0))continue;
  if(tier.maxInput!=null&&input>=tier.maxInput)continue;
  if(output<(tier.minOutput??0))continue;
  if(tier.maxOutput!=null&&output>=tier.maxOutput)continue;
  return tier;
 }
 return null;
}
function findModel(book,id){
 const direct=book.models[id];
 if(direct)return {rates:direct,match:id};
 for(const [name,model] of Object.entries(book.models)){
  if(model.aliases?.includes(id))return {rates:model,match:name};
 }
 return null;
}
// Peak hours are UTC weekdays 01:00-04:00 and 06:00-10:00. Missing timestamps
// price conservatively at peak (the pricier window), as documented.
function isPeak(timestampMs,peak){
 if(timestampMs==null)return true;
 const date=new Date(timestampMs);
 const weekday=(date.getUTCDay()+6)%7+1; // 1=Mon..7=Sun
 if(!peak.weekdaysUtc.includes(weekday))return false;
 const hour=date.getUTCHours();
 return peak.hoursUtc.some(([start,end])=>hour>=start&&hour<end);
}
export function estimateGlmResponse(row){
 const id=glmModelId(row.model);
 const fail=reason=>({amount:null,usd:null,currency:null,reason});
 const {inputTokens:input,cachedInputTokens:read,outputTokens:output}=row;
 if(![input,read,output].every(integer)||read>input||row.reasoningTokens!=null&&(!integer(row.reasoningTokens)||row.reasoningTokens>output))return fail('unknown_usage');

 const glm=findModel(glmPriceBook,id);
 if(glm){
  const rates=selectRates(glm.rates,input,output);
  if(!rates)return fail('unsupported_rate');
  const breakdown=[['ordinary_input','普通输入',input-read,rates.input],['cache_read','缓存命中',read,rates.cacheRead],['output','输出（含思考）',output,rates.output]]
   .map(([category,label,tokens,rate])=>({category,label,tokens,rate,amount:tokens*rate/glmPriceBook.unitTokens,usd:null,currency:'CNY'}));
  return {amount:breakdown.reduce((sum,p)=>sum+p.amount,0),usd:null,currency:'CNY',reason:null,breakdown,officialModel:glm.match};
 }
 const ds=findModel(deepseekPriceBook,id);
 if(ds){
  const peak=isPeak(row.completedAt??null,deepseekPriceBook.peak);
  const rateOf=key=>peak?ds.rates[key].peak:ds.rates[key].offPeak;
  const breakdown=[['ordinary_input','普通输入',input-read,rateOf('input')],['cache_read','缓存命中',read,rateOf('cacheRead')],['output','输出（含思考）',output,rateOf('output')]]
   .map(([category,label,tokens,rate])=>({category,label,tokens,rate,amount:tokens*rate/deepseekPriceBook.unitTokens,usd:tokens*rate/deepseekPriceBook.unitTokens,currency:'USD'}));
  return {amount:breakdown.reduce((sum,p)=>sum+p.amount,0),usd:breakdown.reduce((sum,p)=>sum+p.amount,0),currency:'USD',reason:null,breakdown,officialModel:ds.match,peak:peak?'peak':'offPeak'};
 }
 return fail('unknown_model');
}
export function estimateGlmConversation(rows){
 let amountCny=0,amountUsd=0,priced=0,unknownModel=0,unknownUsage=0,unsupportedRate=0;
 const seen=new Set(),groups=new Map(),parts=new Map(),recent=[],currencies=new Set();
 for(const row of rows){
  if(typeof row.id!=='string'||seen.has(row.id))continue;seen.add(row.id);
  const estimate=estimateGlmResponse(row);
  recent.push({id:row.id,model:row.model,inputTokens:row.inputTokens,cachedInputTokens:row.cachedInputTokens,outputTokens:row.outputTokens,amount:estimate.amount,usd:estimate.usd,currency:estimate.currency,reason:estimate.reason});
  if(estimate.amount==null){estimate.reason==='unknown_model'?unknownModel++:estimate.reason==='unsupported_rate'?unsupportedRate++:unknownUsage++;continue;}
  priced++;currencies.add(estimate.currency);
  if(estimate.currency==='USD')amountUsd+=estimate.amount;else amountCny+=estimate.amount;
  for(const part of estimate.breakdown){const key=`${part.currency}:${part.category}:${part.rate}`;const previous=parts.get(key)??{...part,tokens:0,amount:0};previous.tokens+=part.tokens;previous.amount+=part.amount;parts.set(key,previous);}
  const group=groups.get(row.model)??{model:row.model,tier:'official_reference',requests:0,amount:0,usd:0,currency:estimate.currency};group.requests++;group.amount+=estimate.amount;if(estimate.currency==='USD')group.usd+=estimate.amount;groups.set(row.model,group);
 }
 const mixed=currencies.size>1,onlyUsd=currencies.size===1&&currencies.has('USD');
 const tag=onlyUsd?'USD':mixed?'MIXED':'CNY';
 let notice;
 if(onlyUsd)notice='按 DeepSeek 官方美元牌价估算，含高峰/低谷两档（缺失时间戳按高峰保守估算）。';
 else if(mixed)notice='按智谱（人民币）与 DeepSeek（美元）官方牌价分别估算；GLM 缓存存储限时免费；DeepSeek 缺失时间戳按高峰价保守估算。';
 else notice='按智谱官方人民币牌价估算；GLM 缓存存储限时免费，不计写入费。';
 notice+=' 非实际账单；不含套餐、折扣、工具费及子代理费用。';
 const formula=mixed?'费用 CNY =（总输入 − 缓存命中）× GLM 输入价 ÷ 1,000,000 + 缓存命中 × 读取价 ÷ 1,000,000 + 输出 × 输出价 ÷ 1,000,000；费用 USD = 同构公式按 DeepSeek 官方价与高峰/低谷档计算。':onlyUsd?'费用 USD =（总输入 − 缓存命中）× 输入价 ÷ 1,000,000 + 缓存命中 × 读取价 ÷ 1,000,000 + 输出 × 输出价 ÷ 1,000,000；按请求完成时间取高峰或低谷档。':'费用 =（总输入 − 缓存命中）× 输入价 ÷ 1,000,000 + 缓存命中 × 读取价 ÷ 1,000,000 + 输出（含思考）× 输出价 ÷ 1,000,000；分段计价型号按输入/输出长度取档。';
 const cnyTotal=amountCny>0||(!onlyUsd&&priced>0)?amountCny:null; // null only when nothing (incl. free) was priced
 const usdTotal=amountUsd>0||(onlyUsd&&priced>0)?amountUsd:null;
 return {currency:tag,amount:cnyTotal,usd:null,upperUSD:null,amountUSD:usdTotal,basis:'official_reference',source:onlyUsd?deepseekPriceBook.source:glmPriceBook.source,sources:[glmPriceBook.source,deepseekPriceBook.source],checkedAt:glmPriceBook.checkedAt,
  maxWriteSurcharge:0,extraWriteTokens:0,pricedRequests:priced,totalRequests:seen.size,unpricedRequests:seen.size-priced,unknownModel,unknownUsage,unknownTier:0,unsupportedRate,longContextCount:0,unverifiedWriteRequests:0,
  breakdown:[...parts.values()],groups:[...groups.values()],recent:recent.slice(-20),
  notice,formula,
  peakNote:deepseekPriceBook.peak.note,
  storageNotice:'GLM 缓存存储目前限时免费；不额外估算缓存写入费用。'};
}
export function snapshotBilling(snapshot){
 const id=snapshot?.session?.sessionId,rows=[];
 for(const message of snapshot.messages??[]){
  const info=message?.info;
  if(info?.role!=='assistant'||info.sessionId!==id||typeof info.messageId!=='string')continue;
  if(info.time?.completed==null&&!info.finish)continue;
  const tokens=info.tokens;
  // Migration/import placeholders have all-zero counters and no billed call.
  if(tokens&&[tokens.input,tokens.output,tokens.cache?.read,tokens.cache?.write].every(n=>n===0))continue;
  const selection=info.model;
  rows.push({id:info.messageId,model:selection?.modelId?`${selection.providerId}/${selection.modelId}`:'unknown',inputTokens:tokens?.input??null,cachedInputTokens:tokens?.cache?.read??null,outputTokens:tokens?.output??null,reasoningTokens:tokens?.reasoning??null,completedAt:info.time?.completed??null});
 }
 return {schemaVersion:2,cost:estimateGlmConversation(rows),historyAvailable:Array.isArray(snapshot.messages)};
}
