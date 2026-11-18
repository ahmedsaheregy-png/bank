import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)


def api_request(method, endpoint, payload, token):
    req = urllib.request.Request(
        f"{BASE_API}{endpoint}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-Stage5-Verifier/3.0",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8")
        return resp.status, json.loads(raw) if raw else {}


def run_sql(sql, token):
    _, res = api_request("POST", "/database/query", {"query": sql}, token)
    return res


def call_rest_rpc(fn_name, payload, schema, anon_key):
    req = urllib.request.Request(
        f"{REST_URL}/rpc/{fn_name}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Profile": schema,
            "Accept-Profile": schema,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        return err.code, json.loads(body) if body.startswith("{") else {"raw": body}


def clone_to_qa(sql_text):
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", "sawyan_qa_s5", sql_text)


def read_sql(filename):
    with open(os.path.join(DB_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


def get_anon_key():
    with open(os.path.join(REPO_DIR, "shared", "config", "supabase.js"), "r", encoding="utf-8") as f:
        m = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)['\"]", f.read())
    return m.group(1)


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN missing.", file=sys.stderr)
        sys.exit(1)

    anon_key = get_anon_key()
    checks = []

    def record(name, passed, detail=""):
        checks.append({"name": name, "passed": bool(passed)})
        print(f" [{'PASS' if passed else 'FAIL'}] {name} {('— ' + str(detail)) if detail else ''}")

    # 1. Live PostgREST Test on `sawyan_demo`: Merchant Bcrypt Login + IDOR Guard + Zero 25%/75% Leak + POS Lookup
    st_bad_pw, _ = call_rest_rpc("authenticate_merchant_login", {"p_identifier": "M-EG-001", "p_password": "123456"}, "sawyan_demo", anon_key)
    record("S5-01: Default '123456' password strictly rejected on Merchant Login", st_bad_pw == 400, f"HTTP {st_bad_pw}")

    st_login, login_body = call_rest_rpc("authenticate_merchant_login", {"p_identifier": "M-EG-001", "p_password": "Demo@Merchant2026"}, "sawyan_demo", anon_key)
    merch_id = login_body.get("merchant", {}).get("id")
    sess_tok = login_body.get("session_token")
    record("S5-02: Live PostgREST Bcrypt Merchant Login succeeds for M-EG-001", st_login == 200 and bool(merch_id) and bool(sess_tok), f"id={merch_id}")

    st_idor, _ = call_rest_rpc("get_merchant_dashboard_bundle", {"p_merchant_id": merch_id, "p_session_token": "FORGED_TOKEN_999"}, "sawyan_demo", anon_key)
    record("S5-03: Merchant Bundle IDOR forged token blocked", st_idor == 400, f"HTTP {st_idor}")

    st_bundle, bundle = call_rest_rpc("get_merchant_dashboard_bundle", {"p_merchant_id": merch_id, "p_session_token": sess_tok}, "sawyan_demo", anon_key)
    bundle_str = json.dumps(bundle)
    no_split_leak = ("company_share" not in bundle_str) and ("income_plan_share" not in bundle_str)
    record(
        "S5-04: Merchant Dashboard Bundle loads live & hides internal 25%/75% split (F01 / Ch. 7.2 #5)",
        st_bundle == 200 and no_split_leak and bundle.get("profile", {}).get("merchant_code") == "M-EG-001",
        f"zone={bundle.get('profile', {}).get('zone_status')}, cashiers={len(bundle.get('cashiers', []))}"
    )

    st_lookup, lookup = call_rest_rpc("lookup_member_for_pos", {"p_merchant_id": merch_id, "p_member_identifier": "SAWYAN:MEMBER:1", "p_session_token": sess_tok}, "sawyan_demo", anon_key)
    record(
        "S5-05: POS Member Lookup parses QR & masks member phone (D26)",
        st_lookup == 200 and lookup.get("found") is True and "phone" not in json.dumps(lookup),
        lookup.get("masked_name")
    )

    st_pos_live, pos_live_body = call_rest_rpc("authenticate_and_submit_pos_tx", {
        "p_merchant_id": merch_id,
        "p_member_code": 2,
        "p_amount": 150.00,
        "p_payment_type": "cash",
        "p_idempotency_key": str(uuid.uuid4()),
        "p_session_token": sess_tok,
        "p_employee_code": "EMP-01",
        "p_cashier_pin": "2580"
    }, "sawyan_demo", anon_key)
    record(
        "S5-05b: Live PostgREST anon Cashier-PIN POS TX + Deferred Ledger Trigger commits HTTP 200",
        st_pos_live == 200 and pos_live_body.get("success") is True,
        f"HTTP {st_pos_live} {pos_live_body.get('sw_short_code', pos_live_body)}"
    )

    # 2. Country Gate D13 block on Production `sawyan` when registering merchant in inactive country `DE`
    st_d13, d13_body = call_rest_rpc("register_new_merchant", {
        "p_business_name": "Berlin Test GmbH",
        "p_owner_name": "Hans",
        "p_phone": "+4915123456789",
        "p_password": "Strong@Password2026",
        "p_country_code": "DE"
    }, "sawyan", anon_key)
    record("S5-06: Country Gate D13 blocks merchant onboarding in inactive country DE", st_d13 == 400 and "COUNTRY_GATE_INACTIVE_D13" in json.dumps(d13_body), f"HTTP {st_d13}")

    # 3. Isolated QA Sandbox (`sawyan_qa_s5`): Full Merchant Onboarding + D25 5-Attempt PIN Lockout + Self-PIN Block + Collusion Signal + Path B Confirm/Reject + Shift CSV
    try:
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa_s5 CASCADE;", token)
        for fn in [
            "01_schema_and_43_tables.sql",
            "02_core_functions_and_triggers.sql",
            "03_seed_coa_countries_and_demo.sql",
            "04_rls_and_grants.sql",
            "05_stage3_api_payment_and_shift_rpcs.sql",
            "06_stage4_member_and_portal_rpcs.sql",
            "07_remediation_security_and_settlement_patch.sql",
            "08_stage5_merchant_pos_and_portal_rpcs.sql",
        ]:
            run_sql(clone_to_qa(read_sql(fn)), token)
        run_sql(read_sql("03b_seed_demo_tree_48_members.sql").replace("sawyan_demo", "sawyan_qa_s5"), token)

        qa_res = run_sql("""
            DO $$
            DECLARE
                v_reg         JSONB;
                v_mid         UUID;
                v_tok         TEXT;
                v_br_id       UUID;
                v_m1_id       UUID;
                v_m2_id       UUID;
                v_m3_id       UUID;
                v_pos_res     JSONB;
                v_pend_res    JSONB;
                v_pend_tx_id  UUID;
                v_conf_res    JSONB;
                v_coll_cnt    INT;
                v_dr          NUMERIC(18,2);
                v_cr          NUMERIC(18,2);
                i             INT;
            BEGIN
                SELECT id INTO v_m1_id FROM sawyan_qa_s5.members WHERE member_code = 1;
                SELECT id INTO v_m2_id FROM sawyan_qa_s5.members WHERE member_code = 2;
                SELECT id INTO v_m3_id FROM sawyan_qa_s5.members WHERE member_code = 3;

                -- 1. Onboard new merchant with initial cashier EMP-01 (PIN 4321)
                v_reg := sawyan_qa_s5.register_new_merchant(
                    'متجر الجودة الشاملة', 'سامي التاجر', '+201099887766', 'Strong@Merch99',
                    'EG', 'supermarket', 'physical', 10.00, 'qa.merch@sawyan.test', 'القاهرة',
                    360630, 30.050000, 31.240000, 1, '4321', '{}'::jsonb
                );
                v_mid := (v_reg->'merchant'->>'id')::uuid;
                v_tok := v_reg->>'session_token';
                v_br_id := (v_reg->>'main_branch_id')::uuid;

                -- Top up merchant prepaid balance
                PERFORM sawyan_qa_s5.process_merchant_topup_fifo(v_mid, 5000.00, 'QA-S5-TOPUP'::varchar, gen_random_uuid());

                -- 2. Test D25 5-Attempt Wrong PIN Lockout on EMP-01
                FOR i IN 1..5 LOOP
                    v_pos_res := sawyan_qa_s5.authenticate_and_submit_pos_tx(
                        v_mid, 1, 200.00, 'cash', gen_random_uuid(), v_tok, v_br_id, 'EMP-01', '0000', NULL, NULL
                    );
                END LOOP;
                IF (v_pos_res->>'error_code') <> 'CASHIER_PIN_LOCKED_15M' THEN
                    RAISE EXCEPTION 'PIN_5_ATTEMPT_LOCKOUT_FAILED: %', v_pos_res;
                END IF;

                -- Even with the RIGHT PIN ('4321') while locked, it must still reject!
                v_pos_res := sawyan_qa_s5.authenticate_and_submit_pos_tx(
                    v_mid, 1, 200.00, 'cash', gen_random_uuid(), v_tok, v_br_id, 'EMP-01', '4321', NULL, NULL
                );
                IF (v_pos_res->>'error_code') <> 'CASHIER_PIN_LOCKED_15M' THEN
                    RAISE EXCEPTION 'LOCKED_PIN_ALLOWED_PREMATURELY: %', v_pos_res;
                END IF;

                -- 3. Add Cashier EMP-02 linked to Member #2 (PIN 7788) to test D25 Self-PIN Block & Collusion Signal!
                PERFORM sawyan_qa_s5.manage_merchant_cashier_and_settings(
                    v_mid, 'add_cashier', v_tok, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                    'EMP-02', 'كاشير مرتبط #2', '7788', 2, 5000.00, NULL, v_br_id
                );

                -- 3a. Self-PIN Block: EMP-02 tries to approve invoice for Member #2 (himself!)
                v_pos_res := sawyan_qa_s5.authenticate_and_submit_pos_tx(
                    v_mid, 2, 300.00, 'cash', gen_random_uuid(), v_tok, v_br_id, 'EMP-02', '7788', NULL, NULL
                );
                IF COALESCE(v_pos_res->'pos_result'->>'status', '') <> 'rejected_self_cashier_pin' THEN
                    RAISE EXCEPTION 'SELF_CASHIER_PIN_NOT_BLOCKED: %', v_pos_res;
                END IF;

                -- 3b. Collusion Signal: EMP-02 (#2) approves invoice for Member #3 (in #2's downline!) -> completes + fires cashier_upline_collusion
                v_pos_res := sawyan_qa_s5.authenticate_and_submit_pos_tx(
                    v_mid, 3, 400.00, 'cash', gen_random_uuid(), v_tok, v_br_id, 'EMP-02', '7788', NULL, NULL
                );
                SELECT COUNT(*) INTO v_coll_cnt FROM sawyan_qa_s5.fraud_graph_signals
                 WHERE involved_merchant_id = v_mid AND signal_type = 'cashier_upline_collusion';
                IF v_coll_cnt < 1 THEN
                    RAISE EXCEPTION 'CASHIER_COLLUSION_SIGNAL_NOT_FIRED';
                END IF;

                -- 4. Path B Member Pending Invoice -> Merchant Approve via confirm_or_reject_pending_tx
                v_pend_res := sawyan_qa_s5.submit_member_pending_purchase(
                    v_m1_id, v_mid, v_br_id, 600.00, 'cash', gen_random_uuid(), NULL, 'https://img/rec.jpg'
                );
                v_pend_tx_id := (v_pend_res->>'transaction_id')::uuid;
                v_conf_res := sawyan_qa_s5.confirm_or_reject_pending_tx(v_mid, v_pend_tx_id, 'approve', NULL, v_tok);
                IF (v_conf_res->'result'->>'status') <> 'completed' THEN
                    RAISE EXCEPTION 'PATH_B_CONFIRM_FAILED: %', v_conf_res;
                END IF;

                -- 5. Global Zero-Discrepancy Double-Entry Ledger Check
                SELECT SUM(debit_usd), SUM(credit_usd) INTO v_dr, v_cr FROM sawyan_qa_s5.journal_lines;
                IF v_dr <> v_cr THEN
                    RAISE EXCEPTION 'LEDGER_IMBALANCE_IN_STAGE5: dr=% cr=%', v_dr, v_cr;
                END IF;
            END $$;
            SELECT 'STAGE5_QA_ALL_PASSED' AS verdict;
        """, token)
        record("S5-07: Full Ephemeral QA (Onboarding + D25 5-PIN Lockout + Self-PIN Block + Collusion Signal + Path B Confirm + Balanced Ledger)", qa_res[0]["verdict"] == "STAGE5_QA_ALL_PASSED", qa_res[0]["verdict"])
    finally:
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa_s5 CASCADE;", token)

    # 4. Static Security & Branding Audit on `merchant-dashboard/`
    merch_dir = os.path.join(REPO_DIR, "merchant-dashboard")
    bad_hits = []
    for root, _, files in os.walk(merch_dir):
        for fn in files:
            if fn.endswith((".html", ".js")):
                fp = os.path.join(root, fn)
                with open(fp, "r", encoding="utf-8") as f:
                    txt = f.read()
                if "SAWYAN BANK" in txt:
                    bad_hits.append(f"{fn}: SAWYAN BANK")
                if "password_hash: '123456'" in txt or 'value="123456"' in txt:
                    bad_hits.append(f"{fn}: hardcoded 123456")
                if ".from('wallets').update" in txt:
                    bad_hits.append(f"{fn}: client wallet write")
    record("S5-08: Static Audit on merchant-dashboard/ (Zero SAWYAN BANK, Zero 123456, Zero client wallet writes)", len(bad_hits) == 0, bad_hits)

    failed = [c for c in checks if not c["passed"]]
    print(f"\nSTAGE 5 VERIFICATION SUMMARY: {len(checks) - len(failed)}/{len(checks)} PASSED")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
