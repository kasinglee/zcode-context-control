import fs from 'node:fs';
import path from 'node:path';
export function createZcodeInstallerFixture(root,platform=process.platform){
 const base=platform==='win32'?path.join(root,'ZCode'):path.join(root,'Fixture ZCode.app','Contents');
 const resources=path.join(base,platform==='win32'?'resources':'Resources');
 const executable=path.join(base,platform==='win32'?'ZCode.exe':'MacOS/ZCode');
 fs.mkdirSync(path.join(resources,'glm'),{recursive:true});fs.mkdirSync(path.dirname(executable),{recursive:true});
 fs.writeFileSync(executable,platform==='win32'?'fixture':'#!/bin/sh\nexit 0\n',{mode:0o700});
 fs.writeFileSync(path.join(resources,'glm/zcode.cjs'),'// Fixture runtime; never launched during installation.\n');
 fs.writeFileSync(path.join(resources,'app.asar'),'resolveBundledWorkspaceZCodeAgentCommand supportsStorageStartup --prepare-storage');
 return executable;
}
