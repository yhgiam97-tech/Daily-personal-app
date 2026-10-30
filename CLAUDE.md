# Daily Brief: notes for Claude

A static phone web app (PWA) served from GitHub Pages. There is no build step; content lives in `data/*.json`, and the app reads it on open.

## Data files
- `data/colors.json`: the user's 衣服颜色 chart, by day star (当天日星).
  - `days`: `{ "YYYY-MM-DD": star }`, where star is 1–9 (calendar dates; the app reads them in the phone's own time zone).
  - `stars`: maps each star to its element and three palette keys in order of preference.
  - `palettes`: English and Chinese names, a backdrop `hex`, and colour `chips`.
  - Transcribe stars exactly as handwritten. The chart has deliberate jumps (e.g. Dec 16, Dec 22), so never "fix" the sequence and never invent a day that isn't on the chart.
  - The legend (top right of the chart) defines the choices:
    - 9 fire: earth, fire, metal
    - 2/5/8 earth: metal, earth, water
    - 6/7 metal: water, metal, wood
    - 3/4 wood: fire, wood, earth
    - 1 water: wood, water, fire
- `data/market.json`: the US market brief (shape below). Rewritten by the morning refresh.
- `data/curriculum.json`: `{ weeks: [{ title, days: [{ task, why, steps[], minutes, link?, linkLabel? }] }] }`. Progress is tracked on the device by position (`w{week}-d{day}`), so append new weeks rather than reordering existing ones.
- `data/config.json`: time zone, watchlist tickers, minutes per day.

## market.json shape
```json
{
  "asOf": "ISO time with +03:00",
  "session": "Thu 29 Oct close",
  "indices": [{ "name": "S&P 500", "level": 0, "changePct": 0 }],
  "watchlist": [{ "ticker": "NVDA", "name": "Nvidia", "price": 0, "changePct": 0 }],
  "notes": ["three plain-language bullets on what moved and why"],
  "events": ["what's scheduled next, in Kuwait time (UTC+3)"],
  "sources": [{ "title": "...", "url": "https://..." }]
}
```

## Market refresh (scheduled task)
- Runs after each US close, Mon–Fri.
- Each run rewrites `data/market.json` only: index closes, the watchlist from `data/config.json`, three "what moved" notes, events in Kuwait time (UTC+3), and sources.
- Commit message: `Market brief: <session>`.
- If figures can't be confirmed from two sources, leave the file unchanged and say why.

## Sync between phones
- Top 3 and lesson ticks sync through `brief-state.json` in a separate **private** repo, `yhgiam97-tech/daily-brief-sync`.
- Each phone reads and writes it with a fine-grained token saved only on that phone, with Contents read/write on that one repo.
- Every entry has a timestamp `t`, and the newest wins.
- Never copy that state into this public repo.

## Rules
- This repo is public. Never put customer names, deal details, priorities or anything personal in it.
- Market notes are factual summaries only. No buy/sell recommendations.
- Cross-check index levels against at least two sources. If sources disagree, use the one that matches the majority and note nothing you can't support.
- Validate every JSON file before committing (`python3 -m json.tool <file>`).
- Look and motion follow Apple's design language: system font, glass modules over the day's colour, iOS spring curves. Keep `prefers-reduced-motion` support intact.
- When the shell changes (`index.html`, `app.css`, `app.js`, icons), bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js` so phones pick up the update.
