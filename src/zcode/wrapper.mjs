import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root,atomicJSON,readJSON} from '../paths.mjs';
import {version} from '../version.mjs';
import {connect} from '../ipc.mjs';
import {ensureDaemon} from '../service.mjs';
import {ZcodeProtocol} from './protocol.mjs';
import {ZcodeBridge} from './bridge.mjs';
const entry=process.env.ZCODE_CONTROL_RUNTIME_ENTRY;
if(!entry||!fs.existsSync(entry))throw Error('请通过 ZCode Context Control 启动桌面端。');
const policyFile=process.env.ZCODE_CONTROL_POLICY_FILE||path.join(root,'zcode-policies.json');
const policies=readJSON(policyFile,{policies:{}});policies.policies??={};
const policyState={defaults:()=>readJSON(policyFile,{}).defaults,set(id,policy){
 // Multiple workspace wrappers share one document. Merge the latest disk state.
 const current=readJSON(policyFile,{policies:{}});current.policies??={};current.policies[id]=policy;atomicJSON(policyFile,current);
}};
let child,peer,closed=false,attachTimer,pollTimer;
const rpc=new ZcodeProtocol({send:frame=>{if(!child?.stdin.writable)throw Error('ZCode stdin unavailable');child.stdin.write(frame);},forward:frame=>{if(!process.stdout.write(frame))child.stdout.pause();}});
process.stdout.on('drain',()=>child?.stdout.resume());
const bridge=new ZcodeBridge({rpc,policyState,notify:async thread=>peer?peer.call('updateThread',thread):null});
const newRequests=new Set();
rpc.on('message',message=>{const newSession=newRequests.delete(message.id);const snapshot=message.result?.snapshot??message.result??message.params?.snapshot;if(snapshot?.session&&snapshot?.projection)void bridge.observe(snapshot,{newSession}).catch(report);else if(message.method==='state.updated'&&typeof message.params?.sessionId==='string')void bridge.refresh(message.params.sessionId).catch(()=>{});});
function report(error){process.stderr.write('ZCode Context Control: '+error.message+'\n');}
child=spawn(process.execPath,[entry,...process.argv.slice(2)],{stdio:['pipe','pipe','inherit'],env:{...process.env,ZCODE_CONTROL_POLICY_FILE:policyFile}});
child.stdout.on('data',chunk=>{try{rpc.ingest(chunk);}catch(e){report(e);child.kill();}});
child.stdin.on('error',()=>{});
// Observe only create IDs; never store prompts or alter the forwarded bytes.
let inputTail='';process.stdin.on('data',chunk=>{inputTail+=chunk.toString('utf8');let end;while((end=inputTail.indexOf('\n'))>=0){const line=inputTail.slice(0,end);inputTail=inputTail.slice(end+1);try{const message=JSON.parse(line);if(message.method==='session/create'&&message.id!=null){if(newRequests.size>1024)newRequests.clear();newRequests.add(message.id);}}catch{}}if(inputTail.length>16*1024*1024)inputTail='';});
process.stdin.pipe(child.stdin);
async function attach(){
 if(closed)return;
 try{await ensureDaemon();if(closed)return;const next=await connect((op,p)=>bridge.command(op,p));if(closed){next.close();return;}peer=next;
  await peer.call('registerBridge',{provider:'zcode',pid:process.pid,nativePid:child.pid,version,taskQueueVersion:4,newChatDefaultsVersion:2});
  for(const thread of bridge.records.values())await peer.call('updateThread',thread);
  peer.socket.once('close',()=>{peer=null;if(!closed)attachTimer=setTimeout(attach,1000);});
 }catch(e){report(e);if(!closed)attachTimer=setTimeout(attach,1500);}
}
attach();
pollTimer=setInterval(()=>{for(const id of bridge.records.keys())void bridge.refresh(id).catch(()=>{});},2500);pollTimer.unref();
function cleanup(){if(closed)return;closed=true;clearInterval(pollTimer);clearTimeout(attachTimer);peer?.close();rpc.close();process.stdin.unpipe(child.stdin);process.stdin.destroy();}
process.stdin.once('end',()=>{child.stdin.end();setTimeout(()=>{if(child.exitCode===null)child.kill();},1000).unref();});
process.stdin.once('close',()=>{if(child.exitCode===null)child.kill();});
process.stdout.once('error',()=>child.kill());
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{cleanup();child.kill(signal);});
child.once('error',error=>{report(error);cleanup();process.exitCode=1;});
child.once('close',(code,signal)=>{cleanup();process.exitCode=code??(signal?1:0);});
