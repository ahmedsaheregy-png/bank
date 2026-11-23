"""
SAWYAN V3.0 — Stage 11 Gate #11: Production Launch-Readiness, Security & UX Hardening Gate.
Verifies both static mirror readiness (`preview/` & `/`) and live Supabase `sawyan` / `sawyan_demo`
hardening controls (brute-force rate limit, masked sponsor lookup, 2FA active admins, founder locks).
"""
import json
import os
import pathlib
import re
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1/rpc"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
REPO_DIR = pathlib.Path(__file__).resolve().parent.parent

ANON_MATCH = re.search(
    r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+",
    (REPO_DIR / "preview" / "shared" / "config" / "supabase.js").read_text(encoding="utf-8"),
)
ANON_KEY = ANON_MATCH.group(0) if ANON_MATCH else ""


def rpc(fn_name, payload, schema="sawyan_demo"):
    req = urllib.request.Request(
        f"{REST_URL}/{fn_name}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Accept-Profile": schema,
            "Content-Profile": schema,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8")
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def run_sql(sql, token):
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-Gate11/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else []


def must(cond, label, detail=""):
    if not cond:
        raise AssertionError(f"[FAIL] {label} -> {detail}")
    print(f" [PASS] {label}")


def check_static_readiness():
    required = [
        REPO_DIR / "preview" / "manifest.json",
        REPO_DIR / "manifest.json",
        REPO_DIR / "preview" / "shared" / "assets" / "sawyan-icon.svg",
        REPO_DIR / "shared" / "assets" / "sawyan-icon.svg",
        REPO_DIR / "404.html",
        REPO_DIR / "robots.txt",
        REPO_DIR / "sitemap.xml",
        REPO_DIR / "preview" / "shared" / "components" / "ui-feedback.js",
        REPO_DIR / "preview" / "shared" / "css" / "ui-feedback.css",
    ]
    for p in required:
        must(p.is_file(), f"Required launch asset exists: {p.relative_to(REPO_DIR).as_posix()}")

    for base_name, base in [("preview", REPO_DIR / "preview"), ("root", REPO_DIR)]:
        for role in ("member-dashboard", "merchant-dashboard"):
            reg_txt = (base / role / "register.html").read_text(encoding="utf-8")
            must("../terms.html" not in reg_txt and "../privacy.html" not in reg_txt, f"{base_name}/{role}/register.html has no broken 404 legal links")
            must("../public/terms.html" in reg_txt and "../public/privacy.html" in reg_txt, f"{base_name}/{role}/register.html points to ../public/terms|privacy.html")

        idx_txt = (base / "index.html").read_text(encoding="utf-8")
        must("admin-dashboard/login.html" not in idx_txt, f"{base_name}/index.html hides admin login footer link")

        for role in ("member-dashboard", "merchant-dashboard"):
            dash_txt = (base / role / "dashboard.html").read_text(encoding="utf-8")
            must("mock-provider.js" not in dash_txt, f"{base_name}/{role}/dashboard.html excludes mock-provider.js")

    pay_init = (REPO_DIR / "preview" / "shared" / "payments" / "payment-init.js").read_text(encoding="utf-8")
    must("isParallelDemo" in pay_init and "MockPaymentProvider" in pay_init, "payment-init.js restricts MockPaymentProvider strictly to parallel demo mode")

    # Official WhatsApp support & zero fake phone in HTML pages
    html_files = list((REPO_DIR / "preview").rglob("*.html")) + [
        REPO_DIR / "index.html",
        REPO_DIR / "auth-gateway.html",
        REPO_DIR / "404.html",
    ]
    for sub in ("public", "member-dashboard", "merchant-dashboard", "admin-dashboard"):
        html_files.extend((REPO_DIR / sub).rglob("*.html"))

    seen_html = sorted(set(html_files))
    for hp in seen_html:
        txt = hp.read_text(encoding="utf-8", errors="replace")
        rel = hp.relative_to(REPO_DIR).as_posix()
        must("201000000000" not in txt and "0000 0000" not in txt, f"No placeholder phone in {rel}")
        must("api.qrserver.com" not in txt, f"No external api.qrserver.com in {rel}")
        for m in re.findall(r'(?:src|href)=["\']([^"\']+\.(?:js|css)(?:\?[^"\']*)?)["\']', txt):
            if not m.startswith("http"):
                must("v=20261121_launch" in m, f"Unified cache version (?v=20261121_launch) on {m} in {rel}")

    for p in (REPO_DIR / "preview").rglob("*"):
        if p.is_file() and p.suffix in {".html", ".js", ".css"}:
            txt = p.read_text(encoding="utf-8", errors="replace")
            must("api.qrserver.com" not in txt, f"Zero api.qrserver.com leak in {p.relative_to(REPO_DIR).as_posix()}")

    for wa_file in [
        REPO_DIR / "preview" / "public" / "contact.html",
        REPO_DIR / "preview" / "member-dashboard" / "forgot-password.html",
        REPO_DIR / "preview" / "merchant-dashboard" / "forgot-password.html",
        REPO_DIR / "preview" / "merchant-dashboard" / "js" / "dashboard.js",
    ]:
        must("905376744337" in wa_file.read_text(encoding="utf-8"), f"Official WhatsApp number 905376744337 wired in {wa_file.relative_to(REPO_DIR).as_posix()}")

    # Admin session storage hygiene
    api_js = (REPO_DIR / "preview" / "shared" / "api" / "sawyan-api.js").read_text(encoding="utf-8")
    must("sessionStorage.setItem(kAdm," in api_js and "sessionStorage.setItem(kTok," in api_js and "localStorage.removeItem('sawyan_admin')" in api_js, "sawyan-api.js stores admin session only in sessionStorage")
    for adm_js in [
        REPO_DIR / "preview" / "admin-dashboard" / "js" / "dashboard.js",
        REPO_DIR / "preview" / "admin-dashboard" / "js" / "admin-settings-center.js",
    ]:
        txt = adm_js.read_text(encoding="utf-8")
        must("localStorage.getItem('sawyan_admin')" not in txt and "localStorage.setItem('sawyan_admin')" not in txt, f"No localStorage sawyan_admin in {adm_js.relative_to(REPO_DIR).as_posix()}")

    # Member purchase UX defaults to remote_pending
    mem_js = (REPO_DIR / "preview" / "member-dashboard" / "js" / "dashboard.js").read_text(encoding="utf-8")
    must('<input type="hidden" id="mpModeInput" value="remote_pending">' in mem_js and "syncModeUi('remote_pending')" in mem_js, "openMemberPurchaseModal defaults cleanly to remote_pending")

    # Zero native alert/confirm/prompt across member & merchant portals and contact page
    popup_targets = (
        list((REPO_DIR / "preview" / "member-dashboard").rglob("*"))
        + list((REPO_DIR / "preview" / "merchant-dashboard").rglob("*"))
        + [REPO_DIR / "preview" / "public" / "contact.html"]
    )
    for pt in popup_targets:
        if pt.is_file() and pt.suffix in {".html", ".js"}:
            lines = pt.read_text(encoding="utf-8", errors="replace").splitlines()
            for idx, line in enumerate(lines, 1):
                if re.search(r"(?<![.\w$])(?:window\.)?(?:alert|confirm|prompt)\s*\(", line):
                    raise AssertionError(f"[FAIL] Native popup call left in {pt.relative_to(REPO_DIR).as_posix()}:L{idx} -> {line.strip()}")
    print(" [PASS] Zero native alert()/confirm()/prompt() across Member, Merchant & Contact UX")


def check_live_database(token):
    # 1. Sponsor privacy masking
    st, sp = rpc("lookup_sponsor_by_code", {"p_member_code": 1}, schema="sawyan_demo")
    must(st == 200 and isinstance(sp, dict) and sp.get("found") is True, "lookup_sponsor_by_code(1) resolves active sponsor", f"{st} {sp}")
    must("***" in str(sp.get("masked_name", "")) and "***" in str(sp.get("full_name", "")), "lookup_sponsor_by_code masks surname with '***'", sp)

    # 2. Verify 15-minute login lockout is DISABLED per founder directive (2026-11-23)
    test_ident = "brute_qa_nonexistent_999999"
    clean_sql = f"DELETE FROM sawyan_demo.auth_rate_limits WHERE bucket_key = 'member:{test_ident}';"
    run_sql(clean_sql, token)
    try:
        for attempt in range(1, 7):
            st_a, res_a = rpc("authenticate_member_login", {"p_identifier": test_ident, "p_password": "WrongPass!99"}, schema="sawyan_demo")
            must(
                st_a == 200 and isinstance(res_a, dict)
                and res_a.get("success") is False
                and res_a.get("error_code") == "INVALID_CREDENTIALS"
                and res_a.get("locked_until") is None,
                f"Login failed attempt #{attempt}/6 returns INVALID_CREDENTIALS without 15m lockout",
                f"{st_a} {res_a}",
            )
    finally:
        run_sql(clean_sql, token)

    # 3. Live DB invariants (2FA admins, FX=50, VAT=0, real TR merchant intact, Stage 11 RPCs deployed)
    adm_rows = run_sql(
        """
        SELECT 'sawyan' AS sch, count(*) FILTER (WHERE is_active AND COALESCE(two_factor_enabled, false) = false) AS missing_2fa FROM sawyan.admins
        UNION ALL
        SELECT 'sawyan_demo' AS sch, count(*) FILTER (WHERE is_active AND COALESCE(two_factor_enabled, false) = false) AS missing_2fa FROM sawyan_demo.admins;
        """,
        token,
    )
    for row in adm_rows:
        must(int(row["missing_2fa"]) == 0, f"All active admins in {row['sch']} have two_factor_enabled=true", row)

    country_rows = run_sql(
        "SELECT country_code, admin_fx_rate, vat_rate FROM sawyan.countries WHERE country_code IN ('EG','SA','TR','US') ORDER BY country_code;",
        token,
    )
    cmap = {r["country_code"]: r for r in country_rows}
    must(float(cmap["TR"]["admin_fx_rate"]) == 50.0, "sawyan.countries TR admin_fx_rate == 50.0", cmap.get("TR"))
    for cc in ("EG", "SA", "TR", "US"):
        must(float(cmap[cc]["vat_rate"]) == 0.0, f"sawyan.countries {cc} vat_rate == 0.0", cmap.get(cc))

    m_tr = run_sql("SELECT merchant_code, business_name, is_active FROM sawyan.merchants WHERE merchant_code = 'M-TR-101';", token)
    must(len(m_tr) == 1 and m_tr[0]["is_active"] is True, "Real Turkish merchant M-TR-101 remains intact and active in sawyan", m_tr)

    proc_rows = run_sql(
        """
        SELECT n.nspname AS sch, p.proname, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname IN ('sawyan', 'sawyan_demo')
           AND p.proname IN ('merchant_initiate_topup', 'get_merchant_dashboard_bundle', 'admin_search_and_reply_ops', 'lookup_sponsor_by_code', 'auth_rate_limit_guard');
        """,
        token,
    )
    for sch in ("sawyan", "sawyan_demo"):
        sch_procs = {r["proname"]: r["args"] for r in proc_rows if r["sch"] == sch}
        for fn in ("merchant_initiate_topup", "get_merchant_dashboard_bundle", "admin_search_and_reply_ops", "lookup_sponsor_by_code", "auth_rate_limit_guard"):
            must(fn in sch_procs, f"RPC {sch}.{fn} deployed", sch_procs)
        must("p_receipt_image_data" in sch_procs["merchant_initiate_topup"], f"{sch}.merchant_initiate_topup accepts p_receipt_image_data", sch_procs["merchant_initiate_topup"])


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        raise RuntimeError("SUPABASE_ACCESS_TOKEN env var required.")
    must(bool(ANON_KEY), "Parsed Supabase ANON_KEY from shared/config/supabase.js")
    check_static_readiness()
    check_live_database(token)
    print("\n[GATE_11_OK] Production Readiness, Security & UX Hardening Gate PASSED 100%.")


if __name__ == "__main__":
    main()
