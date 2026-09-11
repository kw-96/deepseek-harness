<#
.SYNOPSIS
  browser-skill 环境装配与自检（Windows）。

.DESCRIPTION
  为 dsh-browser-agent 准备运行环境并做验收：CLI、agent skill、浏览器扩展。
  默认只做自检（-Mode check），不改变机器上任何东西。

  设计取舍：CLI 的安装/升级直接复用上游官方 installer（带 sha256 校验与 PATH 配置），
  本脚本只负责编排、扩展环节（上游明确要求由用户完成）与最终验收，避免重复实现。

.PARAMETER Mode
  check      仅自检并给出修复建议（默认）
  install    安装/升级 CLI + 安装 agent skill + 验收
  extension  只处理浏览器扩展（store 打开商店页 / unpacked 下载解压）

.PARAMETER ExtensionMode
  store      引导从 Edge/Chrome 商店安装（推荐：自动更新）
  unpacked   下载扩展 zip 解压到 -ExtensionDir（离线或无法上商店的场景）
  none       不处理扩展

.PARAMETER WriteEdgePolicy
  写入当前用户的 Edge 企业策略，强制安装商店版扩展（批量机器适用，需 HKCU 写权限）。

.PARAMETER RemoveEdgePolicy
  移除上面写入的策略。

.EXAMPLE
  .\setup-browser-skill.ps1
.EXAMPLE
  .\setup-browser-skill.ps1 -Mode install -ExtensionMode store
.EXAMPLE
  .\setup-browser-skill.ps1 -Mode extension -ExtensionMode unpacked -ExtensionVersion 0.2.1
#>

[CmdletBinding()]
param(
  [ValidateSet('check', 'install', 'extension')] [string]$Mode = 'check',
  [ValidateSet('store', 'unpacked', 'none')] [string]$ExtensionMode = 'store',
  [string]$ExtensionVersion = '0.2.1',
  [string]$ExtensionDir = (Join-Path $HOME '.local\share\bsk-extension'),
  [string]$InstallDir = (Join-Path $HOME '.local\bin'),
  [string]$UpstreamRepo = 'Tencent/BrowserSkill',
  [switch]$WriteEdgePolicy,
  [switch]$RemoveEdgePolicy
)

$ErrorActionPreference = 'Stop'
$EdgeStoreId = 'emacgiaaaiojkkpkddmmdfhmokgmnikg'
$EdgeStoreUrl = 'https://microsoftedge.microsoft.com/addons/detail/browserskill/emacgiaaaiojkkpkddmmdfhmokgmnikg'
$ChromeStoreUrl = 'https://chromewebstore.google.com/detail/hhcmgoofomhgciiibhipgmgkgnoenaoi'
$PolicyKey = 'HKCU:\Software\Policies\Microsoft\Edge\ExtensionInstallForcelist'
$script:StatusError = ''

function Write-Step { param([string]$Text) Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "  ok   $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  warn $Text" -ForegroundColor Yellow }
function Write-Fail { param([string]$Text) Write-Host "  fail $Text" -ForegroundColor Red }

<#
  执行一条 bsk 命令并取回输出。

  两点环境事实（都实测踩过）：
  1. bsk 若需要自启 daemon，会 fork 子进程并让它继承 stdout 管道；调用方若按管道 EOF
     判定结束就会「已输出但不退出」。这里一律用 Start-Process + 文件重定向规避。
  2. Windows PowerShell 5.1 下 Start-Process -PassThru 的进程对象取不到 ExitCode
     （无参 WaitForExit() 与 Refresh() 都不行），因此只以「是否完成」+ 输出内容判定结果。
