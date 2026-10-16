# -*- coding: utf-8 -*-
"""本機預覽用假 API + 靜態檔伺服器（不碰 Supabase、不用帳密）
  python tools/mock_api.py [port]        預設 8787
  瀏覽器開 http://127.0.0.1:8787/index.html 後，在 console 執行：
    localStorage.setItem('nx_api','http://127.0.0.1:8787/api');localStorage.setItem('nx_auth',JSON.stringify({token:'mock',name:'本機預覽',emp:'0000'}));location.reload()
資料來源：C:\\Users\\26516\\notebookLM\\nls-explorer\\data（daily_kpi.csv / detail / price_calib / trip_dow / ot_agg / stations / coverage）
"""
import csv, datetime, json, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(r"C:\Users\26516\notebookLM\nls-explorer\data")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def kpi_rows():
    rows = []
    for r in csv.DictReader(open(DATA / "daily_kpi.csv", encoding="utf-8-sig")):
        day = r.pop("day"); dow = r.pop("dow"); data = {}
        for k, v in r.items():
            if v == "":
                continue
            try:
                data[k] = float(v) if "." in v else int(v)
            except ValueError:
                data[k] = v
        rows.append({"day": f"{day[:4]}-{day[4:6]}-{day[6:]}", "dow": dow, "data": data})
    return rows


def meta(k):
    if k == "sync":
        return {"v": {"at": datetime.datetime.now().isoformat(timespec="minutes")}}
    if k.startswith("st:"):
        p = DATA / "stations" / (k[3:] + ".json")
        return {"v": jload(p) if p.exists() else None}
    for cand in (DATA / (k + ".json"), DATA / "stations" / (k + ".json"), DATA / "tools" / (k + ".json")):
        if cand.exists():
            return {"v": jload(cand)}
    return {"v": None}


def detail(day, kinds):
    p = DATA / "detail" / (day.replace("-", "") + ".json")
    if not p.exists():
        return {"rows": []}
    d = jload(p)
    return {"rows": [{"day": day, "kind": k, "payload": d.get(k, [])} for k in (kinds or list(d.keys()))]}


def status():
    cov = []
    p = DATA / "coverage.json"
    if p.exists():
        c = jload(p)
        cov = c if isinstance(c, list) else [{"rid": k, **(v if isinstance(v, dict) else {})} for k, v in c.items()]
    return {"coverage": cov, "sync": meta("sync"), "log": []}


def trip_hist(code):
    p = DATA / "trip_hist.json"
    if p.exists():
        d = jload(p).get(code)
        if d:
            return {"code": code, **d}
    return {"code": code, "info": None, "hist": {}}


def handle(body):
    a = body.get("action")
    if a == "login":
        return {"token": "mock", "name": "本機預覽"}
    if a == "kpi":
        return {"rows": kpi_rows()}
    if a == "meta":
        return meta(body.get("k", ""))
    if a == "detail":
        return detail(body.get("day", ""), body.get("kinds"))
    if a == "status":
        return status()
    if a == "trip_hist":
        return trip_hist(body.get("code", ""))
    if a in ("decide_list",):
        return {"rows": []}
    if a in ("decide_save", "decide_delete", "chpass"):
        return {"ok": True}
    if a in ("raw_list",):
        return {"rows": []}
    if a in ("raw_url", "doc_url"):
        return {"url": "about:blank"}
    return {"error": f"mock 不支援 {a}"}


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
            out = handle(body); code = 400 if "error" in out else 200
        except Exception as e:
            out = {"error": str(e)}; code = 500
        data = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def log_message(self, fmt, *args):
        if "POST" in fmt % args or " 404 " in fmt % args or " 500 " in fmt % args:
            sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    print(f"mock api + static on http://127.0.0.1:{PORT}/  (root {ROOT}, data {DATA})")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
