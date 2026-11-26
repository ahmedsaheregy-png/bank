"""
SAWYAN V3.0 — /sawyan-robot Generation-3: Behavioral Interaction Crawler & Contract Gates
(`database/robot_gen3_interaction_crawler.py`)

WHY THIS EXISTS (root cause of the "naive bugs" the Founder keeps finding by hand):
  Gen-2 verified that screens *load* and that a hand-picked list of elements *exist*.
  It almost never *pressed* the buttons a real user presses. Every bug below only
  appears AFTER a click, so Gen-2 stayed GREEN while the Founder found them on his phone:
    - Flash Offer popup buttons called an undefined `closeMemberModal()`  -> ReferenceError on click
    - "تأكيد وإرسال" rendered on an info-only modal with `onSubmit = null` -> TypeError on click
    - Mobile hamburger opened a dark overlay but the drawer stayed off-screen -> frozen screen
    - Raw `RPC[...] failed: MERCHANT_SOFT_HOLD_CAP_20PCT_EXCEEDED` shown to Arabic users
    - Tree Studio rendered "تعذر تحميل الشجرة: totalTeamCount is not defined" and Gen-2 PASSED it

  Gen-3 generalises instead of patching one element at a time. It adds four gates:

  G1  Inline-Handler Integrity (static + live):
      Every `onclick="fn(...)"` / `onchange=` / `onsubmit=` written in HTML or JS templates
      must resolve to a real global function in the page that loads it.

  G2  Error-Code Arabic Coverage:
      Every `RAISE EXCEPTION 'CODE'` in database/*.sql is fed to `SAWYAN.UI.humanizeError`.
      Zero raw codes may leak; member/merchant-facing codes must get a *specific* Arabic
      message (not the generic fallback).

  G3  Universal Click Crawler (behavioral, sandboxed):
      Logs in as Visitor / Member / Merchant / Admin on mobile 375px (and desktop for admin),
      opens every tab, and presses one representative of EVERY distinct clickable element.
      After each press it fails on: uncaught JS exception, native alert/confirm/prompt,
      raw technical/English error text on screen, or a FROZEN screen (a full-screen overlay
      with no visible content inside the viewport). All database writes are blocked by a
      network sandbox, so the crawler can press "approve / reject / submit" safely.

  G4  Visible Error-Text Detector (shared with Gen-2 `audit_screen_purity`):
      Screens that render "is not defined", "TypeError", "RPC[", "failed: CODE",
      or "تعذر تحميل" can never pass again.

Usage:
  python database/robot_gen3_interaction_crawler.py                 # G1 + G2 + G3 (full crawl)
  python database/robot_gen3_interaction_crawler.py --static        # G1 static + G2 only (seconds)
  python database/robot_gen3_interaction_crawler.py --quick         # G3 capped at 12 clicks / tab
  python database/robot_gen3_interaction_crawler.py --portal member # crawl one portal only
"""

import argparse
import json
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

DB_DIR = pathlib.Path(__file__).resolve().parent
REPO_DIR = DB_DIR.parent
PREVIEW_DIR = REPO_DIR / "preview"
REPORT_DIR = REPO_DIR / "visual_audit"
LEDGER_PATH = REPO_DIR / "specs" / "robot_lessons_ledger.json"
ALLOWLIST_PATH = REPO_DIR / "specs" / "robot_gen3_allowlist.json"

if str(DB_DIR) not in sys.path:
    sys.path.insert(0, str(DB_DIR))

import verify_autonomous_user_journeys_v2 as gen2  # noqa: E402  (reuses the quiet local server)

# ---------------------------------------------------------------------------
# Shared patterns
# ---------------------------------------------------------------------------
VISIBLE_ERROR_PATTERNS = [
    r"is not defined",
    r"is not a function",
    r"Cannot read propert",
    r"\bTypeError\b",
    r"\bReferenceError\b",
    r"\bSyntaxError\b",
    r"RPC\[",
    r"\bfailed:\s*[A-Z][A-Z0-9_]{3,}",
    r"تعذر تحميل",
    r"\[object Object\]",
]
RAW_CODE_PATTERN = r"\b[A-Z]{3,}_[A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b"

