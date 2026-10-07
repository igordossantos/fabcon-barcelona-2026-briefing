import {
  EMPTY_FILTERS, SORT_OPTIONS, STATUS_CLASS, STATUS_ICON, TIER_LABEL, VER_SHORT,
  actionFor, buildShareQuery, compareItems, countBy, facetCounts, filterItems, formatDate, hasActiveFilters,
  parseShare, searchText, toCsv, toMarkdown, verifiedText,
} from "./logic.js";

const STATUS_HELP = {
  GA: "Generally available, as stated by the source.",
  "Public preview": "Available as a preview; subject to preview terms and not a production commitment.",
  "Private preview": "Limited or invitation-only access.",
  "Preview coming soon": "A preview is announced but is not yet available.",
  "Coming soon": "Announced for a later date; no availability confirmed.",
  "Not specified": "The retrieved public source gives no availability label.",
};
const ACTION_HELP = {
  "Evaluate now": "Verified GA capabilities to evaluate against real scenarios.",
  Pilot: "Available previews suited to a time-boxed, non-production pilot.",
  Watch: "Announced but not yet available, or without a stated status.",
};
const KEYS = { sel: "fabcon-v2-sel", notes: "fabcon-v2-notes", present: "fabcon-v2-present" };

const state = {
  meta: null,
  items: [],
  byId: new Map(),
  sources: new Map(),
  filters: { ...EMPTY_FILTERS },
  sort: "recommended",
  view: "cards",
  selected: new Set(),
  notes: {},
  focus: false,
  lastRemoved: null,
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

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

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
function announce(message) {
  const live = $("#live-extra");
  if (live) live.textContent = message;
}

async function init() {
  const res = await fetch("data/announcements.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load data/announcements.json (${res.status})`);
  const data = await res.json();
  state.meta = data.meta;
  state.sources = new Map(data.sources.map((s) => [s.id, s]));
  state.items = data.announcements.map((a) => ({ ...a, _search: searchText(a) }));
  state.byId = new Map(state.items.map((i) => [i.id, i]));

  const shared = parseShare(location.search);
  const saved = store.get(KEYS.sel, []);
  const start = shared.ids.length ? shared.ids : saved;
  state.selected = new Set(start.filter((id) => state.byId.has(id)));
  state.notes = store.get(KEYS.notes, {});
  state.focus = shared.ids.length ? shared.focus && state.selected.size > 0 : false;

  renderStatic();
  buildControls();
  bindEvents();
  setView("cards");
  renderCatalog();
  applyHash();
}

/* ---------- static sections ---------- */
function renderStatic() {
  const { meta } = state;
  document.title = meta.title;
  $("#page-title").textContent = meta.title;
  $("#page-subtitle").textContent = meta.subtitle;
  $("#presenter").textContent = meta.presenter;
  $("#event-line").textContent = meta.event;
  $("#src-cutoff").textContent = formatDate(meta.researchCutoff);
  $("#src-verified").textContent = formatDate(meta.lastVerified);
  $("#src-presentation").textContent = formatDate(meta.presentationDate);
  $("#disclaimer-top").textContent = meta.disclaimer;
  $("#disclaimer-bottom").textContent = meta.disclaimer;
  $("#relevance-label-inline").textContent = meta.relevanceLabel;

  const counts = countBy(state.items, (i) => i.status);
  $("#legend").replaceChildren(...meta.statuses.map((s) =>
    el("li", {}, statusBadge(s), el("span", { class: "legend-text", text: ` ${STATUS_HELP[s] ?? ""} (${counts.get(s) ?? 0} cataloged)` }))));
  $("#method-list").replaceChildren(...meta.methodology.map((m) => el("li", { text: m })));
  $("#gaps-list").replaceChildren(...meta.gaps.map((m) => el("li", { text: m })));

  renderStatTiles();
  renderSourcesTable();
  renderCoverageTable();
  renderTocTable();
  renderConflicts();
  renderAreas();
  $("#live-region")?.remove();
  document.body.append(el("div", { id: "live-extra", class: "sr-only", role: "status", "aria-live": "polite" }));
}

function renderStatTiles() {
  const { items, meta } = state;
  const by = countBy(items, (i) => actionFor(i, meta));
  const tiles = [
    { label: "Announcements cataloged", value: items.length, apply: () => {} },
    { label: "Evaluate now (GA)", value: by.get("Evaluate now") ?? 0, apply: () => setFilters({ action: "Evaluate now" }) },
    { label: "Pilot (public preview)", value: by.get("Pilot") ?? 0, apply: () => setFilters({ action: "Pilot" }) },
    { label: "Watch (not yet available or not specified)", value: by.get("Watch") ?? 0, apply: () => setFilters({ action: "Watch" }) },
    { label: "September 2026 Fabric summary sections covered", value: meta.septemberToc.length, apply: () => setFilters({ assoc: "monthly" }) },
  ];
  $("#stat-tiles").replaceChildren(...tiles.map((t) =>
    el("li", {}, el("button", {
      type: "button", class: "tile", "aria-label": `${t.value} ${t.label}. Show in catalog.`,
      onclick: () => { resetFilters(false); t.apply(); renderCatalog(); location.hash = "#catalog"; $("#catalog-title").scrollIntoView(); },
    }, el("span", { class: "tile-value", text: String(t.value) }), el("span", { class: "tile-label", text: t.label })))));
}

function renderAreas() {
  $("#area-grid").replaceChildren(...state.meta.relevanceAreas.map((area) =>
    el("section", { class: "area" },
      el("h3", { text: area.name }),
      el("ul", {}, area.ids.map((id) => state.byId.get(id)).filter(Boolean).map((i) =>
        el("li", {},
          el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, i.title),
          " ", el("span", { class: `mini status-${STATUS_CLASS[i.status]}`, text: i.status }))))))); 
}

function renderSourcesTable() {
  const cited = countBy(state.items.flatMap((i) => i.src.map((id) => ({ id }))), (x) => x.id);
  const head = el("thead", {}, el("tr", {}, ["ID", "Source", "Publisher", "Author", "Published", "Type", "Items citing"].map((h) => el("th", { scope: "col", text: h }))));
  const rows = [...state.sources.values()].map((s) => el("tr", {},
    el("td", { text: s.id }), el("td", {}, extLink(s.url, s.title)), el("td", { text: s.publisher }), el("td", { text: s.author }),
    el("td", { text: s.date ? formatDate(s.date) : "Not shown in retrieved text" }), el("td", { text: s.type }), el("td", { text: String(cited.get(s.id) ?? 0) })));
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

function renderTocTable() {
  const { meta } = state;
  $("#toc-intro").textContent = `The September 2026 Fabric feature summary has ${meta.septemberToc.length} sections. Each one is mapped to a catalog entry below; several sections share one entry when the sources describe them together.`;
  const head = el("thead", {}, el("tr", {}, ["Summary section", "Label in summary", "Catalog entry"].map((h) => el("th", { scope: "col", text: h }))));
  const rows = meta.septemberToc.map((t) => {
    const item = state.byId.get(t.entry);
    return el("tr", {}, el("td", { text: t.title }), el("td", { text: t.status }),
      el("td", {}, item ? el("button", { type: "button", class: "link-btn", onclick: () => goToItem(item.id) }, item.title) : t.entry));
  });
  $("#toc-table").replaceChildren(head, el("tbody", {}, rows));
}

function renderConflicts() {
  $("#conflicts-list").replaceChildren(...state.items.filter((i) => i.conflict).map((i) =>
    el("li", {}, el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, i.title), ": ", i.conflict)));
}

/* ---------- controls ---------- */
function buildControls() {
  const { meta } = state;
  const fill = (id, values) => $(id).append(...values.map((v) => el("option", { value: v, text: v })));
  fill("#f-category", meta.categories);
  fill("#f-status", meta.statuses);
  $("#f-sort").append(...SORT_OPTIONS.map(([v, l]) => el("option", { value: v, text: l })));
}

function setFilters(partial) {
  Object.assign(state.filters, partial);
  syncControls();
}
function syncControls() {
  const f = state.filters;
  $("#f-query").value = f.query;
  $("#f-category").value = f.category;
  $("#f-status").value = f.status;
  $("#f-assoc").value = f.assoc;
  $("#f-conflict").checked = f.conflictOnly;
  $("#f-sort").value = state.sort;
}
function resetFilters(render = true) {
  state.filters = { ...EMPTY_FILTERS };
  state.sort = "recommended";
  syncControls();
  if (render) renderCatalog();
}

function bindEvents() {
  const read = () => {
    state.filters = {
      ...state.filters,
      query: $("#f-query").value,
      category: $("#f-category").value,
      status: $("#f-status").value,
      assoc: $("#f-assoc").value,
      conflictOnly: $("#f-conflict").checked,
    };
    state.sort = $("#f-sort").value;
    renderCatalog();
  };
  ["#f-query", "#f-category", "#f-status", "#f-assoc", "#f-conflict", "#f-sort"].forEach((s) =>
    $(s).addEventListener(s === "#f-query" ? "input" : "change", read));
  $("#toolbar").addEventListener("submit", (e) => e.preventDefault());
  $("#toolbar").addEventListener("reset", (e) => { e.preventDefault(); resetFilters(); $("#f-query").focus(); });
  $("#empty-reset").addEventListener("click", () => { resetFilters(); $("#f-query").focus(); });

  $("#view-cards").addEventListener("click", () => setView("cards"));
  $("#view-table").addEventListener("click", () => setView("table"));
  $("#expand-all").addEventListener("click", () => { state.expanded = new Set(currentItems().map((i) => i.id)); renderCards(currentItems()); });
  $("#collapse-all").addEventListener("click", () => { state.expanded = new Set(); renderCards(currentItems()); });
  $("#print-btn").addEventListener("click", () => window.print());
  $("#print-focus").addEventListener("click", () => window.print());

  $("#select-visible").addEventListener("click", () => {
    currentItems().forEach((i) => state.selected.add(i.id));
    persistSelection();
    renderCatalog();
  });
  const clear = () => {
    if (state.selected.size >= 3 && !window.confirm(`Clear all ${state.selected.size} selected items?`)) return;
    state.selected.clear(); state.focus = false; state.lastRemoved = null;
    persistSelection(); renderCatalog();
  };
  $("#clear-selection").addEventListener("click", clear);
  $("#bar-clear").addEventListener("click", clear);
  $("#focus-toggle").addEventListener("click", () => { setFocus(!state.focus); });
  $("#undo-remove").addEventListener("click", () => {
    if (!state.lastRemoved) return;
    state.selected.add(state.lastRemoved);
    state.lastRemoved = null;
    persistSelection(); renderCatalog();
    announce("Restored the last removed item.");
  });

  $("#copy-md").addEventListener("click", async () => flash($("#copy-md"), await copyText(toMarkdown(listForExport(), state.notes, state.meta, state.sources)) ? "Copied" : "Copy failed"));
  $("#copy-link").addEventListener("click", async () => {
    const url = location.origin + location.pathname + buildShareQuery([...state.selected], state.focus);
    flash($("#copy-link"), await copyText(url) ? "Link copied" : "Copy failed");
  });
  $("#download-csv").addEventListener("click", () => {
    const blob = new Blob(["\ufeff", toCsv(listForExport(), state.notes, state.meta)], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "fabcon-discussion-list.csv" });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  const toggle = $(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    $("#site-nav").classList.toggle("open", !open);
  });
  $("#site-nav").addEventListener("click", (e) => {
    if (e.target.closest("a")) { toggle.setAttribute("aria-expanded", "false"); $("#site-nav").classList.remove("open"); }
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

  const presentBtn = $("#present-toggle");
  const paintPresent = () => presentBtn.setAttribute("aria-pressed", String(document.documentElement.classList.contains("present")));
  presentBtn.addEventListener("click", () => {
    document.documentElement.classList.toggle("present");
    try { localStorage.setItem(KEYS.present, document.documentElement.classList.contains("present") ? "1" : "0"); } catch { /* storage unavailable */ }
    paintPresent();
  });
  paintPresent();

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);
    if (e.key === "Escape") {
      if (toggle.getAttribute("aria-expanded") === "true") { toggle.setAttribute("aria-expanded", "false"); $("#site-nav").classList.remove("open"); toggle.focus(); return; }
      if (t === $("#f-query") && $("#f-query").value) { $("#f-query").value = ""; state.filters.query = ""; renderCatalog(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); $("#f-query").focus(); $("#catalog-title").scrollIntoView({ block: "start" }); }
    if (e.key === "f" && state.selected.size) { e.preventDefault(); setFocus(!state.focus); }
  });
  window.addEventListener("hashchange", applyHash);
}

function flash(btn, text) {
  const old = btn.dataset.label ?? btn.textContent;
  btn.dataset.label = old;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1600);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  const ta = el("textarea", { "aria-hidden": "true", style: "position:fixed;left:-9999px" });
  ta.value = text; document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

/* ---------- selection ---------- */
function persistSelection() { store.set(KEYS.sel, [...state.selected]); }
function persistNotes() { store.set(KEYS.notes, state.notes); }

function setFocus(on) {
  if (on && state.selected.size === 0) return;
  state.focus = on;
  state.lastRemoved = null;
  renderCatalog();
  announce(on ? `Showing only the ${state.selected.size} selected items.` : "Showing all items again.");
  $("#focus-toggle").focus({ preventScroll: true });
  if (on) $("#catalog-title").scrollIntoView();
}

function listForExport() {
  const ids = state.selected.size ? [...state.selected] : currentItems().map((i) => i.id);
  return ids.map((id) => state.byId.get(id)).filter(Boolean).sort((a, b) => compareItems(a, b, "recommended", "asc", state.meta));
}

function toggleSelect(id, on) {
  if (on) state.selected.add(id); else state.selected.delete(id);
  persistSelection();
  if (state.focus && !on) {
    state.lastRemoved = id;
    if (state.selected.size === 0) state.focus = false;
    renderCatalog();
    announce(`Removed “${state.byId.get(id).title}” from the discussion list.`);
    ($("#undo-remove").hidden ? $("#focus-toggle") : $("#undo-remove")).focus({ preventScroll: true });
    return;
  }
  document.querySelectorAll(`[data-select-id="${id}"]`).forEach((n) => { n.checked = on; });
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.classList.toggle("selected", on);
    const notes = card.querySelector(".notes");
    if (notes) notes.hidden = !on;
  }
  updateBar();
  updateFocusBanner();
}

