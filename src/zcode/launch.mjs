import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {discoverZcode} from './discovery.mjs';
import {prepareRuntimeCopy} from './runtime-copy.mjs';
import {root,atomicJSON,readJSON} from '../paths.mjs';
import {ensureDaemon} from '../service.mjs';
import {ensureMenuBarEntry} from '../menu-bar.mjs';
export function launchEnvironment({installation,node=process.execPath,home=root,env=process.env,runtime}){
 const clean={...env};delete clean.ELECTRON_RUN_AS_NODE;
 return {...clean,ZCODE_CONTROL_HOME:home,CONTEXT_CONTROL_HOME:home,
  ZCODE_AGENT_SERVER_COMMAND:node,
  ZCODE_AGENT_SERVER_ARGS_JSON:JSON.stringify([fileURLToPath(new URL('./wrapper.mjs',import.meta.url)),'app-server','--stdio']),
  ZCODE_CONTROL_RUNTIME_ENTRY:runtime.entry,ZCODE_CONTROL_POLICY_FILE:path.join(home,'zcode-policies.json')};
}
export async function launchZcode({installation=discoverZcode(),node=process.execPath,home=root}={}){
 const runtime=prepareRuntimeCopy(installation.entry,path.join(home,'runtimes'));
 const stored=readJSON(path.join(home,'settings.json'),{});
 const builtPanel=fileURLToPath(new URL('../../build/ZCode Context Control.app',import.meta.url));if(process.platform==='darwin'&&fs.existsSync(builtPanel))stored.installedApp=builtPanel;
 atomicJSON(path.join(home,'settings.json'),{...stored,node,desktopExecutable:installation.executable,provider:'zcode',launcher:fileURLToPath(import.meta.url)});
 await ensureDaemon();ensureMenuBarEntry(stored.installedApp,home);
 const child=spawn(installation.executable,[],{detached:true,stdio:'ignore',env:launchEnvironment({installation,node,home,runtime})});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 return {ok:true,provider:'zcode',runtimeFingerprint:runtime.sha256,home};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await launchZcode(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
