import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// A narrow, fingerprinted hook in a private copy. The signed app is read only.
export const hookAnchor='config:i,consecutiveFailures:this.autoCompactConsecutiveFailures,tokenOverride:h';
export function patchRuntime(source){
 if(source.split(hookAnchor).length!==2)throw Error('ZCode 压缩调用点不匹配，拒绝应用上下文补丁。');
 const prelude=`
// ZCode Context Control: bounded policy at the native compaction decision.
globalThis.__zccPolicy=(id,config)=>{try{
 const file=process.env.ZCODE_CONTROL_POLICY_FILE;if(!file)return config;
 const state=JSON.parse(require('node:fs').readFileSync(file,'utf8'));
 const policy=Object.hasOwn(state.policies||{},id)?state.policies[id]:null;
 if(!policy||policy.enabled===false)return config;
 const native=config.contextWindow,reserve=Math.min(config.maxOutputTokens??32000,21000);
 const window=policy.window??policy.usableWindow,compact=policy.compact;
 if(!Number.isSafeInteger(native)||!Number.isSafeInteger(window)||!Number.isSafeInteger(compact)||window<32000||window>native||compact<=0||compact>window-reserve)return config;
 return {...config,contextWindow:window,bufferTokens:window-reserve-compact};
 }catch{return config;}};
`;
 const clean=source.replace(/^#![^\n]*\n/,'');
 return prelude+clean.replace(hookAnchor,'config:globalThis.__zccPolicy(this.sessionId,i),consecutiveFailures:this.autoCompactConsecutiveFailures,tokenOverride:h');
}
export function prepareRuntimeCopy(entry,directory){
 const source=fs.readFileSync(entry,'utf8'),sha256=createHash('sha256').update(source).digest('hex');
 const patched=patchRuntime(source),folder=path.join(directory,sha256),file=path.join(folder,'zcode.cjs');
 fs.mkdirSync(folder,{recursive:true,mode:0o700});
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==patched)fs.writeFileSync(file,patched,{mode:0o600});
 // Bundled plugins resolve relative to the entry. Keep the original read-only tree.
 const packages=path.join(path.dirname(entry),'packages'),link=path.join(folder,'packages');
 if(fs.existsSync(packages)&&!fs.existsSync(link))fs.symlinkSync(packages,link,process.platform==='win32'?'junction':'dir');
 return {entry:file,sha256,sourceEntry:entry};
}