JS_NON_GLOBAL_CALLS = {
    "if", "for", "while", "switch", "return", "function", "typeof", "new", "void", "catch",
    "event", "this", "document", "window", "navigator", "location", "history", "Math", "JSON",
    "Object", "Array", "Number", "String", "Boolean", "Date", "console", "parseInt", "parseFloat",
    "encodeURIComponent", "decodeURIComponent", "setTimeout", "setInterval", "clearTimeout",
    "isNaN", "isFinite", "Promise", "alert", "confirm", "prompt", "open", "print", "fetch",
    "localStorage", "sessionStorage", "requestAnimationFrame", "getComputedStyle", "scrollTo",
}

# Elements the crawler must never press (they end the session or leave the sandbox)
CRAWL_SKIP_TEXT = r"تسجيل الخروج|خروج|logout|sign out|Production|الموقع الأصلي"
CRAWL_SKIP_SELECTOR = (
    ".sawyan-lang-btn, [data-lang], .sidebar-nav *, .bottom-nav *, .bottom-nav-item, "
    "a[href^='http'], a[href^='tel:'], a[href^='mailto:'], a[href*='wa.me'], a[download], "
    "a[target='_blank'], a[href*='login.html'], a[href*='logout'], .logout, [onclick*='logout'], "
    "[onclick*='Logout'], input[type='file']"
)

