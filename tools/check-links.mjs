// External source-link check for data/announcements.json.
// Usage: node tools/check-links.mjs
// Some Microsoft community pages return 403 to non-browser clients; those are reported as
// "blocked (verify in a browser)" rather than as failures.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "data/announcements.json"), "utf8"));
const BOT_BLOCKED_HOSTS = new Set(["community.fabric.microsoft.com", "blog.fabric.microsoft.com", "aka.ms"]);

const urls = new Map();
for (const s of data.sources) urls.set(s.url, `source ${s.id}`);
for (const a of data.announcements) for (const [label, url] of a.docs) if (!urls.has(url)) urls.set(url, `doc in ${a.id}`);

async function check(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (link-check; +briefing)", Accept: "text/html,*/*" },
    });
    return { url, status: res.status, final: res.url };
  } catch (err) {
    return { url, status: 0, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const queue = [...urls.keys()];
const results = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) results.push(await check(queue.shift()));
}));

let failures = 0, blocked = 0, ok = 0;
for (const r of results.sort((a, b) => a.url.localeCompare(b.url))) {
  const host = new URL(r.url).hostname;
  if (r.status >= 200 && r.status < 400) { ok++; continue; }
  if ((r.status === 403 || r.status === 429) && BOT_BLOCKED_HOSTS.has(host)) { blocked++; console.log(`BLOCKED ${r.status} ${r.url}  (verify in a browser)`); continue; }
  failures++;
  console.log(`FAIL ${r.status || r.error} ${r.url}  <- ${urls.get(r.url)}`);
}
console.log(`\n${urls.size} unique URLs: ${ok} ok, ${blocked} bot-blocked, ${failures} failed`);
process.exit(failures ? 1 : 0);
