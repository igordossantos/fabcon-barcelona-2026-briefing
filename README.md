# FabCon Barcelona 2026 | Data, Analytics & AI Briefing

A curated briefing for Zurich Insurance Group and Farmers Insurance on announcements associated with FabCon Europe / SQLCon Barcelona 2026 (September 28 – October 1, 2026), including the September 2026 Microsoft Fabric feature summary.

Presenter: Igor Dos Santos | Cloud and AI Solutions Engineer, Microsoft.

This is a static website (HTML, CSS and JavaScript, no build step, no backend, no API keys). It is built from public Microsoft sources only. It is a curated briefing, **not** a contractual roadmap, availability commitment or licensing statement, and it is **not** an official publication of Microsoft, Zurich Insurance Group or Farmers Insurance.

## Versions

| Version | URL path | Source folder |
| --- | --- | --- |
| **Current** (Zurich Insurance Group and Farmers Insurance; merged priorities and catalog; September 2026 Fabric coverage; live selection tools) | `/` | repository root (`index.html`, `css/`, `js/`, `data/`) |
| **V1** (original Farmers Insurance briefing, kept unchanged) | `/v1/` | `v1/` |

## What is in the site

- Executive overview and six recurring themes.
- One merged list of announcement cards. Priority items come first, then every other announcement by workload. Each card shows tags, availability and suggested action, potential relevance, suggested next step, sources and expandable technical details.
- Search; filters for workload, availability, evidence tier, suggested action and source discrepancy; sort; reset; and a compact comparison table.
- Live-meeting tools: **Select for discussion** checkboxes, a floating **Keep selected only** button, per-item notes, Undo, export to Markdown and CSV, a share link that restores a selection, a presenter view, filter chips with live counts, and the `/` and `f` keyboard shortcuts. Selections and notes are stored only in the browser (`localStorage`); share links contain item IDs only, never notes.
- "Where the announcements may matter" below the catalog, mapping items to seven areas of interest.
- Every section of the September 2026 Microsoft Fabric feature summary is cataloged as its own entry, or mapped to an existing entry when the sources describe items together. The mapping is stored in `meta.septemberToc` and shown in Sources and methodology.
- Sources and methodology, coverage by workload, known gaps and preserved source discrepancies.
- Print-friendly styling: printing produces a handout with the overview, the table (with a notes column for selected items) and sources.

All totals shown on the page are computed from `data/announcements.json` in the browser. Nothing is hardcoded.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `css/styles.css` | Styles, dark theme, responsive layout, print styles |
| `js/app.js` | Rendering and interaction (reads the dataset, builds the DOM safely with `textContent`) |
| `js/logic.js` | Pure helpers (search, filters, sorting, dates) shared with the tests |
| `data/announcements.json` | The dataset: metadata, source registry, announcements |
| `docs/research-coverage-log.md` | Sources reviewed, categories covered, gaps |
| `tests/` | Node tests (dataset, logic, site, safety) and an optional Playwright end-to-end test |
| `tools/serve.mjs` | Tiny static server for local preview |
| `tools/check-links.mjs` | External source-link checker |
| `.github/workflows/pages.yml` | Test and deploy to GitHub Pages |

## Local preview

The page loads its data with `fetch`, so open it through a web server, not by double-clicking the file.

```powershell
node tools/serve.mjs 8080
# then open http://127.0.0.1:8080/
```

Any static server works (for example `python -m http.server`), but some Windows Python installs serve `.js` files with the wrong MIME type, which breaks ES modules. `tools/serve.mjs` avoids that.

## Tests

```powershell
npm test                 # dataset validity, duplicates, required fields, logic, asset paths, secret/confidential scan
npm run test:links       # checks every external source link (needs network)
npm install --no-save playwright-core
npm run test:e2e         # search, filters, reset, expand/collapse, keyboard, responsive, print
```

