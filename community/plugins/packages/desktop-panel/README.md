# dsh-desktop-panel

English | [中文](README.zh.md)

A DSH plugin that views and controls the **current local console desktop** (including the lock screen) from a browser. Open it from a phone over Tailscale — no VNC server to install, and it does not occupy a Windows Remote Desktop (RDP) session.

## Why it exists

| Approach | Lock screen visible | Lock screen controllable | Single window | Extra software |
|---|---|---|---|---|
| RDP | No (new session) | Yes (but it kicks the local console session) | No | None |
| cua-driver background delivery | Yes | No (WebView2/Chromium ignore PostMessage) | Yes | None |
| **This plugin** | Yes | Yes | Full screen | None (ships its own native worker) |

Key point: **while the lock screen is up, only the `WinSta0\Winlogon` desktop has a picture**, and only a **SYSTEM process in the same session** can reach it. This plugin therefore uses a cross-session launcher to place a worker on the Winlogon desktop of the active console session.

## Architecture

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

- `lib/index.js`: registers the page `/plugin/desktop`, the info endpoint `/plugin/desktop/info`, and the WebSocket stream `/plugin/desktop/stream` (token-checked, then transparently relayed to the named pipe with protocol framing)
- `lib/ws.js`: dependency-free WebSocket server (handshake + frame codec)
- `lib/panel.js`: self-contained panel page (canvas rendering + mouse/keyboard/touch capture)
- `native/SessionLauncher.cs`: creates a process on `WinSta0\Winlogon` as SYSTEM (requires `SeTcbPrivilege`)
- `native/DeskWorker.cs`: resident worker — captures frames, injects input, follows desktop switches (lock ↔ unlock)
- `native/install.ps1`: compiles, registers the boot-time scheduled task, and starts/stops the worker

## Install

1. **Deploy the native worker** (administrator PowerShell):

   ```powershell
   cd community\plugins\packages\desktop-panel\native
   .\install.ps1 install
   ```

   The script compiles both C# programs into `%ProgramData%\dsh-desktop-panel`, registers the SYSTEM scheduled task `DSHDesktopPanelLauncher` (starts at boot), and starts the worker immediately.

2. **Enable the plugin**: append to the profile's `cordis.patch.yml`

   ```yaml
   - insert:
       - id: dsh-desktop-panel
         name: dsh-desktop-panel
   ```

   Then restart `dsh web` (new host-plugin entries require a reload).

## Usage

Open `http://<host>:3080/plugin/desktop` in a browser:

- **Fit window / 1:1**: picture scaling modes
- **Ctrl+Alt+Del**: send the secure attention sequence to the target session (needs the worker-side implementation, see "Known limitations")
- **Fullscreen**: enter fullscreen
- Mouse: move / left button / right button / wheel; keyboard: direct typing; touch: one-finger move, tap for left button, long press for right button, two-finger scroll

## Security

- The WebSocket stream requires a `token` (generated randomly at plugin start and injected into the page); a connection without the correct token gets a 401
- The worker communicates only over a **local named pipe** and listens on no network port
- The panel page is same-origin with DSH; its exposure equals DSH's own, so do not expose port 3080 to the public internet (access over Tailscale is recommended)

## Known limitations

- **Full-desktop semantics**: the capture is the whole desktop, not a single window
- **Ctrl+Alt+Del**: the worker implements `SendSAS` (sent once as the service identity and once as the user identity) and sets `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\SoftwareSASGeneration` to 3. **Local testing produced no visible effect**: `SendSAS` returned success (err=0), the foreground window stayed `LogonUI Logon Window`, and the picture did not change — the SAS never actually triggered in that environment.
- **Input on the lock screen**: in local testing, synthetic input (mouse clicks, space, enter) did not make LogonUI raise the credential prompt; only the clock kept refreshing. The Windows secure desktop ignores synthetic input; **the ordinary desktop after unlock is not subject to this limit** (pending confirmation).
- **Frame rate**: currently about 6 fps (capture + JPEG encoding + pipe transfer); a static picture still sends at a fixed cadence
- **Chinese input**: injected through `type_text` (`KEYEVENTF_UNICODE`), independent of the remote IME
- **When display output is off**: if the monitor is fully powered down, the capture may be black; it recovers once the display wakes
- **Multiple monitors**: only the primary display's size and content are captured

## Uninstall

```powershell
.\native\install.ps1 uninstall
```

Then remove the plugin entry from the profile's `cordis.patch.yml` and restart `dsh web`.
