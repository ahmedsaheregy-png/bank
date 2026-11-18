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


def api_request(method, endpoint, payload, token):
    url = f"{BASE_API}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "SAWYAN-Phase45-Verifier/3.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} on {endpoint}: {body}")


def run_sql(sql, token):
    _, res = api_request("POST", "/database/query", {"query": sql}, token)
    return res


def rest_request(method, path, schema, anon_key, payload=None):
    url = f"{REST_URL}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", anon_key)
    req.add_header("Authorization", f"Bearer {anon_key}")
    req.add_header("Accept-Profile", schema)
    if method != "GET":
        req.add_header("Content-Profile", schema)
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        return err.code, json.loads(body) if body.startswith("{") else {"raw": body}


def clone_to_qa(sql_text):
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", "sawyan_qa_p45", sql_text)


def read_sql(filename):
    with open(os.path.join(DB_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


def get_anon_key():
    cfg_path = os.path.join(REPO_DIR, "shared", "config", "supabase.js")
    with open(cfg_path, "r", encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)['\"]", text)
    if not m:
        raise RuntimeError("Could not locate anonKey in shared/config/supabase.js")
    return m.group(1)


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN missing.", file=sys.stderr)
        sys.exit(1)

    anon_key = get_anon_key()
    checks = []

    def record(name, passed, detail=""):
        checks.append({"name": name, "passed": bool(passed), "detail": detail})
        icon = "PASS" if passed else "FAIL"
        print(f" [{icon}] {name} {('— ' + str(detail)) if detail else ''}")

    # 1. Verify 100% RLS coverage on all 43 tables in `sawyan` and `sawyan_demo`
    rls_res = run_sql("""
        SELECT
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'sawyan' AND rowsecurity = true) AS prod_rls_on,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'sawyan' AND rowsecurity = false) AS prod_rls_off,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'sawyan_demo' AND rowsecurity = true) AS demo_rls_on,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'sawyan_demo' AND rowsecurity = false) AS demo_rls_off;
    """, token)[0]
    record(
        "P45-01: 100% RLS Enabled across all 43 tables in sawyan & sawyan_demo",
        rls_res["prod_rls_on"] == 43 and rls_res["prod_rls_off"] == 0 and rls_res["demo_rls_on"] == 43 and rls_res["demo_rls_off"] == 0,
        rls_res
    )

    # 2. Verify anon EXECUTE privileges are revoked on internal/engine/admin functions in `sawyan`
    priv_res = run_sql("""
        SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'sawyan'
           AND p.proname IN (
               'feed_monthly_target_box', 'run_monthly_settlement_engine',
               'finalize_settlement_payout_step5_6', 'process_payment_webhook',
               'submit_maker_checker_request', 'decide_maker_checker_request',
               'verify_member_session', 'process_pos_refund_reversal',
               'process_merchant_topup_fifo'
           );
    """, token)
    leaked = [r["proname"] for r in priv_res if r["anon_can_exec"]]
    record("P45-02: Zero anon EXECUTE leaks on internal engine/admin/settlement functions", len(leaked) == 0, f"checked={len(priv_res)}, leaked={leaked}")

    # 3. Live PostgREST HTTP security probes with `anon` key
    st_sweep, _ = rest_request("POST", "/rpc/run_monthly_settlement_engine", "sawyan", anon_key, {"p_settlement_cycle_id": 1})
    record("P45-03: Live PostgREST anon call to run_monthly_settlement_engine blocked/hidden (401/403/404)", st_sweep in (401, 403, 404), f"HTTP {st_sweep}")

    st_merch, _ = rest_request("GET", "/merchants?select=id,deduction_percent", "sawyan", anon_key)
    record("P45-04: Live PostgREST anon raw SELECT on sawyan.merchants blocked (F01 protected)", st_merch in (401, 403), f"HTTP {st_merch}")

    st_demo_meta, _ = rest_request("GET", "/members?select=id,metadata&limit=1", "sawyan_demo", anon_key)
    record("P45-05: Live PostgREST anon SELECT of sawyan_demo.members.metadata blocked (Bcrypt/session hidden)", st_demo_meta in (401, 403), f"HTTP {st_demo_meta}")

    st_demo_pub, body_demo_pub = rest_request("GET", "/members?select=member_code,full_name&member_code=eq.1", "sawyan_demo", anon_key)
    record("P45-06: Live PostgREST anon safe column SELECT on sawyan_demo.members works", st_demo_pub == 200 and len(body_demo_pub) == 1, f"HTTP {st_demo_pub}")

    # 4. Verify real-time is_qualified on sawyan_demo Leader #1 from seeded SW-1001
    qual_res = run_sql("""
        SELECT b.is_qualified, b.qualification_source, b.current_month_purchases_usd
          FROM sawyan_demo.monthly_target_boxes b
          JOIN sawyan_demo.members m ON m.id = b.member_id
         WHERE m.member_code = 1
         LIMIT 1;
    """, token)[0]
    record(
        "P45-07: Real-time is_qualified=true on sawyan_demo Leader #1 (feed_monthly_target_box fix)",
        qual_res["is_qualified"] is True and qual_res["qualification_source"] == "local_purchases",
        qual_res
    )

    # 5. Isolated QA test for Settlement Steps 5-6, 72h Payout Cooldown, KYC Withdrawal & S10 3-Report Signal
    try:
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa_p45 CASCADE;", token)
        for fn in [
            "01_schema_and_43_tables.sql",
            "02_core_functions_and_triggers.sql",
            "03_seed_coa_countries_and_demo.sql",
            "04_rls_and_grants.sql",
            "05_stage3_api_payment_and_shift_rpcs.sql",
            "06_stage4_member_and_portal_rpcs.sql",
            "07_remediation_security_and_settlement_patch.sql",
        ]:
            run_sql(clone_to_qa(read_sql(fn)), token)
        run_sql(read_sql("03b_seed_demo_tree_48_members.sql").replace("sawyan_demo", "sawyan_qa_p45"), token)

        qa_out = run_sql("""
            DO $$
            DECLARE
                v_maker_id   UUID := gen_random_uuid();
                v_checker_id UUID := gen_random_uuid();
                v_leader_id  UUID;
                v_m2_id      UUID;
                v_merch_id   UUID;
                v_branch_id  UUID;
                v_tx2_id     UUID;
                v_tx3_id     UUID;
                v_eg_cid     INT;
                v_cycle_id   BIGINT;
                v_period     CHAR(7);
                v_step4      JSONB;
                v_step6      JSONB;
                v_pm_res     JSONB;
                v_pm_id      UUID;
                v_cool_err   BOOLEAN := false;
                v_wdr_res    JSONB;
                v_dr_sum     NUMERIC(18,2);
                v_cr_sum     NUMERIC(18,2);
                v_sig_cnt    INT;
            BEGIN
                INSERT INTO sawyan_qa_p45.admins (id, full_name, email, auth_user_id, role, is_active) VALUES
                (v_maker_id, 'QA Maker', 'maker@qa.local', gen_random_uuid(), 'finance', true),
                (v_checker_id, 'QA Checker', 'checker@qa.local', gen_random_uuid(), 'approver', true);

                SELECT id INTO v_leader_id FROM sawyan_qa_p45.members WHERE member_code = 1;
                SELECT id INTO v_m2_id FROM sawyan_qa_p45.members WHERE member_code = 2;
                SELECT id INTO v_merch_id FROM sawyan_qa_p45.merchants WHERE merchant_code = 'M-EG-001';
                SELECT id INTO v_branch_id FROM sawyan_qa_p45.merchant_branches WHERE merchant_id = v_merch_id LIMIT 1;

                -- Top up merchant balance organically, then members #2, #3, #4, #5 complete qualifying purchases so Leader #1 earns >= $11.25 organically!
                PERFORM sawyan_qa_p45.process_merchant_topup_fifo(v_merch_id, 25000.00, 'QA-TOPUP-01'::varchar, gen_random_uuid());

                PERFORM sawyan_qa_p45.submit_pos_transaction(
                    v_m2_id, v_merch_id, v_branch_id, 20000.00, 'cash', 'QA-REF-M2', 'SW-QA-202', gen_random_uuid(), NULL, true, NULL
                );
                PERFORM sawyan_qa_p45.submit_pos_transaction(
                    (SELECT id FROM sawyan_qa_p45.members WHERE member_code = 3), v_merch_id, v_branch_id, 20000.00, 'cash', 'QA-REF-M3', 'SW-QA-203', gen_random_uuid(), NULL, true, NULL
                );
                PERFORM sawyan_qa_p45.submit_pos_transaction(
                    (SELECT id FROM sawyan_qa_p45.members WHERE member_code = 4), v_merch_id, v_branch_id, 20000.00, 'cash', 'QA-REF-M4', 'SW-QA-204', gen_random_uuid(), NULL, true, NULL
                );
                PERFORM sawyan_qa_p45.submit_pos_transaction(
                    (SELECT id FROM sawyan_qa_p45.members WHERE member_code = 5), v_merch_id, v_branch_id, 20000.00, 'cash', 'QA-REF-M5', 'SW-QA-205', gen_random_uuid(), NULL, true, NULL
                );
                SELECT id INTO v_tx2_id FROM sawyan_qa_p45.transactions WHERE sw_short_code = 'SW-QA-202';
                SELECT id INTO v_tx3_id FROM sawyan_qa_p45.transactions WHERE sw_short_code = 'SW-QA-203';

                SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM'), country_id
                  INTO v_period, v_eg_cid
                  FROM sawyan_qa_p45.transactions WHERE id = v_tx2_id;

                INSERT INTO sawyan_qa_p45.settlement_cycles (country_id, period_ym, closure_utc_instant, maker_admin_id)
                VALUES (v_eg_cid, v_period, now(), v_maker_id)
                RETURNING id INTO v_cycle_id;

                -- Run Steps 1..4 Sweep
                v_step4 := sawyan_qa_p45.run_monthly_settlement_engine(v_cycle_id);

                -- Run Steps 5..6 Finalize & Wallet Crediting + Hard Lock
                v_step6 := sawyan_qa_p45.finalize_settlement_payout_step5_6(v_period, v_maker_id, v_checker_id, 0.00);

                IF (v_step6->>'status') <> 'hard_locked_step_6' OR (v_step6->>'credited_members_count')::int < 1 THEN
                    RAISE EXCEPTION 'STEP5_6_FAILED: %', v_step6;
                END IF;

                -- Verify Payout Method 72h Cooldown blocks immediate withdrawal
                UPDATE sawyan_qa_p45.members SET kyc_status = 'verified' WHERE id = v_leader_id;
                v_pm_res := sawyan_qa_p45.manage_member_payout_method(v_leader_id, 'add', NULL, 'bank_iban', 'Ahmed Saher', 'EG9900001234567890', NULL);
                v_pm_id := (v_pm_res->>'method_id')::uuid;

                BEGIN
                    PERFORM sawyan_qa_p45.request_member_withdrawal(v_leader_id, v_pm_id, 10.00, gen_random_uuid(), NULL);
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM LIKE '%PAYOUT_METHOD_COOLDOWN_72H_ACTIVE%' THEN
                        v_cool_err := true;
                    ELSE
                        RAISE;
                    END IF;
                END;
                IF NOT v_cool_err THEN
                    RAISE EXCEPTION 'COOLDOWN_72H_DID_NOT_BLOCK';
                END IF;

                -- Advance cooldown past 72h and test organic $10.00 withdrawal from earned commissions ($11.25+)
                UPDATE sawyan_qa_p45.payment_methods SET cooldown_expires_at = now() - interval '1 hour' WHERE id = v_pm_id;
                UPDATE sawyan_qa_p45.members SET payout_cooldown_until = now() - interval '1 hour' WHERE id = v_leader_id;

                v_wdr_res := sawyan_qa_p45.request_member_withdrawal(v_leader_id, v_pm_id, 10.00, gen_random_uuid(), NULL);
                IF (v_wdr_res->>'status') <> 'processing_payout' THEN
                    RAISE EXCEPTION 'WITHDRAWAL_FAILED: %', v_wdr_res;
                END IF;

                -- Test S10 Price Gouging 3 verified reports -> fraud_graph_signals
                PERFORM sawyan_qa_p45.submit_price_gouging_report(v_leader_id, (SELECT id FROM sawyan_qa_p45.transactions WHERE sw_short_code = 'SW-1001'), 100.00, 130.00, 'https://img/s1.jpg', 'https://img/r1.jpg', NULL);
                PERFORM sawyan_qa_p45.submit_price_gouging_report(v_m2_id, v_tx2_id, 200.00, 240.00, 'https://img/s2.jpg', 'https://img/r2.jpg', NULL);
                PERFORM sawyan_qa_p45.submit_price_gouging_report((SELECT id FROM sawyan_qa_p45.members WHERE member_code = 3), v_tx3_id, 300.00, 350.00, 'https://img/s3.jpg', 'https://img/r3.jpg', NULL);

                UPDATE sawyan_qa_p45.price_gouging_reports SET verification_status = 'verified_violation';

                SELECT COUNT(*) INTO v_sig_cnt FROM sawyan_qa_p45.fraud_graph_signals WHERE involved_merchant_id = v_merch_id AND signal_type = 'price_gouging_threshold_3';
                IF v_sig_cnt < 1 THEN
                    RAISE EXCEPTION 'S10_FRAUD_SIGNAL_NOT_TRIGGERED';
                END IF;

                -- Global Zero-Discrepancy Ledger Check
                SELECT SUM(debit_usd), SUM(credit_usd) INTO v_dr_sum, v_cr_sum FROM sawyan_qa_p45.journal_lines;
                IF v_dr_sum <> v_cr_sum THEN
                    RAISE EXCEPTION 'LEDGER_IMBALANCE_AFTER_STEP6_AND_WITHDRAWAL: dr=% cr=%', v_dr_sum, v_cr_sum;
                END IF;
            END $$;
            SELECT 'ALL_QA_P45_ASSERTIONS_PASSED' AS verdict;
        """, token)
        record("P45-08: End-to-End Settlement Steps 5-6 + Hard Lock + 72h Cooldown + KYC Withdrawal + S10 Signal + Balanced Ledger", qa_out[0]["verdict"] == "ALL_QA_P45_ASSERTIONS_PASSED", qa_out[0]["verdict"])
    finally:
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa_p45 CASCADE;", token)

    # 6. Verify zero plaintext tokens in .git/config
    git_cfg_path = os.path.join(REPO_DIR, ".git", "config")
    with open(git_cfg_path, "r", encoding="utf-8") as f:
        git_cfg_txt = f.read()
    has_token = ("ghp_" in git_cfg_txt) or ("sbp_" in git_cfg_txt)
    record("P45-09: Root .git/config scrubbed of all plaintext tokens & preview/.git removed", (not has_token) and (not os.path.exists(os.path.join(REPO_DIR, "preview", ".git"))), "Clean")

    failed = [c for c in checks if not c["passed"]]
    print(f"\nPHASE 4.5 SUMMARY: {len(checks) - len(failed)}/{len(checks)} PASSED")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
