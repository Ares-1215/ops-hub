# ops-hub — 運務資料中樞

https://ares-1215.github.io/ops-hub/ ・ 新竹物流 運務處資料中樞：每日運行狀況剖析看板 / 報表資料倉 / 更新狀態 / 文件。

- 前端：`index.html` 單檔（零依賴；Excel 匯出時才從 cdnjs 載入 SheetJS）。
- 後端：Supabase（表 `nx_daily / nx_detail / nx_coverage / nx_pull_log / nx_meta / nx_users`，Storage `nx-raw / nx-docs`）＋ Edge Function `nxhub`（登入 token 驗證；寫入走 ingest token）。
- 資料來源：HCT nls 報表平台（內網，唯讀），抓取引擎在 `C:\Users\26516\notebookLM\nls-explorer`。
- 同步：`tools/hub_sync.py`（回補最近 N 天 → 建 KPI → 上傳）；Windows 排程 `OpsHub-Daily` 每天 13:00 跑 `tools/update_daily.ps1`。
- 內網限制：公司網路只在 09:00～23:59 可連 nls，排程與回補都要落在這個時段。
