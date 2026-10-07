import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".txt", ".svg"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(root).filter((f) => TEXT.has(extname(f)) && !f.endsWith("safety.test.mjs"));

const SECRET_PATTERNS = [
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Azure/other key assignment", /\b(account|shared|access|api|secret|client)[-_ ]?(key|secret)\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}/i],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Bearer token", /\bBearer\s+[A-Za-z0-9._-]{20,}/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Connection string", /(Server|Data Source)=[^;]+;.*(Password|Pwd)=/i],
  ["SAS token", /[?&]sig=[A-Za-z0-9%]{20,}/],
  ["Password assignment", /\bpassword\s*[:=]\s*["'][^"']{4,}["']/i],
  ["Email address", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
  ["Phone number", /(?<![\w./-])\+?\d{1,2}[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w])/],
  ["Private IPv4", /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/],
];

const INTERNAL_PATTERNS = [
  ["Internal Microsoft host", /\b[\w-]+\.(corp|redmond)\.microsoft\.com\b|\bmsft\.net\b|\.sharepoint\.com\b|\bmicrosoft-my\.sharepoint\b|\bvisualstudio\.com\b|\bdev\.azure\.com\b|\.internal\b/i],
  ["Confidentiality marker", /\b(Microsoft Confidential|internal only|company confidential|NDA|under embargo)\b/i],
  ["Local user path", /C:\\Users\\|\/Users\/[a-z]+\//i],
  ["Localhost URL", /https?:\/\/(localhost|127\.0\.0\.1)/i],
];

test("secret scan: no credentials, keys, emails or phone numbers in the repository", () => {
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const [name, re] of SECRET_PATTERNS) {
      const m = re.exec(text);
      if (m) hits.push(`${relative(root, f)}: ${name}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("confidential-content scan: no internal hosts, markers or local paths", () => {
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const [name, re] of INTERNAL_PATTERNS) {
      if (name === "Localhost URL" && /^(tools|tests|docs|README)/.test(relative(root, f))) continue;
      const m = re.exec(text);
      if (m) hits.push(`${relative(root, f)}: ${name}: ${m[0]}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("all external links in the dataset point to public Microsoft hosts", () => {
  const allowed = [/(^|\.)microsoft\.com$/, /(^|\.)azure\.com$/];
  const urls = ["data", "v1/data"].flatMap((d) => {
    const data = JSON.parse(readFileSync(join(root, d, "announcements.json"), "utf8"));
    return [...data.sources.map((s) => s.url), ...data.announcements.flatMap((a) => a.docs.map((x) => x[1]))];
  });
  for (const u of urls) {
    const host = new URL(u).hostname;
    assert.ok(allowed.some((re) => re.test(host)), `unexpected host ${host} in ${u}`);
    assert.ok(!/\.sharepoint\.com|\/internal\b|msft\.net|\.corp\./i.test(u), `internal-looking URL ${u}`);
  }
});

test("sites do not imply endorsement and carry the disclaimer", () => {
  for (const dir of ["", "v1"]) {
    const html = readFileSync(join(root, dir, "index.html"), "utf8");
    const data = JSON.parse(readFileSync(join(root, dir, "data/announcements.json"), "utf8"));
    assert.match(data.meta.disclaimer, /not a contractual roadmap/i);
    assert.match(data.meta.disclaimer, /not an official (publication of )?Microsoft(,| or) /i);
    assert.match(html, /not an official publication of Microsoft(,| or) /i);
    assert.ok(!/officially endorsed|endorsed by (Microsoft|Farmers|Zurich)/i.test(html));
  }
});
