import test from 'node:test';
import assert from 'node:assert/strict';
import {zcodeSidebar,defaultWorkspace} from '../src/zcode/presentation.mjs';

test('Projectless tasks and ZCode scratch workspaces share one default project',()=>{
 const cwd='C:\\Users\\person\\.zcode\\workspace\\';
 const threads=[{id:'none'},{id:'empty',cwd:''},{id:'draft',cwd:cwd+'draft-65afcd00-aaf6-4a62-a2bf-39daa858d021'},{id:'timestamp',cwd:cwd+'1793082560858-3ed8e0bf-4f54-45ac-a61a-876ca20d1246'},{id:'default',cwd:cwd+'default'},{id:'mac',cwd:'/Users/person/.zcode/workspace/draft-aabb-1234'},{id:'project',cwd:'D:\\Desktop\\操作系统'}];
 const original=structuredClone(threads),sidebar=zcodeSidebar(threads);
 assert.equal(sidebar.projects.length,2);assert.deepEqual(sidebar.standaloneThreadIds,[]);
 const group=sidebar.projects.find(p=>p.name==='default');
 assert.deepEqual(group.threadIds,['none','empty','draft','timestamp','default','mac']);assert.deepEqual(group.roots,[]);
 assert.equal(sidebar.projects.find(p=>p.name==='操作系统').threadIds[0],'project');
 assert.deepEqual(threads,original); // Only presentation grouping changes; working directories are preserved.
});

test('Actual user projects are not swallowed by default grouping',()=>{
 for(const cwd of ['D:\\work\\default','/Users/person/projects/draft-aabb-1234','D:\\work\\1793082560858-3ed8e0bf-4f54-45ac-a61a-876ca20d1246','C:\\Users\\person\\.zcode\\workspace\\default\\real-project','/work/.zcode/workspace/named-project'])assert.equal(defaultWorkspace(cwd),false,cwd);
 assert.equal(defaultWorkspace('/Users/person/.zcode/workspace/'),true);
 assert.equal(zcodeSidebar([{id:'a',cwd:null}]).projects[0].id,zcodeSidebar([{id:'b',cwd:'/Users/person/.zcode/workspace/default'}]).projects[0].id);
});
