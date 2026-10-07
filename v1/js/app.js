import {
  EMPTY_FILTERS, STATUS_CLASS, STATUS_ICON, VER_SHORT,
  actionFor, compareItems, countBy, filterItems, formatDate, hasActiveFilters, searchText, verifiedText,
} from "./logic.js";

const STATUS_HELP = {
  GA: "Generally available, as stated by the source.",
  "Public preview": "Available as a preview; subject to preview terms and not a production commitment.",
  "Private preview": "Limited or invitation-only access.",
  "Preview coming soon": "A preview is announced but is not yet available.",
  "Coming soon": "Announced for a later date; no availability confirmed.",
  "Not specified": "The retrieved public source gives no availability label.",
};

const state = {
  meta: null,
  items: [],
  sources: new Map(),
  filters: { ...EMPTY_FILTERS },
  view: "cards",
  sort: { key: "category", dir: "asc" },
  expanded: new Set(),
};

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

function extLink(href, text, attrs = {}) {
  return el("a", { href, target: "_blank", rel: "noopener noreferrer", ...attrs },
    text, el("span", { class: "sr-only", text: " (opens in a new tab)" }));
}

function statusBadge(status) {
  return el("span", { class: `badge status-${STATUS_CLASS[status] ?? "unspecified"}` },
    el("span", { "aria-hidden": "true", text: STATUS_ICON[status] ?? "○" }), " ", status);
}

function actionBadge(action) {
  return el("span", { class: `badge action-${action.toLowerCase().replace(/\s+/g, "-")}`, text: action });
}

function sourceLinks(item) {
  const wrap = el("span", { class: "src-links" });
  item.src.forEach((id, i) => {
    const s = state.sources.get(id);
    if (!s) return;
    if (i) wrap.append(" · ");
    wrap.append(extLink(s.url, s.short ?? s.title));
  });
  return wrap;
}

async function init() {
  const res = await fetch("data/announcements.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load data/announcements.json (${res.status})`);
  const data = await res.json();
  state.meta = data.meta;
  state.sources = new Map(data.sources.map((s) => [s.id, s]));
  state.items = data.announcements.map((a) => ({ ...a, _search: searchText(a) }));

  renderStatic();
  buildFilterControls();
  bindEvents();
  renderAll();
  applyHash();
}

function renderStatic() {
  const { meta } = state;
  document.title = meta.title;
  $("#page-title").textContent = meta.title;
  $("#page-subtitle").textContent = meta.subtitle;
  $("#presenter").textContent = meta.presenter;
  $("#event-line").textContent = meta.event;
  $("#date-presentation").textContent = formatDate(meta.presentationDate);
  $("#date-cutoff").textContent = formatDate(meta.researchCutoff);
  $("#date-verified").textContent = formatDate(meta.lastVerified);
  $("#src-cutoff").textContent = formatDate(meta.researchCutoff);
  $("#src-verified").textContent = formatDate(meta.lastVerified);
  $("#disclaimer-top").textContent = meta.disclaimer;
  $("#disclaimer-bottom").textContent = meta.disclaimer;

  const counts = countBy(state.items, (i) => i.status);
  const legend = $("#legend");
  legend.replaceChildren(...meta.statuses.map((s) =>
    el("li", {}, statusBadge(s), el("span", { class: "legend-text", text: ` ${STATUS_HELP[s] ?? ""} (${counts.get(s) ?? 0} cataloged)` }))));

  const methodList = $("#method-list");
  methodList.replaceChildren(...meta.methodology.map((m) => el("li", { text: m })));
  $("#gaps-list").replaceChildren(...meta.gaps.map((m) => el("li", { text: m })));

  renderStatTiles();
  renderSourcesTable();
  renderCoverageTable();
  renderConflicts();
  renderPriorities();
  renderActionColumns();
  renderAreas();
}

function renderStatTiles() {
  const { items, meta } = state;
  const byAction = countBy(items, (i) => actionFor(i, meta));
  const tiles = [
    { label: "Announcements cataloged", value: items.length, filter: null },
    { label: "Evaluate now (GA)", value: byAction.get("Evaluate now") ?? 0, filter: { action: "Evaluate now" } },
    { label: "Pilot (public preview)", value: byAction.get("Pilot") ?? 0, filter: { action: "Pilot" } },
    { label: "Watch (not yet available or not specified)", value: byAction.get("Watch") ?? 0, filter: { action: "Watch" } },
  ];
  $("#stat-tiles").replaceChildren(...tiles.map((t) =>
    el("li", {},
      el("button", {
        type: "button", class: "tile",
        "aria-label": `${t.value} ${t.label}. ${t.filter ? "Show in catalog." : "Show full catalog."}`,
        onclick: () => { resetFilters(false); if (t.filter) setFilters(t.filter); location.hash = "#catalog"; $("#catalog-title").scrollIntoView(); },
      }, el("span", { class: "tile-value", text: String(t.value) }), el("span", { class: "tile-label", text: t.label })))));
}

function renderPriorities() {
  const ranked = state.items.filter((i) => i.priority).sort((a, b) => a.priority - b.priority);
  $("#priority-grid").replaceChildren(...ranked.map((i) => {
    const action = actionFor(i, state.meta);
    return el("article", { class: "priority-card", "aria-labelledby": `p-${i.id}` },
      el("div", { class: "priority-head" },
        el("span", { class: "rank", "aria-hidden": "true", text: String(i.priority) }),
        el("div", {},
          el("h3", { id: `p-${i.id}`, text: i.title }),
          el("p", { class: "theme", text: i.theme }))),
      el("div", { class: "badges" }, statusBadge(i.status), actionBadge(action)),
      el("p", { class: "relevance" }, el("strong", { text: "Potential relevance for Farmers Insurance: " }), i.relevance),
      el("p", {}, el("strong", { text: "Suggested next step: " }), i.next),
      i.conflict ? el("p", { class: "conflict-note" }, el("strong", { text: "Source discrepancy: " }), i.conflict) : null,
      el("p", { class: "card-links" }, el("span", { class: "label", text: "Sources: " }), sourceLinks(i),
        " · ", el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, "View details in catalog")));
  }));
}