#>
function Invoke-Bsk {
  param([string[]]$Arguments, [int]$TimeoutMs = 60000)
  $outFile = [System.IO.Path]::GetTempFileName()
  $errFile = [System.IO.Path]::GetTempFileName()
  try {
    $proc = Start-Process -FilePath 'bsk' -ArgumentList $Arguments -NoNewWindow -PassThru `
      -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if (-not $proc.WaitForExit($TimeoutMs)) {
      try { $proc.Kill() } catch { }
      return @{ Completed = $false; Text = '' }
    }
    # 必须按 UTF-8 读：bsk 输出 UTF-8（含中文标签），PS 5.1 默认按 ANSI 读会乱码，
    # 乱码会让 JSON 解析失败。
    $stdout = Get-Content $outFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $stderr = Get-Content $errFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    return @{ Completed = $true; Text = ('' + $stdout + $stderr) }
  }
  finally {
    Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

<# 读取 daemon 状态（含扩展版本与协议）。失败返回 $null，原因留在 $script:StatusError。 #>
function Get-BskStatus {
  $script:StatusError = ''
  $result = Invoke-Bsk -Arguments @('status', '--json')
  if (-not $result.Completed) {
    $script:StatusError = 'bsk status 超时未返回'
    return $null
  }
  try {
    return ($result.Text | ConvertFrom-Json)
  }
  catch {
    $head = $result.Text.Trim()
    if ($head.Length -gt 160) { $head = $head.Substring(0, 160) }
    $script:StatusError = "JSON 解析失败：$($_.Exception.Message)；原始输出：$($head -replace "`r?`n", ' ')"
    return $null
  }
}

<# 自检：CLI、daemon、扩展、协议一致性，并给出修复建议。 #>
function Invoke-Check {
  Write-Step '检查 bsk CLI'
  $cmd = Get-Command bsk -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Fail '未找到 bsk：先执行 -Mode install，或把 bsk 加入 PATH'
    return 1
  }
  $versionText = (Invoke-Bsk -Arguments @('--version')).Text.Trim()
  if ($versionText -match '^bsk\s+\S+') { Write-Ok "$versionText  ($($cmd.Source))" }
  else { Write-Warn "bsk --version 输出异常：$versionText" }

  Write-Step '检查 daemon 与浏览器扩展'
  $doctor = Invoke-Bsk -Arguments @('doctor')
  $doctorFailed = $false
  foreach ($line in ($doctor.Text -split "`n")) {
    $trimmed = $line.Trim()
    if (-not $trimmed) { continue }
    # bsk doctor 自带状态词，原样打印并按状态着色，避免出现「ok ok」双重前缀。
    if ($trimmed -match '^fail\b') { Write-Host "  $trimmed" -ForegroundColor Red; $doctorFailed = $true }
    elseif ($trimmed -match '^warn\b') { Write-Host "  $trimmed" -ForegroundColor Yellow }
    else { Write-Host "  $trimmed" -ForegroundColor Green }
  }

  $status = Get-BskStatus
  $skewed = $false
  if ($status) {
    foreach ($browser in $status.browsers) {
      if ($browser.version_skew) {
        $skewed = $true
        Write-Warn "扩展版本落后：$($browser.browser_name) 扩展 $($browser.extension_version) / 协议 $($browser.extension_protocol_version)，daemon 协议 $($status.protocol_version)"
        Write-Warn "  升级扩展后重跑本脚本；商店安装：$EdgeStoreUrl"
      }
    }
  }
  else { Write-Warn "未能解析 bsk status：$($script:StatusError)" }

  if ($doctorFailed) { Write-Step '存在 fail 项，请按上面的 hint 修复后重跑'; return 1 }
  if ($skewed) { Write-Step '可用，但扩展需要升级（见上面的 warn）'; return 0 }
  Write-Step '全部通过：可以正常使用浏览器工具'
  return 0
}

