# zhiya-server.ps1 — 枝桠绿色便携包启动器核心（Windows 内置 PowerShell，零依赖）
# 仅监听 127.0.0.1（无需管理员），只服务本目录白名单文件，浏览器自动打开。
param([int]$Port = 0)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $Host.UI.RawUI.WindowTitle = '枝桠 Zhiya' } catch {}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

# 白名单：只允许访问这些文件（防目录穿越）
$allowed = @{}
foreach ($name in @('枝桠.html', 'index.html', '使用说明.md')) {
  $p = Join-Path $root $name
  if (Test-Path -LiteralPath $p) {
    $mime = if ($name -like '*.html') { 'text/html; charset=utf-8' }
            elseif ($name -like '*.md') { 'text/markdown; charset=utf-8' }
            else { 'application/octet-stream' }
    $allowed[$name] = @{ Path = $p; Mime = $mime }
  }
}
if (-not ($allowed.ContainsKey('枝桠.html') -or $allowed.ContainsKey('index.html'))) {
  Write-Host '[错误] 未找到 枝桠.html —— 请保持启动器与枝桠.html在同一目录。' -ForegroundColor Red
  exit 1
}
$home2 = if ($allowed.ContainsKey('枝桠.html')) { '枝桠.html' } else { 'index.html' }

# 动态端口：8765 起直到绑定成功
function Test-Port([int]$p) {
  $l = $null
  try { $l = [System.Net.HttpListener]::new(); $l.Prefixes.Add("http://127.0.0.1:$p/"); $l.Start(); $l.Stop(); return $true }
  catch { return $false }
}
if ($Port -eq 0) {
  $Port = 8765
  while (-not (Test-Port $Port)) { $Port++; if ($Port -gt 8800) { Write-Host '[错误] 8765-8800 端口均被占用。' -ForegroundColor Red; exit 1 } }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try { $listener.Start() } catch { Write-Host "[错误] 无法监听端口 ${Port}: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

$url = "http://127.0.0.1:$Port/"
Write-Host ''
Write-Host '  ┌────────────────────────────────────────────┐' -ForegroundColor DarkCyan
Write-Host '  │  枝桠 Zhiya · 思维导图                     │' -ForegroundColor Cyan
Write-Host "  │  地址：$url" -ForegroundColor Cyan
Write-Host '  │  数据保存在浏览器中（关闭窗口不会丢）      │' -ForegroundColor DarkGray
Write-Host '  │  关闭本黑窗口 = 退出枝桠                   │' -ForegroundColor DarkGray
Write-Host '  └────────────────────────────────────────────┘' -ForegroundColor DarkCyan
Write-Host ''
Write-Host "  正在打开浏览器……（若未自动打开，请手动访问 $url）"

try { Start-Process $url } catch {}

# 服务循环
while ($listener.IsListening) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $name = ($req.Url.AbsolutePath -replace '^/+', '') -replace '%[0-9a-fA-F]{2}', { param($m) [char][Convert]::ToInt32($m.Value.Substring(1), 16) }
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $home2 }
    if ($allowed.ContainsKey($name)) {
      $bytes = [System.IO.File]::ReadAllBytes($allowed[$name].Path)
      $res.ContentType = $allowed[$name].Mime
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes('404')
      $res.OutputStream.Write($b, 0, $b.Length)
    }
  } catch {} finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
