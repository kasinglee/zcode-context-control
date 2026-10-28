import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {pruneTokenizer} from './prune-tokenizer.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),version=JSON.parse(fs.readFileSync(path.join(repo,'package.json'))).version;
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('This release currently targets Apple Silicon macOS.');
const sourceRevision=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).stdout.trim();
const dirty=()=>spawnSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).stdout.trim().length>0;
if(process.argv.includes('--release')&&dirty())throw Error('Release packaging requires a clean working tree');
const pin=JSON.parse(fs.readFileSync(path.join(repo,'packaging/node-runtime.json'))),archive=pin.archives.arm64;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(command,args){const r=spawnSync(command,args,{cwd:repo,stdio:'inherit'});if(r.error||r.status!==0)throw Error(command+' failed');}
const cache=path.join(repo,'build/vendor');fs.mkdirSync(cache,{recursive:true});const tarball=path.join(cache,archive.file);
if(!fs.existsSync(tarball)||hash(tarball)!==archive.sha256){
 const response=await fetch(archive.url);if(!response.ok)throw Error('Node download failed: '+response.status);
 const temporary=tarball+'.tmp';fs.writeFileSync(temporary,Buffer.from(await response.arrayBuffer()));if(hash(temporary)!==archive.sha256){fs.rmSync(temporary);throw Error('Node archive checksum mismatch');}fs.renameSync(temporary,tarball);
}
run('/usr/bin/tar',['-xzf',tarball,'-C',cache,`node-${pin.version}-darwin-arm64/bin/node`,`node-${pin.version}-darwin-arm64/LICENSE`]);
const nodeRoot=path.join(cache,`node-${pin.version}-darwin-arm64`);
if(!process.argv.includes('--use-built-panel'))run(process.execPath,['scripts/build-mac.mjs']);
const built=path.join(repo,'build/ZCode Context Control.app');if(!fs.existsSync(path.join(built,'Contents/MacOS/ContextControl')))throw Error('Build the native panel first');
const panelPlist=path.join(built,'Contents/Info.plist');
const plistValue=key=>{const r=spawnSync('/usr/libexec/PlistBuddy',['-c','Print :'+key,panelPlist],{encoding:'utf8'});if(r.status!==0)throw Error('Missing panel metadata: '+key);return r.stdout.trim();};
if(plistValue('CFBundleShortVersionString')!==version)throw Error('Built panel is stale; rebuild before packaging');
const iconName=plistValue('CFBundleIconFile');
if(path.basename(iconName)!==iconName)throw Error('Invalid panel icon name');
const iconSource=path.join(built,'Contents/Resources',iconName+'.icns');
const output=path.join(repo,'build/distribution'),app=path.join(output,'Install Context Manager.app'),resources=path.join(app,'Contents/Resources'),payload=path.join(resources,'payload');
fs.rmSync(app,{recursive:true,force:true});fs.mkdirSync(path.join(app,'Contents/MacOS'),{recursive:true});fs.mkdirSync(payload,{recursive:true});
fs.copyFileSync(iconSource,path.join(resources,iconName+'.icns'));
fs.copyFileSync(path.join(repo,'src/locales/en.json'),path.join(resources,'localization-en.json'));
fs.mkdirSync(path.join(payload,'src/locales'),{recursive:true});fs.copyFileSync(path.join(repo,'src/locales/en.json'),path.join(payload,'src/locales/en.json'));
fs.cpSync(path.join(repo,'src'),path.join(payload,'src'),{recursive:true});
fs.cpSync(path.join(repo,'skills'),path.join(payload,'skills'),{recursive:true});
fs.mkdirSync(path.join(payload,'runtime-patches'));const patchPin=JSON.parse(fs.readFileSync(path.join(repo,'runtime-patches/manifest.json')));for(const name of ['manifest.json','LICENSE','CODEX-NOTICE',patchPin.baseVersion+'.patch'])fs.copyFileSync(path.join(repo,'runtime-patches',name),path.join(payload,'runtime-patches',name));
const production=spawnSync('npm',['ls','--omit=dev','--all','--parseable'],{cwd:repo,encoding:'utf8'});if(production.status!==0)throw Error('Production dependencies are incomplete; run npm ci first');
fs.mkdirSync(path.join(payload,'node_modules'));for(const directory of production.stdout.trim().split('\n').filter(p=>p!==repo.replace(/\/$/,''))){const relative=path.relative(repo,directory);if(!relative.startsWith('node_modules'+path.sep)||fs.lstatSync(directory).isSymbolicLink())throw Error('Unsupported production dependency path');fs.cpSync(directory,path.join(payload,relative),{recursive:true});} 
pruneTokenizer(path.join(payload,'node_modules'));
for(const file of ['package.json','package-lock.json','LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(repo,file),path.join(payload,file));
fs.mkdirSync(path.join(payload,'scripts'));for(const name of ['install.mjs','install-distribution.mjs'])fs.copyFileSync(path.join(repo,'scripts',name),path.join(payload,'scripts',name));
fs.mkdirSync(path.join(payload,'build'));fs.cpSync(built,path.join(payload,'build/ZCode Context Control.app'),{recursive:true});
fs.cpSync(path.join(repo,'third-party-licenses'),path.join(payload,'third-party-licenses'),{recursive:true});
fs.mkdirSync(path.join(payload,'vendor'));fs.copyFileSync(path.join(nodeRoot,'bin/node'),path.join(payload,'vendor/node'));fs.chmodSync(path.join(payload,'vendor/node'),0o755);fs.copyFileSync(path.join(nodeRoot,'LICENSE'),path.join(payload,'vendor/Node-LICENSE.txt'));
run('xcrun',['swiftc','-parse-as-library','-O','-target','arm64-apple-macos14.0','macos/Localization.swift','packaging/Installer.swift','-o',path.join(app,'Contents/MacOS/Installer'),'-framework','SwiftUI','-framework','AppKit','-framework','CryptoKit']);
fs.writeFileSync(path.join(app,'Contents/Info.plist'),`<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>io.github.zcode-context-control.installer</string><key>CFBundleName</key><string>Install Context Manager</string><key>CFBundleExecutable</key><string>Installer</string><key>CFBundleIconFile</key><string>${iconName}</string><key>CFBundleLocalizations</key><array><string>en</string><string>zh-Hans</string></array><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>LSMinimumSystemVersion</key><string>14.0</string></dict></plist>`);
const identity=process.env.CONTEXT_CONTROL_SIGN_IDENTITY;
if(identity){
 run('/usr/bin/codesign',['--force','--options','runtime','--timestamp','--entitlements','packaging/node-entitlements.plist','--sign',identity,path.join(payload,'vendor/node')]);
 run('/usr/bin/codesign',['--force','--options','runtime','--timestamp','--sign',identity,path.join(payload,'build/ZCode Context Control.app')]);
}
if(identity){const signed=spawnSync('/usr/bin/codesign',['-d','--verbose=4',path.join(payload,'build/ZCode Context Control.app')],{encoding:'utf8'});if(!/Authority=Developer ID Application:/.test(signed.stderr))throw Error('Use a Developer ID Application identity for distribution');}
const files={};let bytes=0;
function scan(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected symlink in package: '+file);if(entry.isDirectory())scan(file);else{const relative=path.relative(payload,file).split(path.sep).join('/');if(/(^|\/)(auth\.json|state\.json|connection\.json|\.env)$/.test(relative))throw Error('Private runtime file in payload');files[relative]=hash(file);bytes+=fs.statSync(file).size;}}}
scan(payload);fs.writeFileSync(path.join(resources,'payload-manifest.json'),JSON.stringify({version,sourceRevision,dirtyWorkingTree:dirty(),arch:'arm64',nodeVersion:pin.version,developerIDSigned:!!identity,files},null,2)+'\n');
run('/usr/bin/codesign',['--force',...(identity?['--options','runtime','--timestamp']:[]),'--sign',identity||'-',app]);run('/usr/bin/codesign',['--verify','--strict','--deep',app]);
fs.writeFileSync(path.join(output,'README-FIRST.txt'),`ZCode Context Control ${version} — Apple Silicon preview

1. Install ZCode first. No Node, npm, Homebrew or Xcode is required.
2. Open the DMG and Install Context Manager.app; choose Install / Update.
3. Open ZCode Context Control from your Applications folder.
4. Fully quit ZCode before first integration, then choose Settings → General → Open ZCode in the manager.
5. The installer can be deleted after installation. Reopen it to uninstall; settings and usage records are retained.

先安装 ZCode，再打开 DMG 内的安装器选择「安装 / 更新」。安装后打开 Applications 中的 ZCode Context Control。
首次接入前完整退出 ZCode，再在管理器「设置 → 通用 → 打开 ZCode」启动。预算、主题与偏好在升级时保留。
深浅主题、default 分组、累计 token 与 GLM / DeepSeek 官方参考价估算已接入；未知价格不会当作零元。
账户额度、账号切换、云同步与上游自动更新尚未接入。仅使用模型原生上下文上限。

This preview is locally signed, not Developer ID signed or Apple notarized. If a trusted download is blocked,
follow System Settings → Privacy & Security → Open Anyway. Do not disable system security.
本预览包未 Apple 公证；确认下载来源后，可按「系统设置 → 隐私与安全」提示允许打开。

MIT license; third-party components retain their licenses. No credentials, chat history or personal configuration is bundled.
https://github.com/kasinglee/zcode-context-control
`);
const image=path.join(output,`Context-Manager-${version}-macos-arm64.dmg`);
const imageRoot=fs.mkdtempSync(path.join(output,'dmg-stage-'));
try{
 fs.cpSync(app,path.join(imageRoot,path.basename(app)),{recursive:true});
 fs.copyFileSync(path.join(output,'README-FIRST.txt'),path.join(imageRoot,'README-FIRST.txt'));
 // APFS clones/sparse files can make hdiutil's source-folder estimate too small.
 // Size the image from logical file lengths, plus filesystem and copy headroom.
 const logicalBytes=directory=>fs.readdirSync(directory,{withFileTypes:true}).reduce((sum,entry)=>sum+(entry.isDirectory()?logicalBytes(path.join(directory,entry.name)):fs.statSync(path.join(directory,entry.name)).size),0);
 const imageMB=Math.max(256,Math.ceil(logicalBytes(imageRoot)*1.35/1024/1024)+64);
 run('/usr/bin/hdiutil',['create','-ov','-format','UDZO','-fs','HFS+','-size',`${imageMB}m`,'-volname','Context Manager','-srcfolder',imageRoot,image]);
}finally{fs.rmSync(imageRoot,{recursive:true,force:true});}
const imageSHA=hash(image);
fs.writeFileSync(image+'.sha256',imageSHA+'  '+path.basename(image)+'\n');
fs.writeFileSync(path.join(output,'update.json'),JSON.stringify({schemaVersion:1,version,tag:`v${version}-preview.1`,filename:path.basename(image),size:fs.statSync(image).size,sha256:imageSHA},null,2)+'\n');
if(process.argv.includes('--release')&&dirty())throw Error('Source changed during packaging; do not publish this artifact');
const result={version,sourceRevision,dirtyWorkingTree:dirty(),arch:'arm64',nodeVersion:pin.version,payloadFiles:Object.keys(files).length,uncompressedPayloadBytes:bytes,archiveBytes:fs.statSync(image).size,developerIDSigned:!!identity,notarized:false,archive:path.relative(repo,image)};
fs.writeFileSync(path.join(output,'package-info.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
