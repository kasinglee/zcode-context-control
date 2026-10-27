import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Use ZCode's bundled-workspace resolver so its storage startup gate remains
// enabled. A command override deliberately has no storagePreparationEntry.
export function prepareDesktopEntry({installation, home}) {
 const archive = path.join(installation.resources, 'app.asar');
 const source = fs.readFileSync(archive);
 for (const marker of ['resolveBundledWorkspaceZCodeAgentCommand', 'supportsStorageStartup', '--prepare-storage']) {
  if (!source.includes(Buffer.from(marker))) throw Error('当前 ZCode 不支持兼容的存储准备入口，请使用原版启动并更新适配器。');
 }
 const cwd = path.join(home, 'desktop-entry');
 const entry = path.join(cwd, 'apps/zcode-cli/packages/cli/dist/zcode.cjs');
 const wrapper = pathToFileURL(fileURLToPath(new URL('./wrapper.mjs', import.meta.url))).href;
 const code = `// ZCode Context Control: preserve the bundled storage startup protocol.\n`+
  `if (process.argv.includes('--prepare-storage')) {\n`+
  ` require(${JSON.stringify(installation.entry)});\n`+
  `} else {\n`+
  ` import(${JSON.stringify(wrapper)}).catch(error => { console.error(error); process.exitCode = 1; });\n`+
  `}\n`;
 fs.mkdirSync(path.dirname(entry), {recursive:true});
 fs.writeFileSync(entry, code, {mode:0o600});
 return {cwd, entry};
}
