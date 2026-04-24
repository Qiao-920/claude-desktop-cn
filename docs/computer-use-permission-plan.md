# Computer Use 权限设计方案

更新时间：2026-04-24

## 目标

在 Claude Desktop CN 里做一套可发布的 `Computer Use / 桌面控制` 能力，但不直接搬运 `cc-haha` 的实现代码，只参考其权限分层思路，在我们现有架构上做 clean-room 重构。

这套能力的目标不是“远控越强越好”，而是：

- 可见：用户知道桌面控制已经开启了什么、能控制什么
- 可控：高风险能力必须显式授权
- 可审计：每一步操作都能回看
- 可收敛：不额外新增一个独立控制台，继续放在现有 `Settings` 里管理

## 当前底座

当前仓库已经有一版可运行的 Computer Use 底座：

- 前端 API：`src/api.ts`
- 设置页控制台：`src/components/SettingsPage.tsx`
- 自定义页入口：`src/components/CustomizePage.tsx`
- 后端桥接：`electron/bridge-server.cjs`

现状能力包括：

- 全局开关
- trusted mode
- 会话时长
- 前台窗口约束
- 鼠标 / 键盘 / 热键 / 滚轮 / 剪贴板输入开关
- 白名单 / 黑名单应用
- 窗口列表、激活、截图、单步动作
- 审计记录

这版已经够做“本地实验控制台”，但还不够做“产品级桌面控制权限系统”。

## 当前缺口

相对 `cc-haha` 的权限设计，我们还缺这些关键层：

1. 独立的 `request_access` 会话审批流
2. 按应用分级，而不是只做 allow / block
3. 剪贴板、系统组合键等高风险能力的独立授权
4. 单会话锁，防止多个会话同时抢桌面
5. 动作前复核，而不是只靠会话启动时校验
6. 策略级拒绝名单，而不是完全交给用户配置
7. Chat / Code 主流程里的“使用入口”，而不是只能在 Settings 手动点

## 产品原则

### 1. 不新开独立控制台

`Computer Use` 不再新增一级主页面。

采用下面的组织方式：

- `Settings / 桌面控制`：负责配置、授权、审计、白名单、策略
- `Chat / Code / Cowork`：负责在实际工作流里触发桌面能力

一句话：

`Settings 负责管，Chat / Code 负责用。`

### 2. 先做“受控自动化”，不做“任意远控”

优先级应是：

- 先截图
- 再单步动作
- 最后再考虑连续动作和自动执行

### 3. 所有高风险能力都拆开授权

不能把“能截图”和“能输入密码、发热键、操作系统窗口”打成一个总开关。

## 目标权限模型

建议把现在的 `allowedApps / blockedApps + trustedMode` 升级成下面这套结构。

### A. 全局配置层

存放在现有 `computer-use-config.json` 中，新增字段：

- `enabled`
- `foregroundOnly`
- `sessionDurationMinutes`
- `requirePerActionConfirm`
- `singleSessionLock`
- `denySensitiveApps`
- `defaultGrantLevel`

其中：

- `requirePerActionConfirm`
  低风险时可按策略跳过，默认打开
- `singleSessionLock`
  同一时间只允许一个活跃 Computer Use 会话
- `denySensitiveApps`
  开启后，命中特殊黑名单的应用直接拒绝
- `defaultGrantLevel`
  未明确授权的应用默认权限级别，建议默认 `none`

### B. 应用授权层

不再只做 allow / block，改成三档：

- `read`
  允许截图和窗口识别，不允许交互
- `click`
  允许点击、滚动、焦点切换，不允许输入文字、系统热键、右键、拖拽
- `full`
  完整交互

建议新增结构：

```ts
type ComputerUseGrantLevel = 'none' | 'read' | 'click' | 'full';

type ComputerUseAppGrant = {
  processName: string;
  level: ComputerUseGrantLevel;
  note?: string;
  source?: 'policy' | 'manual' | 'session';
};
```

替代当前单纯的：

- `allowedApps: string[]`
- `blockedApps: string[]`

兼容期可以保留旧字段，但内部统一转换成 `appGrants`。