function renderActionColumns() {
  const { items, meta } = state;
  const defs = [
    { action: "Evaluate now", blurb: "Verified GA capabilities to evaluate against real scenarios." },
    { action: "Pilot", blurb: "Available previews suited to a time-boxed, non-production pilot." },
    { action: "Watch", blurb: "Announced but not yet available, or without a stated status. Track, do not plan on it." },
  ];
  const byAction = countBy(items, (i) => actionFor(i, meta));
  $("#action-columns").replaceChildren(...defs.map((d) => {
    const picks = items.filter((i) => i.priority && actionFor(i, meta) === d.action).sort((a, b) => a.priority - b.priority);
    return el("section", { class: `action-col col-${d.action.toLowerCase().replace(/\s+/g, "-")}`, "aria-labelledby": `ac-${d.action.replace(/\s+/g, "")}` },
      el("h4", { id: `ac-${d.action.replace(/\s+/g, "")}`, text: d.action }),
      el("p", { class: "blurb", text: d.blurb }),
      picks.length
        ? el("ul", {}, picks.map((p) => el("li", {}, el("button", { type: "button", class: "link-btn", onclick: () => goToItem(p.id) }, p.title))))
        : el("p", { class: "muted", text: "No priority items in this group." }),
      el("button", {
        type: "button", class: "btn btn-small",
        onclick: () => { resetFilters(false); setFilters({ action: d.action }); $("#catalog-title").scrollIntoView(); location.hash = "#catalog"; },
      }, `Show all ${byAction.get(d.action) ?? 0} in catalog`));
  }));
}

function renderAreas() {
  const byId = new Map(state.items.map((i) => [i.id, i]));
  $("#area-grid").replaceChildren(...state.meta.relevanceAreas.map((area) =>
    el("section", { class: "area" },
      el("h4", { text: area.name }),
      el("ul", {}, area.ids.map((id) => byId.get(id)).filter(Boolean).map((i) =>
        el("li", {},
          el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, i.title),
          " ", el("span", { class: `mini status-${STATUS_CLASS[i.status]}`, text: i.status }))))))); 
}

