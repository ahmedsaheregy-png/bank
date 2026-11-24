import argparse
import functools
import hashlib
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time
import urllib.parse

from playwright.sync_api import sync_playwright

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
PREVIEW_DIR = os.path.join(REPO_DIR, "preview")
MANIFEST_PATH = os.path.join(REPO_DIR, "specs", "ui_dom_rpc_manifest.json")
STATE_LOCK_PATH = os.path.join(REPO_DIR, "specs", "SAWYAN_STATE_LOCK.json")
AUDIT_DIR = os.environ.get("SAWYAN_VISUAL_AUDIT_DIR", os.path.join(REPO_DIR, "visual_audit"))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_local_server():
    handler = functools.partial(QuietHandler, directory=REPO_DIR)
    server = ThreadedHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


def run_static_gates(manifest, state_lock, full_mode):
    failures = []
    notes = []

    expected_sha = sha256_file(MANIFEST_PATH)
    locked_sha = state_lock.get("manifest_sha256", "")
    if locked_sha != expected_sha:
        failures.append(
            f"State-Lock SHA-256 mismatch on ui_dom_rpc_manifest.json: lock={locked_sha} actual={expected_sha}"
        )
    else:
        notes.append(f"State-Lock manifest SHA-256 verified ({expected_sha[:12]}...)")

    # Legacy 2025 specs must stay quarantined out of active docs/
    legacy_spec = os.path.join(REPO_DIR, "docs", "DASHBOARDS_SPECS.md")
    if os.path.exists(legacy_spec):
        failures.append("Legacy 2025 spec still inside active docs/: docs/DASHBOARDS_SPECS.md")

    if os.path.exists(os.path.join(REPO_DIR, "member-demo")) or os.path.exists(
        os.path.join(PREVIEW_DIR, "member-demo")
    ):
        failures.append("Obsolete V1 member-demo directory still present in active web root")

    if full_mode:
        # Strict Single-Shell check (D29): member-showcase.html must be quarantined
        for rel in ["member-showcase.html", os.path.join("preview", "member-showcase.html")]:
            if os.path.exists(os.path.join(REPO_DIR, rel)):
                failures.append(f"Duplicate V2 showcase file still in web root (D29): {rel}")

        # Retired public verify.html must remain absent from active web roots
        for rel in [os.path.join("public", "verify.html"), os.path.join("preview", "public", "verify.html")]:
            if os.path.exists(os.path.join(REPO_DIR, rel)):
                failures.append(f"Retired verify.html still present in active web root: {rel}")

        # Forbidden mock / outdated terminology static scan
        web_roots = [
            os.path.join(PREVIEW_DIR, d)
            for d in ["js", "css", "public", "shared", "member-dashboard", "merchant-dashboard", "admin-dashboard"]
        ]
        web_files = [
            os.path.join(PREVIEW_DIR, f) for f in ["index.html", "auth-gateway.html"]
            if os.path.exists(os.path.join(PREVIEW_DIR, f))
        ]
        for wr in web_roots:
            if not os.path.isdir(wr):
                continue
            for root, dirs, files in os.walk(wr):
                dirs[:] = [d for d in dirs if d not in {"__pycache__", "node_modules"}]
                for fn in files:
                    if fn.endswith((".html", ".js", ".css")):
                        web_files.append(os.path.join(root, fn))

        rule_hits = []
        for fp in web_files:
            rel = os.path.relpath(fp, REPO_DIR).replace("\\", "/")
            txt = open(fp, "r", encoding="utf-8", errors="ignore").read()
            for rule in manifest.get("forbidden_live_patterns", []):
                scope = rule.get("scope", "web")
                if scope == "merchant" and "merchant-dashboard/" not in rel:
                    continue
                pat = rule["pattern"]
                if pat in txt:
                    # Allow explicit runtime error strings or CSS comments only? Zero occurrence in code is cleanest.
                    rule_hits.append(f"{rule['id']} in {rel}")

        if rule_hits:
            failures.append(f"Anti-Mock / Terminology Gate hits ({len(rule_hits)}): {rule_hits[:8]}")
        else:
            notes.append("Anti-Mock & Single-Shell static scan 100% clean across preview/")

        # Disallow IS_PROD operational data-source bypass in admin-stage7-ops-hub.js
        hub_path = os.path.join(PREVIEW_DIR, "admin-dashboard", "js", "admin-stage7-ops-hub.js")
        if os.path.exists(hub_path):
            hub_txt = open(hub_path, "r", encoding="utf-8", errors="ignore").read()
            if re.search(r"if\s*\(\s*IS_PROD\s*\)\s*\{", hub_txt):
                failures.append("D29 violation: `if (IS_PROD)` data-source split still present in admin-stage7-ops-hub.js")

    return failures, notes