function updateBar() {
  const n = state.selected.size;
  const bar = $("#select-bar");
  bar.hidden = n === 0 && !state.focus;
  $("#select-count").textContent = String(n);
  const btn = $("#focus-toggle");
  btn.textContent = state.focus ? "Show all items" : `Keep selected only (${n})`;
  btn.setAttribute("aria-pressed", String(state.focus));
  $("#undo-remove").hidden = !(state.focus && state.lastRemoved);
  document.body.classList.toggle("has-select-bar", !bar.hidden);
}

function updateFocusBanner() {
  const banner = $("#focus-banner");
  const n = state.selected.size;
  banner.hidden = !state.focus;
  $("#focus-title").textContent = `Discussion list: ${n} item${n === 1 ? "" : "s"}`;
  $("#focus-sub").textContent = " · tick or untick to keep refining the list; add notes on each card.";
}

/* ---------- catalog rendering ---------- */
function setView(view) {
  state.view = view;
  $("#view-cards").setAttribute("aria-pressed", String(view === "cards"));
  $("#view-table").setAttribute("aria-pressed", String(view === "table"));
  $("#catalog").dataset.view = view;
  $("#expand-all").hidden = view !== "cards";
  $("#collapse-all").hidden = view !== "cards";
}

function currentItems() {
  const { meta } = state;
  let list = filterItems(state.items, state.filters, meta);
  if (state.focus) list = list.filter((i) => state.selected.has(i.id));
  return list.sort((a, b) => compareItems(a, b, state.sort, "asc", meta));
}

