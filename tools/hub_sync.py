# -*- coding: utf-8 -*-
"""運務資料中樞每日同步：抓 nls（唯讀）→ 建 KPI → 上傳 Supabase（經 Edge Function nxhub）。
用法：
  python hub_sync.py                 # 回補最近 3 天 + 必要的月檔 + 建資料 + 上傳
  python hub_sync.py --pull-days 7   # 回補最近 7 天
  python hub_sync.py --no-pull       # 只重建與上傳（不碰 nls）
  python hub_sync.py --upload-only   # 只上傳（不抓、不建）
  python hub_sync.py --from 20260401 --to 20260430   # 指定區間回補（不強制覆蓋已存在）
引擎（nls.py / deep_pull.py / build_dataset.py / trip_km.py / notes.py）在 ENGINE 目錄。
"""
import argparse, base64, csv, gzip, hashlib, io, json, re, ssl, subprocess, sys, time
from datetime import date, datetime, timedelta
from pathlib import Path

ENGINE = Path(r"C:\Users\26516\notebookLM\nls-explorer")
TOOLS = Path(__file__).parent
CONFIG = json.loads((TOOLS / "config.local.json").read_text(encoding="utf-8"))
STATE_F = ENGINE / "data" / "sync_state.json"
SSL_CTX = ssl._create_unverified_context()   # 公司網路 TLS 攔截
PY = sys.executable
sys.path.insert(0, str(ENGINE))
import os
os.chdir(ENGINE)
import deep_pull   # noqa: E402  (會載入 raw/params.json)
from notes import NOTES, WRITE_RISK  # noqa: E402

DAILY_JOBS = {   # rid -> params(day)
    "41": lambda d: {"P1": d, "P2": d, "P3": "0000", "P4": "0000", "P5": "0000", "P6": "0", "P7": "0"},
    "83": lambda d: {"P1": d},
    "2": lambda d: {"P1": d},
    "3": lambda d: {"P1": d},
    "205": lambda d: {"P1": d, "P2": d, "P3": ""},
    "206": lambda d: {"P1": d, "P2": "0000", "P3": "0", "P4": "0000", "P5": "0000", "P6": "2400", "P7": "2400"},
    "79": lambda d: {"P1": d, "P2": "0000", "P3": "0000", "P4": "0", "P5": "0", "P6": "0000", "P7": "0000", "P8": "1N", "P9": "1N", "P10": "1"},
    "80": lambda d: {"P1": d, "P2": "0000", "P3": "0000", "P4": "0"},
    "606": lambda d: {"P1": d, "P2": "1", "P3": "0000"},
    "77": lambda d: {"P1": d, "P2": "0000", "P3": "0", "P4": "0", "P5": "0"},
    "62": lambda d: {"P1": d, "P6": d, "P2": "0000", "P7": "0000", "P3": "0", "P4": "0", "P5": "0"},
}
GRAIN_DAY = {"41", "83", "2", "3", "205", "206", "79", "80", "606", "77", "62", "150", "155", "210", "54", "26", "92", "139", "117", "35", "645"}


def log(msg):
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    (TOOLS / "sync.log").open("a", encoding="utf-8").write(line + "\n")


def edge(payload, retries=6):
    import urllib.request
    payload = {**payload, "ingest": CONFIG["ingest_token"]}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(CONFIG["edge_url"], data=body, method="POST", headers={"Content-Type": "application/json"})
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=300, context=SSL_CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as ex:
            if i == retries - 1:
                raise
            log(f"  edge retry {i + 1}: {ex}")
            time.sleep(3 * (i + 1) if i < 2 else 20)


def load_state():
    return json.loads(STATE_F.read_text(encoding="utf-8")) if STATE_F.exists() else {"raw": {}, "detail": {}, "docs": {}, "log_lines": 0}


def save_state(st):
    STATE_F.write_text(json.dumps(st, ensure_ascii=False, indent=0), encoding="utf-8")


# ---------------- 抓取 ----------------
def pull_days(days, force):
    for d in days:
        ymd = d.strftime("%Y%m%d")
        for rid, fn in DAILY_JOBS.items():
            deep_pull.run(rid, ymd, fn(ymd), force=force)


