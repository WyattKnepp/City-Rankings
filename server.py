#!/usr/bin/env python3
"""Run: python3 server.py  -> open http://localhost:8000"""
import json, os, random, threading, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

D = os.path.dirname(os.path.abspath(__file__))
P = lambda f: os.path.join(D, f)

def load_env():
    if os.path.exists(P(".env")):
        for line in open(P(".env")):
            k, _, v = line.strip().partition("=")
            if k and not k.startswith("#"):
                os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
load_env()
KEY = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
MODEL = "claude-haiku-5-5"
FIELDS = ["Weather", "Music Scene", "Nightlife", "Size", "Housing situation",
          "Political climate", "Average age", "Anything concerning", "Anything cool"]
lock = threading.Lock()

def summarize(city):
    with lock:
        cache = json.load(open(P("summaries.json"))) if os.path.exists(P("summaries.json")) else {}
    if city in cache:
        return cache[city]
    if not KEY:
        raise RuntimeError("No ANTHROPIC_API_KEY found in .env")
    prompt = (f"Give a brief, honest summary of {city} as a place to live. Reply with ONLY a JSON object "
              f"with exactly these keys, each a string of one or two short sentences: {json.dumps(FIELDS)}. "
              "Use concrete facts (numbers where useful, e.g. temperatures, population, median home price, "
              "median age). Be candid about downsides.")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", method="POST",
        data=json.dumps({"model": MODEL, "max_tokens": 4000,
                         "messages": [{"role": "user", "content": prompt}]}).encode(),
        headers={"x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    blocks = json.load(urllib.request.urlopen(req, timeout=60))["content"]
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
    result = json.loads(text[text.index("{"):text.rindex("}") + 1])
    with lock:
        cache = json.load(open(P("summaries.json"))) if os.path.exists(P("summaries.json")) else {}
        cache[city] = result
        json.dump(cache, open(P("summaries.json"), "w"), indent=1)
    return result

def load_state():
    if os.path.exists(P("progress.json")):
        return json.load(open(P("progress.json")))
    cities = [l.strip() for l in open(P("cities.txt")) if l.strip()]
    random.shuffle(cities)
    return {"cities": cities, "answers": []}

class H(BaseHTTPRequestHandler):
    def send(self, body, ctype="application/json"):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body if isinstance(body, bytes) else body.encode())

    def do_GET(self):
        if self.path == "/api/state":
            s = load_state()
            json.dump(s, open(P("progress.json"), "w"))
            self.send(json.dumps(s))
        elif self.path.startswith("/api/summary"):
            city = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)["city"][0]
            try:
                self.send(json.dumps({"fields": FIELDS, "data": summarize(city)}))
            except Exception as e:
                self.send(json.dumps({"error": str(e)}))
        else:
            self.send(open(P("index.html"), "rb").read(), "text/html")

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        if self.path == "/api/answers":
            s = load_state(); s["answers"] = json.loads(body)
            json.dump(s, open(P("progress.json"), "w"))
        elif self.path == "/api/rankings":
            open(P("rankings.txt"), "w").write(body)
        self.send("{}")

    def log_message(self, *a): pass

print("Open http://localhost:8000")
ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
