import fs from 'node:fs';
import path from 'node:path';
export function discoverZcode({platform=process.platform,env=process.env,exists=fs.existsSync}={}){
 const win=platform==='win32',p=win?path.win32:path;
 const configured=env.ZCODE_DESKTOP_EXECUTABLE;
 const candidates=configured?[configured]:win?[
  env.LOCALAPPDATA&&p.join(env.LOCALAPPDATA,'Programs','ZCode','ZCode.exe'),
  env.LOCALAPPDATA&&p.join(env.LOCALAPPDATA,'Programs','zcode','ZCode.exe'),
  env.ProgramFiles&&p.join(env.ProgramFiles,'ZCode','ZCode.exe')
 ]:['/Applications/ZCode.app/Contents/MacOS/ZCode'];
 for(const executable of candidates.filter(Boolean)){
  const resources=win?p.join(p.dirname(executable),'resources'):p.join(p.dirname(p.dirname(executable)),'Resources');
  const entry=env.ZCODE_AGENT_ENTRY||p.join(resources,'glm','zcode.cjs');
  if(exists(executable)&&exists(entry))return {executable,resources,entry,platform};
 }
 throw Error('未找到 ZCode 桌面运行时。请设置 ZCODE_DESKTOP_EXECUTABLE（必要时设置 ZCODE_AGENT_ENTRY），不会回退到 Codex。');
}