def pull_monthly(today):
    """每月 5 日後補上個月的月檔：626（當年全部科目）、39、55；順便刷新 31/96/50 主檔。"""
    if today.day < 5:
        return
    prev = (today.replace(day=1) - timedelta(days=1))
    ym = prev.strftime("%Y%m")
    y = prev.strftime("%Y")
    need = not (ENGINE / "data" / "39" / f"{ym}.csv").exists()
    if need:
        log(f"月檔回補 {ym}")
        deep_pull.run("39", ym, {"P1": ym, "P2": "0000", "P3": "ALL"})
        deep_pull.run("55", ym, {"P1": ym, "P2": "0000"})
        for code, _n in deep_pull.P["626"]["params"][3]["options"]:
            deep_pull.run("626", f"{y}_{code.strip()}", {"P1": y, "P2": "01", "P3": prev.strftime("%m"), "P4": code, "P5": "0000", "P6": ""}, force=True)
        deep_pull.run("31", "all", {"P1": "0000"}, force=True)
        deep_pull.run("96", "all", {"P1": "0000", "P2": "0000", "P3": "99", "P4": "Y", "P5": "0", "P6": "0000", "P7": "行駛日 desc"}, force=True)
        deep_pull.run("50", "all", {"P1": "0000", "P2": "1"}, force=True)


def trip_km_for(day_ymd):
    subprocess.run([PY, "trip_km.py", day_ymd], cwd=ENGINE, check=False)


def build():
    r = subprocess.run([PY, "build_dataset.py"], cwd=ENGINE, capture_output=True, text=True, encoding="utf-8", errors="replace")
    log("build_dataset: " + (r.stdout.strip().splitlines() or ["?"])[0])
    if r.returncode:
        log("build_dataset ERR: " + r.stderr[-500:])
    for b in ("build_dashboard.py", "build_proposal.py", "build_handbook.py"):
        subprocess.run([PY, b], cwd=ENGINE, capture_output=True)
    subprocess.run(["node", "html_to_docx.js", "out/運務處資料分析提案.html", "out/運務處資料分析提案.docx"], cwd=ENGINE, capture_output=True)


# ---------------- 上傳 ----------------
def md5(b):
    return hashlib.md5(b).hexdigest()


def upload_daily():
    rows = []
    for r in csv.DictReader(open(ENGINE / "data" / "daily_kpi.csv", encoding="utf-8-sig")):
        day = r.pop("day"); dow = r.pop("dow")
        data = {}
        for k, v in r.items():
            if v == "":
                continue
            try:
                data[k] = float(v) if "." in v else int(v)
            except ValueError:
                data[k] = v
        rows.append({"day": f"{day[:4]}-{day[4:6]}-{day[6:]}", "dow": dow, "data": data, "updated_at": datetime.now().isoformat()})
    for i in range(0, len(rows), 200):
        edge({"action": "ingest_daily", "rows": rows[i:i + 200]})
    log(f"nx_daily 上傳 {len(rows)} 天")


def upload_detail(st):
    rows = []; n = 0
    for p in sorted((ENGINE / "data" / "detail").glob("*.json")):
        b = p.read_bytes(); h = md5(b)
        if st["detail"].get(p.stem) == h:
            continue
        day = f"{p.stem[:4]}-{p.stem[4:6]}-{p.stem[6:]}"
        for kind, payload in json.loads(b.decode("utf-8")).items():
            rows.append({"day": day, "kind": kind, "payload": payload, "updated_at": datetime.now().isoformat()})
        st["detail"][p.stem] = h; n += 1
        if len(rows) >= 40:
            edge({"action": "ingest_detail", "rows": rows}); rows = []
    if rows:
        edge({"action": "ingest_detail", "rows": rows})
    log(f"nx_detail 上傳 {n} 天")


def upload_raw(st):
    n = 0; total = 0
    for rid_dir in sorted((ENGINE / "data").iterdir()):
        if not rid_dir.is_dir() or not re.fullmatch(r"\d+", rid_dir.name) or rid_dir.name == "113":
            continue   # 113 逐車頭小檔只留彙整後的 trip_km.json
        for p in sorted(rid_dir.glob("*")):
            if p.suffix not in (".csv", ".json"):
                continue
            key = f"{rid_dir.name}/{p.name}"
            sig = f"{p.stat().st_mtime_ns}:{p.stat().st_size}"
            if st["raw"].get(key) == sig:
                continue
            b = p.read_bytes()
            if p.suffix == ".csv":
                if not b.strip():
                    st["raw"][key] = sig; continue
                gz = gzip.compress(b, 6)
                edge({"action": "put_raw", "path": key + ".gz", "b64": base64.b64encode(gz).decode(), "content_type": "application/gzip"})
                total += len(gz)
            else:
                edge({"action": "put_raw", "path": key, "b64": base64.b64encode(b).decode(), "content_type": "application/json"})
            st["raw"][key] = sig; n += 1
            if n % 50 == 0:
                save_state(st); log(f"  raw {n} 檔…")
    log(f"raw 上傳 {n} 檔（{total / 1e6:.1f} MB gz）")


