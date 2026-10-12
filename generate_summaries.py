#!/usr/bin/env python3
"""Pre-generate summaries.json for every city in cities.txt (skips ones already cached)."""
import json, os
from concurrent.futures import ThreadPoolExecutor
from server import summarize, P

cities = [l.strip() for l in open(P("cities.txt")) if l.strip()]
cached = json.load(open(P("summaries.json"))) if os.path.exists(P("summaries.json")) else {}
todo = [c for c in cities if c not in cached]
print(f"{len(todo)} to generate, {len(cities) - len(todo)} already cached")

def work(c):
    for attempt in range(3):
        try:
            summarize(c); print("done", c); return
        except Exception as e:
            err = e
    print("FAILED", c, repr(err))

with ThreadPoolExecutor(4) as ex:
    list(ex.map(work, todo))