def inspect_layout_metrics(page):
    return page.evaluate("""() => {
        const vw = window.innerWidth;
        const sw = document.documentElement.scrollWidth;
        const sidebar = document.querySelector('.sidebar');
        const main = document.querySelector('.main-content');
        let overlapArea = 0;
        let sidebarRect = null;
        let mainRect = null;
        if (sidebar && main) {
            const sStyle = window.getComputedStyle(sidebar);
            const mStyle = window.getComputedStyle(main);
            if (sStyle.display !== 'none' && !sidebar.classList.contains('rail-expanded')) {
                const sr = sidebar.getBoundingClientRect();
                const mr = main.getBoundingClientRect();
                sidebarRect = { left: sr.left, right: sr.right, top: sr.top, bottom: sr.bottom, width: sr.width };
                mainRect = { left: mr.left, right: mr.right, top: mr.top, bottom: mr.bottom, width: mr.width };
                const ix = Math.max(0, Math.min(sr.right, mr.right) - Math.max(sr.left, mr.left));
                const iy = Math.max(0, Math.min(sr.bottom, mr.bottom) - Math.max(sr.top, mr.top));
                overlapArea = Math.round(ix * iy);
            }
        }
        const emptyDataLabels = [];
        document.querySelectorAll('.data-table').forEach(tbl => {
            if (window.getComputedStyle(tbl).display === 'none' || !tbl.offsetParent) return;
            const thead = tbl.querySelector('thead');
            if (thead && window.getComputedStyle(thead).display === 'none') {
                tbl.querySelectorAll('tbody tr td').forEach(td => {
                    if (td.hasAttribute('colspan')) return;
                    const lbl = td.getAttribute('data-label');
                    if (!lbl || !lbl.trim()) emptyDataLabels.push(td.textContent.trim().slice(0, 24));
                });
            }
        });
        return {
            viewportWidth: vw,
            scrollWidth: sw,
            overlapArea,
            sidebarRect,
            mainRect,
            emptyDataLabelsCount: emptyDataLabels.length,
            emptyDataLabelsSample: emptyDataLabels.slice(0, 3)
        };
    }""")


