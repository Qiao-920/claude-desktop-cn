# Claude Desktop CN

面向中文用户持续维护的 Claude 风格桌面客户端分支，基于 [`pretend1111/claude-desktop-app`](https://github.com/pretend1111/claude-desktop-app) 二次整理、汉化和增强。

这个分支的目标不是简单换皮，而是把原本零散、半占位的能力慢慢补成一套可维护、可发布、可日用的桌面工作流。

仓库地址：[Qiao-920/claude-desktop-cn](https://github.com/Qiao-920/claude-desktop-cn)

## 当前版本

- 当前版本：`1.6.19`
- Windows 安装包：`Claude-Desktop-CN-Setup-1.6.19.exe`
- Releases 页面：[GitHub Releases](https://github.com/Qiao-920/claude-desktop-cn/releases)
- 产品任务清单：[cc-haha 能力对照与 Claude Desktop CN 产品任务清单](docs/cc-haha-capability-map.md)

## 已完成的主线能力

### 中文界面

- 主界面、设置页、协作页、代码页持续中文化
- 支持中文 / 英文 UI 切换
- 清理零散英文文案，让界面更像一个正式客户端
- 收紧聊天正文、输入区和设置页布局，降低大屏空旷感

### GitHub 连接

- 支持配置自己的 GitHub OAuth App
- 不再复用原作者的 Client ID / Client Secret
- 支持 GitHub 仓库导入和项目资料来源绑定

OAuth 回调地址：

```text
http://127.0.0.1:30080/api/github/callback
```

### Code 工作区

当前已经支持：

- 选择本地工作区
- 文件树浏览
- 文件预览、编辑、保存
- HTML 预览
- 新建文件 / 新建文件夹
- 重命名 / 删除
- Git 状态查看
- 单文件 diff
- 单文件暂存 / 取消暂存 / 丢弃修改
- 从 Git 恢复单文件
- 提交 / 推送 / 提交后自动推送
- Shell 偏好与命令历史
- 常用命令快捷入口
- 命令执行权限守卫、风险命令拦截和超时控制
- 命令输出会显示 Shell、退出码、耗时、权限模式和超时状态
- 工作区状态条，直接显示权限、Git 状态、最近命令和推送策略

### Cowork 协作页

协作页已经从空白说明页升级为工作总览：

- 项目、GitHub、权限、归档状态总览
- 快捷入口：项目、代码工作区、权限环境设置
- 当前队列：提示下一步应该连接什么、整理什么
- 最近项目列表
- 协作 / 代码页职责边界说明

它现在仍不是完整多人协作系统，但已经具备真实产品页的骨架和入口。

### Settings 设置页

设置页已经补齐原生 Claude / Codex 风格的第一版骨架：

- 常规
- 外观
- 模型
- 个性化
- 权限
- Git
- MCP 服务器
- 环境
- 工作树
- 已归档聊天
- 使用情况

其中 Git、MCP、环境、工作树、已归档聊天、使用情况已经不再是单纯占位，而是有状态、有入口、有说明的可继续扩展页面。

## 1.6.19 更新内容

这一版开始把 `cc-haha` 的能力拆成我们自己的产品任务清单，并优先补 Code 工作区主线：

1. 新增 `docs/cc-haha-capability-map.md`，把 cc-haha 的 TUI、MCP、Skills、权限、Diff、桌面端、多 Agent 等能力拆成 Claude Desktop CN 的 P0/P1/P2 任务。
2. Code 工作区加入常用命令快捷入口，方便直接跑 `dir`、`git status`、依赖检查、测试和构建。
3. 后端命令执行开始真正读取权限模式：`项目权限` 禁止直接执行命令，非 `完全访问` 会拦截高风险命令。
4. 命令结果补充 Shell、退出码、耗时、超时、权限模式等信息，方便判断到底是命令失败、权限拦截还是模型生成的问题。
5. Artifact / HTML 预览切到沙盒 `srcDoc` 流程，增加加载、空白和错误状态检测，减少黑屏和“看起来没反应”的情况。

## 1.6.18 更新内容

这一版把发布链路正式接上：

1. GitHub Actions 改成 Windows 优先的稳定构建线。
2. 手动运行 workflow 会上传 Windows 安装包 artifact。
3. 推送 `v*` 标签时会自动创建 GitHub Release。
4. Release 会自动上传 `.exe`、`.blockmap` 和 `latest.yml`。
5. 构建时继续注入 GitHub OAuth App 配置，缺少密钥时客户端仍可运行，只是 GitHub 导入会给出明确提示。

## 1.6.17 更新内容

这一版是一次“成品化收口”：

1. Cowork 页升级成正式工作总览，不再只是说明占位。
2. Settings 页修复骨架区，并补齐 Git / MCP / 环境 / 工作树 / 已归档 / 使用情况等页面的正式说明和入口。
3. Code 页补充工作流状态条，能直接看到当前工作区、Git 状态、最近命令数量、权限模式和推送策略。
4. README 和发布说明同步更新到 `1.6.17`。
5. 保持 Windows 托盘后台运行、托盘图标和黑屏修复路线继续生效。

## 安装

### Windows

从 Releases 下载：

- [Claude-Desktop-CN-Setup-1.6.19.exe](https://github.com/Qiao-920/claude-desktop-cn/releases)

默认安装路径通常是：

```text
C:\Users\Administrator\AppData\Local\Programs\claude-desktop\
```

## 首次使用建议

### 1. 先确认用户模式

- 自部署：使用自己的 API Key / Base URL
- Clawparrot：使用托管 API 服务

### 2. 如果要接 GitHub

1. 在 GitHub 创建 OAuth App
2. 回调地址填写：

```text
http://127.0.0.1:30080/api/github/callback
```

3. 把 Client ID / Client Secret 配到客户端
4. 在客户端重新走一次 GitHub 连接流程

### 3. 如果要用 Code 工作区

建议流程：

1. 打开 `代码`
2. 选择一个本地工作区
3. 确认当前权限模式
4. 浏览、编辑文件，查看 Git 状态，再执行命令

## 接下来会继续补什么

优先主线：

1. Code 页继续补更完整的终端、文件预览和 Git 工作流。
2. Cowork 页继续向任务看板、共享上下文和项目协作中心推进。
3. Settings 页继续把“骨架”入口改成真实配置项。
4. 持续跟进上游可复用更新，只合并适合中文分支路线的内容。

## 支持

- 售后支持 QQ：`2592056451`

## 致谢

上游项目：

- [pretend1111/claude-desktop-app](https://github.com/pretend1111/claude-desktop-app)

本分支会持续跟进上游可复用更新，但只并入适合当前路线的内容。
