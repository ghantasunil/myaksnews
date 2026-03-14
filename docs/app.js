(function () {
  "use strict";

  var allItems = [];
  var feedList = document.getElementById("feed-list");
  var emptyState = document.getElementById("empty-state");
  var errorState = document.getElementById("error-state");
  var searchInput = document.getElementById("search");
  var sourceFilter = document.getElementById("source-filter");
  var lastUpdated = document.getElementById("last-updated");
  var articleCount = document.getElementById("article-count");

  function debounce(fn, ms) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  // Format date for card meta line: "Mar 13, 2026"
  function formatCardDate(isoString) {
    try {
      return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(isoString));
    } catch (e) {
      return "";
    }
  }

  // Format date for the "last updated" line
  function formatRelative(isoString) {
    try {
      var date = new Date(isoString);
      var now = new Date();
      var diffMs = now - date;
      var diffMin = Math.floor(diffMs / 60000);
      var diffHr = Math.floor(diffMin / 60);
      var diffDay = Math.floor(diffHr / 24);

      if (diffDay < 1 && typeof Intl.RelativeTimeFormat !== "undefined") {
        var rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
        if (diffHr >= 1) return rtf.format(-diffHr, "hour");
        if (diffMin >= 1) return rtf.format(-diffMin, "minute");
        return "just now";
      }
      return formatCardDate(isoString);
    } catch (e) {
      return "";
    }
  }

  // Get a date-only key (YYYY-MM-DD) in local time
  function getDateKey(isoString) {
    var d = new Date(isoString);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  // Get the Monday of the week for a given date
  function getWeekStart(dateStr) {
    var d = new Date(dateStr);
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
  }

  // Build a friendly label for a group
  function getGroupLabel(dateKey) {
    var now = new Date();
    var today = getDateKey(now.toISOString());

    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayKey = getDateKey(yesterday.toISOString());

    if (dateKey === today) return "Today";
    if (dateKey === yesterdayKey) return "Yesterday";

    // For dates within this week, show the day name
    var target = new Date(dateKey + "T12:00:00");
    var thisWeekStart = getWeekStart(now.toISOString());
    var lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    if (target >= thisWeekStart) {
      return "This Week";
    }
    if (target >= lastWeekStart) {
      return "Last Week";
    }

    // Older: show week range
    var ws = getWeekStart(dateKey);
    var we = new Date(ws);
    we.setDate(we.getDate() + 6);
    var fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
    return fmt.format(ws) + " \u2013 " + fmt.format(we);
  }

  // Group items: today/yesterday by day, then by week
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
        key = dk; // group by day
      } else {
        var ws = getWeekStart(dk);
        key = getDateKey(ws.toISOString()); // group by week
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

  // Assign a consistent color to each source
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

  function createCard(item) {
    var card = document.createElement("article");
    card.className = "card";

    var badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = item.source.toUpperCase();
    badge.style.backgroundColor = getBadgeColor(item.source);
    card.appendChild(badge);

    var titleEl = document.createElement("h3");
    titleEl.className = "card-title";
    var link = document.createElement("a");
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    titleEl.appendChild(link);
    card.appendChild(titleEl);

    var meta = document.createElement("div");
    meta.className = "card-meta";
    var dateSpan = document.createElement("span");
    dateSpan.textContent = formatCardDate(item.published);
    meta.appendChild(dateSpan);
    card.appendChild(meta);

    var summary = document.createElement("p");
    summary.className = "card-summary";
    summary.textContent = item.summary;
    card.appendChild(summary);

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

  function applyFilters() {
    var query = searchInput.value.toLowerCase().trim();
    var source = sourceFilter.value;

    var filtered = allItems.filter(function (item) {
      if (source && item.source !== source) return false;
      if (query) {
        var text = (item.title + " " + item.summary).toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    renderCards(filtered);
  }

  function populateSourceDropdown(items) {
    var sources = Array.from(new Set(items.map(function (i) { return i.source; }))).sort();
    sources.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sourceFilter.appendChild(opt);
    });
  }

  async function init() {
    try {
      var resp = await fetch("data/feeds.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      var data = await resp.json();

      allItems = data.items || [];
      if (data.metadata && data.metadata.generated_at) {
        lastUpdated.textContent = "Last updated: " + formatRelative(data.metadata.generated_at);
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
