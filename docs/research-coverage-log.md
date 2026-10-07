# Research coverage log

Research cutoff: **2026-10-06**. Last verified: **2026-10-06**. Event: FabCon Europe / SQLCon Barcelona 2026 (2026-09-28 to 2026-10-01).

This log records what was reviewed, how, and what is unresolved. It does not claim exhaustive coverage. Counts of cataloged announcements are computed on the website from `data/announcements.json` and are deliberately not repeated here.

## Sources reviewed

| ID | Source | Published | How it was read | Used for |
| --- | --- | --- | --- | --- |
| S01 | Azure blog: FabCon and SQLCon 2026 in Barcelona (Arun Ulag) | 2026-09-28 | Direct fetch | Primary starting point; all workloads |
| S02 | Fabric Updates blog: Bringing governed analytics into the flow of work (Bogdan Crivat) | Not shown in retrieved text | Browser (HTTP 403 to scripts) | Fabric IQ, Copilot, Power BI, Warehouse, Data Engineering, governance |
| S03 | Power BI Updates blog: Power BI's next chapter (Mohammad Ali) | Not shown | Browser | Power BI app creation, semantic layer, Copilot |
| S04 | Fabric Updates blog: From prompt to production: What's new in Fabric Apps (Sachin Patney) | Not shown | Browser | Fabric Apps |
| S05 | Fabric Updates blog: What's new in Microsoft OneLake (Dipti Borkar) | Not shown | Browser | OneLake, mirroring, shortcuts, catalog, security, partners |
| S06 | Fabric Updates blog: Trusted AI starts with Microsoft Fabric, Real-Time Intelligence, and IQ (Yitzhak Kesselman) | Not shown | Browser | Real-Time Intelligence, Fabric IQ, ontology |
| S07 | Fabric Updates blog: Build, deploy, and govern Microsoft Fabric at scale (Kim Manis) | Not shown | Browser | Observability, capacity, billing, Git, governance |
| S08 | SQL Server blog: SQLCon Barcelona 2026 (Shireesh Thota) | 2026-09-28 | Direct fetch | Databases |
| S09 | SQL Server blog: SQL Server on Azure Local is now generally available (Raj Pochiraju) | 2026-09-28 | Direct fetch | SQL Server on Azure Local, licensing |
| S10 | Fabric September 2026 Feature Summary | Not shown | Browser | Monthly tier; Data Factory, Data Warehouse, RTI, Git, Data Engineering |
| S11 | Power BI September 2026 Feature Summary | Not shown | Browser | Monthly tier; Power BI, Copilot, agentic development |
| S12 | Microsoft Learn: What's new in Microsoft Fabric | Continuously updated | Direct fetch | Status cross-check (GA and preview tables) on 2026-10-06 |
| S13 | Microsoft Learn: Hyperscale service tier | n/a | Direct fetch | Spot check of vCore and storage limits |
| n/a | Reference website (community FabCon Europe 2026 site) | n/a | Browser | Inspiration for structure only; no facts, prose, code or assets used |

Community blog dates are not shown in the retrieved text (the pages display relative ages only), so announcement dates in the dataset are given only for the hero blog and the two SQL blogs. The Fabric community site, the Fabric blog host and `aka.ms` short links return HTTP 403 to non-browser clients.

## Categories covered

All eleven requested research categories were checked. Whether a category contains announcements is a finding, not an assumption.

| Research category | Reviewed | Notes |
| --- | --- | --- |
| Fabric IQ, ontologies, data agents, Microsoft Copilot | Yes | Fabric IQ in Copilot Chat and Cowork GA; Code integration coming soon; ontology and data agent previews |
| Power BI, semantic models, agentic app creation, Fabric Apps | Yes | Apps in Power BI timing differs between sources |
| OneLake, interoperability, shortcuts, sharing, mirroring | Yes | IQ sharing status differs between sources |
| Data Factory and ingestion/orchestration | Yes | Mostly from the September Fabric summary (monthly tier) |
| Data Engineering and Data Science | Yes | Data engineering agent (preview), Materialized Lake Views (GA) |
| Data Warehouse | Yes | GPU acceleration (preview), several GA workload features |
| Real-Time Intelligence | Yes | Copilot capabilities, Business Events GA, Activator, Maps |
| Governance, security, administration | Yes | Policies (preview), DLP Restrict Access (GA), outbound access protection |
| Observability, operations agents, capacity, billing | Yes | On-demand billing and F0 not yet available; surge protection status differs |
| Git integration, deployment, developer tooling | Yes | Deployment plans (preview), Git GA and preview items, MCP servers |
| Microsoft databases (SQL, PostgreSQL, Cosmos DB) | Yes | Database Hub, Hyperscale, SQL Server on Azure Local, Cosmos DB mirroring (network) |

