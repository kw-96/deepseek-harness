# DSH 桌面面板 · native worker 安装脚本
#
# 作用：编译并部署「跨会话桌面 worker」——它以 SYSTEM 身份把抓屏/注入进程放进
#       活动控制台会话的 WinSta0\Winlogon 桌面，从而在锁屏状态下也能捕获画面并注入输入。
#
# 用法（需管理员 PowerShell）：
#   .\install.ps1 install     编译并注册开机自启计划任务
#   .\install.ps1 start       启动 worker
#   .\install.ps1 stop        停止 worker
#   .\install.ps1 restart     重启 worker
#   .\install.ps1 status      查看状态
#   .\install.ps1 uninstall   停止并删除任务与工作目录
param(
  [ValidateSet('install', 'start', 'stop', 'restart', 'status', 'uninstall')]
  [string]$Action = 'status',
  [string]$PipeName = 'dsh-desktop',
  [string]$WorkDir = "$env:ProgramData\dsh-desktop-panel"
)

$ErrorActionPreference = 'Stop'
$TaskName = 'DSHDesktopPanelLauncher'
$SourceDir = $PSScriptRoot
$Csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

function Write-Step([string]$Text) { Write-Host "[desktop-panel] $Text" }

function Test-Admin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Compile {
  if (-not (Test-Path $Csc)) { throw "未找到 C# 编译器：$Csc" }
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  foreach ($name in @('SessionLauncher', 'DeskWorker')) {
    $out = Join-Path $WorkDir "$name.exe"
    $source = Join-Path $SourceDir "$name.cs"
    if (-not (Test-Path $source)) { throw "缺少源码：$source" }
    $cscArgs = @('/nologo', '/target:exe', '/platform:x64', "/out:$out", $source)
    if ($name -eq 'DeskWorker') { $cscArgs += '/reference:System.Drawing.dll' }
    & $Csc @cscArgs | Out-Null
    if (-not (Test-Path $out)) { throw "编译失败：$name" }
    Write-Step "已编译 $name.exe"
  }
}

function Register-Task {
  $launcher = Join-Path $WorkDir 'SessionLauncher.exe'
  $worker = Join-Path $WorkDir 'DeskWorker.exe'
  $command = "$launcher $worker $PipeName"
  & schtasks /create /tn $TaskName /tr $command /sc onstart /ru SYSTEM /rl HIGHEST /f | Out-Null
  Write-Step "已注册开机自启任务 $TaskName（SYSTEM）"
}

function Start-Worker {
  if (-not (Test-Path (Join-Path $WorkDir 'DeskWorker.exe'))) { throw '尚未安装，请先执行 install' }
  $existing = Get-Process DeskWorker -ErrorAction SilentlyContinue
  if ($existing) { Write-Step "worker 已在运行（pid=$($existing.Id)）"; return }
  & schtasks /run /tn $TaskName | Out-Null
  Start-Sleep -Seconds 3
  $proc = Get-Process DeskWorker -ErrorAction SilentlyContinue
  if ($proc) { Write-Step "worker 已启动（pid=$($proc.Id)，会话=$($proc.SessionId)）" }
  else { Write-Step 'worker 未启动，请查看日志' }
}

function Stop-Worker {
  $proc = Get-Process DeskWorker -ErrorAction SilentlyContinue
  if ($proc) { $proc | Stop-Process -Force; Write-Step "已停止 worker（pid=$($proc.Id)）" }
  else { Write-Step 'worker 未在运行' }
}

function Show-Status {
  $proc = Get-Process DeskWorker -ErrorAction SilentlyContinue
  if ($proc) { Write-Step "worker 运行中：pid=$($proc.Id) 会话=$($proc.SessionId) 启动于 $($proc.StartTime)" }
  else { Write-Step 'worker 未运行' }
  Write-Step "命名管道：\\.\pipe\$PipeName"
  Write-Step "工作目录：$WorkDir"
  $log = Join-Path $WorkDir 'worker.log.txt'
  if (Test-Path $log) {
    Write-Step '最近日志：'
    Get-Content $log -Encoding UTF8 -Tail 6 | ForEach-Object { "    $_" }
  }
}

if (-not (Test-Admin)) { throw '需要管理员权限运行本脚本' }

switch ($Action) {
  'install' { Invoke-Compile; Register-Task; Start-Worker }
  'start' { Start-Worker }
  'stop' { Stop-Worker }
  'restart' { Stop-Worker; Start-Sleep -Seconds 2; Start-Worker }
  'status' { Show-Status }
  'uninstall' {
    Stop-Worker
    & schtasks /delete /tn $TaskName /f 2>$null | Out-Null
    Write-Step "已删除任务 $TaskName"
    if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force; Write-Step "已删除 $WorkDir" }
  }
}
