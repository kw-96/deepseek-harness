# Smoke: launch DeepSeek Harness.exe, wait for dsh web, close the window, assert ports/processes gone.
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

function Get-DshWebPids {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'bin\.ts["\s].*\bweb\b|apps\\cli\\src\\bin\.ts.*web'
  } | ForEach-Object { $_.ProcessId }
}

function Get-DesktopExePids {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'DeepSeek Harness.exe' -or (
      $_.CommandLine -and $_.CommandLine -match 'DeepSeek Harness\.exe|dsh-web-desktop\.exe'
    )
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
public static class WinClose {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  public const uint WM_CLOSE = 0x0010;
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

Write-Host "[smoke] launching $exe"
$proc = Start-Process -FilePath $exe -WorkingDirectory $repo -PassThru
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

$closed = [WinClose]::CloseProcessWindows([uint32]$proc.Id)
if (-not $closed) {
  Write-Host "[smoke] no visible window; falling back to CloseMainWindow"
  $null = $proc.CloseMainWindow()
}
Write-Host "[smoke] close sent; waiting for cleanup"

$cleanupDeadline = (Get-Date).AddSeconds(30)
$ok = $false
while ((Get-Date) -lt $cleanupDeadline) {
  Start-Sleep -Milliseconds 500
  $leftExe = @(Get-DesktopExePids)
  $leftWeb = @(Get-DshWebPids)
  $leftPorts = @(Get-ListenPortsForPids ($webPids + $leftWeb))
  $stillBound = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $ports -contains $_.LocalPort }
  )
  if ($leftExe.Count -eq 0 -and $leftWeb.Count -eq 0 -and $stillBound.Count -eq 0) {
    $ok = $true
    break
  }
}

if (-not $ok) {
  $leftExe = @(Get-DesktopExePids)
  $leftWeb = @(Get-DshWebPids)
  $stillBound = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $ports -contains $_.LocalPort } |
    ForEach-Object { "{0}/{1}" -f $_.LocalPort, $_.OwningProcess }
  throw ("cleanup failed: exePids={0} webPids={1} leftoverPorts={2}" -f `
    ($leftExe -join ','), ($leftWeb -join ','), ($stillBound -join ','))
}

Write-Host "[smoke] PASS: exe and dsh web exited; ports $($ports -join ',') released"
