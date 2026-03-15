(function () {
  "use strict";

  var allItems = [];
  var activeSources = new Set();
  var feedList = document.getElementById("feed-list");
  var emptyState = document.getElementById("empty-state");
  var errorState = document.getElementById("error-state");
  var searchInput = document.getElementById("search");
  var articleCount = document.getElementById("article-count");
  var lastUpdated = document.getElementById("last-updated");
  var sourcePills = document.getElementById("source-pills");
  var timeFilter = document.getElementById("time-filter");
  var sortFilter = document.getElementById("sort-filter");
  var themeToggle = document.getElementById("theme-toggle");

  // ---- Theme ----
  function getPreferredTheme() {
    var saved = localStorage.getItem("theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "dark" ? "\u2600" : "\u263D";
    localStorage.setItem("theme", theme);
  }

  applyTheme(getPreferredTheme());

  themeToggle.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // ---- Helpers ----
  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  function formatCardDate(isoString) {
    try {
      return new Intl.DateTimeFormat("en", {
        month: "short", day: "numeric", year: "numeric",
      }).format(new Date(isoString));
    } catch (e) { return ""; }
  }

  function formatFullDate(isoString) {
    try {
      return new Intl.DateTimeFormat("en", {
        weekday: "short", month: "short", day: "numeric",
        year: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(new Date(isoString));
    } catch (e) { return ""; }
  }

  // ---- Date grouping ----
  function getDateKey(isoString) {
    var d = new Date(isoString);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function getWeekStart(dateStr) {
    var d = new Date(dateStr);
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  function getGroupLabel(dateKey) {
    var now = new Date();
    var today = getDateKey(now.toISOString());
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayKey = getDateKey(yesterday.toISOString());

    if (dateKey === today) return "Today";
    if (dateKey === yesterdayKey) return "Yesterday";

    var target = new Date(dateKey + "T12:00:00");
    var thisWeekStart = getWeekStart(now.toISOString());
    var lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    if (target >= thisWeekStart) return "This Week";
    if (target >= lastWeekStart) return "Last Week";

    var ws = getWeekStart(dateKey);
    var we = new Date(ws);
    we.setDate(we.getDate() + 6);
    var fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
    return fmt.format(ws) + " \u2013 " + fmt.format(we);
  }

  function groupItems(items) {
    var now = new Date();
    var today = getDateKey(now.toISOString());
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayKey = getDateKey(yesterday.toISOString());

    var groups = {};
    var order = [];

    items.forEach(function (item) {
      var dk = getDateKey(item.published);
      var key;
      if (dk === today || dk === yesterdayKey) {
        key = dk;
      } else {
        var ws = getWeekStart(dk);
        key = getDateKey(ws.toISOString());
      }
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(item);
    });

    order.sort(function (a, b) { return b.localeCompare(a); });
    return order.map(function (key) {
      return { key: key, label: getGroupLabel(key), items: groups[key] };
    });
  }

  // ---- Time filter ----
  function filterByTime(items, value) {
    if (value === "all") return items;
    var now = new Date();
    var cutoff;
    if (value === "today") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (value === "week") {
      cutoff = getWeekStart(now.toISOString());
    } else if (value === "month") {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
    }
    return items.filter(function (item) {
      return new Date(item.published) >= cutoff;
    });
  }

  // ---- Badge colors ----
  var badgeColors = {};
  var colorPalette = [
    "#e74c3c", "#e67e22", "#27ae60", "#2980b9",
    "#8e44ad", "#16a085", "#d35400", "#c0392b",
    "#2c3e50", "#7f8c8d"
  ];
  var colorIndex = 0;

  function getBadgeColor(source) {
    if (!badgeColors[source]) {
      badgeColors[source] = colorPalette[colorIndex % colorPalette.length];
      colorIndex++;
    }
    return badgeColors[source];
  }

  // ---- Source pills ----
  function buildSourcePills(items) {
    var counts = {};
    items.forEach(function (item) {
      counts[item.source] = (counts[item.source] || 0) + 1;
    });

    var sources = Object.keys(counts).sort();
    sourcePills.innerHTML = "";

    var allPill = document.createElement("button");
    allPill.className = "pill" + (activeSources.size === 0 ? " active" : "");
    allPill.textContent = "All ";
    var allCount = document.createElement("span");
    allCount.className = "pill-count";
    allCount.textContent = items.length;
    allPill.appendChild(allCount);
    allPill.addEventListener("click", function () {
      activeSources.clear();
      applyFilters();
    });
    sourcePills.appendChild(allPill);

    sources.forEach(function (s) {
      var pill = document.createElement("button");
      pill.className = "pill" + (activeSources.has(s) ? " active" : "");
      pill.textContent = s + " ";
      var count = document.createElement("span");
      count.className = "pill-count";
      count.textContent = counts[s];
      pill.appendChild(count);
      pill.addEventListener("click", function () {
        if (activeSources.has(s)) {
          activeSources.delete(s);
        } else {
          activeSources.add(s);
        }
        applyFilters();
      });
      sourcePills.appendChild(pill);
    });
  }

  // ---- Card rendering ----
  function createCard(item) {
    var card = document.createElement("article");
    card.className = "card";

    var badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.source.toUpperCase();
    badge.style.backgroundColor = getBadgeColor(item.source);
    badgeRow.appendChild(badge);

    var typeTag = document.createElement("span");
    var isVideo = item.type === "video" || (item.link && item.link.includes("youtube.com"));
    typeTag.className = "type-tag type-tag--" + (isVideo ? "video" : "article");
    typeTag.textContent = isVideo ? "\u25B6 Video" : "\u{1F4C4} Article";
    badgeRow.appendChild(typeTag);

    card.appendChild(badgeRow);

    // Thumbnail for video cards
    if (item.thumbnail) {
      var thumbDiv = document.createElement("div");
      thumbDiv.className = "card-thumb";
      var img = document.createElement("img");
      img.src = item.thumbnail;
      img.alt = item.title;
      img.loading = "lazy";
      thumbDiv.appendChild(img);
      card.appendChild(thumbDiv);
    }

    var titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    var link = document.createElement("a");
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    titleEl.appendChild(link);
    card.appendChild(titleEl);

    var summary = document.createElement("p");
    summary.className = "card-summary";
    summary.textContent = item.summary;
    card.appendChild(summary);

    // Author + date meta line
    var meta = document.createElement("div");
    meta.className = "card-meta";
    if (item.author) {
      var authorSpan = document.createElement("span");
      authorSpan.textContent = "\uD83D\uDC64 " + item.author;
      meta.appendChild(authorSpan);
    }
    var dateSpan = document.createElement("span");
    dateSpan.textContent = "\uD83D\uDCC5 " + formatCardDate(item.published);
    meta.appendChild(dateSpan);
    card.appendChild(meta);

    // Category tags
    if (item.categories && item.categories.length > 0) {
      var tagRow = document.createElement("div");
      tagRow.className = "card-tags";
      item.categories.forEach(function (cat) {
        var tag = document.createElement("span");
        tag.className = "card-tag";
        tag.textContent = cat;
        tagRow.appendChild(tag);
      });
      card.appendChild(tagRow);
    }

    return card;
  }

  function renderCards(items) {
    feedList.innerHTML = "";
    articleCount.textContent = "Showing " + items.length + " of " + allItems.length + " articles";

    if (items.length === 0) {
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
      var groups = groupItems(items);
      var fragment = document.createDocumentFragment();

      groups.forEach(function (group) {
        var section = document.createElement("section");
        section.className = "week-section";

        var heading = document.createElement("h2");
        heading.className = "section-heading";
        heading.textContent = group.label;
        section.appendChild(heading);

        var grid = document.createElement("div");
        grid.className = "feed-grid";
        group.items.forEach(function (item) {
          grid.appendChild(createCard(item));
        });
        section.appendChild(grid);
        fragment.appendChild(section);
      });

      feedList.appendChild(fragment);
    }
  }

  // ---- Filtering ----
  function applyFilters() {
    var query = searchInput.value.toLowerCase().trim();
    var timeValue = timeFilter.value;
    var sortValue = sortFilter.value;

    var filtered = allItems.filter(function (item) {
      if (activeSources.size > 0 && !activeSources.has(item.source)) return false;
      if (query) {
        var text = (item.title + " " + item.summary + " " + (item.author || "") + " " + (item.categories || []).join(" ")).toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    filtered = filterByTime(filtered, timeValue);

    filtered.sort(function (a, b) {
      var da = new Date(a.published);
      var db = new Date(b.published);
      return sortValue === "oldest" ? da - db : db - da;
    });

    buildSourcePills(allItems);
    renderCards(filtered);
  }

  // ---- Init ----
  async function init() {
    try {
      var resp = await fetch("data/feeds.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var data = await resp.json();

      allItems = data.items || [];
      if (data.metadata && data.metadata.generated_at) {
        lastUpdated.textContent = "Last updated: " + formatFullDate(data.metadata.generated_at) +
          "  \u00B7  " + allItems.length + " articles";
      }

      applyFilters();
    } catch (err) {
      console.error("Failed to load feeds:", err);
      errorState.hidden = false;
    }
  }

  searchInput.addEventListener("input", debounce(applyFilters, 300));
  timeFilter.addEventListener("change", applyFilters);
  sortFilter.addEventListener("change", applyFilters);

  init();
})();
