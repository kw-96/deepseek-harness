# Smoke: 启动 DeepSeek Harness.exe，等 dsh web 就绪，关闭窗口，断言窗口隐藏到托盘而进程与
# 端口仍在；随后由脚本结束整棵进程树并断言端口释放。
#
# 需要空闲的 3080（或 -Port 指定的端口）：已有 dsh web 在跑时请先停掉或换端口。
param(
  [int]$Port = 3080
)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$repo = $null
for ($i = 0; $i -lt 8; $i++) {
  if (Test-Path (Join-Path $dir 'dsh.cmd')) { $repo = $dir; break }
  $parent = Split-Path $dir -Parent
  if (-not $parent -or $parent -eq $dir) { break }
  $dir = $parent
}
if (-not $repo) { throw 'could not locate repo root (dsh.cmd)' }
$exe = Join-Path $repo 'DeepSeek Harness.exe'
if (-not (Test-Path $exe)) { throw "missing exe: $exe" }

$occupied = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($occupied) { throw "port $Port is already in use; stop that dsh web first or pass -Port" }

function Get-DshWebPids {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'bin\.ts["\s].*\bweb\b|apps\\cli\\src\\bin\.ts.*web'
  } | ForEach-Object { $_.ProcessId }
}

function Get-DesktopExePids {
  # Match by image name only — CommandLine also matches this smoke script's argv.
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'DeepSeek Harness.exe' -or $_.Name -eq 'dsh-web-desktop.exe'
  } | ForEach-Object { $_.ProcessId }
}

function Get-ListenPortsForPids([int[]]$procIds) {
  if (-not $procIds -or $procIds.Count -eq 0) { return @() }
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $procIds -contains $_.OwningProcess } |
    Select-Object -ExpandProperty LocalPort -Unique
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WinProbe {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  public const uint WM_CLOSE = 0x0010;
  public static bool HasVisibleWindow(uint pid) {
    bool any = false;
    EnumWindows((hWnd, l) => {
      uint wpid;
      GetWindowThreadProcessId(hWnd, out wpid);
      if (wpid == pid && IsWindowVisible(hWnd)) { any = true; return false; }
      return true;
    }, IntPtr.Zero);
    return any;
  }
  public static bool CloseProcessWindows(uint pid) {
    bool any = false;
    EnumWindows((hWnd, l) => {
      uint wpid;
      GetWindowThreadProcessId(hWnd, out wpid);
      if (wpid == pid && IsWindowVisible(hWnd)) {
        PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        any = true;
      }
      return true;
    }, IntPtr.Zero);
    return any;
  }
}
"@

Write-Host "[smoke] launching $exe --port $Port"
$proc = Start-Process -FilePath $exe -ArgumentList @('--port', "$Port") -WorkingDirectory $repo -PassThru
$deadline = (Get-Date).AddSeconds(180)
$webPids = @()
$ports = @()
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  $webPids = @(Get-DshWebPids)
  if ($webPids.Count -gt 0) {
    $ports = @(Get-ListenPortsForPids $webPids)
    if ($ports.Count -gt 0) { break }
  }
  if ($proc.HasExited) { throw "exe exited early with code $($proc.ExitCode) before web was ready" }
}
if ($webPids.Count -eq 0 -or $ports.Count -eq 0) {
  throw "timed out waiting for dsh web listen; webPids=$($webPids -join ',') ports=$($ports -join ',')"
}
Write-Host "[smoke] ready webPids=$($webPids -join ',') ports=$($ports -join ',')"

$closed = [WinProbe]::CloseProcessWindows([uint32]$proc.Id)
if (-not $closed) { throw 'no visible window to close; the shell never showed its main window' }
Write-Host '[smoke] close sent; expecting the window to hide while the backend keeps serving'

$hideDeadline = (Get-Date).AddSeconds(30)
$hid = $false
while ((Get-Date) -lt $hideDeadline) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) { throw "exe exited on window close (code $($proc.ExitCode)); it must stay in the tray" }
  if (-not [WinProbe]::HasVisibleWindow([uint32]$proc.Id)) { $hid = $true; break }
}
if (-not $hid) { throw 'window stayed visible after WM_CLOSE; hiding to the tray failed' }
$stillBound = @(
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort }
)
if ($stillBound.Count -eq 0) { throw "dsh web stopped serving after the window hid; ports $($ports -join ',') released" }
Write-Host "[smoke] PASS: window hidden to tray, exe alive, ports $($ports -join ',') still serving"

# 收尾：脚本自己结束整棵进程树（壳的托盘退出由 UI 触发，脚本无法模拟）。
Write-Host '[smoke] cleaning up the process tree'
& taskkill /F /T /PID $proc.Id | Out-Null

$cleanupDeadline = (Get-Date).AddSeconds(30)
$ok = $false
while ((Get-Date) -lt $cleanupDeadline) {
  Start-Sleep -Milliseconds 500
  $leftExe = @(Get-DesktopExePids)
  $leftWeb = @(Get-DshWebPids)
  $bound = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $ports -contains $_.LocalPort }
  )
  if ($leftExe.Count -eq 0 -and $leftWeb.Count -eq 0 -and $bound.Count -eq 0) {
    $ok = $true
    break
  }
}
if (-not $ok) {
  $leftExe = @(Get-DesktopExePids)
  $leftWeb = @(Get-DshWebPids)
  $bound = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort } |
    ForEach-Object { "{0}/{1}" -f $_.LocalPort, $_.OwningProcess }
  throw ("cleanup failed: exePids={0} webPids={1} leftoverPorts={2}" -f `
    ($leftExe -join ','), ($leftWeb -join ','), ($bound -join ','))
}

Write-Host "[smoke] PASS: process tree ended; ports $($ports -join ',') released"
