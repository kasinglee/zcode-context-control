import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {discoverZcode} from './discovery.mjs';
import {prepareDesktopEntry} from './desktop-entry.mjs';
import {verifyWindowsPayload,removeInstallationTree} from '../platform/windows-install.mjs';
import {privateDirectory,powershell} from '../platform/index.mjs';
import {prepareUpgrade,completeUpgrade,inheritedSettings} from '../upgrade-state.mjs';
import {replaceDirectory} from '../install-layout.mjs';
import {installQueueCLI,removeQueueCLI} from '../cli-launcher.mjs';
import {readJSON,atomicJSON} from '../paths.mjs';
import {stopMenuBarEntry} from '../menu-bar.mjs';
const same=(a,b)=>a&&b&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();

async function stopPrevious(home,previous){
 const connection=readJSON(path.join(home,'connection.json'),{});
 if(connection.port&&previous.codeRoot&&same(connection.script,path.join(previous.codeRoot,'src/daemon.mjs'))){
  try{
   const headers={Authorization:'Bearer '+connection.token};
   const state=await(await fetch(`http://127.0.0.1:${connection.port}/state`,{headers,signal:AbortSignal.timeout(3000)})).json();
   if(state.bridgeCount>0)throw Error('请先完整退出 ZCode，再安装更新或卸载，以保留运行中的任务。');
   const response=await fetch(`http://127.0.0.1:${connection.port}/shutdown`,{method:'POST',headers,signal:AbortSignal.timeout(3000)});
   if(!response.ok)throw Error('本地服务暂不能安全退出，请稍后重试。');
   for(let i=0;i<100&&fs.existsSync(path.join(home,'connection.json'));i++)await new Promise(r=>setTimeout(r,50));
   if(fs.existsSync(path.join(home,'connection.json')))throw Error('本地服务尚未退出。');
  }catch(error){if(error.cause?.code!=='ECONNREFUSED'&&error.name!=='TimeoutError')throw error;}
 }
 if(previous.installedApp&&fs.existsSync(previous.installedApp))await stopMenuBarEntry(previous.installedApp);
}

function windowsShortcuts({home,app,code,node,remove=false}){
 powershell(`$folder=Join-Path ([Environment]::GetFolderPath('Programs')) 'ZCode Context Control';
 $names=@('ZCode Context Control.lnk','ZCode with Context Control.lnk');$targets=@($env:ZCC_APP,$env:ZCC_NODE);
 if($env:ZCC_REMOVE -eq '1'){foreach($name in $names){$file=Join-Path $folder $name;if(Test-Path -LiteralPath $file){$shell=New-Object -ComObject WScript.Shell;$link=$shell.CreateShortcut($file);if($link.WorkingDirectory -eq $env:ZCC_CODE){Remove-Item -LiteralPath $file}}};exit}
 New-Item -ItemType Directory -Path $folder -Force|Out-Null;
 $shell=New-Object -ComObject WScript.Shell;
 $link=$shell.CreateShortcut((Join-Path $folder $names[0]));$link.TargetPath=$env:ZCC_LAUNCHER;$link.Arguments='';$link.WorkingDirectory=$env:ZCC_CODE;$link.IconLocation=$env:ZCC_APP+',0';$link.Save();
 $link=$shell.CreateShortcut((Join-Path $folder $names[1]));$link.TargetPath=$env:ZCC_NODE;$link.Arguments='"'+(Join-Path $env:ZCC_HOME 'bin/zcode-start.mjs')+'"';$link.WorkingDirectory=$env:ZCC_CODE;$link.IconLocation=$env:ZCC_APP+',0';$link.Save();`,
 {ZCC_HOME:home,ZCC_APP:app||'',ZCC_NODE:node||'',ZCC_CODE:code||'',ZCC_LAUNCHER:path.join(home,'bin','ZCode Context Control.vbs'),ZCC_REMOVE:remove?'1':'0'});
}

