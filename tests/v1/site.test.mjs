import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../v1");
const read = (p) => readFileSync(join(root, p), "utf8");
const html = read("index.html");
const data = JSON.parse(read("data/announcements.json"));

function attrs(source, attr) {
  const out = [];
  const re = new RegExp(`\\s${attr}\\s*=\\s*"([^"]*)"`, "gi");
  let m;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

test("index.html uses repository-relative asset paths (works on a Pages project site)", () => {
  const refs = [...attrs(html, "href"), ...attrs(html, "src")].filter((r) => !r.startsWith("#") && !r.startsWith("data:") && !/^https?:/.test(r));
  assert.ok(refs.length >= 2, "expected local css/js references");
  for (const r of refs) {
    assert.ok(!r.startsWith("/"), `root-absolute path ${r} breaks project sites`);
    assert.ok(existsSync(join(root, r.split("#")[0])), `missing asset ${r}`);
  }
});

test("in-page anchors resolve to element ids", () => {
  const ids = new Set(attrs(html, "id"));
  const anchors = attrs(html, "href").filter((h) => h.startsWith("#") && h.length > 1);
  assert.ok(anchors.length >= 5);
  for (const a of anchors) assert.ok(ids.has(a.slice(1)), `anchor ${a} has no target`);
  for (const attr of ["aria-controls", "aria-labelledby"]) {
    for (const v of attrs(html, attr)) for (const id of v.split(/\s+/)) assert.ok(ids.has(id) || id === "", `${attr} -> ${id} missing`);
  }
});

test("module imports resolve to files", () => {
  for (const file of ["js/app.js", "js/logic.js"]) {
    const src = read(file);
    const re = /from\s+"(\.[^"]+)"/g;
    let m;
    while ((m = re.exec(src))) assert.ok(existsSync(join(root, dirname(file), m[1])), `${file}: missing import ${m[1]}`);
  }
  assert.match(read("js/app.js"), /fetch\("data\/announcements\.json"/, "data path must be relative");
});

test("page has accessibility landmarks and basics", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /<nav[^>]*aria-label="Primary"/);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, "exactly one h1");
  assert.match(html, /name="viewport"/);
  const labels = attrs(html, "for");
  for (const id of ["f-query", "f-category", "f-status", "f-action", "f-assoc", "f-conflict"]) assert.ok(labels.includes(id), `no label for ${id}`);
});

test("print stylesheet and reset control exist", () => {
  const css = read("css/styles.css");
  assert.match(css, /@media print/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /id="reset-filters"/);
  assert.match(html, /id="print-btn"/);
});

test("displayed totals are not hardcoded outside the dataset", () => {
  const total = String(data.announcements.length);
  const re = new RegExp(`\\b${total}\\b`);
  for (const file of ["index.html", "js/app.js", "js/logic.js", "css/styles.css", "README.md"]) {
    if (!existsSync(join(root, file))) continue;
    assert.ok(!re.test(read(file)), `${file} contains the literal total ${total}`);
  }
});

test("every file referenced by the Pages workflow exists", () => {
  const wf = readFileSync(join(root, "..", ".github/workflows/pages.yml"), "utf8");
  assert.match(wf, /actions\/deploy-pages@v\d+/);
  assert.match(wf, /actions\/upload-pages-artifact@v\d+/);
  assert.match(wf, /actions\/configure-pages@v\d+/);
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

test("colour contrast meets WCAG AA (4.5:1) in light and dark themes", () => {
  const css = read("css/styles.css");
  const light = vars(css.slice(css.indexOf(":root {"), css.indexOf(":root[data-theme=\"dark\"]")));
  const darkStart = css.indexOf(":root[data-theme=\"dark\"] {");
  const dark = { ...light, ...vars(css.slice(darkStart, css.indexOf("}", darkStart))) };
  const pairs = [["ink", "bg"], ["ink", "bg-alt"], ["ink", "surface"], ["muted", "bg"], ["muted", "bg-alt"], ["muted", "surface"], ["accent", "bg"], ["accent", "bg-alt"], ["accent", "surface"],
    ["ga-ink", "ga-bg"], ["pv-ink", "pv-bg"], ["pr-ink", "pr-bg"], ["sp-ink", "sp-bg"], ["cs-ink", "cs-bg"], ["ns-ink", "ns-bg"], ["flag-ink", "flag-bg"], ["brand-ink", "brand"]];
  for (const [name, theme] of [["light", light], ["dark", dark]]) {
    for (const [fg, bg] of pairs) {
      assert.ok(theme[fg] && theme[bg], `${name}: missing ${fg}/${bg}`);
      assert.ok(ratio(theme[fg], theme[bg]) >= 4.5, `${name}: ${fg} on ${bg} = ${ratio(theme[fg], theme[bg]).toFixed(2)}`);
    }
  }
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
test("no stray large or binary files in the publish set", () => {
  for (const f of walk(root)) assert.ok(statSync(f).size < 1_000_000, `${f} is unexpectedly large`);
});
