# OpenCode Session Manager

一个只读的 Windows 桌面应用，用于浏览和搜索本机 OpenCode 会话、查看元数据和受限的文本预览，并通过 Windows Terminal 请求 OpenCode 原生 CLI 打开选中的会话。它补充 OpenCode TUI，不替代或嵌入 TUI。

本项目以 [MIT License](LICENSE) 发布。

## 功能

- 按项目分组浏览会话；项目组可独立展开、折叠和分页加载。
- 搜索项目名称、会话标题、会话 ID、路径、模型和 provider。搜索期间自动展开匹配的项目组。
- 按最近活动时间或项目名称排序。
- 查看会话元数据、消息数、可用的模型和 provider、父会话、可用的 token 汇总，以及受限的只读文本预览。
- 在新的 Windows Terminal 标签页或窗口中打开会话，复制会话 ID，打开会话目录，并刷新目录或所选详情。

当前版本不支持重命名会话、导出完整对话、重放工具调用或编辑 OpenCode 数据库。数据流和信任边界见[架构说明](docs/architecture.md)，界面约定见[设计说明](DESIGN.md)。

## 运行要求

运行桌面应用需要：

- Windows 11。
- WebView2 Runtime。
- PowerShell 7（`pwsh`）和 Windows Terminal（`wt`），且应用可通过 `PATH` 找到它们。
- OpenCode CLI（`opencode`），且应用可通过 `PATH` 找到它；CLI 需要提供 `db path` 命令和 `--session` 参数。

应用通过 `opencode db path` 发现数据库位置。OpenCode 的数据库 schema 可能变化；兼容性取决于应用读取的表字段和数据格式。项目不指定固定的 OpenCode 版本基线。

开发和构建还需要 Node.js 与 npm、Rust 工具链与 Cargo、包含 MSVC 的 Visual Studio C++ 构建工具，以及其他 [Tauri 2 Windows 开发依赖](https://v2.tauri.app/start/prerequisites/#windows)。

可在 PowerShell 7 中检查运行时命令：

```powershell
pwsh --version
wt --version
opencode --help
opencode db path
```

确认 OpenCode 帮助信息包含 `--session`，并且 `opencode db path` 返回现存的数据库文件。

## 开发与测试

在 PowerShell 7 中进入仓库根目录后运行：

```powershell
npm ci
npm run tauri dev
```

运行前端检查和 Rust 测试：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
npm audit
```

## 构建

在仓库根目录运行 Windows 桌面构建：

```powershell
npm run tauri build
```

Tauri CLI 会将可执行文件和已配置的安装包写入 `src-tauri/target/release/`。也可以直接启动可执行文件：

```powershell
& ".\src-tauri\target\release\opencode-session-manager.exe"
```

## 使用方法

1. 启动桌面应用。应用会发现 OpenCode 并读取本机会话目录。
2. 展开项目组，或按标题、项目、ID、路径、模型或 provider 搜索。项目组先显示一页会话，可以分别继续加载。
3. 选择会话以查看元数据和文本预览。使用刷新按钮重新读取目录或所选详情。
4. 双击会话或使用操作菜单，请求 OpenCode 在新的 Windows Terminal 标签页或窗口中打开它。详情面板也提供这些操作和打开会话目录的选项。

管理器使用会话记录的工作目录和 OpenCode CLI 的 `--session` 参数启动会话。所选会话和目录需要仍然存在。分派成功只表示 Windows Terminal 接受了启动请求，不代表 OpenCode TUI 已就绪或会话能够接收输入。有些子会话可能显示历史查看界面，而不是可编辑的提示符。

## 安全与隐私

- 会话数据库以只读和 query-only 模式打开。管理器不会迁移、复制、初始化或更新数据库。
- 目录和详情均在本机读取。管理器不提供云服务，也不上传会话数据。启动 OpenCode 后，OpenCode 或其已配置的 provider、插件仍可能发起网络连接。
- 目录读取会话元数据。仅在查看详情时按需读取文本，最多包含 40 条消息、每条 4,000 个字符、总计 24,000 个字符；其他查询限制也可能导致预览截断。
- 预览以纯文本显示，不是完整导出，不会重放工具调用，也不会作为可执行指令处理。
- 会话标题、路径、预览和复制的 ID 不会脱敏，可能含有敏感信息。请按保护其他本机 OpenCode 数据的方式保护它们。
- 打开会话时，管理器会启动本机的 `pwsh`、`wt` 和 `opencode`。请使用可信的安装，并留意新终端中显示的内容。

## 限制

- OpenCode 的数据库 schema 和 JSON 格式可能变化。应用依赖当前读取的表字段和数据形状；如果不兼容，目录读取可能失败，管理器不会尝试修复数据库。
- 打开会话需要其记录的工作目录仍然存在，并且 OpenCode CLI 支持 `--session`。
- Windows Terminal 的启动是异步的。请求已分派不代表 TUI 已成功加载；启动后的错误可能只显示在终端中。
- 某些子会话会以历史查看界面打开，而不是可编辑的提示符。
- PowerShell 可执行文件路径包含分号时不受支持。项目工作目录中的分号会通过编码的 PowerShell 命令传递，不会作为 Windows Terminal 的原始起始目录参数。
- 应用进程会缓存初次 OpenCode 发现结果。修改 `PATH` 或修复发现错误后，请重启应用。
- 预览有意限制长度，不适合查看或导出完整对话。

## 故障排查

如果会话无法加载，请确认启动应用的环境能够通过 `PATH` 找到 `opencode`，`opencode db path` 指向现存且可读取的文件，并且数据库格式兼容。修改 `PATH` 或修复发现错误后，请重启应用。

如果 Windows Terminal 未打开所选会话，请确认 `wt`、`pwsh` 和 `opencode` 都可通过 `PATH` 找到，OpenCode 帮助信息包含 `--session`，且会话工作目录仍然存在。检查新终端中的错误。管理器可以报告已分派请求，但无法确认 TUI 是否就绪。

如果桌面窗口空白或无法启动，请检查 WebView2 Runtime 和 Tauri Windows 开发依赖。开发模式下可查看运行 `npm run tauri dev` 的终端输出。

## 发布验证

发布前请运行上述前端和 Rust 检查，并构建 Windows 应用。还应通过实际安装的程序检查面向用户的流程：安装和卸载、应用启动、数据库发现、会话浏览和详情预览，以及两种终端启动模式。检查原生 TUI 是否能继续交互。如果发布流程对产物签名，也应检查签名和签名产物的安装行为。仅构建成功或终端请求已分派不足以证明完整发布流程可用。