function renderChips() {
  const { items, meta } = state;
  const counts = facetCounts(items, state.filters, meta, "action", (i) => actionFor(i, meta));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const defs = [["", "All", total], ...["Evaluate now", "Pilot", "Watch"].map((a) => [a, a, counts.get(a) ?? 0])];
  $("#action-chips").replaceChildren(...defs.map(([value, label, n]) =>
    el("button", {
      type: "button", class: "chip-btn", "aria-pressed": String(state.filters.action === value), title: ACTION_HELP[value] ?? "Show every suggested action",
      onclick: () => { state.filters.action = value; renderCatalog(); },
    }, `${label} `, el("span", { class: "chip-count", text: String(n) }))));
}

function renderCatalog() {
  const list = currentItems();
  const total = state.items.length;
  const active = hasActiveFilters(state.filters);
  $("#result-count").textContent = state.focus
    ? `Showing ${list.length} of ${state.selected.size} selected announcements${active ? " (filters applied)" : ""}.`
    : `Showing ${list.length} of ${total} announcements${active ? " (filters applied)" : ""}.`;
  $("#empty-state").hidden = list.length > 0;
  renderChips();
  renderCards(list);
  renderTable(list);
  updateBar();
  updateFocusBanner();
}

function groups(list) {
  if (state.sort === "recommended") {
    const pri = list.filter((i) => i.priority);
    const rest = list.filter((i) => !i.priority);
    const out = [];
    if (pri.length) out.push({ heading: `Priority announcements (${pri.length})`, items: pri });
    const cats = [...new Set(rest.map((i) => i.category))];
    for (const c of cats) out.push({ heading: `${c} (${rest.filter((i) => i.category === c).length})`, items: rest.filter((i) => i.category === c) });
    return out;
  }
  if (state.sort === "category") {
    return [...new Set(list.map((i) => i.category))].map((c) => ({ heading: `${c} (${list.filter((i) => i.category === c).length})`, items: list.filter((i) => i.category === c) }));
  }
  return [{ heading: null, items: list }];
}

