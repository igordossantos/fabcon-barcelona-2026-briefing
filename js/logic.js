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

export function compareItems(a, b, key, dir, meta) {
  const val = (it) => {
    switch (key) {
      case "action": return actionFor(it, meta);
      case "status": return meta.statuses.indexOf(it.status);
      case "category": return meta.categories.indexOf(it.category);
      default: return normalize(it[key] ?? "");
    }
  };
  const x = val(a), y = val(b);
  const r = typeof x === "number" ? x - y : String(x).localeCompare(String(y));
  return (r || normalize(a.title).localeCompare(normalize(b.title))) * (dir === "desc" ? -1 : 1);
}
