#requires -Version 5.1
<#
.SYNOPSIS
    gh-weekly 看门狗：端口没响应就拉起服务，已在跑则直接退出。

.DESCRIPTION
    幂等设计，由计划任务每 5 分钟触发一次也无害。

    自动推断：
      - 服务端脚本 = 本文件同目录的 server.mjs
      - node 路径   = PATH 里的 node，或常见安装位置
    不写死用户名和盘符，clone 到任何机器都能跑。

.PARAMETER Port
    监听端口，默认 11436。
#>
param([int]$Port = 11436)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here 'server.mjs'
$log = Join-Path $here 'watchdog.log'
$url = "http://127.0.0.1:$Port/"

function Write-Log([string]$msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg" + [Environment]::NewLine
    try {
        # 必须用 .NET 追加：Add-Content -Encoding UTF8 每次都会写 BOM
        [System.IO.File]::AppendAllText($log, $line, (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
}

function Find-Node {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    return $null
}

# 已在跑就不动
$running = $false
try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $running = $true }
} catch {
    $running = $false
}

if ($running) { exit 0 }

Write-Log "service down, starting on port $Port"

$node = Find-Node
if (-not $node) { Write-Log 'ERROR: node not found (PATH and common install dirs)'; exit 1 }
if (-not (Test-Path $script)) { Write-Log "ERROR: server.mjs not found in $here"; exit 1 }

try {
    Start-Process -FilePath $node -ArgumentList ('"' + $script + '" --port=' + $Port) `
        -WorkingDirectory $here -WindowStyle Hidden
    Write-Log "started via $node"
} catch {
    Write-Log ('start failed: ' + $_.Exception.Message)
}
exit 0