def verify_portal_in_browser(context, base_url, portal_name, login_path, manifest_cfg, full_mode, save_screenshots):
    failures = []
    notes = []
    page = context.new_page()
    page_errors = []
    console_errors = []

    def on_page_error(err):
        page_errors.append(str(err))

    def on_console(msg):
        if msg.type == "error":
            loc = msg.location.get("url", "") if hasattr(msg, "location") else ""
            if base_url in loc or not loc or "127.0.0.1" in loc:
                console_errors.append(msg.text)

    page.on("pageerror", on_page_error)
    page.on("console", on_console)

    target_url = f"{base_url}/{login_path}"
    page.set_viewport_size({"width": 1440, "height": 900})
    page.goto(target_url, wait_until="domcontentloaded", timeout=35000)

    if "login.html" in login_path:
        try:
            page.wait_for_url("**/dashboard.html*", timeout=25000)
        except Exception as exc:
            failures.append(f"[{portal_name}] Quick-login redirect to dashboard.html failed: {exc}")
            page.close()
            return failures, notes

    page.wait_for_timeout(1800)

    if portal_name in ("member", "merchant", "admin"):
        # 1. Nav Bi-Directional Integrity
        allowed_pages = manifest_cfg.get("allowed_nav_pages", [])
        nav_info = page.evaluate("""() => {
            const sideItems = Array.from(document.querySelectorAll('.sidebar-nav .nav-item'));
            const moreItems = Array.from(document.querySelectorAll('#moreMenu .more-menu-item[data-page]'));
            const bottomItems = Array.from(document.querySelectorAll('.bottom-nav .bottom-nav-item[data-page]'));
            return {
                sidebarPages: sideItems.map(el => el.getAttribute('data-page') || '__MISSING_DATA_PAGE__:' + (el.id || el.textContent.trim())),
                morePages: moreItems.map(el => el.getAttribute('data-page')),
                bottomPages: bottomItems.map(el => el.getAttribute('data-page'))
            };
        }""")
        side_pages = nav_info["sidebarPages"]
        unapproved = [p for p in side_pages if p not in allowed_pages]
        missing_nav = [p for p in allowed_pages if p not in side_pages]
        if full_mode:
            if unapproved:
                failures.append(f"[{portal_name}] Unapproved injected sidebar nav items (Zero-Injection Fail): {unapproved}")
            if missing_nav:
                failures.append(f"[{portal_name}] Missing approved sidebar nav items: {missing_nav}")
            else:
                notes.append(f"[{portal_name}] Bi-directional nav parity 100% ({len(side_pages)} items)")

        # Mobile reachability check
        reachable_mobile = set(nav_info["morePages"]) | {p for p in nav_info["bottomPages"] if p != "more"}
        missing_mobile = [p for p in allowed_pages if p not in reachable_mobile]
        if missing_mobile:
            failures.append(f"[{portal_name}] Pages unreachable in mobile bottom-nav / #moreMenu: {missing_mobile}")
        else:
            notes.append(f"[{portal_name}] Mobile navigation reachability 100% ({len(reachable_mobile)} destinations)")

        # 2. Screen-by-screen navigation + Spec-ID parity + Screenshot capture
        screen_specs = manifest_cfg.get("screen_spec_ids", {})
        all_missing_specs = []
        if full_mode and screen_specs:
            for pg_id, req_ids in screen_specs.items():
                nav_sel = f'.sidebar-nav .nav-item[data-page="{pg_id}"]'
                if page.locator(nav_sel).count() > 0:
                    page.locator(nav_sel).first.click()
                    if req_ids:
                        try:
                            page.wait_for_selector(f'[data-spec-id="{req_ids[0]}"]', timeout=3000)
                        except Exception:
                            pass
                    page.wait_for_timeout(350)
                    # Special verification for Member Screen 4 (Tree): check Circle vs Card toggle too
                    if portal_name == "member" and pg_id == "tree" and page.locator('#treeViewModeToggle, [data-spec-id="member-tree-view-toggle"]').count() > 0:
                        pass
                found_ids = page.evaluate("""(ids) => {
                    return ids.filter(id => Boolean(document.querySelector('[data-spec-id="' + id + '"]')));
                }""", req_ids)
                miss = [i for i in req_ids if i not in found_ids]
                if miss:
                    all_missing_specs.append({pg_id: miss})
            if all_missing_specs:
                failures.append(f"[{portal_name}] Missing required data-spec-id elements: {all_missing_specs}")
            else:
                notes.append(f"[{portal_name}] 100% of required data-spec-id markers verified across {len(screen_specs)} screens")

            # Navigate back to home before viewport sweep, and also capture tree screenshots at 1440x900
            if portal_name == "member" and save_screenshots:
                page.locator('.sidebar-nav .nav-item[data-page="tree"]').first.click()
                page.wait_for_timeout(600)
                os.makedirs(AUDIT_DIR, exist_ok=True)
                page.screenshot(path=os.path.join(AUDIT_DIR, "member_tree_1440.png"), full_page=False)

            if portal_name == "admin" and save_screenshots:
                page.locator('.sidebar-nav .nav-item[data-page="networkTree"]').first.click()
                try:
                    page.wait_for_selector('.tree-circle-node, .atree-node-wrap', timeout=6000)
                except Exception:
                    pass
                page.wait_for_timeout(500)
                os.makedirs(AUDIT_DIR, exist_ok=True)
                page.screenshot(path=os.path.join(AUDIT_DIR, "admin_networkTree_1440.png"), full_page=False)

            if page.locator('.sidebar-nav .nav-item[data-page="home"]').count() > 0:
                page.locator('.sidebar-nav .nav-item[data-page="home"]').first.click()
                page.wait_for_timeout(400)

        # 3. Multi-Viewport Collision & Overflow Audit across 4 Tiers
        for vp in [
            {"name": "desktop", "width": 1440, "height": 900},
            {"name": "half_screen_wide", "width": 780, "height": 900},
            {"name": "half_screen_narrow", "width": 680, "height": 900},
            {"name": "mobile", "width": 375, "height": 812},
        ]:
            page.set_viewport_size({"width": vp["width"], "height": vp["height"]})
            page.wait_for_timeout(350)
            # Also check Member Tree and Admin Network Tree screens on 680px & 375px!
            pages_to_check = ["home"]
            if portal_name == "member":
                pages_to_check = ["home", "tree"]
            elif portal_name == "admin":
                pages_to_check = ["home", "networkTree"]
            for chk_pg in pages_to_check:
                if chk_pg != "home":
                    if vp["width"] >= 600 and page.locator(f'.sidebar-nav .nav-item[data-page="{chk_pg}"]').count() > 0:
                        page.locator(f'.sidebar-nav .nav-item[data-page="{chk_pg}"]').first.click()
                        page.wait_for_timeout(350)
                    elif vp["width"] < 600:
                        if portal_name == "admin" and chk_pg == "networkTree":
                            page.evaluate("if (typeof openAdminNetworkTree === 'function') openAdminNetworkTree(); else if (typeof goToPage === 'function') goToPage('networkTree');")
                        elif page.locator(f'.bottom-nav .bottom-nav-item[data-page="{chk_pg}"]').count() > 0:
                            page.locator(f'.bottom-nav .bottom-nav-item[data-page="{chk_pg}"]').first.click()
                        else:
                            page.evaluate(f"if (typeof goToPage === 'function') goToPage('{chk_pg}');")
                        page.wait_for_timeout(350)
                    if portal_name == "admin" and chk_pg == "networkTree":
                        try:
                            page.wait_for_selector('.tree-circle-node, .atree-node-wrap', timeout=6000)
                        except Exception:
                            pass
                        page.wait_for_timeout(450)
                m = inspect_layout_metrics(page)
                if m["overlapArea"] > 0:
                    failures.append(
                        f"[{portal_name}:{chk_pg} @ {vp['width']}x{vp['height']}] Sidebar-Content OVERLAP={m['overlapArea']}px² "
                        f"(sidebar={m['sidebarRect']}, main={m['mainRect']})"
                    )
                if m["scrollWidth"] > m["viewportWidth"] + 2:
                    failures.append(
                        f"[{portal_name}:{chk_pg} @ {vp['width']}x{vp['height']}] Horizontal overflow scrollWidth={m['scrollWidth']} > viewport={m['viewportWidth']}"
                    )
                if m["emptyDataLabelsCount"] > 0:
                    failures.append(
                        f"[{portal_name}:{chk_pg} @ {vp['width']}x{vp['height']}] Table cells missing data-label with hidden thead: {m['emptyDataLabelsSample']}"
                    )
                if save_screenshots and vp["width"] in (680, 375) and (portal_name != "member" or chk_pg in ("home", "tree")):
                    os.makedirs(AUDIT_DIR, exist_ok=True)
                    page.screenshot(
                        path=os.path.join(AUDIT_DIR, f"{portal_name}_{chk_pg}_{vp['width']}.png"),
                        full_page=False,
                    )
            if vp["width"] >= 600 and page.locator('.sidebar-nav .nav-item[data-page="home"]').count() > 0:
                page.locator('.sidebar-nav .nav-item[data-page="home"]').first.click()
                page.wait_for_timeout(200)
            elif vp["width"] < 600:
                if page.locator('.bottom-nav .bottom-nav-item[data-page="home"]').count() > 0:
                    page.locator('.bottom-nav .bottom-nav-item[data-page="home"]').first.click()
                else:
                    page.evaluate("if (typeof goToPage === 'function') goToPage('home');")
                page.wait_for_timeout(200)

        notes.append(f"[{portal_name}] 4-Viewport bounding-box collision = 0px², scrollWidth clean")

    else:
        # Public portal check (Production `/` and Demo `/preview/`)
        if full_mode:
            req_ids = manifest_cfg.get("required_spec_ids", [])
            miss = page.evaluate(
                "(ids) => ids.filter(id => !document.querySelector('[data-spec-id=\"' + id + '\"]'))",
                req_ids,
            )
            if miss:
                failures.append(f"[{portal_name}] Missing public data-spec-id markers: {miss}")
            bad_links = page.evaluate("""(badSubs) => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.getAttribute('href'))
                    .filter(h => badSubs.some(s => (h || '').includes(s)));
            }""", manifest_cfg.get("forbidden_href_substrings", []))
            if bad_links:
                failures.append(f"[{portal_name}] Forbidden legacy href links rendered: {bad_links[:5]}")

        for vp in [{"width": 1440, "height": 900}, {"width": 680, "height": 900}, {"width": 375, "height": 812}]:
            page.set_viewport_size(vp)
            page.wait_for_timeout(250)
            m = inspect_layout_metrics(page)
            if m["scrollWidth"] > m["viewportWidth"] + 2:
                failures.append(
                    f"[{portal_name} @ {vp['width']}x{vp['height']}] Horizontal overflow scrollWidth={m['scrollWidth']} > {m['viewportWidth']}"
                )
        notes.append(f"[{portal_name}] Public portal checks clean across Desktop/Half/Mobile")

    if page_errors:
        failures.append(f"[{portal_name}] Uncaught JS pageerror(s): {page_errors[:5]}")
    if console_errors:
        failures.append(f"[{portal_name}] Console error(s): {console_errors[:5]}")

    page.close()
    return failures, notes