def upload_log(st):
    lines = (ENGINE / "data" / "pull.log").read_text(encoding="utf-8").splitlines() if (ENGINE / "data" / "pull.log").exists() else []
    new = lines[st.get("log_lines", 0):]
    rows = []
    today = date.today()
    for ln in new:
        m = re.match(r"(\d\d:\d\d:\d\d) (\S+) (\S+) (ok|ERR|EXC|skip)(.*?) ([\d.]+)s$", ln)
        if not m:
            continue
        rest = m.group(5)
        mr = re.search(r"rows=(\S+)", rest); ml = re.search(r"csv_lines=(\d+)", rest)
        rows.append({"rid": m.group(2), "key": m.group(3), "status": m.group(4) if m.group(4) == "ok" else (m.group(4) + rest.strip())[:300],
                     "rows": int(mr.group(1)) if mr and mr.group(1).isdigit() else None, "lines": int(ml.group(1)) if ml else None,
                     "secs": float(m.group(6)), "at": f"{today.isoformat()}T{m.group(1)}+08:00"})
    for i in range(0, len(rows), 500):
        edge({"action": "ingest_log", "rows": rows[i:i + 500]})
    st["log_lines"] = len(lines)
    log(f"pull_log 上傳 {len(rows)} 筆")


def day_set_of(rid):
    days = set()
    for p in (ENGINE / "data" / rid).glob("*.csv"):
        k = p.stem
        if re.fullmatch(r"\d{8}", k):
            days.add(k)
        elif re.fullmatch(r"\d{8}_\d{8}", k):
            a, b = k.split("_")
            d = datetime.strptime(a, "%Y%m%d").date(); e = datetime.strptime(b, "%Y%m%d").date()
            while d <= e:
                days.add(d.strftime("%Y%m%d")); d += timedelta(days=1)
    return days


def upload_coverage():
    cat = {r[0]: (r[1], r[2]) for r in json.load(open(ENGINE / "raw" / "catalog.json", encoding="utf-8"))}
    lines = (ENGINE / "data" / "pull.log").read_text(encoding="utf-8").splitlines() if (ENGINE / "data" / "pull.log").exists() else []
    last_ok = {}; last_err = {}
    for ln in lines:
        m = re.match(r"(\d\d:\d\d:\d\d) (\S+) (\S+) (ok|ERR|EXC)(.*)", ln)
        if m:
            (last_ok if m.group(4) == "ok" else last_err)[m.group(2)] = ln
    rows = []
    for rid_dir in sorted((ENGINE / "data").iterdir()):
        rid = rid_dir.name
        if not rid_dir.is_dir() or not re.fullmatch(r"\d+", rid):
            continue
        files = list(rid_dir.glob("*.csv"))
        days = sorted(day_set_of(rid))
        missing = []
        if days and rid in GRAIN_DAY:
            d = datetime.strptime(days[0], "%Y%m%d").date(); e = datetime.strptime(days[-1], "%Y%m%d").date(); have = set(days)
            while d <= e:
                if d.strftime("%Y%m%d") not in have:
                    missing.append(d.strftime("%Y%m%d"))
                d += timedelta(days=1)
        n = NOTES.get(rid, {})
        rows.append({"rid": rid, "name": cat.get(rid, ("", ""))[1], "cls": cat.get(rid, ("", ""))[0], "star": n.get("star", 0),
                     "grain": n.get("grain", ""), "min_day": f"{days[0][:4]}-{days[0][4:6]}-{days[0][6:]}" if days else None,
                     "max_day": f"{days[-1][:4]}-{days[-1][4:6]}-{days[-1][6:]}" if days else None, "days": len(days), "missing": missing[:200],
                     "files": len(files), "bytes": sum(p.stat().st_size for p in files), "last_ok": None, "last_err": last_err.get(rid),
                     "updated_at": datetime.now().isoformat()})
    edge({"action": "ingest_coverage", "rows": rows})
    log(f"coverage 上傳 {len(rows)} 張")
    return rows


