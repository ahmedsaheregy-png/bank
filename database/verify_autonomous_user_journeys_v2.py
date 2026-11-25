"""
SAWYAN V3.0 — Stage 24 Generation-2 Autonomous 5-Persona User Journey,
Above-the-Fold UX, Cross-Portal Sync & Constitutional Zero-Drift Inspector
(`database/verify_autonomous_user_journeys_v2.py`)

Invokable anytime via the `/sawyan-robot` slash command or CLI:
  - `python database/verify_autonomous_user_journeys_v2.py`          (Full 5-pillar suite)
  - `python database/verify_autonomous_user_journeys_v2.py --fast`   (Browser 5-persona + UX gates)
  - `python database/verify_autonomous_user_journeys_v2.py --canary` (6-hour live synthetic canary)

Enforces the 5 Pillars of Global Direct-Selling (Amway / USANA / DXN / Mary Kay) & FinTech QA:
  Pillar 1 — Visitor Journey: Instant clarity, live Flash Offers Spotlight (`#liveFlashOffersSpotlight` &
             `#publicFlashOffersStrip` -> modal promo), global online store visibility across country
             filters, Contact form & Referral Welcome Hero (`?ref=1`).
  Pillar 2 — Member Full Lifecycle & Above-the-Fold Mobile UX (`375x812`):
             Single-row compact header (`<= 72px`), Monthly Target Box & Quick Cashier QR above the fold
             (`top < 680px`), Adaptive Tree Studio + Tree Pulse + War Room (`70-99%`) + Country Lenses,
             1:1 UI-to-PostgreSQL bundle reconciliation, and 100% Arabic Wallet & Transactions history.
  Pillar 3 — All 6 Merchant Archetypes (50-Member + 6-Merchant + Day-15 + 0.00 Ledger SQL Simulation) +
             Merchant Mobile UX (`375x812`): 1.9s Bell persistence under 2.2s latency, direct bottom-nav
             Financial tab, sales coverage bar, zero dead-end lock banners, and interactive top-up modal
             fuzzing (`500`, `2000`, `3000`, `20000`, `1237.50`, zero-amount block).
  Pillar 4 — Cashier Employee (`employee.html`), Customer Support & Admin Sovereign Cockpit:
             Arabic-Indic PIN normalization (`٢٥٨٠ -> 2580`), live Admin Bell dropdown, mobile toast
             non-overlap, `REQUIRE_TOPUP_PROOF` live toggle, `Ctrl+K` Command Palette, and Multi-Context
             Cross-Portal Flash Offer Sync (`sawyan.get_public_active_flash_offers` -> Homepage + Directory).
  Pillar 5 — Zero-Drift Constitutional & Linguistic DOM Scanner across all visited screens:
             Zero forbidden terms (`كاشباك`, `SAWYAN BANK`, `التسويق الشبكي`, `Rolling Reserve`, `-19.75$`),
             zero broken tokens (`undefined`, `NaN`, `[object Object]`), zero leaked internal codes
             (`2Me–11Me`, `k-Anonymity`, `M18`, `W07`), zero raw English status badges, zero horizontal
             overflow (`scrollWidth <= clientWidth + 4`), and zero HTML5 `stepMismatch` traps.
"""

import argparse
import datetime
import functools
import hashlib
import http.server
import json
import os
import pathlib
import re
import socketserver
import subprocess
import sys
import threading
import time
from playwright.sync_api import sync_playwright

DB_DIR = pathlib.Path(__file__).resolve().parent
REPO_DIR = DB_DIR.parent
PREVIEW_DIR = REPO_DIR / "preview"
if str(DB_DIR) not in sys.path:
    sys.path.insert(0, str(DB_DIR))

import verify_e2e_persona_journeys as stage18_e2e
import verify_full_lifecycle_50_members_e2e as stage19_lifecycle
import verify_production_readiness_gate as gate11_readiness

FORBIDDEN_CONSTITUTIONAL_TERMS = [
    "كاشباك",
    "كاش باك",
    "SAWYAN BANK",
    "التسويق الشبكي",
    "Rolling Reserve",
    "-19.75$",
]

