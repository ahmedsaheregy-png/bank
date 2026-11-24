"""
SAWYAN V3.0 — Phase 0 & Phase 1 Regression & Trust-Boundary Verification Suite
Runs in two modes:
  - `--static-only` (default in CI without secrets): validates zero leaked credentials,
    zero C1/C2/C3/C5 regressions, SQL ownership hygiene, robots.txt lockdown, and mirror sync.
  - `--live` (default when run locally with internet): also executes live PostgREST `anon`
    attack probes against Supabase (`sawyan` & `sawyan_demo`) verifying C1, C2, C3, C5, C4.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
PROJECT_REF = "dssspiossqgroefmvnql"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1/rpc"


def must(cond, label, detail=""):
    if not cond:
        raise AssertionError(f"[FAIL] {label} -> {detail}")
    print(f" [PASS] {label}")


def run_static_checks():
    # 1. C1: payment-service.js & sawyan-api.js must not invoke direct submit_pos_transaction
    ps = (REPO_DIR / "preview" / "shared" / "payments" / "payment-service.js").read_text(encoding="utf-8")
    api = (REPO_DIR / "preview" / "shared" / "api" / "sawyan-api.js").read_text(encoding="utf-8")
    must("submitPosTransaction(" not in ps, "C1: payment-service.js never calls submitPosTransaction()")
    must("DIRECT_SUBMIT_POS_TRANSACTION_REVOKED_C1" in api, "C1: sawyan-api.js fails closed on submitPosTransaction()")
    must("merchant_submit_flash_offer_guarded" in api, "C5: sawyan-api.js routes flash offers through guarded RPC")

    # 2. C2 & B5-01: Production admin login & JS must have zero hardcoded demo passwords, 246810, or personal founder email
    adm_login = (REPO_DIR / "admin-dashboard" / "login.html").read_text(encoding="utf-8")
    must("246810" not in adm_login, "C2: admin-dashboard/login.html contains zero fake 246810 TOTP")
    must('onclick="quickDemoLogin' not in adm_login, "C2: Production admin login HTML embeds zero static demo credentials")
    must("ADMIN_TOTP_ENROLLMENT_REQUIRED" in adm_login, "C2: admin login supports real RFC 6238 TOTP QR enrollment")

    for js_rel in [
        "preview/admin-dashboard/js/admin-settings-center.js",
        "preview/admin-dashboard/js/admin-v3-live-bridge.js",
        "preview/admin-dashboard/js/admin-stage7-ops-hub.js",
    ]:
        txt = (REPO_DIR / js_rel).read_text(encoding="utf-8")
        must("ahmed.saher.egy@gmail.com" not in txt.lower(), f"Privacy: zero hardcoded personal founder email in {js_rel}")
        must("'246810'" not in txt and '"246810"' not in txt, f"C2: zero fake 246810 TOTP in {js_rel}")

    sc_txt = (REPO_DIR / "preview" / "admin-dashboard" / "js" / "admin-settings-center.js").read_text(encoding="utf-8")
    must("isLiveProductionMode" in sc_txt and "adminToggleKillSwitch" in sc_txt and "adminManage2faPolicy" in sc_txt,
         "B5-01: admin-settings-center.js wires Production settings, Break-Glass & 2FA directly to PostgreSQL")

    # 3. Zero hardcoded production founder credentials in database/*.py
    for pyf in sorted((REPO_DIR / "database").glob("*.py")):
        if pyf.name == pathlib.Path(__file__).name:
            continue
        txt = pyf.read_text(encoding="utf-8", errors="replace")
        has_hardcoded_founder_login = bool(
            re.search(r"authenticate_admin_login[^\n]*ahmed\.saher\.egy@gmail\.com", txt, re.I)
        )
        must(not has_hardcoded_founder_login, f"Secret Hygiene: zero hardcoded founder login in database/{pyf.name}")

    # 4. Phase 0 & Phase 1 SQL migrations exist & contain required guards
    sql21 = (REPO_DIR / "database" / "21_phase0_security_hardening.sql").read_text(encoding="utf-8")
    sql22 = (REPO_DIR / "database" / "22_phase1_ledger_sessions_and_cron.sql").read_text(encoding="utf-8")
    must("REVOKE ALL ON FUNCTION sawyan.submit_pos_transaction" in sql21, "SQL 21 revokes submit_pos_transaction")
    must("REVOKE ALL ON FUNCTION sawyan.submit_merchant_flash_offer" in sql21, "SQL 21 revokes submit_merchant_flash_offer")
    must("RFC6238_SELFTEST_FAILED" in sql21 and "is_2fa_exempt" in sql21, "SQL 21 enforces RFC 6238 TOTP + sovereign exemption")
    must("DEMO_PREVIEW_LEADER_1" not in sql21.split("verify_member_session")[1].split("$$;")[0], "SQL 21 removes DEMO_PREVIEW_LEADER_1")
    must("trg_journal_lines_zero_discrepancy" in sql22 and "DEFERRABLE INITIALLY DEFERRED" in sql22, "SQL 22 enforces DB-level double-entry balance")
    must("trg_members_hash_session_token" in sql22 and "session_token_sha256" in sql22, "SQL 22 enforces C4 hashed + expiring sessions")
    must("run_nightly_zero_discrepancy_audit" in sql22, "SQL 22 defines nightly Zero-Discrepancy audit watchdog")

    # 5. robots.txt & living-docs hygiene
    robots = (REPO_DIR / "robots.txt").read_text(encoding="utf-8")
    for dis in ("/docs/", "/tools/", "/landing-page/", "/admin-dashboard/"):
        must(f"Disallow: {dis}" in robots, f"robots.txt blocks {dis}")

    ld_idx = (REPO_DIR / "tools" / "living-docs" / "index.html").read_text(encoding="utf-8")
    must("docs.google.com/document/d/" not in ld_idx, "tools/living-docs/index.html exposes zero private Google Docs edit links")

    print("\n[PHASE1_STATIC_OK] All Phase 0 & Phase 1 static security & hygiene assertions PASSED.")


def run_live_postgrest_checks():
    cfg = (REPO_DIR / "preview" / "shared" / "config" / "supabase.js").read_text(encoding="utf-8")
    anon_key = re.search(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", cfg).group(0)

    def rpc(fn, body, schema="sawyan"):
        req = urllib.request.Request(
            f"{REST_URL}/{fn}",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {anon_key}",
                "Content-Type": "application/json",
                "Accept-Profile": schema,
                "Content-Profile": schema,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8")

    for sch in ("sawyan", "sawyan_demo"):
        st, res = rpc("submit_pos_transaction", {"p_amount": 100}, sch)
        must(st in (401, 403, 404), f"Live C1 blocked on {sch}", f"{st} {res}")
        st2, res2 = rpc("submit_merchant_flash_offer", {"p_title": "x", "p_body": "y"}, sch)
        must(st2 in (401, 403, 404), f"Live C5 flash offer blocked on {sch}", f"{st2} {res2}")

    st3, res3 = rpc("employee_lock_session", {"p_employee_id": "00000000-0000-0000-0000-000000000001", "p_session_token": "INVALID"}, "sawyan")
    must(st3 == 200 and res3.get("success") is False, "Live C5 employee_lock_session rejects invalid token", res3)

    st4, res4 = rpc("authenticate_admin_login", {"p_email": "demo.founder@sawyan.local", "p_password": "Demo@Founder2026", "p_totp_code": None}, "sawyan_demo")
    must(st4 == 200 and res4.get("success") is True and res4.get("admin", {}).get("is_2fa_exempt") is True,
         "Live C2 Sovereign Founder exempt login works on sawyan_demo", res4)

    st5, res5 = rpc("get_member_dashboard_bundle", {"p_member_id": "00000000-0000-0000-0000-000000000002", "p_session_token": "DEMO_PREVIEW_LEADER_1"}, "sawyan_demo")
    must(st5 >= 400, "Live C3 DEMO_PREVIEW_LEADER_1 rejected", f"{st5} {res5}")

    print("\n[PHASE1_LIVE_OK] All Live PostgREST trust-boundary assertions PASSED.")


if __name__ == "__main__":
    run_static_checks()
    if "--static-only" not in sys.argv:
        run_live_postgrest_checks()
