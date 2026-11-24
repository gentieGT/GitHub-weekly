#requires -Version 5.1
<#
.SYNOPSIS
    让手机能访问 gh-weekly（添加防火墙放行规则）。

.DESCRIPTION
    需要管理员权限。右键「以管理员身份运行 PowerShell」后再跑本脚本。

    做两件事：
      1. 给 11436 端口加 TCP 入站放行（专用 + 公用网络都开）
      2. 显示当前局域网地址，手机用那个打开
#>

$ErrorActionPreference = 'Stop'
$port = 11436
$ruleName = "gh-weekly $port"

Write-Host '============================================' -ForegroundColor Cyan
Write-Host " 让手机能访问 gh-weekly（端口 $port）" -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

# 权限检查
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host '[错误] 需要管理员权限。' -ForegroundColor Red
    Write-Host '  右键「Windows PowerShell」→「以管理员身份运行」，再执行本脚本。' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '按任意键关闭...'
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

Write-Host '[1/3] 清理旧规则...' -ForegroundColor Yellow
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Write-Host '[2/3] 添加放行规则（TCP 入站，专用+公用网络）...' -ForegroundColor Yellow
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Protocol TCP -LocalPort $port `
    -Action Allow -Profile Private, Domain, Public `
    -Description 'gh-weekly reader, allow LAN access from phone' | Out-Null
Write-Host '      已添加' -ForegroundColor Green

Write-Host '[3/3] 局域网地址：' -ForegroundColor Yellow
$addrs = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
if (-not $addrs) {
    Write-Host '      没找到局域网 IP，检查是否连了 WiFi' -ForegroundColor Red
} else {
    foreach ($a in $addrs) {
        Write-Host ("      http://{0}:{1}/    ({2})" -f $a.IPAddress, $port, $a.InterfaceAlias) -ForegroundColor Green
    }
    Write-Host ''
    Write-Host '  手机连同一个 WiFi，浏览器打开上面任意一个地址。' -ForegroundColor White
}

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ' 完成。如果手机还是打不开，检查：' -ForegroundColor Cyan
Write-Host '   1. 手机和电脑是不是同一个 WiFi' -ForegroundColor Gray
Write-Host '   2. 路由器是否开了「AP 隔离」（访客网络常见）' -ForegroundColor Gray
Write-Host '   3. 电脑上服务是否在跑：浏览器访问 127.0.0.1:11436' -ForegroundColor Gray
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '按任意键关闭...'
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
