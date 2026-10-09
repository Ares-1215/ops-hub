# 一次性回補：補完 2026-04-01～10-08 深抓剩餘批次（內網 09:00 後才連得到）、班次里程、同步到中樞
$env:PYTHONIOENCODING = 'utf-8'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$py = "C:\Users\26516\AppData\Local\Programs\Python\Python312\python.exe"
$eng = "C:\Users\26516\notebookLM\nls-explorer"
$log = "C:\Users\26516\ops-hub\tools\backfill.log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] backfill 開始" | Add-Content -Encoding utf8 $log
Set-Location $eng
& $py deep_pull.py rev606 cost626 gap206 unseal79 hours80 misc_range handover77 fleet auto transit645 2>&1 | Add-Content -Encoding utf8 $log
& $py trip_km.py 20260904 20260410 2>&1 | Add-Content -Encoding utf8 $log
& $py "C:\Users\26516\ops-hub\tools\hub_sync.py" --pull-days 2 2>&1 | Add-Content -Encoding utf8 $log
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] backfill 結束" | Add-Content -Encoding utf8 $log
