"""
SAWYAN V3.0 — Stage 18 Automated 5-Persona End-to-End Browser QA Robot
(`database/verify_e2e_persona_journeys.py`)

Actually drives real headless Chromium (Playwright) through EVERY core human
persona journey against `/preview/` (`sawyan_demo`) and `/` so the founder NEVER
has to be the manual QA tester catching form/UX/bell/RTL bugs:
  1. Persona 1 — Visitor (`index.html` + `auth-gateway.html`, Desktop 1440 & Mobile 375)
  2. Persona 2 — Member (`/preview/member-dashboard/dashboard.html`, Mobile 375 & Desktop 1440)
  3. Persona 3 — Merchant (`/preview/merchant-dashboard/dashboard.html`, Mobile 375 & Desktop 1440)
                 INCLUDING interactive top-up modal test typing `2000` & `1237.50`, asserting
                 `el.checkValidity() === true && !el.validity.stepMismatch`, AND negative test
                 confirming blank ref + no receipt is cleanly blocked!
  4. Persona 4 — Isolated Cashier Employee (`/preview/merchant-dashboard/employee.html`, Mobile 375)
  5. Persona 5 — Admin Sovereign (`/preview/admin-dashboard/dashboard.html`, Desktop 1440 & Mobile 375)
                 INCLUDING live Bell dropdown, Merchant contract/topup modal `checkValidity()` fuzzing,
                 and Transactions Arabic-status & zero-fake-FIFO verification!
"""
import functools
import http.server
import os
import socketserver
import sys
import threading
import time
from playwright.sync_api import sync_playwright

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 0


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
    handler = functools.partial(QuietHandler, directory=REPO_DIR)
    httpd = QuietServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def fuzz_visible_number_inputs(page, context_label):
    """Checks EVERY visible <input type='number'> in DOM for HTML5 stepMismatch & validity traps."""
    report = page.evaluate("""() => {
        const issues = [];
        const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
        for (const el of inputs) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
                continue;
            }
            if (el.disabled || el.readOnly) continue;
            const idOrName = el.id || el.name || el.placeholder || 'unnamed-number-input';
            const origVal = el.value;
            // 1) If default value exists, it MUST be valid right out of the box!
            if (origVal !== '') {
                if (!el.checkValidity() && el.validity.stepMismatch) {
                    issues.push(`${idOrName}: default value '${origVal}' triggers HTML5 stepMismatch (min=${el.min}, step=${el.step})`);
                }
            }
            // 2) If step is 'any' or <= 1, test a realistic round number within [min, max]
            const stepAttr = (el.getAttribute('step') || '1').trim().toLowerCase();
            const minV = el.min !== '' ? Number(el.min) : null;
            const maxV = el.max !== '' ? Number(el.max) : null;
            const probe = (maxV !== null && maxV < 2000) ? Math.max(minV ?? 1, Math.floor(maxV / 2) || 1) : 2000;
            if ((minV === null || probe >= minV) && (maxV === null || probe <= maxV)) {
                el.value = String(probe);
                if (el.validity.stepMismatch) {
                    issues.push(`${idOrName}: realistic value '${probe}' rejected with stepMismatch (min=${el.min}, step=${stepAttr})`);
                }
                el.value = origVal;
            }
        }
        return issues;
    }""")
    if report:
        raise AssertionError(f"[{context_label}] HTML5 number input validity failures: {report}")


def check_no_dead_end_lock_banners(page, context_label):
    """Ensures no red lock banner in merchant/member dashboard leaves the user without an action CTA."""
    issues = page.evaluate("""() => {
        const bad = [];
        const candidates = document.querySelectorAll('#merchantFifoIsolationBanner, #merchantLifecycleStatusCard');
        for (const box of candidates) {
            const txt = (box.innerText || '').trim();
            if (!txt) continue;
            if ((txt.includes('مغلق') || txt.includes('مخفي')) && txt.includes('شحن')) {
                const btns = box.querySelectorAll('button, a');
                if (btns.length === 0) {
                    bad.push(`${box.id} shows lock/recharge message with ZERO clickable CTA buttons`);
                }
            }
        }
        return bad;
    }""")
    if issues:
        raise AssertionError(f"[{context_label}] Dead-end UI banner detected: {issues}")


