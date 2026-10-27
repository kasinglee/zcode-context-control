// Project-local development setup: never rewrites a desktop application's bundle.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {discoverZcode} from '../src/zcode/discovery.mjs';
import {version} from '../src/version.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),home=path.join(repo,'.local','control');
if(process.argv.includes('--uninstall')){
 console.log('本适配版未注册系统服务。关闭管理器后，可手动移除项目 .local/control；ZCode 应用无需还原。');
}else{
 const installation=discoverZcode();fs.mkdirSync(home,{recursive:true,mode:0o700});
 const panel=process.platform==='darwin'?path.join(repo,'build/ZCode Context Control.app'):path.join(repo,'node_modules/electron/dist/electron.exe');
 fs.writeFileSync(path.join(home,'settings.json'),JSON.stringify({provider:'zcode',version,desktopEntry:path.join(repo,'desktop/main.mjs'),node:process.execPath,desktopExecutable:installation.executable,installedApp:fs.existsSync(panel)?panel:null,launcher:path.join(repo,'src/zcode/launch.mjs')},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({version,home,installation,launch:'ZCODE_CONTROL_HOME="'+home+'" node src/zcode/launch.mjs'},null,2));
}
