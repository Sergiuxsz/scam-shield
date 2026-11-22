"""Local bridge: the UI (web app, mobile, desktop pill) asks this server, which runs pipeline.analyse().

Contract (ui/app/src/config.js):
  POST /analyze   body = one scenario in the brief's format
  answer          {"scamType": "...", "messages": [{"n": 1, "flags": ["RF_..."], "spans": [{"code","start","end"}]}],
                   "engine": "...", "verdict": "...", "risk_score": 0}
The UI recomputes score, verdict and first alert itself with the official formula, so we send only the
flags that COUNT (after fusion's gates), each on the message where it first appeared.
If this server is down or slow, the UI falls back to its own rules detector.

  GET  /health    {"ok": true, "signals": {...}}

Local only: binds 127.0.0.1, rejects other Host headers, CORS only for localhost pages (and file://).
Models load once at start; requests are handled one at a time (the GPU models are not thread-safe).

Usage:  ..\\.venv\\Scripts\\python api.py            (port 8000, or SCAM_API_PORT)
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import loader
import pipeline
from catalog import norm

HOST = "127.0.0.1"
PORT = int(os.environ.get("SCAM_API_PORT", "8000"))
MAX_BODY = 1_000_000
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
_lock = threading.Lock()


def _origin_ok(origin: str | None) -> bool:
    if not origin:
        return False
    if origin == "null":  # index.html opened by double-click (file://)
        return True
    return origin.startswith(("http://localhost:", "http://127.0.0.1:")) or origin in ("http://localhost", "http://127.0.0.1")


def _span(text: str, evidence: str, code: str) -> dict | None:
    """Where the evidence sits in the message (diacritic- and case-insensitive; norm keeps the length)."""
    ev = (evidence or "").strip()
    if len(ev) < 2 or ev.startswith("encoder "):
        return None
    i = norm(text).find(norm(ev))
    return {"code": code, "start": i, "end": i + len(ev)} if i >= 0 else None


def to_ui(scenario: dict, result: dict) -> dict:
    counted = set(result["red_flags"])
    messages = []
    for m in result["per_message"]:
        flags = [f for f in m["new_flags"] if f in counted]
        out = {"n": m["n"], "flags": flags}
        spans = [s for f in flags if (s := _span(m["text"], m["new_flags"][f].get("evidence", ""), f))]
        if spans:  # without spans the UI keeps its own highlighting for this message
            out["spans"] = spans
        messages.append(out)
    sig = result.get("signals", {})
    engine = "+".join(k if v is True else str(v) for k, v in sig.items() if v) or "rules"
    return {"scamType": result["scam_type"], "messages": messages, "engine": "scam_shield:" + engine,
            "verdict": result["verdict"], "risk_score": result["risk_score"], "first_alert": result["first_alert"],
            "llm_calls": result.get("llm_calls", 0)}


class Handler(BaseHTTPRequestHandler):
    server_version = "ScamShieldAPI/1.0"

    def log_message(self, fmt, *args):  # no message content in logs, only method/path/status
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def _send(self, code: int, body: dict | None = None):
        data = json.dumps(body or {}, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        origin = self.headers.get("Origin")
        if _origin_ok(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _host_ok(self) -> bool:
        if self.headers.get("Host") not in ALLOWED_HOSTS:
            self._send(403, {"error": "local only"})
            return False
        return True

    def do_OPTIONS(self):
        if self._host_ok():
            self._send(204 if _origin_ok(self.headers.get("Origin")) else 403)

    def do_GET(self):
        if not self._host_ok():
            return
        if self.path.rstrip("/") == "/health":
            self._send(200, {"ok": True, "signals": pipeline.signals_available()})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self._host_ok():
            return
        if self.path.rstrip("/") not in ("/analyze", "/v1/analyze"):
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self._send(413, {"error": "body missing or too large"})
        try:
            scenario = loader.normalise(json.loads(self.rfile.read(n).decode("utf-8-sig")))
        except Exception:
            return self._send(400, {"error": "invalid scenario JSON"})
        t = time.time()
        try:
            with _lock:
                result = pipeline.analyse(scenario)
        except Exception as e:  # the UI falls back to its rules; never crash the server
            return self._send(500, {"error": type(e).__name__})
        body = to_ui(scenario, result)
        body["seconds"] = round(time.time() - t, 2)
        self._send(200, body)


def main():
    print("loading models...", flush=True)
    print("signals:", pipeline.signals_available(), flush=True)
    warm = loader.from_text("Bună ziua, vă sunăm de la bancă.")
    with _lock:
        pipeline.analyse(warm)  # first call loads the models; do it before the jury's first request
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Scam Shield API on http://{HOST}:{PORT}  (POST /analyze, GET /health)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