export async function installDistribution({source,home,payload,platform=process.platform,applications,noOpen=false,noShortcut=false,uninstall=false}){
 if(!['win32','darwin'].includes(platform))throw Error('安装器仅支持 Windows 和 macOS。');
 privateDirectory(home);const file=path.join(home,'settings.json'),previous=readJSON(file,{}),windows=platform==='win32';
 const base=path.resolve(applications||(windows?path.join(process.env.LOCALAPPDATA,'Programs','ZCodeContextControl'):path.join(os.homedir(),'Applications')));
 if(uninstall){
  if(previous.provider!=='zcode'||!previous.installBase||!same(previous.installBase,base))throw Error('未找到当前目录下由本安装器管理的 ZCode Context Control。');
  await stopPrevious(home,previous);removeQueueCLI(home,platform);
  if(windows){
   if(!noShortcut)windowsShortcuts({home,app:previous.installedApp,code:previous.codeRoot,node:previous.node,remove:true});
   const target=path.dirname(previous.installedApp||'');
   if(!same(path.dirname(target),path.join(base,'versions')))throw Error('安装路径校验失败。');
   verifyWindowsPayload(target,{version:previous.productVersion});
   for(const entry of fs.readdirSync(path.join(base,'versions'),{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    const directory=path.join(base,'versions',entry.name);
    // Only remove packages that have a complete verified manifest and our
    // package identity; unrelated files in Applications are retained.
    try{verifyWindowsPayload(directory);if(readJSON(path.join(directory,'resources/app/package.json'),{}).name!=='zcode-context-control')continue;}catch{continue;}
    removeInstallationTree(base,directory);
   }
  }else{
   const app=path.join(base,'ZCode Context Control.app');
   if(!same(app,previous.installedApp)||!same(previous.codeRoot,path.join(home,'code')))throw Error('安装路径校验失败。');
   fs.rmSync(app,{recursive:true,force:true});fs.rmSync(path.join(home,'code'),{recursive:true,force:true});
  }
  for(const name of ['ZCode Context Control.vbs','zcode-start.mjs'])fs.rmSync(path.join(home,'bin',name),{force:true});
  atomicJSON(file,{...previous,uninstalled:true,installedApp:null});return {uninstalled:true,home};
 }
 const installation=discoverZcode();
 const pkg=readJSON(path.join(source,'package.json'));if(!pkg||!/^\d+\.\d+\.\d+$/.test(pkg.version))throw Error('安装包版本无效。');
 // Probe the storage entry without launching ZCode or modifying its bundle.
 prepareDesktopEntry({installation,home});
 let manifest,target,code,node,app;
 if(windows){
  if(!payload)throw Error('Windows 安装缺少完整 payload。');
  manifest=verifyWindowsPayload(payload,{version:pkg.version});
  const identity=crypto.createHash('sha256').update(fs.readFileSync(path.join(payload,'payload-manifest.json'))).digest('hex').slice(0,12);
  target=path.join(base,'versions',pkg.version+'-'+identity);code=path.join(target,'resources/app');node=path.join(code,'vendor/node.exe');app=path.join(target,'ContextManager.exe');
 }else{
  target=path.join(home,'code');code=target;node=path.join(code,'vendor/node');app=path.join(base,'ZCode Context Control.app');
  if(!fs.existsSync(path.join(source,'build/ZCode Context Control.app/Contents/MacOS/ContextControl'))||!fs.existsSync(path.join(source,'vendor/node')))throw Error('安装包缺少原生应用或内置 Node。');
 }
 await stopPrevious(home,previous);
 const upgrade=prepareUpgrade({home,version:pkg.version,previousVersion:previous.productVersion});
 if(windows){
  if(!fs.existsSync(target))replaceDirectory(target,stage=>{fs.cpSync(payload,stage,{recursive:true});verifyWindowsPayload(stage,{version:pkg.version});});
  else verifyWindowsPayload(target,{version:pkg.version});
 }else{
  if(same(source,target))throw Error('请从下载的 DMG 安装器执行更新。');
  replaceDirectory(target,stage=>fs.cpSync(source,stage,{recursive:true}));
  replaceDirectory(app,stage=>{
   fs.cpSync(path.join(code,'build/ZCode Context Control.app'),stage,{recursive:true});
   const result=spawnSync('/usr/bin/codesign',['--verify','--strict','--deep',stage],{encoding:'utf8'});
   if(result.status!==0)throw Error('原生应用签名校验失败：'+result.stderr);
  });
 }
 atomicJSON(file,inheritedSettings(previous,{version:1,provider:'zcode',productVersion:pkg.version,platform,codeRoot:code,node,installBase:base,installedApp:app,desktopExecutable:installation.executable,launcher:path.join(code,'src/zcode/launch.mjs'),hookCommand:null,uninstalled:false}));
 installQueueCLI({home,node,codeRoot:code,platform});
 fs.writeFileSync(path.join(home,'bin/zcode-start.mjs'),`process.env.CONTEXT_CONTROL_HOME=${JSON.stringify(home)};process.env.ZCODE_CONTROL_HOME=${JSON.stringify(home)};await import(${JSON.stringify(pathToFileURL(path.join(code,'src/zcode/launch.mjs')).href)});\n`);
 if(windows){
  // Launching through a tiny owned VBS file supplies the persistent control home
  // without requiring a console, Node in PATH, or machine-wide environment edits.
  const vbs=value=>'"'+value.replaceAll('"','""')+'"';
  const launcher=path.join(home,'bin','ZCode Context Control.vbs');
  fs.writeFileSync(launcher,`Set shell = CreateObject("WScript.Shell")\r\nshell.Environment("Process")("CONTEXT_CONTROL_HOME") = ${vbs(home)}\r\nshell.Environment("Process")("ZCODE_CONTROL_HOME") = ${vbs(home)}\r\nshell.Run ${vbs('"'+app+'"')}, 0, False\r\n`);
  if(!noShortcut)windowsShortcuts({home,app,code,node});
 }
 atomicJSON(path.join(home,'integration.json'),{...readJSON(path.join(home,'integration.json'),{}),enabled:false,mode:'explicit_zcode_launcher'});
 completeUpgrade({home,...upgrade});
 if(!noOpen){
  if(windows){const env={...process.env,CONTEXT_CONTROL_HOME:home,ZCODE_CONTROL_HOME:home};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(app,[],{env,detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}
  else spawnSync('/usr/bin/open',['-a',app,'--env','CONTEXT_CONTROL_HOME='+home],{encoding:'utf8'});
 }
 return {version:pkg.version,home,installedApp:app,node};
}
