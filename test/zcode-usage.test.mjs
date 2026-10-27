import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {aggregateUsageLedger,NativeUsageLedger} from '../src/zcode/usage-ledger.mjs';
import {usageMoney,usageView} from '../desktop/renderer/usage-summary.mjs';
const row=(id,sessionId,extra={})=>({id,sessionId,model:'zhipu/glm-5.2',status:'completed',inputTokens:100,outputTokens:20,cachedInputTokens:60,reasoningTokens:10,...extra});
test('ledger rolls up children once, preserves forks and counts unknown-model tokens',()=>{
 const sessions=[{id:'main'},{id:'child',parent_id:'main',task_type:'subagent_child'},{id:'nested',parent_id:'child',task_type:'workflow_child'},{id:'fork',parent_id:'main',task_type:'interactive'}];
 const rows=[row('a','main'),row('a','main'),row('b','child'),row('c','nested'),row('d','fork',{model:'other/qwen'}),row('e','main',{status:'running'}),row('f','main',{status:'error'})];
 const {tasks,summary}=aggregateUsageLedger(rows,sessions);
 assert.equal(tasks.size,2);assert.equal(tasks.get('main').totalTokens,480);assert.equal(tasks.get('fork').totalTokens,120);
 assert.equal(summary.totalTokens,600);assert.equal(summary.cachedInputTokens,300);assert.equal(summary.reasoningTokens,50);
 assert.equal(summary.cost.unpricedRequests,1);assert.equal(summary.totalTokens,[...tasks.values()].reduce((n,t)=>n+t.totalTokens,0));
 assert.equal(usageMoney(tasks.get('fork')),'—');
});
test('readonly ledger refresh replaces totals and retains successful cache on read failure',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'zcode-usage-')),file=path.join(home,'usage.sqlite');
 try{
  const db=new DatabaseSync(file);
  db.exec(`CREATE TABLE session(id TEXT,parent_id TEXT,task_type TEXT);
   CREATE TABLE model_usage(id TEXT,session_id TEXT,provider_id TEXT,model_id TEXT,status TEXT,input_tokens INTEGER,output_tokens INTEGER,reasoning_tokens INTEGER,cache_read_input_tokens INTEGER,completed_at INTEGER);
   INSERT INTO session VALUES('main',NULL,'interactive');
   INSERT INTO model_usage VALUES('a','main','zhipu','glm-5.2','completed',100,20,10,60,1),('b','main','zhipu','glm-5.2','error',40,5,0,0,2),('c','main','zhipu','glm-5.2','pending',900,0,0,0,3);`);
  db.close();const ledger=new NativeUsageLedger({DatabaseSync,file});ledger.refresh(true);
  assert.equal(ledger.summary.totalTokens,165);ledger.refresh(true);assert.equal(ledger.summary.totalTokens,165);
  const writer=new DatabaseSync(file);writer.exec('DROP TABLE model_usage');writer.close();ledger.refresh(true);
  assert.equal(ledger.summary.totalTokens,165);assert.equal(ledger.summary.stale,true);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('summary shows separate currencies, unavailable totals and partial-price coverage',()=>{
 const usage={available:true,totalTokens:1234,inputTokens:1200,outputTokens:34,requestCount:3,cost:{pricedRequests:2,unpricedRequests:1,amount:1.2,amountUSD:0.03}};
 assert.equal(usageMoney(usage),'¥1.20 + US$0.03');
 const html=usageView({usage,global:true,e:String,t:String});assert.match(html,/1,234/);assert.match(html,/尚未计入金额/);
 assert.equal(usageMoney({available:false}),'—');
});