def upload_meta(cov):
    d = ENGINE / "data"
    for k, f in (("trip_km", "trip_km.json"), ("idle_trips", "idle_trips.json"), ("pair_low", "pair_low.json")):
        if (d / f).exists():
            edge({"action": "ingest_meta", "k": k, "v": json.loads((d / f).read_text(encoding="utf-8"))})
    if (d / "trip_load.json").exists():
        tl = json.loads((d / "trip_load.json").read_text(encoding="utf-8"))
        edge({"action": "ingest_meta", "k": "trip_load", "v": tl})
    # 報表目錄（給資料倉分頁）
    P = json.load(open(ENGINE / "raw" / "params.json", encoding="utf-8"))
    S = json.load(open(ENGINE / "raw" / "samples.json", encoding="utf-8"))
    import colmap
    catalog = []
    for rid, rec in P.items():
        n = NOTES.get(rid, {}); s = S.get(rid, {})
        names = None
        if s.get("header") and (ENGINE / "raw" / "samples" / f"{rid}.csv").exists():
            txt = (ENGINE / "raw" / "samples" / f"{rid}.csv").read_bytes().decode("cp950", "replace")
            if txt.strip():
                names = colmap.map_columns(s["header"], [s["header"]] + s.get("first_rows", []), txt)
        catalog.append({"rid": rid, "name": rec.get("name", ""), "cls": rec.get("class", ""), "star": n.get("star", 0), "grain": n.get("grain", ""),
                        "use": n.get("use", ""), "keys": n.get("keys", ""), "caveat": n.get("caveat", ""), "risk": WRITE_RISK.get(rid),
                        "header": s.get("header", []), "csv_names": names, "rpt_cond": rec.get("rpt_cond", ""),
                        "params": [{"name": p["name"], "label": p.get("label", ""), "type": p["type"], "default": p.get("default", "")} for p in rec.get("params", [])]})
    edge({"action": "ingest_meta", "k": "catalog", "v": catalog})
    daily = list(csv.DictReader(open(d / "daily_kpi.csv", encoding="utf-8-sig")))
    edge({"action": "ingest_meta", "k": "sync", "v": {"at": datetime.now().isoformat(), "days": len(daily), "last_day": daily[-1]["day"] if daily else None,
                                                       "reports": len(cov), "host": os.environ.get("COMPUTERNAME", "")}})
    log("meta 上傳完成")


def upload_docs(st):
    n = 0
    for p in (ENGINE / "out").glob("*.html"):
        b = p.read_bytes(); h = md5(b)
        if st["docs"].get(p.name) == h:
            continue
        edge({"action": "put_raw", "bucket": "nx-docs", "path": p.name, "b64": base64.b64encode(b).decode(), "content_type": "text/html; charset=utf-8"})
        st["docs"][p.name] = h; n += 1
    for p in (ENGINE / "out").glob("*.docx"):
        b = p.read_bytes(); h = md5(b)
        if st["docs"].get(p.name) == h:
            continue
        edge({"action": "put_raw", "bucket": "nx-docs", "path": p.name, "b64": base64.b64encode(b).decode(),
              "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"})
        st["docs"][p.name] = h; n += 1
    log(f"docs 上傳 {n} 份")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pull-days", type=int, default=3)
    ap.add_argument("--from", dest="d_from"); ap.add_argument("--to", dest="d_to")
    ap.add_argument("--no-pull", action="store_true"); ap.add_argument("--upload-only", action="store_true")
    ap.add_argument("--no-trip-km", action="store_true")
    a = ap.parse_args()
    t0 = time.time(); log("=== hub_sync 開始 ===")
    today = date.today()
    if not a.no_pull and not a.upload_only:
        if a.d_from:
            d = datetime.strptime(a.d_from, "%Y%m%d").date(); e = datetime.strptime(a.d_to or a.d_from, "%Y%m%d").date()
            days = []
            while d <= e:
                days.append(d); d += timedelta(days=1)
            pull_days(days, force=False)
        else:
            days = [today - timedelta(days=i) for i in range(a.pull_days, 0, -1)]
            pull_days(days, force=True)
            if not a.no_trip_km:
                trip_km_for((today - timedelta(days=1)).strftime("%Y%m%d"))
        pull_monthly(today)
    if not a.upload_only:
        build()
    st = load_state()
    upload_daily(); upload_detail(st); save_state(st)
    upload_raw(st); save_state(st)
    upload_log(st); save_state(st)
    cov = upload_coverage(); upload_meta(cov); upload_docs(st); save_state(st)
    log(f"=== 完成 {time.time() - t0:.0f}s ===")


if __name__ == "__main__":
    main()