### C. 危险能力标志层

这些权限单独拆出来，不跟 `full` 强绑定：

- `clipboardRead`
- `clipboardWrite`
- `systemKeyCombos`
- `textInput`
- `dragAndDrop`
- `rightClick`

理由：

- 有些窗口允许点，但不应该允许 `Ctrl+V`
- 有些场景允许输入普通文本，但不应该允许系统组合键

### D. 会话授权层

运行时新增会话级授权对象：

```ts
type ComputerUsePermissionRequest = {
  conversationId: string;
  requestedApps: string[];
  requestedFlags: string[];
  reason?: string;
  triggerSource: 'chat' | 'code' | 'cowork' | 'settings';
};

type ComputerUsePermissionResponse = {
  grantedApps: ComputerUseAppGrant[];
  grantedFlags: string[];
  deniedApps: string[];
  deniedFlags: string[];
  userConsented: boolean;
};
```

核心约束：

- 模型或前端入口不能直接操作桌面
- 必须先经过 `request_access`
- 批准只对当前会话生效，除非用户显式写入长期授权

### E. 执行校验层

每次真正执行动作前，都再次检查：

1. 当前会话是否还有效
2. 是否命中单会话锁
3. 当前前台窗口是否就是目标窗口
4. 当前进程权限级别是否允许该动作
5. 当前动作是否命中危险能力标志
6. 截图是否过期

建议动作映射：

- `screenshot` -> 需要 `read`
- `move` -> 需要 `click`
- `click` / `double_click` / `scroll` -> 需要 `click`
- `type` -> 需要 `full` + `textInput`
- `hotkey` -> 需要 `full` + `systemKeyCombos`
- `right_click` -> 需要 `full` + `rightClick`
- `drag` -> 需要 `full` + `dragAndDrop`

## 敏感应用策略

建议新增“策略拒绝名单”，不是完全交给用户自由配置。

### 默认直接拒绝

这些类别默认不允许：

- 密码管理器
- 银行 / 支付 / 证券 / 钱包类应用
- 系统关键设置 / 注册表 / 任务管理器
- 远控软件

Windows 初版建议内置典型进程名：

- `1password.exe`
- `keepass.exe`
- `taskmgr.exe`
- `regedit.exe`
- `SystemSettings.exe`
- `TeamViewer.exe`
- `ToDesk.exe`
- `SunloginClient.exe`
- `WeChatPay.exe`
- `Alipay.exe`

### 默认降级

有些应用不一定直接禁止，但默认只给较低级别：

- 浏览器：默认 `read`
- 终端：默认 `click`
- IDE：默认 `click`

这样可以避免“一上来就能在终端里敲命令、在浏览器里乱填表单”。

## UI 设计

### Settings 中继续承载管理能力

继续使用现有 `SettingsPage` 的 `computerUse` 分区，不新增独立页面。

建议拆成 5 个卡片：

1. `会话状态`
- 是否启用
- 当前持锁会话
- 剩余时间
- 当前目标窗口

2. `长期授权`
- 应用权限列表
- 每个应用的 `read / click / full`
- 敏感应用策略开关

3. `危险能力`
- 剪贴板读
- 剪贴板写
- 系统组合键
- 文本输入
- 拖拽
- 右键

4. `运行时动作`
- 窗口列表
- 激活
- 截图
- 单步测试

5. `审计与回放`
- 谁触发的
- 对哪个窗口
- 做了什么
- 结果如何

### Chat / Code 中增加“用”的入口

不在 Settings 里完成全部操作，而是从主流程触发：

- Chat 里：请求截图、请求单步点击、请求输入文本
- Code 里：请求打开某窗口、请求截图核对 UI 状态
- Cowork 里：后续再接桌面任务

这些入口都不直接执行，而是先弹 `Computer Use 权限审批框`。

## 审批流设计

建议新增独立于普通权限弹窗的 Computer Use 审批状态。

### 前端事件

新增一组单独事件，不复用普通工具审批：

- `computer_use_permission_request`
- `computer_use_permission_response`
- `computer_use_action_request`
- `computer_use_action_result`

### 审批弹窗内容