<# 安装/升级 CLI：已装则走 bsk 自更新，缺失时才调用上游 install.ps1。 #>
function Invoke-InstallCli {
  if (Get-Command bsk -ErrorAction SilentlyContinue) {
    Write-Step '升级 bsk CLI（bsk update --yes）'
    $update = Invoke-Bsk -Arguments @('update', '--yes') -TimeoutMs 300000
    $tail = ($update.Text -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 2) -join ' / '
    Write-Ok "update 结果：$tail"
  }
  else {
    Write-Step '安装 bsk CLI（调用上游 installer）'
    $url = "https://raw.githubusercontent.com/$UpstreamRepo/main/install.ps1"
    $body = (Invoke-WebRequest -Uri $url -UseBasicParsing).Content
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) "bsk-install-$([Guid]::NewGuid().ToString('N')).ps1"
    try {
      [System.IO.File]::WriteAllText($temp, $body, (New-Object System.Text.UTF8Encoding($false)))
      & $temp
      if (-not (Get-Command bsk -ErrorAction SilentlyContinue)) { throw '安装后仍未找到 bsk' }
    }
    finally {
      Remove-Item $temp -Force -ErrorAction SilentlyContinue
    }
    Write-Ok "CLI 已安装到 $InstallDir\bsk.exe"
  }

  Write-Step '安装 agent skill（bsk install-skill --yes）'
  $skill = Invoke-Bsk -Arguments @('install-skill', '--yes')
  if ($skill.Text -match '(installed|up to date|已安装)') { Write-Ok 'skill 已安装（DSH 从 ~/.agents/skills 读取）' }
  else { Write-Warn "skill 安装结果需要确认：$(($skill.Text -split "`n" | Select-Object -Last 3) -join ' / ')" }
}

<# 准备浏览器扩展：store 引导或 unpacked 下载解压。 #>
function Invoke-Extension {
  switch ($ExtensionMode) {
    'none' { Write-Step '跳过扩展'; return 0 }
    'store' {
      Write-Step '从商店安装扩展（推荐，自动更新）'
      Write-Host "  Edge:   $EdgeStoreUrl"
      Write-Host "  Chrome: $ChromeStoreUrl"
      Write-Host '  安装后打开扩展弹窗等它变绿，再重跑本脚本自检。'
      try { Start-Process $EdgeStoreUrl } catch { Write-Warn '无法自动打开商店页，请手动复制上面的链接' }
      return 0
    }
    'unpacked' {
      Write-Step "离线准备扩展 v$ExtensionVersion"
      $zip = Join-Path $ExtensionDir "browser-skill-extension-v$ExtensionVersion-chrome.zip"
      $dest = Join-Path $ExtensionDir $ExtensionVersion
      if (-not (Test-Path (Join-Path $dest 'manifest.json'))) {
        New-Item -ItemType Directory -Path $ExtensionDir -Force | Out-Null
        $url = "https://github.com/$UpstreamRepo/releases/download/ext-v$ExtensionVersion/browser-skill-extension-v$ExtensionVersion-chrome.zip"
        Write-Host "  下载 $url"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $dest -Force
      }
      $manifest = Get-Content (Join-Path $dest 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
      Write-Ok "已就绪 $($manifest.name) v$($manifest.version)：$dest"
      Write-Host '  在 Edge 中：edge://extensions → 开发人员模式 → 加载解压缩的扩展 → 选择上面的目录'
      Write-Host '  若旧版仍是解压缩加载的，请一并移除，避免两个扩展同时连 daemon'
      return 0
    }
  }
}

<# 写入 / 移除 Edge 强制安装策略（当前用户）。 #>
function Set-EdgePolicy {
  if ($RemoveEdgePolicy) {
    if (Test-Path $PolicyKey) {
      Remove-ItemProperty -Path $PolicyKey -Name '1' -ErrorAction SilentlyContinue
      Write-Ok "已移除策略 $PolicyKey\1"
    }
    else { Write-Warn '未发现已写入的策略' }
    return
  }
  if (-not $WriteEdgePolicy) { return }
  if (-not (Test-Path $PolicyKey)) { New-Item -Path $PolicyKey -Force | Out-Null }
  $value = "$EdgeStoreId;https://edge.microsoft.com/extensionwebstorebase/v1/crx"
  New-ItemProperty -Path $PolicyKey -Name '1' -Value $value -PropertyType String -Force | Out-Null
  Write-Ok "已写入强制安装策略：$PolicyKey\1 = $value"
  Write-Warn '需要重启 Edge 生效；策略只影响当前 Windows 用户'
}

$exitCode = 0
try {
  switch ($Mode) {
    'check' { $exitCode = Invoke-Check }
    'install' { Invoke-InstallCli; Invoke-Extension | Out-Null; $exitCode = Invoke-Check }
    'extension' { $exitCode = Invoke-Extension }
  }
  Set-EdgePolicy
}
catch {
  Write-Fail "执行失败：$($_.Exception.Message)"
  $exitCode = 1
}
exit $exitCode
