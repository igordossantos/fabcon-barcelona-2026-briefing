// Pure helpers shared by the page and the Node test suite. No DOM access here.

export function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

export function actionFor(item, meta) {
  return meta.statusToAction[item.status] ?? "Watch";
}

export function verifiedText(item, meta) {
  const base = meta.verificationCodes[item.ver] ?? "";
  return [base, item.verNote].filter(Boolean).join(" ").trim();
}

export function searchText(item) {
  return normalize(
    [item.title, item.summary, item.product, item.category, ...(item.details ?? [])].join(" \n ")
  );
}

export function matchesQuery(item, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = item._search ?? searchText(item);
  return tokens.every((t) => haystack.includes(t));
}

export const EMPTY_FILTERS = Object.freeze({
  query: "",
  category: "",
  status: "",
  action: "",
  assoc: "",
  conflictOnly: false,
});

export function hasActiveFilters(filters) {
  return Object.keys(EMPTY_FILTERS).some((k) => filters[k] !== EMPTY_FILTERS[k]);
}

export function filterItems(items, filters, meta) {
  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.action && actionFor(item, meta) !== filters.action) return false;
    if (filters.assoc && item.assoc !== filters.assoc) return false;
    if (filters.conflictOnly && !item.conflict) return false;
    return matchesQuery(item, filters.query);
  });
}

export function countBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const k = keyFn(item);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Formats YYYY-MM-DD without timezone conversion.
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export const STATUS_CLASS = {
  GA: "ga",
  "Public preview": "preview",
  "Private preview": "private",
  "Preview coming soon": "soon-preview",
  "Coming soon": "soon",
  "Not specified": "unspecified",
};

export const STATUS_ICON = {
  GA: "●",
  "Public preview": "◐",
  "Private preview": "◑",
  "Preview coming soon": "◔",
  "Coming soon": "◷",
  "Not specified": "○",
};

export const VER_SHORT = {
  "learn-ga": "Confirmed GA (Learn)",
  "learn-preview": "Confirmed preview (Learn)",
  "no-learn": "Not in Learn; source only",
  unchecked: "Source only",
  roadmap: "Forward-looking",
  custom: "Partly confirmed (see card)",
};

export const TIER_LABEL = { event: "Event blog", monthly: "September update" };

export const SORT_OPTIONS = [
  ["recommended", "Recommended (priorities first)"],
  ["category", "Workload"],
  ["status", "Availability"],
  ["action", "Suggested action"],
  ["title", "Title A to Z"],
];

export function compareItems(a, b, key, dir, meta) {
  const titleCmp = () => normalize(a.title).localeCompare(normalize(b.title));
  const cat = (it) => meta.categories.indexOf(it.category);
  let r = 0;
  switch (key) {
    case "recommended": {
      const pa = a.priority ?? Infinity, pb = b.priority ?? Infinity;
      r = pa === pb ? cat(a) - cat(b) : pa - pb;
      break;
    }
    case "action": r = actionFor(a, meta).localeCompare(actionFor(b, meta)); break;
    case "status": r = meta.statuses.indexOf(a.status) - meta.statuses.indexOf(b.status); break;
    case "category": r = cat(a) - cat(b); break;
    default: r = titleCmp();
  }
  return (r || titleCmp()) * (dir === "desc" ? -1 : 1);
}

// Counts for facet chips: apply every filter except the facet being counted.
export function facetCounts(items, filters, meta, facet, valueFn) {
  const without = { ...filters, [facet]: EMPTY_FILTERS[facet] };
  return countBy(filterItems(items, without, meta), valueFn);
}

export function parseShare(search) {
  const p = new URLSearchParams(search);
  const ids = (p.get("sel") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s));
  return { ids: [...new Set(ids)], focus: p.get("focus") === "1" };
}

export function buildShareQuery(ids, focus) {
  const p = new URLSearchParams();
  if (ids.length) p.set("sel", ids.join(","));
  if (focus && ids.length) p.set("focus", "1");
  const q = p.toString().replace(/%2C/g, ",");
  return q ? `?${q}` : "";
}

const csvCell = (v) => {
  let s = String(v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(items, notes, meta) {
  const head = ["Title", "Workload", "Status", "Suggested action", "As announced", "Suggested next step", "Notes", "Sources"];
  const rows = items.map((i) => [i.title, i.category, i.status, actionFor(i, meta), i.announced, i.next, notes[i.id] ?? "", i.src.join(" ")]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function toMarkdown(items, notes, meta, sourceMap) {
  const lines = [`# ${meta.title}`, "", `${meta.subtitle}`, "", `Discussion list: ${items.length} item${items.length === 1 ? "" : "s"}`, ""];
  for (const i of items) {
    lines.push(`## ${i.title}`, `- Workload: ${i.category}`, `- Status: ${i.status} (${actionFor(i, meta)})`, `- As announced: ${i.announced}`, `- ${meta.relevanceLabel}: ${i.relevance}`, `- Suggested next step: ${i.next}`);
    const links = i.src.map((id) => sourceMap.get(id)).filter(Boolean).map((s) => `[${s.short}](${s.url})`);
    if (links.length) lines.push(`- Sources: ${links.join(", ")}`);
    if (notes[i.id]) lines.push(`- Notes: ${String(notes[i.id]).replace(/\r?\n/g, " ")}`);
    lines.push("");
  }
  lines.push(`_${meta.disclaimer}_`, "");
  return lines.join("\n");
}
