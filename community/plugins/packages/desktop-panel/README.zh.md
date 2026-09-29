# dsh-desktop-panel

[English](README.md) | 中文

在浏览器里查看并操作**本机当前控制台桌面**（含锁屏界面）的 DSH 插件。手机经 Tailscale 打开即可用，不需要安装 VNC 服务端，也不占用 Windows 远程桌面（RDP）的会话。

## 为什么需要它

| 方案 | 锁屏可见 | 锁屏可操作 | 单窗口 | 额外软件 |
|---|---|---|---|---|
| RDP | 否（新会话） | 能（但踢掉本机 console 会话） | 否 | 无 |
| cua-driver 后台投递 | ✅ | ❌（WebView2/Chromium 不响应 PostMessage） | ✅ | 无 |
| **本插件** | ✅ | ✅ | 整屏 | 无（自带 native worker） |

关键点：**锁屏时只有 `WinSta0\Winlogon` 桌面有画面**，而它只能被**同一会话里的 SYSTEM 进程**访问。因此本插件用一个跨会话启动器把 worker 放进活动控制台会话的 Winlogon 桌面。

## 架构

```
Browser / phone
   │  HTTP + WebSocket (3080)
   ▼
DSH host plugin (this package's lib/)
   │  \\.\pipe\dsh-desktop (named pipe, 8-byte header + type + payload)
   ▼
DeskWorker.exe (SYSTEM, input desktop of the active console session)
   │  BitBlt capture → JPEG ; SendInput injection
   ▼
Current input desktop (Default or Winlogon)
```

- `lib/index.js`：注册页面 `/plugin/desktop`、信息接口 `/plugin/desktop/info`、WebSocket 流 `/plugin/desktop/stream`（token 校验后与命名管道双向透传，并按协议重组包）
- `lib/ws.js`：零依赖 WebSocket 服务端实现（握手 + 帧编解码）
- `lib/panel.js`：自包含面板页面（canvas 渲染 + 鼠标/键盘/触摸采集）
- `native/SessionLauncher.cs`：以 SYSTEM 身份把进程创建到 `WinSta0\Winlogon`（需要 `SeTcbPrivilege`）
- `native/DeskWorker.cs`：常驻 worker，抓帧、注入输入、跟随桌面切换（锁屏 ↔ 解锁）
- `native/install.ps1`：编译 + 注册开机自启计划任务 + 启停

## 安装

1. **部署 native worker**（管理员 PowerShell）：

   ```powershell
   cd community\plugins\packages\desktop-panel\native
   .\install.ps1 install
   ```

   脚本会：编译两个 C# 程序到 `%ProgramData%\dsh-desktop-panel`、注册 SYSTEM 计划任务 `DSHDesktopPanelLauncher`（开机自启）、并立即启动 worker。

2. **启用插件**：在 profile 的 `cordis.patch.yml` 追加

   ```yaml
   - insert:
       - id: dsh-desktop-panel
         name: dsh-desktop-panel
   ```

   然后重启 `dsh web`（host 插件的新增条目需要重新加载）。

## 使用

浏览器打开 `http://<主机>:3080/plugin/desktop`：

- **适应窗口 / 1:1**：画面缩放模式
- **Ctrl+Alt+Del**：向目标会话发送安全注意序列（需要 worker 侧实现，见“已知限制”）
- **全屏**：进入全屏
- 鼠标：移动 / 左键 / 右键 / 滚轮；键盘：直接输入；触摸：单指移动、轻点左键、长按右键、双指滚动

## 安全

- WebSocket 流要求 `token`（插件启动时随机生成并注入页面），未带正确 token 的连接直接 401
- worker 只通过**本机命名管道**通信，不监听任何网络端口
- 面板页面本身与 DSH 同源；对外暴露面等同于 DSH 本身，请勿把 3080 暴露到公网（建议经 Tailscale 访问）

## 已知限制

- **整屏语义**：捕获的是整个桌面，不是单个窗口
- **Ctrl+Alt+Del**：worker 已实现 `SendSAS`（服务身份与用户身份各发一次），并把 `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\SoftwareSASGeneration` 设为 3。但**本机实测未产生可见效果**：`SendSAS` 返回成功（err=0）、前台窗口仍是 `LogonUI Logon Window`、画面无变化——SAS 在该环境下未真正触发。
- **锁屏界面的输入**：实测合成输入（鼠标点击、空格、回车）不会让 LogonUI 唤出凭据输入框，画面只有时间在刷新。Windows 的安全桌面会忽略合成输入；**解锁后的普通桌面不受此限制**（待实测确认）。
- **帧率**：当前约 6 fps（抓屏 + JPEG 编码 + 管道传输），静止画面不变化时仍按固定节奏发送
- **中文输入**：走 `type_text`（`KEYEVENTF_UNICODE`）注入，不依赖远端输入法
- **显示输出关闭时**：若显示器因省电完全关闭，抓到的可能是黑屏；唤醒显示后可恢复
- **多显示器**：当前只捕获主显示器的尺寸与内容

## 卸载

```powershell
.\native\install.ps1 uninstall
```

然后从 profile 的 `cordis.patch.yml` 移除插件条目并重启 `dsh web`。