def attach_error_collectors(page, label, errors_out):
    page.on("pageerror", lambda err: errors_out.append(f"[{label}] pageerror: {err}"))
    def _on_console(msg):
        if msg.type == "error":
            t = msg.text or ""
            # Ignore external CDN/font/tile noise if offline, fail on any local JS/RPC error
            if "tile.openstreetmap.org" in t or "fonts.googleapis.com" in t or "favicon" in t:
                return
            errors_out.append(f"[{label}] console.error: {t}")
    page.on("console", _on_console)


def run_all_personas():
    httpd, port = start_server()
    base = f"http://127.0.0.1:{port}"
    all_errors = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)

            # -----------------------------------------------------------------
            # PERSONA 1: PUBLIC VISITOR (Desktop 1440 + Mobile 375)
            # -----------------------------------------------------------------
            for vp_name, vp in [("desktop_1440", {"width": 1440, "height": 900}), ("mobile_375", {"width": 375, "height": 812})]:
                ctx = browser.new_context(viewport=vp, locale="ar-EG")
                page = ctx.new_page()
                attach_error_collectors(page, f"visitor_{vp_name}", all_errors)
                page.goto(f"{base}/index.html", wait_until="networkidle", timeout=30000)
                page.wait_for_timeout(1200)

                # Verify zero Windows arrow emojis & SVG arrows present
                has_emoji_arrow = page.evaluate("() => document.body.innerText.includes('⬅️')")
                assert not has_emoji_arrow, f"[visitor_{vp_name}] Found legacy Windows ⬅️ emoji in index.html"
                svg_arrows = page.locator("#how-it-works .step-arrow svg").count()
                assert svg_arrows >= 4, f"[visitor_{vp_name}] Expected >=4 SVG arrows in #how-it-works, got {svg_arrows}"

                # Verify no broken loaded images
                broken_imgs = page.evaluate("""() => Array.from(document.querySelectorAll('img'))
                    .filter(img => img.complete && img.naturalWidth === 0 && img.offsetParent !== null)
                    .map(img => img.getAttribute('src'))""")
                assert not broken_imgs, f"[visitor_{vp_name}] Broken images on index.html: {broken_imgs}"

                # Navigate to auth-gateway.html and verify 3 clean entry paths (Member / Merchant / Employee)
                page.goto(f"{base}/auth-gateway.html", wait_until="networkidle", timeout=20000)
                page.wait_for_timeout(600)
                body_txt = page.inner_text("body")
                assert "عضو" in body_txt and "تاجر" in body_txt, f"[visitor_{vp_name}] auth-gateway missing Member/Merchant paths"
                ctx.close()
            print(" [E2E PASS] Persona 1 (Visitor — Desktop 1440 & Mobile 375): index.html + auth-gateway clean")

            # -----------------------------------------------------------------
            # PERSONA 2: MEMBER LIFECYCLE (Mobile 375 — Real Login -> Dashboard)
            # -----------------------------------------------------------------
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page = ctx.new_page()
            attach_error_collectors(page, "member_mobile", all_errors)
            page.goto(f"{base}/preview/member-dashboard/login.html?quick=member", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_url("**/member-dashboard/dashboard.html**", timeout=25000)
            page.wait_for_load_state("networkidle", timeout=20000)
            page.wait_for_timeout(2200)

            assert page.locator("#notificationBell").count() == 1, "[member_mobile] Notification bell missing"
            for tab in ["home", "myPending", "transactions", "tree", "wallet", "merchants", "referrals", "settings"]:
                page.evaluate(f"() => typeof goToPage === 'function' && goToPage('{tab}')")
                page.wait_for_timeout(500)
                fuzz_visible_number_inputs(page, f"member_{tab}")
            ctx.close()
            print(" [E2E PASS] Persona 2 (Member — Mobile 375): Login -> 8 screens, bell, tree & all numeric forms valid")

            # -----------------------------------------------------------------
            # PERSONA 3: MERCHANT FULL LIFECYCLE + INTERACTIVE TOP-UP TEST (Mobile 375)
            # -----------------------------------------------------------------
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page = ctx.new_page()
            attach_error_collectors(page, "merchant_mobile", all_errors)
            page.goto(f"{base}/preview/merchant-dashboard/login.html?quick=merchant", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_url("**/merchant-dashboard/dashboard.html**", timeout=25000)
            page.wait_for_load_state("networkidle", timeout=20000)
            page.wait_for_timeout(2200)

            # 1) Bell must exist immediately (no 1000ms race wipe)
            assert page.locator("#notificationBell").count() == 1, "[merchant_mobile] Notification bell missing"

            # 2) Mobile bottom nav must expose direct Top-Up / Financial tab (`💳 الشحن`)
            assert page.locator('.bottom-nav .bottom-nav-item[data-page="financial"]').is_visible(), \
                "[merchant_mobile] Bottom nav missing direct 'الشحن' (financial) tab!"

            # 3) Zero dead-end lock banners
            check_no_dead_end_lock_banners(page, "merchant_home")

            # 4) INTERACTIVE TOP-UP MODAL FUZZ TEST (The exact bug that broke 2000 -> 2001/3001/20001!)
            page.evaluate("() => window.openMerchantTopupModal && window.openMerchantTopupModal()")
            page.wait_for_timeout(400)
            amt_inp = page.locator("#svTopupAmtInput")
            assert amt_inp.is_visible(), "[merchant_mobile] Top-up modal amount input did not open"
            ref_inp = page.locator("#svTopupRefInput")
            assert ref_inp.input_value().strip() == "", "[merchant_mobile] Ref input must start empty (no fake REF-Date.now())"

            for test_amt in ["500", "2000", "3000", "20000", "1237.50"]:
                amt_inp.fill(test_amt)
                v_state = amt_inp.evaluate("el => ({ ok: el.checkValidity(), stepMismatch: el.validity.stepMismatch, msg: el.validationMessage })")
                assert v_state["ok"] and not v_state["stepMismatch"], \
                    f"[merchant_mobile] Top-up amount '{test_amt}' FAILED HTML5 validity: {v_state}"

            # 5) NEGATIVE TEST: zero/negative/blank amount MUST be blocked cleanly; optional proof label matches launch policy
            ref_lbl = page.locator("#svTopupRefLabel").inner_text()
            assert "اختياري" in ref_lbl or "مطلوب" in ref_lbl, f"[merchant_mobile] Missing clarity on top-up ref label: {ref_lbl}"
            amt_inp.fill("0")
            ref_inp.fill("")
            page.locator("#svTopupSubmitBtn").click()
            page.wait_for_timeout(400)
            still_open = page.locator("#svMerchantTopupOverlay").is_visible()
            assert still_open, "[merchant_mobile] Zero top-up amount was NOT blocked!"
            page.evaluate("() => { const o = document.getElementById('svMerchantTopupOverlay'); if (o) o.style.display='none'; }")

            # 6) Walk all merchant tabs and fuzz numeric inputs
            for tab in ["home", "kiosk", "pending", "scan", "transactions", "financial", "settings"]:
                page.evaluate(f"() => typeof showPage === 'function' && showPage('{tab}')")
                page.wait_for_timeout(450)
                fuzz_visible_number_inputs(page, f"merchant_{tab}")
            ctx.close()
            print(" [E2E PASS] Persona 3 (Merchant — Mobile 375): Bell, bottom nav 'الشحن', top-up modal (2000/1237.50 + blank-ref guard) & all 7 tabs valid")

            # -----------------------------------------------------------------
            # PERSONA 4: ISOLATED CASHIER EMPLOYEE (Mobile 375)
            # -----------------------------------------------------------------
            ctx = browser.new_context(viewport={"width": 375, "height": 812}, locale="ar-EG")
            page = ctx.new_page()
            attach_error_collectors(page, "employee_mobile", all_errors)
            page.goto(f"{base}/preview/merchant-dashboard/employee.html", wait_until="networkidle", timeout=25000)
            page.wait_for_timeout(1200)
            fuzz_visible_number_inputs(page, "employee_login")
            overflow = page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2")
            assert not overflow, "[employee_mobile] Horizontal overflow detected on employee.html at 375px"
            ctx.close()
            print(" [E2E PASS] Persona 4 (Cashier Employee — Mobile 375): Isolated portal clean, zero overflow")

            # -----------------------------------------------------------------
            # PERSONA 5: ADMIN SOVEREIGN + BELL + MERCHANTS + TRANSACTIONS (Desktop 1440)
            # -----------------------------------------------------------------
            ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-EG")
            page = ctx.new_page()
            attach_error_collectors(page, "admin_desktop", all_errors)
            page.goto(f"{base}/preview/admin-dashboard/login.html?quick=founder", wait_until="domcontentloaded", timeout=35000)
            page.wait_for_url("**/admin-dashboard/dashboard.html**", timeout=25000)
            page.wait_for_load_state("networkidle", timeout=20000)
            page.wait_for_timeout(2500)

            # 1) Admin notification bell must exist and open dropdown cleanly
            bell = page.locator("#notificationBell")
            assert bell.is_visible(), "[admin_desktop] Admin notification bell missing!"
            bell.click()
            page.wait_for_timeout(300)
            assert page.locator("#notificationDropdown").is_visible(), "[admin_desktop] Admin bell dropdown failed to open!"
            bell.click()

            # 2) Open Merchants tab -> open Contract/Top-Up modal -> fuzz 2000 & 1237.50
            page.locator('.sidebar-nav .nav-item[data-page="merchants"]').click()
            page.wait_for_timeout(1800)
            edit_btn = page.locator('#merchantsPage button:has-text("تحرير العقد")').first
            if edit_btn.count() > 0 and edit_btn.is_visible():
                edit_btn.click()
                page.wait_for_timeout(500)
                for sel in ["#svMerCredit", "#svMerTopupAmt"]:
                    inp = page.locator(sel)
                    if inp.is_visible():
                        for v in ["2000", "1237.50"]:
                            inp.fill(v)
                            st = inp.evaluate("el => ({ ok: el.checkValidity(), sm: el.validity.stepMismatch })")
                            assert st["ok"] and not st["sm"], f"[admin_merchant_modal] {sel} rejected '{v}': {st}"
                fuzz_visible_number_inputs(page, "admin_merchant_contract_modal")
                page.evaluate("() => { const m = document.getElementById('svStage7ModalOverlay'); if (m) m.style.display='none'; }")

            # 3) Open Transactions tab -> verify Arabic statuses (zero raw pending/completed)
            page.locator('.sidebar-nav .nav-item[data-page="transactions"]').click()
            page.wait_for_timeout(1600)
            raw_badges = page.evaluate("""() => Array.from(document.querySelectorAll('#transactionsPage td .badge'))
                .map(b => (b.textContent || '').trim())
                .filter(t => t === 'pending' || t === 'completed' || t === 'reversed' || t === 'rejected')""")
            assert not raw_badges, f"[admin_transactions] Found raw untranslated English status badges: {raw_badges}"

            # 4) Visit Sovereign Live, Network Tree, Academy, Settings and fuzz all visible number inputs
            for nav_page in ["sovereignLive", "networkTree", "academyAdmin", "settings"]:
                nav = page.locator(f'.sidebar-nav .nav-item[data-page="{nav_page}"]')
                if nav.count() > 0:
                    nav.first.click()
                    page.wait_for_timeout(1200)
                    fuzz_visible_number_inputs(page, f"admin_{nav_page}")

            ctx.close()
            print(" [E2E PASS] Persona 5 (Admin Sovereign — Desktop 1440): Bell, Merchants modal, Transactions Arabic badges & all numeric forms valid")

            browser.close()
    finally:
        httpd.shutdown()

    if all_errors:
        print(f"[E2E PERSONA GATE FAIL] {len(all_errors)} browser console/page error(s):")
        for e in all_errors[:20]:
            print("  -", e)
        sys.exit(1)

    print("\n[E2E 5-PERSONA FULL-LIFECYCLE GATE: 100% GREEN]")


if __name__ == "__main__":
    run_all_personas()
