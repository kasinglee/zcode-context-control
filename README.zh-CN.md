# ZCode Context Control

[![checks](https://github.com/kasinglee/zcode-context-control/actions/workflows/checks.yml/badge.svg)](https://github.com/kasinglee/zcode-context-control/actions/workflows/checks.yml)

ZCode 桌面端的上下文与用量管理助手。当前版本 **0.27.18 · 适配预览**，支持 Windows x64 和 macOS Apple Silicon，分别使用 Electron 与原生 SwiftUI/AppKit 界面，共享统计与预算逻辑。

基于 Codex Context Control 0.27.11 开发，保留原项目 MIT 许可证与第三方声明。此项目不是 ZCode 官方产品。

## 下载与安装

从 [Releases](https://github.com/kasinglee/zcode-context-control/releases) 下载与你的系统对应的 **一个安装文件**：

| 系统 | 安装文件 | 要求 |
| --- | --- | --- |
| Windows | `Context-Manager-0.27.18-windows-x64-Setup.exe` | Windows 10/11 x64 |
| macOS | `Context-Manager-0.27.18-macos-arm64.dmg` | macOS 14+，Apple Silicon；暂不提供 Intel 包 |

两个安装包都内置 Node，无需另装 Node、npm、Homebrew、Xcode 或开发环境。先安装 ZCode 桌面客户端；本软件不包含 ZCode 原应用。

1. 完整退出 ZCode，运行 EXE 或打开 DMG 内的 **Install Context Manager.app**，选择「安装 / 更新」。
2. Windows 从开始菜单打开 **ZCode Context Control**；macOS 从当前用户的 `Applications` 打开 **ZCode Context Control.app**。
3. 在管理器「设置 → 通用」点击 **打开 ZCode**，启动适配连接。Windows 也可使用开始菜单的 **ZCode with Context Control**。
4. 进入 ZCode 中的任务后，管理器同步任务与模型信息；全局累计用量可直接读取本机历史账本。

**首次接入前请完整退出 ZCode。** 已运行的 ZCode 实例不会接收新的启动环境。普通 ZCode 图标仍使用原来的入口；需要预算控制时，从管理器打开 ZCode。

安装后可删除下载的 EXE/DMG。更新会保留预算、主题、语言和任务缓存；卸载可重新运行安装器，个人配置与统计来源保留。程序不修改 ZCode 的原应用文件，也不注册全局 Agent 命令覆盖。

预览包尚未配置 Windows 代码签名或 Apple 公证。macOS 如拦截可信来源的下载，可按「系统设置 → 隐私与安全」提示允许打开，无需关闭系统安全机制。

## 主要功能

- **上下文预算**：查看当前模型原生上限，设置上下文窗口和压缩触发阈值；空闲任务可请求 ZCode 原生压缩。
- **任务累计用量**：任务标题下方和侧栏显示累计 token 与参考价金额，与当前上下文占用分开。
- **全局汇总**：「设置 → 通用」显示所有项目的本机累计 token、调用次数与估算金额，约每 15 秒更新；「同步本地聊天」可立即刷新。
- **模型分别计价**：已接入 GLM 人民币与 DeepSeek 美元官方参考价。任务切换模型时按每次调用对应型号计价；不同币种分别显示。
- **黑白主题**：通用设置支持浅色和深色，重启后保留选择。
- **default 分组**：没有真实工作目录的任务与 ZCode 自动生成的临时工作区统一归入 `default`，实际项目仍按目录分组。
- **顺序任务队列**：支持原生文本任务顺序执行；目前没有账户额度保护。

### 统计和金额口径

累计 token = 已记录的输入 + 输出。缓存 token 已包含在输入中，思考 token 已包含在输出中，不再重复相加。子任务归入所属任务；压缩、标题生成，以及失败或取消后仍记录用量的调用也纳入统计。

全局汇总使用本机 ZCode 用量账本，覆盖未打开的历史任务。导入的任务若缺少本机调用记录，则无法恢复完整历史用量。软件只读取标识、模型和数值计数来汇总，不把账本或聊天内容上传到仓库。

金额是**官方参考价估算，不是渠道实际账单**。套餐、折扣、代理渠道价格、税费、工具费可能不同。GLM/DeepSeek 以外或没有明确价格的型号（如部分 Qwen）仍统计已知 token，但调用不会按零元处理；界面标明尚未计入金额的次数。

- [智谱官方定价](https://docs.bigmodel.cn/cn/guide/start/pricing)
- [DeepSeek 官方定价](https://api-docs.deepseek.com/quick_start/pricing)

## 当前限制

账户额度、Credits、账号切换、云同步、上游自动更新、细分类上下文统计与响应速度历史尚未完整接入 ZCode。继承界面中出现的入口不代表对应能力可用。

仅使用模型原生上下文上限，不保证 920K 扩展。参考价表需随官方定价更新；ZCode 升级如果改变内部协议或存储启动流程，适配器会拒绝不兼容入口。

## 从源码运行

需要 Node.js 22.13+。Windows 构建建议 Node 24；Mac 原生构建需要 Xcode Command Line Tools。

```sh
npm ci
npm run check:architecture
npm test

# 只读检查 ZCode 安装与适配入口
node src/zcode/doctor.mjs

# Windows：构建单个 EXE 安装包
npm run build:win
# Windows：构建目录后在本机启动
node scripts/start-zcode.mjs

# macOS：构建原生界面及 DMG（在 Apple Silicon Mac 执行）
npm run build:mac
npm run package:mac -- --release --use-built-panel
```

开发模式可使用 `node scripts/install-current.mjs` 准备项目内 `.local/control` 配置，再运行 `node src/zcode/launch.mjs`。开发配置、日志、依赖、构建产物及本机快捷方式脚本不提交到 Git。

## GitHub Actions 与发布

- **checks**：推送 `main` 或提交 PR 后自动执行核心测试，Windows 与 macOS 构建并行运行。
- **Build Windows and macOS**：Actions 中手动运行可同时构建两端；勾选 `publish_release` 后，仅在两端测试、安装与打包校验全部通过时发布。
- **Publish validated desktop artifacts**：输入已成功的 `checks` run ID，可直接发布对应提交的已验证产物，避免重复编译。

Release 附件只包含 **一个 EXE 和一个 DMG**，SHA-256 写在发布说明中。ZIP 等中间文件只保留为 Actions artifacts，不作为用户下载所必需的附件。版本标签格式为 `v<版本>-preview.1`，两端版本一致。

验证范围见 [VALIDATION.md](VALIDATION.md)。更多内部适配说明见 [docs/ZCODE_ADAPTATION.md](docs/ZCODE_ADAPTATION.md)；继承文档中的上游能力不等于已完成 ZCode 接入。