function renderSourcesTable() {
  const cited = countBy(state.items.flatMap((i) => i.src.map((id) => ({ id }))), (x) => x.id);
  const head = el("thead", {}, el("tr", {}, ["ID", "Source", "Publisher", "Author", "Published", "Type", "Items citing"].map((h) => el("th", { scope: "col", text: h }))));
  const rows = [...state.sources.values()].map((s) => el("tr", {},
    el("td", { text: s.id }),
    el("td", {}, extLink(s.url, s.title)),
    el("td", { text: s.publisher }),
    el("td", { text: s.author }),
    el("td", { text: s.date ? formatDate(s.date) : "Not shown in retrieved text" }),
    el("td", { text: s.type }),
    el("td", { text: String(cited.get(s.id) ?? 0) })));
  $("#sources-table").replaceChildren(head, el("tbody", {}, rows));
}

function renderCoverageTable() {
  const { items, meta } = state;
  const head = el("thead", {}, el("tr", {}, ["Workload", "Cataloged", "GA", "Public preview", "Watch"].map((h) => el("th", { scope: "col", text: h }))));
  const rows = meta.categories.map((c) => {
    const subset = items.filter((i) => i.category === c);
    const a = countBy(subset, (i) => actionFor(i, meta));
    return el("tr", {}, el("th", { scope: "row", text: c }), el("td", { text: String(subset.length) }),
      el("td", { text: String(a.get("Evaluate now") ?? 0) }), el("td", { text: String(a.get("Pilot") ?? 0) }), el("td", { text: String(a.get("Watch") ?? 0) }));
  });
  rows.push(el("tr", { class: "total" }, el("th", { scope: "row", text: "Total" }), el("td", { text: String(items.length) }),
    ...["Evaluate now", "Pilot", "Watch"].map((k) => el("td", { text: String(items.filter((i) => actionFor(i, meta) === k).length) }))));
  $("#coverage-table").replaceChildren(head, el("tbody", {}, rows));
}

function renderConflicts() {
  const withConflict = state.items.filter((i) => i.conflict);
  $("#conflicts-list").replaceChildren(...withConflict.map((i) =>
    el("li", {}, el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, i.title), ": ", i.conflict)));
}

function buildFilterControls() {
  const { meta } = state;
  const fill = (id, values) => $(id).append(...values.map((v) => el("option", { value: v, text: v })));
  fill("#f-category", meta.categories);
  fill("#f-status", meta.statuses);
  fill("#f-action", [...new Set(Object.values(meta.statusToAction))]);
}

function setFilters(partial) {
  Object.assign(state.filters, partial);
  syncControls();
  renderCatalog();
}

function syncControls() {
  const f = state.filters;
  $("#f-query").value = f.query;
  $("#f-category").value = f.category;
  $("#f-status").value = f.status;
  $("#f-action").value = f.action;
  $("#f-assoc").value = f.assoc;
  $("#f-conflict").checked = f.conflictOnly;
}

function resetFilters(render = true) {
  state.filters = { ...EMPTY_FILTERS };
  syncControls();
  if (render) renderCatalog();
}

function bindEvents() {
  const read = () => {
    state.filters = {
      query: $("#f-query").value,
      category: $("#f-category").value,
      status: $("#f-status").value,
      action: $("#f-action").value,
      assoc: $("#f-assoc").value,
      conflictOnly: $("#f-conflict").checked,
    };
    renderCatalog();
  };
  ["#f-query", "#f-category", "#f-status", "#f-action", "#f-assoc", "#f-conflict"].forEach((s) => {
    $(s).addEventListener(s === "#f-query" ? "input" : "change", read);
  });
  $("#toolbar").addEventListener("submit", (e) => e.preventDefault());
  $("#toolbar").addEventListener("reset", (e) => { e.preventDefault(); resetFilters(); $("#f-query").focus(); });
  $("#empty-reset").addEventListener("click", () => { resetFilters(); $("#f-query").focus(); });

  $("#view-cards").addEventListener("click", () => setView("cards"));
  $("#view-table").addEventListener("click", () => setView("table"));
  $("#expand-all").addEventListener("click", () => setAllExpanded(true));
  $("#collapse-all").addEventListener("click", () => setAllExpanded(false));
  $("#print-btn").addEventListener("click", () => window.print());

  const toggle = $(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    $("#site-nav").classList.toggle("open", !open);
  });
  $("#site-nav").addEventListener("click", (e) => {
    if (e.target.closest("a")) { toggle.setAttribute("aria-expanded", "false"); $("#site-nav").classList.remove("open"); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      toggle.setAttribute("aria-expanded", "false"); $("#site-nav").classList.remove("open"); toggle.focus();
    }
  });

  const themeBtn = $("#theme-toggle");
  const effective = () => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const paint = () => { const dark = effective() === "dark"; themeBtn.textContent = dark ? "Light theme" : "Dark theme"; themeBtn.setAttribute("aria-pressed", String(dark)); };
  themeBtn.addEventListener("click", () => {
    const next = effective() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
    paint();
  });
  paint();

  window.addEventListener("hashchange", applyHash);
}

