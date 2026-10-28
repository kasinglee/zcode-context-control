import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createZcodeInstallerFixture} from '../scripts/zcode-installer-fixture.mjs';
const installer=process.env.CONTEXT_CONTROL_TEST_INSTALLER_APP;
test('Mac DMG installer persists bundled runtime, preserves preferences and survives download deletion',{skip:!installer||process.platform!=='darwin',timeout:180000},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'zcode-distribution-')),download=path.join(temp,'download'),home=path.join(temp,'control'),applications=path.join(temp,'Applications');
 const run=(command,args,env)=>spawnSync(command,args,{env,encoding:'utf8',timeout:120000});
 try{
  fs.mkdirSync(download);fs.mkdirSync(home);
  const app=path.join(download,'Install Context Manager.app');fs.cpSync(installer,app,{recursive:true});
  const resources=path.join(app,'Contents/Resources'),manifest=JSON.parse(fs.readFileSync(path.join(resources,'payload-manifest.json')));
  assert.equal(manifest.arch,'arm64');assert.ok(manifest.files['scripts/install-distribution.mjs']);
  let result=run('/usr/bin/codesign',['--verify','--strict','--deep',app],process.env);assert.equal(result.status,0,result.stderr);
  const state={version:2,threads:{},policies:{saved:{window:180000}}},theme={theme:'light'},future={version:7,future:'keep'};
  for(const [name,value] of Object.entries({'state.json':state,'ui-settings.json':theme,'settings.json':future}))fs.writeFileSync(path.join(home,name),JSON.stringify(value));
  const env={...process.env,PATH:path.join(temp,'empty-path'),CONTEXT_CONTROL_HOME:home,ZCODE_CONTROL_HOME:home,CONTEXT_CONTROL_APPLICATIONS:applications,ZCODE_DESKTOP_EXECUTABLE:createZcodeInstallerFixture(temp,'darwin')};
  const executable=path.join(app,'Contents/MacOS/Installer');
  for(let i=0;i<2;i++){result=run(executable,['--install-update','--no-auto-start'],env);assert.equal(result.status,0,result.stdout+result.stderr);}
  const settings=JSON.parse(fs.readFileSync(path.join(home,'settings.json')));assert.equal(settings.provider,'zcode');assert.equal(settings.productVersion,manifest.version);assert.equal(settings.future,'keep');assert.equal(settings.version,7);
  assert.equal(settings.node,path.join(home,'code/vendor/node'));assert.ok(fs.existsSync(settings.installedApp));assert.ok(fs.existsSync(settings.launcher));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'state.json'))),state);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'ui-settings.json'))),theme);
  fs.rmSync(download,{recursive:true,force:true});
  result=run(settings.node,[path.join(settings.codeRoot,'src/cli.mjs'),'--version'],env);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),manifest.version);
  result=run(settings.node,['-e','const {DatabaseSync}=require("node:sqlite");new DatabaseSync(":memory:").close()'],env);assert.equal(result.status,0,result.stderr);
  result=run(settings.node,[path.join(settings.codeRoot,'scripts/install.mjs'),'--uninstall'],env);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(fs.existsSync(settings.installedApp),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'state.json'))),state);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'ui-settings.json'))),theme);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
