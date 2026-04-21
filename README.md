# Claude Desktop CN

一个面向中文用户维护的 Claude 风格桌面客户端分支，基于 `v1.6.12` 整理、汉化并持续补齐原生 Claude / Claude Code 常用工作流。

本仓库重点不是“换个皮肤”，而是把下面几件事真正做顺：

- 中文界面更完整，减少零散英文和机翻痕迹
- GitHub 连接改成你自己的 OAuth App，而不是继续复用原作者配置
- `Code` 页从展示页补成可用工作区
- `Cowork` 和 `Settings` 里原来只是占位的区域逐步做成真实功能
- 发布流程迁移到你自己的仓库与安装包

仓库地址：[`Qiao-920/claude-desktop-cn`](https://github.com/Qiao-920/claude-desktop-cn)

## 当前状态

这一版已经具备的可用能力：

- 中文化界面基础完成，支持中英文 UI 切换
- Chat / Projects / Artifacts / GitHub 导入可用
- GitHub OAuth 已支持切换到你自己的 App
- `Code` 页支持：
  - 选择工作区
  - 文件树浏览
  - 文件预览与编辑
  - HTML 预览与浏览器打开
  - 新建文件 / 新建文件夹
  - 重命名 / 删除
  - Git 状态查看
  - 单文件 diff
  - 单文件暂存 / 取消暂存 / 丢弃修改
  - 单文件从 Git 恢复
  - 提交 / 推送
  - 可选“提交后自动推送”
- `Cowork` 页已升级为协作总览页第一版
- `Settings` 中原来标记为“骨架”的 Git / MCP / 环境 / 工作树 / 已归档分区，已接入真实状态和入口

## 这次分支版的改动重点

相对上游，这个分支当前主要做了这些事情：

1. 中文化整理
   - 修正大量零散英文
   - 增加界面语言切换
   - 调整部分文案为更符合中文使用习惯的表达

2. GitHub 接入改为自有 OAuth
   - 支持填入你自己的 GitHub OAuth App
   - 不再依赖原作者的 Client ID / Client Secret

3. `Code` 工作区增强
   - 把原本“像 Claude Code 但不够落地”的区域补成能用的本地工作区
   - 支持最近工作区记忆、命令历史、命令超时、Shell 偏好

4. 仓库与发布信息迁移
   - 发布元数据已改到你的仓库
   - Windows 安装包产物名固定为：
     - `Claude-Desktop-CN-Setup-1.6.12.exe`

## 安装

Windows 安装包会发布在 Releases 页面：

- [Releases](https://github.com/Qiao-920/claude-desktop-cn/releases)

当前默认安装包文件名：

```text
Claude-Desktop-CN-Setup-1.6.12.exe
```

## 首次使用

### 1. 选择使用模式

应用支持两种主模式：

- 自部署：使用你自己的 API Key / Base URL
- 托管模式：使用平台托管服务

### 2. 连接 GitHub

如果你希望使用自己的 GitHub OAuth App：

1. 进入 GitHub 开发者设置
2. 创建一个 OAuth App
3. 回调地址填写：

```text
http://127.0.0.1:30080/api/github/callback
```

4. 把生成的 Client ID / Client Secret 配到客户端对应位置
5. 在客户端里重新走一遍 GitHub 连接流程

## Code 工作区怎么用

`Code` 页是这个分支里最重要的补强之一。

基本流程：

1. 打开 `代码`
2. 选择一个本地工作区
3. 左边看文件树
4. 中间预览或编辑文件
5. 右边看 Git 状态、查看差异、执行命令

当前适合做的事情：

- 浏览项目结构
- 改本地文件
- 看单文件 diff
- 暂存、提交、推送
- 跑基础命令
- 预览 HTML

还在继续补的方向：

- 更完整的协作工作流
- 更原生的设置页结构
- 更贴近 Claude Code 的项目级工作记忆与自动化

## Cowork 页定位

`协作` 现在已经不是空白占位页了，但它目前仍处于“总览层”。

这一层主要负责：

- 展示项目、GitHub、权限、工作区的关键信息
- 提供跳转入口
- 为后续真正的任务协作、审阅、状态流做承接

简单说：

- 要真正改文件、跑命令、看 Git，请去 `代码`
- 要做项目与资料管理，请去 `项目`
- 要看协作总览和后续规划入口，请去 `协作`

## 开发构建

```bash
git clone https://github.com/Qiao-920/claude-desktop-cn.git
cd claude-desktop-cn
npm install
npm run build
```

打包 Windows 安装包：

```bash
npm run electron:build:win
```

默认输出目录：

```text
release/
```

## 发布说明

当前仓库发布使用的是你自己的 GitHub 仓库配置。

Windows 构建完成后，目标安装包名称为：

```text
release/Claude-Desktop-CN-Setup-1.6.12.exe
```

## Roadmap

接下来优先继续做这几条主线：

1. 把 `Cowork` 页做成真正可操作的协作区
2. 继续补齐 `Settings` 页里剩余还偏展示性的区域
3. 继续向原生 Claude Code 的工作区体验靠拢
4. 优化预览、文件流转、项目级规则与工作记忆

详细路线见：

- [`docs/native-gap-roadmap.md`](./docs/native-gap-roadmap.md)
- [`docs/releases/v1.6.12-cn.md`](./docs/releases/v1.6.12-cn.md)

## 致谢

这个分支基于上游项目继续整理和增强，但当前仓库的中文化、OAuth 迁移、工作区增强、设置页补强和发布链路，已经按 `Claude Desktop CN` 的维护方向单独推进。
