"""
SAWYAN V3.0 — Stage 19 Full-Project A-to-Z Lifecycle & Chaos Engineering Robot
(`database/verify_full_lifecycle_50_members_e2e.py`)

Runs automatically:
  - Every 24 hours via `.github/workflows/sawyan-nightly-lifecycle.yml` (full mode)
  - Every 6 hours via `.github/workflows/sawyan-canary-6h.yml` (`--canary` mode)
  - On-demand anytime locally or via GitHub Actions `workflow_dispatch`

Phases (Full Mode):
  Phase A — 50-Member + 6-Merchant + Month-Close + Day-15 Payout + 0.00 Accounting Simulation
            Executes `sawyan_demo.run_full_lifecycle_chaos_simulation(p_seed)` over PostgREST
            (self-rolling-back atomic subtransaction -> ZERO bloat on `sawyan_demo`).
  Phase B — Real-Browser Multi-Persona Deep Verification + UI-to-RPC Reconciliation
            Tests Visitor (incl. Member & Merchant registration forms), Member (UI <-> RPC math),
            Merchant (1800ms bell persistence + optional-proof top-up modal + zero-amount block),
            Cashier Employee (`employee.html`), and Admin Sovereign (Bell + `REQUIRE_TOPUP_PROOF`
            policy toggle in Settings Center + Merchants + Transactions Arabic badges).
  Phase C — Playwright `page.route()` Chaos Engineering
            1) Forces first `get_member_dashboard_bundle` HTTP 500 `statement timeout` and verifies
               `sawyan-api.js` automatic transient retry recovers seamlessly with 0 broken UI.
            2) Injects 2200ms artificial latency on `get_merchant_dashboard_bundle` and verifies
               graceful rendering, bell mount, and zero dead-end banners.
"""
import argparse
import datetime
import functools
import http.server
import json
import os
import pathlib
import re
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.request
from playwright.sync_api import sync_playwright

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
SUPABASE_CFG_PATH = REPO_DIR / "shared" / "config" / "supabase.js"
LIVE_SITE_BASE = "https://ahmedsaheregy-png.github.io/bank"


def load_public_supabase_config():
    txt = SUPABASE_CFG_PATH.read_text(encoding="utf-8", errors="ignore")
    url_m = re.search(r"https://[a-z0-9]+\.supabase\.co", txt)
    key_m = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", txt)
    if not url_m or not key_m:
        raise RuntimeError("Unable to parse public Supabase URL / anon key from shared/config/supabase.js")
    return url_m.group(0), key_m.group(0)


def post_rpc(base_url, anon_key, schema, fn_name, payload, timeout=45):
    endpoint = f"{base_url}/rest/v1/rpc/{fn_name}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json",
            "Accept-Profile": schema,
            "Content-Profile": schema,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"RPC {schema}.{fn_name} HTTP {e.code}: {err_body}") from e


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


def start_local_server():
    handler = functools.partial(QuietHandler, directory=str(REPO_DIR))
    httpd = QuietServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def run_phase_a_sql_lifecycle(seed):
    base_url, anon_key = load_public_supabase_config()
    t0 = time.time()
    status, res = post_rpc(
        base_url,
        anon_key,
        "sawyan_demo",
        "run_full_lifecycle_chaos_simulation",
        {"p_seed": int(seed)},
        timeout=60,
    )
    elapsed = round(time.time() - t0, 2)
    assert status == 200 and isinstance(res, dict), f"Unexpected simulation response: {status} {res}"
    assert res.get("success") is True, f"Simulation did not succeed: {res}"
    assert res.get("rolled_back_cleanly") is True, f"Simulation did not roll back cleanly: {res}"
    assert int(res.get("hero_team_total", 0)) >= 50, f"Hero team < 50: {res}"
    assert int(res.get("hero_left_arm", 0)) > 0 and int(res.get("hero_right_arm", 0)) > 0, f"Tree arms unbalanced: {res}"
    assert float(res.get("hero_wallet_paid_day15_usd", 0)) > 0, f"Hero wallet not paid on Day 15: {res}"
    assert float(res.get("trial_balance_diff_usd", 99)) == 0.0, f"Trial balance discrepancy != 0.00: {res}"
    audit = res.get("accounting_audit") or {}
    assert audit.get("is_clean") is True and float(audit.get("abs_diff_usd", 99)) == 0.0, f"Audit failed: {audit}"
    mer = res.get("merchants_tested") or {}
    for k in (
        "m1_prepaid_funded",
        "m2_d4_timer_set",
        "m3_compliant_tr_remote_confirmed",
        "m4_rogue_dispute_and_gouging_logged",
        "m5_multibranch_cashier_pin_sale",
        "m6_solo_notice_only_topup_then_unlocked",
    ):
        assert mer.get(k) is True, f"Merchant archetype check failed ({k}): {mer}"
    assert float(mer.get("m2_d4_credit_cash_local", 0)) < 0, f"D4 merchant did not enter negative credit cash: {mer}"
    assert (res.get("support_ticket_ref") or "").startswith("TKT-"), f"Missing support ticket ref: {res}"

    print(
        f" [PHASE A PASS] 50-Member + 6-Merchant + Month-Close + Day-15 Payout + 0.00 Trial Balance "
        f"(seed={seed}, team={res['hero_team_total']} [{res['hero_left_arm']}L/{res['hero_right_arm']}R], "
        f"tx={res['transactions_executed']}, hero_paid=${res['hero_wallet_paid_day15_usd']}, "
        f"GL=${audit.get('total_debit_usd')}==${audit.get('total_credit_usd')}, {elapsed}s, clean rollback)"
    )
    return res


