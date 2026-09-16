# Smoke: 启动 DeepSeek Harness.exe，断言单实例守卫（第二次启动立即退出并叫回已有窗口）、
# 关闭窗口隐藏到托盘且进程仍在；真实模式下还断言 dsh web 仍在服务，随后由脚本结束整棵
# 进程树并断言端口释放。
#
# 真实模式需要空闲的 3080（或 -Port 指定的端口）：已有 dsh web 在跑时请先停掉或换端口。
# -FakeCli 用假后端（临时 dsh.cmd 打一行伪就绪行后保持运行）只验证壳行为：不碰端口、
# 不碰 profile，因此在同机另有 dsh 实例运行时也能跑。
param(
  [int]$Port = 3080,
  [switch]$FakeCli
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

$fakeDir = $null
if ($FakeCli) {
  $fakeDir = Join-Path $env:TEMP 'dsh-shell-smoke-fake-cli'
  New-Item -ItemType Directory -Force -Path $fakeDir | Out-Null
  $fakeCliPath = Join-Path $fakeDir 'dsh.cmd'
  Set-Content -Path $fakeCliPath -Encoding ASCII -Value @(
    '@echo off',
    "echo dsh web: http://127.0.0.1:$Port",
    'ping -n 900 127.0.0.1 >nul'
  )
  $env:DSH_DESKTOP_CLI = $fakeCliPath
  Write-Host "[smoke] fake backend: $fakeCliPath"
} else {
  $occupied = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if ($occupied) { throw "port $Port is already in use; stop that dsh web first, pass -Port, or use -FakeCli" }
}

function Get-DescendantPids([int]$rootPid) {
  # 只看本次启动的进程树：同机上可能还有用户自己的 dsh web / 壳在跑。
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $found = @()
  $queue = @($rootPid)
  while ($queue.Count -gt 0) {
    $next = @()
    foreach ($candidate in $all) {
      if ($queue -contains $candidate.ParentProcessId) {
        $next += $candidate.ProcessId
        $found += $candidate.ProcessId
      }
    }
    $queue = $next
  }
  return $found
}

function Get-TreeDshWebPids([int]$rootPid) {
  $tree = @($rootPid) + @(Get-DescendantPids $rootPid)
  Get-CimInstance Win32_Process | Where-Object {
    $tree -contains $_.ProcessId -and
    $_.CommandLine -and $_.CommandLine -match 'bin\.ts["\s].*\bweb\b|apps\\cli\\src\\bin\.ts.*web'
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
$webPids = @()
$ports = @()
if ($FakeCli) {
  # 假后端没有进程树可等：留出壳显示窗口与打就绪行的时间。
  Start-Sleep -Seconds 8
  if ($proc.HasExited) { throw "exe exited early with code $($proc.ExitCode)" }
  if (-not [WinProbe]::HasVisibleWindow([uint32]$proc.Id)) { throw 'the shell never showed its main window' }
  Write-Host '[smoke] ready (fake backend)'
} else {
  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $webPids = @(Get-TreeDshWebPids $proc.Id)
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
}

# 单实例：再启动一次 exe 应立刻退出并叫回已有窗口，而不是多挂一个托盘图标。
Write-Host '[smoke] launching a second instance; it must exit at once'
$second = Start-Process -FilePath $exe -ArgumentList @('--port', "$Port") -WorkingDirectory $repo -PassThru
if (-not $second.WaitForExit(30000)) {
  & taskkill /F /T /PID $second.Id | Out-Null
  throw 'second instance kept running; the single-instance guard failed'
}
if ($proc.HasExited) { throw 'the first instance exited when a second one started' }
if (-not [WinProbe]::HasVisibleWindow([uint32]$proc.Id)) {
  throw 'the running shell did not reveal its window when a second launch was requested'
}
Write-Host '[smoke] PASS: second instance exited; the first shell still runs and shows its window'

$closed = [WinProbe]::CloseProcessWindows([uint32]$proc.Id)
if (-not $closed) { throw 'no visible window to close; the shell never showed its main window' }
Write-Host '[smoke] close sent; expecting the window to hide while the process stays'

$hideDeadline = (Get-Date).AddSeconds(30)
$hid = $false
while ((Get-Date) -lt $hideDeadline) {
  Start-Sleep -Milliseconds 500
  # 关窗后仍然存活正是"托盘已装好"的证据：托盘挂不上时壳会退回关闭即退出。
  if ($proc.HasExited) { throw "exe exited on window close (code $($proc.ExitCode)); it must stay in the tray" }
  if (-not [WinProbe]::HasVisibleWindow([uint32]$proc.Id)) { $hid = $true; break }
}
if (-not $hid) { throw 'window stayed visible after WM_CLOSE; hiding to the tray failed' }
if ($FakeCli) {
  Write-Host '[smoke] PASS: window hidden, process alive (the tray owns it now)'
} else {
  $stillBound = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $ports -contains $_.LocalPort }
  )
  if ($stillBound.Count -eq 0) { throw "dsh web stopped serving after the window hid; ports $($ports -join ',') released" }
  Write-Host "[smoke] PASS: window hidden to tray, exe alive, ports $($ports -join ',') still serving"
}

# 收尾：脚本自己结束整棵进程树（壳的托盘退出由 UI 触发，脚本无法模拟）。
Write-Host '[smoke] cleaning up the process tree'
& taskkill /F /T /PID $proc.Id | Out-Null

$cleanupDeadline = (Get-Date).AddSeconds(30)
$ok = $false
while ((Get-Date) -lt $cleanupDeadline) {
  Start-Sleep -Milliseconds 500
  $leftTree = @($proc.Id) + @(Get-DescendantPids $proc.Id)
  $leftWeb = @(Get-TreeDshWebPids $proc.Id)
  $bound = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $ports -contains $_.LocalPort }
  )
  if ($leftWeb.Count -eq 0 -and $bound.Count -eq 0 -and -not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
    $ok = $true
    break
  }
}
if (-not $ok) {
  $leftTree = @($proc.Id) + @(Get-DescendantPids $proc.Id)
  $leftWeb = @(Get-TreeDshWebPids $proc.Id)
  $bound = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort } |
    ForEach-Object { "{0}/{1}" -f $_.LocalPort, $_.OwningProcess }
  throw ("cleanup failed: treePids={0} webPids={1} leftoverPorts={2}" -f `
    ($leftTree -join ','), ($leftWeb -join ','), ($bound -join ','))
}

if ($FakeCli) {
  Remove-Item -Recurse -Force $fakeDir -ErrorAction SilentlyContinue
  Write-Host '[smoke] PASS: process tree ended'
} else {
  Write-Host "[smoke] PASS: process tree ended; ports $($ports -join ',') released"
}
