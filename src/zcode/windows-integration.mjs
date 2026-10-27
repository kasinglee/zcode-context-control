export function windowsIntegrationStatus(){return {enabled:false,registered:false,available:false,inactive:true,message:'ZCode 使用独立启动入口；首版不注册全局 CLI 覆盖。'};}
export async function setWindowsIntegration(){throw Error('请使用本项目的 ZCode 启动入口；不修改 Codex 的环境覆盖或系统注册表。');}
export function codexLaunchEnvironment(environment=process.env){return {...environment};}
