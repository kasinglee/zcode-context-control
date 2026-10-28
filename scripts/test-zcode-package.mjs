import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha,removeInstallationTree} from '../src/platform/windows-install.mjs';
import {powershell} from '../src/platform/index.mjs';
import {compileWindowsInstaller} from './windows-installer.mjs';
import {createZcodeInstallerFixture} from './zcode-installer-fixture.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(fs.readFileSync(path.join(repo,'package.json')));
const payload=path.join(repo,`build/Context-Manager-${pkg.version}-windows-${process.arch}/payload`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zcode-install-测试-')),home=path.join(temp,'control'),apps=path.join(temp,'apps'),extraction=path.join(temp,'extraction');
const standalone=process.argv.includes('--standalone');fs.mkdirSync(home);fs.mkdirSync(extraction);
const env={...process.env,CONTEXT_CONTROL_HOME:home,ZCODE_CONTROL_HOME:home,CONTEXT_CONTROL_APPLICATIONS:apps,ZCODE_DESKTOP_EXECUTABLE:createZcodeInstallerFixture(temp),TEMP:extraction,TMP:extraction};
let setup;
if(standalone){setup=path.join(temp,'download/独立 安装器.exe');fs.mkdirSync(path.dirname(setup));fs.copyFileSync(path.join(repo,`build/Context-Manager-${pkg.version}-windows-${process.arch}-Setup.exe`),setup);}
const state={version:9,policies:{saved:{window:180000}},threads:{},future:'keep'},ui={theme:'light',future:'keep'},settings={version:7,futurePreference:'keep'};
for(const [name,value] of Object.entries({'state.json':state,'ui-settings.json':ui,'settings.json':settings,'language.json':{selection:'zh'}}))fs.writeFileSync(path.join(home,name),JSON.stringify(value));
function run(source=payload,{remove=false,installer=setup,success=true}={}){
 const flags=['--no-open','--no-shortcut','--no-auto-start'];
 const command=standalone?installer:process.execPath;
 const args=standalone?[remove?'--uninstall':'--install',...flags]:[path.join(repo,'scripts/install-win.mjs'),'--payload',source,...flags,...(remove?['--uninstall']:[])];
 const result=spawnSync(command,args,{env,encoding:'utf8',windowsHide:true,timeout:180000});
 if(success)assert.equal(result.status,0,result.stdout+result.stderr);else assert.notEqual(result.status,0,'Corrupt payload must be rejected');
 assert.deepEqual(fs.readdirSync(extraction),[],'Extraction must be cleaned');
 return JSON.parse(fs.readFileSync(path.join(home,'settings.json')));
}
try{
 let installed=run();assert.equal(installed.provider,'zcode');assert.equal(installed.productVersion,pkg.version);assert.equal(installed.version,7);assert.equal(installed.futurePreference,'keep');
 assert.ok(installed.installedApp.startsWith(apps+path.sep));assert.ok(fs.existsSync(installed.installedApp));assert.ok(fs.existsSync(installed.node));assert.ok(fs.existsSync(installed.launcher));
 const first=installed.installedApp;installed=run();assert.equal(installed.installedApp,first);assert.equal(fs.readdirSync(path.join(apps,'versions')).length,1);
 for(const [name,value] of [['state.json',state],['ui-settings.json',ui],['language.json',{selection:'zh'}]])assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,name))),value);
 const cliResult=spawnSync(installed.node,[path.join(installed.codeRoot,'src/cli.mjs'),'--version'],{env,encoding:'utf8',windowsHide:true});assert.equal(cliResult.status,0,cliResult.stderr);assert.equal(cliResult.stdout.trim(),pkg.version);
 assert.equal(JSON.parse(fs.readFileSync(path.join(home,'integration.json'))).mode,'explicit_zcode_launcher');
 assert.ok(fs.existsSync(path.join(home,'bin/context-manager.cmd')));assert.ok(fs.existsSync(path.join(home,'bin/zcode-start.mjs')));
 if(standalone){fs.unlinkSync(setup);assert.equal(fs.readdirSync(path.dirname(setup)).length,0);assert.equal(spawnSync(installed.node,['--version'],{env,encoding:'utf8',windowsHide:true}).status,0);}
 const upgraded=path.join(temp,'upgrade-payload');fs.cpSync(payload,upgraded,{recursive:true});
 const next=pkg.version.split('.').map((v,i)=>Number(v)+(i===2?1:0)).join('.'),packageFile=path.join(upgraded,'resources/app/package.json'),p=JSON.parse(fs.readFileSync(packageFile));p.version=next;p.buildId='zcode-upgrade-test';fs.writeFileSync(packageFile,JSON.stringify(p));
 const manifestFile=path.join(upgraded,'payload-manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));manifest.version=next;manifest.buildId=p.buildId;manifest.files['resources/app/package.json']=sha(packageFile);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 let upgradeSetup;
 if(standalone){const archive=path.join(temp,'upgrade.zip');powershell('Add-Type -AssemblyName System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::CreateFromDirectory($env:ZCC_SOURCE,$env:ZCC_ZIP)',{ZCC_SOURCE:upgraded,ZCC_ZIP:archive},{timeout:180000});fs.writeFileSync(archive+'.sha256',sha(archive));upgradeSetup=path.join(temp,'upgrade.exe');compileWindowsInstaller({output:upgradeSetup,archive,checksum:archive+'.sha256',version:next});}
 // Run the upgraded payload's own installer, just as the SFX bootstrapper does.
 if(!standalone){const result=spawnSync(process.execPath,[path.join(upgraded,'resources/app/scripts/install-win.mjs'),'--payload',upgraded,'--no-open','--no-shortcut'],{env,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(result.status,0,result.stdout+result.stderr);installed=JSON.parse(fs.readFileSync(path.join(home,'settings.json')));}else installed=run(upgraded,{installer:upgradeSetup});
 assert.equal(installed.productVersion,next);assert.equal(installed.futurePreference,'keep');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'upgrade-backup/ui-settings.json'))),ui);
 const unchanged=fs.readFileSync(path.join(home,'settings.json'),'utf8');
 if(!standalone){fs.appendFileSync(path.join(upgraded,'resources/app/package.json'),' ');const result=spawnSync(process.execPath,[path.join(upgraded,'resources/app/scripts/install-win.mjs'),'--payload',upgraded,'--no-open','--no-shortcut'],{env,encoding:'utf8',windowsHide:true});assert.notEqual(result.status,0);assert.match(result.stderr,/integrity check failed/);assert.equal(fs.readFileSync(path.join(home,'settings.json'),'utf8'),unchanged);}
 // The standalone installer is self-contained; uninstall through its extracted
 // runtime. For direct tests use the intact original payload's script.
 if(standalone)run(upgraded,{remove:true,installer:upgradeSetup});else run(payload,{remove:true});
 assert.equal(fs.existsSync(installed.installedApp),false);assert.equal(fs.existsSync(first),false);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'state.json'))),state);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'ui-settings.json'))),ui);
 console.log(`${standalone?'WINDOWS_SETUP_TEST':'WINDOWS_PACKAGE_TEST'} passed: persistent ZCode installation, repeat install, bundled Node/CLI, preserved data, upgrade, corrupt payload rejection and uninstall`);
}finally{removeInstallationTree(os.tmpdir(),temp);}
