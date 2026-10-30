# Daily Brief: notes for Claude

A static phone web app (PWA) served from GitHub Pages. There is no build step; content lives in `data/*.json`, and the app reads it on open.

## Data files
- `data/colors.json`: `{ "source": "...", "days": { "YYYY-MM-DD": { "color": "Name", "hex": "#RRGGBB", "note": "" } } }`. Dates are Doha time. Copy the user's chart exactly, and never invent a day that isn't on it.
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
  "events": ["what's scheduled next, in Doha time"],
  "sources": [{ "title": "...", "url": "https://..." }]
}
```

## Rules
- This repo is public. Never put customer names, deal details, priorities or anything personal in it.
- Market notes are factual summaries only. No buy/sell recommendations.
- Cross-check index levels against at least two sources. If sources disagree, use the one that matches the majority and note nothing you can't support.
- Validate every JSON file before committing (`python3 -m json.tool <file>`).
- When the shell changes (`index.html`, `app.css`, `app.js`, fonts, icons), bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js` so phones pick up the update.
