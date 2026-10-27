import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {discoverZcode} from './discovery.mjs';
import {patchRuntime} from './runtime-copy.mjs';
import {version} from '../version.mjs';
export function diagnose(options){
 const installation=discoverZcode(options),source=fs.readFileSync(installation.entry,'utf8');
 let budgetHook=false;try{patchRuntime(source);budgetHook=true;}catch{}
 return {version,provider:'zcode',installation,runtimeSHA256:createHash('sha256').update(source).digest('hex'),
  capabilities:{sessionProtocol:source.includes('session/read')&&source.includes('session/compact'),budgetHook,
   nativeCompaction:source.includes('session/compact'),usage:source.includes('contextUsage'),
   quota:false,accountSwitch:false,contextExtension920K:false,automaticUpdates:false},
  validation:'static inspection only; no agent started, credentials or chat data read',
  launch:'node src/zcode/launch.mjs (quit ZCode first so the new process receives the integration environment)'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(diagnose(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