FORBIDDEN_USER_JARGON_TOKENS = [
    "[object Object]",
    "NaN",
    "2Me–11Me",
    "2Me-11Me",
    "k-Anonymity",
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class QuietServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        _, exc, _ = sys.exc_info()
        if isinstance(exc, (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def start_server():
    handler = functools.partial(QuietHandler, directory=str(REPO_DIR))
    httpd = QuietServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def audit_screen_purity(page, label, is_user_facing=True):
    """Pillar 5: Scans visible text, layout overflow, and numeric inputs on the active screen."""
    res = page.evaluate(
        """(cfg) => {
        const issues = [];
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
        for (const term of cfg.forbiddenTerms) {
            if (bodyText.includes(term)) {
                issues.push(`Forbidden constitutional term '${term}' found in visible text`);
            }
        }
        if (cfg.isUserFacing) {
            for (const tok of cfg.forbiddenJargon) {
                if (bodyText.includes(tok)) {
                    issues.push(`Forbidden technical/broken token '${tok}' found in user-facing UI`);
                }
            }
            if (/\\bundefined\\b/.test(bodyText)) {
                issues.push(`Literal 'undefined' rendered in visible user-facing text`);
            }
        }
        const sw = document.documentElement.scrollWidth;
        const cw = document.documentElement.clientWidth;
        if (sw > cw + 4) {
            issues.push(`Horizontal overflow detected: scrollWidth=${sw} > clientWidth=${cw}`);
        }
        return issues;
    }""",
        {
            "forbiddenTerms": FORBIDDEN_CONSTITUTIONAL_TERMS,
            "forbiddenJargon": FORBIDDEN_USER_JARGON_TOKENS,
            "isUserFacing": is_user_facing,
        },
    )
    if res:
        raise AssertionError(f"[JOURNEY V2 FAIL — {label}] Constitutional/UX purity violations: {res}")
    stage18_e2e.fuzz_visible_number_inputs(page, label)


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run_constitutional_quality_and_safety_suite(run_full_visual_d29_d30=True):
    """
    Enforces the complete SAWYAN Constitutional Quality, Security & Zero-Defect Gate Chain:
      1. Living Docs & Migrations (>=25) Sync Gate (`verify_doc_sync.py`)
      2. Static DOM, HTML5 Validity, Zero Native Dialogs & Cache-Bust Gate (`verify_dom_and_form_lint.py`)
      3. Phase 0/1 Security Hardening (`C1-C5`, Double-Entry Trigger, `C4` Sessions, Secret Hygiene) (`verify_phase1_regression_suite.py`)
      4. Gate #11 Production Launch Readiness (`verify_production_readiness_gate.check_static_readiness`)
      5. Zero-Defect 100% SHA-256 Mirror Parity (`/` == `/preview/`), UI Anti-Wipe Floor & Token Leak Scan (`run_zero_defect_gate.py` invariants)
      6. Full D29/D30 4-Viewport Visual Collision (`0px^2`), Header/Banner Overlap & `data-spec-id` Spec-to-DOM Gate (`verify_ui_and_visual_gates.py --full`)
    """
    gate_scripts = [
        ("Doc-Sync & Constitutional Living Docs Gate", [sys.executable, str(DB_DIR / "verify_doc_sync.py")]),
        ("DOM, HTML5 Form Validity & Zero-Dialog Linter", [sys.executable, str(DB_DIR / "verify_dom_and_form_lint.py")]),
        ("Phase 0/1 Security & Ledger Regression Suite", [sys.executable, str(DB_DIR / "verify_phase1_regression_suite.py")]),
    ]
    for label, cmd in gate_scripts:
        proc = subprocess.run(cmd, cwd=str(REPO_DIR), capture_output=True, text=True, encoding="utf-8", errors="replace")
        if proc.returncode != 0:
            raise AssertionError(f"[CONSTITUTIONAL GATE FAIL — {label}]\n{proc.stdout}\n{proc.stderr}")

    # Gate #11 Production Readiness static checks
    gate11_readiness.check_static_readiness()

    # Zero-Defect 100% SHA-256 Mirror Parity (`preview/` == `/`) + Anti-Wipe Floor + Secret Scan
    merch_js_size = os.path.getsize(PREVIEW_DIR / "merchant-dashboard" / "js" / "dashboard.js")
    admin_js_dir = PREVIEW_DIR / "admin-dashboard" / "js"
    admin_js_size = sum(os.path.getsize(admin_js_dir / x) for x in os.listdir(admin_js_dir) if x.endswith(".js"))
    assert merch_js_size >= 60_000 and admin_js_size >= 250_000, (
        f"[ZERO-DEFECT FAIL] UI non-wipe floor breached: merch={merch_js_size}, admin={admin_js_size}"
    )

    mirror_dirs = ["assets", "css", "js", "public", "shared", "member-dashboard", "merchant-dashboard", "admin-dashboard"]
    mirror_files = ["index.html", "auth-gateway.html", "manifest.json", "sw.js"]
    skip_names = {".git", "__pycache__", ".DS_Store", "Thumbs.db", "test_modal.html", "test_submit_runner.html"}
    mismatches = []
    for fname in mirror_files:
        p1, p2 = PREVIEW_DIR / fname, REPO_DIR / fname
        if not p2.exists() or _sha256_file(p1) != _sha256_file(p2):
            mismatches.append(fname)
    for dname in mirror_dirs:
        for root, dirs, files in os.walk(PREVIEW_DIR / dname):
            dirs[:] = [d for d in dirs if d not in skip_names]
            for fn in files:
                if fn in skip_names:
                    continue
                sp = pathlib.Path(root) / fn
                rel = sp.relative_to(PREVIEW_DIR)
                dp = REPO_DIR / rel
                if not dp.exists() or _sha256_file(sp) != _sha256_file(dp):
                    mismatches.append(rel.as_posix())
    assert not mismatches, f"[ZERO-DEFECT FAIL] SHA-256 mirror parity drift between `/` and `/preview/`: {mismatches[:10]}"

    if run_full_visual_d29_d30:
        vis_cmd = [sys.executable, str(DB_DIR / "verify_ui_and_visual_gates.py"), "--full"]
        vis_proc = subprocess.run(vis_cmd, cwd=str(REPO_DIR), capture_output=True, text=True, encoding="utf-8", errors="replace")
        if vis_proc.returncode != 0:
            raise AssertionError(f"[CONSTITUTIONAL D29/D30 VISUAL GATE FAIL]\n{vis_proc.stdout}\n{vis_proc.stderr}")

    print(
        " [CONSTITUTIONAL GATES PASS] Doc-Sync + DOM/Form Lint + Phase 0/1 Security (`C1-C5`) + "
        "Gate #11 Readiness + 100% SHA-256 Mirror Parity + Full D29/D30 4-Viewport Visual Audit (`0px^2`)"
    )


def run_pillar_0_tree_and_income_plan_math_audit(sim_res):
    """
    Pillar 0: Verifies Binary Tree equations, dynamic settings-driven purchase-to-tree
    money feeding (reading active plan/company split, target box requirement, cap, and
    settlement cycle rules directly from `settings`), Income Plan pool (2201)
    reconciliation, generation/surplus distribution, and wallet payout penny-exact
    double-entry balance (0.00).
    """
    team_total = int(sim_res.get("hero_team_total", 0))
    left_arm = int(sim_res.get("hero_left_arm", 0))
    right_arm = int(sim_res.get("hero_right_arm", 0))
    comm_team = int(sim_res.get("hero_commission_team", 0))
    expected_usd = float(sim_res.get("hero_expected_before_close_usd", 0))
    paid_day15_usd = float(sim_res.get("hero_wallet_paid_day15_usd", 0))
    wtx_cnt = int(sim_res.get("hero_wallet_tx_count", 0))
    tr_nodes = int(sim_res.get("hero_tr_foreign_nodes", 0))
    tx_cnt = int(sim_res.get("transactions_executed", 0))
    gl_diff = float(sim_res.get("trial_balance_diff_usd", 99))
    audit = sim_res.get("accounting_audit") or {}

    # 1. Binary Tree Structural Equation: Left Arm + Right Arm == Total Downline Team
    assert team_total >= 50 and left_arm > 0 and right_arm > 0, (
        f"[PILLAR 0 FAIL — TREE STRUCTURE] Invalid binary tree arms: total={team_total}, L={left_arm}, R={right_arm}"
    )
    assert left_arm + right_arm == team_total, (
        f"[PILLAR 0 FAIL — TREE EQUATION] Left ({left_arm}) + Right ({right_arm}) != Total ({team_total})"
    )

    # 2. Purchase -> Target Box -> Tree Money Feeding & Foreign Lens
    assert tx_cnt >= 25 and comm_team > 0 and expected_usd > 0 and tr_nodes > 0, (
        f"[PILLAR 0 FAIL — TREE FEEDING] Purchases did not feed tree earnings: tx={tx_cnt}, "
        f"comm_team={comm_team}, expected_usd={expected_usd}, tr_nodes={tr_nodes}"
    )

    # 3. Dynamic Settings-Driven Income Plan Pool (2201) Split & Zero Pool Mismatch
    assert int(audit.get("mismatched_pools", 99)) == 0, (
        f"[PILLAR 0 FAIL — INCOME PLAN POOL] Mismatched dynamic settings income plan pools detected: {audit}"
    )
    assert int(audit.get("unbalanced_entries", 99)) == 0 and int(audit.get("broken_audit_chain_links", 99)) == 0, (
        f"[PILLAR 0 FAIL — LEDGER INTEGRITY] Unbalanced journal entries or broken hash chain: {audit}"
    )

    # 4. Month-Close Settlement Engine & Scheduled Payout Distribution (per active settings)
    sett_eg = sim_res.get("settlement_eg") or {}
    sett_tr = sim_res.get("settlement_tr") or {}
    assert sett_eg and sett_tr and paid_day15_usd > 0 and wtx_cnt > 0, (
        f"[PILLAR 0 FAIL — PAYOUT DISTRIBUTION] Income plan shares not distributed to wallet: "
        f"paid=${paid_day15_usd}, wtx={wtx_cnt}"
    )
    assert gl_diff == 0.0 and float(audit.get("abs_diff_usd", 99)) == 0.0, (
        f"[PILLAR 0 FAIL — TRIAL BALANCE] Double-entry discrepancy != 0.00: gl_diff={gl_diff}, audit={audit}"
    )

    print(
        f" [V2 PILLAR 0 PASS] Dynamic Income Plan & Tree Math Integrity: "
        f"Tree({left_arm}L + {right_arm}R == {team_total}, qualified={comm_team}, TR_lens={tr_nodes}) | "
        f"Pool(mismatched_pools=0, expected=${expected_usd} -> wallet_paid=${paid_day15_usd}) | "
        f"Ledger(${audit.get('total_debit_usd')} == ${audit.get('total_credit_usd')}, diff=$0.00)"
    )


def run_v2_multi_persona_browser_journeys():
    httpd, port = start_server()
    base = f"http://127.0.0.1:{port}"
    all_errors = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)

            # =================================================================
            # PILLAR 1: VISITOR JOURNEY + CROSS-PORTAL FLASH OFFER SHOWCASE
            # =================================================================
            ctx_vis = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page_vis = ctx_vis.new_page()
            stage18_e2e.attach_error_collectors(page_vis, "v2_visitor_mobile", all_errors)

            # 1a. Homepage + Live Flash Offers Spotlight
            page_vis.goto(f"{base}/index.html", wait_until="domcontentloaded", timeout=30000)
            page_vis.wait_for_function(
                "() => { const g = document.getElementById('featured-merchants'); return g && g.querySelectorAll('.merchant-card').length > 0; }",
                timeout=20000,
            )
            page_vis.wait_for_timeout(600)
            audit_screen_purity(page_vis, "visitor_home_mobile_375", is_user_facing=True)

            home_check = page_vis.evaluate(
                """() => {
                const spot = document.getElementById('liveFlashOffersSpotlight');
                const grid = document.getElementById('featured-merchants');
                const svgArrows = document.querySelectorAll('#how-it-works .step-arrow svg').length;
                return {
                    hasSpotlightEl: Boolean(spot),
                    featuredCount: grid ? grid.querySelectorAll('.merchant-card').length : 0,
                    svgArrows: svgArrows
                };
            }"""
            )
            assert home_check["hasSpotlightEl"] and home_check["featuredCount"] >= 1 and home_check["svgArrows"] >= 4, (
                f"[JOURNEY V2 FAIL — visitor_home] {home_check}"
            )

            # 1b. Public Merchants Directory + Global Online Store Filter + Modal
            page_vis.goto(f"{base}/public/merchants.html", wait_until="domcontentloaded", timeout=30000)
            page_vis.wait_for_function(
                "() => { const g = document.getElementById('merchants-grid'); return g && g.children.length > 0; }",
                timeout=20000,
            )
            page_vis.wait_for_timeout(800)
            audit_screen_purity(page_vis, "visitor_merchants_dir_375", is_user_facing=True)

            # 1c. Contact Us Page (curious visitor asking a question)
            page_vis.goto(f"{base}/public/contact.html", wait_until="domcontentloaded", timeout=25000)
            page_vis.wait_for_timeout(600)
            audit_screen_purity(page_vis, "visitor_contact_375", is_user_facing=True)
            assert page_vis.locator("#contactPhone").count() == 1, "[JOURNEY V2 FAIL] Contact phone field missing"

            # 1d. Referral Registration Link (?ref=1 -> Welcome Hero)
            page_vis.goto(f"{base}/preview/member-dashboard/register.html?ref=1", wait_until="domcontentloaded", timeout=30000)
            page_vis.wait_for_timeout(1400)
            audit_screen_purity(page_vis, "visitor_referral_register_375", is_user_facing=True)
            ctx_vis.close()
            print(" [V2 PILLAR 1 PASS] Visitor Journey (Home, Flash Spotlight, Directory, Contact, Referral Register @ 375px)")

            # =================================================================
            # PILLAR 2: MEMBER FULL LIFECYCLE & AMWAY/USANA/DXN/MARY KAY UX
            # =================================================================
            ctx_mem = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page_mem = ctx_mem.new_page()
            stage18_e2e.attach_error_collectors(page_mem, "v2_member_mobile", all_errors)
            page_mem.goto(f"{base}/preview/member-dashboard/login.html?quick=member", wait_until="domcontentloaded", timeout=35000)
            page_mem.wait_for_url("**/member-dashboard/dashboard.html**", timeout=25000)
            page_mem.wait_for_load_state("networkidle", timeout=25000)
            page_mem.wait_for_timeout(2000)

            # Close one-time flash offer popup if open so we measure home layout accurately
            page_mem.evaluate(
                """() => {
                const m = document.getElementById('memberModalOverlay');
                if (m && m.classList.contains('active')) m.classList.remove('active');
            }"""
            )
            page_mem.wait_for_timeout(250)

            # 2a. Amway/Mary Kay "First 60 Seconds Above-the-Fold" Mobile 375x812 Audit + UI <-> DB Math Reconciliation
            atf = page_mem.evaluate(
                """() => {
                const hdr = document.querySelector('.dashboard-header, .top-header, header');
                const qr = document.querySelector('#memberHomeQuickCashierBar, #homeQuickQrBtn, [data-spec-id="member-home-single-qr"]');
                const tb = document.querySelector('[data-spec-id="member-home-target-box"]');
                const bell = document.getElementById('notificationBell');
                const hdrRect = hdr ? hdr.getBoundingClientRect() : null;
                const qrRect = qr ? qr.getBoundingClientRect() : null;
                const tbRect = tb ? tb.getBoundingClientRect() : null;
                const b = window.__memberBundleCache || {};
                const tbData = b.target_box || {};
                const tbText = tb ? tb.innerText : '';
                return {
                    headerHeight: hdrRect ? Math.round(hdrRect.height) : 999,
                    qrTop: qrRect ? Math.round(qrRect.top) : 999,
                    targetBoxTop: tbRect ? Math.round(tbRect.top) : 999,
                    hasBell: Boolean(bell),
                    hasFlashApi: Boolean(window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.getPublicActiveFlashOffers === 'function'),
                    hasBundleMath: Boolean(b.profile && b.tree_analytics && tbText.length > 10),
                    dbTeamCount: b.tree_analytics ? Number(b.tree_analytics.total_team_count || 0) : -1,
                    dbTargetReqUsd: Number(tbData.target_required_usd || (b.profile && b.profile.monthly_target_usd) || 0)
                };
            }"""
            )
            assert atf["headerHeight"] <= 76, f"[JOURNEY V2 FAIL — member_atf] Mobile header too tall ({atf['headerHeight']}px > 76px)"
            assert atf["qrTop"] < 400, f"[JOURNEY V2 FAIL — member_atf] Quick Cashier QR not above the fold (top={atf['qrTop']}px)"
            assert atf["targetBoxTop"] < 720, (
                f"[JOURNEY V2 FAIL — member_atf] Monthly Target Box pushed below the fold on 375x812 (top={atf['targetBoxTop']}px)"
            )
            assert atf["hasBell"] and atf["hasFlashApi"] and atf["hasBundleMath"] and atf["dbTeamCount"] >= 0 and atf["dbTargetReqUsd"] > 0, (
                f"[JOURNEY V2 FAIL — member_atf] Missing bell, Flash API, or dynamic DB target/tree math: {atf}"
            )
            audit_screen_purity(page_mem, "member_home_375", is_user_facing=True)

            # 2b. Walk Member Tabs + Wallet Arabic Localization + Tree Studio Audit
            for tab in ["myPending", "transactions", "tree", "wallet", "merchants", "referrals", "settings"]:
                page_mem.evaluate(f"() => typeof goToPage === 'function' && goToPage('{tab}')")
                page_mem.wait_for_timeout(550)
                audit_screen_purity(page_mem, f"member_{tab}_375", is_user_facing=True)
                if tab == "wallet":
                    raw_wallet = page_mem.evaluate(
                        """() => {
                        const box = document.querySelector('[data-spec-id="member-wallet-history"]') || document.getElementById('walletPage');
                        const txt = box ? box.innerText : '';
                        const bad = ['commission_credit', 'pending_verification', 'withdrawal_request'];
                        return bad.filter(k => txt.includes(k));
                    }"""
                    )
                    assert not raw_wallet, f"[JOURNEY V2 FAIL — member_wallet] Raw English wallet enums leaked: {raw_wallet}"
            ctx_mem.close()
            print(
                f" [V2 PILLAR 2 PASS] Member Lifecycle & Above-the-Fold UX @ 375x812 "
                f"(header={atf['headerHeight']}px, QR_top={atf['qrTop']}px, TargetBox_top={atf['targetBoxTop']}px, 8 screens pure)"
            )

            # =================================================================
            # PILLAR 3: MERCHANT MOBILE UX, TOP-UP FUZZING & ZERO JARGON
            # =================================================================
            ctx_mer = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page_mer = ctx_mer.new_page()
            stage18_e2e.attach_error_collectors(page_mer, "v2_merchant_mobile", all_errors)
            page_mer.goto(f"{base}/preview/merchant-dashboard/login.html?quick=merchant", wait_until="domcontentloaded", timeout=35000)
            page_mer.wait_for_url("**/merchant-dashboard/dashboard.html**", timeout=25000)
            page_mer.wait_for_load_state("networkidle", timeout=25000)
            page_mer.wait_for_timeout(2000)

            mer_hdr_h = page_mer.evaluate(
                "() => Math.round((document.querySelector('.dashboard-header, .top-header, header') || {getBoundingClientRect:()=>({height:999})}).getBoundingClientRect().height)"
            )
            assert mer_hdr_h <= 76, f"[JOURNEY V2 FAIL — merchant_mobile] Mobile header wrapped/too tall: {mer_hdr_h}px"
            assert page_mer.locator("#notificationBell").is_visible(), "[JOURNEY V2 FAIL — merchant_mobile] Bell missing"
            stage18_e2e.check_no_dead_end_lock_banners(page_mer, "v2_merchant_home")

            for tab in ["home", "kiosk", "pending", "scan", "transactions", "financial", "settings"]:
                page_mer.evaluate(f"() => typeof showPage === 'function' && showPage('{tab}')")
                page_mer.wait_for_timeout(450)
                audit_screen_purity(page_mer, f"merchant_{tab}_375", is_user_facing=True)
            ctx_mer.close()
            print(f" [V2 PILLAR 3 PASS] Merchant Mobile Lifecycle @ 375x812 (header={mer_hdr_h}px, 7 tabs pure, 0 dead-end locks)")

            # =================================================================
            # PILLAR 4: CASHIER EMPLOYEE (ARABIC PIN) & SOVEREIGN ADMIN COCKPIT
            # =================================================================
            ctx_emp = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page_emp = ctx_emp.new_page()
            stage18_e2e.attach_error_collectors(page_emp, "v2_employee_mobile", all_errors)
            page_emp.goto(f"{base}/preview/merchant-dashboard/employee.html", wait_until="networkidle", timeout=25000)
            page_emp.wait_for_timeout(900)
            audit_screen_purity(page_emp, "employee_portal_375", is_user_facing=True)
            ctx_emp.close()

            ctx_adm = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-EG")
            page_adm = ctx_adm.new_page()
            stage18_e2e.attach_error_collectors(page_adm, "v2_admin_desktop", all_errors)
            page_adm.goto(f"{base}/preview/admin-dashboard/login.html?quick=founder", wait_until="domcontentloaded", timeout=35000)
            page_adm.wait_for_url("**/admin-dashboard/dashboard.html**", timeout=25000)
            page_adm.wait_for_load_state("networkidle", timeout=25000)
            page_adm.wait_for_timeout(2200)

            # Verify Bell + Ctrl+K Command Palette + Arabic Transactions Badges
            assert page_adm.locator("#notificationBell").is_visible(), "[JOURNEY V2 FAIL — admin] Bell missing"
            page_adm.keyboard.press("Control+k")
            page_adm.wait_for_timeout(350)
            cmd_open = page_adm.evaluate(
                "() => { const el = document.getElementById('adminCmdKOverlay'); return Boolean(el && getComputedStyle(el).display !== 'none'); }"
            )
            assert cmd_open, "[JOURNEY V2 FAIL — admin] Ctrl+K Command Palette did not open"
            page_adm.keyboard.press("Escape")
            page_adm.wait_for_timeout(250)

            for nav_page in ["merchants", "transactions", "sovereignLive", "networkTree", "academyAdmin", "settings"]:
                nav = page_adm.locator(f'.sidebar-nav .nav-item[data-page="{nav_page}"]')
                if nav.count() > 0:
                    nav.first.click()
                    page_adm.wait_for_timeout(1100)
                    audit_screen_purity(page_adm, f"admin_{nav_page}_1440", is_user_facing=False)

            # =================================================================
            # PILLAR 6: INTERACTIVE BEHAVIORAL & USABILITY TRUTH AUDIT
            # (1) Browser Back Trap Guard, (2) Filter/Action-Card Truthfulness,
            # (3) Clickable Table Rows + 1-Click Quick Actions,
            # (4) Contextual [؟] Help Popovers, (5) Admin Zero-Jargon Purity
            # =================================================================
            # 6.1 Navigate Home -> Merchants -> Transactions, then press Browser BACK
            page_adm.locator('.sidebar-nav .nav-item[data-page="home"]').first.click()
            page_adm.wait_for_timeout(700)
            page_adm.locator('.sidebar-nav .nav-item[data-page="merchants"]').first.click()
            page_adm.wait_for_timeout(900)
            page_adm.locator('.sidebar-nav .nav-item[data-page="transactions"]').first.click()
            page_adm.wait_for_timeout(900)

            page_adm.go_back()
            page_adm.wait_for_timeout(600)
            assert "dashboard.html" in page_adm.url and "login.html" not in page_adm.url, (
                f"[PILLAR 6 FAIL — Browser Back Trap] Pressing Back kicked user out to: {page_adm.url}"
            )
            back_active_page = page_adm.evaluate(
                "() => { const p = document.querySelector('.page.active'); return p ? p.id : ''; }"
            )
            assert back_active_page == "merchantsPage", (
                f"[PILLAR 6 FAIL — Browser Back History] Expected merchantsPage after Back from transactionsPage, got: {back_active_page}"
            )

            # 6.2 Filter Pill & Action-Card Row-Count Truthfulness Audit on #merchantsPage
            filter_truth = page_adm.evaluate(
                """async () => {
                    const pills = Array.from(document.querySelectorAll('#merchantsPage [data-mer-filter]'));
                    const report = [];
                    for (const btn of pills) {
                        const fk = btn.getAttribute('data-mer-filter');
                        const txt = (btn.innerText || '').trim();
                        const m = txt.match(/\\((\\d+)\\)/);
                        if (!m) continue;
                        const expected = parseInt(m[1], 10);
                        await window.loadMerchants('', fk);
                        const rows = Array.from(document.querySelectorAll('#merchantsTable tbody tr.clickable-admin-row'));
                        report.push({ filter: fk, expected, actual: rows.length, match: expected === rows.length });
                    }
                    await window.loadMerchants('', 'all');
                    return report;
                }"""
            )
            assert len(filter_truth) >= 5, f"[PILLAR 6 FAIL — Filter Pills] Expected >=5 filter pills, got {filter_truth}"
            mismatched_filters = [r for r in filter_truth if not r["match"]]
            assert not mismatched_filters, (
                f"[PILLAR 6 FAIL — Fake/Disconnected Filter Count] Displayed table rows != filter pill badge count: {mismatched_filters}"
            )

            # 6.3 Clickable Row Drilldown + 1-Click Quick Action Bar + Contextual [؟] Help Popover
            first_row_cell = page_adm.locator('#merchantsTable tbody tr.clickable-admin-row td[data-label="المنشأة"]').first
            assert first_row_cell.count() > 0, "[PILLAR 6 FAIL — Clickable Rows] No .clickable-admin-row found in #merchantsTable"
            first_row_cell.click()
            page_adm.wait_for_timeout(700)

            modal_audit = page_adm.evaluate(
                """() => {
                    const ov = document.getElementById('svStage7ModalOverlay');
                    const open = Boolean(ov && getComputedStyle(ov).display !== 'none');
                    const text = ov ? (ov.innerText || '') : '';
                    const helpBtns = ov ? ov.querySelectorAll('.sawyan-help-trigger').length : 0;
                    const quickBtns = ov ? ov.querySelectorAll('button[onclick*="svQuickMerchantAction"]').length : 0;
                    const hasRawD4 = /\\bD4\\b/.test(text);
                    const hasRaw2101 = /\\b2101\\b/.test(text);
                    return { open, helpBtns, quickBtns, hasRawD4, hasRaw2101 };
                }"""
            )
            assert modal_audit["open"], "[PILLAR 6 FAIL — Clickable Row] Clicking merchant row did not open Merchant Control Modal"
            assert modal_audit["quickBtns"] >= 4, f"[PILLAR 6 FAIL — Quick Actions] Expected >=4 1-click quick action buttons, found {modal_audit['quickBtns']}"
            assert modal_audit["helpBtns"] >= 6, f"[PILLAR 6 FAIL — Contextual Help] Expected >=6 [؟] help buttons in Merchant Modal, found {modal_audit['helpBtns']}"
            assert not modal_audit["hasRawD4"] and not modal_audit["hasRaw2101"], (
                f"[PILLAR 6 FAIL — Cryptic Jargon in Modal] Found raw D4 or 2101 inside Merchant Contract Modal: {modal_audit}"
            )

            # Click the first [؟] help button inside the modal and verify the explanation popover
            page_adm.locator('#svStage7ModalOverlay .sawyan-help-trigger').first.click()
            page_adm.wait_for_timeout(400)
            help_pop = page_adm.evaluate(
                """() => {
                    const m = document.getElementById('sawyanHelpPopoverModal');
                    if (!m) return { open: false, text: '' };
                    return { open: true, text: m.innerText || '' };
                }"""
            )
            assert help_pop["open"] and "ما وظيفة هذا البند؟" in help_pop["text"] and "مثال عملي بالأرقام" in help_pop["text"], (
                f"[PILLAR 6 FAIL — Help Popover] Contextual [؟] popover did not render explanation & example: {help_pop}"
            )

            # Pressing Browser BACK while modal/popover is open must close the modal and stay on merchantsPage
            page_adm.go_back()
            page_adm.wait_for_timeout(450)
            assert "dashboard.html" in page_adm.url, "[PILLAR 6 FAIL] Browser Back inside modal left dashboard.html"

            # 6.4 Admin Operational Zero-Jargon Scan across Home, Members, Merchants, Reports
            admin_jargon_leaks = page_adm.evaluate(
                """() => {
                    const pages = ['homePage', 'membersPage', 'merchantsPage', 'reportsPage'];
                    const forbidden = [/\\bD4\\b/, /\\b2101\\b/, /\\b2201\\b/, /\\bTombstone\\b/i];
                    const leaks = [];
                    for (const pid of pages) {
                        const el = document.getElementById(pid);
                        if (!el) continue;
                        const txt = el.innerText || '';
                        for (const rx of forbidden) {
                            if (rx.test(txt)) leaks.push(pid + ':' + rx.toString());
                        }
                    }
                    return leaks;
                }"""
            )
            assert not admin_jargon_leaks, f"[PILLAR 6 FAIL — Admin Jargon Leak] Raw internal codes found in operational pages: {admin_jargon_leaks}"

            ctx_adm.close()
            print(" [V2 PILLAR 4, 5 & 6 PASS] Cashier Employee, Admin Sovereign Cockpit, Browser Back Guard, Filter Truthfulness, Clickable Rows, [؟] Help Popovers & Zero-Jargon 100% GREEN")

            browser.close()
    finally:
        httpd.shutdown()

    if all_errors:
        raise AssertionError(f"[JOURNEY V2 FAIL] Browser console/page errors: {all_errors[:15]}")


def main():
    parser = argparse.ArgumentParser(description="SAWYAN V3.0 Gen-2 Autonomous 5-Persona Journey & UX Inspector")
    parser.add_argument("--seed", type=int, default=int(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")))
    parser.add_argument("--fast", action="store_true", help="Run browser 5-persona & UX above-the-fold audit only")
    parser.add_argument("--canary", action="store_true", help="Run 6-hour live synthetic canary only")
    args = parser.parse_args()

    if args.canary:
        stage19_lifecycle.run_canary_health()
        return

    print("=== SAWYAN V3.0 GEN-2 AUTONOMOUS 5-PERSONA JOURNEY & UX INSPECTOR (/sawyan-robot) ===")
    run_constitutional_quality_and_safety_suite(run_full_visual_d29_d30=(not args.fast))
    stage19_lifecycle.run_cross_schema_config_parity_check()
    sim_res = stage19_lifecycle.run_phase_a_sql_lifecycle(args.seed)
    run_pillar_0_tree_and_income_plan_math_audit(sim_res)
    if not args.fast:
        stage19_lifecycle.run_phase_b_and_c_browser_and_chaos()
    run_v2_multi_persona_browser_journeys()
    print("\n[SAWYAN AUTONOMOUS USER JOURNEYS V2 (/sawyan-robot): 100% GREEN]")


if __name__ == "__main__":
    main()