审批框要明确展示：

- 触发来源：Chat / Code / Cowork
- 目标应用
- 申请级别：`read / click / full`
- 申请危险能力：剪贴板 / 热键 / 输入等
- 有效期：本次、当前会话、长期授权
- 风险提示

### 审批按钮

至少有这几种：

- `仅本次允许`
- `本会话允许`
- `加入长期授权`
- `拒绝`

## 审计模型

现有审计要升级，新增字段：

```ts
type ComputerUseAuditEntry = {
  id: string;
  createdAt: string;
  conversationId?: string;
  triggerSource?: 'chat' | 'code' | 'cowork' | 'settings';
  action: string;
  decision: 'allowed' | 'blocked' | 'error' | 'session_started' | 'session_stopped';
  processName?: string;
  windowTitle?: string;
  grantLevel?: 'read' | 'click' | 'full';
  flags?: string[];
  summary?: string;
  detail?: string;
};
```

审计最少要回答 4 个问题：

- 谁触发的
- 对谁做的
- 为什么被允许或拦截
- 最终结果是什么

## 后端改造建议

### 第一阶段：兼容式升级

在 `electron/bridge-server.cjs` 里新增：

- `appGrants`
- `grantedFlags`
- `singleSessionLock`
- `requirePerActionConfirm`
- `denySensitiveApps`

并保留旧字段兼容读取：

- `allowedApps`
- `blockedApps`

迁移策略：

- `blockedApps` -> `level = none`
- `allowedApps` -> 默认 `level = full`

### 第二阶段：动作拦截器

新增统一的动作权限判断函数，所有这些接口都走它：

- `/api/computer-use/windows/activate`
- `/api/computer-use/screenshot`
- `/api/computer-use/action`

建议抽出：

```js
ensureComputerUsePermissionForAction({
  action,
  targetWindow,
  session,
  config,
  grantLevel,
  flags,
})
```

### 第三阶段：独立审批队列

后端增加待审批请求队列，前端通过轮询或事件流接收审批任务。

## 建议版本切分

### v1.6.27

做最小可发布权限骨架：

- `appGrants` 三档权限
- 危险能力 flags
- 单会话锁
- 敏感应用策略拒绝
- 审计字段升级

### v1.6.28

做独立审批流：

- `request_access`
- Computer Use 专用审批弹窗
- 会话级授权
- Chat 中截图入口

### v1.6.29

做主流程接入：

- Chat 中单步点击/输入
- Code 中截图核对
- 更细的动作前复核

## 实施顺序

推荐按下面顺序做，不要一口气全上：

1. 先改数据结构
2. 再改后端动作鉴权
3. 再补 Settings UI
4. 再做审批弹窗
5. 最后把入口接进 Chat / Code

这个顺序的好处是：

- 先把安全底座立住
- 再把产品交互补齐
- 不会出现“先能点，再补权限”的倒挂

## 对我们现有代码的直接落点

### `src/api.ts`

需要新增或改造：

- `ComputerUseGrantLevel`
- `ComputerUseAppGrant`
- `ComputerUsePermissionRequest`
- `ComputerUsePermissionResponse`
- `requestComputerUseAccess`
- `respondComputerUseAccess`

### `src/components/SettingsPage.tsx`

需要改造：

- 白名单 / 黑名单输入区 -> 授权级别列表
- 危险能力单独开关
- 当前选中窗口快捷授权继续保留
- 审计字段展示更完整

### `src/components/MainContent.tsx`

后续接入：

- 请求截图
- 请求单步动作
- 风险确认

### `electron/bridge-server.cjs`

需要改造：

- config 结构升级
- 会话锁
- 敏感应用策略
- 动作前统一鉴权
- 审批请求持久化或内存队列

## 最终判断

这块可以做，而且值得做，但正确姿势不是“抄一个桌控模块回来”，而是：

1. 参考 `cc-haha` 的权限分层思路
2. 在 Claude Desktop CN 现有架构里重写
3. 继续把管理放在 `Settings`
4. 让实际使用从 `Chat / Code` 进入

这样既能保住产品结构，也能把风险压住。
