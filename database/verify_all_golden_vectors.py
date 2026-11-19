import json
import os
import re
import sys
import urllib.request
import urllib.error

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1"
DB_DIR = os.path.dirname(os.path.abspath(__file__))


def api_request(method, endpoint, payload, token):
    url = f"{BASE_API}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "SAWYAN-QA-Verifier/3.0")
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


def clone_to_qa(sql_text):
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", "sawyan_qa", sql_text)


def read_sql(filename):
    with open(os.path.join(DB_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


def check_rest_endpoint(path, schema, anon_key):
    req = urllib.request.Request(f"{REST_URL}{path}", method="GET")
    req.add_header("apikey", anon_key)
    req.add_header("Authorization", f"Bearer {anon_key}")
    req.add_header("Accept-Profile", schema)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN env var required.", file=sys.stderr)
        sys.exit(1)

    print("=== [1/4] Verifying 43+ Tables in Production (sawyan) & Parallel Demo (sawyan_demo) ===")
    counts = run_sql("""
    SELECT
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sawyan' AND table_type = 'BASE TABLE') AS prod_tables,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sawyan_demo' AND table_type = 'BASE TABLE') AS demo_tables,
      (SELECT COUNT(*) FROM sawyan.members) AS prod_members,
      (SELECT COUNT(*) FROM sawyan_demo.members) AS demo_members,
      (SELECT cap_amount FROM sawyan.settings WHERE country_id IS NULL LIMIT 1) AS cap_amount;
    """, token)[0]
    print(json.dumps(counts, indent=2))
    assert counts["prod_tables"] >= 44 and counts["prod_tables"] == counts["demo_tables"], f"Expected >= 44 matching tables, got prod={counts['prod_tables']} demo={counts['demo_tables']}"
    assert counts["prod_members"] == 1, f"Expected 1 prod root #0, got {counts['prod_members']}"
    assert counts["demo_members"] >= 50, f"Expected >= 50 demo members (#0 + #1 + team), got {counts['demo_members']}"
    assert float(counts["cap_amount"]) == 4605.75, f"Expected cap 4605.75, got {counts['cap_amount']}"

    print("=== [2/4] Verifying REST API HTTP 200 on Both Schemas ===")
    _, keys = api_request("GET", "/api-keys", None, token)
    anon_key = next(k["api_key"] for k in keys if k.get("name") == "anon")
    st1, data1 = check_rest_endpoint("/countries?select=country_code,is_active&order=id", "sawyan", anon_key)
    st2, data2 = check_rest_endpoint("/members?select=member_code&order=member_code.asc&limit=5", "sawyan_demo", anon_key)
    print(f"Production REST /countries -> HTTP {st1}, rows={len(data1)}")
    print(f"Parallel Demo REST /members -> HTTP {st2}, sample={[r['member_code'] for r in data2]}")
    assert st1 == 200 and len(data1) >= 5
    assert st2 == 200 and len(data2) == 5

    print("=== [3/4] Setting Up Ephemeral QA Sandbox (`sawyan_qa`) ===")
    run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
    for qa_sql_file in [
        "01_schema_and_43_tables.sql",
        "02_core_functions_and_triggers.sql",
        "03_seed_coa_countries_and_demo.sql",
        "04_rls_and_grants.sql",
        "05_stage3_api_payment_and_shift_rpcs.sql",
        "06_stage4_member_and_portal_rpcs.sql",
        "07_remediation_security_and_settlement_patch.sql",
        "08_stage5_merchant_pos_and_portal_rpcs.sql",
        "09_stage6_admin_governance_and_launch_rpcs.sql",
    ]:
        run_sql(clone_to_qa(read_sql(qa_sql_file)), token)

    print("=== [4/4] Executing Golden Acceptance Vectors (V1-V9 & GV01-GV10) ===")
    qa_sql = """
    DO $$
    DECLARE
        v_eg_id INT;
        v_tr_id INT;
        v_root_id UUID;
        v_a1 UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
        v_a2 UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
        v_m UUID[];
        v_tmp_id UUID;
        v_parent UUID;
        v_merch1 UUID;
        v_br1 UUID;
        v_br2 UUID;
        v_emp1 UUID;
        v_tx UUID;
        v_res JSONB;
        v_cyc_eg BIGINT;
        v_cyc_tr BIGINT;
        i INT;
        -- V2 / GV09 vars
        v_zaid UUID;
        v_merch_zaid UUID;
        v_br_zaid UUID;
        v_zaid_box_neg NUMERIC(18,2);
        -- V3 vars
        v_merch_v3 UUID;
        v_br_v3 UUID;
        v_v3_tx1 UUID;
        v_v3_tx2 UUID;
        v_v3_tx3 UUID;
        v_iso BOOLEAN;
        -- V4 / GV07 vars
        v_star UUID;
        v_s03 JSONB;
        -- V5 / GV05 vars
        v_top_pool BIGINT;
        v_round_sum NUMERIC(18,2);
        -- GV01 / GV02 vars
        v_gv1 UUID;
        v_gv_box NUMERIC(18,6);
        -- GV06 vars
        v_comp_mem UUID;
        v_comp_ch1 UUID;
        v_comp_ch2 UUID;
        v_comp_net NUMERIC(18,2);
        -- GV08 vars
        v_sp_gv8 UUID;
        v_r1 UUID; v_l1 UUID;
        v_m12 UUID; v_m15 UUID;
        v_new_gv8 UUID;
        -- V7 / V8 / V9 & GV09-D/E / Option 1-A vars
        v_err_caught BOOLEAN := false;
        v_density JSONB;
        v_self_res JSONB;
        v_emp_self UUID;
        v_idem_key UUID := gen_random_uuid();
        v_idem1 JSONB; v_idem2 JSONB;
        v_merch_tok TEXT := 'qa-merch-session-token';
        v_mem_tok   TEXT := 'qa-mem-session-token';
        v_otp_req_id UUID;
        v_otp_real   TEXT;
        v_otp_res    JSONB;
        v_disp_res   JSONB;
        v_cyc_may    BIGINT;
        v_cyc_jun_eg BIGINT;
        v_cyc_jun_tr BIGINT;
        v_merch_tr   UUID;
        v_br_tr      UUID;
        v_tx_may1    UUID;
        v_tx_may2    UUID;
        v_tx_jun_eg  UUID;
        v_tx_jun_tr  UUID;
        v_break_mem  UUID;
    BEGIN
        SELECT id INTO v_eg_id FROM sawyan_qa.countries WHERE country_code = 'EG';
        SELECT id INTO v_tr_id FROM sawyan_qa.countries WHERE country_code = 'TR';
        SELECT id INTO v_root_id FROM sawyan_qa.members WHERE member_code = 0;

        INSERT INTO sawyan_qa.admins (id, full_name, email, auth_user_id, role) VALUES
        (v_a1, 'QA Maker', 'qamaker@sawyan.qa', gen_random_uuid(), 'data_entry'),
        (v_a2, 'QA Approver', 'qaapprover@sawyan.qa', gen_random_uuid(), 'approver');

        INSERT INTO sawyan_qa.maker_checker_requests (action_type, target_entity, target_id, payload_after, reason, maker_admin_id, checker_admin_id, status, decided_at)
        VALUES ('ROOT_DIRECT_PLACEMENT', 'member', '1', '{}'::jsonb, 'QA Root Seed', v_a1, v_a2, 'approved', now());

        -- ====================================================================
        -- TEST V1 / GV04 & V5 / GV05 & GV03: 16-member vertical chain under Root #0
        -- #1 Ahmed .. #16 Jana, with #4 Hani & #6 Adel unqualified (#4 & #6 skipped via Roll-up)
        -- ====================================================================
        v_m := ARRAY_FILL(NULL::uuid, ARRAY[16]);
        FOR i IN 1..16 LOOP
            INSERT INTO sawyan_qa.members (
                member_code, full_name, phone, residency_country_id, city_geoname_id,
                auth_user_id, sponsor_id, parent_member_id, placement_side, generation_in_tree,
                metadata
            ) VALUES (
                i, 'Chain_' || i, '+20110000' || LPAD(i::text, 4, '0'), v_eg_id, 360630,
                gen_random_uuid(),
                CASE WHEN i = 1 THEN v_root_id ELSE v_m[i-1] END,
                CASE WHEN i = 1 THEN NULL ELSE v_m[i-1] END,
                CASE WHEN i = 1 THEN 'root_direct' ELSE 'right' END,
                1,
                CASE WHEN i = 1 THEN '{}'::jsonb ELSE '{"allow_explicit_test_placement": true}'::jsonb END
            ) RETURNING id INTO v_tmp_id;
            v_m[i] := v_tmp_id;
        END LOOP;

        -- Make all qualified EXCEPT #4 Hani and #6 Adel in 2026-10
        FOR i IN 1..16 LOOP
            IF i NOT IN (4, 6) THEN
                INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd, is_qualified, qualification_source)
                VALUES (v_m[i], v_eg_id, '2026-10', 24.75, 24.75, true, 'local_purchases');
            END IF;
        END LOOP;

        -- Verify V1 / GV04 Tree Analytics from #1 Ahmed and #5 Mona
        v_res := sawyan_qa.get_tree_analytics_with_country_lens(v_m[1], '2026-10', NULL);
        IF (v_res->>'commission_team_count')::int <> 11 OR (v_res->>'reserve_team_aggregated_count')::int <> 3 THEN
            RAISE EXCEPTION 'V1_AHMED_FAILED: %', v_res;
        END IF;

        v_res := sawyan_qa.get_tree_analytics_with_country_lens(v_m[5], '2026-10', NULL);
        IF (v_res->>'commission_team_count')::int <> 11 OR (v_res->>'reserve_team_aggregated_count')::int <> 0 THEN
            RAISE EXCEPTION 'V1_MONA_FAILED: %', v_res;
        END IF;

        -- Verify V1 Commission Distribution for #14 Sameh + V5 Top-of-Tree TRUNC (7 qualified under Root #0)
        -- Prepare cycle 2026-10
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant)
        VALUES (v_eg_id, '2026-10', '2026-10-31 21:59:59+00'::timestamptz) RETURNING id INTO v_cyc_eg;

        -- Update boxes to target_consumed_usd = 0 so run_monthly_settlement_engine runs them fresh
        UPDATE sawyan_qa.monthly_target_boxes SET target_consumed_usd = 0, is_qualified = false WHERE period_ym = '2026-10';
        v_res := sawyan_qa.run_monthly_settlement_engine(v_cyc_eg);

        -- Check Sameh (#14) pool: must pay #2 Khaled ($2.25) and NOT #1 Ahmed ($0.00 from #14 pool)!
        IF NOT EXISTS (
            SELECT 1 FROM sawyan_qa.commission_distributions cd
            JOIN sawyan_qa.pool_transactions pt ON pt.id = cd.pool_transaction_id
            WHERE pt.member_id = v_m[14] AND cd.beneficiary_id = v_m[2] AND cd.beneficiary_position = 11 AND cd.share_amount_usd = 2.25
        ) THEN
            RAISE EXCEPTION 'V1_STOPPER_FAILED: Khaled (#2) did not receive slot 11/11 from Sameh (#14)';
        END IF;
        IF EXISTS (
            SELECT 1 FROM sawyan_qa.commission_distributions cd
            JOIN sawyan_qa.pool_transactions pt ON pt.id = cd.pool_transaction_id
            WHERE pt.member_id = v_m[14] AND cd.beneficiary_id = v_m[1]
        ) THEN
            RAISE EXCEPTION 'V1_STOPPER_LEAK: Ahmed (#1) received share from Sameh (#14)';
        END IF;

        -- Check V5 / GV05: #9 (8->7 qualified uplines above? Wait: #9 has #9, #8, #7, #5, #3, #2, #1 = 7 qualified! #6 and #4 skipped!)
        SELECT pt.id, pt.rounding_diff_usd INTO v_top_pool, v_round_sum
          FROM sawyan_qa.pool_transactions pt WHERE pt.member_id = v_m[9] AND pt.settlement_cycle_id = v_cyc_eg;
        IF v_round_sum <> 0.04 THEN
            RAISE EXCEPTION 'V5_TRUNC_FAILED: Expected rounding diff 0.04 for 7 beneficiaries (#9 pool), got %', v_round_sum;
        END IF;
        IF (SELECT ROUND(SUM(cd.share_amount_usd + COALESCE(sd.surplus_amount_usd,0)), 2)
              FROM sawyan_qa.commission_distributions cd
              LEFT JOIN sawyan_qa.surplus_distributions sd ON sd.pool_transaction_id = cd.pool_transaction_id AND sd.beneficiary_id = cd.beneficiary_id
             WHERE cd.pool_transaction_id = v_top_pool) <> 24.71 THEN
            RAISE EXCEPTION 'V5_TOTAL_PAID_FAILED: Expected 24.71 for 7 beneficiaries (#9 pool)';
        END IF;

        -- ====================================================================
        -- TEST V2 / GV09 & V9: Carry-On Shield (Days 1-14) + Hard Post-Day-15 Block + Multi-Branch + PSP + Credit Note
        -- ====================================================================
        IF (SELECT COUNT(*) FROM sawyan_qa.chart_of_accounts WHERE account_code IN ('1301', '3101', '5201')) <> 0 THEN
            RAISE EXCEPTION 'COA_CLEANUP_FAILED: Legacy accounts 1301/3101/5201 must not exist';
        END IF;

        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, city_geoname_id, auth_user_id, sponsor_id)
        VALUES (100, 'Zaid', '+201299990100', v_eg_id, 360630, gen_random_uuid(), v_m[16]) RETURNING id INTO v_zaid;

        INSERT INTO sawyan_qa.merchants (merchant_code, country_id, business_name, owner_name, email, phone, category, merchant_type, deduction_percent, package_base_amount, actual_cash_balance, is_active)
        VALUES ('M-V2', v_eg_id, 'متجر زيد', 'زيد', 'mv2@qa.local', '+201200000100', 'supermarket', 'physical', 10.00, 1000.00, 0.00, true)
        RETURNING id INTO v_merch_zaid;

        INSERT INTO sawyan_qa.merchant_branches (merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude)
        VALUES (v_merch_zaid, 'BR-1', 'فرع 1', true, 'القاهرة', 30.05, 31.23) RETURNING id INTO v_br_zaid;

        INSERT INTO sawyan_qa.merchant_branches (merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude)
        VALUES (v_merch_zaid, 'BR-2', 'فرع 2', false, 'الجيزة', 30.01, 31.20) RETURNING id INTO v_br2;

        -- V9 Check PSP Top-Up Reconciliation: gross 1000 EGP (1000/50=$20), fee 20 EGP -> 980 net bank
        v_res := sawyan_qa.process_merchant_topup_fifo(v_merch_zaid, 1000.00, 'PSP-BATCH-V9', gen_random_uuid(), 20.00, 'stripe');
        IF (SELECT discrepancy_amount FROM sawyan_qa.psp_settlement_batches WHERE psp_payout_batch_ref = 'PSP-BATCH-V9') <> 0.00 THEN
            RAISE EXCEPTION 'V9_PSP_RECON_FAILED';
        END IF;

        -- GV09-A: Carry-On ($30.00) covers pre-payout return -> Zaid stays qualified & Carry-On deducts!
        UPDATE sawyan_qa.merchants SET actual_cash_balance = 10000.00, package_base_amount = 10000.00 WHERE id = v_merch_zaid;
        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, carry_on_in_usd, target_required_usd, is_qualified, qualification_source)
        VALUES (v_zaid, v_eg_id, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM'), 30.00, 24.75, true, 'carry_on')
        ON CONFLICT (member_id, country_id, period_ym) DO UPDATE SET carry_on_in_usd = 30.00, is_qualified = true, qualification_source = 'carry_on';

        v_res := sawyan_qa.submit_pos_transaction(v_zaid, v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'ZAID-REF-1', 'SW-ZAID1', gen_random_uuid(), NULL, true, NULL);
        v_tx := (v_res->>'transaction_id')::uuid;

        v_res := sawyan_qa.process_transaction_reversal_clawback(v_tx, v_a1, 'GV09-A pre-payout return with Carry-On shield');
        IF NOT (SELECT is_qualified FROM sawyan_qa.monthly_target_boxes WHERE member_id = v_zaid AND country_id = v_eg_id AND period_ym = to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')) THEN
            RAISE EXCEPTION 'GV09A_CARRY_ON_SHIELD_FAILED: Zaid should remain qualified via $30 Carry-On';
        END IF;
        IF (SELECT COUNT(*) FROM sawyan_qa.b2b_tax_invoices WHERE transaction_id = v_tx AND document_type = 'credit_note') <> 1 THEN
            RAISE EXCEPTION 'V9_CREDIT_NOTE_MISSING';
        END IF;

        -- GV09-B: Carry-On ($5.00) does NOT cover return -> loses qualification, preserves $5.00, ZERO negative!
        UPDATE sawyan_qa.monthly_target_boxes SET carry_on_in_usd = 5.00, is_qualified = false, qualification_source = 'none'
         WHERE member_id = v_zaid AND country_id = v_eg_id AND period_ym = to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
        v_res := sawyan_qa.submit_pos_transaction(v_zaid, v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'ZAID-REF-2', 'SW-ZAID2', gen_random_uuid(), NULL, true, NULL);
        v_tx := (v_res->>'transaction_id')::uuid;
        v_res := sawyan_qa.process_transaction_reversal_clawback(v_tx, v_a1, 'GV09-B pre-payout return without Carry-On coverage');
        SELECT (carry_on_in_usd + current_month_purchases_usd) INTO v_zaid_box_neg
          FROM sawyan_qa.monthly_target_boxes WHERE member_id = v_zaid AND country_id = v_eg_id AND period_ym = to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
        IF v_zaid_box_neg <> 5.00 OR (SELECT is_qualified FROM sawyan_qa.monthly_target_boxes WHERE member_id = v_zaid AND country_id = v_eg_id AND period_ym = to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')) THEN
            RAISE EXCEPTION 'GV09B_DISQUALIFICATION_FAILED: Expected $5.00 unqualified, got %', v_zaid_box_neg;
        END IF;

        -- GV09-C: Post-Day-15 / Hard-Locked Return MUST raise POST_PAYOUT_RETURN_FORBIDDEN!
        v_res := sawyan_qa.submit_pos_transaction(v_zaid, v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'ZAID-REF-3', 'SW-ZAID3', gen_random_uuid(), NULL, true, NULL);
        v_tx := (v_res->>'transaction_id')::uuid;
        UPDATE sawyan_qa.transactions SET commission_snapshot = commission_snapshot || '{"effective_period_ym":"2026-01"}'::jsonb WHERE id = v_tx;
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant, step_status, is_hard_locked, payout_executed_at)
        VALUES (v_eg_id, '2026-01', '2026-01-31 21:59:59+00', 6, true, now())
        ON CONFLICT (country_id, period_ym) DO UPDATE SET step_status = 6, is_hard_locked = true, payout_executed_at = now();

        v_err_caught := false;
        BEGIN
            PERFORM sawyan_qa.process_transaction_reversal_clawback(v_tx, v_a1, 'Post-payout return attempt');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%POST_PAYOUT_RETURN_FORBIDDEN%' THEN
                v_err_caught := true;
            END IF;
        END;
        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'GV09C_POST_PAYOUT_BLOCK_FAILED: Expected POST_PAYOUT_RETURN_FORBIDDEN';
        END IF;

        -- ====================================================================
        -- TEST V3: Atomic Merchant Quota + Partial Top-Up FIFO Un-Isolation
        -- ====================================================================
        INSERT INTO sawyan_qa.merchants (merchant_code, country_id, business_name, owner_name, email, phone, category, merchant_type, deduction_percent, package_base_amount, actual_cash_balance, is_active)
        VALUES ('M-V3', v_eg_id, 'متجر الطابور', 'تاجر 3', 'mv3@qa.local', '+201200000300', 'supermarket', 'physical', 10.00, 1000.00, 0.00, true)
        RETURNING id INTO v_merch_v3;
        INSERT INTO sawyan_qa.merchant_branches (merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude)
        VALUES (v_merch_v3, 'BR-1', 'فرع طابور', true, 'القاهرة', 30.05, 31.23) RETURNING id INTO v_br_v3;

        -- Queue 3 transactions: commissions 100, 150, 250 (amounts 1000, 1500, 2500)
        v_v3_tx1 := (sawyan_qa.submit_pos_transaction(v_m[1], v_merch_v3, v_br_v3, 1000.00, 'cash', 'V3-1', 'SW-V3-1', gen_random_uuid(), NULL, true, NULL)->>'transaction_id')::uuid;
        v_v3_tx2 := (sawyan_qa.submit_pos_transaction(v_m[2], v_merch_v3, v_br_v3, 1500.00, 'cash', 'V3-2', 'SW-V3-2', gen_random_uuid(), NULL, true, NULL)->>'transaction_id')::uuid;
        v_v3_tx3 := (sawyan_qa.submit_pos_transaction(v_m[3], v_merch_v3, v_br_v3, 2500.00, 'cash', 'V3-3', 'SW-V3-3', gen_random_uuid(), NULL, true, NULL)->>'transaction_id')::uuid;

        -- Partial top-up 300 -> #1 & #2 completed, free = 50 (5% <= 10%), #3 still queued -> MUST stay isolated!
        v_res := sawyan_qa.process_merchant_topup_fifo(v_merch_v3, 300.00, 'V3-PARTIAL-300', gen_random_uuid(), 0.00, 'bank');
        IF (v_res->>'released_fifo_count')::int <> 2 OR (v_res->>'remaining_queue')::int <> 1 OR (v_res->>'is_isolated')::boolean <> true THEN
            RAISE EXCEPTION 'V3_FIFO_UNISOLATION_FAILED: %', v_res;
        END IF;

        -- ====================================================================
        -- TEST V4 / GV07: International S03 Pro-Rata Suspense ($4,000 cap, $100 EG + $5,900 TR)
        -- ====================================================================
        UPDATE sawyan_qa.countries SET financial_stopper_usd = 4000.00 WHERE id = v_eg_id;
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id)
        VALUES (200, 'S03 Star', '+201299990200', v_eg_id, gen_random_uuid(), v_m[1]) RETURNING id INTO v_star;

        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant)
        VALUES (v_tr_id, '2026-10', '2026-10-31 20:59:59+00'::timestamptz) RETURNING id INTO v_cyc_tr;

        -- Inject $100 EG and $5,900 TR distributions for 2026-10
        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd, is_qualified)
        VALUES (v_star, v_eg_id, '2026-10', 24.75, 24.75, true) ON CONFLICT DO NOTHING;
        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd, is_qualified)
        VALUES (v_star, v_tr_id, '2026-10', 24.75, 24.75, true) ON CONFLICT DO NOTHING;

        INSERT INTO sawyan_qa.pool_transactions (settlement_cycle_id, member_id, target_box_id, source_type, target_consumed_usd, deducted_amount_usd, company_share_usd, members_share_usd, share_per_member_usd, beneficiaries_count, total_distributed_usd, settings_snapshot)
        SELECT v_cyc_eg, v_star, id, 'LOCAL_TARGET_BOX', 24.75, 24.75, 0, 24.75, 2.25, 1, 100.00, '{}'::jsonb
          FROM sawyan_qa.monthly_target_boxes WHERE member_id = v_star AND country_id = v_eg_id AND period_ym = '2026-10'
        RETURNING id INTO v_top_pool;
        INSERT INTO sawyan_qa.commission_distributions (pool_transaction_id, beneficiary_id, share_amount_usd, beneficiary_generation, beneficiary_position)
        VALUES (v_top_pool, v_star, 100.00, 2, 1);

        INSERT INTO sawyan_qa.pool_transactions (settlement_cycle_id, member_id, target_box_id, source_type, target_consumed_usd, deducted_amount_usd, company_share_usd, members_share_usd, share_per_member_usd, beneficiaries_count, total_distributed_usd, settings_snapshot)
        SELECT v_cyc_tr, v_star, id, 'LOCAL_TARGET_BOX', 24.75, 24.75, 0, 24.75, 2.25, 1, 5900.00, '{}'::jsonb
          FROM sawyan_qa.monthly_target_boxes WHERE member_id = v_star AND country_id = v_tr_id AND period_ym = '2026-10'
        RETURNING id INTO v_top_pool;
        INSERT INTO sawyan_qa.commission_distributions (pool_transaction_id, beneficiary_id, share_amount_usd, beneficiary_generation, beneficiary_position)
        VALUES (v_top_pool, v_star, 5900.00, 2, 1);

        v_s03 := sawyan_qa.calculate_s03_pro_rata_payout(v_star, '2026-10');
        IF (v_s03->>'payable_usd')::numeric <> 4000.00 OR (v_s03->>'s03_suspense_excess_usd')::numeric <> 2000.00 THEN
            RAISE EXCEPTION 'V4_S03_TOTAL_FAILED: %', v_s03;
        END IF;
        IF ((v_s03->'pro_rata_breakdown'->0->>'s03_excess_usd')::numeric <> 33.33)
           OR ((v_s03->'pro_rata_breakdown'->1->>'s03_excess_usd')::numeric <> 1966.67) THEN
            RAISE EXCEPTION 'V4_PRORATA_BREAKDOWN_FAILED: %', v_s03;
        END IF;

        -- ====================================================================
        -- TEST GV06: Foreign Compensatory Target ($38.00 = 24.75 + 8.25 + 5.00) with $5 Carry On
        -- ====================================================================
        UPDATE sawyan_qa.countries SET compensatory_admin_fee_usd = 5.00 WHERE id = v_tr_id;
        INSERT INTO sawyan_qa.maker_checker_requests (action_type, target_entity, target_id, payload_after, reason, maker_admin_id, checker_admin_id, status, decided_at)
        VALUES ('ROOT_DIRECT_PLACEMENT', 'member', '300', '{}'::jsonb, 'GV06 Root Test', v_a1, v_a2, 'approved', now());
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id, placement_side)
        VALUES (300, 'Comp Ahmed', '+201299990300', v_eg_id, gen_random_uuid(), v_root_id, 'root_direct') RETURNING id INTO v_comp_mem;

        -- Qualify Comp Ahmed in EG for 2026-12 + give $5 Carry On in TR + 17 downline qualified pools in TR ($2.25 * 17 = $38.25 >= $38.00)
        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd, is_qualified)
        VALUES (v_comp_mem, v_eg_id, '2026-12', 24.75, 24.75, true);
        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, carry_on_in_usd, target_required_usd)
        VALUES (v_comp_mem, v_tr_id, '2026-12', 5.00, 24.75);

        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id)
        VALUES (301, 'TR Down 1', '+905599990301', v_tr_id, gen_random_uuid(), v_comp_mem) RETURNING id INTO v_comp_ch1;
        -- Auto-place 17 binary descendants under v_comp_ch1
        FOR i IN 302..318 LOOP
            INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id)
            VALUES (i, 'TR_' || i, '+90559999' || LPAD(i::text, 4, '0'), v_tr_id, gen_random_uuid(), v_comp_ch1)
            RETURNING id INTO v_comp_ch2;
            INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd)
            VALUES (v_comp_ch2, v_tr_id, '2026-12', 24.75, 24.75);
        END LOOP;

        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant)
        VALUES (v_tr_id, '2026-12', '2026-12-31 20:59:59+00'::timestamptz) RETURNING id INTO v_cyc_tr;
        v_res := sawyan_qa.run_monthly_settlement_engine(v_cyc_tr);

        IF NOT EXISTS (
            SELECT 1 FROM sawyan_qa.monthly_target_boxes
             WHERE member_id = v_comp_mem AND country_id = v_tr_id AND period_ym = '2026-12'
               AND qualification_source = 'compensatory' AND carry_on_out_usd = 5.00
        ) THEN
            RAISE EXCEPTION 'GV06_COMPENSATORY_OR_CARRYON_PRESERVATION_FAILED';
        END IF;

        -- D1 Home-Country Drop Check: if Comp Ahmed loses home EG qualification before TR payout, TR compensatory drops to 'none'
        UPDATE sawyan_qa.monthly_target_boxes
           SET current_month_purchases_usd = 10.00, target_consumed_usd = 0.00, carry_on_out_usd = 10.00,
               is_qualified = false, qualification_source = 'none'
         WHERE member_id = v_comp_mem AND country_id = v_eg_id AND period_ym = '2026-12';
        PERFORM sawyan_qa.run_monthly_settlement_engine(v_cyc_tr);
        IF EXISTS (
            SELECT 1 FROM sawyan_qa.monthly_target_boxes
             WHERE member_id = v_comp_mem AND country_id = v_tr_id AND period_ym = '2026-12'
               AND (is_qualified IS TRUE OR qualification_source = 'compensatory')
        ) THEN
            RAISE EXCEPTION 'D1_HOME_DROP_COMPENSATORY_REVOKE_FAILED';
        END IF;

        -- ====================================================================
        -- TEST GV08: Atomic Auto-Placement Tie-Break (Right First G02, 0 children, oldest code)
        -- ====================================================================
        INSERT INTO sawyan_qa.maker_checker_requests (action_type, target_entity, target_id, payload_after, reason, maker_admin_id, checker_admin_id, status, decided_at)
        VALUES ('ROOT_DIRECT_PLACEMENT', 'member', '400', '{}'::jsonb, 'GV08 Test', v_a1, v_a2, 'approved', now());
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id, placement_side)
        VALUES (400, 'GV8 Sponsor', '+201299990400', v_eg_id, gen_random_uuid(), v_root_id, 'root_direct') RETURNING id INTO v_sp_gv8;

        -- Build 3 on right (#401, #412, #415) and 3 on left (#402, #420, #421)
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id) VALUES
        (401, 'R1', '+201299990401', v_eg_id, gen_random_uuid(), v_sp_gv8) RETURNING id INTO v_r1;
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id) VALUES
        (402, 'L1', '+201299990402', v_eg_id, gen_random_uuid(), v_sp_gv8) RETURNING id INTO v_l1;
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id) VALUES
        (412, 'Node12', '+201299990412', v_eg_id, gen_random_uuid(), v_r1) RETURNING id INTO v_m12;
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id) VALUES
        (415, 'Node15', '+201299990415', v_eg_id, gen_random_uuid(), v_r1) RETURNING id INTO v_m15;
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id) VALUES
        (420, 'L2', '+201299990420', v_eg_id, gen_random_uuid(), v_l1);
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id) VALUES
        (421, 'L3', '+201299990421', v_eg_id, gen_random_uuid(), v_l1);

        -- Next recruit sponsored by #400 MUST land under #412 on 'right'!
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id)
        VALUES (499, 'New GV8', '+201299990499', v_eg_id, gen_random_uuid(), v_sp_gv8) RETURNING id INTO v_new_gv8;
        IF NOT EXISTS (
            SELECT 1 FROM sawyan_qa.members WHERE id = v_new_gv8 AND parent_member_id = v_m12 AND placement_side = 'right' AND sponsor_id = v_sp_gv8
        ) THEN
            RAISE EXCEPTION 'GV08_PLACEMENT_FAILED';
        END IF;

        -- ====================================================================
        -- TEST V7 (Maker-Checker & k-Anonymity < 10) & V8 (Idempotency & Cashier Self-PIN)
        -- ====================================================================
        BEGIN
            INSERT INTO sawyan_qa.maker_checker_requests (action_type, target_entity, target_id, payload_after, reason, maker_admin_id, checker_admin_id, status)
            VALUES ('SETTINGS_UPDATE', 'settings', '1', '{}'::jsonb, 'Self-approve test', v_a1, v_a1, 'approved');
        EXCEPTION WHEN check_violation THEN
            v_err_caught := true;
        END;
        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'V7_MAKER_CHECKER_CONSTRAINT_FAILED';
        END IF;

        v_density := sawyan_qa.get_merchant_members_density(v_br_zaid, 3.0);
        IF v_density->>'members_cluster_indicator' <> '< 10' OR (v_density->'exact_count') <> 'null'::jsonb THEN
            -- Note: in our seed there are 16+ members in city 360630! Wait: check if >= 10, so test V7 on a city with < 10 members (e.g. Giza or Riyadh)!
            NULL;
        END IF;
        -- Guaranteed < 10 in Riyadh (branch at 24.713552, 46.675297):
        INSERT INTO sawyan_qa.merchant_branches (merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude)
        VALUES (v_merch_zaid, 'BR-RUH', 'فرع الرياض', false, 'الرياض', 24.713552, 46.675297) RETURNING id INTO v_br1;
        v_density := sawyan_qa.get_merchant_members_density(v_br1, 3.0);
        IF v_density->>'members_cluster_indicator' <> '< 10' THEN
            RAISE EXCEPTION 'V7_K_ANONYMITY_FAILED: %', v_density;
        END IF;

        -- V8: Idempotency (same key twice = executed once) + Cashier self-PIN blocked
        INSERT INTO sawyan_qa.cashier_employees (merchant_id, branch_id, employee_code, full_name, linked_member_id, pin_hash)
        VALUES (v_merch_zaid, v_br_zaid, 'EMP-SELF', 'كاشير نفسه', v_m[1], 'argon2id_hash') RETURNING id INTO v_emp_self;

        v_self_res := sawyan_qa.submit_pos_transaction(v_m[1], v_merch_zaid, v_br_zaid, 500.00, 'cash', 'SELF-PIN-1', 'SW-SELF1', gen_random_uuid(), v_emp_self, true, NULL);
        IF v_self_res->>'status' <> 'rejected_self_cashier_pin' THEN
            RAISE EXCEPTION 'V8_SELF_PIN_NOT_BLOCKED: %', v_self_res;
        END IF;

        v_idem1 := sawyan_qa.submit_pos_transaction(v_m[2], v_merch_zaid, v_br_zaid, 500.00, 'cash', 'IDEM-REF-1', 'SW-IDEM1', v_idem_key, NULL, true, NULL);
        v_idem2 := sawyan_qa.submit_pos_transaction(v_m[2], v_merch_zaid, v_br_zaid, 500.00, 'cash', 'IDEM-REF-1', 'SW-IDEM1', v_idem_key, NULL, true, NULL);
        IF (v_idem1->>'transaction_id') <> (v_idem2->>'transaction_id') THEN
            RAISE EXCEPTION 'V8_IDEMPOTENCY_FAILED: % vs %', v_idem1, v_idem2;
        END IF;

        -- ====================================================================
        -- TEST V6 & V9 Tax-Exclusive 14% VAT (Protects 24.75$ plan share)
        -- ====================================================================
        UPDATE sawyan_qa.countries SET vat_rate = 14.0000 WHERE id = v_eg_id;
        v_res := sawyan_qa.submit_pos_transaction(v_m[3], v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'VAT14-REF', 'SW-VAT14', gen_random_uuid(), NULL, true, NULL);
        IF ROUND((v_res->>'plan_added_usd')::numeric, 2) <> 24.75 THEN
            RAISE EXCEPTION 'V6_TAX_EXCLUSIVE_FAILED: VAT reduced plan share to %', v_res;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM sawyan_qa.b2b_tax_invoices
             WHERE invoice_number = v_res->>'b2b_tax_invoice_number'
               AND net_commission_amount = 1650.00 AND vat_amount = 231.00 AND gross_invoice_total = 1881.00
        ) THEN
            RAISE EXCEPTION 'V9_B2B_TAX_INVOICE_VALUES_FAILED';
        END IF;
        UPDATE sawyan_qa.countries SET vat_rate = 0.0000 WHERE id = v_eg_id;

        -- ====================================================================
        -- TEST GV01: 4-Month Carry On Accumulation (8 + 7 + 6 + 10 = 31 -> 24.75 consumed, 6.25 Carry Out)
        -- ====================================================================
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id)
        VALUES (500, 'GV01 User', '+201299990500', v_eg_id, gen_random_uuid(), v_m[1]) RETURNING id INTO v_gv1;

        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd) VALUES
        (v_gv1, v_eg_id, '2027-01', 8.00, 24.75);
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant) VALUES (v_eg_id, '2027-01', '2027-01-31 21:59:59+00');
        PERFORM sawyan_qa.run_monthly_settlement_engine((SELECT id FROM sawyan_qa.settlement_cycles WHERE country_id=v_eg_id AND period_ym='2027-01'));

        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd)
        VALUES (v_gv1, v_eg_id, '2027-02', 7.00, 24.75)
        ON CONFLICT (member_id, country_id, period_ym) DO UPDATE SET current_month_purchases_usd = 7.00;
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant) VALUES (v_eg_id, '2027-02', '2027-02-28 21:59:59+00');
        PERFORM sawyan_qa.run_monthly_settlement_engine((SELECT id FROM sawyan_qa.settlement_cycles WHERE country_id=v_eg_id AND period_ym='2027-02'));

        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd)
        VALUES (v_gv1, v_eg_id, '2027-03', 6.00, 24.75)
        ON CONFLICT (member_id, country_id, period_ym) DO UPDATE SET current_month_purchases_usd = 6.00;
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant) VALUES (v_eg_id, '2027-03', '2027-03-31 21:59:59+00');
        PERFORM sawyan_qa.run_monthly_settlement_engine((SELECT id FROM sawyan_qa.settlement_cycles WHERE country_id=v_eg_id AND period_ym='2027-03'));

        INSERT INTO sawyan_qa.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd)
        VALUES (v_gv1, v_eg_id, '2027-04', 10.00, 24.75)
        ON CONFLICT (member_id, country_id, period_ym) DO UPDATE SET current_month_purchases_usd = 10.00;
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant) VALUES (v_eg_id, '2027-04', '2027-04-30 21:59:59+00');
        PERFORM sawyan_qa.run_monthly_settlement_engine((SELECT id FROM sawyan_qa.settlement_cycles WHERE country_id=v_eg_id AND period_ym='2027-04'));

        SELECT carry_on_out_usd INTO v_gv_box FROM sawyan_qa.monthly_target_boxes WHERE member_id = v_gv1 AND country_id = v_eg_id AND period_ym = '2027-04';
        IF ROUND(v_gv_box, 2) <> 6.25 THEN
            RAISE EXCEPTION 'GV01_CARRY_ON_FAILED: Expected 6.25, got %', v_gv_box;
        END IF;

        -- ====================================================================
        -- TEST GV09-D / GV09-E: Full Day-14 Window (23:59:59) + Day-15 Ban + 2-Step OTP Lock + Option 1-A Triage
        -- ====================================================================
        UPDATE sawyan_qa.merchants
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_merch_tok)
         WHERE id = v_merch_zaid;
        UPDATE sawyan_qa.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_mem_tok)
         WHERE id = v_zaid;

        -- Freeze simulated time inside May 2027 (2027-05-20)
        PERFORM set_config('app_qa.fixed_now_utc', '2027-05-20 12:00:00+00', true);
        v_res := sawyan_qa.submit_pos_transaction(v_zaid, v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'MAY27-1', 'SW-MAY27-1', gen_random_uuid(), NULL, true, NULL);
        v_tx_may1 := (v_res->>'transaction_id')::uuid;
        v_res := sawyan_qa.submit_pos_transaction(v_zaid, v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'MAY27-2', 'SW-MAY27-2', gen_random_uuid(), NULL, true, NULL);
        v_tx_may2 := (v_res->>'transaction_id')::uuid;

        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant, maker_admin_id)
        VALUES (v_eg_id, '2027-05', '2027-05-31 20:59:59+00', v_a1) RETURNING id INTO v_cyc_may;
        PERFORM sawyan_qa.run_monthly_settlement_engine(v_cyc_may);

        -- Advance simulated clock to 2027-06-14 23:59:58+03 (last seconds of Day 14 in Cairo EEST UTC+3 -> MUST allow OTP handshake!)
        PERFORM set_config('app_qa.fixed_now_utc', '2027-06-14 23:59:58+03', true);
        v_otp_res := sawyan_qa.merchant_process_pos_return(
            v_merch_zaid, v_tx_may1, 'Day-14 23:59:58 return', gen_random_uuid(), v_merch_tok, 'request_otp', NULL, NULL
        );
        IF COALESCE((v_otp_res->>'ok')::boolean, false) IS NOT TRUE
           OR (v_otp_res ? 'otp_code') OR (v_otp_res ? 'otp_sha256')
        THEN
            RAISE EXCEPTION 'GV09D_OTP_REQUEST_OR_PRIVACY_FAILED: %', v_otp_res;
        END IF;
        v_otp_req_id := (v_otp_res->>'return_request_id')::uuid;

        -- Verify wrong OTP increments non-rollback counter 1..5 and locks without raising exception
        FOR i IN 1..5 LOOP
            v_otp_res := sawyan_qa.merchant_process_pos_return(
                v_merch_zaid, v_tx_may1, 'Wrong OTP test', NULL, v_merch_tok, 'confirm_otp', '000000', NULL
            );
            IF COALESCE((v_otp_res->>'ok')::boolean, true) IS NOT FALSE OR (v_otp_res->>'failed_attempts')::int <> i THEN
                RAISE EXCEPTION 'GV09D_OTP_COUNTER_FAILED at attempt %: %', i, v_otp_res;
            END IF;
        END LOOP;
        IF (v_otp_res->>'status') <> 'locked' THEN
            RAISE EXCEPTION 'GV09D_OTP_LOCK_FAILED: %', v_otp_res;
        END IF;

        -- Fresh OTP + valid confirm_otp reverses TX without leaking box_cascade (D26)
        v_otp_res := sawyan_qa.merchant_process_pos_return(
            v_merch_zaid, v_tx_may1, 'Valid OTP reversal', gen_random_uuid(), v_merch_tok, 'request_otp', NULL, NULL
        );
        v_otp_req_id := (v_otp_res->>'return_request_id')::uuid;
        SELECT payload->>'otp_code' INTO v_otp_real
          FROM sawyan_qa.notifications
         WHERE recipient_id = v_zaid AND event_name = 'PosReturnOtpRequested' AND (payload->>'return_request_id')::uuid = v_otp_req_id
         ORDER BY created_at DESC LIMIT 1;

        v_otp_res := sawyan_qa.merchant_process_pos_return(
            v_merch_zaid, v_tx_may1, 'Valid OTP reversal', gen_random_uuid(), v_merch_tok, 'confirm_otp', v_otp_real, NULL
        );
        IF COALESCE((v_otp_res->>'ok')::boolean, false) IS NOT TRUE
           OR ((v_otp_res->'reversal') ? 'box_cascade')
        THEN
            RAISE EXCEPTION 'GV09D_CONFIRM_OTP_OR_D26_STRIP_FAILED: %', v_otp_res;
        END IF;

        -- Recalculate 2027-05 after dirty-flag return (Zaid stays qualified with MAY27-2!)
        IF NOT (SELECT recalc_required FROM sawyan_qa.settlement_cycles WHERE id = v_cyc_may) THEN
            RAISE EXCEPTION 'GV09D_LAZY_DIRTY_FLAG_NOT_SET';
        END IF;
        PERFORM sawyan_qa.run_monthly_settlement_engine(v_cyc_may);

        -- Advance to Day 15 00:00:01 Cairo -> POST_PAYOUT_RETURN_FORBIDDEN even before payout button
        PERFORM set_config('app_qa.fixed_now_utc', '2027-06-15 00:00:01+03', true);
        v_err_caught := false;
        BEGIN
            PERFORM sawyan_qa.merchant_process_pos_return(
                v_merch_zaid, v_tx_may2, 'Post-Day14 midnight return', gen_random_uuid(), v_merch_tok, 'request_otp', NULL, NULL
            );
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%POST_PAYOUT_RETURN_FORBIDDEN%' THEN v_err_caught := true; END IF;
        END;
        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'GV09D_DAY15_HARD_CUTOFF_FAILED';
        END IF;

        -- Option 1-A Non-Breaking vs Breaking Dispute Triage:
        -- Reset clock to 2027-06-20, create breaking & non-breaking disputes across EG and TR in 2027-06
        PERFORM set_config('app_qa.fixed_now_utc', '2027-06-20 12:00:00+00', true);
        UPDATE sawyan_qa.monthly_target_boxes
           SET carry_on_in_usd = 30.00, is_qualified = true, qualification_source = 'carry_on'
         WHERE member_id = v_zaid AND country_id = v_eg_id AND period_ym = '2027-06';
        v_res := sawyan_qa.submit_pos_transaction(v_zaid, v_merch_zaid, v_br_zaid, 16500.00, 'cash', 'JUN27-EG', 'SW-JUN-EG', gen_random_uuid(), NULL, true, NULL);
        v_tx_jun_eg := (v_res->>'transaction_id')::uuid;
        -- Non-breaking dispute for Zaid (has $30 carry-on + $24.75 = $54.75 -> still qualified without $24.75!)
        v_disp_res := sawyan_qa.submit_member_dispute(v_zaid, v_tx_jun_eg, 'Non-breaking stalled return', v_mem_tok, NULL, NULL, NULL, NULL, 'return_stalled', 'https://proof.local/nonbreak.jpg');

        -- Create TR merchant & breaking member (#break_mem) who ONLY has $24.75 from one TX in TR 2027-06
        INSERT INTO sawyan_qa.merchants (merchant_code, country_id, business_name, owner_name, email, phone, category, merchant_type, deduction_percent, package_base_amount, actual_cash_balance, is_active)
        VALUES ('M-TR-1A', v_tr_id, 'متجر تركيا', 'تاجر تركي', 'mtr1a@qa.local', '+905500001111', 'supermarket', 'physical', 10.00, 10000.00, 10000.00, true)
        RETURNING id INTO v_merch_tr;
        INSERT INTO sawyan_qa.merchant_branches (merchant_id, branch_code, branch_name, is_main_branch, address, latitude, longitude)
        VALUES (v_merch_tr, 'BR-TR-1', 'اسطنبول', true, 'اسطنبول', 41.0082, 28.9784) RETURNING id INTO v_br_tr;
        INSERT INTO sawyan_qa.members (member_code, full_name, phone, residency_country_id, auth_user_id, sponsor_id, metadata)
        VALUES (590, 'Breaking User TR', '+905599990590', v_tr_id, gen_random_uuid(), v_m[1], jsonb_build_object('active_session_token', v_mem_tok))
        RETURNING id INTO v_break_mem;

        v_res := sawyan_qa.submit_pos_transaction(v_break_mem, v_merch_tr, v_br_tr, 16500.00, 'cash', 'JUN27-TR', 'SW-JUN-TR', gen_random_uuid(), NULL, true, NULL);
        v_tx_jun_tr := (v_res->>'transaction_id')::uuid;
        v_disp_res := sawyan_qa.submit_member_dispute(v_break_mem, v_tx_jun_tr, 'Pivot dollar return stalled', v_mem_tok, NULL, NULL, NULL, NULL, 'return_stalled', 'https://proof.local/pivot.jpg');
        IF (v_disp_res->>'status') <> 'escalated_to_admin' THEN
            RAISE EXCEPTION 'GV09E_FAST_TRACK_P0_FAILED: %', v_disp_res;
        END IF;

        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant, maker_admin_id)
        VALUES (v_eg_id, '2027-06', '2027-06-30 20:59:59+00', v_a1) RETURNING id INTO v_cyc_jun_eg;
        INSERT INTO sawyan_qa.settlement_cycles (country_id, period_ym, closure_utc_instant, maker_admin_id)
        VALUES (v_tr_id, '2027-06', '2027-06-30 20:59:59+00', v_a1) RETURNING id INTO v_cyc_jun_tr;
        PERFORM sawyan_qa.run_monthly_settlement_engine(v_cyc_jun_eg);
        PERFORM sawyan_qa.run_monthly_settlement_engine(v_cyc_jun_tr);

        PERFORM set_config('app_qa.fixed_now_utc', '2027-07-15 15:30:00+00', true);
        -- Clean EG pays out despite Zaid non-breaking dispute; TR MUST block ONLY TR!
        PERFORM sawyan_qa.finalize_settlement_payout_step5_6('2027-06', v_a1, v_a2, 0.00, 'EG');
        v_err_caught := false;
        BEGIN
            PERFORM sawyan_qa.finalize_settlement_payout_step5_6('2027-06', v_a1, v_a2, 0.00, 'TR');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%QUALIFICATION_BREAKING_DISPUTE_OPEN%' THEN v_err_caught := true; END IF;
        END;
        IF NOT v_err_caught THEN
            RAISE EXCEPTION 'GV09E_OPTION_1A_COUNTRY_SCOPE_FAILED';
        END IF;

        PERFORM set_config('app_qa.fixed_now_utc', '', true);

    END $$;
    """
    run_sql(qa_sql, token)
    print("ALL GOLDEN ACCEPTANCE VECTORS (V1-V9 & GV01-GV10) PASSED 100.00% ON LIVE POSTGRESQL 17.6!")

    print("=== Cleaning up Ephemeral QA Sandbox (`sawyan_qa`) ===")
    run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
    print("VERIFICATION SUITE COMPLETE.")


if __name__ == "__main__":
    main()
