import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {Peer} from '../src/ipc.mjs';
import {ipcEndpoint} from '../src/platform/index.mjs';
import {authenticateClient} from '../src/ipc-auth.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
test('Isolated service supports authenticated UI, native model discovery, policy persistence, compaction and queue dispatch',async t=>{
 const home=fs.mkdtempSync(path.join(repo,'.local','s-'));
 let log='';const child=spawn(process.execPath,[path.join(repo,'src/daemon.mjs')],{env:{...process.env,ZCODE_CONTROL_USAGE_DB:path.join(home,"missing-usage.sqlite"),ZCODE_CONTROL_HOME:home,CONTEXT_CONTROL_HOME:home},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
 t.after(async()=>{child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});fs.rmSync(home,{recursive:true,force:true});});
 let connection;for(let i=0;i<100;i++){try{connection=JSON.parse(fs.readFileSync(path.join(home,'connection.json'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,30));}}
 assert.ok(connection,log);
 const call=async(route,body)=>{
  const response=await fetch(`http://127.0.0.1:${connection.port}${route}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+connection.token},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert.equal(response.ok,true,JSON.stringify(data));return data;
 };
 const forbidden=await fetch(`http://127.0.0.1:${connection.port}/state`);assert.equal(forbidden.status,403);
 const socket=net.createConnection(ipcEndpoint(home));await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 if(process.platform==='win32')await authenticateClient(socket,fs.readFileSync(path.join(home,'ipc-key'),'utf8'));
 const commands=[];let bridge;bridge=new Peer(socket,async(op,p)=>{commands.push({op,p});if(op==='queue-start'){await bridge.call('updateThread',{id:p.id,status:'inProgress',automaticTask:{executionId:p.task.executionId,taskId:p.task.taskId,status:'running'}});}return {ok:true};});t.after(()=>socket.destroy());
 await bridge.call('registerBridge',{provider:'zcode',pid:process.pid,version:'0.27.12',taskQueueVersion:4,newChatDefaultsVersion:2});
 const id='session-zcode-fixture';
 await bridge.call('updateThread',{id,name:'ZCode test',cwd:'/fixture/project',model:'zai/glm',status:'idle',freshUsage:true,usageFresh:true,lastUsage:{totalTokens:10000},observedWindow:200000,nativeModel:{slug:'zai/glm',context_window:200000,max_context_window:200000}});
 const state=await call('/state');assert.equal(state.provider,'zcode');assert.equal(state.threads.length,1);assert.equal(state.threads[0].modelMetadata.max_context_window,200000);assert.equal(state.sidebar.projects.length,1);assert.equal(state.quota.updatedAt,null);assert.equal(state.update.available,false);
 await call('/policy',{id,policy:{window:180000,compact:140000,reserve:21000}});assert.equal(commands.at(-1).op,'setPolicy');
 assert.equal(JSON.parse(fs.readFileSync(path.join(home,'zcode-policies.json'))).policies[id].window,180000);
 await call('/compact',{id});assert.equal(commands.at(-1).op,'compact');
 const stats=await call('/context-stats',{id});assert.equal(stats.inputTokens,10000);assert.equal(stats.cost.usd,null);
 await call('/task-queue',{id,action:'add',prompt:'fixture task'});await call('/task-queue',{id,action:'enable',enabled:true});
 for(let i=0;i<100&&!commands.some(c=>c.op==='queue-start');i++)await new Promise(r=>setTimeout(r,30));
 assert.ok(commands.some(c=>c.op==='queue-start'));
 assert.equal((await call('/state')).taskQueues.quotaProtection,false);
});
test('Wrapper forwards a fake desktop exchange and joins the isolated manager without changing the application',async t=>{
 const home=fs.mkdtempSync(path.join(repo,'.local','w-')),entry=path.join(home,'fake-agent.cjs');
 const snapshot={session:{sessionId:'wrapper-session',title:'Wrapper fixture',workspace:{workspacePath:'/fixture/project'},sessionKind:'interactive',model:{providerId:'zai',modelId:'glm'},updatedAt:1700000000000},projection:{status:'idle',contextUsed:1234,contextWindow:200000,pendingPermissions:[]},runtime:{stateRevision:1,contextUsage:{used:1234,size:200000}}};
 snapshot.messages=[{info:{role:'assistant',sessionId:'wrapper-session',messageId:'billing-fixture',time:{completed:2},model:{providerId:'sensenova',modelId:'glm-5.2'},tokens:{input:100000,output:10000,reasoning:2000,cache:{read:80000,write:0}}}}];
 const frame={method:'v4/conversation/frame',params:{wireVersion:1,kind:'complete',topic:'conversation/wrapper-session',frame:{payload:{kind:'snapshot'}}}};
 fs.writeFileSync(entry,`const readline=require('node:readline');const snapshot=${JSON.stringify(snapshot)};readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.method==='session/read')process.stdout.write(JSON.stringify({id:m.id,result:snapshot})+'\\n');else process.stdout.write(JSON.stringify({id:m.id,result:{ack:true}})+'\\n'+JSON.stringify(${JSON.stringify(frame)})+'\\n');});`);
 const wrapper=spawn(process.execPath,[path.join(repo,'src/zcode/wrapper.mjs'),'app-server','--stdio'],{env:{...process.env,ZCODE_CONTROL_USAGE_DB:path.join(home,"missing-usage.sqlite"),ZCODE_CONTROL_HOME:home,CONTEXT_CONTROL_HOME:home,ZCODE_CONTROL_RUNTIME_ENTRY:entry},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';wrapper.stdout.on('data',b=>stdout+=b);wrapper.stderr.on('data',b=>stderr+=b);
 t.after(async()=>{wrapper.kill();await new Promise(r=>{if(wrapper.exitCode!==null)r();else wrapper.once('exit',r);});try{const c=JSON.parse(fs.readFileSync(path.join(home,'connection.json')));await fetch(`http://127.0.0.1:${c.port}/shutdown`,{method:'POST',headers:{Authorization:'Bearer '+c.token},body:'{}'});for(let i=0;i<40&&fs.existsSync(path.join(home,'connection.json'));i++)await new Promise(r=>setTimeout(r,30));}catch{}fs.rmSync(home,{recursive:true,force:true});});
 wrapper.stdin.write(JSON.stringify({id:'desktop-1',method:'session/create',params:{}})+'\n');
 let state;
 for(let i=0;i<120;i++){
  try{const c=JSON.parse(fs.readFileSync(path.join(home,'connection.json')));state=await (await fetch(`http://127.0.0.1:${c.port}/state`,{headers:{Authorization:'Bearer '+c.token}})).json();if(state.bridgeCount===1&&state.threads.length===1&&stdout.includes('desktop-1'))break;}catch{}
  await new Promise(r=>setTimeout(r,30));
 }
 assert.equal(state?.bridgeCount,1,stderr);assert.equal(state.threads[0].lastUsage.totalTokens,1234);
 assert.equal(state.threads[0].nativeBilling.cost.currency,'CNY');assert.ok(Math.abs(state.threads[0].nativeBilling.cost.amount-0.6)<1e-12);
 assert.equal(stdout,JSON.stringify({id:'desktop-1',result:{ack:true}})+'\n'+JSON.stringify(frame)+'\n');
});
