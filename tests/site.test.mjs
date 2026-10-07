import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const v2 = root;
const read = (p) => readFileSync(join(v2, p), "utf8");
const html = read("index.html");
const data = JSON.parse(read("data/announcements.json"));

function attrs(source, attr) {
  const out = [];
  const re = new RegExp(`\\s${attr}\\s*=\\s*"([^"]*)"`, "gi");
  let m;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

test("the page uses relative asset paths and every asset exists", () => {
  const refs = [...attrs(html, "href"), ...attrs(html, "src")].filter((r) => !r.startsWith("#") && !r.startsWith("data:") && !/^https?:/.test(r));
  for (const r of refs) {
    assert.ok(!r.startsWith("/"), `root-absolute path ${r}`);
    const target = r.split("#")[0];
    assert.ok(existsSync(join(v2, target)) || existsSync(join(v2, target, "index.html")), `missing ${r}`);
  }
  assert.ok(existsSync(join(v2, "css/styles.css")) && existsSync(join(v2, "js/app.js")) && existsSync(join(v2, "js/logic.js")));
  assert.match(read("js/app.js"), /fetch\("data\/announcements\.json"/);
});

test("in-page anchors and aria references resolve", () => {
  const ids = new Set(attrs(html, "id"));
  for (const a of attrs(html, "href").filter((h) => h.startsWith("#") && h.length > 1)) assert.ok(ids.has(a.slice(1)), `anchor ${a}`);
  for (const attr of ["aria-controls", "aria-labelledby"]) for (const v of attrs(html, attr)) for (const id of v.split(/\s+/)) assert.ok(ids.has(id), `${attr} -> ${id}`);
});

test("page structure follows the requested layout", () => {
  assert.match(html, /A curated briefing for Zurich Insurance Group and Farmers Insurance/);
  assert.ok(!/id="date-presentation"|id="date-cutoff"|id="date-verified"|class="dates"/.test(html), "hero dates must be removed");
  assert.ok(!/id="briefing"/.test(html), "priorities are merged into the catalog");
  const pos = (needle) => html.indexOf(needle);
  assert.ok(pos('id="overview"') < pos('id="catalog"'));
  assert.ok(pos('id="catalog"') < pos('id="matters"'), "Where the announcements may matter sits below the catalog");
  assert.ok(pos('id="matters"') < pos('id="sources"'));
  assert.match(html, /Where the announcements may matter/);
  assert.match(html, /id="select-bar"/);
  assert.match(html, /id="focus-toggle"/);
  assert.match(html, /id="select-visible"/);
  assert.match(html, /id="reset-filters"/);
});

test("accessibility basics", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip-link"/);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  const labels = attrs(html, "for");
  for (const id of ["f-query", "f-category", "f-status", "f-assoc", "f-sort", "f-conflict"]) assert.ok(labels.includes(id), `no label for ${id}`);
  const css = read("css/styles.css");
  assert.match(css, /@media print/);
  assert.match(css, /prefers-reduced-motion/);
});

test("displayed totals are not hardcoded", () => {
  const nums = [String(data.announcements.length), String(data.meta.septemberToc.length)];
  for (const file of ["index.html", "js/app.js", "js/logic.js", "css/styles.css"]) {
    for (const n of nums) assert.ok(!new RegExp(`\\b${n}\\b`).test(read(file)), `${file} contains literal ${n}`);
  }
});

function vars(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("colour contrast meets WCAG AA in light and dark themes", () => {
  const css = read("css/styles.css");
  const light = vars(css.slice(css.indexOf(":root {"), css.indexOf(":root[data-theme=\"dark\"]")));
  const ds = css.indexOf(":root[data-theme=\"dark\"] {");
  const dark = { ...light, ...vars(css.slice(ds, css.indexOf("}", ds))) };
  const pairs = [["ink", "bg"], ["ink", "bg-alt"], ["ink", "surface"], ["muted", "bg"], ["muted", "bg-alt"], ["muted", "surface"], ["accent", "bg"], ["accent", "bg-alt"], ["accent", "surface"],
    ["ga-ink", "ga-bg"], ["pv-ink", "pv-bg"], ["pr-ink", "pr-bg"], ["sp-ink", "sp-bg"], ["cs-ink", "cs-bg"], ["ns-ink", "ns-bg"], ["flag-ink", "flag-bg"], ["brand-ink", "brand"]];
  for (const [name, t] of [["light", light], ["dark", dark]]) {
    for (const [fg, bg] of pairs) assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name}: ${fg} on ${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
  }
});

test("v1 is untouched: its files still exist under /v1", () => {
  for (const f of ["index.html", "css/styles.css", "js/app.js", "js/logic.js", "data/announcements.json"]) assert.ok(existsSync(join(root, "v1", f)), f);
});