`npm test` runs on every push in the GitHub Actions workflow and must pass before deployment. The end-to-end test needs a Chromium-based browser (set `CHROME_PATH` if Playwright's browser is not installed). Community blog pages on `community.fabric.microsoft.com` and `aka.ms` short links return HTTP 403 to non-browser clients, so the link checker reports them as "bot-blocked"; open them in a browser to confirm.

## Research methodology

1. Start from the Azure blog hero post and follow its links to the workload blogs (Analytics, Power BI, Fabric Apps, OneLake, Real-Time Intelligence and IQ, Platform, SQLCon) and the September 2026 Fabric and Power BI feature summaries.
2. Record each announcement with its title, workload, explanation, announcement date (only when stated), availability as announced, availability verified at the research cutoff, exact status, prerequisites (only when documented), sources, and a suggested customer relevance and next step.
3. Cross-check status against Microsoft Learn "What's new in Microsoft Fabric" on the cutoff date. Where sources disagree, keep the discrepancy on the card and use the more conservative status.
4. Do not treat "announced", "coming soon" and "available now" as equivalent. Do not infer dates or licensing. "No additional AI token costs" is never read as "free".
5. Where a source says only "preview", the status is recorded as Public preview.
6. "Event blog" items come from the hero post or workload blogs for the event. "Monthly summary" items come from the September 2026 feature summaries that the hero post links as what else is new this month. Both are filterable.
7. "Potential relevance for Farmers Insurance" statements are suggested use cases only, not facts about Farmers' environment. No savings, ROI, performance or compliance outcomes are claimed.

Research cutoff: October 6, 2026. See `docs/research-coverage-log.md` for sources reviewed, coverage and gaps.

## V1 (`/v1/`)

The original Farmers Insurance briefing is kept unchanged in `v1/` with its own `index.html`, `css/`, `js/` and `data/announcements.json`, and is published at `<site>/v1/`. Its tests are in `tests/v1/` (`npm test` runs them; `npm run test:e2e:v1` runs its browser test, optionally against a deployed URL with `BASE_URL`). The current page's browser test is `npm run test:e2e`.

Updating the current page: edit `data/announcements.json` as described below. When the September summary or Microsoft Learn changes, update the matching entry's `status`, `ver` and the `septemberToc` mapping, then run `npm test`.

## Updating the briefing

All content updates happen in `data/announcements.json`. No code changes are needed for ordinary updates.

1. **Change a status.** Edit the item's `status` (one of `GA`, `Public preview`, `Private preview`, `Preview coming soon`, `Coming soon`, `Not specified`). The suggested action follows automatically from `meta.statusToAction`. Update `announced`, `ver` (verification code) and, if needed, `verNote` and `conflict`.
2. **Add an announcement.** Copy an existing object in `announcements`, give it a unique kebab-case `id`, and fill every field. `src` lists source IDs from the `sources` array, and `docs` lists `[label, url]` pairs. Use `"date": null` unless the source states a date.
3. **Add a source.** Append to `sources` with a new `S##` id, `short` label, URL, author and `date` (or `null`).
4. **Re-verify.** Update `meta.lastVerified` (and `meta.researchCutoff` for a new research pass) and re-check status against Microsoft Learn.
5. **Executive priorities.** Items with a numeric `priority` (1..N, unique, 8 to 12 items) and a `theme` appear in the Priorities section. `meta.relevanceAreas` maps catalog items to the seven areas of interest.
6. **Validate.** Run `npm test`. It checks JSON validity, duplicate ids and titles, required fields, status and verification consistency, source references, and a secret/confidential-content scan. Then run `npm run test:links`.
7. **Publish.** Commit and push to `main`. The workflow runs the tests and deploys.

Verification codes (`ver`): `learn-ga`, `learn-preview`, `no-learn`, `unchecked`, `roadmap`, `custom` (requires `verNote`).

## Deployment (GitHub Pages)

The site is published with GitHub Actions using the official Pages actions (`configure-pages`, `upload-pages-artifact`, `deploy-pages`). In the repository settings, Pages must use **Source: GitHub Actions**. With the GitHub CLI:

```powershell
gh api -X POST repos/<owner>/<repository>/pages -f build_type=workflow
```

Only `index.html`, `css/`, `js/`, `data/` and `v1/` are published; tests, tools and docs stay in the repository.

All asset paths are relative, so the site works on a project site such as `https://<user>.github.io/<repository>/`.

## Publication safety

- Only publicly available information is used. No internal documents, internal URLs, customer-confidential information, personal contact details or credentials are included. `tests/safety.test.mjs` scans for common secrets, emails, phone numbers, internal hosts and confidentiality markers.
- A published GitHub Pages site is public to anyone with the URL. A private repository alone does not make a Pages site private unless access control is explicitly configured and verified.
- The page sets `noindex`, which asks search engines not to list it. That is not access control.
- Product names are trademarks of their owners. The site does not use reference-site prose, code or assets; its structure and text are original.

## Reference inspiration

The presentation approach (grouping by workload, status labels, per-item source links) was informed by a community site for FabCon Europe 2026. This implementation, its summaries, code and design are original.
