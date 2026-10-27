import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateGlmResponse,estimateGlmConversation,snapshotBilling} from '../src/zcode/cost-estimate.mjs';
import {zcodeStatistics} from '../src/zcode/presentation.mjs';
import {statisticsView} from '../desktop/renderer/apple-view.mjs';
const row={id:'r1',model:'sensenova/glm-5.2',inputTokens:100000,cachedInputTokens:80000,outputTokens:10000,reasoningTokens:2000};
test('GLM CNY reference rates partition cached input and include reasoning once',()=>{
 const price=estimateGlmResponse({...row,cacheWriteTokens:20000});
 assert.equal(price.currency,'CNY');assert.equal(price.usd,null);assert.ok(Math.abs(price.amount-0.6)<1e-12);
 assert.deepEqual(price.breakdown.map(p=>p.tokens),[20000,80000,10000]);
 assert.deepEqual(price.breakdown.map(p=>p.rate),[8,2,28]);
});
test('Unknown/missing/invalid usage is excluded, model changes cannot be priced as the current GLM',()=>{
 for(const variant of [{cachedInputTokens:null},{cachedInputTokens:100001},{inputTokens:-1},{outputTokens:1.5},{reasoningTokens:10001}])assert.equal(estimateGlmResponse({...row,...variant}).reason,'unknown_usage');
 const cost=estimateGlmConversation([row,row,{...row,id:'other',model:'provider/gpt-5'},{...row,id:'missing',outputTokens:null}]);
 assert.equal(cost.totalRequests,3);assert.equal(cost.pricedRequests,1);assert.equal(cost.unknownModel,1);assert.equal(cost.unknownUsage,1);assert.ok(Math.abs(cost.amount-0.6)<1e-12);
 assert.equal(estimateGlmConversation([]).amount,null);
});
test('Snapshots count only completed own-session responses and persist only numeric billing data',()=>{
 const info={role:'assistant',sessionId:'s',messageId:'r1',time:{created:1,completed:2},model:{providerId:'sensenova',modelId:'glm-5.2'},tokens:{input:100000,output:10000,reasoning:2000,cache:{read:80000,write:20000}}};
 const snapshot={session:{sessionId:'s'},messages:[{info,parts:[{text:'PRIVATE MESSAGE MUST NOT PERSIST'}]}, {info:{...info,messageId:'parent',sessionId:'parent'}},{info:{...info,messageId:'streaming',time:{created:3}}},{info:{...info,messageId:'imported',tokens:{input:0,output:0,reasoning:0,cache:{read:0,write:0}}}}]};
 const billing=snapshotBilling(snapshot);
 assert.equal(billing.cost.totalRequests,1);assert.equal(billing.cost.pricedRequests,1);assert.ok(!JSON.stringify(billing).includes('PRIVATE MESSAGE'));
 assert.deepEqual(snapshotBilling(snapshot),billing); // Refresh/reopen is a recalculation, not an increment.
 const many={...snapshot,messages:Array.from({length:250},(_,i)=>({info:{...info,messageId:'r'+i}}))};
 assert.equal(snapshotBilling(many).cost.pricedRequests,250);assert.equal(snapshotBilling(many).cost.recent.length,20);
});
test('Windows renders yuan reference pricing and GLM formula without OpenAI tiers',()=>{
 const stats=zcodeStatistics({id:'s',lastUsage:{totalTokens:123},nativeBilling:{cost:estimateGlmConversation([row])}});
 const e=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const t=(cn,en,...args)=>args.reduce((s,arg,i)=>s.replaceAll('{'+i+'}',String(arg)),cn);
 const html=statisticsView({stats,period:0,e,t,k:String,amount:x=>x==null?'—':String(x),money:x=>'$'+x,modelName:String});
 assert.match(html,/¥0\.60/);assert.match(html,/CNY/);assert.match(html,/智谱官方参考价/);assert.match(html,/非实际账单/);
 assert.doesNotMatch(html,/OpenAI|272K|Standard 单价|· USD/);
});
test('DeepSeek official USD rates apply peak/off-peak by completion time and alias legacy names',()=>{
 const base={id:'d1',model:'zai/deepseek-v4-flash',inputTokens:1000000,cachedInputTokens:0,outputTokens:0};
 const peak=estimateGlmResponse({...base,completedAt:Date.UTC(2026,9,26,2,0)}); // Mon 02:00 UTC
 const off=estimateGlmResponse({...base,completedAt:Date.UTC(2026,9,26,12,0)}); // Mon 12:00 UTC
 const weekend=estimateGlmResponse({...base,model:'d77/deepseek-v4-pro',outputTokens:1000000,completedAt:Date.UTC(2026,9,25,2,0)}); // Sun
 assert.equal(peak.currency,'USD');assert.equal(peak.peak,'peak');assert.ok(Math.abs(peak.amount-0.3)<1e-9);assert.ok(Math.abs(peak.usd-0.3)<1e-9);
 assert.equal(off.peak,'offPeak');assert.ok(Math.abs(off.amount-0.15)<1e-9);
 assert.equal(weekend.peak,'offPeak');assert.ok(Math.abs(weekend.amount-2.64)<1e-9); // 1M in $0.66 + 1M out $1.98
 assert.equal(estimateGlmResponse({...base,completedAt:null}).peak,'peak'); // missing timestamp conservatively peaks
});
test('GLM tiered pricing selects official segments by input/output length',()=>{
 const short=estimateGlmResponse({id:'g1',model:'zai/glm-5',inputTokens:30000,cachedInputTokens:0,outputTokens:1000});
 const long=estimateGlmResponse({id:'g2',model:'zai/glm-5',inputTokens:40000,cachedInputTokens:0,outputTokens:1000});
 assert.equal(short.breakdown[0].rate,4);assert.equal(short.breakdown[2].rate,18);
 assert.equal(long.breakdown[0].rate,6);assert.equal(long.breakdown[2].rate,22);
 const out200=estimateGlmResponse({id:'g3',model:'zai/glm-4.7',inputTokens:1000,cachedInputTokens:0,outputTokens:100});
 const out500=estimateGlmResponse({id:'g4',model:'zai/glm-4.7',inputTokens:1000,cachedInputTokens:0,outputTokens:500});
 assert.equal(out200.breakdown[0].rate,2);assert.equal(out500.breakdown[0].rate,3);
 assert.equal(estimateGlmResponse({id:'g5',model:'zai/glm-4.7',inputTokens:500000,cachedInputTokens:0,outputTokens:100}).reason,'unsupported_rate');
});
test('Mixed conversations total CNY and USD separately and report both',()=>{
 const cost=estimateGlmConversation([
  {id:'m1',model:'zai/glm-5.2',inputTokens:1000000,cachedInputTokens:0,outputTokens:1000000},
  {id:'m2',model:'zai/deepseek-v4-flash',inputTokens:1000000,cachedInputTokens:0,outputTokens:1000000,completedAt:Date.UTC(2026,9,26,2,0)},
  {id:'m3',model:'zai/glm-4.7-flash',inputTokens:1000,cachedInputTokens:0,outputTokens:500}]);
 assert.equal(cost.currency,'MIXED');assert.ok(Math.abs(cost.amount-36)<1e-9);assert.ok(Math.abs(cost.amountUSD-1.5)<1e-9);
 assert.equal(cost.pricedRequests,3); // free GLM request still counted and priced at ¥0
 assert.equal(cost.groups.some(g=>g.model==='zai/glm-4.7-flash'&&g.amount===0),true);
 const usdOnly=estimateGlmConversation([{id:'m4',model:'z/deepseek-v4-pro',inputTokens:1000000,cachedInputTokens:0,outputTokens:1000000,completedAt:Date.UTC(2026,9,26,12,0)}]);
 assert.equal(usdOnly.currency,'USD');assert.equal(usdOnly.amount,null);assert.ok(Math.abs(usdOnly.amountUSD-2.64)<1e-9);
});

