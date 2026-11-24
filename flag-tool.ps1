#requires -Version 5.1
# Feature Flag 交互工具
# 用法：双击 flags.cmd，或 powershell -File flag-tool.ps1

$ErrorActionPreference = 'Stop'
$ROOT = 'D:\dsh-workspace\gh-weekly'
$FLAG_FILE = Join-Path $ROOT 'config\flags.json'
$API = 'http://127.0.0.1:11436/api/flags'

$KEYS = @(
  @{ key = 'briefing.expand';     name = '卡片展开简报';       hint = '关掉后卡片只剩标题+概括' }
  @{ key = 'briefing.forYou';     name = '「对你的用处」段';   hint = '依赖上面那个' }
  @{ key = 'briefing.tags';       name = '标签行';             hint = '依赖 expand' }
  @{ key = 'relevance.indicator'; name = '相关度彩色圆点';     hint = '与你相关/可借鉴/了解即可' }
  @{ key = 'ideas.submit';        name = '想法输入框';         hint = '关掉后不能提交想法' }
  @{ key = 'reports.display';     name = '实践反馈块';         hint = '关掉后只显示"等待实践"' }
)

function Read-Flags {
  if (-not (Test-Path $FLAG_FILE)) { return @{} }
  try {
    $raw = Get-Content $FLAG_FILE -Raw -Encoding UTF8
    $j = $raw | ConvertFrom-Json
    $out = @{}
    foreach ($k in $KEYS) {
      $v = $j.flags.PSObject.Properties[$k.key]
      if ($v -and $null -ne $v.Value.enabled) { $out[$k.key] = [bool]$v.Value.enabled }
      else { $out[$k.key] = $true }
    }
    return $out
  } catch {
    return $null
  }
}

function Write-Flags($map) {
  $obj = [ordered]@{
    _readme = '功能开关。改 enabled 为 false 即可关闭对应功能，保存后下一个请求生效，无需重启。'
    _lastChanged = (Get-Date -Format 'yyyy-MM-dd HH:mm')
    flags = [ordered]@{}
  }
  foreach ($k in $KEYS) {
    $obj.flags[$k.key] = [ordered]@{ enabled = $map[$k.key] }
  }
  $json = $obj | ConvertTo-Json -Depth 5
  # 必须无 BOM，否则 Node 的 JSON.parse 失败
  [System.IO.File]::WriteAllText($FLAG_FILE, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Show-Status {
  $map = Read-Flags
  Write-Host ''
  Write-Host '  ┌─────────────────────────────────────────────────────────┐' -ForegroundColor DarkGray
  Write-Host '  │  GitHub 周报 · 功能开关                                 │' -ForegroundColor Cyan
  Write-Host '  └─────────────────────────────────────────────────────────┘' -ForegroundColor DarkGray
  Write-Host ''

  if ($null -eq $map) {
    Write-Host '  ⚠ flags.json 解析失败，当前页面会用默认值（全开）' -ForegroundColor Red
    Write-Host "    文件：$FLAG_FILE" -ForegroundColor DarkGray
    return $null
  }

  for ($i = 0; $i -lt $KEYS.Count; $i++) {
    $k = $KEYS[$i]
    $on = $map[$k.key]
    $mark = if ($on) { '● 开' } else { '○ 关' }
    $color = if ($on) { 'Green' } else { 'DarkGray' }
    Write-Host ("   [{0}] " -f ($i + 1)) -NoNewline -ForegroundColor DarkGray
    Write-Host ("{0,-3}" -f $mark) -NoNewline -ForegroundColor $color
    Write-Host ("{0,-22}" -f $k.name) -NoNewline -ForegroundColor $(if ($on) { 'White' } else { 'DarkGray' })
    Write-Host (" {0}" -f $k.hint) -ForegroundColor DarkGray
  }
  Write-Host ''
  Write-Host '   [a] 全部开启      [z] 全部关闭      [s] 看线上状态' -ForegroundColor Yellow
  Write-Host '   [q] 退出' -ForegroundColor Yellow
  Write-Host ''
  return $map
}

function Test-Service {
  try {
    $r = Invoke-WebRequest -Uri $API -TimeoutSec 4 -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host ''
    Write-Host "  服务状态：$($j.meta.enabledCount)/$($j.meta.totalCount) 开启" -ForegroundColor Green
    if ($j.disabled.Count -gt 0) {
      Write-Host "  已关闭：$($j.disabled -join ', ')" -ForegroundColor Yellow
    } else {
      Write-Host '  全部开启' -ForegroundColor Green
    }
    if ($j.meta.error) {
      Write-Host "  ⚠ 解析错误：$($j.meta.error)" -ForegroundColor Red
    }
    Write-Host ''
  } catch {
    Write-Host ''
    Write-Host '  服务没在跑。启动命令：' -ForegroundColor Red
    Write-Host "  node $ROOT\server.mjs" -ForegroundColor DarkGray
    Write-Host ''
  }
}

# ── 主循环 ──
while ($true) {
  Clear-Host
  $map = Show-Status
  if ($null -eq $map) { break }

  $choice = Read-Host '  选择'

  if ($choice -eq 'q') { break }

  if ($choice -eq 'a') {
    foreach ($k in $KEYS) { $map[$k.key] = $true }
    Write-Flags $map
    Write-Host '  ✓ 已全部开启（刷新页面生效）' -ForegroundColor Green
    Start-Sleep -Milliseconds 800
    continue
  }

  if ($choice -eq 'z') {
    foreach ($k in $KEYS) { $map[$k.key] = $false }
    Write-Flags $map
    Write-Host '  ✓ 已全部关闭（刷新页面生效）' -ForegroundColor Green
    Start-Sleep -Milliseconds 800
    continue
  }

  if ($choice -eq 's') {
    Test-Service
    Read-Host '  回车继续' | Out-Null
    continue
  }

  $n = 0
  if ([int]::TryParse($choice, [ref]$n) -and $n -ge 1 -and $n -le $KEYS.Count) {
    $k = $KEYS[$n - 1]
    $map[$k.key] = -not $map[$k.key]
    Write-Flags $map
    $state = if ($map[$k.key]) { '开启' } else { '关闭' }
    Write-Host ("  ✓ {0} → {1}（刷新页面生效）" -f $k.name, $state) -ForegroundColor Green
    Start-Sleep -Milliseconds 800
    continue
  }

  Write-Host '  无效输入' -ForegroundColor Red
  Start-Sleep -Milliseconds 600
}

Write-Host ''
Write-Host '  已退出。改动立即生效，无需重启服务。' -ForegroundColor DarkGray
Write-Host ''
