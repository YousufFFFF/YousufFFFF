<div align="center">

# Mohammed Yousuf Ansari

**Software Developer** · Frontend & Full-Stack · Open-Source Contributor · Pune, India

[![Portfolio](https://img.shields.io/badge/Portfolio-yousufffff.github.io-111827?style=flat-square&logo=googlechrome&logoColor=white)](https://yousufffff.github.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/mohammed-yousuf-ansari-935388342/)
[![Email](https://img.shields.io/badge/Email-ansariyousuf513%40gmail.com-111827?style=flat-square&logo=gmail&logoColor=white)](mailto:ansariyousuf513@gmail.com)
![Status](https://img.shields.io/badge/Open_to-Software_Developer_roles-16a34a?style=flat-square)

</div>

---

Software developer with **78 merged pull requests** in production open-source codebases — Apache Superset, Kubernetes SIGs, RISC-V International and the Mifos Initiative. I recently **completed the Mifos Summer of Code (MSOC) 2026 internship**, where I shipped the loan product creation experience for a fintech platform used by microfinance institutions in 40+ countries.

I work mainly in **TypeScript and Angular** on the frontend, with backend work in **Java / Spring Boot** and a data background from production analytics.

## Highlights

<!-- AUTO:SUMMARY:START -->
| Highlight | Details |
|:--|:--|
| **Software Intern, Mifos Initiative** | MSOC 2026, completed · delivered the UI Product Templates project for a fintech platform used in 40+ countries, including **13 loan product templates** · [PRs](#mifos-x-web-app) |
| **78 merged pull requests** | Across five open-source organizations · [view all](https://github.com/search?q=author%3AYousufFFFF+type%3Apr+is%3Amerged&type=pullrequests) |
| **Apache Superset** · 75K ★ | Fixes in the ECharts & deck.gl rendering internals, shipped in `v6.0` · [PRs](#apache-superset) |
| **Kubernetes SIGs** · Headlamp 7K ★ | Merged into the CNCF web UI for managing Kubernetes clusters · [PRs](#headlamp-kubernetes-sigs) |
| **RISC-V International** | Merged into the official machine-readable ISA specification database · [PRs](#risc-v-unified-database) |
| **Mifos X Tenantmanagement Plugin** | 7 merged PRs · [PRs](#mifos-x-tenantmanagement-plugin) |
<!-- AUTO:SUMMARY:END -->

## Experience

**Software Intern — Mifos Initiative** (Mifos Summer of Code 2026)<br/>
<sub>May – Aug 2026 · Completed · Angular, TypeScript, Java, Apache Fineract</sub>

- Built the loan product creation flow for the Mifos X web app: a landing page and a 7-step Angular Material stepper with a human-readable review step
- Designed hidden-defaults payload logic so products submit valid API payloads without exposing every field to the user
- Delivered a library of **13 loan product templates** — BNPL, gold, auto, JLG, home, mortgage, consumer durable and more
- Added white-label tenant theming end to end: web UI plus the Fineract backend endpoints behind it
- **61 merged PRs** across the Mifos web app and Fineract plugins; still contributing after the internship (tenant management UI and plugin)

**Open-Source Contributor — Apache Superset**<br/>
<sub>Nov 2025 – present · TypeScript, React, ECharts, deck.gl</sub>

- Fixes in the ECharts and deck.gl plugin internals of a 75K-star BI platform, shipped in `v6.0`
- Resolved a WebGL freeze in the deck.gl contour layer and duplicate / colliding legends in timeseries charts

**Data Analyst — Inspacco**<br/>
<sub>6 months · SQL, Python, dashboards</sub>

- Built operational dashboards for facility-management clients and standardized schemas across inconsistent data sources

## Tech Stack

| Area | Technologies |
|:--|:--|
| **Languages** | TypeScript, JavaScript, Python, Java, SQL, C++ |
| **Frontend** | Angular, Angular Material, React, ECharts, deck.gl |
| **Backend** | Spring Boot, Node.js, Django, REST APIs |
| **Data & Tools** | PostgreSQL, Redis, Docker, Git, Pandas, scikit-learn, Apache Superset |

## Open-Source Contributions

<!-- AUTO:TABLES:START -->
### Mifos X Web App

| PR | What it did | Merged |
|:--|:--|:--|
| [#4047](https://github.com/openMF/web-app/pull/4047) | **WEB-1269** — Fix remaining translation defects missed by WEB-1266 | Sep 2026 |
| [#4041](https://github.com/openMF/web-app/pull/4041) | **WEB-1266** — Fix translation defects across all 13 locale catalogues | Sep 2026 |
| [#4036](https://github.com/openMF/web-app/pull/4036) | **WEB-1252** — Add tenant creation, editing and lifecycle actions | Sep 2026 |
| [#4035](https://github.com/openMF/web-app/pull/4035) | **WEB-1242** — Add the tenant management administration UI | Sep 2026 |
| [#4025](https://github.com/openMF/web-app/pull/4025) | **WEB-1248** — Keep typed decimals in the loan application principal | Sep 2026 |
| [#4012](https://github.com/openMF/web-app/pull/4012) | **WEB-1246** — Keep the operator on their step and show per-step status in the guided wizard | Sep 2026 |
| [#4011](https://github.com/openMF/web-app/pull/4011) | **WEB-1245** — Allow decimal nominal interest rate when creating a loan account | Sep 2026 |

<details>
<summary>Show 54 more Mifos PRs</summary>
<br/>

| PR | What it did | Merged |
|:--|:--|:--|
| [#3998](https://github.com/openMF/web-app/pull/3998) | **WEB-1241** — Add guarantors as a tab under the loan account box | Sep 2026 |
| [#3994](https://github.com/openMF/web-app/pull/3994) | **WEB-1239** — Render the Eclipse BIRT report preview | Sep 2026 |
| [#3992](https://github.com/openMF/web-app/pull/3992) | **WEB-1237** — Restore guarantor management on loan accounts | Sep 2026 |
| [#3984](https://github.com/openMF/web-app/pull/3984) | **WEB-1226** — Download any document, and preview xlsx and csv files | Sep 2026 |
| [#3982](https://github.com/openMF/web-app/pull/3982) | **WEB-1231** — Name the guided interest rate and grace fields for what they measure | Sep 2026 |
| [#3976](https://github.com/openMF/web-app/pull/3976) | **WEB-1222** — Fix PDF document preview rendering blank | Sep 2026 |
| [#3969](https://github.com/openMF/web-app/pull/3969) | **WEB-1220** — Show charges, allocations and cycle variations on the guided review | Sep 2026 |
| [#3966](https://github.com/openMF/web-app/pull/3966) | **WEB-1217** — Stop the newest word re-animating when a token changes nothing on screen | Sep 2026 |
| [#3963](https://github.com/openMF/web-app/pull/3963) | **WEB-1216** — Steady the follow-up chips, show turn progress, stop the rail covering the conversation | Sep 2026 |
| [#3960](https://github.com/openMF/web-app/pull/3960) | **WEB-1215** — Translate the guided loan product wizard chrome | Sep 2026 |
| [#3959](https://github.com/openMF/web-app/pull/3959) | **WEB-1214** — Improve Copilot launcher, thinking/streaming states and output export | Sep 2026 |
| [#3951](https://github.com/openMF/web-app/pull/3951) | **WEB-1212** — Hide the duplicate Previous/Next row on the Accounting step | Sep 2026 |
| [#3946](https://github.com/openMF/web-app/pull/3946) | **WEB-1209** — Explain why the guided loan product wizard cannot submit | Sep 2026 |
| [#3944](https://github.com/openMF/web-app/pull/3944) | **WEB-1201** — Improve Copilot reasoning and response UX | Sep 2026 |
| [#3937](https://github.com/openMF/web-app/pull/3937) | **WEB-1199** — Validate numeric input in the guided loan product wizard | Sep 2026 |
| [#3936](https://github.com/openMF/web-app/pull/3936) | **WEB-1198** — Source delinquency bucket options from the tenant template | Aug 2026 |
| [#3934](https://github.com/openMF/web-app/pull/3934) | **WEB-1196** — Source loan product template currency options from the tenant template | Aug 2026 |
| [#3930](https://github.com/openMF/web-app/pull/3930) | **WEB-1190** — Host Classic step components in the Custom/Advanced loan product wizard | Aug 2026 |
| [#3925](https://github.com/openMF/web-app/pull/3925) | **WEB-1189** — Repair search spec selectors for IME regression test | Aug 2026 |
| [#3890](https://github.com/openMF/web-app/pull/3890) | **WEB-1167** — Correct installment multiple default and localize product card descriptions | Aug 2026 |
| [#3884](https://github.com/openMF/web-app/pull/3884) | **WEB-1162** — Implement Loan vs Securities / FD product template | Aug 2026 |
| [#3878](https://github.com/openMF/web-app/pull/3878) | **WEB-1159** — Implement Credit Card EMI loan product template | Aug 2026 |
| [#3874](https://github.com/openMF/web-app/pull/3874) | **Consumer Durable template** — latest addition to the loan product library | Aug 2026 |
| [#3866](https://github.com/openMF/web-app/pull/3866) | **JLG template** — Joint Liability Group lending, core to group microfinance | Aug 2026 |
| [#3863](https://github.com/openMF/web-app/pull/3863) | **Auto loan template** — vehicle financing product | Aug 2026 |
| [#3856](https://github.com/openMF/web-app/pull/3856) | **Gold loan template** — collateral-backed lending product | Aug 2026 |
| [#3855](https://github.com/openMF/web-app/pull/3855) | **WEB-1143** — Call /branding only when production mode is enabled | Aug 2026 |
| [#3840](https://github.com/openMF/web-app/pull/3840) | **Home & mortgage products** — long-tenure secured lending templates | Aug 2026 |
| [#3838](https://github.com/openMF/web-app/pull/3838) | **Theme translation & brand colours** — localized theme page with custom hex support | Aug 2026 |
| [selfservice-plugin #188](https://github.com/openMF/selfservice-plugin/pull/188) | **Backend — tenant theming API** — Fineract plugin endpoints for branding & custom colours | Aug 2026 |
| [#3831](https://github.com/openMF/web-app/pull/3831) | **WEB-1120** — Show translated Deferred income tab label | Aug 2026 |
| [#3830](https://github.com/openMF/web-app/pull/3830) | **BNPL product template** — implemented the Buy Now Pay Later loan product | Aug 2026 |
| [#3817](https://github.com/openMF/web-app/pull/3817) | **WEB-1113** — Improve theme consistency for loan product creation wizard | Aug 2026 |
| [#3804](https://github.com/openMF/web-app/pull/3804) | **WEB-1108** — Read tenant branding without credentials | Aug 2026 |
| [#3784](https://github.com/openMF/web-app/pull/3784) | **Theme management** — tenant-level theming page for white-labelled deployments | Aug 2026 |
| [selfservice-plugin #184](https://github.com/openMF/selfservice-plugin/pull/184) | **Backend — tenant branding API** — Fineract plugin endpoint serving branding to client apps | Aug 2026 |
| [#3781](https://github.com/openMF/web-app/pull/3781) | **WEB-1006** — Feat: move backend info to System Information | Aug 2026 |
| [#3780](https://github.com/openMF/web-app/pull/3780) | **WEB-1083** — Docs: document MIFOS_PRODUCTION_MODE behavior | Jul 2026 |
| [#3764](https://github.com/openMF/web-app/pull/3764) | **New loan products** — Two Wheeler, Education and Agricultural templates | Jul 2026 |
| [#3711](https://github.com/openMF/web-app/pull/3711) | **WEB-1031** — Improve loan product creation UI and localization | Jul 2026 |
| [#3701](https://github.com/openMF/web-app/pull/3701) | **Product Templates launch** — landing page with personal & advance loan flows | Jul 2026 |
| [#3535](https://github.com/openMF/web-app/pull/3535) | **WEB-918** — Fix savings application edit flow | Apr 2026 |
| [#3466](https://github.com/openMF/web-app/pull/3466) | **WEB-134** — Fix floating rates creation bugs | Apr 2026 |
| [#3451](https://github.com/openMF/web-app/pull/3451) | **WEB-100** — Update account state messages to 'Found' across all languages | Mar 2026 |
| [#3389](https://github.com/openMF/web-app/pull/3389) | **WEB-865** — Add translations for permission names using ngx-translate | Mar 2026 |
| [#3385](https://github.com/openMF/web-app/pull/3385) | **WEB-859** — Follow-up update after review feedback | Mar 2026 |
| [#3381](https://github.com/openMF/web-app/pull/3381) | **WEB-859** — Update Role Permission Search Field | Mar 2026 |
| [#3380](https://github.com/openMF/web-app/pull/3380) | **WEB-38** — Fix guarantors page data display and update breadcrumb to Loans | Mar 2026 |
| [#3379](https://github.com/openMF/web-app/pull/3379) | **WEB-849** — Replace reschedule date picker with installment dropdown and fix spacing | Mar 2026 |
| [#3276](https://github.com/openMF/web-app/pull/3276) | **WEB-222** — Family Members in Create Client stepper preview page not rendered correctly. | Mar 2026 |
| [#3263](https://github.com/openMF/web-app/pull/3263) | **WEB-804** — Support compact numeric date input parsing | Mar 2026 |
| [#3238](https://github.com/openMF/web-app/pull/3238) | **WEB-802** — Document password configuration variables in README | Feb 2026 |
| [#3237](https://github.com/openMF/web-app/pull/3237) | **WEB-801** — Upgrade minor versions of WebApp dependencies | Feb 2026 |
| [#3234](https://github.com/openMF/web-app/pull/3234) | **WEB-628** — Standardize password minimum length validation and error handling | Feb 2026 |

</details>

### Apache Superset

| PR | What it did | Merged |
|:--|:--|:--|
| [#38126](https://github.com/apache/superset/pull/38126) | **Time shift handling** — corrected time-shift logic in Timeseries transformProps | Jul 2026 |
| [#37244](https://github.com/apache/superset/pull/37244) | **WebGL freeze fix** — clamped & auto-scaled `cellSize` in deck.gl contour to prevent GPU hangs | Jan 2026 |
| [#37217](https://github.com/apache/superset/pull/37217) | **Legend dedup** — killed duplicate legend entries in mixed timeseries charts | Jan 2026 |
| [#36306](https://github.com/apache/superset/pull/36306) | **Scroll legend** — stopped label collisions in horizontal ECharts layouts | Dec 2025 |
| [#36264](https://github.com/apache/superset/pull/36264) | **Docs** — clarified duplicate report delivery for Alerts & Reports | Nov 2025 |

### Headlamp (Kubernetes SIGs)

[Headlamp](https://github.com/kubernetes-sigs/headlamp) is the CNCF / Kubernetes SIGs web UI for managing clusters — fully-featured, user-friendly and extensible.

| PR | What it did | Merged |
|:--|:--|:--|
| [#7363](https://github.com/kubernetes-sigs/headlamp/pull/7363) | Frontend: plugins: Only fetch the active locale for plugin i18n | Aug 2026 |
| [#6844](https://github.com/kubernetes-sigs/headlamp/pull/6844) | **Node shell error surfacing** — made pod creation failures visible in NodeShellTerminal instead of failing silently | Aug 2026 |

### RISC-V Unified Database

The official machine-readable database of the RISC-V ISA specification, maintained by RISC-V International — it generates the ISA manuals, compliance tests and tooling used across the ecosystem.

| PR | What it did | Merged |
|:--|:--|:--|
| [#2578](https://github.com/riscv/riscv-unified-db/pull/2578) | Data: correct Sv32 page table level count from 3 to 2 | Sep 2026 |
| [#2577](https://github.com/riscv/riscv-unified-db/pull/2577) | Data: make Zbc require Zbkc and define clmul/clmulh in Zbkc | Sep 2026 |
| [#2264](https://github.com/riscv/riscv-unified-db/pull/2264) | **Floating-point CSR pseudoinstructions** — added `fscsr`, `fsrm` and `fsflags` to the `csrrw` instruction definition | Jul 2026 |

### Mifos X Tenantmanagement Plugin

| PR | What it did | Merged |
|:--|:--|:--|
| [#7](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/7) | **MX-421** — Classify database connection failures and probe the server | Sep 2026 |
| [#6](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/6) | **MX-419** — Document the tenant management plugin | Sep 2026 |
| [#5](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/5) | **MX-418** — Add tenant update, status changes and removal | Sep 2026 |
| [#4](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/4) | **MX-417** — Add tenant creation, provisioning and the administration audit trail | Sep 2026 |
| [#3](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/3) | **MX-416** — Add super master security and the read-only tenant registry API | Sep 2026 |
| [#2](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/2) | **MX-415** — Upgrade to Java 25 and Spring Boot 4.1 | Sep 2026 |
| [#1](https://github.com/openMF/mifos-x-tenantmanagement-plugin/pull/1) | **MX-410** — Add Maven build, CI and contributor docs | Sep 2026 |
<!-- AUTO:TABLES:END -->

## GitHub Activity

<div align="center">

<img height="165" src="https://github-profile-summary-cards.vercel.app/api/cards/stats?username=YousufFFFF&theme=github_dark" alt="GitHub stats"/>
<img height="165" src="https://streak-stats.demolab.com?user=YousufFFFF&theme=github-dark-blue&hide_border=true" alt="GitHub streak"/>

</div>

---

<div align="center">

**Open to software developer internships and full-time roles** — frontend, full-stack and data-heavy products.<br/>
[yousufffff.github.io](https://yousufffff.github.io) · [LinkedIn](https://www.linkedin.com/in/mohammed-yousuf-ansari-935388342/) · [ansariyousuf513@gmail.com](mailto:ansariyousuf513@gmail.com)

</div>