function renderCards(list) {
  const frag = document.createDocumentFragment();
  for (const g of groups(list)) {
    if (g.heading) frag.append(el("h3", { class: "cat-heading", text: g.heading }));
    frag.append(el("div", { class: "card-grid" }, g.items.map(buildCard)));
  }
  $("#cards").replaceChildren(frag);
}

function detailRow(label, content) {
  return el("div", { class: "detail-row" }, el("dt", { text: label }), el("dd", {}, content));
}

function buildCard(item) {
  const { meta } = state;
  const action = actionFor(item, meta);
  const open = state.expanded.has(item.id);
  const panelId = `panel-${item.id}`;
  const isSel = state.selected.has(item.id);
  const card = el("article", { class: `card${isSel ? " selected" : ""}${item.priority ? " is-priority" : ""}`, id: `card-${item.id}`, "aria-labelledby": `t-${item.id}` });

  const checkbox = el("input", { type: "checkbox", "data-select-id": item.id, id: `sel-${item.id}`, onchange: (e) => toggleSelect(item.id, e.target.checked) });
  checkbox.checked = isSel;
  const selectLabel = el("label", { class: "select-box", for: `sel-${item.id}` }, checkbox, el("span", { text: state.focus ? "Keep in list" : "Select for discussion" }));

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
  dl.append(detailRow("Evidence tier", item.assoc === "event" ? "Event blog: named in the hero post or a workload blog for the event." : "September update: listed in a September 2026 feature summary linked from the hero post."));
  if (item.tocTitle) dl.append(detailRow("September summary section", item.tocTitle));
  dl.append(detailRow("Announcement date", item.date ? formatDate(item.date) : "Not specified in the public source."));
  dl.append(detailRow("Item ID", el("code", { text: item.id })));
  const panel = el("div", { class: "panel", id: panelId, hidden: !open }, dl);

  const notes = el("div", { class: "notes", hidden: !isSel },
    el("label", { for: `note-${item.id}`, text: "Discussion notes (saved only in this browser)" }),
    el("textarea", {
      id: `note-${item.id}`, rows: "2", maxlength: "600", placeholder: "What the customer said, owner, next step…",
      oninput: (e) => { state.notes[item.id] = e.target.value; clearTimeout(persistNotes.t); persistNotes.t = setTimeout(persistNotes, 300); },
    }));
  notes.querySelector("textarea").value = state.notes[item.id] ?? "";

  card.append(...[
    el("div", { class: "card-head" },
      el("div", { class: "card-top" },
        item.priority ? el("span", { class: "chip chip-priority", text: `Priority ${item.priority}` }) : null,
        el("span", { class: "chip", text: item.category }),
        el("span", { class: "chip chip-tier", text: TIER_LABEL[item.assoc] ?? item.assoc })),
      selectLabel),
    el("h4", { id: `t-${item.id}`, text: item.title }),
    el("p", { class: "product", text: item.product }),
    item.theme ? el("p", { class: "theme", text: item.theme }) : null,
    el("div", { class: "badges" }, statusBadge(item.status), actionBadge(action),
      item.conflict ? el("span", { class: "badge badge-flag", title: "Sources disagree; see technical details" }, el("span", { "aria-hidden": "true", text: "⚑ " }), "Source discrepancy") : null),
    el("p", { class: "summary", text: item.summary }),
    el("p", { class: "meta-line" }, el("strong", { text: "As announced: " }), item.announced),
    el("p", { class: "meta-line" }, el("strong", { text: `Verified as of ${formatDate(meta.lastVerified)}: ` }), VER_SHORT[item.ver] ?? ""),
    el("p", { class: "relevance" }, el("strong", { text: `${meta.relevanceLabel}: ` }), item.relevance),
    el("p", { class: "next" }, el("strong", { text: "Suggested next step: " }), item.next),
    item.conflict ? el("p", { class: "conflict-note" }, el("strong", { text: "Source discrepancy: " }), item.conflict) : null,
    el("p", { class: "card-links" }, el("span", { class: "label", text: "Sources: " }), sourceLinks(item)),
    notes, btn, panel].filter(Boolean));
  return card;
}

