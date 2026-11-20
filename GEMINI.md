# SAWYAN V3.0 — Constitutional Engineering Directive (Always-On)

> Canonical constitutional reference: `docs/الملف_التقني_للمطورين.md` (Decisions `D0–D30`, Strategic Pillars `S01–S10`, 22 Mandatory Test Types, Golden Vectors `V1–V10` & `GV01–GV10`).

## 1. Mandatory 7-Stage Execution Pipeline (Section 1.6)
1. **State-Lock & Spec Hydration:** Always read `specs/SAWYAN_STATE_LOCK.json` and `specs/ui_dom_rpc_manifest.json` before modifying code. Never rely on chat memory or compaction summaries.
2. **Contract-First Delta Lock:** Verify `data-spec-id` UI contracts, DB columns, and `Frozen Review Register` (`بنود_غير_متأكد_للمراجعة.md` — TOTP 60s Offline Member QR remains **FROZEN / FORBIDDEN**).
3. **DB & Authoritative Read-Model First (`D21`):** All calculations, placements, rollups, compensatory math, and pre-aggregated display fields must originate in `PostgreSQL` (`sawyan.*`), never in browser JavaScript.
4. **Single-Shell Clean Implementation (`D29`):**
   - **One canonical shell per role** (`index.html`, `member-dashboard/`, `merchant-dashboard/`, `admin-dashboard/`).
   - **Strictly forbidden:** Separate `Showcase / Demo` clones (`member-showcase.html`, `member-demo/`), runtime `if (IS_PROD)` data-source forks, operational `localStorage` state stores, hardcoded financial/member arrays, or layered function monkey-patching across `<script>` files.
   - Production (`/`) naturally renders zero-state directly from empty `sawyan.*` tables.
5. **Dual-Schema Atomic Sync (`D10`):** Identical codebase serves `/` (`sawyan`) and `/preview/` (`sawyan_demo`). Always run `database/sync_dual_site_mirror.py` after every frontend edit in `preview/`.
6. **Full-Stack & Visual Hard Gate (`D30`):** Deliver only after passing `database/verify_doc_sync.py`, `verify_all_golden_vectors.py`, `verify_stage8_academy_lms.py`, `verify_ui_and_visual_gates.py` (4 viewports: `1440×900`, `780×900`, `680×900`, `375×812` with `0px²` sidebar-content overlap and bi-directional `data-spec-id` parity), and `run_zero_defect_gate.py`.
7. **State-Lock & Living Docs Seal:** Update verified hashes/status in `specs/SAWYAN_STATE_LOCK.json`, preserve `visual_audit/` screenshots, and document every new feature, screen, or RPC in `docs/الملف_التقني_للمطورين.md` and `docs/وصف_الموقع_البناء_2.md`, then regenerate HTML docs via `database/sync_docs_html.py` and verify via `database/verify_doc_sync.py`.

## 2. Database Deployment & Security Invariants (CRITICAL)
- **NEVER run `database/deploy_v3_dual_schema.py` directly** — it executes `DROP SCHEMA IF EXISTS sawyan CASCADE; DROP SCHEMA IF EXISTS sawyan_demo CASCADE;`.
- Always deploy SQL idempotently in strict order so `07` re-applies `REVOKE ALL` least-privilege locks:
  `02 -> 06 -> 07 -> 08 -> 09 -> 10 -> 12 -> 14 -> 15`.
- Keep all tokens (`SUPABASE_ACCESS_TOKEN`, GitHub PAT) strictly in memory; never write them to files, stdout, or `.git/config`.
- Preserve approved Stage 8 Academy LMS tables, RPCs, and UI (`database/12_stage8_academy_lms_foundation.sql`, `admin-academy-lms.js`) and the Admin Full Circular Tree Explorer (`database/15_admin_full_tree_rpc.sql`, `admin-tree-explorer.js`).

## 3. Terminology & Domain Guardrails
- Never use `كاشباك` / `كاش باك`, `SAWYAN BANK`, `التسويق الشبكي`, `-19.75$`, or `Rolling Reserve`. Use `عائدات الاستهلاك الاستثماري` / `صندوق الهدف الشهري` and `SAWYAN`.
- Legacy 2025 specs and V1/V2 prototypes live solely in `legacy_archive/` and must never be treated as active specifications or linked in production UI.