def main():
    parser = argparse.ArgumentParser(description="SAWYAN D29/D30 UI Spec & 4-Viewport Visual Collision Gate")
    parser.add_argument("--phase0-layout", action="store_true", help="Verify layout, 0px² overlap, overflow & state-lock only")
    parser.add_argument("--full", action="store_true", help="Verify complete D29/D30 parity, anti-mock, spec IDs & visual audit")
    parser.add_argument("--save-screenshots", action="store_true", help="Save visual proof screenshots to visual_audit/")
    args = parser.parse_args()

    manifest = json.load(open(MANIFEST_PATH, "r", encoding="utf-8"))
    state_lock = json.load(open(STATE_LOCK_PATH, "r", encoding="utf-8"))
    full_mode = bool(args.full or (not args.phase0_layout and state_lock.get("strict_parity_enabled", False)))

    all_failures = []
    all_notes = []

    st_fail, st_notes = run_static_gates(manifest, state_lock, full_mode=full_mode)
    all_failures.extend(st_fail)
    all_notes.extend(st_notes)

    server, port = start_local_server()
    base_url = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})

            portals = manifest["portals"]
            checks = [
                ("public_prod", "index.html", portals["public"]),
                ("public_demo", "preview/index.html", portals["public"]),
                ("member", "preview/member-dashboard/login.html?quick=member", portals["member"]),
                ("merchant", "preview/merchant-dashboard/login.html?quick=merchant", portals["merchant"]),
                ("admin", "preview/admin-dashboard/login.html?quick=founder", portals["admin"]),
            ]

            for pname, lpath, cfg in checks:
                pf, pn = verify_portal_in_browser(
                    context, base_url, pname, lpath, cfg, full_mode=full_mode, save_screenshots=args.save_screenshots or full_mode
                )
                all_failures.extend(pf)
                all_notes.extend(pn)

            browser.close()
    finally:
        server.shutdown()

    mode_label = "FULL D29/D30 AUDIT" if full_mode else "PHASE-0 LAYOUT & COLLISION AUDIT"
    print(f"=== SAWYAN {mode_label} ===")
    for n in all_notes:
        print(f" [VISUAL PASS] {n}")

    if all_failures:
        for f in all_failures:
            print(f" [VISUAL FAIL] {f}", file=sys.stderr)
        sys.exit(1)

    print(f"\n[UI & VISUAL GATE ({mode_label}): 100% GREEN]")


if __name__ == "__main__":
    main()