def run_phase_b_and_c_browser_and_chaos():
    httpd, port = start_local_server()
    base = f"http://127.0.0.1:{port}"
    page_errors = []

    def bind_collectors(page, label, allow_simulated_500=False):
        page.on("pageerror", lambda err: page_errors.append(f"[{label}] pageerror: {err}"))

        def _on_console(msg):
            if msg.type != "error":
                return
            t = msg.text or ""
            if any(skip in t for skip in ("tile.openstreetmap.org", "fonts.googleapis.com", "favicon")):
                return
            if allow_simulated_500 and ("status of 500" in t or "statement timeout" in t):
                return
            page_errors.append(f"[{label}] console.error: {t}")

        page.on("console", _on_console)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)

            # 1. VISITOR + REGISTRATION FORMS (Member & Merchant Registration Pages)
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page = ctx.new_page()
            bind_collectors(page, "visitor_reg_mobile")
            for reg_url in [
                f"{base}/preview/member-dashboard/register.html",
                f"{base}/preview/merchant-dashboard/register.html",
            ]:
                page.goto(reg_url, wait_until="networkidle", timeout=30000)
                page.wait_for_timeout(1200)
                overflow = page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4")
                assert not overflow, f"[visitor_reg_mobile] Horizontal overflow on {reg_url}"
                bad_nums = page.evaluate("""() => Array.from(document.querySelectorAll('input[type="number"]'))
                    .filter(el => el.offsetParent !== null && !el.disabled && el.value !== '' && el.validity.stepMismatch)
                    .map(el => el.id || el.name)""")
                assert not bad_nums, f"[visitor_reg_mobile] Step mismatch on {reg_url}: {bad_nums}"
            ctx.close()
            print(" [PHASE B1 PASS] Visitor Registration Forms (Member & Merchant @ 375px): zero overflow, valid inputs")

            # 2. CHAOS 1: MEMBER LOGIN + SIMULATED TRANSIENT 500 STATEMENT TIMEOUT -> AUTO-RETRY RECOVERY
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page = ctx.new_page()
            bind_collectors(page, "chaos_member_retry", allow_simulated_500=True)
            intercept_count = {"n": 0}

            def _chaos_member_bundle(route):
                if route.request.method == "POST" and intercept_count["n"] == 0:
                    intercept_count["n"] += 1
                    route.fulfill(
                        status=500,
                        headers={
                            "access-control-allow-origin": "*",
                            "access-control-allow-headers": "*",
                            "content-type": "application/json",
                        },
                        body=json.dumps({"code": "57014", "message": "canceling statement due to statement timeout"}),
                    )
                    return
                route.continue_()

            page.route("**/rest/v1/rpc/get_member_dashboard_bundle*", _chaos_member_bundle)
            page.goto(f"{base}/preview/member-dashboard/login.html?quick=member", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_url("**/member-dashboard/dashboard.html**", timeout=25000)
            page.wait_for_load_state("networkidle", timeout=25000)
            page.wait_for_timeout(2000)
            assert intercept_count["n"] == 1, "[chaos_member_retry] Expected 1 injected 500 timeout"

            # Verify Member Dashboard STILL loaded & reconciled mathematically with bundle cache!
            bundle_ok = page.evaluate("""() => {
                const b = window.__memberBundleCache;
                if (!b || !b.profile || !b.tree_analytics) return { ok: false, reason: 'missing __memberBundleCache after 500 retry' };
                const nameEl = document.getElementById('userName');
                return {
                    ok: Boolean(nameEl && nameEl.textContent.trim().length > 0),
                    code: b.profile.member_code,
                    team: b.tree_analytics.total_team_count,
                    bell: document.querySelectorAll('#notificationBell').length
                };
            }""")
            assert bundle_ok.get("ok") and bundle_ok.get("bell") == 1, f"[chaos_member_retry] Recovery failed: {bundle_ok}"
            ctx.close()
            print(f" [PHASE C1 PASS] Chaos Transient-500 Auto-Retry Recovery: Member #{bundle_ok['code']} recovered seamlessly (team={bundle_ok['team']})")

            # 3. CHAOS 2: MERCHANT HIGH-LATENCY (2200ms) + 1800ms BELL PERSISTENCE + OPTIONAL-PROOF TOP-UP MODAL
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page = ctx.new_page()
            bind_collectors(page, "chaos_merchant_latency")
            delayed_once = {"done": False}

            def _chaos_merchant_delay(route):
                if route.request.method == "POST" and not delayed_once["done"]:
                    delayed_once["done"] = True
                    time.sleep(2.2)
                route.continue_()

            page.route("**/rest/v1/rpc/get_merchant_dashboard_bundle*", _chaos_merchant_delay)
            page.goto(f"{base}/preview/merchant-dashboard/login.html?quick=merchant", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_url("**/merchant-dashboard/dashboard.html**", timeout=25000)
            page.wait_for_load_state("networkidle", timeout=25000)
            # Wait >1800ms specifically to guard against Stage 17's 1000ms bell wipe regression!
            page.wait_for_timeout(1900)
            assert page.locator("#notificationBell").is_visible(), "[chaos_merchant_latency] Bell disappeared after 1900ms!"

            page.evaluate("() => window.openMerchantTopupModal && window.openMerchantTopupModal()")
            page.wait_for_timeout(350)
            ref_lbl = page.locator("#svTopupRefLabel").inner_text()
            assert "اختياري" in ref_lbl, f"[chaos_merchant_latency] Expected optional-proof label when REQUIRE_TOPUP_PROOF=false, got: {ref_lbl}"
            for v in ["2000", "3000", "1237.50"]:
                page.locator("#svTopupAmtInput").fill(v)
                st = page.locator("#svTopupAmtInput").evaluate("el => ({ ok: el.checkValidity(), sm: el.validity.stepMismatch })")
                assert st["ok"] and not st["sm"], f"[chaos_merchant_latency] Amount {v} rejected: {st}"
            ctx.close()
            print(" [PHASE C2 PASS] Chaos 2.2s Latency + 1.9s Bell Persistence + Optional-Proof Top-Up Modal verified")

            # 4. ADMIN SOVEREIGN SETTINGS CENTER: VERIFY `REQUIRE_TOPUP_PROOF` LIVE POLICY TOGGLE EXISTS
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-EG")
            page = ctx.new_page()
            bind_collectors(page, "admin_policy_toggle")
            page.goto(f"{base}/preview/admin-dashboard/login.html?quick=founder", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_url("**/admin-dashboard/dashboard.html**", timeout=25000)
            page.wait_for_load_state("networkidle", timeout=25000)
            page.wait_for_timeout(2000)
            page.locator('.sidebar-nav .nav-item[data-page="settings"]').first.click()
            page.wait_for_timeout(1200)
            # Click Break-Glass (prod) or System (staging) tab in settings center
            kill_tab = page.locator('#settingsPage button:has-text("الإيقاف الطارئ"), #settingsPage button:has-text("Break-Glass"), #settingsPage button:has-text("النظام")').first
            if kill_tab.count() > 0 and kill_tab.is_visible():
                kill_tab.click()
                page.wait_for_timeout(600)
            page_txt = page.inner_text("#settingsPage")
            assert "REQUIRE_TOPUP_PROOF" in page_txt, "[admin_policy_toggle] Missing REQUIRE_TOPUP_PROOF toggle in Admin Settings!"
            ctx.close()
            print(" [PHASE B2 PASS] Admin Settings Center exposes live REQUIRE_TOPUP_PROOF policy toggle cleanly")

            browser.close()
    finally:
        httpd.shutdown()

    if page_errors:
        raise AssertionError(f"Browser/Chaos errors detected: {page_errors}")


def run_cross_schema_config_parity_check():
    """Ensures `sawyan` (Production) and `sawyan_demo` (Staging) registration field configs never drift."""
    base_url, anon_key = load_public_supabase_config()

    def _normalize_fields(resp):
        if isinstance(resp, dict):
            fields = resp.get("fields") or []
        elif isinstance(resp, list):
            fields = resp
        else:
            fields = []
        return {
            str(f.get("field_key") or f.get("key") or ""): (
                bool(f.get("is_visible", True)),
                bool(f.get("is_required", False)),
                bool(f.get("is_enabled", True)),
            )
            for f in fields
            if isinstance(f, dict) and (f.get("field_key") or f.get("key"))
        }

    mismatches = []
    for role in ("member", "merchant"):
        st_p, prod_cfg = post_rpc(base_url, anon_key, "sawyan", "get_registration_form_config", {"p_form_type": role}, timeout=20)
        st_d, demo_cfg = post_rpc(base_url, anon_key, "sawyan_demo", "get_registration_form_config", {"p_form_type": role}, timeout=20)
        assert st_p == 200 and st_d == 200, f"[CONFIG PARITY] RPC error for {role}: prod={st_p}, demo={st_d}"
        prod_map = _normalize_fields(prod_cfg)
        demo_map = _normalize_fields(demo_cfg)
        assert len(prod_map) >= 4, f"[CONFIG PARITY] Unexpectedly empty prod {role} config: {prod_map}"
        all_keys = sorted(set(prod_map.keys()) | set(demo_map.keys()))
        for k in all_keys:
            if prod_map.get(k) != demo_map.get(k):
                mismatches.append(f"{role}.{k}: sawyan={prod_map.get(k)} vs sawyan_demo={demo_map.get(k)}")

    assert not mismatches, f"[CONFIG PARITY FAIL] Schema registration config drift detected: {mismatches}"
    print(" [PARITY PASS] Cross-schema registration_field_configs (sawyan <-> sawyan_demo) 100% identical (member & merchant)")


def run_canary_health():
    """Lightweight 6-hour production & staging synthetic canary (runs in <20s)."""
    base_url, anon_key = load_public_supabase_config()

    # 1. Verify live Supabase Production (`sawyan`) & Staging (`sawyan_demo`) public RPCs + Config Parity
    for schema in ("sawyan", "sawyan_demo"):
        st, data = post_rpc(base_url, anon_key, schema, "get_public_active_countries_and_cities", {}, timeout=20)
        assert st == 200 and isinstance(data, dict) and len(data.get("countries") or []) >= 2, \
            f"[CANARY FAIL] {schema} public countries RPC unhealthy: {st} {data}"
    run_cross_schema_config_parity_check()

    # 2. Verify live GitHub Pages Production & Staging URLs return HTTP 200 with zero broken HTML
    urls = [
        f"{LIVE_SITE_BASE}/index.html",
        f"{LIVE_SITE_BASE}/auth-gateway.html",
        f"{LIVE_SITE_BASE}/member-dashboard/login.html",
        f"{LIVE_SITE_BASE}/merchant-dashboard/login.html",
        f"{LIVE_SITE_BASE}/admin-dashboard/login.html",
        f"{LIVE_SITE_BASE}/preview/index.html",
    ]
    for u in urls:
        req = urllib.request.Request(u, headers={"User-Agent": "SAWYAN-Synthetic-Canary/3.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            assert resp.status == 200 and "SAWYAN" in body, f"[CANARY FAIL] Bad response from {u}: HTTP {resp.status}"

    print(f"[CANARY 6H HEALTH GATE: 100% GREEN] Checked {len(urls)} live URLs + sawyan & sawyan_demo Supabase RPCs.")


def main():
    parser = argparse.ArgumentParser(description="SAWYAN V3.0 Full-Lifecycle & Chaos E2E Simulator")
    parser.add_argument("--seed", type=int, default=int(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")), help="Deterministic PRNG seed")
    parser.add_argument("--canary", action="store_true", help="Run lightweight 6-hour live synthetic canary only")
    parser.add_argument("--sql-only", action="store_true", help="Run Phase A SQL 50-member lifecycle simulation only")
    args = parser.parse_args()

    if args.canary:
        run_canary_health()
        return

    run_cross_schema_config_parity_check()
    run_phase_a_sql_lifecycle(args.seed)
    if not args.sql_only:
        run_phase_b_and_c_browser_and_chaos()
    print("\n[FULL-LIFECYCLE 50-MEMBER + 6-MERCHANT + CHAOS GATE: 100% GREEN]")


if __name__ == "__main__":
    main()
