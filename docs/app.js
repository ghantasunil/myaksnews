(function () {
  "use strict";

  let allItems = [];
  const feedList = document.getElementById("feed-list");
  const emptyState = document.getElementById("empty-state");
  const errorState = document.getElementById("error-state");
  const searchInput = document.getElementById("search");
  const sourceFilter = document.getElementById("source-filter");
  const lastUpdated = document.getElementById("last-updated");

  // Debounce helper
  function debounce(fn, ms) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  // Format date as relative or absolute
  function formatDate(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);

      if (diffDay < 1 && typeof Intl.RelativeTimeFormat !== "undefined") {
        const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
        if (diffHr >= 1) return rtf.format(-diffHr, "hour");
        if (diffMin >= 1) return rtf.format(-diffMin, "minute");
        return "just now";
      }

      return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: diffDay > 365 ? "numeric" : undefined,
      }).format(date);
    } catch {
      return "";
    }
  }

  // Create a card DOM element (no innerHTML for XSS safety)
  function createCard(item) {
    const card = document.createElement("article");
    card.className = "card";

    const titleEl = document.createElement("h2");
    titleEl.className = "card-title";
    const link = document.createElement("a");
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    titleEl.appendChild(link);

    const summary = document.createElement("p");
    summary.className = "card-summary";
    summary.textContent = item.summary;

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.source;

    const date = document.createElement("time");
    date.dateTime = item.published;
    date.textContent = formatDate(item.published);

    meta.appendChild(badge);
    meta.appendChild(date);

    card.appendChild(titleEl);
    card.appendChild(summary);
    card.appendChild(meta);

    return card;
  }

  function renderCards(items) {
    feedList.innerHTML = "";
    if (items.length === 0) {
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
      const fragment = document.createDocumentFragment();
      items.forEach(function (item) {
        fragment.appendChild(createCard(item));
      });
      feedList.appendChild(fragment);
    }
  }

  function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    const source = sourceFilter.value;

    const filtered = allItems.filter(function (item) {
      if (source && item.source !== source) return false;
      if (query) {
        const text = (item.title + " " + item.summary).toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    renderCards(filtered);
  }

  function populateSourceDropdown(items) {
    const sources = Array.from(new Set(items.map(function (i) { return i.source; }))).sort();
    sources.forEach(function (s) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sourceFilter.appendChild(opt);
    });
  }

  async function init() {
    try {
      const resp = await fetch("data/feeds.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();

      allItems = data.items || [];
      if (data.metadata && data.metadata.generated_at) {
        lastUpdated.textContent = "Last updated: " + formatDate(data.metadata.generated_at);
      }

      populateSourceDropdown(allItems);
      renderCards(allItems);
    } catch (err) {
      console.error("Failed to load feeds:", err);
      errorState.hidden = false;
    }
  }

  searchInput.addEventListener("input", debounce(applyFilters, 300));
  sourceFilter.addEventListener("change", applyFilters);

  init();
})();