function setView(view) {
  state.view = view;
  $("#view-cards").setAttribute("aria-pressed", String(view === "cards"));
  $("#view-table").setAttribute("aria-pressed", String(view === "table"));
  $("#catalog").dataset.view = view;
  const cardsOnly = view === "cards";
  $("#expand-all").hidden = !cardsOnly;
  $("#collapse-all").hidden = !cardsOnly;
}

function setAllExpanded(open) {
  const visible = currentItems();
  state.expanded = open ? new Set(visible.map((i) => i.id)) : new Set();
  renderCards(visible);
}

function currentItems() {
  const { meta } = state;
  const list = filterItems(state.items, state.filters, meta);
  const { key, dir } = state.sort;
  return list.sort((a, b) => compareItems(a, b, key, dir, meta));
}

function renderAll() {
  setView(state.view);
  renderCatalog();
}

function renderCatalog() {
  const list = currentItems();
  const total = state.items.length;
  const active = hasActiveFilters(state.filters);
  $("#result-count").textContent = `Showing ${list.length} of ${total} announcements${active ? " (filters applied)" : ""}.`;
  $("#empty-state").hidden = list.length > 0;
  renderCards(list);
  renderTable(list);
}

function detailRow(label, content) {
  return el("div", { class: "detail-row" }, el("dt", { text: label }), el("dd", {}, content));
}

function renderCards(list) {
  const { meta } = state;
  const container = $("#cards");
  const frag = document.createDocumentFragment();
  let currentCat = null;
  let grid = null;
  const groupByCategory = state.sort.key === "category";
  for (const item of list) {
    if (groupByCategory && item.category !== currentCat) {
      currentCat = item.category;
      const count = list.filter((i) => i.category === currentCat).length;
      frag.append(el("h3", { class: "cat-heading", text: `${currentCat} (${count})` }));
      grid = el("div", { class: "card-grid" });
      frag.append(grid);
    } else if (!groupByCategory && !grid) {
      grid = el("div", { class: "card-grid" });
      frag.append(grid);
    }
    grid.append(buildCard(item, meta));
  }
  container.replaceChildren(frag);
}

function buildCard(item, meta) {
  const action = actionFor(item, meta);
  const open = state.expanded.has(item.id);
  const panelId = `panel-${item.id}`;
  const card = el("article", { class: "card", id: `card-${item.id}`, "aria-labelledby": `t-${item.id}` });

  const btn = el("button", {
    type: "button", class: "expand-btn", "aria-expanded": String(open), "aria-controls": panelId,
    onclick: () => {
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
      btn.querySelector(".expand-label").textContent = isOpen ? "Show technical details" : "Hide technical details";
      if (isOpen) state.expanded.delete(item.id); else state.expanded.add(item.id);
    },
  }, el("span", { class: "expand-label", text: open ? "Hide technical details" : "Show technical details" }), el("span", { class: "chev", "aria-hidden": "true" }));

  const dl = el("dl", { class: "detail-list" });
  if (item.details?.length) dl.append(detailRow("Details", el("ul", {}, item.details.map((d) => el("li", { text: d })))));
  dl.append(detailRow("Prerequisites and limits", item.prereq));
  if (item.conflict) dl.append(detailRow("Source discrepancy", item.conflict));
  dl.append(detailRow("Verification", verifiedText(item, meta)));
  if (item.docs?.length) dl.append(detailRow("Supporting documentation", el("ul", {}, item.docs.map(([label, url]) => el("li", {}, extLink(url, label))))));
  dl.append(detailRow("Evidence tier", item.assoc === "event" ? "Event blog: named in the hero post or a workload blog for the event." : "Monthly summary: listed in the September 2026 feature summary linked from the hero post."));
  dl.append(detailRow("Announcement date", item.date ? formatDate(item.date) : "Not specified in the public source."));
  dl.append(detailRow("Item ID", el("code", { text: item.id })));

  const panel = el("div", { class: "panel", id: panelId, hidden: !open }, dl);

  card.append(
    el("div", { class: "card-top" },
      el("span", { class: "chip", text: item.category }),
      item.assoc === "monthly" ? el("span", { class: "chip chip-tier", text: "Monthly summary" }) : null),
    el("h4", { id: `t-${item.id}`, text: item.title }),
    el("p", { class: "product", text: item.product }),
    el("div", { class: "badges" }, statusBadge(item.status), actionBadge(action),
      item.conflict ? el("span", { class: "badge badge-flag", title: "Sources disagree; see technical details" }, el("span", { "aria-hidden": "true", text: "⚑ " }), "Source discrepancy") : null),
    el("p", { class: "summary", text: item.summary }),
    el("p", { class: "meta-line" }, el("strong", { text: "As announced: " }), item.announced),
    el("p", { class: "meta-line" }, el("strong", { text: `Verified as of ${formatDate(meta.lastVerified)}: ` }), VER_SHORT[item.ver] ?? ""),
    el("p", { class: "relevance" }, el("strong", { text: "Potential relevance for Farmers Insurance: " }), item.relevance),
    el("p", { class: "meta-line" }, el("strong", { text: "Suggested next step: " }), item.next),
    el("p", { class: "card-links" }, el("span", { class: "label", text: "Sources: " }), sourceLinks(item)),
    btn, panel);
  return card;
}

