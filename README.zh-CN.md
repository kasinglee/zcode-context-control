# ZCode Context Control · 适配预览

基于 `codex-context-control` 0.27.11 开发的 ZCode 桌面端适配版，版本 **0.27.17**。保留共享业务模块、macOS SwiftUI/AppKit 菜单栏和主窗口，以及 Windows Electron 托盘和主窗口的设计。

### 0.27.17 跨平台构建修复

- 集成测试使用独立的系统临时目录，不依赖开发机已有的 `.local` 目录。
- macOS 累计用量卡片拆分字符串格式化与视图，避免 Swift 编译器类型检查超时。

### 0.27.15 外观与任务分组

- 设置 → 通用 → 外观，可在深色（黑色）和浅色（白色）间即时切换；重启后保留选择。
- 没有工作目录的任务，以及 ZCode 自动生成的 default、draft 和时间戳临时工作区，统一归入 `default` 项目。实际项目目录、聊天记录和预算保持原样。
- Windows 窗口、托盘面板和设置窗口共享主题；macOS 采用原生外观并读取相同的主题配置，尚未实机验证。

### 0.27.13 本机兼容修复

- 保留 ZCode 原生独立存储准备流程，不再设置全局 `ZCODE_AGENT_SERVER_COMMAND` 覆盖；原应用文件不修改。
- 使用私有工作区启动入口：存储准备委托原版运行时，常规会话接入管理器。兼容当前桌面的 v4 会话通知，按需读取原生 `session/read` 用量。
- Windows 先运行 `node scripts/build-win.mjs --directory-only` 构建，再运行 `node scripts/start-zcode.mjs` 打开 ZCode 和管理器；已接入时复用连接。普通 **ZCode** 图标继续启动原版。
- 本机临时安装器及含个人路径的快捷方式脚本不随源码提交。适配启动入口不注册全局 Agent。
- Windows 已进行真实启动与连接验证；macOS 共享启动逻辑已更新，尚未实机验证。

这是可构建、具备隔离测试的适配预览版，**部分上游功能仍未接入**。Windows 已验证真实 ZCode 启动、任务用量、费用汇总和主题界面；macOS 本次更新仅同步源码，尚未编译或实机验证。

## 已接入的路径

- 用 ZCode 原生 `session/*` 协议替换 Codex 的 `thread/*` 桥接，不使用 Codex 登录或数据目录。
- 已加载聊天的标题、模型、工作目录、上下文用量；按工作目录组织项目侧栏；离线显示本管理器自己的缓存。
- 保留预算滑条、应用按钮、全局默认和分支预算继承。预算控制 ZCode 的原生自动压缩决策，只允许模型原生上限以内的值，预留至少 21K 输出空间。
- 手动请求 ZCode 原生压缩，使用 `session/compact`。
- 保留队列增删、排序、重试、暂停和执行记录。支持当前模型、继承权限的文本任务和 `/compact`；队列标注 **“顺序执行（无额度保护）”**。提交结果不确定时不自动重放；停止请求校验执行 ID。
- 保留用量详情界面，当前显示原生上下文总量及可用的缓存计数；未确认的分类、逐响应速度和费用不编造数据。
- 两端保留设置、快捷键、主题、窗口和侧栏结构。ZCode 的打开按钮使用适配启动入口。

## 尚未接通的功能

原有实现和 UI 仍在项目中，以下能力暂时明确不可用：

| 原功能 | ZCode 初版状态 |
| --- | --- |
| 920K 扩展 | 未验证；严格使用实际模型上限 |
| 5 小时／Weekly 额度、Credits、预测、重置通知、预约激活 | 未接入账户额度接口；不显示虚构额度，不做额度保护 |
| 登录保险库、账户切换、额度耗尽后切换 | 未接入 ZCode 的凭据模型，不读取或改写其凭据 |
| 云同步 | 保留原模块和设置；尚无 ZCode 账户统计来源，未做真实多设备联调 |
| 细分类统计、响应速度历史 | 原生总量已接入，细分类与速度历史尚未接入；费用支持 GLM / DeepSeek 官方参考价估算 |
| 自动更新与正式安装器 | 默认禁用上游更新源；安装命令仅准备项目内开发配置，不注册系统服务 |
| 未打开聊天的原生数据库扫描 | 全局累计统计只读本机用量账本，包含未打开任务；任务列表仍显示接入后观测的聊天及自身缓存 |
| 队列切换模型、附件及权限覆盖 | 首版明确拒绝，不静默忽略 |

更多细节见 [适配记录](docs/ZCODE_ADAPTATION.md)。其余继承文档描述的是上游设计与历史，不能作为 ZCode 已支持功能的证明。

## 在当前项目运行

需要 Node.js 22.13+；当前开发环境还从获准参考目录复制了 Node 到 `.local/bin/node`，以下命令可直接使用它。所有开发配置默认放在本项目 `.local/control`。

```sh
# 仅读取 ZCode 应用代码，不启动 Agent，不读取账号或聊天数据
.local/bin/node src/zcode/doctor.mjs

# 构建 Mac 原生界面
.local/bin/node scripts/build-mac.mjs

# 准备项目内配置
.local/bin/node scripts/install-current.mjs

# 先手动完全退出 ZCode，再运行；已运行实例不会接收新启动环境
.local/bin/node src/zcode/launch.mjs
```

也可双击项目中的 `启动 ZCode Context Manager.command`。首次运行会准备项目内配置；不会修改 `/Applications/ZCode.app`。退出管理器和 ZCode 后，直接普通启动 ZCode 即恢复原有运行方式，无需修复应用。

自动压缩阈值使用 **管理器自己的 CLI 副本** 中一个经过匹配检查的调用点：原应用文件不变。ZCode 升级后若调用点不匹配，启动适配会报错并停止，不对未知版本盲目修改。原生模型上限并未被扩大；“窗口”在这里是管理器使用的压缩预算，原生窗口读数仍可不同。应用预算只在空闲且用量预检通过时接受；下一次原生压缩检查时生效。

Windows 使用同一 `src/zcode/` 适配层；设置自定义安装位置：

```powershell
$env:ZCODE_DESKTOP_EXECUTABLE = 'D:\Apps\ZCode\ZCode.exe'
node src/zcode/doctor.mjs
node scripts/install-current.mjs
node src/zcode/launch.mjs
```

保留 `npm run dev:win`、`build:win` 和打包源码。尚未安装 Electron 开发依赖或在 Windows 上验证时，不应将生成脚本视为正式发布承诺。

## 验证

```sh
node scripts/check-architecture.mjs
node --test test/zcode-*.test.mjs
```

新增测试覆盖跨平台发现、实际严格 NDJSON 格式、分片及中文转发、内部响应隔离、超时与断线、预算上限、队列执行去重和错误状态，以及隔离控制服务和模拟桌面端的端到端接入。继承的核心回归测试也保留。最新结果见 [VALIDATION.md](VALIDATION.md)。

MIT 授权；保留原项目许可证及第三方声明。ZCode 应用代码仅用于获准的本机检查，不包含在源码或分发包中。

### 累计用量（0.27.16）
任务标题和列表显示累计输入+输出 token；通用设置显示所有项目的本机历史累计 token 和官方参考价估算金额。只读本机 ZCode 用量账本，包含子任务、压缩和标题调用；缓存与思考不重复累加。人民币和美元分别显示，未知模型价格不按零元计费。账本约每15秒刷新，也可同步本地聊天立即刷新。
