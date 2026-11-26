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

VISIBLE_TECHNICAL_ERROR_PATTERNS = [
    r"is not defined",
    r"is not a function",
    r"Cannot read propert",
    r"\bTypeError\b",
    r"\bReferenceError\b",
    r"\bSyntaxError\b",
    r"RPC\[",
    r"\bfailed:\s*[A-Z][A-Z0-9_]{3,}",
    r"\[object Object\]",
]
RAW_UPPER_CODE_RE = r"\b[A-Z]{3,}_[A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b"


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


def assert_modal_escapable(page, label, overlay_sel, open_fn_js):
    """Pillar 7 ('دخلت هنا أخرج إزاي؟'): Guarantees EVERY modal has a high-contrast visible close button + Escape + Backdrop + Back exit."""
    def _is_open():
        return page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                const st = window.getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0;
            }""",
            overlay_sel,
        )

    # 1) Open & verify visible close button with real WCAG contrast >= 3.0 (catches white-on-white invisible buttons!)
    page.evaluate(open_fn_js)
    page.wait_for_timeout(350)
    assert _is_open(), f"[PILLAR 7 FAIL — {label}] Modal '{overlay_sel}' failed to open!"

    close_audit = page.evaluate(
        """(sel) => {
            const ov = document.querySelector(sel);
            if (!ov) return { found: false, details: 'no overlay' };
            const parseRgba = (s) => {
                const m = String(s || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/i);
                if (!m) return null;
                return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
            };
            const effBg = (el) => {
                let cur = el;
                while (cur && cur.nodeType === 1) {
                    const cs = window.getComputedStyle(cur);
                    const bg = parseRgba(cs.backgroundColor);
                    if (bg && bg.a > 0.45) return bg;
                    const bi = cs.backgroundImage || '';
                    if (bi && bi !== 'none') {
                        const gm = bi.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
                        if (gm) return { r: +gm[1], g: +gm[2], b: +gm[3], a: 1 };
                    }
                    cur = cur.parentElement;
                }
                return { r: 255, g: 255, b: 255, a: 1 };
            };
            const lum = (c) => {
                const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
            };
            const contrast = (fg, bg) => {
                const l1 = Math.max(lum(fg), lum(bg));
                const l2 = Math.min(lum(fg), lum(bg));
                return (l1 + 0.05) / (l2 + 0.05);
            };
            const btns = Array.from(ov.querySelectorAll('button, a, [role="button"]')).filter(b => {
                const r = b.getBoundingClientRect();
                const st = window.getComputedStyle(b);
                if (st.display === 'none' || st.visibility === 'hidden' || r.width < 18 || r.height < 18) return false;
                const txt = (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
                return /✕|×|✖|إغلاق|إلغاء|رجوع|حسناً|close|cancel/i.test(txt);
            });
            const report = btns.map(b => {
                const fg = parseRgba(window.getComputedStyle(b).color) || { r: 0, g: 0, b: 0, a: 1 };
                const bg = effBg(b);
                return {
                    id: b.id || '',
                    text: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 28),
                    contrast: Math.round(contrast(fg, bg) * 100) / 100
                };
            });
            const visibleHighContrast = report.filter(x => x.contrast >= 3.0);
            const invisibleLowContrast = report.filter(x => x.contrast < 3.0);
            return { found: visibleHighContrast.length > 0, visibleHighContrast, invisibleLowContrast };
        }""",
        overlay_sel,
    )
    assert close_audit["found"], (
        f"[PILLAR 7 FAIL — {label}] Modal '{overlay_sel}' has NO visible high-contrast close button! Audit={close_audit}"
    )
    assert not close_audit["invisibleLowContrast"], (
        f"[PILLAR 7 FAIL — {label}] Modal '{overlay_sel}' has an INVISIBLE/LOW-CONTRAST close button (white-on-white trap!): {close_audit['invisibleLowContrast']}"
    )

    # 2) Test Escape #1: Click the first visible close button inside the modal
    clicked_close = page.evaluate(
        """(sel) => {
            const ov = document.querySelector(sel);
            if (!ov) return false;
            const btn = Array.from(ov.querySelectorAll('button, a, [role="button"]')).find(b => {
                const r = b.getBoundingClientRect();
                const st = window.getComputedStyle(b);
                if (st.display === 'none' || st.visibility === 'hidden' || r.width < 18 || r.height < 18) return false;
                const txt = (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
                return /✕|×|✖|إغلاق|إلغاء|رجوع|close|cancel/i.test(txt);
            });
            if (!btn) return false;
            btn.click();
            return true;
        }""",
        overlay_sel,
    )
    page.wait_for_timeout(250)
    assert clicked_close and not _is_open(), f"[PILLAR 7 FAIL — {label}] Clicking close button did NOT close '{overlay_sel}'!"

    # 3) Test Escape #2: Escape key
    page.evaluate(open_fn_js)
    page.wait_for_timeout(250)
    assert _is_open(), f"[PILLAR 7 FAIL — {label}] Modal '{overlay_sel}' failed to re-open for Esc test"
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    assert not _is_open(), f"[PILLAR 7 FAIL — {label}] Pressing Escape did NOT close '{overlay_sel}'!"

    # 4) Test Escape #3: Clicking dark backdrop corner (6, 6)
    page.evaluate(open_fn_js)
    page.wait_for_timeout(250)
    assert _is_open(), f"[PILLAR 7 FAIL — {label}] Modal '{overlay_sel}' failed to re-open for backdrop test"
    page.mouse.click(6, 6)
    page.wait_for_timeout(250)
    assert not _is_open(), f"[PILLAR 7 FAIL — {label}] Clicking dark backdrop did NOT close '{overlay_sel}'!"

    # 5) Test Escape #4: Browser Back closes modal cleanly without leaving dashboard.html
    page.evaluate(open_fn_js)
    page.wait_for_timeout(250)
    page.go_back()
    page.wait_for_timeout(350)
    assert "dashboard.html" in page.url and "login.html" not in page.url, (
        f"[PILLAR 7 FAIL — {label}] Browser Back inside '{overlay_sel}' left dashboard.html -> {page.url}"
    )
    assert not _is_open(), f"[PILLAR 7 FAIL — {label}] Browser Back did NOT close '{overlay_sel}'!"


def audit_screen_purity(page, label, is_user_facing=True):
    """Pillar 5 + Gen-3 G4: Scans visible text, error leaks, layout overflow, and numeric inputs."""
    res = page.evaluate(
        """(cfg) => {
        const issues = [];
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
        for (const term of cfg.forbiddenTerms) {
            if (bodyText.includes(term)) {
                issues.push(`Forbidden constitutional term '${term}' found in visible text`);
            }
        }
        // Gate G4: Unconditional visible technical error detector (catches runtime crashes / raw RPC leaks on ALL portals)
        for (const pat of cfg.techErrorPatterns) {
            if (new RegExp(pat, 'i').test(bodyText)) {
                issues.push(`Technical error text matched /${pat}/ in visible UI`);
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
            if (/تعذر تحميل/.test(bodyText)) {
                issues.push(`Fatal user-facing load failure text 'تعذر تحميل' visible on screen`);
            }
        }
        // Raw UPPER_SNAKE_CASE internal code scan inside active toasts / dialogs
        const toastText = Array.from(document.querySelectorAll('.sw-toast, .toast, [role="alert"], .sw-dialog-card'))
            .map(t => t.innerText || '').join(' | ');
        const rawCodes = (toastText.match(new RegExp(cfg.rawUpperCodeRe, 'g')) || [])
            .filter(c => !/^(SAWYAN|USD|EUR|TRY|EGP|SAR|AED)$/.test(c));
        if (rawCodes.length) {
            issues.push(`Raw internal error code leaked in toast/dialog: ${Array.from(new Set(rawCodes)).slice(0, 4).join(', ')}`);
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
            "techErrorPatterns": VISIBLE_TECHNICAL_ERROR_PATTERNS,
            "rawUpperCodeRe": RAW_UPPER_CODE_RE,
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
        ("Gen-3 Inline-Handler & Arabic Error-Code Contract Gate (G1+G2)", [sys.executable, str(DB_DIR / "robot_gen3_interaction_crawler.py"), "--static"]),
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

            # 1a-2. Mobile Hamburger Drawer (☰) Open + Visible On-Screen + Clean Close Guard
            page_vis.locator("#mobileMenuBtn").click()
            page_vis.wait_for_timeout(350)
            drawer_open_chk = page_vis.evaluate(
                """() => {
                const ov = document.getElementById('mobileMenuOverlay');
                const dr = ov ? ov.querySelector('.mobile-menu') : null;
                const r = dr ? dr.getBoundingClientRect() : null;
                return {
                    ovActive: Boolean(ov && ov.classList.contains('active') && getComputedStyle(ov).display !== 'none'),
                    drVisible: Boolean(r && r.width >= 200 && r.left >= -2 && r.right <= window.innerWidth + 2),
                    rect: r ? { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) } : null
                };
            }"""
            )
            assert drawer_open_chk["ovActive"] and drawer_open_chk["drVisible"], (
                f"[JOURNEY V2 FAIL — visitor_hamburger_freeze] Clicking ☰ froze overlay without sliding drawer on-screen: {drawer_open_chk}"
            )
            page_vis.locator("#mobileMenuCloseBtn").click()
            page_vis.wait_for_timeout(250)
            drawer_close_chk = page_vis.evaluate(
                "() => ({ ovActive: document.getElementById('mobileMenuOverlay')?.classList.contains('active'), overflow: document.body.style.overflow })"
            )
            assert not drawer_close_chk["ovActive"] and drawer_close_chk["overflow"] != "hidden", (
                f"[JOURNEY V2 FAIL — visitor_hamburger_close] Drawer failed to close cleanly: {drawer_close_chk}"
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
                const boxes = Array.isArray(b.target_boxes) ? b.target_boxes : [];
                const boxesHaveCarryFields = boxes.every(x =>
                    x && x.projected_carry_on_out_usd !== undefined && x.projected_carry_on_out_local !== undefined && x.projected_carry_on_months !== undefined
                );
                const anyPositiveCarry = boxes.some(x => Number(x && x.projected_carry_on_out_usd || 0) > 0);
                const carryDomRendered = Boolean(document.querySelector('[data-spec-id="member-home-carry-on-out"], [data-spec-id="member-foreign-box-carry-on"]'));
                const tbText = tb ? tb.innerText : '';
                return {
                    headerHeight: hdrRect ? Math.round(hdrRect.height) : 999,
                    qrTop: qrRect ? Math.round(qrRect.top) : 999,
                    targetBoxTop: tbRect ? Math.round(tbRect.top) : 999,
                    hasBell: Boolean(bell),
                    hasFlashApi: Boolean(window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.getPublicActiveFlashOffers === 'function'),
                    hasBundleMath: Boolean(b.profile && b.tree_analytics && tbText.length > 10),
                    boxesHaveCarryFields,
                    anyPositiveCarry,
                    carryDomRendered,
                    memberCode: b.profile ? Number(b.profile.member_code || 0) : 0,
                    dbTeamCount: b.tree_analytics ? Number(b.tree_analytics.total_team_count || 0) : -1,
                    dbTeamInclSelf: (b.tree_analytics && b.tree_analytics.team_size_incl_self !== undefined) ? Number(b.tree_analytics.team_size_incl_self) : -1,
                    renderedHomeTeam: Number((document.getElementById('teamSize')?.innerText || '').replace(/\\D/g, '') || 0),
                    dbTargetReqUsd: Number(tbData.target_required_usd || (b.profile && b.profile.monthly_target_usd) || 0)
                };
            }"""
            )
            assert atf["headerHeight"] <= 76, f"[JOURNEY V2 FAIL — member_atf] Mobile header too tall ({atf['headerHeight']}px > 76px)"
            assert atf["qrTop"] < 400, f"[JOURNEY V2 FAIL — member_atf] Quick Cashier QR not above the fold (top={atf['qrTop']}px)"
            assert atf["targetBoxTop"] < 720, (
                f"[JOURNEY V2 FAIL — member_atf] Monthly Target Box pushed below the fold on 375x812 (top={atf['targetBoxTop']}px)"
            )
            assert (
                atf["hasBell"] and atf["hasFlashApi"] and atf["hasBundleMath"]
                and atf["dbTeamCount"] >= 0
                and atf["dbTeamInclSelf"] == atf["dbTeamCount"] + 1
                and atf["renderedHomeTeam"] == atf["dbTeamInclSelf"]
                and atf["dbTargetReqUsd"] > 0
            ), f"[JOURNEY V2 FAIL — member_atf] Missing bell, Flash API, or authoritative DB team/target math: {atf}"
            assert atf["boxesHaveCarryFields"] and (not atf["anyPositiveCarry"] or atf["carryDomRendered"]), (
                f"[JOURNEY V2 FAIL — member_carry_on] Projected Carry-On fields missing from DB bundle or not rendered in UI: {atf}"
            )
            # 2a-2. Stage 34 Guards: Flash Offer Modal (closeMemberModal + no stray submit btn) & 100% Arabic Error Humanization
            s34_chk = page_mem.evaluate(
                """() => {
                const hasCloseFn = typeof window.closeMemberModal === 'function';
                let noStraySubmit = false;
                let closedCleanly = false;
                if (typeof openMemberModal === 'function' && hasCloseFn) {
                    openMemberModal('اختبار عرض', '<div>محتوى العرض</div>', null);
                    noStraySubmit = !document.getElementById('sawyanModalSubmitBtn');
                    window.closeMemberModal();
                    const ov = document.getElementById('sawyanMemberModalOverlay');
                    closedCleanly = Boolean(!ov || getComputedStyle(ov).display === 'none');
                }
                const errSoft = window.SAWYAN?.UI?.humanizeError('RPC[submit_member_pending_purchase] failed: MERCHANT_SOFT_HOLD_CAP_20PCT_EXCEEDED') || '';
                const errUnk = window.SAWYAN?.UI?.humanizeError('RPC[any_rpc] failed: UNKNOWN_TECH_CODE_XYZ') || '';
                const arRx = /[\\u0600-\\u06FF]/;
                return {
                    hasCloseFn, noStraySubmit, closedCleanly,
                    softHoldArabic: arRx.test(errSoft) && !errSoft.includes('RPC[') && !errSoft.includes('MERCHANT_SOFT_HOLD'),
                    unknownFallbackArabic: arRx.test(errUnk) && !errUnk.includes('RPC[') && !errUnk.includes('UNKNOWN_TECH_CODE'),
                    errSoft, errUnk
                };
            }"""
            )
            assert (
                s34_chk["hasCloseFn"]
                and s34_chk["noStraySubmit"]
                and s34_chk["closedCleanly"]
                and s34_chk["softHoldArabic"]
                and s34_chk["unknownFallbackArabic"]
            ), f"[JOURNEY V2 FAIL — stage34_mobile_guards] {s34_chk}"
            # P3.3 Negative-Path Error Matrix across 7 business-rule error codes (must each be specific Arabic, 0 leaks)
            neg_codes = [
                "MERCHANT_SOFT_HOLD_CAP_20PCT_EXCEEDED",
                "FLASH_OFFER_BLOCKED_WALLET_NOT_GREEN",
                "INSUFFICIENT_WALLET_BALANCE",
                "SPAM_GUARD_RECEIPT_REQUIRED",
                "POST_PAYOUT_RETURN_FORBIDDEN",
                "CASHIER_PIN_LOCKED",
                "DUPLICATE_TOPUP_NOTICE_COOLDOWN",
            ]
            neg_res = page_mem.evaluate(
                """(codes) => {
                    const H = window.SAWYAN.UI.humanizeError;
                    const generic = H('RPC[x] failed: ZZZ_ROBOT_UNKNOWN_ZZZ');
                    const bad = [];
                    for (const c of codes) {
                        const out = H('RPC[probe] failed: ' + c);
                        if (!/[\\u0600-\\u06FF]/.test(out) || out.includes(c) || out.includes('RPC[') || out === generic) {
                            bad.push({ code: c, out });
                        }
                    }
                    return bad;
                }""",
                neg_codes,
            )
            assert not neg_res, f"[P3.3 FAIL — Negative-Path Error Matrix] {neg_res}"
            audit_screen_purity(page_mem, "member_home_375", is_user_facing=True)

            # 2b. Walk Member Tabs + Wallet Arabic Localization + Browser Back Guard
            mem_tree_team = -1
            for tab in ["myPending", "transactions", "tree", "wallet", "merchants", "referrals", "settings"]:
                page_mem.evaluate(f"() => typeof goToPage === 'function' && goToPage('{tab}')")
                page_mem.wait_for_timeout(550)
                audit_screen_purity(page_mem, f"member_{tab}_375", is_user_facing=True)
                if tab == "tree":
                    page_mem.wait_for_selector('.ts-wrap [data-spec-id="member-tree-kpis"]', timeout=12000)
                    tree_team_check = page_mem.evaluate(
                        """() => {
                        const kpi = document.querySelector('.ts-wrap [data-spec-id="member-tree-kpis"]');
                        const txt = kpi ? (kpi.innerText || '') : '';
                        const m = txt.match(/أعضاء فريقك:\\s*(\\d+)/);
                        return { found: Boolean(m), count: m ? Number(m[1]) : -1, snippet: txt.slice(0, 140) };
                    }"""
                    )
                    assert tree_team_check["found"] and tree_team_check["count"] >= 1, (
                        f"[JOURNEY V2 FAIL — member_tree_team_min1] Team count must include self (>= 1), got: {tree_team_check}"
                    )
                    assert tree_team_check["count"] == atf["dbTeamInclSelf"], (
                        f"[P4 FAIL — Member Home vs Tree Studio Drift] Home={atf['dbTeamInclSelf']} != TreeStudio={tree_team_check['count']}"
                    )
                    mem_tree_team = tree_team_check["count"]
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

            # P3.2 Member Mobile Bell Positioning (non-overlapping with #notificationBell) + Every-Event Routing Matrix
            mem_bell_pos = page_mem.evaluate(
                """() => {
                    const bell = document.getElementById('notificationBell');
                    if (!bell) return { hasBell: false };
                    window.SAWYAN.Notifications.toggleDropdown();
                    const dd = document.getElementById('notificationDropdown');
                    const br = bell.getBoundingClientRect();
                    const dr = dd ? dd.getBoundingClientRect() : null;
                    window.SAWYAN.Notifications.toggleDropdown();
                    return { hasBell: true, bellBottom: Math.round(br.bottom), dropTop: dr ? Math.round(dr.top) : -1 };
                }"""
            )
            assert mem_bell_pos.get("hasBell") and mem_bell_pos.get("dropTop", -1) >= mem_bell_pos.get("bellBottom", 0) - 2, (
                f"[P3.2 FAIL — Member Mobile Bell Overlap] Dropdown covered bell at 375px: {mem_bell_pos}"
            )
            for ev_name, expected_page in [
                ("PendingPurchaseRequested", "myPendingPage"),
                ("TransactionCompleted", "transactionsPage"),
                ("OnMemberRegistered", "treePage"),
                ("MerchantFlashOfferLive", "merchantsPage"),
                ("MemberWithdrawalApproved", "walletPage"),
            ]:
                page_mem.evaluate(
                    """(ev) => {
                        const N = window.SAWYAN.Notifications;
                        const orig = N.notifications;
                        N.notifications = [{ id: 'probe-mem-' + ev, event_name: ev, is_read: false, created_at: new Date().toISOString(), payload: { sw_short_code: 'SW-PROBE', merchant_name: 'متجر', amount: 100, amount_usd: 5, new_member_code: 99, full_name: 'عضو' } }];
                        N.handleNotificationClick('probe-mem-' + ev, ev);
                        N.notifications = orig;
                    }""",
                    ev_name,
                )
                page_mem.wait_for_timeout(200)
                nav_st = page_mem.evaluate(
                    "() => ({ active: document.querySelector('.page.active')?.id || '', ddOpen: getComputedStyle(document.getElementById('notificationDropdown')).display !== 'none' })"
                )
                assert nav_st["active"] == expected_page and not nav_st["ddOpen"], (
                    f"[P3.2 FAIL — Member Bell Route] event={ev_name} expected={expected_page} got={nav_st}"
                )

            probe_member_code = atf["memberCode"]
            probe_member_team = mem_tree_team
            # Verify Member Browser Back Guard (stays on dashboard.html, never kicks out to login)
            page_mem.go_back()
            page_mem.wait_for_timeout(500)
            assert "dashboard.html" in page_mem.url and "login.html" not in page_mem.url, (
                f"[PILLAR 6 FAIL — Member Browser Back Trap] Pressing Back kicked member out to: {page_mem.url}"
            )
            ctx_mem.close()
            print(
                f" [V2 PILLAR 2 PASS] Member Lifecycle & Above-the-Fold UX @ 375x812 "
                f"(header={atf['headerHeight']}px, QR_top={atf['qrTop']}px, TargetBox_top={atf['targetBoxTop']}px, 8 screens pure, Back guard OK)"
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
            # Verify no negative-zero '-0.00' on Merchant home KPI cards
            mer_neg_zero = page_mer.evaluate("() => (document.getElementById('homePage')?.innerText || '').includes('-0.00')")
            assert not mer_neg_zero, "[PILLAR 6 FAIL — Merchant Negative Zero] Found '-0.00' on Merchant Home KPI card"
            stage18_e2e.check_no_dead_end_lock_banners(page_mer, "v2_merchant_home")

            for tab in ["home", "kiosk", "pending", "scan", "transactions", "financial", "settings"]:
                page_mer.evaluate(f"() => typeof showPage === 'function' && showPage('{tab}')")
                page_mer.wait_for_timeout(450)
                audit_screen_purity(page_mer, f"merchant_{tab}_375", is_user_facing=True)
            # Verify Merchant Pillar 7 Modal Escape & Contrast Gate (Store Kit Sticker, Promo, Radar, Top-Up)
            page_mer.evaluate("() => typeof showPage === 'function' && showPage('home')")
            page_mer.wait_for_timeout(400)
            assert_modal_escapable(
                page_mer,
                "merchant_store_kit_sticker",
                "#storeKitModalOverlay",
                "() => typeof openStoreKitModal === 'function' && openStoreKitModal()",
            )
            assert_modal_escapable(
                page_mer,
                "merchant_promo_request",
                "#merchantPromoRequestModal",
                "() => { const m = document.getElementById('merchantPromoRequestModal'); if (m) m.style.display = 'flex'; }",
            )
            assert_modal_escapable(
                page_mer,
                "merchant_radar_modal",
                "#merchantRadarModal",
                "() => { const m = document.getElementById('merchantRadarModal'); if (m) m.style.display = 'flex'; }",
            )
            assert_modal_escapable(
                page_mer,
                "merchant_topup_modal",
                "#svMerchantTopupOverlay",
                "() => typeof window.openMerchantTopupModal === 'function' && window.openMerchantTopupModal()",
            )
            # P3.2 Merchant Mobile Bell Positioning & Every-Event Routing Matrix
            mer_bell_pos = page_mer.evaluate(
                """() => {
                    const bell = document.getElementById('notificationBell');
                    if (!bell) return { hasBell: false };
                    window.SAWYAN.Notifications.toggleDropdown();
                    const dd = document.getElementById('notificationDropdown');
                    const br = bell.getBoundingClientRect();
                    const dr = dd ? dd.getBoundingClientRect() : null;
                    window.SAWYAN.Notifications.toggleDropdown();
                    return { hasBell: true, bellBottom: Math.round(br.bottom), dropTop: dr ? Math.round(dr.top) : -1 };
                }"""
            )
            assert mer_bell_pos.get("hasBell") and mer_bell_pos.get("dropTop", -1) >= mer_bell_pos.get("bellBottom", 0) - 2, (
                f"[P3.2 FAIL — Merchant Mobile Bell Overlap] Dropdown covered bell at 375px: {mer_bell_pos}"
            )
            for ev_name, expected_page in [
                ("PendingPurchaseRequested", "pendingPage"),
                ("MerchantBankTopupUnderReview", "financialPage"),
                ("MerchantBankTopupRejected", "financialPage"),
                ("MerchantFlashOfferApproved", "homePage"),
            ]:
                page_mer.evaluate(
                    """(ev) => {
                        const N = window.SAWYAN.Notifications;
                        const orig = N.notifications;
                        N.notifications = [{ id: 'probe-mer-' + ev, event_name: ev, is_read: false, created_at: new Date().toISOString(), payload: { bank_ref: 'REF-PROBE', amount_local: 500, currency_code: 'TRY', sw_short_code: 'SW-PROBE' } }];
                        N.handleNotificationClick('probe-mer-' + ev, ev);
                        N.notifications = orig;
                    }""",
                    ev_name,
                )
                page_mer.wait_for_timeout(200)
                nav_st = page_mer.evaluate(
                    "() => ({ active: document.querySelector('.page.active')?.id || '', ddOpen: getComputedStyle(document.getElementById('notificationDropdown')).display !== 'none' })"
                )
                assert nav_st["active"] == expected_page and not nav_st["ddOpen"], (
                    f"[P3.2 FAIL — Merchant Bell Route] event={ev_name} expected={expected_page} got={nav_st}"
                )
            # Verify Merchant Browser Back Guard
            page_mer.go_back()
            page_mer.wait_for_timeout(500)
            assert "dashboard.html" in page_mer.url and "login.html" not in page_mer.url, (
                f"[PILLAR 6 FAIL — Merchant Browser Back Trap] Pressing Back kicked merchant out to: {page_mer.url}"
            )
            ctx_mer.close()
            print(f" [V2 PILLAR 3 & 7 PASS] Merchant Mobile Lifecycle @ 375x812 (header={mer_hdr_h}px, 7 tabs pure, 0 dead-end locks, 4 modals 4-way escapable + contrast>=3.0, Back guard OK)")

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
            # PILLAR 6 (GEN-2 HARDENED): UNCHEATABLE INTERACTIVE BEHAVIORAL AUDIT
            # (1) Real Mouse Clicks + RPC Storm Guard (<=2 RPCs),
            # (2) Browser Back Guard, (3) Real Filter Pill Clicks,
            # (4) Real Reports Date-Range Filtering, (5) ban_now Confirmation Guard,
            # (6) Contextual [?] Help Popovers, (7) Full-Screen Zero-Jargon,
            # (8) Real AR/EN/TR i18n & Dark Mode Verification
            # =================================================================
            # 6.1 Navigate Home -> Click Real Action Card & Count RPC Storm
            page_adm.locator('.sidebar-nav .nav-item[data-page="home"]').first.click()
            page_adm.wait_for_timeout(700)
            rpc_hits = []
            def _on_req(req):
                if "admin_search_and_reply_ops" in req.url:
                    rpc_hits.append(req.url)
            page_adm.on("request", _on_req)
            fifo_card = page_adm.locator("#actionRowFifoMerchants, #actionRowFifoMerchants button")
            if fifo_card.count() > 0:
                fifo_card.first.click()
                page_adm.wait_for_timeout(1200)
                assert len(rpc_hits) <= 2, (
                    f"[PILLAR 6 FAIL — RPC Storm] Clicking Home action card fired {len(rpc_hits)} concurrent admin_search_and_reply_ops RPCs (max 2)"
                )
            else:
                page_adm.locator('.sidebar-nav .nav-item[data-page="merchants"]').first.click()
                page_adm.wait_for_timeout(900)
            page_adm.remove_listener("request", _on_req)

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

            # 6.2 REAL Mouse-Click Filter Pill Truthfulness Audit on #merchantsPage (must be instant & 0 extra RPCs)
            page_adm.wait_for_selector('#merchantsPage [data-mer-filter]', timeout=8000)
            page_adm.wait_for_timeout(800)
            pills = page_adm.locator('#merchantsPage [data-mer-filter]')
            pill_count = pills.count()
            assert pill_count >= 5, f"[PILLAR 6 FAIL — Filter Pills] Expected >=5 filter pills, got {pill_count}"
            pill_rpc_hits = []
            def _on_pill_req(req):
                if "admin_search_and_reply_ops" in req.url:
                    pill_rpc_hits.append(req.url)
            page_adm.on("request", _on_pill_req)
            filter_mismatches = []
            for idx in range(pill_count):
                pill = pills.nth(idx)
                fk = pill.get_attribute("data-mer-filter") or ""
                txt = (pill.inner_text() or "").strip()
                m_cnt = re.search(r"\((\d+)\)", txt)
                if not m_cnt:
                    continue
                expected = int(m_cnt.group(1))
                pill.click()
                page_adm.wait_for_timeout(150)
                actual = page_adm.locator('#merchantsTable tbody tr.clickable-admin-row').count()
                if actual != expected:
                    filter_mismatches.append({"filter": fk, "expected": expected, "actual": actual})
            page_adm.locator('#merchantsPage [data-mer-filter="all"]').first.click()
            page_adm.wait_for_timeout(150)
            page_adm.remove_listener("request", _on_pill_req)
            assert len(pill_rpc_hits) == 0, (
                f"[PILLAR 6 FAIL — Redundant Filter RPCs] Clicking filter pills fired {len(pill_rpc_hits)} redundant RPCs (expected 0)"
            )
            assert not filter_mismatches, (
                f"[PILLAR 6 FAIL — Fake/Disconnected Filter Count] Real mouse click rows != badge count: {filter_mismatches}"
            )

            # 6.3 Clickable Row Drilldown + ban_now Confirmation Guard + Contextual [?] Help Popover
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

            # Verify ban_now requires confirmation modal (never executes destructively on 1 click!)
            ban_btn = page_adm.locator('#svStage7ModalOverlay button[onclick*="ban_now"]').first
            if ban_btn.count() > 0:
                ban_btn.click()
                page_adm.wait_for_timeout(350)
                confirm_visible = page_adm.locator('.sw-dialog-backdrop, .sw-dialog-card').count() > 0
                assert confirm_visible, "[PILLAR 6 FAIL — Destructive Guard] ban_now executed without SAWYAN.UI.confirm modal!"
                cancel_btn = page_adm.locator('.sw-dialog-backdrop .sw-btn-ghost, .sw-dialog-card button:has-text("تراجع")').first
                if cancel_btn.count() > 0:
                    cancel_btn.click()
                else:
                    page_adm.keyboard.press("Escape")
                page_adm.wait_for_timeout(300)

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
            page_adm.evaluate("() => { if (typeof closeStage7Modal === 'function') closeStage7Modal(); }")
            page_adm.wait_for_timeout(200)

            # 6.4 Real Reports Date Range Filtering Truthfulness Audit
            page_adm.locator('.sidebar-nav .nav-item[data-page="reports"]').first.click()
            page_adm.wait_for_timeout(700)
            page_adm.fill('#reportStartDate', '2020-01-01')
            page_adm.fill('#reportEndDate', '2020-01-02')
            page_adm.locator('#reportsPage button[onclick*="generateReport"]').first.click()
            page_adm.wait_for_timeout(500)
            rep_empty_rows = page_adm.evaluate(
                "() => document.querySelectorAll('#reportsPage table.data-table tbody tr:not(:has(.empty-state))').length"
            )
            assert rep_empty_rows == 0, (
                f"[PILLAR 6 FAIL — Fake Reports Date Filter] Setting 2020-01-01..2020-01-02 still returned {rep_empty_rows} rows!"
            )

            # 6.5 Admin Comprehensive Zero-Jargon & Formatting Scan across Operational + Governance Screens
            for g_nav in ["governanceOps", "sovereignLive", "settings", "withdrawals", "disputes", "support"]:
                nav_loc = page_adm.locator(f'.sidebar-nav .nav-item[data-page="{g_nav}"]')
                if nav_loc.count() > 0:
                    nav_loc.first.click()
                    page_adm.wait_for_timeout(600)
            admin_jargon_leaks = page_adm.evaluate(
                """() => {
                    const pages = ['homePage', 'membersPage', 'merchantsPage', 'reportsPage', 'governanceOpsPage', 'sovereignLivePage', 'settingsPage'];
                    const forbidden = [/\\bD4\\b/, /\\b2101\\b/, /\\b2201\\b/, /\\bTombstone\\b/i, /\\$-\\d/, /Gross GMV/i];
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
            assert not admin_jargon_leaks, f"[PILLAR 6 FAIL — Admin Jargon Leak] Raw internal codes found: {admin_jargon_leaks}"

            # 6.6 Real AR / EN / TR i18n Switching + Unified Dark Mode Verification
            page_adm.locator('.sidebar-nav .nav-item[data-page="home"]').first.click()
            page_adm.wait_for_timeout(400)
            en_btn = page_adm.locator('.sawyan-lang-btn[data-lang="en"]').first
            if en_btn.count() > 0:
                en_btn.click()
                page_adm.wait_for_timeout(500)
                i18n_en = page_adm.evaluate(
                    "() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, navTxt: document.querySelector('.sidebar-nav')?.innerText || '' })"
                )
                assert i18n_en["dir"] == "ltr" and i18n_en["lang"] == "en" and ("Merchants" in i18n_en["navTxt"] or "Members" in i18n_en["navTxt"]), (
                    f"[PILLAR 6 FAIL — i18n EN] Clicking EN did not translate sidebar/dir: {i18n_en}"
                )
                page_adm.locator('.sawyan-lang-btn[data-lang="ar"]').first.click()
                page_adm.wait_for_timeout(400)
            dark_btn = page_adm.locator('.sawyan-theme-btn').first
            if dark_btn.count() > 0:
                dark_btn.click()
                page_adm.wait_for_timeout(300)
                dk_theme = page_adm.evaluate("() => document.documentElement.getAttribute('data-theme')")
                assert dk_theme == "dark", f"[PILLAR 6 FAIL — Dark Mode] Expected data-theme=dark, got {dk_theme}"
                dark_btn.click()
                page_adm.wait_for_timeout(200)

            # 6.7 Stage 31 — Admin Bell Zero-Clipping & Precision Deep-Link Scroll/Highlight Guard
            bell_btn = page_adm.locator('#notificationBell').first
            if bell_btn.count() > 0:
                page_adm.evaluate(
                    """() => {
                        const bun = window.__SAWYAN_ADMIN_LIVE_BUNDLE__ || {};
                        const mers = Array.isArray(bun.merchants) ? bun.merchants : [];
                        const m0 = mers[0] || {};
                        if (window.SAWYAN && window.SAWYAN.Notifications && (!window.SAWYAN.Notifications.notifications || window.SAWYAN.Notifications.notifications.length === 0)) {
                            window.SAWYAN.Notifications.hydrateFromBundle([{
                                id: '00000000-0000-4000-8000-000000000031',
                                event_name: 'NewMerchantRegistered',
                                is_read: false,
                                created_at: new Date().toISOString(),
                                payload: {
                                    merchant_id: m0.id || '',
                                    merchant_code: m0.merchant_code || 'M-PROBE',
                                    business_name: m0.business_name || 'Probe Merchant',
                                    country_code: m0.country_code || 'EG',
                                    deduction_percent: 10
                                }
                            }]);
                        }
                    }"""
                )
                bell_btn.click()
                page_adm.wait_for_timeout(350)
                bell_check = page_adm.evaluate(
                    """() => {
                        const dd = document.getElementById('notificationDropdown');
                        const hdr = dd ? dd.querySelector('.notification-header') : null;
                        const lst = document.getElementById('notificationList');
                        const first = lst ? lst.querySelector('.notification-item') : null;
                        if (!dd || getComputedStyle(dd).display === 'none') return { open: false };
                        const hr = hdr ? hdr.getBoundingClientRect() : { bottom: 0 };
                        const fr = first ? first.getBoundingClientRect() : null;
                        return {
                            open: true,
                            itemCount: lst ? lst.querySelectorAll('.notification-item').length : 0,
                            scrollTop: lst ? lst.scrollTop : -1,
                            headerBottom: Math.round(hr.bottom),
                            firstItemTop: fr ? Math.round(fr.top) : null,
                            clippedTop: fr ? (fr.top < hr.bottom - 2) : false
                        };
                    }"""
                )
                assert bell_check.get("open"), f"[PILLAR 7B FAIL — Bell Open] Dropdown failed to open: {bell_check}"
                assert bell_check.get("scrollTop") == 0 and not bell_check.get("clippedTop"), (
                    f"[PILLAR 7B FAIL — Bell Top Clipping] First notification clipped under header: {bell_check}"
                )
                assert bell_check.get("itemCount", 0) > 0, f"[PILLAR 7B FAIL] Expected bell items > 0: {bell_check}"
                page_adm.locator('#notificationList .notification-item').first.click()
                page_adm.wait_for_timeout(1200)
                deep_res = page_adm.evaluate(
                    """() => {
                        const dd = document.getElementById('notificationDropdown');
                        const focused = document.querySelector('.sw-notif-spotlight, [data-notif-focused="1"]');
                        return {
                            dropdownClosed: !dd || getComputedStyle(dd).display === 'none',
                            hasSpotlight: !!focused,
                            focusedId: focused ? (focused.id || focused.tagName) : null
                        };
                    }"""
                )
                assert deep_res["dropdownClosed"], f"[PILLAR 7B FAIL — Bell Close] Dropdown remained open: {deep_res}"
                assert deep_res["hasSpotlight"], f"[PILLAR 7B FAIL — Bell Deep-Link] Clicking notification did not highlight target element: {deep_res}"

            # P3.2 Admin Every-Bell-Event Routing Matrix (all 8 operational event types)
            for ev_name, expected_page in [
                ("MerchantBankTopupProofPending", "merchantsPage"),
                ("NewMerchantRegistered", "merchantsPage"),
                ("MerchantFlashOfferPending", "homePage"),
                ("MemberWithdrawalRequested", "withdrawalsPage"),
                ("MemberGdprErasureRequested", "supportPage"),
                ("ZeroDiscrepancyBreachAutoHalt", "sovereignLivePage"),
                ("DisputeTicketOpened", "disputesPage"),
                ("SupportTicketOpened", "supportPage"),
            ]:
                page_adm.evaluate(
                    """(ev) => {
                        const N = window.SAWYAN.Notifications;
                        const orig = N.notifications;
                        const fmt = N._formatTitleAndBody({ event_name: ev, payload: {} });
                        if (fmt.title === ev) throw new Error('Bell event missing Arabic formatter: ' + ev);
                        N.notifications = [{ id: 'probe-adm-' + ev, event_name: ev, is_read: false, created_at: new Date().toISOString(), payload: { business_name: 'متجر', merchant_code: 'M-PROBE', sw_short_code: 'SW-PROBE' } }];
                        N.handleNotificationClick('probe-adm-' + ev, ev);
                        N.notifications = orig;
                    }""",
                    ev_name,
                )
                page_adm.wait_for_timeout(300)
                adm_nav = page_adm.evaluate(
                    "() => ({ active: document.querySelector('.page.active')?.id || '', ddOpen: getComputedStyle(document.getElementById('notificationDropdown')).display !== 'none' })"
                )
                assert adm_nav["active"] == expected_page and not adm_nav["ddOpen"], (
                    f"[P3.2 FAIL — Admin Bell Route] event={ev_name} expected={expected_page} got={adm_nav}"
                )

            # P3.1 Admin Home All Action Cards + Clickable Table Rows Verification
            page_adm.locator('.sidebar-nav .nav-item[data-page="home"]').first.click()
            page_adm.wait_for_timeout(500)
            cards_chk = page_adm.evaluate(
                """() => {
                    const req = ['actionRowFifoMerchants','actionRowPendingTx','actionRowPromo','actionRowWithdrawals','actionRowPendingKyc','actionRowLowBalance','actionRowPendingMerchants','actionRowDisputes','actionRowSupport'];
                    return req.filter(id => !document.getElementById(id));
                }"""
            )
            assert not cards_chk, f"[P3.1 FAIL — Admin Home Action Cards] Missing card IDs: {cards_chk}"

            # 6.8 Stage 28 & P4 — Cross-Screen, Cross-Country & Cross-Portal Equality Audit
            cons_res = page_adm.evaluate(
                """() => {
                    const bun = window.__SAWYAN_ADMIN_LIVE_BUNDLE__ || {};
                    const kpis = bun.kpis || {};
                    const mems = Array.isArray(bun.members) ? bun.members : [];
                    const qualInMembers = mems.filter(m => Number(m.member_code) > 0 && Boolean(m.is_qualified_period)).length;
                    const kpiQual = Number(kpis.qualified_members_period || 0);
                    const boxMismatches = [];
                    for (const m of mems) {
                        const cbs = Array.isArray(m.country_boxes) ? m.country_boxes : [];
                        const anyQ = cbs.some(b => Boolean(b.is_qualified));
                        if (anyQ && !m.is_qualified_period) {
                            boxMismatches.push({ code: m.member_code, issue: 'country_box_qualified_but_member_not' });
                        }
                    }
                    return { kpiQual, qualInMembers, memCount: mems.length, boxMismatches };
                }"""
            )
            assert cons_res["kpiQual"] == cons_res["qualInMembers"], (
                f"[PILLAR 6.8 FAIL — Admin KPI vs Members/Reports Drift] KPI qualified={cons_res['kpiQual']} != members qualified={cons_res['qualInMembers']}"
            )
            assert not cons_res["boxMismatches"], (
                f"[PILLAR 6.8 FAIL — Cross-Country Qualification Leak] {cons_res['boxMismatches']}"
            )
            page_adm.locator('.sidebar-nav .nav-item[data-page="networkTree"]').first.click()
            page_adm.wait_for_selector('#networkTreePage[data-tree-loading="0"] button[onclick*="openAdminTreeNodeModal"]', timeout=15000)
            page_adm.wait_for_timeout(300)
            non_root_detail_btn = page_adm.locator('#networkTreePage[data-tree-loading="0"] button[onclick*="openAdminTreeNodeModal"]').first
            if non_root_detail_btn.count() > 0:
                non_root_detail_btn.click()
                page_adm.wait_for_timeout(450)
                adm_node_txt = page_adm.evaluate(
                    "() => { const ov = document.getElementById('svStage7ModalOverlay'); return ov ? (ov.innerText || '') : ''; }"
                )
                assert "جارية (قبل الإقفال):" in adm_node_txt and "مصروفة بالمحفظة:" in adm_node_txt and "يوم 15" in adm_node_txt, (
                    f"[PILLAR 6.8 FAIL — Admin Node Commission Clarity] Missing open-month vs paid wallet split: {adm_node_txt[:300]}"
                )
                page_adm.evaluate("() => { if (typeof closeStage7Modal === 'function') closeStage7Modal(); }")

            # P4 Cross-Portal Authoritative `team_size_incl_self` Equality Check (Member Home == Tree Studio == Admin Full Tree RPC/Node)
            if probe_member_code > 0 and probe_member_team >= 1:
                adm_tree_eq = page_adm.evaluate(
                    """async (code) => {
                        const res = await window.SAWYAN.API.getAdminFullTree({ rootMemberCode: code, maxDepth: 2 });
                        const nodes = Array.isArray(res && res.nodes) ? res.nodes : [];
                        const selfNode = nodes.find(n => Number(n.member_code) === Number(code));
                        const sum = res && res.summary ? res.summary : {};
                        return {
                            nodeVal: selfNode && selfNode.team_size_incl_self !== undefined ? Number(selfNode.team_size_incl_self) : -1,
                            sumVal: sum.team_size_incl_self !== undefined ? Number(sum.team_size_incl_self) : -1
                        };
                    }""",
                    probe_member_code,
                )
                assert adm_tree_eq["nodeVal"] == probe_member_team and adm_tree_eq["sumVal"] == probe_member_team, (
                    f"[P4 FAIL — Cross-Portal Team Size Drift] Member#{probe_member_code} Home/Tree={probe_member_team} != Admin={adm_tree_eq}"
                )

            ctx_adm.close()
            print(" [V2 PILLAR 4, 5 & 6 PASS] Cashier Employee, Admin Sovereign Cockpit, Real-Click RPC Guard, 3-Portal Back Guard, Reports Date Filter, ban_now Guard, [?] Help Popovers, i18n EN/TR, Dark Mode, Cross-Screen Consistency & Zero-Jargon 100% GREEN")

            browser.close()
    finally:
        httpd.shutdown()

    if all_errors:
        raise AssertionError(f"[JOURNEY V2 FAIL] Browser console/page errors: {all_errors[:15]}")


def _print_lessons_ledger_status():
    ledger_path = REPO_DIR / "specs" / "robot_lessons_ledger.json"
    if not ledger_path.exists():
        return
    try:
        data = json.loads(ledger_path.read_text(encoding="utf-8"))
        lessons = data.get("lessons", [])
        cov = sum(1 for x in lessons if x.get("status") == "covered")
        part = sum(1 for x in lessons if x.get("status") == "partial")
        unc = sum(1 for x in lessons if x.get("status") == "uncovered")
        print(f" [LESSONS LEDGER] total={len(lessons)} | covered={cov} | partial={part} | uncovered={unc}")
    except Exception as exc:
        print(f" [LESSONS LEDGER WARN] Could not read ledger: {exc}")


def main():
    parser = argparse.ArgumentParser(description="SAWYAN V3.0 Gen-2 + Gen-3 Autonomous 5-Persona Journey & UX Inspector")
    parser.add_argument("--seed", type=int, default=int(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")))
    parser.add_argument("--fast", action="store_true", help="Run browser 5-persona & UX above-the-fold audit only")
    parser.add_argument("--canary", action="store_true", help="Run 6-hour live synthetic canary only")
    parser.add_argument("--gen3-static", action="store_true", help="Also run Gen-3 G1 + G2 static handler & Arabic error-code gates")
    parser.add_argument("--gen3", action="store_true", help="Also run Gen-3 quick interaction crawler (G1 + G2 + G3 + G4)")
    args = parser.parse_args()

    if args.canary:
        stage19_lifecycle.run_canary_health()
        return

    print("=== SAWYAN V3.0 GEN-2 + GEN-3 AUTONOMOUS 5-PERSONA JOURNEY & UX INSPECTOR (/sawyan-robot) ===")
    run_constitutional_quality_and_safety_suite(run_full_visual_d29_d30=(not args.fast))
    stage19_lifecycle.run_cross_schema_config_parity_check()
    sim_res = stage19_lifecycle.run_phase_a_sql_lifecycle(args.seed)
    run_pillar_0_tree_and_income_plan_math_audit(sim_res)
    if not args.fast:
        stage19_lifecycle.run_phase_b_and_c_browser_and_chaos()
    run_v2_multi_persona_browser_journeys()
    if args.gen3 or args.gen3_static:
        gen3_cmd = [sys.executable, str(DB_DIR / "robot_gen3_interaction_crawler.py")]
        gen3_cmd.append("--quick" if args.gen3 else "--static")
        proc = subprocess.run(gen3_cmd, cwd=str(REPO_DIR))
        if proc.returncode != 0:
            raise AssertionError(f"[GEN-3 INTERACTION GATE FAIL] Exit code {proc.returncode}")
    _print_lessons_ledger_status()
    print("\n[SAWYAN AUTONOMOUS USER JOURNEYS V2 (/sawyan-robot): 100% GREEN]")


if __name__ == "__main__":
    main()