function sortButton(key, label) {
  const active = state.sort.key === key;
  const dir = active ? state.sort.dir : "none";
  const th = el("th", { scope: "col", "aria-sort": active ? (dir === "asc" ? "ascending" : "descending") : "none" },
    el("button", {
      type: "button", class: "sort-btn",
      onclick: () => {
        state.sort = { key, dir: active && dir === "asc" ? "desc" : "asc" };
        renderCatalog();
        const again = $(`#table-wrap [data-sort="${key}"]`);
        if (again) again.focus();
      },
      "data-sort": key,
    }, label, el("span", { "aria-hidden": "true", class: "sort-ind", text: active ? (dir === "asc" ? " ▲" : " ▼") : "" })));
  return th;
}

function renderTable(list) {
  const { meta } = state;
  const head = el("thead", {}, el("tr", {},
    sortButton("title", "Announcement"), sortButton("category", "Workload"), sortButton("status", "Status"), sortButton("action", "Action"),
    el("th", { scope: "col", text: "As announced" }), el("th", { scope: "col", text: "Verified" }), el("th", { scope: "col", text: "Sources" })));
  const body = el("tbody", {}, list.map((i) => el("tr", { id: `row-${i.id}` },
    el("th", { scope: "row" }, el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, i.title), el("div", { class: "product", text: i.product })),
    el("td", { text: i.category }),
    el("td", {}, statusBadge(i.status)),
    el("td", {}, actionBadge(actionFor(i, meta))),
    el("td", { text: i.announced }),
    el("td", { text: VER_SHORT[i.ver] ?? "" }),
    el("td", {}, sourceLinks(i)))));
  $("#table-wrap").replaceChildren(el("table", { class: "data-table compare-table" },
    el("caption", { class: "sr-only", text: "Announcement comparison. Column headers with buttons can be sorted." }), head, body));
}

function goToItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const visible = currentItems().some((i) => i.id === id);
  if (!visible) resetFilters(false);
  setView("cards");
  state.expanded.add(id);
  if (state.sort.key !== "category") state.sort = { key: "category", dir: "asc" };
  renderCatalog();
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.scrollIntoView({ block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1800);
    const btn = card.querySelector(".expand-btn");
    if (btn) btn.focus({ preventScroll: true });
  }
}

function applyHash() {
  const m = /^#card-(.+)$/.exec(location.hash);
  if (m) goToItem(decodeURIComponent(m[1]));
}

init().catch((err) => {
  const msg = el("p", { class: "notice", role: "alert" }, `The announcement data could not be loaded: ${err.message}. If you opened this file directly, serve the folder over HTTP (see README).`);
  $("#catalog .wrap").prepend(msg);
  console.error(err);
});
