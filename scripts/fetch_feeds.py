#!/usr/bin/env python3
"""Fetch RSS feeds, merge with existing data, deduplicate, prune, and output JSON."""

import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import feedparser
import requests
import yaml
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "feeds.yml"
DEFAULT_OUTPUT = ROOT / "docs" / "data" / "feeds.json"


def load_config(path=DEFAULT_CONFIG):
    """Read and validate feeds.yml."""
    with open(path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    if not config or "feeds" not in config:
        raise ValueError("feeds.yml must contain a 'feeds' list")
    settings = config.get("settings", {})
    return config["feeds"], {
        "max_items_per_feed": settings.get("max_items_per_feed", 50),
        "max_total_items": settings.get("max_total_items", 500),
        "max_summary_length": settings.get("max_summary_length", 300),
        "max_age_days": settings.get("max_age_days", 7),
    }


def load_existing(path=DEFAULT_OUTPUT):
    """Load existing feeds.json items. Returns [] if file missing or invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("items", [])
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return []


def fetch_feed(url, timeout=30):
    """Fetch and parse a single RSS feed. Returns None on failure."""
    try:
        resp = requests.get(url, timeout=timeout, headers={
            "User-Agent": "AKSNewsletter/1.0 (RSS Aggregator)"
        })
        resp.raise_for_status()
        return feedparser.parse(resp.content)
    except Exception as e:
        log.warning("Failed to fetch %s: %s", url, e)
        return None


def clean_html(text, max_length=300):
    """Strip HTML tags and truncate to max_length."""
    if not text:
        return ""
    clean = BeautifulSoup(text, "html.parser").get_text(separator=" ", strip=True)
    if len(clean) > max_length:
        clean = clean[:max_length].rsplit(" ", 1)[0] + "..."
    return clean


def normalize_url(url):
    """Strip utm_* query params and trailing slashes for dedup."""
    if not url:
        return ""
    parsed = urlparse(url)
    params = {k: v for k, v in parse_qs(parsed.query).items() if not k.startswith("utm_")}
    cleaned = parsed._replace(query=urlencode(params, doseq=True))
    result = urlunparse(cleaned).rstrip("/")
    return result


def parse_date(entry):
    """Extract published date from a feed entry as ISO 8601 UTC string."""
    for field in ("published_parsed", "updated_parsed"):
        t = entry.get(field)
        if t:
            try:
                dt = datetime(*t[:6], tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                continue
    return datetime.now(timezone.utc).isoformat()


def normalize_entry(entry, source_name, category="", max_summary_length=300):
    """Extract and normalize a single feed entry."""
    link = normalize_url(entry.get("link", ""))
    summary_raw = entry.get("summary", "") or entry.get("description", "")
    return {
        "title": entry.get("title", "Untitled"),
        "link": link,
        "summary": clean_html(summary_raw, max_summary_length),
        "published": parse_date(entry),
        "source": source_name,
        "type": "video" if category.lower() == "youtube" else "article",
    }


def deduplicate(entries):
    """Remove duplicate entries by normalized URL."""
    seen = {}
    for entry in entries:
        key = entry["link"]
        if key and key not in seen:
            seen[key] = entry
    return list(seen.values())


def prune_old(entries, max_age_days=7):
    """Remove items older than max_age_days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    result = []
    for entry in entries:
        try:
            pub = datetime.fromisoformat(entry["published"])
            if pub >= cutoff:
                result.append(entry)
        except (ValueError, KeyError):
            result.append(entry)  # keep entries with unparseable dates
    return result


def sort_entries(entries):
    """Sort entries by published date, newest first."""
    def sort_key(e):
        try:
            return datetime.fromisoformat(e["published"])
        except (ValueError, KeyError):
            return datetime.min.replace(tzinfo=timezone.utc)
    return sorted(entries, key=sort_key, reverse=True)


def write_output(entries, path=DEFAULT_OUTPUT):
    """Write JSON output with metadata envelope."""
    sources = sorted(set(e["source"] for e in entries))
    output = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_items": len(entries),
            "sources": sources,
        },
        "items": entries,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    log.info("Wrote %d items to %s", len(entries), path)


def main():
    feeds, settings = load_config()
    existing = load_existing()
    log.info("Loaded %d existing items", len(existing))

    new_items = []
    for feed_cfg in feeds:
        name = feed_cfg["name"]
        url = feed_cfg["url"]
        category = feed_cfg.get("category", "")
        log.info("Fetching %s ...", name)
        parsed = fetch_feed(url)
        if parsed is None:
            continue
        entries = parsed.entries[: settings["max_items_per_feed"]]
        for entry in entries:
            new_items.append(
                normalize_entry(entry, name, category, settings["max_summary_length"])
            )
        log.info("  Got %d items from %s", len(entries), name)

    # Merge existing + new, dedup, prune, sort, trim
    all_items = existing + new_items
    all_items = deduplicate(all_items)
    all_items = prune_old(all_items, settings["max_age_days"])
    all_items = sort_entries(all_items)
    all_items = all_items[: settings["max_total_items"]]

    write_output(all_items)
    log.info("Done. %d items total.", len(all_items))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log.error("Fatal: %s", e)
        sys.exit(1)