function sortHeader(key, label) {
  const active = state.sort === key;
  return el("th", { scope: "col", "aria-sort": active ? "ascending" : "none" },
    el("button", {
      type: "button", class: "sort-btn", "data-sort": key,
      onclick: () => { state.sort = key; $("#f-sort").value = key; renderCatalog(); $(`#table-wrap [data-sort="${key}"]`)?.focus(); },
    }, label, el("span", { "aria-hidden": "true", class: "sort-ind", text: active ? " ▲" : "" })));
}

function renderTable(list) {
  const { meta } = state;
  const head = el("thead", {}, el("tr", {},
    el("th", { scope: "col", class: "col-select" }, el("span", { class: "sr-only", text: "Select for discussion" })),
    sortHeader("title", "Announcement"), sortHeader("category", "Workload"), sortHeader("status", "Status"), sortHeader("action", "Action"),
    el("th", { scope: "col", text: "As announced" }), el("th", { scope: "col", text: "Verified" }), el("th", { scope: "col", text: "Sources" }),
    el("th", { scope: "col", class: "col-notes", text: "Notes" })));
  const body = el("tbody", {}, list.map((i) => {
    const cb = el("input", { type: "checkbox", "data-select-id": i.id, "aria-label": `Select ${i.title} for discussion`, onchange: (e) => toggleSelect(i.id, e.target.checked) });
    cb.checked = state.selected.has(i.id);
    return el("tr", { id: `row-${i.id}`, class: state.selected.has(i.id) ? "selected" : "" },
      el("td", { class: "col-select" }, cb),
      el("th", { scope: "row" }, el("button", { type: "button", class: "link-btn", onclick: () => goToItem(i.id) }, i.title), el("div", { class: "product", text: i.product })),
      el("td", { text: i.category }), el("td", {}, statusBadge(i.status)), el("td", {}, actionBadge(actionFor(i, meta))),
      el("td", { text: i.announced }), el("td", { text: VER_SHORT[i.ver] ?? "" }), el("td", {}, sourceLinks(i)),
      el("td", { class: "col-notes", text: state.notes[i.id] ?? "" }));
  }));
  $("#table-wrap").replaceChildren(el("table", { class: "data-table compare-table" },
    el("caption", { class: "sr-only", text: "Announcement comparison. Column headers with buttons can be sorted." }), head, body));
}

function goToItem(id) {
  if (!state.byId.has(id)) return;
  if (state.focus && !state.selected.has(id)) state.focus = false;
  if (!currentItems().some((i) => i.id === id)) resetFilters(false);
  setView("cards");
  state.expanded.add(id);
  renderCatalog();
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.scrollIntoView({ block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1800);
    card.querySelector(".expand-btn")?.focus({ preventScroll: true });
  }
}

function applyHash() {
  const m = /^#card-(.+)$/.exec(location.hash);
  if (m) goToItem(decodeURIComponent(m[1]));
}

init().catch((err) => {
  $("#catalog .wrap").prepend(el("p", { class: "notice", role: "alert" }, `The announcement data could not be loaded: ${err.message}. If you opened this file directly, serve the folder over HTTP (see README).`));
  console.error(err);
});
