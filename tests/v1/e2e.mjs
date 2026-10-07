// End-to-end checks with Playwright. Optional dependency:
//   npm install --no-save playwright-core
// Set CHROME_PATH to a Chromium/Chrome/Edge executable if Playwright's browser is not installed.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const data = JSON.parse(readFileSync(join(root, "v1/data/announcements.json"), "utf8"));
const total = data.announcements.length;
const countWhere = (fn) => data.announcements.filter(fn).length;

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error("playwright-core is not installed. Run: npm install --no-save playwright-core");
  process.exit(2);
}

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => n.startsWith("chromium-"))) {
      for (const sub of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
        const p = join(base, d, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

const port = 8992 + Math.floor(Math.random() * 500);
const live = process.env.BASE_URL; // e.g. https://<user>.github.io/<repo>/ to test a deployed site
const server = live ? null : spawn(process.execPath, [join(root, "tools/serve.mjs"), String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, live ? 0 : 800));
const base = live ?? `http://127.0.0.1:${port}/v1/index.html`;

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log("PASS", name); }
  catch (e) { results.push([false, name]); console.log("FAIL", name, "\n   ", e.message.split("\n")[0]); }
}

const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => problems.push("requestfailed: " + r.url()));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(base, { waitUntil: "networkidle" });

  const shown = async () => Number(/Showing (\d+) of/.exec(await page.textContent("#result-count"))[1]);

  await check("loads without console errors, page errors or failed requests", async () => {
    await page.waitForSelector(".card");
    assert.deepEqual(problems, []);
  });

  await check("counts are computed from the dataset", async () => {
    assert.equal(await shown(), total);
    assert.equal(await page.locator(".card").count(), total);
    const tiles = await page.locator(".tile-value").allTextContents();
    assert.equal(Number(tiles[0]), total);
    assert.equal(Number(tiles[1]), countWhere((a) => a.status === "GA"));
    assert.equal(Number(tiles[2]), countWhere((a) => a.status === "Public preview"));
  });

  await check("every card and table row exposes at least one source link", async () => {
    const bad = await page.$$eval(".card", (cards) => cards.filter((c) => c.querySelectorAll(".src-links a[href^='https://']").length === 0).length);
    assert.equal(bad, 0);
    const badRows = await page.$$eval("#table-wrap tbody tr", (rows) => rows.filter((r) => r.querySelectorAll(".src-links a[href^='https://']").length === 0).length);
    assert.equal(badRows, 0);
  });

  await check("search narrows results; no-match shows the empty state; reset restores", async () => {
    await page.fill("#f-query", "ontology");
    const n = await shown();
    assert.ok(n > 0 && n < total);
    await page.fill("#f-query", "zzzz-no-such-term");
    assert.equal(await shown(), 0);
    assert.equal(await page.isVisible("#empty-state"), true);
    await page.click("#empty-reset");
    assert.equal(await shown(), total);
    assert.equal(await page.inputValue("#f-query"), "");
    assert.equal(await page.isVisible("#empty-state"), false);
  });

  await check("search matches product names", async () => {
    await page.fill("#f-query", "Salesforce");
    assert.ok(await page.locator("#card-salesforce-data360-onelake").count() === 1);
    await page.click("#reset-filters");
  });

  await check("workload, availability and action filters work and combine", async () => {
    await page.selectOption("#f-status", "GA");
    assert.equal(await shown(), countWhere((a) => a.status === "GA"));
    const nonGa = await page.$$eval(".card .badge[class*='status-']", (b) => b.filter((x) => !x.textContent.includes("GA")).length);
    assert.equal(nonGa, 0);
    await page.selectOption("#f-category", "Microsoft Databases");
    assert.equal(await shown(), countWhere((a) => a.status === "GA" && a.category === "Microsoft Databases"));
    await page.click("#reset-filters");
    await page.selectOption("#f-action", "Pilot");
    assert.equal(await shown(), countWhere((a) => a.status === "Public preview"));
    await page.click("#reset-filters");
    await page.check("#f-conflict");
    assert.equal(await shown(), countWhere((a) => a.conflict));
    await page.click("#reset-filters");
    await page.selectOption("#f-assoc", "monthly");
    assert.equal(await shown(), countWhere((a) => a.assoc === "monthly"));
  });

  await check("reset filters clears every control", async () => {
    await page.fill("#f-query", "data");
    await page.selectOption("#f-status", "Coming soon");
    await page.click("#reset-filters");
    for (const id of ["#f-query", "#f-category", "#f-status", "#f-action", "#f-assoc"]) assert.equal(await page.inputValue(id), "");
    assert.equal(await page.isChecked("#f-conflict"), false);
    assert.equal(await shown(), total);
  });

  await check("expandable details toggle with aria-expanded; expand/collapse all", async () => {
    const btn = page.locator(".expand-btn").first();
    assert.equal(await btn.getAttribute("aria-expanded"), "false");
    const panel = page.locator(".panel").first();
    assert.equal(await panel.isVisible(), false);
    await btn.click();
    assert.equal(await btn.getAttribute("aria-expanded"), "true");
    assert.equal(await panel.isVisible(), true);
    await btn.click();
    assert.equal(await panel.isVisible(), false);
    await page.click("#expand-all");
    assert.equal(await page.locator(".panel:visible").count(), total);
    await page.click("#collapse-all");
    assert.equal(await page.locator(".panel:visible").count(), 0);
  });

  await check("keyboard: skip link first, expand button works with Enter/Space, focus is visible", async () => {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement.className);
    assert.equal(first, "skip-link", `first focus was ${first}`);
    const btn = page.locator(".expand-btn").first();
    await btn.focus();
    await page.keyboard.press("Enter");
    assert.equal(await btn.getAttribute("aria-expanded"), "true", "Enter should expand");
    await page.keyboard.press("Space");
    assert.equal(await btn.getAttribute("aria-expanded"), "false", "Space should collapse");
    const outline = await btn.evaluate((n) => getComputedStyle(n).outlineStyle);
    assert.notEqual(outline, "none");
  });

  await check("compact table view lists the filtered rows and sorts", async () => {
    await page.click("#view-table");
    assert.equal(await page.isVisible("#table-wrap"), true);
    assert.equal(await page.isVisible("#cards"), false);
    assert.equal(await page.locator("#table-wrap tbody tr").count(), total);
    await page.selectOption("#f-status", "GA");
    assert.equal(await page.locator("#table-wrap tbody tr").count(), countWhere((a) => a.status === "GA"));
    await page.click("#reset-filters");
    await page.click("#table-wrap [data-sort='title']");
    assert.equal(await page.getAttribute("#table-wrap th:first-child", "aria-sort"), "ascending");
    await page.click("#table-wrap [data-sort='title']");
    assert.equal(await page.getAttribute("#table-wrap th:first-child", "aria-sort"), "descending");
    await page.click("#view-cards");
    assert.equal(await page.isVisible("#cards"), true);
  });

  await check("priority cards link to the full card and expand it", async () => {
    await page.click("#reset-filters");
    await page.locator(".priority-card .link-btn").first().click();
    const open = await page.locator(".card .expand-btn[aria-expanded='true']").count();
    assert.equal(open, 1);
  });

  await check("executive section shows 8-12 priority cards with the required label", async () => {
    const n = await page.locator(".priority-card").count();
    assert.ok(n >= 8 && n <= 12);
    const labels = await page.locator(".priority-card .relevance strong").allTextContents();
    assert.ok(labels.every((l) => l.startsWith("Potential relevance for Farmers Insurance")));
  });

  await check("navigation anchors and in-page links resolve", async () => {
    const hrefs = await page.$$eval("a[href^='#']", (as) => as.map((a) => a.getAttribute("href")).filter((h) => h.length > 1));
    for (const h of hrefs) assert.equal(await page.locator(h).count(), 1, `missing ${h}`);
  });

  await check("theme toggle switches data-theme", async () => {
    await page.click("#theme-toggle");
    const t1 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.click("#theme-toggle");
    const t2 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    assert.notEqual(t1, t2);
  });

  await check("print layout: hides chrome and cards, shows priorities, table and sources", async () => {
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.isVisible(".site-header"), false);
    assert.equal(await page.isVisible(".toolbar"), false);
    assert.equal(await page.isVisible("#cards"), false);
    assert.equal(await page.isVisible("#table-wrap"), true);
    assert.equal(await page.isVisible("#priority-grid"), true);
    assert.equal(await page.isVisible("#sources-table"), true);
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    assert.ok(pdf.length > 20000);
    await page.emulateMedia({ media: "screen" });
  });

  const mobile = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const mp = await mobile.newPage();
  await mp.goto(base, { waitUntil: "networkidle" });

  await check("mobile: no horizontal page overflow; menu toggles by keyboard", async () => {
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `overflow ${overflow}px`);
    assert.equal(await mp.isVisible("#site-nav"), false);
    await mp.focus(".nav-toggle");
    await mp.keyboard.press("Enter");
    assert.equal(await mp.isVisible("#site-nav"), true);
    await mp.keyboard.press("Escape");
    assert.equal(await mp.isVisible("#site-nav"), false);
  });

  await check("mobile: table view scrolls inside its own region", async () => {
    await mp.click("#view-table");
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `overflow ${overflow}px`);
    const scrollable = await mp.$eval("#table-wrap", (n) => n.scrollWidth > n.clientWidth);
    assert.equal(scrollable, true);
  });

  await mobile.close();
  await ctx.close();
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} e2e checks passed`);
process.exit(failed ? 1 : 0);
