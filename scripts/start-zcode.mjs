import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {root,readJSON,atomicJSON} from '../src/paths.mjs';
import {launchZcode} from '../src/zcode/launch.mjs';
import {version} from '../src/version.mjs';
import {discoverZcode} from '../src/zcode/discovery.mjs';
import {processInfo} from '../src/platform/index.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const panel=path.join(repo,'build',`Context-Manager-${version}-windows-${process.arch}`,'payload','ContextManager.exe');
if(process.platform==='win32'){
 if(!fs.existsSync(panel))throw Error('管理器尚未构建，请先运行 node scripts/build-win.mjs --directory-only');
 atomicJSON(path.join(root,'settings.json'),{...readJSON(path.join(root,'settings.json'),{}),version,provider:'zcode',installedApp:panel,node:process.execPath,launcher:path.join(repo,'src/zcode/launch.mjs')});
 const status=readJSON(path.join(root,'ui-status.json'),{});
 const previous=Number.isSafeInteger(status.pid)?processInfo(status.pid)?.executable:null;
 if(previous&&status.bundleIdentifier==='io.github.zcode-context-control'&&previous.toLowerCase()!==panel.toLowerCase()&&path.relative(path.join(repo,'build'),previous).match(/^Context-Manager-[\d.]+-windows-[^\\/]+[\\/]payload[\\/]ContextManager\.exe$/i)){
  const env={...process.env,ZCODE_CONTROL_HOME:root,CONTEXT_CONTROL_HOME:root};delete env.ELECTRON_RUN_AS_NODE;
  const old=spawn(previous,['--quit'],{env,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{old.once('exit',resolve);old.once('error',reject);});
  for(let i=0;i<100;i++){try{process.kill(status.pid,0);}catch{break;}await new Promise(resolve=>setTimeout(resolve,50));}
 }
}
let state;
try{const c=readJSON(path.join(root,'connection.json'));state=await(await fetch(`http://127.0.0.1:${c.port}/state`,{headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(1500)})).json();}catch{}
if(!state?.bridgeCount){
 if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-Command','$p=Get-Process ZCode -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $env:ZCC_DESKTOP_EXE -and $_.MainWindowHandle -ne 0}; foreach($z in $p){[void]$z.CloseMainWindow(); if(-not $z.WaitForExit(3000)){& taskkill.exe /PID $z.Id /T /F | Out-Null; if($LASTEXITCODE -ne 0){throw "Cannot restart ZCode"}}}; exit 0'],{env:{...process.env,ZCC_DESKTOP_EXE:discoverZcode().executable},windowsHide:true,stdio:'pipe'});
 await launchZcode();
 // launchZcode starts the tray panel in the background. Wait until its
 // single-instance handler is ready before requesting the visible window.
 if(process.platform==='win32')for(let i=0;i<100;i++){
  if(readJSON(path.join(root,'ui-status.json'),{})?.menuReady)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
}
if(process.platform==='win32'){
 if(!fs.existsSync(panel))throw Error('管理器尚未构建，请先运行 node scripts/build-win.mjs --directory-only');
 const env={...process.env,ZCODE_CONTROL_HOME:root,CONTEXT_CONTROL_HOME:root,CONTEXT_CONTROL_NODE:process.execPath};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(panel,[],{env,detached:true,windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
}
console.log('ZCode Context Control '+version+' 已启动。');
