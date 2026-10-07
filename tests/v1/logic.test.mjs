import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_FILTERS, actionFor, compareItems, countBy, filterItems, formatDate, hasActiveFilters, matchesQuery, normalize, searchText, verifiedText,
} from "../../v1/js/logic.js";

const { meta, announcements } = JSON.parse(readFileSync(new URL("../../v1/data/announcements.json", import.meta.url), "utf8"));
const items = announcements.map((a) => ({ ...a, _search: searchText(a) }));

test("normalize strips case, accents and curly quotes", () => {
  assert.equal(normalize("Café ‘Fabric’"), "cafe 'fabric'");
});

test("search matches titles, descriptions and products", () => {
  assert.ok(items.filter((i) => matchesQuery(i, "ontology")).length > 3);
  const byTitle = items.filter((i) => matchesQuery(i, "Database Hub"));
  assert.ok(byTitle.some((i) => i.id === "database-hub"));
  const byProduct = items.filter((i) => matchesQuery(i, "Salesforce"));
  assert.ok(byProduct.some((i) => i.id === "salesforce-data360-onelake"));
  const byDescription = items.filter((i) => matchesQuery(i, "recommendation engines") || matchesQuery(i, "retrieval-augmented"));
  assert.ok(byDescription.length >= 1);
});

test("search is token-based, case-insensitive and AND-combined", () => {
  const a = filterItems(items, { ...EMPTY_FILTERS, query: "DATA agents copilot" }, meta);
  assert.ok(a.length > 0);
  assert.ok(a.every((i) => ["data", "agents", "copilot"].every((t) => i._search.includes(t))));
  assert.equal(filterItems(items, { ...EMPTY_FILTERS, query: "zzzz-no-such-term" }, meta).length, 0);
});

test("filters by workload, availability, action, tier and discrepancy", () => {
  const cat = meta.categories[0];
  assert.ok(filterItems(items, { ...EMPTY_FILTERS, category: cat }, meta).every((i) => i.category === cat));
  const ga = filterItems(items, { ...EMPTY_FILTERS, status: "GA" }, meta);
  assert.ok(ga.length > 0 && ga.every((i) => i.status === "GA"));
  const evalNow = filterItems(items, { ...EMPTY_FILTERS, action: "Evaluate now" }, meta);
  assert.equal(evalNow.length, ga.length, "Evaluate now must equal GA");
  const pilot = filterItems(items, { ...EMPTY_FILTERS, action: "Pilot" }, meta);
  assert.ok(pilot.every((i) => i.status === "Public preview"));
  const watch = filterItems(items, { ...EMPTY_FILTERS, action: "Watch" }, meta);
  assert.equal(evalNow.length + pilot.length + watch.length, items.length, "actions must partition the catalog");
  assert.ok(filterItems(items, { ...EMPTY_FILTERS, conflictOnly: true }, meta).every((i) => i.conflict));
  assert.ok(filterItems(items, { ...EMPTY_FILTERS, assoc: "monthly" }, meta).every((i) => i.assoc === "monthly"));
});

test("combined filters intersect and reset restores everything", () => {
  const f = { ...EMPTY_FILTERS, status: "Public preview", category: "Microsoft Databases", query: "hub" };
  const r = filterItems(items, f, meta);
  assert.ok(r.every((i) => i.status === "Public preview" && i.category === "Microsoft Databases"));
  assert.equal(hasActiveFilters(f), true);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS }), false);
  assert.equal(filterItems(items, { ...EMPTY_FILTERS }, meta).length, items.length);
});

test("actionFor and verifiedText derive from data", () => {
  assert.equal(actionFor({ status: "GA" }, meta), "Evaluate now");
  assert.equal(actionFor({ status: "Public preview" }, meta), "Pilot");
  assert.equal(actionFor({ status: "Coming soon" }, meta), "Watch");
  const custom = items.find((i) => i.ver === "custom");
  assert.ok(verifiedText(custom, meta).includes(custom.verNote));
});

test("countBy and compareItems", () => {
  const m = countBy(items, (i) => i.status);
  assert.equal([...m.values()].reduce((a, b) => a + b, 0), items.length);
  const sorted = [...items].sort((a, b) => compareItems(a, b, "status", "asc", meta));
  assert.equal(sorted[0].status, "GA");
  const byTitle = [...items].sort((a, b) => compareItems(a, b, "title", "desc", meta));
  assert.ok(normalize(byTitle[0].title) >= normalize(byTitle[1].title));
});

test("formatDate does not shift days", () => {
  assert.equal(formatDate("2026-10-06"), "Oct 6, 2026");
  assert.equal(formatDate("2026-09-28"), "Sep 28, 2026");
  assert.equal(formatDate(null), "");
});
