import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../../v1/data/announcements.json", import.meta.url), "utf8"));
const { meta, sources, announcements } = data;
const sourceIds = new Set(sources.map((s) => s.id));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

test("dataset has the expected top-level shape", () => {
  assert.ok(meta && Array.isArray(sources) && Array.isArray(announcements));
  assert.ok(announcements.length > 0);
  for (const k of ["title", "subtitle", "presenter", "researchCutoff", "lastVerified", "statuses", "statusToAction", "categories", "verificationCodes", "disclaimer", "relevanceAreas", "methodology", "gaps"]) {
    assert.ok(meta[k], `meta.${k} missing`);
  }
  assert.match(meta.researchCutoff, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(meta.lastVerified >= meta.researchCutoff || meta.lastVerified === meta.researchCutoff);
});

test("announcement ids and titles are unique (duplicate detection)", () => {
  const ids = announcements.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids: " + ids.filter((x, i) => ids.indexOf(x) !== i));
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${id}`);
  const titles = announcements.map((a) => norm(a.title));
  assert.equal(new Set(titles).size, titles.length, "duplicate titles: " + titles.filter((x, i) => titles.indexOf(x) !== i));
});

test("every announcement has the required fields", () => {
  const required = ["id", "title", "product", "category", "assoc", "summary", "details", "announced", "status", "ver", "prereq", "src", "relevance", "next"];
  for (const a of announcements) {
    for (const k of required) {
      assert.ok(a[k] !== undefined && a[k] !== null && a[k] !== "", `${a.id}: missing ${k}`);
    }
    assert.ok(Array.isArray(a.details), `${a.id}: details must be an array`);
    assert.ok(Array.isArray(a.docs), `${a.id}: docs must be an array`);
    assert.ok("conflict" in a || a.conflict === undefined, `${a.id}`);
    assert.ok("date" in a, `${a.id}: date key must exist (null if not stated)`);
  }
});

test("status, category, tier and verification codes are valid", () => {
  for (const a of announcements) {
    assert.ok(meta.statuses.includes(a.status), `${a.id}: invalid status ${a.status}`);
    assert.ok(meta.categories.includes(a.category), `${a.id}: invalid category ${a.category}`);
    assert.ok(["event", "monthly"].includes(a.assoc), `${a.id}: invalid assoc`);
    assert.ok(a.ver in meta.verificationCodes, `${a.id}: invalid ver ${a.ver}`);
    if (a.ver === "custom") assert.ok(a.verNote, `${a.id}: custom verification needs verNote`);
    assert.ok(meta.statusToAction[a.status], `${a.id}: status has no action mapping`);
  }
  for (const s of meta.statuses) assert.ok(meta.statusToAction[s], `no action for ${s}`);
});

test("dates are ISO and not after the research cutoff", () => {
  for (const a of announcements) {
    if (a.date !== null) {
      assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/, `${a.id}: bad date`);
      assert.ok(a.date <= meta.researchCutoff, `${a.id}: date after cutoff`);
      assert.ok(a.date >= "2026-09-28" && a.date <= "2026-10-01", `${a.id}: date outside the event window`);
    }
  }
});

test("every announcement cites at least one known source with an https URL", () => {
  for (const a of announcements) {
    assert.ok(a.src.length >= 1, `${a.id}: no source`);
    for (const id of a.src) assert.ok(sourceIds.has(id), `${a.id}: unknown source ${id}`);
    assert.equal(new Set(a.src).size, a.src.length, `${a.id}: duplicate source id`);
    for (const [label, url] of a.docs) {
      assert.ok(label && isHttps(url), `${a.id}: bad doc link ${url}`);
    }
  }
  for (const s of sources) {
    assert.ok(isHttps(s.url), `${s.id}: bad url`);
    assert.ok(s.title && s.publisher && s.short, `${s.id}: missing metadata`);
    assert.ok(s.date === null || /^\d{4}-\d{2}-\d{2}$/.test(s.date));
  }
  assert.equal(new Set(sources.map((s) => s.id)).size, sources.length);
});

test("event-tier items cite an event source, not only Learn documentation", () => {
  const learnOnly = new Set(["S12", "S13"]);
  for (const a of announcements) {
    assert.ok(a.src.some((id) => !learnOnly.has(id)), `${a.id}: cites only Learn pages`);
  }
});

test("status wording is consistent with verification evidence", () => {
  for (const a of announcements) {
    if (a.ver === "learn-ga" && a.status !== "GA") assert.fail(`${a.id}: Learn says GA but status is ${a.status}`);
    if (a.ver === "learn-preview") assert.ok(a.status !== "GA", `${a.id}: Learn says preview but status is GA`);
    if (a.ver === "roadmap") assert.ok(["Coming soon", "Preview coming soon", "Not specified"].includes(a.status), `${a.id}: roadmap item with status ${a.status}`);
  }
});

test("items with a stated discrepancy explain it", () => {
  for (const a of announcements) {
    if (a.conflict !== null && a.conflict !== undefined) assert.ok(a.conflict.length > 20, `${a.id}: conflict text too short`);
  }
});

test("executive briefing has 8 to 12 uniquely ranked items", () => {
  const ranked = announcements.filter((a) => a.priority);
  assert.ok(ranked.length >= 8 && ranked.length <= 12, `got ${ranked.length}`);
  const ranks = ranked.map((a) => a.priority).sort((x, y) => x - y);
  assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
  for (const a of ranked) assert.ok(a.theme, `${a.id}: priority item needs a theme`);
});

test("relevance areas reference existing announcements", () => {
  const ids = new Set(announcements.map((a) => a.id));
  assert.equal(meta.relevanceAreas.length, 7);
  for (const area of meta.relevanceAreas) {
    assert.ok(area.ids.length > 0);
    for (const id of area.ids) assert.ok(ids.has(id), `${area.name}: unknown id ${id}`);
  }
});

test("cost wording never equates 'no additional AI token cost' with free", () => {
  const item = announcements.find((a) => a.id === "fabric-iq-copilot-chat-cowork");
  assert.match(item.prereq, /not be read as free/i);
  for (const a of announcements) {
    const text = JSON.stringify(a);
    assert.ok(!/\b(is|are) free\b/i.test(text.replace(/must not be read as free/gi, "")), `${a.id}: says free`);
    assert.ok(!/\bROI\b.*\b\d+%/.test(text), `${a.id}: ROI claim`);
  }
});

test("relevance statements are not phrased as facts about Farmers", () => {
  for (const a of announcements) {
    assert.ok(!/\bFarmers (uses|has|is using|already)\b/i.test(a.relevance + a.next), `${a.id}: asserts Farmers' environment`);
  }
});

test("no leftover placeholders", () => {
  const text = JSON.stringify(data);
  for (const bad of ["__END__", "TODO", "TBD", "lorem ipsum"]) assert.ok(!text.includes(bad), `found ${bad}`);
});
