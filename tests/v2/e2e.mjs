// End-to-end checks for the v2 page. Optional dependency: npm install --no-save playwright-core
// Usage: node tests/v2/e2e.mjs            (starts a local server)
//        BASE_URL=https://<user>.github.io/<repo>/v2/ node tests/v2/e2e.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const data = JSON.parse(readFileSync(join(root, "v2/data/announcements.json"), "utf8"));
const total = data.announcements.length;
const where = (fn) => data.announcements.filter(fn).length;

let chromium;
try { ({ chromium } = await import("playwright-core")); } catch { console.error("Run: npm install --no-save playwright-core"); process.exit(2); }

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

const live = process.env.BASE_URL;
const port = 8992 + Math.floor(Math.random() * 500);
const server = live ? null : spawn(process.execPath, [join(root, "tools/serve.mjs"), String(port)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, live ? 0 : 800));
const base = live ?? `http://127.0.0.1:${port}/v2/index.html`;

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(true); console.log("PASS", name); }
  catch (e) { results.push(false); console.log("FAIL", name, "\n   ", e.message.split("\n")[0]); }
}

const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => problems.push("requestfailed: " + r.url()));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on("dialog", (d) => d.accept());
  await page.goto(base, { waitUntil: "networkidle" });
  const shown = async () => Number(/Showing (\d+) of/.exec(await page.textContent("#result-count"))[1]);
  const cards = () => page.locator("#cards .card");
  const pick = async (n) => { for (let i = 0; i < n; i++) await cards().nth(i).locator("input[type=checkbox]").check(); };

  await check("loads cleanly; counts are computed from the dataset", async () => {
    await page.waitForSelector(".card");
    assert.deepEqual(problems, []);
    assert.equal(await shown(), total);
    assert.equal(await cards().count(), total);
    const tiles = await page.locator(".tile-value").allTextContents();
    assert.equal(Number(tiles[0]), total);
    assert.equal(Number(tiles[1]), where((a) => a.status === "GA"));
    assert.equal(Number(tiles[4]), data.meta.septemberToc.length);
  });

  await check("hero has no dates; subtitle names Zurich and Farmers", async () => {
    assert.equal(await page.locator(".hero .dates").count(), 0);
    assert.match(await page.textContent("#page-subtitle"), /Zurich Insurance Group and Farmers Insurance/);
    assert.equal(await page.locator("#briefing").count(), 0);
  });

  await check("priorities come first as cards with tags, relevance, next step and sources", async () => {
    const first = cards().first();
    assert.match(await first.textContent(), /Priority 1/);
    assert.equal(await page.locator(".card.is-priority").count(), where((a) => a.priority));
    for (const sel of [".badges .badge", ".relevance", ".next", ".card-links a[href^='https://']"]) assert.ok(await first.locator(sel).count() > 0, sel);
    assert.match(await first.locator(".relevance").textContent(), /Potential relevance for Zurich Insurance Group and Farmers Insurance/);
  });

  await check("every card exposes a source link and renders no stray 'null'", async () => {
    const bad = await page.$$eval("#cards .card", (cs) => cs.filter((c) => !c.querySelector(".src-links a[href^='https://']")).length);
    assert.equal(bad, 0);
    assert.equal(await page.$$eval("#cards .card", (cs) => cs.filter((c) => /\bnull\b|undefined/.test(c.textContent)).length), 0);
  });

  await check("'Where the announcements may matter' sits below the catalog", async () => {
    const a = await page.locator("#catalog").boundingBox(), b = await page.locator("#matters").boundingBox();
    assert.ok(b.y > a.y + a.height - 5);
  });

  await check("search, filters, action chips, sort and reset", async () => {
    await page.fill("#f-query", "copy job");
    const n = await shown(); assert.ok(n >= 5 && n < total);
    await page.click("#reset-filters"); assert.equal(await shown(), total);
    await page.selectOption("#f-status", "GA");
    assert.equal(await shown(), where((a) => a.status === "GA"));
    await page.click("#reset-filters");
    await page.click("#action-chips button:has-text('Pilot')");
    assert.equal(await shown(), where((a) => a.status === "Public preview"));
    await page.click("#reset-filters");
    await page.fill("#f-query", "zzzz-nothing");
    assert.equal(await shown(), 0); assert.ok(await page.isVisible("#empty-state"));
    await page.click("#empty-reset"); assert.equal(await shown(), total);
    await page.selectOption("#f-sort", "title");
    const titles = await page.$$eval("#cards .card h4", (h) => h.map((x) => x.textContent));
    assert.deepEqual(titles, [...titles].sort((x, y) => x.localeCompare(y)));
    await page.click("#reset-filters");
    assert.equal(await page.inputValue("#f-sort"), "recommended");
  });

  await check("selecting items shows the floating bar with a live count", async () => {
    assert.equal(await page.isVisible("#select-bar"), false);
    await pick(3);
    assert.equal(await page.isVisible("#select-bar"), true);
    assert.equal(await page.textContent("#select-count"), "3");
    assert.match(await page.textContent("#focus-toggle"), /Keep selected only \(3\)/);
    assert.equal(await page.locator("#cards .card.selected").count(), 3);
  });

  await check("floating button keeps only the selected items; show all restores", async () => {
    await page.click("#focus-toggle");
    assert.equal(await cards().count(), 3);
    assert.equal(await page.isVisible("#focus-banner"), true);
    assert.match(await page.textContent("#result-count"), /Showing 3 of 3 selected/);
    assert.match(await page.textContent("#focus-toggle"), /Show all items/);
    await page.click("#focus-toggle");
    assert.equal(await cards().count(), total);
    assert.equal(await page.isVisible("#focus-banner"), false);
  });

  await check("unticking in focus mode removes the card and Undo restores it", async () => {
    await page.click("#focus-toggle");
    await cards().first().locator("input[type=checkbox]").click();
    assert.equal(await cards().count(), 2);
    assert.equal(await page.isVisible("#undo-remove"), true);
    await page.click("#undo-remove");
    assert.equal(await cards().count(), 3);
    await page.click("#focus-toggle");
  });

  await check("selection and notes persist across a reload", async () => {
    const note = "Customer wants a pilot, owner: team A";
    const firstId = await cards().first().getAttribute("id");
    await page.locator(`#${firstId} textarea`).fill(note);
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.textContent("#select-count"), "3");
    assert.equal(await page.locator(`#${firstId} textarea`).inputValue(), note);
  });

  await check("export: CSV download carries notes; share link restores a focused list", async () => {
    await page.click("#focus-toggle");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
    const text = readFileSync(await dl.path(), "utf8");
    assert.match(text, /Customer wants a pilot/);
    assert.equal(text.trim().split(/\r?\n/).length, 4);
    const ids = await cards().evaluateAll((cs) => cs.map((c) => c.id.replace("card-", "")));
    const url = new URL(base); url.search = `?sel=${ids.join(",")}&focus=1`;
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => localStorage.clear());
    await p2.goto(url.toString(), { waitUntil: "networkidle" });
    assert.equal(await p2.locator("#cards .card").count(), 3);
    assert.equal(await p2.isVisible("#focus-banner"), true);
    await p2.close();
    await page.click("#focus-toggle");
  });

  await check("select all shown, then clear selection", async () => {
    await page.fill("#f-query", "ontology");
    const n = await shown();
    await page.click("#select-visible");
    assert.equal(Number(await page.textContent("#select-count")) >= n, true);
    await page.click("#clear-selection");
    assert.equal(await page.isVisible("#select-bar"), false);
    await page.click("#reset-filters");
  });

  await check("compact table view has synced checkboxes and sortable columns", async () => {
    await page.click("#view-table");
    assert.equal(await page.isVisible("#cards"), false);
    assert.equal(await page.locator("#table-wrap tbody tr").count(), total);
    await page.locator("#table-wrap tbody tr").first().locator("input[type=checkbox]").check();
    assert.equal(await page.textContent("#select-count"), "1");
    await page.click("#table-wrap [data-sort='status']");
    assert.equal(await page.inputValue("#f-sort"), "status");
    await page.click("#view-cards");
    assert.equal(await page.locator("#cards .card.selected").count(), 1);
    await page.click("#clear-selection");
    await page.click("#reset-filters");
  });

  await check("keyboard: '/' focuses search; Enter and Space operate the expand button", async () => {
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("/");
    assert.equal(await page.evaluate(() => document.activeElement.id), "f-query");
    await page.keyboard.press("Escape");
    const btn = page.locator(".expand-btn").first();
    await btn.focus();
    await page.keyboard.press("Enter");
    assert.equal(await btn.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Space");
    assert.equal(await btn.getAttribute("aria-expanded"), "false");
    const sel = page.locator(".select-box input").first();
    await sel.focus(); await page.keyboard.press("Space");
    assert.equal(await sel.isChecked(), true);
    await page.click("#clear-selection");
  });

  await check("September coverage table lists every summary section", async () => {
    await page.locator(".toc-details summary").click();
    assert.equal(await page.locator("#toc-table tbody tr").count(), data.meta.septemberToc.length);
  });

  await check("presenter view hides detail chrome and persists", async () => {
    await page.click("#present-toggle");
    assert.equal(await page.isVisible(".expand-btn >> nth=0"), false);
    assert.equal(await page.getAttribute("#present-toggle", "aria-pressed"), "true");
    await page.click("#present-toggle");
  });

  await check("print: chrome and cards hidden; table, notes column and sources shown", async () => {
    await pick(2);
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.isVisible(".site-header"), false);
    assert.equal(await page.isVisible("#select-bar"), false);
    assert.equal(await page.isVisible("#cards"), false);
    assert.equal(await page.isVisible("#table-wrap"), true);
    assert.equal(await page.isVisible("#table-wrap th.col-notes"), true);
    assert.equal(await page.isVisible("#table-wrap th.col-select"), false);
    assert.ok((await page.pdf({ format: "Letter", printBackground: true })).length > 20000);
    await page.emulateMedia({ media: "screen" });
    await page.click("#clear-selection");
  });

  await check("in-page anchors resolve and theme toggle works", async () => {
    const hrefs = await page.$$eval("a[href^='#']", (as) => as.map((a) => a.getAttribute("href")).filter((h) => h.length > 1));
    for (const h of hrefs) assert.equal(await page.locator(h).count(), 1, h);
    await page.click("#theme-toggle");
    assert.ok(["dark", "light"].includes(await page.evaluate(() => document.documentElement.dataset.theme)));
  });

  const mobile = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
  const mp = await mobile.newPage();
  await mp.goto(base, { waitUntil: "networkidle" });
  await check("mobile: no horizontal overflow; floating bar fits; table scrolls in its own region", async () => {
    const over = () => mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(await over() <= 1, "overflow before");
    await mp.locator("#cards .card input[type=checkbox]").first().check();
    assert.equal(await mp.isVisible("#select-bar"), true);
    const box = await mp.locator("#select-bar").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 376, `bar spills: ${JSON.stringify(box)}`);
    assert.ok(await over() <= 1, "overflow with bar");
    await mp.click("#view-table");
    assert.ok(await over() <= 1, "overflow in table view");
    assert.equal(await mp.$eval("#table-wrap", (n) => n.scrollWidth > n.clientWidth), true);
  });
  await mobile.close();
  await ctx.close();
} finally {
  await browser.close();
  server?.kill();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} v2 e2e checks passed`);
process.exit(failed ? 1 : 0);
