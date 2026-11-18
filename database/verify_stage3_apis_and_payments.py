import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)


def api_request(method, endpoint, payload, token):
    url = f"{BASE_API}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "SAWYAN-Stage3-Verifier/3.0")
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
        with urllib.request.urlopen(req, timeout=20) as resp:
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


def check_shared_parity():
    print("=== [1/5] Checking 100% SHA-256 Parity Between shared/ and preview/shared/ ===")
    preview_shared = os.path.join(REPO_DIR, "preview", "shared")
    root_shared = os.path.join(REPO_DIR, "shared")
    checked = 0
    for root, _, files in os.walk(preview_shared):
        for fname in files:
            p_file = os.path.join(root, fname)
            rel = os.path.relpath(p_file, preview_shared)
            r_file = os.path.join(root_shared, rel)
            assert os.path.exists(r_file), f"Missing in shared/: {rel}"
            assert sha256_file(p_file) == sha256_file(r_file), f"Hash mismatch: {rel}"
            checked += 1
    assert checked >= 20, f"Expected >= 20 shared files, checked {checked}"
    print(f" -> PASS: {checked} files match 100% by SHA-256 across shared/ and preview/shared/.")


def check_live_rest_rpcs(token):
    print("=== [2/5] Testing Live PostgREST Stage 3 RPCs (sawyan & sawyan_demo) ===")
    _, keys = api_request("GET", "/api-keys", None, token)
    anon_key = next(k["api_key"] for k in keys if k.get("name") == "anon")

    # 1. Sponsor #0 public block on BOTH Production & Demo
    for schema in ("sawyan", "sawyan_demo"):
        st, body = call_rest_rpc("lookup_sponsor_by_code", {"p_member_code": 0}, schema, anon_key)
        assert st >= 400 and "ROOT_SPONSOR_RESTRICTED_TO_ADMIN" in json.dumps(body), (
            f"Root #0 block failed on {schema}: {st} {body}"
        )

    # 2. Sponsor #1 lookup on Demo returns sponsor full name; on clean Prod returns found=False
    st_demo, demo_sp = call_rest_rpc("lookup_sponsor_by_code", {"p_member_code": 1}, "sawyan_demo", anon_key)
    assert st_demo == 200 and demo_sp.get("found") is True and demo_sp.get("member_code") == 1, f"Demo #1 failed: {demo_sp}"
    st_prod, prod_sp = call_rest_rpc("lookup_sponsor_by_code", {"p_member_code": 1}, "sawyan", anon_key)
    assert st_prod == 200 and prod_sp.get("found") is False, f"Clean prod should not have #1: {prod_sp}"

    # 3. Public verify transaction on sawyan_demo (masked name, zero phone/split leakage)
    tx_rows = run_sql("SELECT sw_short_code, merchant_id FROM sawyan_demo.transactions ORDER BY created_at DESC LIMIT 1;", token)
    assert len(tx_rows) >= 1, "No demo transaction found in sawyan_demo"
    short_code = tx_rows[0]["sw_short_code"]
    st_ver, ver = call_rest_rpc("public_verify_transaction", {"p_short_code": short_code}, "sawyan_demo", anon_key)
    assert st_ver == 200 and ver.get("found") is True, f"Verify failed: {st_ver} {ver}"
    ver_dump = json.dumps(ver)
    assert "phone" not in ver_dump and "company_share" not in ver_dump and "income_plan_share" not in ver_dump
    assert "—" in ver.get("masked_member_name", ""), f"Expected masked display name, got {ver}"

    # 4. Shift closing on sawyan_demo via REST RPC (no 25%/75% split leak)
    st_sc, sc = call_rest_rpc(
        "get_merchant_shift_closing",
        {"p_merchant_id": tx_rows[0]["merchant_id"], "p_period_filter": "month"},
        "sawyan_demo",
        anon_key,
    )
    assert st_sc == 200 and sc.get("summary", {}).get("completed_count", 0) >= 1, f"Demo shift closing failed: {st_sc} {sc}"
    sc_dump = json.dumps(sc)
    assert "company_share" not in sc_dump and "income_plan_share" not in sc_dump
    print(f" -> PASS: Live REST RPCs verified (Sponsor #0 block, Sponsor #1='{demo_sp['full_name']}', Verify='{ver['masked_member_name']}', Shift Closing).")


