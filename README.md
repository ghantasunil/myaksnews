# My AKS News

A lightweight RSS feed aggregator that fetches feeds daily, generates a static JSON file, and serves a clean reading interface.

## How It Works

1. **Python script** (`scripts/fetch_feeds.py`) fetches RSS feeds defined in `feeds.yml`
2. Merges new items with existing data, deduplicates by URL, prunes items older than 7 days
3. Outputs `docs/data/feeds.json` — a static JSON file
4. **GitHub Actions** runs this daily and commits any changes
5. Static frontend in `docs/` reads the JSON and renders it

## Adding Feeds

Edit `feeds.yml` and add an entry:

```yaml
feeds:
  - name: My Feed
    url: https://example.com/rss
    category: Tech
```

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Fetch feeds
python scripts/fetch_feeds.py

# Serve the frontend
python -m http.server -d docs 8000
# Open http://localhost:8000
```

## Deployment

1. Push to `main`
2. The workflow runs daily at 6:00 UTC, or trigger manually from the Actions tab

## Design Choices

- **Static site** — no backend, no database, just files
- **7-day rolling window** — accumulates articles across runs, prunes stale ones
- **Vanilla JS** — no build step, no framework, fast loading
- **CSS dark mode** — `prefers-color-scheme` media query, zero JS
- **XSS-safe rendering** — `createElement` + `textContent`, no `innerHTML`
