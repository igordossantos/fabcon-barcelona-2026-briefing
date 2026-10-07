import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_FILTERS, actionFor, buildShareQuery, compareItems, facetCounts, filterItems, parseShare, searchText, toCsv, toMarkdown,
} from "../js/logic.js";

const { meta, sources, announcements } = JSON.parse(readFileSync(new URL("../data/announcements.json", import.meta.url), "utf8"));
const items = announcements.map((a) => ({ ...a, _search: searchText(a) }));
const sourceMap = new Map(sources.map((s) => [s.id, s]));

test("search, filters, action partition and reset", () => {
  assert.ok(filterItems(items, { ...EMPTY_FILTERS, query: "copy job" }, meta).length >= 5);
  const ga = filterItems(items, { ...EMPTY_FILTERS, status: "GA" }, meta);
  assert.equal(ga.length, filterItems(items, { ...EMPTY_FILTERS, action: "Evaluate now" }, meta).length);
  const a = ["Evaluate now", "Pilot", "Watch"].map((x) => filterItems(items, { ...EMPTY_FILTERS, action: x }, meta).length);
  assert.equal(a.reduce((x, y) => x + y, 0), items.length);
  assert.equal(filterItems(items, { ...EMPTY_FILTERS }, meta).length, items.length);
  assert.ok(filterItems(items, { ...EMPTY_FILTERS, assoc: "monthly" }, meta).every((i) => i.assoc === "monthly"));
});

test("recommended sort puts ranked priorities first, in rank order", () => {
  const sorted = [...items].sort((x, y) => compareItems(x, y, "recommended", "asc", meta));
  const ranked = items.filter((i) => i.priority).length;
  assert.deepEqual(sorted.slice(0, ranked).map((i) => i.priority), sorted.slice(0, ranked).map((_, i) => i + 1));
  assert.ok(sorted.slice(ranked).every((i) => !i.priority));
  const byStatus = [...items].sort((x, y) => compareItems(x, y, "status", "asc", meta));
  assert.equal(byStatus[0].status, "GA");
});

test("facet counts ignore the facet being counted", () => {
  const f = { ...EMPTY_FILTERS, action: "Pilot", category: "Data Warehouse" };
  const c = facetCounts(items, f, meta, "action", (i) => actionFor(i, meta));
  assert.equal([...c.values()].reduce((x, y) => x + y, 0), items.filter((i) => i.category === "Data Warehouse").length);
  assert.ok(c.get("Evaluate now") > 0);
});

test("share links round-trip and reject unsafe ids", () => {
  const q = buildShareQuery(["a-b", "c1"], true);
  assert.equal(q, "?sel=a-b,c1&focus=1");
  assert.deepEqual(parseShare(q), { ids: ["a-b", "c1"], focus: true });
  assert.deepEqual(parseShare("?sel=ok,<script>,../x,UPPER").ids, ["ok"]);
  assert.equal(buildShareQuery([], true), "");
  assert.deepEqual(parseShare("?sel=x,x").ids, ["x"]);
});

test("CSV export escapes quotes and neutralises spreadsheet formulas", () => {
  const sample = items.slice(0, 2).map((i, n) => (n === 0 ? { ...i, title: '=HYPERLINK("x")', next: 'say "hi", ok' } : i));
  const csv = toCsv(sample, { [sample[1].id]: "+cmd note\nline2" }, meta);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows.length, 3);
  assert.ok(rows[1].startsWith("\"'=HYPERLINK"), rows[1]);
  assert.ok(rows[1].includes('"say ""hi"", ok"'));
  assert.ok(rows[2].includes("'+cmd note line2"));
});

test("Markdown export carries relevance, next step, sources, notes and the disclaimer", () => {
  const i = items.find((x) => x.id === "fabric-iq-copilot-chat-cowork");
  const md = toMarkdown([i], { [i.id]: "Customer wants a pilot" }, meta, sourceMap);
  assert.match(md, new RegExp(`## ${i.title}`));
  assert.match(md, /Potential relevance for Zurich Insurance Group and Farmers Insurance:/);
  assert.match(md, /Suggested next step:/);
  assert.match(md, /\[Azure blog \(hero\)\]\(https:\/\//);
  assert.match(md, /Notes: Customer wants a pilot/);
  assert.match(md, /not a contractual roadmap/);
});