def check_qa_sandbox_stage3(token):
    print("=== [3/5] Running Stage 3 Ephemeral QA Sandbox (`sawyan_qa`) Assertions ===")
    run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
    run_sql(clone_to_qa(read_sql("01_schema_and_43_tables.sql")), token)
    run_sql(clone_to_qa(read_sql("02_core_functions_and_triggers.sql")), token)
    run_sql(clone_to_qa(read_sql("03_seed_coa_countries_and_demo.sql")), token)
    run_sql(clone_to_qa(read_sql("05_stage3_api_payment_and_shift_rpcs.sql")), token)

    now_ts = int(time.time())
    old_ts = now_ts - 600

    qa_sql = f"""
    DO $$
    DECLARE
        v_eg_id          INT;
        v_root_id        UUID;
        v_m1_id          UUID;
        v_inj_id         UUID;
        v_merch_id       UUID;
        v_branch_id      UUID;
        v_cashier_id     UUID;
        v_adm1_id        UUID;
        v_adm2_id        UUID;
        v_res            JSONB;
        v_mc_id          UUID;
        v_csv_member     TEXT;
        v_audit_cnt      BIGINT;
        v_err            TEXT;
        v_bal_before     NUMERIC(18,2);
        v_bal_after      NUMERIC(18,2);
        v_bal_dup        NUMERIC(18,2);
        v_tx_fifo_status VARCHAR(35);
    BEGIN
        SELECT id INTO v_eg_id FROM sawyan_qa.countries WHERE country_code = 'EG';
        SELECT id INTO v_root_id FROM sawyan_qa.members WHERE member_code = 0;

        -- Admins for Maker-Checker test
        INSERT INTO sawyan_qa.admins (full_name, email, auth_user_id, role)
        VALUES ('Admin Maker', 'maker@sawyan.test', gen_random_uuid(), 'finance')
        RETURNING id INTO v_adm1_id;

        INSERT INTO sawyan_qa.admins (full_name, email, auth_user_id, role)
        VALUES ('Admin Checker', 'checker@sawyan.test', gen_random_uuid(), 'approver')
        RETURNING id INTO v_adm2_id;

        -- Members (#1 normal, #2 crafted CSV-injection payload name)
        INSERT INTO sawyan_qa.members (
            member_code, full_name, phone, residency_country_id, auth_user_id,
            sponsor_id, placement_side, metadata
        ) VALUES (
            1, 'سارة علي محمود', '+201011112222', v_eg_id, gen_random_uuid(),
            v_root_id, 'root_direct', '{{"seed_root_approved": true}}'::jsonb
        ) RETURNING id INTO v_m1_id;

        INSERT INTO sawyan_qa.members (
            member_code, full_name, phone, residency_country_id, auth_user_id,
            sponsor_id
        ) VALUES (
            2, '=CMD|'' /C calc''!A0 أحمد', '+201033334444', v_eg_id, gen_random_uuid(),
            v_m1_id
        ) RETURNING id INTO v_inj_id;

        -- Merchant (100% green zone: 10000/10000) + branch + cashier
        INSERT INTO sawyan_qa.merchants (
            merchant_code, country_id, business_name, owner_name, email, phone,
            category, merchant_type, deduction_percent, package_base_amount,
            actual_cash_balance, credit_limit, is_active, is_isolated
        ) VALUES (
            'MERCH-QA-01', v_eg_id, 'متجر الأمل الاختباري', 'كريم طارق', 'qa.merch@sawyan.test', '+201055556666',
            'supermarket', 'physical', 10.00, 10000.00, 10000.00, 0.00, true, false
        ) RETURNING id INTO v_merch_id;

        INSERT INTO sawyan_qa.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude
        ) VALUES (
            v_merch_id, 'BR-01', 'فرع المعادي', true, 'شارع 9', 29.9602, 31.2569
        ) RETURNING id INTO v_branch_id;

        INSERT INTO sawyan_qa.cashier_employees (
            merchant_id, branch_id, employee_code, full_name, pin_hash
        ) VALUES (
            v_merch_id, v_branch_id, 'CASH-01', 'يوسف الكاشير', 'hash_demo'
        ) RETURNING id INTO v_cashier_id;

        -- ------------------------------------------------------------------
        -- TEST 1: Shift Closing + CSV Formula Injection Sanitization + Audit
        -- ------------------------------------------------------------------
        v_res := sawyan_qa.submit_pos_transaction(
            v_inj_id, v_merch_id, v_branch_id, 1000.00, 'cash',
            'REF-CSV-001', 'SW-CSV-001', gen_random_uuid(), v_cashier_id, true, NULL
        );

        ASSERT sawyan_qa.sanitize_csv_cell('=CMD|'' /C calc''!A0') = '''=CMD|'' /C calc''!A0', 'Direct = sanitize failed';
        ASSERT sawyan_qa.sanitize_csv_cell('+1+1') = '''+1+1', 'Direct + sanitize failed';
        ASSERT sawyan_qa.sanitize_csv_cell('-2*3') = '''-2*3', 'Direct - sanitize failed';
        ASSERT sawyan_qa.sanitize_csv_cell('@SUM(1,1)') = '''@SUM(1,1)', 'Direct @ sanitize failed';

        v_res := sawyan_qa.get_merchant_shift_closing(v_merch_id, v_branch_id, 'today', NULL, NULL, 'csv', v_merch_id);
        ASSERT (v_res->'summary'->>'completed_count')::int = 1, 'Expected 1 completed tx in shift closing';
        ASSERT (v_res->'summary'->>'completed_commission')::numeric = 100.00, 'Expected 100.00 commission';
        ASSERT v_res->>'export_audit_log_id' IS NOT NULL, 'Expected export audit log id';
        v_csv_member := v_res->'transactions'->0->'csv_safe_row'->>'member';
        ASSERT left(v_csv_member, 2) = '''=', 'Expected escaped = in csv_safe_row.member, got: ' || COALESCE(v_csv_member, 'NULL');
        SELECT COUNT(*) INTO v_audit_cnt FROM sawyan_qa.audit_logs WHERE action = 'merchant_shift_export';
        ASSERT v_audit_cnt = 1, 'Expected 1 merchant_shift_export audit log';

        -- ------------------------------------------------------------------
        -- TEST 2: Flash Offer (Green OK, Bad Link Blocked, Low Wallet Blocked)
        -- ------------------------------------------------------------------
        v_res := sawyan_qa.submit_merchant_flash_offer(
            v_merch_id, 'خصم الجمعة في المعادي', 'تخفيض خاص للأعضاء داخل المتجر اليوم فقط', '10% إضافي', v_merch_id
        );
        ASSERT v_res->>'status' = 'pending_admin_approval', 'Flash offer status mismatch';

        -- Blocked link
        BEGIN
            PERFORM sawyan_qa.submit_merchant_flash_offer(v_merch_id, 'عرض خاص', 'اطلب الآن من https://badsite.com فورا');
            RAISE EXCEPTION 'SHOULD_HAVE_FAILED_URL';
        EXCEPTION WHEN OTHERS THEN
            v_err := SQLERRM;
            ASSERT v_err LIKE '%FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT%', 'Unexpected URL error: ' || v_err;
        END;

        -- Blocked phone
        BEGIN
            PERFORM sawyan_qa.submit_merchant_flash_offer(v_merch_id, 'عرض خاص', 'تواصل للدفع مباشرة على 01012345678');
            RAISE EXCEPTION 'SHOULD_HAVE_FAILED_PHONE';
        EXCEPTION WHEN OTHERS THEN
            v_err := SQLERRM;
            ASSERT v_err LIKE '%FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT%', 'Unexpected phone error: ' || v_err;
        END;

        -- Drop wallet below green zone (25% <= 30%) -> Blocked
        UPDATE sawyan_qa.merchants SET actual_cash_balance = 2500.00 WHERE id = v_merch_id;
        BEGIN
            PERFORM sawyan_qa.submit_merchant_flash_offer(v_merch_id, 'عرض نظيف', 'تخفيض ممتاز لأعضاء سويا بالفرع');
            RAISE EXCEPTION 'SHOULD_HAVE_FAILED_WALLET';
        EXCEPTION WHEN OTHERS THEN
            v_err := SQLERRM;
            ASSERT v_err LIKE '%FLASH_OFFER_BLOCKED_WALLET_NOT_GREEN%', 'Unexpected wallet error: ' || v_err;
        END;

        -- ------------------------------------------------------------------
        -- TEST 3: Payment Webhook (Invalid Sig, Replay >300s, Valid FIFO, Dedup)
        -- ------------------------------------------------------------------
        BEGIN
            PERFORM sawyan_qa.process_payment_webhook('stripe', 'evt_bad_sig', 'merchant_topup_succeeded', NULL, v_merch_id, 5000.00, 50.00, 'EGP', {now_ts}, false);
            RAISE EXCEPTION 'SHOULD_HAVE_FAILED_SIG';
        EXCEPTION WHEN OTHERS THEN
            ASSERT SQLERRM LIKE '%WEBHOOK_SIGNATURE_INVALID%', 'Unexpected sig error: ' || SQLERRM;
        END;

        BEGIN
            PERFORM sawyan_qa.process_payment_webhook('stripe', 'evt_old_ts', 'merchant_topup_succeeded', NULL, v_merch_id, 5000.00, 50.00, 'EGP', {old_ts}, true);
            RAISE EXCEPTION 'SHOULD_HAVE_FAILED_TS';
        EXCEPTION WHEN OTHERS THEN
            ASSERT SQLERRM LIKE '%WEBHOOK_TIMESTAMP_EXPIRED_300S%', 'Unexpected ts error: ' || SQLERRM;
        END;

        -- Trigger isolation & queue 1 invoice awaiting_merchant_topup
        UPDATE sawyan_qa.merchants SET actual_cash_balance = 50.00, is_isolated = false WHERE id = v_merch_id;
        PERFORM sawyan_qa.submit_pos_transaction(
            v_m1_id, v_merch_id, v_branch_id, 2000.00, 'cash',
            'REF-FIFO-001', 'SW-FIFO-001', gen_random_uuid(), v_cashier_id, true, NULL
        );
        SELECT actual_cash_balance INTO v_bal_before FROM sawyan_qa.merchants WHERE id = v_merch_id;

        -- Valid webhook tops up 5000.00 EGP -> releases queued tx (200 EGP commission) + un-isolates merchant
        v_res := sawyan_qa.process_payment_webhook(
            'stripe', 'evt_topup_ok_1', 'merchant_topup_succeeded',
            NULL, v_merch_id, 5000.00, 100.00, 'EGP', {now_ts}, true, '{{"source":"test"}}'::jsonb
        );
        ASSERT v_res->>'status' = 'processed', 'Webhook failed: ' || v_res::text;
        ASSERT (v_res->>'net_settled_amount')::numeric = 4900.00, 'Net settled mismatch';
        ASSERT (v_res->'topup_result'->>'released_fifo_count')::int = 1, 'Expected 1 FIFO tx released';
        ASSERT (v_res->'topup_result'->>'is_isolated')::boolean = false, 'Expected merchant un-isolated';
        SELECT status INTO v_tx_fifo_status FROM sawyan_qa.transactions WHERE sw_short_code = 'SW-FIFO-001';
        ASSERT v_tx_fifo_status = 'completed', 'Queued FIFO tx did not complete';
        SELECT actual_cash_balance INTO v_bal_after FROM sawyan_qa.merchants WHERE id = v_merch_id;

        -- Duplicate event delivery must be ignored with 0 balance change
        v_res := sawyan_qa.process_payment_webhook(
            'stripe', 'evt_topup_ok_1', 'merchant_topup_succeeded',
            NULL, v_merch_id, 5000.00, 100.00, 'EGP', {now_ts}, true, '{{"source":"replay"}}'::jsonb
        );
        ASSERT v_res->>'status' = 'duplicate_ignored', 'Duplicate webhook was not ignored: ' || v_res::text;
        SELECT actual_cash_balance INTO v_bal_dup FROM sawyan_qa.merchants WHERE id = v_merch_id;
        ASSERT v_bal_dup = v_bal_after, 'Duplicate webhook mutated merchant balance!';

        -- ------------------------------------------------------------------
        -- TEST 4: Maker-Checker Governance (Blocks Self-Approval, Allows Peer)
        -- ------------------------------------------------------------------
        v_res := sawyan_qa.submit_maker_checker_request(
            'COUNTRY_ACTIVATION_GATE', 'countries', 'SA',
            '{{"is_active": true}}'::jsonb, v_adm1_id, 'Ready for launch'
        );
        v_mc_id := (v_res->>'request_id')::uuid;

        BEGIN
            PERFORM sawyan_qa.decide_maker_checker_request(v_mc_id, v_adm1_id, 'approved', NULL);
            RAISE EXCEPTION 'SHOULD_HAVE_FAILED_SELF_APPROVE';
        EXCEPTION WHEN OTHERS THEN
            ASSERT SQLERRM LIKE '%MAKER_CANNOT_APPROVE_OWN_REQUEST%', 'Self-approval not blocked: ' || SQLERRM;
        END;

        v_res := sawyan_qa.decide_maker_checker_request(v_mc_id, v_adm2_id, 'approved', NULL);
        ASSERT v_res->>'status' = 'approved' AND (v_res->>'checker_admin_id')::uuid = v_adm2_id, 'Checker approval failed';
    END $$;
    """
    try:
        run_sql(qa_sql, token)
        print(" -> PASS: Shift Closing, CSV Sanitization, Flash Offers (Green/Y08), Webhooks (+/-300s, FIFO, Dedup), Maker-Checker DB gates passed!")
    finally:
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
        print(" -> Ephemeral `sawyan_qa` cleaned up.")


