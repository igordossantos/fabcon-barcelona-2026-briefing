import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../data/announcements.json", import.meta.url), "utf8"));
const { meta, sources, announcements } = data;
const byId = new Map(announcements.map((a) => [a.id, a]));
const sourceIds = new Set(sources.map((s) => s.id));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

test("dataset has the expected shape and Zurich/Farmers framing", () => {
  assert.ok(Array.isArray(sources) && Array.isArray(announcements) && announcements.length > 0);
  assert.equal(meta.subtitle, "A curated briefing for Zurich Insurance Group and Farmers Insurance");
  assert.match(meta.relevanceLabel, /Zurich Insurance Group and Farmers Insurance/);
  assert.match(meta.disclaimer, /not a contractual roadmap/i);
  assert.match(meta.disclaimer, /Zurich Insurance Group or Farmers Insurance/);
  for (const k of ["title", "presenter", "researchCutoff", "lastVerified", "statuses", "statusToAction", "categories", "verificationCodes", "relevanceAreas", "methodology", "gaps", "septemberToc"]) {
    assert.ok(meta[k], `meta.${k} missing`);
  }
});

test("ids and titles are unique (duplicate detection)", () => {
  const ids = announcements.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids: " + ids.filter((x, i) => ids.indexOf(x) !== i));
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
  const titles = announcements.map((a) => norm(a.title));
  assert.equal(new Set(titles).size, titles.length, "duplicate titles: " + titles.filter((x, i) => titles.indexOf(x) !== i));
});

test("required fields, enums and source references", () => {
  const required = ["id", "title", "product", "category", "assoc", "summary", "details", "announced", "status", "ver", "prereq", "src", "relevance", "next"];
  for (const a of announcements) {
    for (const k of required) assert.ok(a[k] !== undefined && a[k] !== null && a[k] !== "", `${a.id}: missing ${k}`);
    assert.ok(Array.isArray(a.details) && Array.isArray(a.docs), `${a.id}: details/docs must be arrays`);
    assert.ok("date" in a, `${a.id}: date key must exist`);
    assert.ok(meta.statuses.includes(a.status), `${a.id}: invalid status ${a.status}`);
    assert.ok(meta.categories.includes(a.category), `${a.id}: invalid category`);
    assert.ok(["event", "monthly"].includes(a.assoc), `${a.id}: invalid assoc`);
    assert.ok(a.ver in meta.verificationCodes, `${a.id}: invalid ver`);
    if (a.ver === "custom") assert.ok(a.verNote, `${a.id}: custom verification needs verNote`);
    assert.ok(meta.statusToAction[a.status], `${a.id}: no action mapping`);
    assert.ok(a.src.length >= 1, `${a.id}: needs a source`);
    for (const id of a.src) assert.ok(sourceIds.has(id), `${a.id}: unknown source ${id}`);
    assert.equal(new Set(a.src).size, a.src.length);
    for (const [label, url] of a.docs) assert.ok(label && isHttps(url), `${a.id}: bad doc link ${url}`);
    if (a.date !== null) assert.ok(a.date >= "2026-09-28" && a.date <= meta.researchCutoff, `${a.id}: date out of range`);
    if (a.conflict) assert.ok(a.conflict.length > 20);
    assert.ok(a.src.some((id) => !["S12", "S13"].includes(id)), `${a.id}: cites only Learn pages`);
  }
  for (const s of sources) assert.ok(isHttps(s.url) && s.title && s.publisher && s.short, `${s.id}: bad source`);
});

test("status wording is consistent with verification evidence", () => {
  for (const a of announcements) {
    if (a.ver === "learn-ga") assert.equal(a.status, "GA", `${a.id}: Learn says GA`);
    if (a.ver === "learn-preview") assert.notEqual(a.status, "GA", `${a.id}: Learn says preview`);
    if (a.ver === "roadmap") assert.ok(["Coming soon", "Preview coming soon", "Not specified"].includes(a.status), `${a.id}`);
  }
});

test("every section of the September 2026 Fabric summary maps to an existing entry", () => {
  const toc = meta.septemberToc;
  assert.ok(toc.length >= 100, "unexpectedly small September coverage");
  const titles = toc.map((t) => t.title);
  assert.equal(new Set(titles).size, titles.length, "duplicate toc titles");
  for (const t of toc) {
    assert.ok(byId.has(t.entry), `toc “${t.title}” maps to missing entry ${t.entry}`);
    assert.ok(meta.statuses.includes(t.status));
    const e = byId.get(t.entry);
    assert.ok(e.src.includes("S10"), `${e.id} should cite the September Fabric summary (S10)`);
  }
  const mapped = new Set(toc.map((t) => t.entry));
  for (const a of announcements.filter((x) => x.tocTitle)) {
    assert.ok(mapped.has(a.id), `${a.id} has tocTitle but is not in septemberToc`);
    assert.ok(titles.includes(a.tocTitle), `${a.id}: tocTitle not in septemberToc`);
  }
});

test("summary status labels match the catalog status unless a conflict is documented", () => {
  for (const t of meta.septemberToc) {
    const e = byId.get(t.entry);
    if (!e.tocTitle) continue;
    if (t.status === "GA" && e.status !== "GA") assert.ok(e.conflict, `${e.id}: summary says GA, catalog says ${e.status}, no conflict note`);
    if (t.status === "Public preview") assert.ok(e.status === "Public preview", `${e.id}: summary says preview`);
  }
});

test("executive priorities: 8 to 12 uniquely ranked items with themes", () => {
  const ranked = announcements.filter((a) => a.priority);
  assert.ok(ranked.length >= 8 && ranked.length <= 12);
  const ranks = ranked.map((a) => a.priority).sort((x, y) => x - y);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
  for (const a of ranked) assert.ok(a.theme);
});

test("relevance areas reference existing announcements", () => {
  assert.equal(meta.relevanceAreas.length, 7);
  for (const area of meta.relevanceAreas) for (const id of area.ids) assert.ok(byId.has(id), `${area.name}: unknown ${id}`);
});

test("wording rules: no 'free' claims, no assertions about either organization's environment", () => {
  const item = byId.get("fabric-iq-copilot-chat-cowork");
  assert.match(item.prereq, /not be read as free/i);
  for (const a of announcements) {
    const text = JSON.stringify(a).replace(/must not be read as free/gi, "");
    assert.ok(!/\b(is|are) free\b/i.test(text), `${a.id}: says free`);
    assert.ok(!/\b(Farmers|Zurich)( Insurance)?( Group)? (uses|has|is using|already|runs)\b/i.test(a.relevance + " " + a.next), `${a.id}: asserts customer environment`);
  }
});

test("no leftover placeholders", () => {
  const text = JSON.stringify(data);
  for (const bad of ["__END__", "TODO", "TBD", "lorem ipsum"]) assert.ok(!text.includes(bad), `found ${bad}`);
});