# Read-only RPC prefixes allowed through the write sandbox
READ_RPC_PREFIX = re.compile(
    r"^(get_|search_|list_|lookup_|verify_|authenticate_|compute_|check_|public_|fetch_|calc_|preview_|resolve_)"
)
ALWAYS_READ_RPCS = {"merchant_shift_closing_guarded"}
MULTI_ACTION_READ_ACTIONS = {
    "admin_manage_academy_and_categories": {"list"},
    "admin_manage_academy_lms": {"list"},
    "admin_manage_country_cities": {"list"},
    "admin_manage_registration_fields": {"list"},
    "admin_manage_root_leaders": {"list"},
    "admin_manage_staff_accounts": {"list"},
    "admin_search_and_reply_ops": {"search"},
    "merchant_manage_branches_and_refunds": {"list_branches"},
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


ALLOW = load_json(ALLOWLIST_PATH, {"handlers": {}, "error_codes_generic_ok": {}, "crawl_findings": {}})


def strip_template_interpolations(code):
    out, depth, i = [], 0, 0
    while i < len(code):
        if code.startswith("${", i):
            depth += 1
            i += 2
            continue
        if depth and code[i] == "{":
            depth += 1
        elif depth and code[i] == "}":
            depth -= 1
            i += 1
            continue
        if not depth:
            out.append(code[i])
        i += 1
    return "".join(out)


HANDLER_ATTR_RE = re.compile(
    r"\bon(?:click|change|input|submit|keydown|keyup|blur|focus|mouseover|mouseenter|touchstart)\s*=\s*\\?([\"'])(.*?)\\?\1",
    re.S,
)
CALL_RE = re.compile(r"(?<![\w$.\]\)])((?:window\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(")


def extract_handler_calls(text):
    calls = set()
    for m in HANDLER_ATTR_RE.finditer(text):
        code = strip_template_interpolations(m.group(2))
        # drop JS string-concatenation segments ('...' + esc(x) + '...') that belong to the
        # surrounding template builder, not to the handler itself
        code = re.sub(r"\\?(['\"])\s*\+.*?\+\s*\\?\1", "''", code)
        code = re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", "''", code)
        local_vars = set(re.findall(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)", code))
        for cm in CALL_RE.finditer(code):
            expr = cm.group(1)
            root = expr.split(".")[0]
            if root in local_vars:
                continue
            if root in JS_NON_GLOBAL_CALLS and not expr.startswith("window."):
                continue
            if expr.startswith("window."):
                expr = expr[len("window."):]
                if expr.split(".")[0] in JS_NON_GLOBAL_CALLS:
                    continue
            calls.add(expr)
    return calls


def page_local_sources(html_path):
    html = html_path.read_text(encoding="utf-8", errors="ignore")
    srcs = [html_path]
    for m in re.finditer(r"<script[^>]+src=\"([^\"]+)\"", html):
        src = m.group(1).split("?")[0]
        if src.startswith("http"):
            continue
        p = (html_path.parent / src).resolve()
        if p.exists() and p.suffix == ".js":
            srcs.append(p)
    return srcs


# ---------------------------------------------------------------------------
# G1 — Inline handler integrity
# ---------------------------------------------------------------------------
G1_PAGES = [
    ("preview/index.html", None),
    ("preview/auth-gateway.html", None),
    ("preview/public/merchants.html", None),
    ("preview/public/contact.html", None),
    ("preview/member-dashboard/dashboard.html", "member"),
    ("preview/merchant-dashboard/dashboard.html", "merchant"),
    ("preview/merchant-dashboard/employee.html", None),
    ("preview/admin-dashboard/dashboard.html", "admin"),
]


def run_g1_handler_integrity(pw_browser, base, login_fn):
    findings = []
    for rel, portal in G1_PAGES:
        html_path = REPO_DIR / rel
        calls_by_file = {}
        for src in page_local_sources(html_path):
            c = extract_handler_calls(src.read_text(encoding="utf-8", errors="ignore"))
            if c:
                calls_by_file[src.relative_to(REPO_DIR).as_posix()] = c
        all_calls = sorted({c for s in calls_by_file.values() for c in s})
        if not all_calls:
            continue
        ctx = pw_browser.new_context(viewport={"width": 1280, "height": 860}, locale="ar-EG")
        page = ctx.new_page()
        redirected = False
        try:
            if portal:
                login_fn(page, base, portal)
            else:
                page.goto(f"{base}/{rel}", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(1200)
                if pathlib.PurePosixPath(rel).name not in page.url:
                    redirected = True
            if not redirected:
                missing = page.evaluate(
                    """(names) => names.filter(n => {
                        try { return typeof (0, eval)(n) !== 'function'; }
                        catch (e) { return true; }
                    })""",
                    all_calls,
                )
        finally:
            ctx.close()
        allowed = set(ALLOW.get("handlers", {}).get(rel, []))
        if redirected:
            declared = set()
            for src in page_local_sources(html_path):
                txt = src.read_text(encoding="utf-8", errors="ignore")
                declared.update(re.findall(r"(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(", txt))
                declared.update(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=", txt))
            static_missing = []
            for name in all_calls:
                if name in allowed:
                    continue
                root = name.split(".")[0]
                if name not in declared and root not in declared:
                    static_missing.append(name)
            if static_missing:
                for name in static_missing:
                    files = [f for f, cs in calls_by_file.items() if name in cs]
                    findings.append({"gate": "G1", "severity": "FAIL", "mode": "static_fallback", "page": rel, "handler": name, "used_in": files})
            else:
                findings.append({"gate": "G1", "severity": "INFO", "mode": "static_fallback", "page": rel, "handler": f"({len(all_calls)} handler(s) verified statically; session required for live check)", "used_in": []})
            continue
        for name in missing:
            if name in allowed:
                continue
            files = [f for f, cs in calls_by_file.items() if name in cs]
            findings.append({"gate": "G1", "severity": "FAIL", "page": rel, "handler": name, "used_in": files})
    return findings


# ---------------------------------------------------------------------------
# G2 — Error code Arabic coverage
# ---------------------------------------------------------------------------
USER_FACING_FN = re.compile(
    r"^(submit_member|member_|merchant_|register_|authenticate_member|authenticate_merchant|employee_|"
    r"request_|cancel_|get_member|get_merchant|verify_member|verify_merchant|search_|lookup_|"
    r"update_member|update_merchant|create_member|submit_merchant|redeem_|apply_|open_dispute|"
    r"submit_support|submit_price|submit_return|pos_|submit_pos)"
)


def collect_sql_error_codes():
    code_fns = {}
    fn_re = re.compile(r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:[\w%$]+\.)?(\w+)\s*\(", re.I)
    for sql in sorted((REPO_DIR / "database").glob("*.sql")):
        text = sql.read_text(encoding="utf-8", errors="ignore")
        chunks = re.split(
            r"(?=CREATE\s+OR\s+REPLACE\s+FUNCTION|(?:REVOKE\s+ALL|GRANT\s+EXECUTE)\s+ON\s+FUNCTION|DO\s+\$[A-Za-z0-9_]*\$)",
            text,
            flags=re.I,
        )
        for ch in chunks:
            fm = fn_re.search(ch[:400])
            fn = fm.group(1) if fm else "(migration_block)"
            for cm in re.finditer(r"RAISE\s+EXCEPTION\s+'([A-Z][A-Z0-9_]{3,})", ch):
                code_fns.setdefault(cm.group(1), set()).add(fn)
    return code_fns


def run_g2_error_coverage(pw_browser, base):
    code_fns = collect_sql_error_codes()
    ctx = pw_browser.new_context()
    page = ctx.new_page()
    page.goto(f"{base}/preview/public/contact.html", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_function("() => window.SAWYAN && window.SAWYAN.UI && window.SAWYAN.UI.humanizeError", timeout=15000)
    results = page.evaluate(
        """(codes) => {
            const H = window.SAWYAN.UI.humanizeError;
            const generic = H('RPC[x] failed: ZZZ_ROBOT_UNKNOWN_CODE_ZZZ');
            return codes.map(c => {
                const a = H('RPC[some_rpc] failed: ' + c);
                const b = H({ message: c + ': technical detail text' });
                const leak = [a, b].some(s => s.includes(c) || s.includes('RPC[') || !/[\\u0600-\\u06FF]/.test(s));
                return { code: c, msg: a, leak, generic: a === generic };
            });
        }""",
        sorted(code_fns.keys()),
    )
    ctx.close()
    ok_generic = set(ALLOW.get("error_codes_generic_ok", {}).keys())
    findings, stats = [], {"total": len(results), "leaks": 0, "user_facing": 0, "user_facing_generic": 0}
    for r in results:
        fns = sorted(code_fns[r["code"]])
        user_facing = any(USER_FACING_FN.match(f) for f in fns)
        if r["leak"]:
            stats["leaks"] += 1
            findings.append({"gate": "G2", "severity": "FAIL", "code": r["code"], "issue": "raw_leak", "msg": r["msg"], "functions": fns})
        if user_facing:
            stats["user_facing"] += 1
            if r["generic"] and r["code"] not in ok_generic:
                stats["user_facing_generic"] += 1
                findings.append({"gate": "G2", "severity": "FAIL", "code": r["code"], "issue": "generic_fallback_for_user_facing_code", "functions": fns})
    return findings, stats


# ---------------------------------------------------------------------------
# G3 — Universal click crawler
# ---------------------------------------------------------------------------
QUICK_LOGIN = {
    "member": ("preview/member-dashboard/login.html?quick=member", "**/member-dashboard/dashboard.html**"),
    "merchant": ("preview/merchant-dashboard/login.html?quick=merchant", "**/merchant-dashboard/dashboard.html**"),
    "admin": ("preview/admin-dashboard/login.html?quick=founder", "**/admin-dashboard/dashboard.html**"),
}

PUBLIC_PAGES = ["preview/index.html", "preview/public/merchants.html", "preview/auth-gateway.html", "preview/public/contact.html"]

JS_COLLECT_CANDIDATES = r"""
(cfg) => {
    const scope = cfg.scopeSel ? (document.querySelector(cfg.scopeSel) || document.body) : document.body;
    const skipRe = new RegExp(cfg.skipText, 'i');
    const vw = innerWidth, vh = innerHeight;
    const nodes = Array.from(scope.querySelectorAll('button, a[href], [onclick], [role="button"], summary, .clickable, tr[onclick]'));
    const out = [];
    const seen = new Set();
    for (const el of nodes) {
        if (el.closest(cfg.skipSel) || el.matches(cfg.skipSel)) continue;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0 || st.pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
        if (skipRe.test(txt)) continue;
        if (el.querySelector('input[type="file"]') || (el.tagName === 'LABEL' && el.htmlFor && document.getElementById(el.htmlFor)?.type === 'file')) continue;
        const href = el.getAttribute('href') || '';
        if (href && !href.startsWith('#') && !href.startsWith('javascript')) continue;
        const ocRaw = el.getAttribute('onclick') || '';
        const oc = ocRaw.replace(/'[^']*'|"[^"]*"|\d+/g, '#');
        const sig = el.tagName + '|' + (el.id || '').replace(/[\d_-]+$/, '') + '|' + oc.slice(0, 80) + '|' + txt.replace(/[\d.,٠-٩]+/g, '#').slice(0, 40);
        if (seen.has(sig)) continue;
        seen.add(sig);
        if (!el.dataset.robotCid) el.dataset.robotCid = 'c' + Math.random().toString(36).slice(2, 9);
        out.push({
            cid: el.dataset.robotCid,
            sig,
            text: txt.slice(0, 60),
            tag: el.tagName,
            onclick: ocRaw.slice(0, 120),
            btnType: (el.getAttribute('type') || '').toLowerCase(),
            inForm: Boolean(el.closest('form')),
            isActiveTab: el.classList.contains('active') || el.getAttribute('aria-selected') === 'true',
            isPrintOrFocus: /window\.print|exportFinancialStatementPDF|focus\(|focusBillAmount|openKioskQuickSalePanel|triggerGpsRadarSearch/.test(ocRaw)
        });
    }
    return out;
}
"""

JS_SCREEN_STATE = r"""
(cfg) => {
    const vw = innerWidth, vh = innerHeight;
    const text = (document.body && document.body.innerText) || '';
    const errHits = cfg.errPatterns.filter(p => new RegExp(p, 'i').test(text));
    const toastText = Array.from(document.querySelectorAll('.sw-toast, .toast, [role="alert"], .sw-dialog-card'))
        .map(t => t.innerText || '').join(' | ');
    const rawCodes = (toastText.match(new RegExp(cfg.rawCode, 'g')) || []).filter(c => !/^(SAWYAN|USD|EUR)$/.test(c));
    // Frozen-screen detection: a visible full-screen fixed layer with zero visible content in the viewport
    const frozen = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || s.pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width < vw * 0.85 || r.height < vh * 0.85) continue;
        const kids = Array.from(el.querySelectorAll('*')).filter(k => {
            const kr = k.getBoundingClientRect();
            const ks = getComputedStyle(k);
            return ks.display !== 'none' && ks.visibility !== 'hidden' && kr.width > 120 && kr.height > 50 &&
                   kr.right > 4 && kr.left < vw - 4 && kr.bottom > 4 && kr.top < vh - 4 &&
                   ((k.innerText || '').trim().length > 0 || k.querySelector('img, canvas, svg, video, iframe'));
        });
        const bg = s.backgroundColor || '';
        const dim = /rgba?\(/.test(bg) && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg);
        if (!kids.length && dim) frozen.push((el.id || el.className || el.tagName).toString().slice(0, 60));
    }
    return { errHits, rawCodes: Array.from(new Set(rawCodes)).slice(0, 5), frozen, url: location.href, scrollY };
}
"""


def _sandbox_routes(context, blocked_log):
    def handler(route):
        req = route.request
        url = req.url
        if "/rest/v1/rpc/" in url:
            fn = url.split("/rest/v1/rpc/")[1].split("?")[0]
            if READ_RPC_PREFIX.match(fn) or fn in ALWAYS_READ_RPCS:
                return route.continue_()
            if fn in MULTI_ACTION_READ_ACTIONS:
                act = None
                try:
                    payload = req.post_data_json
                    if isinstance(payload, dict):
                        act = payload.get("p_action") or payload.get("action")
                except Exception:
                    act = None
                if act in MULTI_ACTION_READ_ACTIONS[fn]:
                    return route.continue_()
                blocked_log.add(f"{fn}:{act}")
                return route.fulfill(
                    status=400,
                    content_type="application/json",
                    body=json.dumps({"code": "P0001", "message": "ROBOT_SANDBOX_WRITE_BLOCKED", "details": None, "hint": None}),
                )
            blocked_log.add(fn)
            return route.fulfill(
                status=400,
                content_type="application/json",
                body=json.dumps({"code": "P0001", "message": "ROBOT_SANDBOX_WRITE_BLOCKED", "details": None, "hint": None}),
            )
        if ("/rest/v1/" in url or "/functions/v1/" in url) and req.method not in ("GET", "HEAD", "OPTIONS"):
            blocked_log.add(req.method + " " + url.split("/v1/")[1][:40])
            return route.fulfill(status=403, content_type="application/json", body=json.dumps({"message": "ROBOT_SANDBOX_WRITE_BLOCKED"}))
        return route.continue_()

    context.route("**/*supabase.co/**", handler)


def login(page, base, portal):
    url, pattern = QUICK_LOGIN[portal]
    page.goto(f"{base}/{url}", wait_until="domcontentloaded", timeout=35000)
    page.wait_for_url(pattern, timeout=30000)
    page.wait_for_load_state("networkidle", timeout=30000)
    page.wait_for_timeout(1500)


def _tabs(page):
    return page.evaluate(
        """() => Array.from(new Set(Array.from(document.querySelectorAll('.sidebar-nav .nav-item[data-page], .nav-item[data-page]'))
              .map(n => n.dataset.page).filter(p => p && p !== 'more' && p !== 'decisionsLab')))"""
    )


def _goto_tab(page, tab):
    page.evaluate(
        """(t) => {
            if (window.SAWYAN && window.SAWYAN.AppShell && window.SAWYAN.AppShell.closeOpenModal) {
                for (let i = 0; i < 4; i++) { if (!window.SAWYAN.AppShell.closeOpenModal()) break; }
            }
            const n = document.querySelector('.sidebar-nav .nav-item[data-page="' + t + '"]') || document.querySelector('.nav-item[data-page="' + t + '"]');
            if (typeof goToPage === 'function') goToPage(t);
            else if (typeof showPage === 'function') showPage(t);
            else if (n) n.click();
        }""",
        tab,
    )
    page.wait_for_timeout(900)


def _recover(page, home_url, tab):
    page.keyboard.press("Escape")
    page.wait_for_timeout(120)
    page.evaluate(
        """() => {
            if (window.SAWYAN && window.SAWYAN.AppShell && window.SAWYAN.AppShell.closeOpenModal) {
                for (let i = 0; i < 5; i++) { if (!window.SAWYAN.AppShell.closeOpenModal()) break; }
            }
            document.querySelectorAll('.sw-dialog-backdrop, #sawyanHelpPopoverModal, .sw-toast').forEach(e => e.remove());
            ['#sawyanAdminLiveToast', '#svOpsToast', '#svRegBuilderToast'].forEach(sel => {
                const el = document.querySelector(sel);
                if (el) { el.style.opacity = '0'; el.textContent = ''; }
            });
            document.querySelectorAll(
                '#mobileMenuOverlay, #merchantsMobileOverlay, #memberModalOverlay, #svStage7ModalOverlay, ' +
                '#geoModal, .geo-modal-backdrop.open, #notificationDropdown, ' +
                '.modal-overlay.active, .modal.active, .sw-notif-dropdown.open, .notif-dropdown.open, ' +
                '.dropdown-menu.open, .dropdown-menu.show, [class*="dropdown"].open, [class*="drawer"].active, ' +
                '[class*="menu"].open, [id*="Dropdown"].open, [id*="Modal"].active, #countryDropdown, #cityDropdown'
            ).forEach(el => {
                el.classList.remove('active', 'open', 'show');
            });
            document.querySelectorAll(
                '#mobileMenuOverlay, #merchantsMobileOverlay, #notificationDropdown, #geoModal, ' +
                '.sw-notif-dropdown, #notifDropdown, #adminNotifDropdown, #memberNotifDropdown, #merchantNotifDropdown'
            ).forEach(el => {
                if (el.style && (el.style.display === 'block' || el.style.display === 'flex')) {
                    el.style.display = '';
                }
            });
            document.body.style.overflow = '';
            window.scrollTo(0, 0);
        }"""
    )
    if home_url.split("#")[0].split("?")[0] not in page.url:
        page.goto(home_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1200)
    if tab:
        _goto_tab(page, tab)


def crawl_surface(page, label, home_url, tab, scope_sel, max_clicks, findings, events, stats):
    tested = set()
    clicks = 0
    while clicks < max_clicks:
        cands = page.evaluate(JS_COLLECT_CANDIDATES, {"scopeSel": scope_sel, "skipText": CRAWL_SKIP_TEXT, "skipSel": CRAWL_SKIP_SELECTOR})
        pending = [c for c in cands if c["sig"] not in tested]
        if not pending:
            break
        c = pending[0]
        tested.add(c["sig"])
        clicks += 1
        stats["clicks"] += 1
        before_err = len(events["pageerror"])
        before_dialog = len(events["dialog"])
        page.evaluate("() => { window.__robotMut = 0; if (window.__robotMo) window.__robotMo.disconnect(); window.__robotMo = new MutationObserver(m => { window.__robotMut += m.length; }); window.__robotMo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); }")
        url_before = page.url
        try:
            page.locator(f'[data-robot-cid="{c["cid"]}"]').first.click(timeout=2500)
        except Exception as e:
            full_err = str(e)
            intercept_line = next((ln.strip() for ln in full_err.splitlines() if "intercepts pointer events" in ln), "")
            msg = (intercept_line or full_err.splitlines()[0])[:220]
            if "intercepts pointer events" in full_err:
                findings.append({"gate": "G3", "severity": "WARN", "kind": "CLICK_BLOCKED_BY_LAYER", "surface": label, "element": c["text"] or c["onclick"], "detail": msg})
            _recover(page, home_url, tab)
            continue
        page.wait_for_timeout(550)
        st = page.evaluate(JS_SCREEN_STATE, {"errPatterns": VISIBLE_ERROR_PATTERNS, "rawCode": RAW_CODE_PATTERN})
        mut = page.evaluate("() => window.__robotMut || 0")
        new_errs = events["pageerror"][before_err:]
        new_dialogs = events["dialog"][before_dialog:]
        elem = c["text"] or c["onclick"] or c["tag"]
        for err in new_errs:
            if "ROBOT_SANDBOX" in err:
                findings.append({"gate": "G3", "severity": "WARN", "kind": "UNHANDLED_REJECTION_ON_WRITE", "surface": label, "element": elem, "detail": err[:200]})
            else:
                findings.append({"gate": "G3", "severity": "FAIL", "kind": "JS_CRASH_ON_CLICK", "surface": label, "element": elem, "onclick": c["onclick"], "detail": err[:240]})
        for d in new_dialogs:
            findings.append({"gate": "G3", "severity": "FAIL", "kind": "NATIVE_BROWSER_DIALOG", "surface": label, "element": elem, "detail": d[:160]})
        if st["errHits"]:
            findings.append({"gate": "G3", "severity": "FAIL", "kind": "VISIBLE_TECHNICAL_ERROR_TEXT", "surface": label, "element": elem, "detail": st["errHits"]})
        if st["rawCodes"]:
            findings.append({"gate": "G3", "severity": "FAIL", "kind": "RAW_CODE_IN_TOAST_OR_DIALOG", "surface": label, "element": elem, "detail": st["rawCodes"]})
        if st["frozen"]:
            findings.append({"gate": "G3", "severity": "FAIL", "kind": "FROZEN_SCREEN_OVERLAY_WITHOUT_CONTENT", "surface": label, "element": elem, "detail": st["frozen"]})
        if mut == 0 and st["url"] == url_before and not new_errs:
            if (
                not c.get("isActiveTab")
                and not c.get("isPrintOrFocus")
                and not (c.get("inForm") and c.get("btnType") in ("submit", ""))
            ):
                findings.append({"gate": "G3", "severity": "INFO", "kind": "DEAD_CLICK_NO_VISIBLE_EFFECT", "surface": label, "element": elem, "onclick": c["onclick"]})
        _recover(page, home_url, tab)
    return clicks


def run_g3_crawler(pw_browser, base, portals, max_per_tab):
    findings, stats, blocked = [], {"clicks": 0, "surfaces": 0}, set()

    def new_ctx(width, height):
        ctx = pw_browser.new_context(viewport={"width": width, "height": height}, locale="ar-EG")
        _sandbox_routes(ctx, blocked)
        ctx.on("page", lambda p: p.close() if p != ctx.pages[0] else None)
        return ctx

    def wire(page):
        ev = {"pageerror": [], "dialog": []}
        page.on("pageerror", lambda e: ev["pageerror"].append(str(e)))

        def _dlg(d):
            ev["dialog"].append(f"{d.type}: {d.message}")
            try:
                d.dismiss()
            except Exception:
                pass

        page.on("dialog", _dlg)
        return ev

    if "public" in portals:
        ctx = new_ctx(375, 812)
        page = ctx.new_page()
        ev = wire(page)
        for rel in PUBLIC_PAGES:
            home = f"{base}/{rel}"
            page.goto(home, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)
            stats["surfaces"] += 1
            crawl_surface(page, f"public:{rel.split('/')[-1]}@375", home, None, None, max_per_tab, findings, ev, stats)
        ctx.close()

    for portal, (w, h) in (("member", (375, 812)), ("merchant", (375, 812)), ("admin", (1440, 900))):
        if portal not in portals:
            continue
        ctx = new_ctx(w, h)
        page = ctx.new_page()
        ev = wire(page)
        login(page, base, portal)
        home = page.url.split("#")[0]
        boot_errs = [e for e in ev["pageerror"] if "ROBOT_SANDBOX" not in e]
        for e in boot_errs:
            findings.append({"gate": "G3", "severity": "FAIL", "kind": "JS_CRASH_ON_LOAD", "surface": f"{portal}@{w}", "element": "(page load)", "detail": e[:240]})
        st0 = page.evaluate(JS_SCREEN_STATE, {"errPatterns": VISIBLE_ERROR_PATTERNS, "rawCode": RAW_CODE_PATTERN})
        if st0["frozen"]:
            findings.append({"gate": "G3", "severity": "WARN", "kind": "OVERLAY_ON_FIRST_LOAD", "surface": f"{portal}@{w}", "element": "(page load)", "detail": st0["frozen"]})
        # header / global bar once
        stats["surfaces"] += 1
        crawl_surface(page, f"{portal}:header@{w}", home, None, ".dashboard-header, .top-header, header", min(10, max_per_tab), findings, ev, stats)
        for tab in _tabs(page):
            _recover(page, home, tab)
            st = page.evaluate(JS_SCREEN_STATE, {"errPatterns": VISIBLE_ERROR_PATTERNS, "rawCode": RAW_CODE_PATTERN})
            if st["errHits"]:
                findings.append({"gate": "G4", "severity": "FAIL", "kind": "TAB_RENDERS_TECHNICAL_ERROR", "surface": f"{portal}:{tab}@{w}", "element": "(tab open)", "detail": st["errHits"]})
            stats["surfaces"] += 1
            crawl_surface(page, f"{portal}:{tab}@{w}", home, tab, ".page.active", max_per_tab, findings, ev, stats)
        ctx.close()
    return findings, stats, sorted(blocked)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="SAWYAN /sawyan-robot Gen-3 Interaction Crawler & Contract Gates")
    ap.add_argument("--static", action="store_true", help="Run G1 + G2 only")
    ap.add_argument("--quick", action="store_true", help="Cap crawler at 12 clicks per tab")
    ap.add_argument("--portal", default="public,member,merchant,admin")
    ap.add_argument("--max-per-tab", type=int, default=40)
    args = ap.parse_args()
    portals = {p.strip() for p in args.portal.split(",") if p.strip()}
    max_per_tab = 12 if args.quick else args.max_per_tab

    REPORT_DIR.mkdir(exist_ok=True)
    httpd, port = gen2.start_server()
    base = f"http://127.0.0.1:{port}"
    t0 = time.time()
    report = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "findings": [], "stats": {}}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            g1 = run_g1_handler_integrity(browser, base, login)
            report["findings"] += g1
            print(f" [G1] Inline-handler integrity: {len(g1)} undefined handler(s)")
            g2, g2_stats = run_g2_error_coverage(browser, base)
            report["findings"] += g2
            report["stats"]["g2"] = g2_stats
            print(f" [G2] Error-code Arabic coverage: {g2_stats}")
            if not args.static:
                g3, g3_stats, blocked = run_g3_crawler(browser, base, portals, max_per_tab)
                report["findings"] += g3
                report["stats"]["g3"] = g3_stats
                report["stats"]["sandbox_blocked_rpcs"] = blocked
                print(f" [G3] Click crawler: {g3_stats} | sandbox-blocked writes: {len(blocked)}")
            browser.close()
    finally:
        httpd.shutdown()

    report["elapsed_sec"] = round(time.time() - t0, 1)
    fails = [f for f in report["findings"] if f["severity"] == "FAIL"]
    gaps = [f for f in report["findings"] if f["severity"] == "GAP"]
    warns = [f for f in report["findings"] if f["severity"] == "WARN"]
    infos = [f for f in report["findings"] if f["severity"] == "INFO"]
    out = REPORT_DIR / "robot_gen3_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== GEN-3 SUMMARY ({report['elapsed_sec']}s): FAIL={len(fails)} GAP={len(gaps)} WARN={len(warns)} INFO(dead clicks)={len(infos)} ===")
    for f in fails[:60]:
        print("  FAIL", json.dumps(f, ensure_ascii=False)[:420])
    print(f"  Full report: {out}")
    if fails:
        sys.exit(1)
    print("\n[SAWYAN /sawyan-robot GEN-3 INTERACTION GATES: GREEN]")


if __name__ == "__main__":
    main()
