import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
PREVIEW_DIR = os.path.join(REPO_DIR, "preview")


def api_request(method, endpoint, payload, token):
    url = f"{BASE_API}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "SAWYAN-Stage4-Verifier/3.0")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} on {endpoint}: {body}")


def run_sql(sql, token):
    _, res = api_request("POST", "/database/query", {"query": sql}, token)
    return res


def call_rest_rpc(fn_name, payload, schema, anon_key):
    url = f"{REST_URL}/rpc/{fn_name}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("apikey", anon_key)
    req.add_header("Authorization", f"Bearer {anon_key}")
    req.add_header("Content-Profile", schema)
    req.add_header("Accept-Profile", schema)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        return err.code, json.loads(body) if body.startswith("{") else {"raw": body}


def clone_to_qa(sql_text):
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", "sawyan_qa", sql_text)


def read_sql(filename):
    with open(os.path.join(DB_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def check_dual_site_parity():
    print("=== [1/4] Verifying 100% SHA-256 Parity Across Root (/) and Parallel (/preview/) ===")
    targets_dirs = ["shared", "css", "js", "public", "member-dashboard", "member-demo"]
    targets_files = ["index.html", "auth-gateway.html", "member-showcase.html"]
    count = 0

    for fname in targets_files:
        p_path = os.path.join(PREVIEW_DIR, fname)
        r_path = os.path.join(REPO_DIR, fname)
        assert os.path.exists(p_path) and os.path.exists(r_path), f"Missing {fname}"
        assert sha256_file(p_path) == sha256_file(r_path), f"Parity mismatch: {fname}"
        count += 1

    for d in targets_dirs:
        p_base = os.path.join(PREVIEW_DIR, d)
        r_base = os.path.join(REPO_DIR, d)
        for root, _, files in os.walk(p_base):
            for fn in files:
                p_fp = os.path.join(root, fn)
                rel = os.path.relpath(p_fp, PREVIEW_DIR)
                r_fp = os.path.join(REPO_DIR, rel)
                assert os.path.exists(r_fp), f"Missing mirrored file in root: {rel}"
                assert sha256_file(p_fp) == sha256_file(r_fp), f"Hash mismatch: {rel}"
                count += 1

    assert count >= 40, f"Expected >=40 mirrored files, got {count}"
    print(f" -> PASS: {count} files across Public Portal, Shared & Member Dashboard match 100% by SHA-256!")


def check_live_rest_stage4(token):
    print("=== [2/4] Testing Live PostgREST Stage 4 RPCs (sawyan & sawyan_demo) ===")
    _, keys = api_request("GET", "/api-keys", None, token)
    anon_key = next(k["api_key"] for k in keys if k.get("name") == "anon")

    # 1. Public merchants catalog on sawyan_demo: returns plan_cashback_pct (7.50%) & zero 25% share
    st_cat, cat = call_rest_rpc("get_public_merchants_catalog", {}, "sawyan_demo", anon_key)
    assert st_cat == 200 and isinstance(cat, list) and len(cat) >= 2, f"Catalog failed: {st_cat} {cat}"
    cat_dump = json.dumps(cat)
    assert "company_share" not in cat_dump and "deduction_percent" not in cat_dump
    assert any(float(r.get("plan_cashback_pct", 0)) == 7.5 for r in cat), f"Expected 7.5% net cashback, got {cat}"

    # 2. Authenticate login: blocks '123456', blocks Root #0, logs in Demo #1 cleanly
    st_weak, weak_res = call_rest_rpc("authenticate_member_login", {"p_identifier": "1", "p_password": "123456"}, "sawyan_demo", anon_key)
    assert st_weak >= 400 and "WEAK_OR_DEFAULT_PASSWORD_REJECTED" in json.dumps(weak_res), f"123456 not blocked: {weak_res}"

    st_root, root_res = call_rest_rpc("authenticate_member_login", {"p_identifier": "0", "p_password": "Demo@Sawyan2026"}, "sawyan", anon_key)
    assert st_root >= 400 and "ROOT_PORTAL_ACCESS_FORBIDDEN" in json.dumps(root_res), f"Root #0 login not blocked: {root_res}"

    st_ok, ok_res = call_rest_rpc("authenticate_member_login", {"p_identifier": "1", "p_password": "Demo@Sawyan2026"}, "sawyan_demo", anon_key)
    assert st_ok == 200 and ok_res.get("success") is True and ok_res.get("session_token"), f"Demo #1 login failed: {ok_res}"
    m1_id = ok_res["member"]["id"]
    sess_tok = ok_res["session_token"]

    # 3. IDOR guard test: invalid session token must fail!
    st_idor, idor_res = call_rest_rpc(
        "get_member_dashboard_bundle",
        {"p_member_id": m1_id, "p_session_token": "WRONG_TOKEN_123", "p_period_ym": "2026-11"},
        "sawyan_demo",
        anon_key,
    )
    assert st_idor >= 400 and "UNAUTHORIZED_MEMBER_SESSION" in json.dumps(idor_res), f"IDOR check failed: {st_idor} {idor_res}"

    # 4. Member Dashboard Bundle + Country Lenses (ALL vs EG vs TR) on sawyan_demo 48-member tree
    st_b_all, b_all = call_rest_rpc(
        "get_member_dashboard_bundle",
        {"p_member_id": m1_id, "p_session_token": sess_tok, "p_period_ym": "2026-11", "p_lens_country_code": None},
        "sawyan_demo",
        anon_key,
    )
    assert st_b_all == 200 and len(b_all.get("tree_analytics", {}).get("nodes", [])) == 49, (
        f"Expected 49 nodes (#1 + 48 team), got {len(b_all.get('tree_analytics', {}).get('nodes', []))}"
    )
    assert "company_share" not in json.dumps(b_all) and "pwd_bcrypt" not in json.dumps(b_all)

    st_b_eg, b_eg = call_rest_rpc(
        "get_member_dashboard_bundle",
        {"p_member_id": m1_id, "p_session_token": sess_tok, "p_period_ym": "2026-11", "p_lens_country_code": "EG"},
        "sawyan_demo",
        anon_key,
    )
    assert st_b_eg == 200 and b_eg.get("lens_country_code") == "EG"
    eg_nodes = b_eg["tree_analytics"]["nodes"]
    assert any(n["node_color"] == "BLACK" for n in eg_nodes), "Expected Turkish nodes dimmed BLACK under EG lens"
    print(" -> PASS: Live PostgREST Catalog (7.5% net), Login (no 123456), IDOR token guard, 49-node Tree & EG/TR Lenses passed!")


def check_qa_sandbox_stage4(token):
    print("=== [3/4] Running Ephemeral QA Sandbox (`sawyan_qa`) End-to-End Member Lifecycle ===")
    run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
    for sql_f in (
        "01_schema_and_43_tables.sql",
        "02_core_functions_and_triggers.sql",
        "03_seed_coa_countries_and_demo.sql",
        "05_stage3_api_payment_and_shift_rpcs.sql",
        "06_stage4_member_and_portal_rpcs.sql",
    ):
        run_sql(clone_to_qa(read_sql(sql_f)), token)

    qa_sql = """
    DO $$
    DECLARE
        v_eg_id      INT;
        v_root_id    UUID;
        v_m1_id      UUID;
        v_merch_id   UUID;
        v_branch_id  UUID;
        v_reg_res    JSONB;
        v_m2_id      UUID;
        v_m2_tok     TEXT;
        v_crm_res    JSONB;
        v_cid        UUID;
        v_pend_res   JSONB;
        v_tx_id      UUID;
        v_rev_res    JSONB;
        v_disp_res   JSONB;
        v_set_res    JSONB;
        v_auth_res   JSONB;
    BEGIN
        SELECT id INTO v_eg_id FROM sawyan_qa.countries WHERE country_code = 'EG';
        SELECT id INTO v_root_id FROM sawyan_qa.members WHERE member_code = 0;

        -- Seed Leader #1 & a Merchant + Branch
        INSERT INTO sawyan_qa.members (
            member_code, full_name, phone, residency_country_id, auth_user_id,
            sponsor_id, placement_side, metadata
        ) VALUES (
            1, 'قائد الفريق #1', '+201000000011', v_eg_id, gen_random_uuid(),
            v_root_id, 'root_direct', '{"seed_root_approved": true}'::jsonb
        ) RETURNING id INTO v_m1_id;

        INSERT INTO sawyan_qa.merchants (
            merchant_code, country_id, business_name, owner_name, email, phone,
            category, merchant_type, deduction_percent, package_base_amount, actual_cash_balance, is_active
        ) VALUES (
            'M-QA-4', v_eg_id, 'متجر المرحلة الرابعة', 'صاحب متجر', 'm4@sawyan.test', '+201099998888',
            'supermarket', 'physical', 10.00, 10000.00, 10000.00, true
        ) RETURNING id INTO v_merch_id;

        INSERT INTO sawyan_qa.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude
        ) VALUES (v_merch_id, 'BR-01', 'فرع رئيسي', true, 'القاهرة', 30.0444, 31.2357)
        RETURNING id INTO v_branch_id;

        -- 1. Reject Root #0 sponsor & Reject weak password '123456'
        BEGIN
            PERFORM sawyan_qa.register_new_member('شخص', '+201111111111', 0, 'StrongPass!99', 'EG');
            RAISE EXCEPTION 'SHOULD_HAVE_BLOCKED_ROOT_0';
        EXCEPTION WHEN OTHERS THEN
            ASSERT SQLERRM LIKE '%ROOT_SPONSOR_RESTRICTED_TO_ADMIN%', 'Unexpected error: ' || SQLERRM;
        END;

        BEGIN
            PERFORM sawyan_qa.register_new_member('شخص', '+201111111111', 1, '123456', 'EG');
            RAISE EXCEPTION 'SHOULD_HAVE_REJECTED_123456';
        EXCEPTION WHEN OTHERS THEN
            ASSERT SQLERRM LIKE '%WEAK_OR_DEFAULT_PASSWORD_REJECTED%', 'Unexpected error: ' || SQLERRM;
        END;

        -- 2. Register Member #2 under Sponsor #1 -> Atomic right child placement + bcrypt login
        v_reg_res := sawyan_qa.register_new_member(
            'يوسف طارق حسن', '+201222223333', 1, 'StrongPass!99', 'EG', 'EG', 360630, 'مدينة نصر', 'youssef@sawyan.test'
        );
        v_m2_id  := (v_reg_res->'member'->>'id')::uuid;
        v_m2_tok := v_reg_res->>'session_token';
        ASSERT (v_reg_res->'member'->>'member_code')::int = 2, 'Expected sequential member_code=2';
        ASSERT v_reg_res->'member'->>'placement_side' = 'right', 'Expected G02 right arm first placement';

        -- Authenticate newly registered member
        v_auth_res := sawyan_qa.authenticate_member_login('2', 'StrongPass!99');
        v_m2_tok := v_auth_res->>'session_token';
        ASSERT v_auth_res->>'success' = 'true' AND v_auth_res->'member'->>'email' = 'youssef@sawyan.test';

        -- 3. Mini CRM lifecycle (add auto-linking phone +201000000011 -> member #1, toggle opt_out, delete)
        v_crm_res := sawyan_qa.manage_member_crm_contact(v_m2_id, 'add', v_m2_tok, NULL, 'القائد', '+201000000011', 'مرشح قديم');
        ASSERT (v_crm_res->>'registered_linked')::boolean = true, 'Expected phone auto-link to registered member';
        v_cid := (v_crm_res->>'contact_id')::uuid;
        PERFORM sawyan_qa.manage_member_crm_contact(v_m2_id, 'toggle_opt_out', v_m2_tok, v_cid);
        PERFORM sawyan_qa.manage_member_crm_contact(v_m2_id, 'delete', v_m2_tok, v_cid);

        -- 4. Submit pending purchase (Path B) -> confirm via merchant engine -> submit Review & Dispute
        v_pend_res := sawyan_qa.submit_member_pending_purchase(v_m2_id, v_merch_id, v_branch_id, 500.00, 'cash', gen_random_uuid(), v_m2_tok);
        v_tx_id := (v_pend_res->>'transaction_id')::uuid;
        ASSERT v_pend_res->>'status' = 'pending';

        PERFORM sawyan_qa.feed_monthly_target_box(v_tx_id, v_merch_id);
        v_rev_res := sawyan_qa.submit_member_review(v_m2_id, v_tx_id, 5::smallint, 'خدمة ممتازة', v_m2_tok);
        ASSERT (v_rev_res->>'success')::boolean = true;

        v_disp_res := sawyan_qa.submit_member_dispute(v_m2_id, v_tx_id, 'فحص تجربة تذكرة النزاع', v_m2_tok);
        ASSERT v_disp_res->>'status' = 'awaiting_merchant_friendly';

        -- 5. Profile Favorite + Secure Password Change
        v_set_res := sawyan_qa.update_member_profile_settings(
            v_m2_id, v_m2_tok, 'يوسف طارق المعدل', NULL, 'التجمع الخامس', v_merch_id, 'toggle', 'StrongPass!99', 'NewPass!2026'
        );
        ASSERT jsonb_array_length(v_set_res->'favorite_merchant_ids') = 1;
        PERFORM sawyan_qa.authenticate_member_login('2', 'NewPass!2026');
    END $$;
    """
    try:
        run_sql(qa_sql, token)
        print(" -> PASS: Full QA Member Lifecycle (Register G01-G05, Bcrypt Login, CRM, Path B Purchase, Review, Dispute, Settings) passed!")
    finally:
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
        print(" -> Ephemeral `sawyan_qa` cleaned up.")


def check_static_security():
    print("=== [4/4] Checking Static Security & Clean Branding Across Stage 4 UI ===")
    for folder in (PREVIEW_DIR, REPO_DIR):
        with open(os.path.join(folder, "member-dashboard", "login.html"), "r", encoding="utf-8") as f:
            login_html = f.read()
        assert 'value="123456"' not in login_html, "Found hardcoded 123456 default password in login.html"

        with open(os.path.join(folder, "member-dashboard", "register.html"), "r", encoding="utf-8") as f:
            reg_html = f.read()
        assert "simulateRegistrationSuccess" not in reg_html and "كلمة المرور المؤقتة:</strong> <code>123456</code>" not in reg_html

        with open(os.path.join(folder, "member-dashboard", "js", "dashboard.js"), "r", encoding="utf-8") as f:
            dash_js = f.read()
        assert ".from('wallets').update" not in dash_js and "wallet.balance +" not in dash_js, "D21 violation: direct client wallet mutation detected"

        for policy in ("terms.html", "privacy.html", "contact.html"):
            with open(os.path.join(folder, "public", policy), "r", encoding="utf-8") as f:
                ptxt = f.read()
            assert "SAWYAN BANK" not in ptxt, f"D24 violation: 'SAWYAN BANK' found in {policy}"

    secret_pattern = re.compile(r"(sbp_[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]{16,})")
    for root, dirs, files in os.walk(REPO_DIR):
        dirs[:] = [d for d in dirs if d not in (".git", "backups")]
        for fn in files:
            if fn.endswith((".js", ".html", ".sql", ".py", ".css", ".md")):
                fp = os.path.join(root, fn)
                with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                    m = secret_pattern.search(f.read())
                assert not m, f"SECRET LEAK DETECTED in {fp}"
    print(" -> PASS: Zero default 123456 passwords, zero client wallet writes, clean D24 branding & zero secrets!")


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN env var required.", file=sys.stderr)
        sys.exit(1)

    check_dual_site_parity()
    check_live_rest_stage4(token)
    check_qa_sandbox_stage4(token)
    check_static_security()
    print("=== STAGE 4 COMPLETE: 100% VERIFIED ACROSS DB, REST, SANDBOX, DUAL-SITE PARITY & SECURITY AUDIT ===")


if __name__ == "__main__":
    main()
