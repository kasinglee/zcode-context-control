import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {prepareDesktopEntry} from '../src/zcode/desktop-entry.mjs';
import {launchEnvironment} from '../src/zcode/launch.mjs';

test('Desktop storage worker delegates to the original runtime and exits without a bridge', async t => {
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'zcc-storage-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const resources=path.join(home,'resources');fs.mkdirSync(resources);
 fs.writeFileSync(path.join(resources,'app.asar'),'resolveBundledWorkspaceZCodeAgentCommand supportsStorageStartup --prepare-storage');
 const entry=path.join(resources,'native.cjs');
 fs.writeFileSync(entry,`const {parentPort}=require('node:worker_threads');parentPort.postMessage({native:true,args:process.argv.slice(2)});`);
 const desktop=prepareDesktopEntry({home,installation:{resources,entry}});
 const argv=['app-server','--stdio','--prepare-storage','--cwd',home];
 const worker=new Worker(desktop.entry,{argv});
 const message=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
 assert.deepEqual(message,{native:true,args:argv});
 assert.equal(await new Promise(resolve=>worker.once('exit',resolve)),0);
 assert.equal(fs.existsSync(path.join(home,'connection.json')),false);
 fs.writeFileSync(path.join(resources,'app.asar'),'unsupported');
 assert.throws(()=>prepareDesktopEntry({home,installation:{resources,entry}}),/不支持/);
});

test('Legacy overrides and bytecode mode cannot bypass compatible desktop entry',()=>{
 const env=launchEnvironment({home:'/control',node:'/node',runtime:{entry:'/runtime'},env:{ZCODE_AGENT_SERVER_COMMAND:'old',ZCODE_AGENT_SERVER_ARGS_JSON:'[]',ZCODE_AGENT_SERVER_CWD:'old',ZCODE_DESKTOP_AGENT_BYTECODE:'1',ELECTRON_RUN_AS_NODE:'1',KEEP:'yes'}});
 for(const key of ['ZCODE_AGENT_SERVER_COMMAND','ZCODE_AGENT_SERVER_ARGS_JSON','ZCODE_AGENT_SERVER_CWD','ZCODE_DESKTOP_AGENT_BYTECODE','ELECTRON_RUN_AS_NODE'])assert.equal(env[key],undefined);
 assert.equal(env.KEEP,'yes');
});
