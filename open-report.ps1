#requires -Version 5.1
<#
.SYNOPSIS
    打开 GitHub 周报：服务没起就先拉起，再打开浏览器。

.DESCRIPTION
    所有路径都从本文件位置推断，不写死盘符和用户名，
    clone 到任何目录都能直接用。

.PARAMETER Port
    监听端口，默认 11436。
#>
param([int]$Port = 11436)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here 'server.mjs'
$log = Join-Path $here 'watchdog.log'
$url = "http://127.0.0.1:$Port/"

function Test-Up {
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
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

if (-not (Test-Up)) {
    $node = Find-Node
    if (-not $node) {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.MessageBox]::Show(
            "找不到 Node.js。`n请先安装：https://nodejs.org/", 'GitHub 周报') | Out-Null
        exit 1
    }
    if (-not (Test-Path $script)) {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.MessageBox]::Show(
            "找不到 server.mjs：`n$script", 'GitHub 周报') | Out-Null
        exit 1
    }

    Start-Process -FilePath $node -ArgumentList ('"' + $script + '" --port=' + $Port) `
        -WorkingDirectory $here -WindowStyle Hidden

    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Up) { break }
    }
}

if (-not (Test-Up)) {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show(
        "服务启动失败。`n请检查日志：`n$log", 'GitHub 周报') | Out-Null
    exit 1
}

Start-Process $url
