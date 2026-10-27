import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {discoverZcode} from '../src/zcode/discovery.mjs';
import {patchRuntime,hookAnchor} from '../src/zcode/runtime-copy.mjs';
import {ZcodeProtocol,snapshotThread} from '../src/zcode/protocol.mjs';
import {ZcodeBridge} from '../src/zcode/bridge.mjs';
import {launchEnvironment} from '../src/zcode/launch.mjs';
import {createQuotaManager,createUpdateManager} from '../src/zcode/status.mjs';
import {zcodeSidebar,zcodeStatistics} from '../src/zcode/presentation.mjs';
const snapshot=(status='idle',revision=1)=>({session:{sessionId:'session-1',title:'测试聊天',workspace:{workspacePath:'/fixture/project'},sessionKind:'interactive',model:{providerId:'zai',modelId:'glm-5'},updatedAt:1700000000000},projection:{status,contextUsed:10000,contextWindow:200000,pendingPermissions:[]},runtime:{stateRevision:revision,contextUsage:{used:10000,size:200000}}});
test('Mac discovery only uses ZCode and does not fall back to Codex',()=>{
 const seen=[];const found=discoverZcode({platform:'darwin',env:{},exists:p=>(seen.push(p),true)});
 assert.match(found.entry,/ZCode\.app.*glm\/zcode\.cjs$/);assert.ok(seen.every(p=>!p.includes('Codex')));
 assert.throws(()=>discoverZcode({platform:'darwin',env:{},exists:()=>false}),/不会回退到 Codex/);
});
test('Windows supports custom installation path and native path separators',()=>{
 const found=discoverZcode({platform:'win32',env:{ZCODE_DESKTOP_EXECUTABLE:'D:\\Apps\\ZCode\\ZCode.exe'},exists:()=>true});
 assert.equal(found.entry,'D:\\Apps\\ZCode\\resources\\glm\\zcode.cjs');
});
test('Runtime hook clamps to native capacity, reserves output and fails closed on changed source',()=>{
 const source='function fake(){return {'+hookAnchor+'}}';
 const patched=patchRuntime(source),prelude=patched.slice(0,patched.indexOf('function fake'));
 let state={policies:{s:{window:180000,compact:150000,enabled:true}}};
 const sandbox={process:{env:{ZCODE_CONTROL_POLICY_FILE:'fixture'}},require:()=>({readFileSync:()=>JSON.stringify(state)})};
 vm.runInNewContext(prelude,sandbox);const config={contextWindow:200000,maxOutputTokens:32000};
 let result=sandbox.__zccPolicy('s',config);assert.equal(result.contextWindow,180000);assert.equal(result.bufferTokens,9000);
 state.policies.s.window=920000;assert.equal(sandbox.__zccPolicy('s',config),config);
 state.policies.s={window:180000,compact:179000};assert.equal(sandbox.__zccPolicy('s',config),config);
 state.policies.s={enabled:false};state.defaults={window:180000,compact:150000};assert.equal(sandbox.__zccPolicy('s',config),config);
 state.policies={};assert.equal(sandbox.__zccPolicy('new',config),config);
 assert.throws(()=>patchRuntime('unknown'),/不匹配/);assert.throws(()=>patchRuntime(source+source),/不匹配/);
});
test('RPC keeps desktop frames byte-for-byte and consumes only its own split responses',async()=>{
 const sent=[],forward=[];const rpc=new ZcodeProtocol({send:b=>sent.push(JSON.parse(b)),forward:b=>forward.push(b)});
 const pending=rpc.call('session/read',{sessionId:'s'});assert.deepEqual(Object.keys(sent[0]),['id','method','params']);
 const original=Buffer.from('{"id":42,"result":{"text":"中文"}}\n');
 const reply=Buffer.from(JSON.stringify({id:sent[0].id,result:{ok:true}})+'\n');const all=Buffer.concat([original,reply]);
 for(const byte of all)rpc.ingest(Buffer.from([byte]));
 assert.deepEqual(await pending,{ok:true});assert.deepEqual(Buffer.concat(forward),original);rpc.close();
});
test('Timed-out internal replies do not leak to desktop and disconnect rejects pending work',async()=>{
 let sent;const forwarded=[];const rpc=new ZcodeProtocol({timeout:5,send:b=>sent=JSON.parse(b),forward:b=>forwarded.push(b)});
 await assert.rejects(rpc.call('slow'),/timeout/);rpc.ingest(JSON.stringify({id:sent.id,result:{}})+'\n');assert.equal(forwarded.length,0);
 const p=rpc.call('pending');rpc.close();await assert.rejects(p,/disconnected/);
});
test('Metadata is provider-qualified, reports native usage and excludes child agents',()=>{
 const s=snapshot(),t=snapshotThread(s);assert.equal(t.model,'zai/glm-5');assert.equal(t.observedWindow,200000);assert.equal(t.lastUsage.totalTokens,10000);
 s.session.sessionKind='subagent_child';assert.equal(snapshotThread(s).canAcceptDirectInput,false);
 assert.equal(zcodeSidebar([t]).projects[0].threadIds[0],t.id);
 assert.equal(zcodeStatistics(t).cost.usd,null);
});
test('Queue sends once, requires matching interrupt identity and preserves uncertain failures',async()=>{
 const calls=[],notices=[],policies=[];
 const bridge=new ZcodeBridge({rpc:{call:async(method,params)=>(calls.push({method,params}),{accepted:true,stateRevision:2})},notify:async t=>(notices.push(t),{}),policyState:{set:(...p)=>policies.push(p)}});
 await bridge.observe(snapshot());
 const task={executionId:'exec-1',taskId:'t',prompt:'hello',settings:{approval:'inherit',model:'zai/glm-5',effort:'high'}};
 await bridge.command('queue-start',{id:'session-1',task});await bridge.command('queue-start',{id:'session-1',task});assert.equal(calls.length,1);assert.equal(calls[0].params.modelSelection.options.reasoningLevel,'high');
 await bridge.observe(snapshot('idle',1));assert.equal(bridge.tasks.get('session-1').status,'running');
 await bridge.observe(snapshot('idle',2));assert.equal(bridge.tasks.get('session-1').status,'completed');
 await assert.rejects(bridge.command('queue-interrupt',{id:'session-1',executionId:'wrong'}),/已变化/);
 bridge.rpc.call=async()=>{throw Error('connection lost');};await bridge.command('queue-start',{id:'session-1',task:{...task,executionId:'exec-2'}});
 assert.equal(bridge.tasks.get('session-1').errorConfirmed,false);
});
test('Budgets reject unsupported capacity and active native compaction',async()=>{
 const bridge=new ZcodeBridge({rpc:{call:async()=>({})},notify:async()=>({}),policyState:{set(){}}});
 await bridge.observe(snapshot());await assert.rejects(bridge.command('setPolicy',{id:'session-1',policy:{window:920000,compact:800000}}),/原生窗口/);
 await bridge.observe(snapshot('running'));await assert.rejects(bridge.command('compact',{id:'session-1'}),/轮次结束/);
});
test('Launch env removes Electron node mode for the desktop and includes cross-platform wrapper',()=>{
 const env=launchEnvironment({home:'/fixture/control',node:'/fixture/node',runtime:{entry:'/fixture/zcode.cjs'},env:{ELECTRON_RUN_AS_NODE:'1'}});
 assert.equal(env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(env.ZCODE_AGENT_SERVER_COMMAND,'/fixture/node');assert.match(JSON.parse(env.ZCODE_AGENT_SERVER_ARGS_JSON)[0],/wrapper\.mjs$/);
});
test('Unavailable quotas and updates never report success or use the upstream feed',async()=>{
 assert.equal(createQuotaManager().state().updatedAt,null);assert.equal(createQuotaManager().state().stale,true);
 const updates=createUpdateManager({current:'0.27.12'});assert.equal((await updates.check()).available,false);await assert.rejects(updates.install(),/发布源/);
});
test('Saved global defaults attach to new sessions only; resumed sessions retain native policy',async()=>{
 const applied=[];const notices=[];const bridge=new ZcodeBridge({rpc:{},notify:async thread=>(notices.push(thread),{policy:thread.newChatPolicy}),policyState:{defaults:()=>({usableWindow:180000,compact:140000,revision:2}),set:(id,p)=>applied.push({id,p})}});
 await bridge.observe(snapshot());assert.equal(applied.length,0);
 const fresh=snapshot();fresh.session.sessionId='fresh-session';await bridge.observe(fresh,{newSession:true});assert.equal(applied[0].p.window,180000);assert.equal(applied[0].p.sourceDefaultsRevision,2);
 const fork=snapshot();fork.session.sessionId='fork-session';fork.session.parentSessionId='parent';await bridge.observe(fork,{newSession:true});assert.equal(applied.length,1);
});
