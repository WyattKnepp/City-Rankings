# City Rankings

Rank US cities by head-to-head matchups. An interactive merge sort asks "which would you rather live in?" until
every city is ordered, then writes the result to `rankings.txt`:

```
1. Chicago, IL
2. Austin, TX
...
```

## Run

```
python3 server.py [--port 3000]
```

Then open http://localhost:3000. It uses only the Python standard library and listens on `127.0.0.1` only.

## Using it

- **Left / right arrow** picks a city. **Shift + arrow** hits "Not here" for that city, removing it from the ranking.
- **Undo** reverses the last pick or removal.
- Click a section label (Weather, Nightlife, ...) to collapse it; the choice is remembered in the browser.
- **Show on map** shows the city's state with other cities and a red dot for its location.
- The layout adapts to phone screens.
- Progress is saved to `progress.json` after every click, so you can close the tab or stop the server and resume.
  Delete it to start over.
- `rankings.txt` is written when the last comparison is done.

## City summaries

Each city has an AI-written summary (weather, music scene, nightlife, size, housing, politics, average age,
concerns, cool things) shown side by side. They come from `summaries.json`, which is committed. Facts come from the
model's memory, so treat them as ballpark.

To generate new ones (for cities you add to `cities.txt`), put a key in a `.env` file:

```
ANTHROPIC_API_KEY=your-key
```

then run `python3 generate_summaries.py`. It skips cities already in `summaries.json`. The server also generates a
missing summary on demand.

## Files

| File | Purpose |
| --- | --- |
| `server.py` | Server, API, summary generation |
| `index.html` | The whole front end |
| `cities.txt` | Cities to rank, one per line |
| `coords.json` / `states.json` | City coordinates and state outlines for the map (outlines from [us-atlas](https://github.com/topojson/us-atlas)) |
| `summaries.json` | Cached city summaries |
| `progress.json`, `rankings.txt` | Your saved progress and final result (git-ignored) |