Excluded as out of scope: spring FabCon 2026 and Build 2026 announcements, and earlier releases, unless a source explicitly tied an enhancement or availability change to this event. The Atlanta Database Hub introduction is referenced only as context for the Barcelona preview.

## Items reviewed but not individually cataloged

The September feature summaries contain many minor user-interface or incremental items. They were reviewed and not cataloged individually (examples): Lakehouse Explorer column resizing detail (grouped into the Spark connector item), Dataflow Gen2 minor ribbon and navigator changes, Power BI report ribbon and slicer formatting items, Excel export row limits, mobile page indicator, Teams card fields, and third-party custom visuals. One operational notice appears in the Power BI summary: the older Power BI Desktop file picker was deprecated, and from October, versions from March 2026 or earlier cannot save to OneDrive and SharePoint. It is a deprecation notice rather than an event announcement, so it is not in the catalog; confirm with Microsoft if relevant.

## Status discrepancies preserved

These are also shown on the affected cards and in the Sources section of the site.

- IQ sharing: hero blog "now in preview" vs OneLake blog "in preview soon". Treated as Preview coming soon; not in Learn at last check.
- Apps in Power BI: "preview in the coming weeks" (hero) vs Desktop experience "in the coming months" (Power BI blog).
- Microsoft 365 Copilot in Power BI and Fabric: "coming" (Analytics and Power BI blogs) vs preview (Power BI September summary).
- Database agents: "soon available in preview" (hero) vs preview (SQL blog, September summary, Learn).
- Workspace-level surge protection: "generally available soon" (platform blog) vs preview (Learn).
- OneLake catalog object browsing: "Generally Available" (platform blog) vs table discovery preview (Learn). Treated conservatively as preview.
- OneLake data in Azure Databricks: "supported in production" (OneLake blog) vs preview (Learn). Treated conservatively as preview.
- OneLake catalog Govern experience: GA (blog and Learn September rows) vs a "centralized data governance" entry in Learn's preview table.
- Spark runtime: Runtime 2.0 described with Spark 4.0 (Analytics blog) vs Spark 4.1 (September summary).
- Fabric Apps launch month: June 2026 (Fabric Apps blog) vs "Last May" (OneLake blog).
- Hyperscale vCores: "192 vCore" (hero) vs "160 and 192 vCore Premium-series" (SQL blog).
- Salesforce naming: "Data Cloud 360" (hero) vs "Data 360" (OneLake blog).

## Not found in Microsoft Learn "What's new" at the cutoff

IQ sharing, Salesforce Data 360 integration, on-demand billing and zero-provisioned capacity, OneLake catalog in Excel and Foundry, F4096 and F8192 SKUs, lakeFS shortcuts, Business Central mirroring, semantic views, Fabric on GCC High, Restrict from Copilot, and the ClickHouse workload. Their status rests on the announcing blogs.

## Unresolved gaps

1. Community blog publication dates are not available from the retrieved text.
2. The Microsoft Fabric roadmap, keynote and session recordings, and dedicated posts on Planning in Fabric, Data Factory and Data Warehouse were not reviewed. The Fabric blog index was not reachable by script, so event-tagged posts could not be enumerated.
3. Database and Azure items were verified against the announcing blogs, with only a spot check of the Hyperscale documentation.
4. The Microsoft Learn page for Fabric IQ in Microsoft 365 Copilot Cowork, referenced by the Power BI blog, was not located.
5. Licensing, pricing and regional availability are mostly not specified in the public sources and are not inferred.
6. Items with status "Not specified" lack an availability label in the retrieved text.

## Version 2 additions (September 2026 Fabric feature summary)

The v2 dataset (`v2/data/announcements.json`) adds one catalog entry per section of the **Fabric September 2026 Feature Summary** (S10), read in a browser on 2026-10-06, plus mapping entries where an existing event-blog entry already describes the section. The mapping is `meta.septemberToc` in the dataset and is displayed on the site. Each new entry's status follows the label in the section heading, cross-checked against Microsoft Learn "What's new in Microsoft Fabric" (GA table and preview table). Differences are shown on the card, for example:

- Custom SQL pools: the summary says GA; Learn lists the feature as a preview. Treated conservatively as preview.
- Eventstream new connectors: no label in the summary headline; Learn lists them as GA.
- Eventstream processing logs: no label in the summary headline; Learn lists related items as preview.

Power BI September 2026 feature summary: only the Copilot, agentic and modeling items are cataloged; report formatting, mobile and custom-visual items are not individually cataloged.

Descriptions are original summaries and may omit detail. Items with no matching Learn entry are marked "Source only" or "Not in Learn; source only".

## Link checks

`tools/check-links.mjs` checks every external source and documentation link. Learn and Microsoft documentation links returned success at the last run; the community blog pages return HTTP 403 to scripts and were confirmed by opening them in a browser during research.
