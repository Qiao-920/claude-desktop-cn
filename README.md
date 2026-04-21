# Claude Desktop CN

面向中文用户持续维护的 Claude 风格桌面客户端分支，基于 `pretend1111/claude-desktop-app` 二次整理、汉化和增强。

这个分支的目标不是简单换皮，而是把原本零散、半占位的能力慢慢补成一套真正可维护、可发布、可日用的桌面工作流。

仓库地址：[Qiao-920/claude-desktop-cn](https://github.com/Qiao-920/claude-desktop-cn)

## 当前版本

- 当前版本：`1.6.13`
- Windows 安装包：`Claude-Desktop-CN-Setup-1.6.13.exe`
- Releases 页面：[GitHub Releases](https://github.com/Qiao-920/claude-desktop-cn/releases)

## 这个分支已经补了什么

### 1. 中文界面持续完善

- 主界面、设置页、协作页、代码页中文化
- 支持中英文 UI 切换
- 清理大量零散英文和不自然文案
- 调整整体排版，让界面更紧凑、更接近原生工具的使用节奏

### 2. GitHub OAuth 改成你自己的配置

- 支持接入你自己的 GitHub OAuth App
- 不再继续复用原作者的 Client ID / Client Secret
- GitHub 仓库导入链路可以正常使用

回调地址：

```text
http://127.0.0.1:30080/api/github/callback
```

### 3. Code 页面从展示壳升级成可用工作区

当前已经支持：

- 选择本地工作区
- 文件树浏览
- 文件预览与编辑
- HTML 预览
- 新建文件 / 新建文件夹
- 重命名 / 删除
- Git 状态查看
- 单文件 diff
- 单文件暂存 / 取消暂存 / 丢弃修改
- 从 Git 恢复单文件
- 提交 / 推送
- 提交后自动推送
- Shell 偏好与命令历史

### 4. Settings 页面不再只是骨架

现在已经有了第一轮完整骨架和部分真实能力：

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

其中 Git、MCP、环境、工作树、已归档聊天这些区域已经接入了真实入口或状态展示，不再只是占位按钮。

### 5. Cowork 页面从空白页变成协作总览页

当前协作页已经补成第一版总览，用来说明：

- 当前状态
- 这页应该承担什么角色
- 和 Code 页、Chat 页的边界
- 后续适合往这里继续接什么功能

它现在还不是最终形态，但已经从纯占位升级成真正的产品骨架。

## 1.6.13 这次更新了什么

### 核心改动

1. 关闭窗口后最小化到系统托盘  
   在 Windows 上关闭主窗口后，应用不再直接退出，而是转入后台驻留。可以通过托盘菜单重新显示窗口或退出应用。

2. 新增 Skill 导入  
   支持在客户端导入 `.zip` 或 `.md` 形式的 Skill。

3. 修复模式切换时的模型串味问题  
   从自部署模式切换到 Clawparrot 模式后，会清理不该继续沿用的自定义模型与配置，避免模式之间串数据。

4. 清理 GitHub Actions 发布链  
   删除原作者仓库里依赖外部服务器密钥的同步步骤，保留你自己仓库可用的构建与发布流程。

### 这一版重点不是大改 UI，而是把使用链路补顺

这一刀更偏工程化收口：

- 版本号正式进入 `1.6.13`
- 安装包、`latest.yml`、构建链、发布链一起对齐
- 后台驻留、技能导入、模式隔离这些会影响日常使用的地方优先修通

## 安装

### Windows

从 Releases 下载：

- [Claude-Desktop-CN-Setup-1.6.13.exe](https://github.com/Qiao-920/claude-desktop-cn/releases)

默认安装后可执行文件位置通常是：

```text
C:\Users\Administrator\AppData\Local\Programs\claude-desktop\
```

## 首次使用建议

### 1. 先确认用户模式

- 自部署：使用你自己的 API Key / Base URL
- Clawparrot：使用托管 API 服务

### 2. 如果要接 GitHub

1. 在 GitHub 创建 OAuth App
2. 回调地址填写：

```text
http://127.0.0.1:30080/api/github/callback
```

3. 把 Client ID / Client Secret 配到客户端
4. 在客户端重新走一遍 GitHub 连接流程

### 3. 如果要用 Code 工作区

建议流程：

1. 打开 `代码`
2. 先选择一个本地工作区
3. 确认当前权限模式
4. 再开始浏览文件、编辑文件、看 Git 状态、执行命令

## 接下来会继续补什么

优先级最高的主线仍然是：

1. 协作页继续从总览页升级成可执行的协作中枢
2. Settings 里标注为骨架的区域继续落地
3. Code 页继续向更像原生 Claude Code 的工作流靠拢
4. 文档、版本、发布链彻底标准化

## 支持

- 售后支持 QQ：`2592056451`

## 致谢

上游项目：

- [pretend1111/claude-desktop-app](https://github.com/pretend1111/claude-desktop-app)

本分支会持续跟踪上游可复用更新，但只并入适合当前路线的内容。
