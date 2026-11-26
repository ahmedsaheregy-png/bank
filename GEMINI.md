# SAWYAN V3.0 — Constitutional Engineering Directive (Always-On)

> Canonical constitutional reference: `docs/الملف_التقني_للمطورين.md` (Decisions `D0–D30`, Strategic Pillars `S01–S10`, 22 Mandatory Test Types, Golden Vectors `V1–V10` & `GV01–GV10`).

## 1. Mandatory 8-Stage Execution Pipeline (Section 1.6 + Verified Auto-Publish)
1. **State-Lock & Spec Hydration:** Always read `specs/SAWYAN_STATE_LOCK.json` and `specs/ui_dom_rpc_manifest.json` before modifying code. Never rely on chat memory or compaction summaries.
2. **Contract-First Delta Lock:** Verify `data-spec-id` UI contracts, DB columns, and `Frozen Review Register` (`بنود_غير_متأكد_للمراجعة.md` — TOTP 60s Offline Member QR remains **FROZEN / FORBIDDEN**).
3. **DB & Authoritative Read-Model First (`D21`):** All calculations, placements, rollups, compensatory math, and pre-aggregated display fields must originate in `PostgreSQL` (`sawyan.*`), never in browser JavaScript.
4. **Single-Shell Clean Implementation (`D29`):**
   - **One canonical shell per role** (`index.html`, `member-dashboard/`, `merchant-dashboard/`, `admin-dashboard/`).
   - **Strictly forbidden:** Separate `Showcase / Demo` clones (`member-showcase.html`, `member-demo/`), runtime `if (IS_PROD)` data-source forks, operational `localStorage` state stores, hardcoded financial/member arrays, or layered function monkey-patching across `<script>` files.
   - Production (`/`) naturally renders zero-state directly from empty `sawyan.*` tables.
5. **Dual-Schema Atomic Sync (`D10`):** Identical codebase serves `/` (`sawyan`) and `/preview/` (`sawyan_demo`). Always run `database/sync_dual_site_mirror.py` after every frontend edit in `preview/`.
6. **Full-Stack, 5-Persona E2E, Full-Lifecycle Chaos & Visual Hard Gate (`D30` + Stage 18/19):** Deliver only after passing `database/verify_doc_sync.py`, `database/verify_dom_and_form_lint.py` (0 HTML5 `step`/`min` traps, 0 native `alert/confirm/prompt`, 0 fake auto-refs, Gate-11 cache-bust parity), `verify_all_golden_vectors.py`, `verify_stage8_academy_lms.py`, `verify_ui_and_visual_gates.py` (4 viewports: `1440×900`, `780×900`, `680×900`, `375×812` with `0px²` sidebar-content overlap and bi-directional `data-spec-id` parity), `database/verify_e2e_persona_journeys.py` (live headless Chromium 5-persona interactive form/bell/CTA verification), `database/verify_full_lifecycle_50_members_e2e.py` (50-member + 6-merchant + Day-15 payout + `0.00` accounting + Playwright Chaos suite, also scheduled every 24h in `.github/workflows/sawyan-nightly-lifecycle.yml` & every 6h `--canary` in `.github/workflows/sawyan-canary-6h.yml`), and `run_zero_defect_gate.py`.
7. **State-Lock & Living Docs Seal:** Update verified hashes/status in `specs/SAWYAN_STATE_LOCK.json`, preserve `visual_audit/` screenshots, and document every new feature, screen, or RPC in `docs/الملف_التقني_للمطورين.md` and `docs/وصف_الموقع_البناء_2.md`, then regenerate HTML docs via `database/sync_docs_html.py` (which automatically commits & pushes `docs/` to its separate private Git repo `docs/.git`, keeping `docs/` excluded from the public `bank` repo; you may also run `database/sync_private_docs_backup.py` directly after any `docs/` edit) and verify via `database/verify_doc_sync.py`.
8. **Golden Publishing Rule (Agree First -> Approve -> Auto-Publish + Mandatory Pending-Work Reminder):**
   - Agree with the Founder on the design/plan and show a clear Before/After comparison («كان إزاي وحيكون إيه») before modifying UI/features.
   - Once the Founder approves («موافق» / «نفذ»), immediately commit and push verified work via `D:\Python314\python.exe database/publish_verified_release.py -m "<conventional commit message>"` after all gates pass (pushing both public `bank` on `origin/main` and private `docs/.git`, never staging `docs/`, `.env*`, `visual_audit/`, or `database/backups/` in the public repo), and include the short commit SHA in the final response.
   - If finished work has NOT yet been approved for push, ask verbatim **«هل انت موافق على هذا وتطالبني بالرفع؟»**. If the Founder moves to another topic before approving, **MUST include a prominent `⏳ تنبيه مهم — شغل جاهز ومتفق عليه وينتظر موافقتك للرفع:` reminder in every subsequent reply** listing all completed unpushed items until he explicitly approves or cancels them. `database/stop_hook_gate.py` enforces clean git status at turn end (or reminds about pending unpushed work when awaiting approval).

