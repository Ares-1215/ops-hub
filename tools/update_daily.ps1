# 運務資料中樞每日自動同步：回補最近 3 天 + 班次里程 + 建 KPI + 上傳 Supabase
# 由 Windows 工作排程「OpsHub-Daily」每天 13:00 呼叫；漏跑會在下次開機補執行
$env:PYTHONIOENCODING = 'utf-8'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $tools 'update.log'
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] hub_sync 開始" | Add-Content -Encoding utf8 $log
try {
  $out = & "C:\Users\26516\AppData\Local\Programs\Python\Python312\python.exe" (Join-Path $tools 'hub_sync.py') --pull-days 3 2>&1
  $out | Out-String | Add-Content -Encoding utf8 $log
} catch {
  "錯誤: $_" | Add-Content -Encoding utf8 $log
}
if ((Get-Item $log).Length -gt 500KB) {
  $tail = Get-Content $log -Tail 400
  Set-Content -Encoding utf8 $log $tail
}
