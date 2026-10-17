# OpenCode Session Manager

一个 Windows 桌面应用，用于浏览和搜索本机 OpenCode 会话、查看元数据和受限的文本预览，并通过 Windows Terminal 请求 OpenCode 原生 CLI 打开选中的会话。浏览默认只读；确认删除后调用官方 CLI。它补充 OpenCode TUI，不替代或嵌入 TUI。

本项目以 [MIT License](LICENSE) 发布。

## 下载与安装

在 [GitHub Releases](https://github.com/yhl10000/opencode-session-manager/releases/latest) 下载 Windows x64 的 `OpenCode Session Manager_<版本>_x64-setup.exe` 和 `SHA256SUMS.txt`。首个正式版本发布前，该页面可能没有可下载的安装包。

安装包尚未进行代码签名，Windows SmartScreen 可能显示警告。请确认下载来源可信，并用 PowerShell 的 `Get-FileHash -Algorithm SHA256` 计算安装包哈希，与 `SHA256SUMS.txt` 中同名文件的哈希比较；哈希用于检查文件完整性，不替代发布者身份验证。

安装包使用 Tauri 默认的 WebView2 下载引导程序：如果缺少 WebView2 Runtime，需要联网下载安装。PowerShell 7、Windows Terminal 和 OpenCode CLI 不随安装包提供，须单独安装并确保可通过 `PATH` 找到。完整要求见下文。

## 功能

- 浅色、深色及跟随系统主题，可即时切换并记住选择；默认保留深色模式。

- 支持简体中文和 English。首次启动按系统语言选择（中文使用简体中文，其他语言使用 English），可在顶部语言菜单即时切换；语言单独保存在本机，不影响筛选或固定偏好。日期和相对时间随语言切换，会话标题、内容、路径、模型和技术错误详情保持原文。

- 按会话工作目录分组，使用文件夹名显示标题，不使用 OpenCode 数据库的项目名称；完整路径区分同名文件夹。
- 分组可独立展开、折叠和分页加载，也可一键全部折叠或展开；批量展开折叠保留选择与分页，搜索期间禁用。
- 子会话默认隐藏；可切换显示，应用会记住此偏好。隐藏子会话仍保留在原始目录数据中，删除项目时会纳入确认信息。
- 项目和会话右侧提供删除按钮，必须二次确认。删除项目移除该目录组所有会话，删除最后一条会话后分组消失；不删除文件夹或源码文件。
- 搜索项目名称、会话标题、会话 ID、路径、模型和 provider。搜索期间自动展开匹配的项目组。
- 可在每个项目中固定多个会话；固定状态保存在本机浏览器偏好中，固定会话在所属项目内优先显示，其余会话按最近活动排序。筛选条件同样适用于固定会话。
- 按最近活动时间或项目名称排序。
- 重命名会话。操作时按需启动经过认证的本机 OpenCode `--pure serve`，通过 HTTP `PATCH` 请求更新标题，完成后停止该服务进程。
- 查看会话元数据、消息数、可用的模型和 provider、父会话、可用的 token 汇总，以及受限的只读文本预览。
- 在新的 Windows Terminal 标签页或窗口中打开会话，复制会话 ID，打开会话目录，并刷新目录或所选详情。

应用不支持导出完整对话、重放工具调用或直接编辑 OpenCode 数据库。删除通过 `opencode --pure session delete` 执行，避免维护命令初始化外部插件；重命名同样通过官方 CLI 提供的本机服务完成，不直接写入数据库。正常 TUI 启动保留原配置。数据流和信任边界见[架构说明](docs/architecture.md)，界面约定见[设计说明](DESIGN.md)。

## 运行要求

运行桌面应用需要：

- Windows 11。
- WebView2 Runtime。
- PowerShell 7（`pwsh`）和 Windows Terminal（`wt`），且应用可通过 `PATH` 找到它们。
- OpenCode CLI（`opencode`），且应用可通过 `PATH` 找到它；CLI 需要提供 `db path` 命令和 `--session` 参数。重命名还需要 CLI 支持 `--pure serve`。

应用通过 `opencode db path` 发现数据库位置。OpenCode 的数据库 schema 可能变化；兼容性取决于应用读取的表字段和数据格式。项目不指定固定的 OpenCode 版本基线。

开发和构建还需要 Node.js 与 npm、Rust 工具链与 Cargo、包含 MSVC 的 Visual Studio C++ 构建工具，以及其他 [Tauri 2 Windows 开发依赖](https://v2.tauri.app/start/prerequisites/#windows)。

可在 PowerShell 7 中检查运行时命令：

```powershell
pwsh --version
wt --version
opencode --help
opencode db path
```

确认 OpenCode 帮助信息包含 `--session` 和 `--pure serve`，并且 `opencode db path` 返回现存的数据库文件。

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
node --test scripts/release-utils.test.mjs
node scripts/release-utils.mjs validate
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
npm audit
```

## 构建

在仓库根目录运行 Windows 桌面构建：

```powershell
npm run tauri build -- --bundles nsis -- --locked
```

Tauri CLI 会将可执行文件和已配置的安装包写入 `src-tauri/target/release/`。也可以直接启动可执行文件：

```powershell
& ".\src-tauri\target\release\opencode-session-manager.exe"
```

## 使用方法

1. 启动桌面应用。应用会发现 OpenCode 并读取本机会话目录，子会话默认隐藏。
2. 展开项目组，或按标题、项目、ID、路径、模型或 provider 搜索。项目组先显示一页会话，可以分别继续加载。需要时可显示子会话，也可在项目内固定多个会话；这些显示偏好保存在本机。
3. 选择会话以查看元数据和文本预览。使用刷新按钮重新读取目录或所选详情。
4. 双击会话或使用操作菜单，请求 OpenCode 在新的 Windows Terminal 标签页或窗口中打开它。详情面板也提供这些操作和打开会话目录的选项。

管理器使用会话记录的工作目录和 OpenCode CLI 的 `--session` 参数启动会话。所选会话和目录需要仍然存在。分派成功只表示 Windows Terminal 接受了启动请求，不代表 OpenCode TUI 已就绪或会话能够接收输入。有些子会话可能显示历史查看界面，而不是可编辑的提示符。

## 安全与隐私

- 会话数据库连接以只读和 query-only 模式打开。管理器不直接写库或修改 Schema；删除调用 OpenCode 官方命令，重命名通过临时启动的、经过认证的本机 OpenCode 服务发送 HTTP `PATCH`。操作结束后管理器会停止其启动的服务进程。
- 目录和详情均在本机读取。管理器不提供云服务，也不上传会话数据。启动 OpenCode 后，OpenCode 或其已配置的 provider、插件仍可能发起网络连接。
- 目录读取会话元数据。仅在查看详情时按需读取文本，最多包含 40 条消息、每条 4,000 个字符、总计 24,000 个字符；其他查询限制也可能导致预览截断。
- 预览以纯文本显示，不是完整导出，不会重放工具调用，也不会作为可执行指令处理。
- 会话标题、路径、预览和复制的 ID 不会脱敏，可能含有敏感信息。请按保护其他本机 OpenCode 数据的方式保护它们。
- 打开会话时，管理器会启动本机的 `pwsh`、`wt` 和 `opencode`。请使用可信的安装，并留意新终端中显示的内容。

## 限制

- 官方删除命令会递归删除子会话。单会话删除存在子会话时会被拒绝，请先删除子会话；目录批量删除若涉及未选中的子会话也会被拒绝。批量删除可能部分成功，界面会报告错误并展示实际剩余数据。删除时不要在其他 OpenCode 窗口继续创建或修改相关子会话。

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

GitHub Actions 的 `Windows Release` 工作流在推送 `vX.Y.Z` 标签时构建并发布 Windows x64 NSIS 安装包。仅接受无前导零的稳定版本，不接受预发布或构建元数据。工作流使用 Windows Server 2022、Node.js 24 与 Rust stable，运行前端检查、夹具测试、Rust 测试和 Clippy，再构建安装包。

手动运行 `workflow_dispatch` **只构建，不创建 Release**。首次发布前应先在 Actions 中手动运行该工作流，确认云端构建成功；产物 `windows-x64-nsis` 保留 7 天，可下载用于安装验证。CI 不安装或调用真实 OpenCode，也不读取真实会话数据，夹具测试不能证明原生 TUI 可交互。

发布操作顺序：

1. 将 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的应用版本同步更新，使用包管理工具同步 `package-lock.json` 与 `src-tauri/Cargo.lock` 中应用自身的版本，不手改依赖锁内容。
2. 运行所有检查及 `node scripts/release-utils.mjs validate vX.Y.Z`（将 `X.Y.Z` 替换为待发布版本），提交并推送变更。先执行手动云端构建并验证下载的安装包。
3. 从已验证的提交创建并推送标签。例如首版：

```powershell
node scripts/release-utils.mjs validate v0.1.0
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

工作流只上传经校验的单个安装包与 `SHA256SUMS.txt`。发布任务重新验证文件清单、文件名和 SHA256，再创建带完整资产的草稿并发布，不使用个人访问令牌。已存在同名 Release 时拒绝覆盖；上传或发布失败可能留下草稿，维护者须检查失败原因，不能通过覆盖已发布版本来重试。不要移动或复用发布标签。

发布前请运行上述前端和 Rust 检查，并构建 Windows 应用。还应通过实际安装的程序检查面向用户的流程：安装和卸载、应用启动、数据库发现、会话浏览和详情预览，以及两种终端启动模式。检查原生 TUI 是否能继续交互。如果发布流程对产物签名，也应检查签名和签名产物的安装行为。仅构建成功或终端请求已分派不足以证明完整发布流程可用。