## 2. Database Deployment & Security Invariants (CRITICAL)
- **NEVER run `database/deploy_v3_dual_schema.py` directly** — it executes `DROP SCHEMA IF EXISTS sawyan CASCADE; DROP SCHEMA IF EXISTS sawyan_demo CASCADE;`.
- Always deploy SQL idempotently in strict order so `07` re-applies `REVOKE ALL` least-privilege locks:
  `02 -> 06 -> 07 -> 08 -> 09 -> 10 -> 12 -> 14 -> 15 -> 16 -> 17 -> 18`.
- Keep all tokens (`SUPABASE_ACCESS_TOKEN`, GitHub PAT) strictly in memory; never write them to files, stdout, or `.git/config`.
- Preserve approved Stage 8 Academy LMS tables, RPCs, and UI (`database/12_stage8_academy_lms_foundation.sql`, `admin-academy-lms.js`) and the Admin Full Circular Tree Explorer (`database/15_admin_full_tree_rpc.sql`, `admin-tree-explorer.js`).

## 3. Terminology & Domain Guardrails
- Never use `كاشباك` / `كاش باك`, `SAWYAN BANK`, `التسويق الشبكي`, `-19.75$`, or `Rolling Reserve`. Use `عائدات الاستهلاك الاستثماري` / `صندوق الهدف الشهري` and `SAWYAN`.
- Legacy 2025 specs and V1/V2 prototypes live solely in `legacy_archive/` and must never be treated as active specifications or linked in production UI.

## 4. Product & Friction Judgment (Anti-Bloat Discipline)
1. **Who / When / If-Deleted (`المستخدم / اللحظة / أثر الحذف`):** Every new or modified UI screen, section, or CTA added to `docs/` must state who uses it, in which real-world moment, and what breaks if removed; elements lacking a clear real user + moment are immediate removal candidates.
2. **Challenge-Before-Obey (`التحدي قبل الطاعة`):** Never blindly build or preserve UI clutter solely because an older doc mentioned it — flag bloat, dead weight, or duplication to the founder with a Cut/Merge recommendation first.
3. **Out-of-Scope Delivery Observations (`لاحظته خارج نطاق المهمة`):** Every completed implementation/fix report must include at least 3 concrete product/UX observations noticed outside the immediate task (cut, merge, friction fix, or leapfrog idea).
4. **3-List Decision Card on Broad Requests:** When asked to «طوّر / افعل اللازم / مسح شامل», output a concise 3-list Decision Card (`✂️ حذف ودمج` / `🔧 تقليل الاحتكاك` / `🚀 أفكار متقدمة`) for quick founder sign-off before bulk edits. Use `.agent/workflows/product-ux-sweep.md` scoped to ONE portal per session.