def check_js_modules_static():
    print("=== [4/5] Verifying Global Payment Providers, Security Invariants & API Client (Static Audit) ===")
    shared_dir = os.path.join(REPO_DIR, "shared")
    required_files = [
        "api/sawyan-api.js",
        "config/supabase.js",
        "payments/payment-provider.js",
        "payments/payment-service.js",
        "payments/payment-init.js",
        "payments/providers/stripe-provider.js",
        "payments/providers/adyen-provider.js",
        "payments/providers/paypal-wise-provider.js",
        "payments/providers/iyzico-provider.js",
        "payments/providers/hyperpay-provider.js",
        "payments/providers/paymob-provider.js",
        "payments/providers/fawry-provider.js",
    ]
    for rel in required_files:
        p = os.path.join(shared_dir, rel)
        assert os.path.exists(p) and os.path.getsize(p) > 200, f"Missing or empty JS module: {rel}"

    with open(os.path.join(shared_dir, "payments/payment-service.js"), "r", encoding="utf-8") as f:
        ps = f.read()
    assert "nonBindingPreviewOnly: true" in ps, "D21 non-binding preview flag missing in payment-service.js"
    assert "P2P_TRANSFERS_PROHIBITED_D24" in ps, "D24 P2P transfer ban guard missing"
    assert "SAWYAN_SECURE_KEY_2026" not in ps, "Legacy hardcoded QR key must be removed"
    assert "SAWYAN:MEMBER:" in ps, "Frozen #1 static member barcode mode missing"

    with open(os.path.join(shared_dir, "payments/providers/stripe-provider.js"), "r", encoding="utf-8") as f:
        sp = f.read()
    assert "isTimestampWithinTolerance(parts.t, 300)" in sp and "hmacSha256Hex" in sp

    with open(os.path.join(shared_dir, "payments/providers/adyen-provider.js"), "r", encoding="utf-8") as f:
        ap = f.read()
    assert "isTimestampWithinTolerance(timestampHeader, 300)" in ap and "hmacSha256Base64" in ap

    with open(os.path.join(shared_dir, "payments/providers/paypal-wise-provider.js"), "r", encoding="utf-8") as f:
        pp = f.read()
    assert "isTimestampWithinTolerance(timestampSec, 300)" in pp and "hmacSha256Hex" in pp

    with open(os.path.join(shared_dir, "api/sawyan-api.js"), "r", encoding="utf-8") as f:
        api_js = f.read()
    for rpc_name in (
        "lookup_sponsor_by_code",
        "public_verify_transaction",
        "submit_pos_transaction",
        "get_merchant_shift_closing",
        "submit_merchant_flash_offer",
        "get_merchants_radar",
        "get_merchant_members_density",
        "get_tree_analytics_with_country_lens",
        "submit_maker_checker_request",
        "decide_maker_checker_request",
    ):
        assert rpc_name in api_js, f"Missing RPC wrapper in sawyan-api.js: {rpc_name}"

    # Verify zero leaked secrets across entire bank-main JS/SQL/PY tree
    secret_pattern = re.compile(r"(sbp_[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|sk_live_[a-zA-Z0-9]{16,})")
    for root, dirs, files in os.walk(REPO_DIR):
        dirs[:] = [d for d in dirs if d not in (".git", "backups")]
        for fn in files:
            if fn.endswith((".js", ".html", ".sql", ".py", ".css", ".md")):
                fp = os.path.join(root, fn)
                with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                    txt = f.read()
                m = secret_pattern.search(txt)
                assert not m, f"SECRET LEAK DETECTED in {fp}: {m.group(0)[:10]}..."

    print(" -> PASS: All Global Payment Providers, API wrappers, D21/D24 guards & Secret Scan verified!")


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN env var required.", file=sys.stderr)
        sys.exit(1)

    check_shared_parity()
    check_live_rest_rpcs(token)
    check_qa_sandbox_stage3(token)
    check_js_modules_static()
    print("=== [5/5] STAGE 3 VERIFICATION PASSED (DB + LIVE REST + EPHEMERAL QA + STATIC JS AUDIT) ===")


if __name__ == "__main__":
    main()