test('Breakdowns keep different currencies and GLM rate bands separate',()=>{
 const cost=estimateGlmConversation([
  {id:'a',model:'z/glm-5.2',inputTokens:1000000,cachedInputTokens:0,outputTokens:0},
  {id:'b',model:'z/glm-5.3-flash',inputTokens:1000000,cachedInputTokens:0,outputTokens:0},
  {id:'c',model:'z/deepseek-v4-flash',inputTokens:1000000,cachedInputTokens:0,outputTokens:0}
 ]);
 const input=cost.breakdown.filter(part=>part.category==='ordinary_input');
 assert.equal(input.length,3);assert.deepEqual(input.map(p=>[p.currency,p.rate,p.amount]),[['CNY',8,8],['CNY',0.8,0.8],['USD',0.3,0.3]]);
 assert.equal(typeof cost.source,'string'); // Both native clients decode one primary source URL.
 const free=estimateGlmConversation([{id:'f',model:'z/glm-4.7-flash',inputTokens:100,cachedInputTokens:0,outputTokens:0},{id:'d',model:'z/deepseek-v4-flash',inputTokens:100,cachedInputTokens:0,outputTokens:0}]);
 assert.equal(free.currency,'MIXED');assert.equal(free.amount,0);
});
test('Windows renders DeepSeek USD and mixed totals',()=>{
 const e=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const t=(cn,en,...args)=>args.reduce((s,arg,i)=>s.replaceAll('{'+i+'}',String(arg)),cn);
 const usdStats=zcodeStatistics({id:'s2',lastUsage:{totalTokens:123},nativeBilling:{cost:estimateGlmConversation([{id:'u1',model:'z/deepseek-v4-flash',inputTokens:1000000,cachedInputTokens:0,outputTokens:0,completedAt:Date.UTC(2026,9,26,2,0)}])}});
 const usdHtml=statisticsView({stats:usdStats,period:0,e,t,k:String,amount:x=>x==null?'—':String(x),money:x=>'$'+x,modelName:String});
 assert.match(usdHtml,/\$0\.30/);assert.match(usdHtml,/DeepSeek 官方参考价/);assert.match(usdHtml,/\$0\.30 \/ 百万 token/); // per-part per-currency rate display
 const mixedStats=zcodeStatistics({id:'s3',lastUsage:{totalTokens:123},nativeBilling:{cost:estimateGlmConversation([{id:'x1',model:'zai/glm-5.2',inputTokens:1000000,cachedInputTokens:0,outputTokens:1000000},{id:'x2',model:'z/deepseek-v4-flash',inputTokens:1000000,cachedInputTokens:0,outputTokens:0,completedAt:Date.UTC(2026,9,26,2,0)}])}});
 const mixedHtml=statisticsView({stats:mixedStats,period:0,e,t,k:String,amount:x=>x==null?'—':String(x),money:x=>'$'+x,modelName:String});
 assert.match(mixedHtml,/¥36/);assert.match(mixedHtml,/\$0\.30/);assert.match(mixedHtml,/官方参考价/);
});
