import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
DB_DIR = os.path.dirname(os.path.abspath(__file__))

QA_SQL_FILES = [
    "01_schema_and_43_tables.sql",
    "02_core_functions_and_triggers.sql",
    "03_seed_coa_countries_and_demo.sql",
    "04_rls_and_grants.sql",
    "05_stage3_api_payment_and_shift_rpcs.sql",
    "06_stage4_member_and_portal_rpcs.sql",
    "07_remediation_security_and_settlement_patch.sql",
    "08_stage5_merchant_pos_and_portal_rpcs.sql",
    "09_stage6_admin_governance_and_launch_rpcs.sql",
    "10_stage7_operational_completeness_rpcs.sql",
    "12_stage8_academy_lms_foundation.sql",
    "14_geonames_search_rpc.sql",
    "15_admin_full_tree_rpc.sql",
    "16_registration_form_builder_governance.sql",
    "17_merchant_lifecycle_3axis_governance.sql",
]


def run_sql(sql, token):
    req = urllib.request.Request(
        f"{BASE_API}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-Stage10-QA/3.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body[:1200]}")


def clone_to_qa(sql_text):
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", "sawyan_qa", sql_text)


def read_sql(filename):
    with open(os.path.join(DB_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN env var required.", file=sys.stderr)
        sys.exit(1)

    print("=== [1/3] Setting up Ephemeral QA Sandbox (sawyan_qa) with 01..17 ===")
    run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
    try:
        for fn in QA_SQL_FILES:
            run_sql(clone_to_qa(read_sql(fn)), token)
        print(" [PASS] Cloned 01..17 into sawyan_qa cleanly")

        print("=== [2/3] Running Comprehensive Stage 10 Lifecycle & D4 Cycle/Grace QA ===")
        qa_block = """
        DO $$
        DECLARE
            v_eg_id      INT;
            v_tz         TEXT;
            v_root_id    UUID;
            v_mem_id     UUID;
            v_mem2_id    UUID;
            v_mem3_id    UUID;
            v_founder_id UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
            v_approv_id  UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
            v_ftok       TEXT := 'qa-founder-session-token-1234567890123456';
            v_atok       TEXT := 'qa-approver-session-token-1234567890123456';
            v_reg_res    JSONB;
            v_m1         UUID;
            v_b1         UUID;
            v_m2         UUID;
            v_m_d4       UUID;
            v_b_d4       UUID;
            v_eff        JSONB;
            v_bundle     JSONB;
            v_cat_cnt    INT;
            v_rad_cnt    INT;
            v_err        BOOLEAN;
            v_pend_id    UUID;
            v_comp1      UUID;
            v_comp2      UUID;
            v_comp3      UUID;
            v_mc_res     JSONB;
            v_set_res    JSONB;
            v_free_b     NUMERIC(18,2);
            v_target_d   NUMERIC(18,2);
            v_t1         TIMESTAMPTZ;
            v_t2         TIMESTAMPTZ;
            v_t3         TIMESTAMPTZ;
            v_t4         TIMESTAMPTZ;
            v_t5         TIMESTAMPTZ;
            v_t15d       TIMESTAMPTZ;
        BEGIN
            SELECT id, iana_timezone INTO v_eg_id, v_tz FROM sawyan_qa.countries WHERE country_code = 'EG';
            SELECT id INTO v_root_id FROM sawyan_qa.members WHERE member_code = 0;

            INSERT INTO sawyan_qa.admins (id, full_name, email, auth_user_id, role, two_factor_enabled, must_change_password, password_hash, metadata)
            VALUES
                (
                    v_founder_id, 'QA Founder', 'qafounder@sawyan.local', gen_random_uuid(), 'approver', false, false, 'hash',
                    jsonb_build_object(
                        'is_sovereign_founder', true,
                        'country_scope', 'GLOBAL',
                        'session_token_sha256', encode(extensions.digest(v_ftok, 'sha256'), 'hex'),
                        'session_expires_at', (now() + interval '30 days')::text
                    )
                ),
                (
                    v_approv_id, 'QA Approver', 'qaapprover@sawyan.local', gen_random_uuid(), 'approver', false, false, 'hash',
                    jsonb_build_object(
                        'is_sovereign_founder', false,
                        'country_scope', 'EG',
                        'session_token_sha256', encode(extensions.digest(v_atok, 'sha256'), 'hex'),
                        'session_expires_at', (now() + interval '30 days')::text
                    )
                )
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO sawyan_qa.maker_checker_requests (action_type, target_entity, target_id, payload_after, reason, maker_admin_id, checker_admin_id, status, decided_at)
            VALUES ('ROOT_DIRECT_PLACEMENT', 'member', '1', '{}'::jsonb, 'QA Root Seed', v_founder_id, v_approv_id, 'approved', now());

            INSERT INTO sawyan_qa.members (
                member_code, full_name, phone, residency_country_id, city_geoname_id,
                auth_user_id, sponsor_id, parent_member_id, placement_side, generation_in_tree, metadata
            ) VALUES (
                1, 'QA Member 1', '+201000001001', v_eg_id, 360630,
                gen_random_uuid(), v_root_id, NULL, 'root_direct', 1, '{}'::jsonb
            ) RETURNING id INTO v_mem_id;

            v_mem2_id := (sawyan_qa.register_new_member(p_full_name => 'QA Member 2', p_phone => '+201000001002', p_sponsor_code => 1, p_password => 'QAPass@1234', p_residency_country_code => 'EG', p_email => 'qam2@sawyan.local')->'member'->>'id')::uuid;
            v_mem3_id := (sawyan_qa.register_new_member(p_full_name => 'QA Member 3', p_phone => '+201000001003', p_sponsor_code => 1, p_password => 'QAPass@1234', p_residency_country_code => 'EG', p_email => 'qam3@sawyan.local')->'member'->>'id')::uuid;
            UPDATE sawyan_qa.members SET is_active_in_tree = true, kyc_status = 'verified', status = 'active' WHERE id IN (v_mem_id, v_mem2_id, v_mem3_id);

            -- T1: Optional Commercial Reg & Doc by default -> Auto-activation on profile completion
            PERFORM 1 FROM sawyan_qa.registration_field_configs
             WHERE form_type = 'merchant' AND field_key IN ('commercial_reg_no', 'commercial_doc_url') AND required_in_dashboard = false;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'QA_FAIL_T1_CONFIG_OPTIONAL_NOT_SET';
            END IF;

            -- Register incomplete merchant (commission NULL/0 -> draft_incomplete)
            v_reg_res := sawyan_qa.register_new_merchant(
                p_business_name          => 'QA Prepaid Mart',
                p_owner_name             => 'Owner QA',
                p_phone                  => '+201000002001',
                p_password               => 'QAPass@1234',
                p_country_code           => 'EG',
                p_category               => 'supermarket',
                p_merchant_type          => 'physical',
                p_deduction_percent      => NULL,
                p_email                  => 'qamart@sawyan.local',
                p_address                => 'Cairo QA St',
                p_latitude               => 30.0444,
                p_longitude              => 31.2357,
                p_onboarded_by_member_code => 0
            );
            v_m1 := (v_reg_res->'merchant'->>'id')::uuid;
            SELECT id INTO v_b1 FROM sawyan_qa.merchant_branches WHERE merchant_id = v_m1 LIMIT 1;

            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'onboarding_status') <> 'draft_incomplete'
               OR COALESCE((v_eff->'effective_access'->>'can_login_portal')::boolean, false) IS NOT TRUE
               OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, true) IS NOT FALSE
               OR COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_T1_DRAFT_STATE: %', v_eff;
            END IF;

            -- Update profile + set commission 10% WITHOUT commercial reg/doc -> must auto-approve!
            PERFORM sawyan_qa.manage_merchant_cashier_and_settings(
                p_merchant_id => v_m1,
                p_action      => 'update_profile',
                p_address     => 'Cairo Main District 12',
                p_latitude    => 30.0444,
                p_longitude   => 31.2357,
                p_media_patch => jsonb_build_object(
                    'deduction_percent', 10.0,
                    'city_name', 'Cairo',
                    'district', 'Nasr City',
                    'description', 'Fresh goods retail store'
                )
            );
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'onboarding_status') <> 'approved' OR (v_eff->>'financial_status') <> 'unfunded' THEN
                RAISE EXCEPTION 'QA_FAIL_T2_AUTO_APPROVE_OR_UNFUNDED: %', v_eff;
            END IF;

            -- Unfunded must be hidden from catalog/radar and blocked at POS
            SELECT COUNT(*) INTO v_cat_cnt FROM sawyan_qa.get_public_merchants_catalog('EG', NULL) WHERE merchant_id = v_m1;
            IF v_cat_cnt <> 0 THEN RAISE EXCEPTION 'QA_FAIL_UNFUNDED_VISIBLE_IN_CATALOG'; END IF;

            v_err := false;
            BEGIN
                PERFORM sawyan_qa.submit_pos_transaction(
                    p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1,
                    p_amount => 100.00, p_payment_type => 'cash',
                    p_unique_payment_ref => 'QA-UNFUND-1', p_sw_short_code => 'SW-UNF-1',
                    p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true
                );
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%MERCHANT_UNFUNDED_TOPUP_REQUIRED%' THEN v_err := true; ELSE RAISE; END IF;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_UNFUNDED_POS_NOT_BLOCKED'; END IF;

            -- Check bundle RPC works cleanly (<100 args fix)
            v_bundle := sawyan_qa.get_merchant_dashboard_bundle(v_m1, NULL, 'today', NULL);
            IF (v_bundle->'profile'->>'d4_effective_cycle_days') IS NULL THEN
                RAISE EXCEPTION 'QA_FAIL_BUNDLE_MISSING_D4_KEYS: %', v_bundle->'profile';
            END IF;

            -- Toggle commercial_reg_no required via Form Builder & confirm second merchant stays draft_incomplete until provided
            UPDATE sawyan_qa.registration_field_configs
               SET required_in_dashboard = true
             WHERE form_type = 'merchant' AND field_key = 'commercial_reg_no';

            v_reg_res := sawyan_qa.register_new_merchant(
                p_business_name            => 'QA RegReq Shop',
                p_owner_name               => 'Owner Req',
                p_phone                    => '+201000002002',
                p_password                 => 'QAPass@1234',
                p_country_code             => 'EG',
                p_category                 => 'supermarket',
                p_merchant_type            => 'physical',
                p_deduction_percent        => 10.0,
                p_email                    => 'qareq@sawyan.local',
                p_address                  => 'Alexandria St 44',
                p_latitude                 => 30.05,
                p_longitude                => 31.24,
                p_onboarded_by_member_code => 0,
                p_metadata                 => jsonb_build_object('description', 'Test desc', 'city_name', 'Cairo', 'district', 'Maadi')
            );
            v_m2 := (v_reg_res->'merchant'->>'id')::uuid;
            IF (sawyan_qa.compute_merchant_effective_state(v_m2)->>'onboarding_status') <> 'draft_incomplete' THEN
                RAISE EXCEPTION 'QA_FAIL_FORM_BUILDER_DYNAMIC_REQ';
            END IF;
            UPDATE sawyan_qa.registration_field_configs
               SET required_in_dashboard = false
             WHERE form_type = 'merchant' AND field_key = 'commercial_reg_no';

            -- T3: Prepaid 30% / 20% / 10% / FIFO(3) / locked_queue_full + Queue Cap Override(0)
            PERFORM sawyan_qa.process_merchant_topup_fifo(v_m1, 1000.00, 'TOPUP-QA-1000', gen_random_uuid(), 0.00, 'bank_transfer');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'financial_status') <> 'healthy_green' OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QA_FAIL_T3_HEALTHY_GREEN: %', v_eff;
            END IF;

            -- Deduct ~73% in one go (respects any country VAT rate)
            v_free_b := (v_eff->>'free_balance')::numeric;
            SELECT ROUND(((v_free_b * 0.73) / (0.10 * (1.0 + COALESCE(vat_rate, 0.0) / 100.0)))::numeric, 2)
              INTO v_target_d FROM sawyan_qa.countries WHERE id = v_eg_id;
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => v_target_d, p_payment_type => 'cash', p_unique_payment_ref => 'QA-YEL-1', p_sw_short_code => 'SW-YEL-1', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'financial_status') <> 'warning_yellow' THEN
                RAISE EXCEPTION 'QA_FAIL_T3_WARNING_YELLOW: %', v_eff;
            END IF;
            -- Flash offer must be blocked in warning_yellow
            v_err := false;
            BEGIN
                PERFORM sawyan_qa.submit_merchant_flash_offer(v_m1, 'Flash Test', 'Offer while yellow', '10%', v_m1);
            EXCEPTION WHEN OTHERS THEN
                v_err := true;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_FLASH_ALLOWED_IN_YELLOW'; END IF;

            -- Push into warning_red (<=20%, >10%)
            SELECT ROUND(((v_free_b * 0.12) / (0.10 * (1.0 + COALESCE(vat_rate, 0.0) / 100.0)))::numeric, 2)
              INTO v_target_d FROM sawyan_qa.countries WHERE id = v_eg_id;
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => v_target_d, p_payment_type => 'cash', p_unique_payment_ref => 'QA-RED-1', p_sw_short_code => 'SW-RED-1', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'financial_status') <> 'warning_red' THEN
                RAISE EXCEPTION 'QA_FAIL_T3_WARNING_RED: %', v_eff;
            END IF;

            -- Push into isolated_low_balance (<=10%, >0%)
            SELECT ROUND(((v_free_b * 0.08) / (0.10 * (1.0 + COALESCE(vat_rate, 0.0) / 100.0)))::numeric, 2)
              INTO v_target_d FROM sawyan_qa.countries WHERE id = v_eg_id;
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => v_target_d, p_payment_type => 'cash', p_unique_payment_ref => 'QA-ISO-1', p_sw_short_code => 'SW-ISO-1', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'financial_status') <> 'isolated_low_balance'
               OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, true) IS NOT FALSE
               OR COALESCE((v_eff->'effective_access'->>'can_accept_pending_remote')::boolean, true) IS NOT FALSE
               OR COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QA_FAIL_T3_ISOLATED_10: %', v_eff;
            END IF;

            -- Remote pending must be blocked while in-store POS still works
            v_err := false;
            BEGIN
                PERFORM sawyan_qa.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1,
                    p_amount => 200.00, p_payment_type => 'cash',
                    p_receipt_url => 'https://example.com/rec.jpg',
                    p_unique_payment_ref => 'QA-REM-BLK'
                );
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%MERCHANT_ISOLATED%' THEN v_err := true; ELSE RAISE; END IF;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_ISOLATED_REMOTE_NOT_BLOCKED'; END IF;

            -- Exhaust remaining balance and queue 3 FIFO invoices (cap = 3)
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => 2000.00, p_payment_type => 'cash', p_unique_payment_ref => 'QA-FIFO-1', p_sw_short_code => 'SW-FIFO-1', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => 1000.00, p_payment_type => 'cash', p_unique_payment_ref => 'QA-FIFO-2', p_sw_short_code => 'SW-FIFO-2', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => 1000.00, p_payment_type => 'cash', p_unique_payment_ref => 'QA-FIFO-3', p_sw_short_code => 'SW-FIFO-3', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'financial_status') <> 'locked_queue_full' OR (v_eff->>'fifo_queue_count')::int <> 3 THEN
                RAISE EXCEPTION 'QA_FAIL_T3_FIFO_LOCKED_AT_3: %', v_eff;
            END IF;

            -- 4th FIFO invoice must throw MERCHANT_QUEUE_FULL_BLOCKED
            v_err := false;
            BEGIN
                PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => 1000.00, p_payment_type => 'cash', p_unique_payment_ref => 'QA-FIFO-4', p_sw_short_code => 'SW-FIFO-4', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%MERCHANT_QUEUE_FULL_BLOCKED%' THEN v_err := true; ELSE RAISE; END IF;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_FIFO_4TH_NOT_BLOCKED'; END IF;

            -- Top up -> releases all 3 FIFO txs and restores healthy_green
            PERFORM sawyan_qa.process_merchant_topup_fifo(v_m1, 2000.00, 'TOPUP-QA-REL', gen_random_uuid(), 0.00, 'bank_transfer');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'fifo_queue_count')::int <> 0 OR (v_eff->>'financial_status') <> 'healthy_green' THEN
                RAISE EXCEPTION 'QA_FAIL_T3_FIFO_NOT_RELEASED: %', v_eff;
            END IF;

            -- Queue Cap Override = 0 (strict immediate lock)
            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m1,
                p_action => 'update_contract', p_reason => 'QA queue cap 0 test',
                p_unsecured_queue_cap_override => 0::smallint, p_clear_queue_cap_override => false
            );
            v_free_b := (sawyan_qa.compute_merchant_effective_state(v_m1)->>'free_balance')::numeric;
            v_err := false;
            BEGIN
                PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m1, p_branch_id => v_b1, p_amount => ROUND((v_free_b / 0.10) + 500.00, 2), p_payment_type => 'cash', p_unique_payment_ref => 'QA-QCAP0', p_sw_short_code => 'SW-QCAP0', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%MERCHANT_QUEUE_FULL_BLOCKED%' THEN v_err := true; ELSE RAISE; END IF;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_QUEUE_CAP_0_OVERRIDE_NOT_STRICT'; END IF;

            -- T4: D4 3-Parameter Credit Cycle + Grace Window (Exact Time-Travel)
            v_reg_res := sawyan_qa.register_new_merchant(
                p_business_name            => 'QA D4 Credit Store',
                p_owner_name               => 'Owner D4',
                p_phone                    => '+201000002003',
                p_password                 => 'QAPass@1234',
                p_country_code             => 'EG',
                p_category                 => 'supermarket',
                p_merchant_type            => 'physical',
                p_deduction_percent        => 10.0,
                p_email                    => 'qad4@sawyan.local',
                p_address                  => 'Zamalek St 15',
                p_latitude                 => 30.06,
                p_longitude                => 31.22,
                p_onboarded_by_member_code => 0,
                p_metadata                 => jsonb_build_object('description', 'D4 store', 'city_name', 'Cairo', 'district', 'Zamalek')
            );
            v_m_d4 := (v_reg_res->'merchant'->>'id')::uuid;
            SELECT id INTO v_b_d4 FROM sawyan_qa.merchant_branches WHERE merchant_id = v_m_d4 LIMIT 1;

            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m_d4,
                p_action => 'update_contract', p_deduction_percent => 10.0, p_credit_limit => 5000.00,
                p_is_active => true, p_is_isolated => false,
                p_reason => 'QA D4 1d/23:59/+2h credit limit grant',
                p_onboarding_status => 'approved', p_governance_status => 'good_standing'
            );

            -- T1: 2026-06-15 14:00:00 local time
            v_t1 := (('2026-06-15 14:00:00'::timestamp) AT TIME ZONE v_tz);
            PERFORM set_config('app_qa.fixed_now_utc', v_t1::text, true);

            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m_d4, p_branch_id => v_b_d4, p_amount => 1000.00, p_payment_type => 'cash', p_unique_payment_ref => 'D4-CYC1-1', p_sw_short_code => 'SW-D4-1', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            v_free_b := ABS((SELECT actual_cash_balance FROM sawyan_qa.merchants WHERE id = v_m_d4));
            IF v_free_b <= 0 OR COALESCE((v_eff->>'d4_statement_due_local')::numeric, -1) <> 0.00
               OR ABS(COALESCE((v_eff->>'d4_open_cycle_comm_local')::numeric, 0) - v_free_b) > 0.02
               OR COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_T1_OPEN_CYCLE: % (debt=%)', v_eff, v_free_b;
            END IF;

            -- T2: 2026-06-16 00:30:00 local time (INSIDE 2h grace [23:59 .. 01:59))
            v_t2 := (('2026-06-16 00:30:00'::timestamp) AT TIME ZONE v_tz);
            PERFORM set_config('app_qa.fixed_now_utc', v_t2::text, true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_in_grace_window')::boolean, false) IS NOT TRUE
               OR COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE
               OR ABS(COALESCE((v_eff->>'d4_statement_due_local')::numeric, 0) - v_free_b) > 0.02 THEN
                RAISE EXCEPTION 'QA_FAIL_D4_T2_GRACE_WINDOW: % (expected due=%)', v_eff, v_free_b;
            END IF;

            SELECT COUNT(*) INTO v_cat_cnt FROM sawyan_qa.get_public_merchants_catalog('EG', NULL) WHERE merchant_id = v_m_d4;
            SELECT COUNT(*) INTO v_rad_cnt FROM sawyan_qa.get_merchants_radar(30.06, 31.22, 10.0, 'EG', NULL) WHERE merchant_id = v_m_d4;
            IF v_cat_cnt <> 1 OR v_rad_cnt <> 1 THEN
                RAISE EXCEPTION 'QA_FAIL_D4_T2_HIDDEN_PREMATURELY_DURING_GRACE';
            END IF;

            -- Make NEW sale D4-CYC2-1 during grace window -> accrues into d4_open_cycle_comm_local ONLY
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m_d4, p_branch_id => v_b_d4, p_amount => 400.00, p_payment_type => 'cash', p_unique_payment_ref => 'D4-CYC2-1', p_sw_short_code => 'SW-D4-2', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF ABS(COALESCE((v_eff->>'d4_statement_due_local')::numeric, 0) - v_free_b) > 0.02
               OR COALESCE((v_eff->>'d4_open_cycle_comm_local')::numeric, 0) <= 0 THEN
                RAISE EXCEPTION 'QA_FAIL_D4_T2_OPEN_ACCRUAL_SPLIT: %', v_eff;
            END IF;

            -- Pay exact Cycle 1 statement due during grace -> rolls d4_debt_started_at to D4-CYC2-1
            PERFORM sawyan_qa.process_merchant_topup_fifo(v_m_d4, v_free_b, 'D4-SETTLE-CYC1', gen_random_uuid(), 0.00, 'bank_transfer');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_statement_due_local')::numeric, -1) <> 0.00
               OR COALESCE((v_eff->>'d4_in_grace_window')::boolean, true) IS NOT FALSE
               OR COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_CYCLE1_ROLLFORWARD_FAILED: %', v_eff;
            END IF;

            -- T3: Past Cycle 2 close (2026-06-16 23:59) + 2h grace -> 2026-06-17 02:05:00 local
            v_t3 := (('2026-06-17 02:05:00'::timestamp) AT TIME ZONE v_tz);
            PERFORM set_config('app_qa.fixed_now_utc', v_t3::text, true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_cutoff_breached')::boolean, false) IS NOT TRUE
               OR (v_eff->>'financial_status') <> 'locked_queue_full'
               OR COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_T3_BREACH_LOCK: %', v_eff;
            END IF;

            -- Instant removal from BOTH catalog and radar without cron
            SELECT COUNT(*) INTO v_cat_cnt FROM sawyan_qa.get_public_merchants_catalog('EG', NULL) WHERE merchant_id = v_m_d4;
            SELECT COUNT(*) INTO v_rad_cnt FROM sawyan_qa.get_merchants_radar(30.06, 31.22, 10.0, 'EG', NULL) WHERE merchant_id = v_m_d4;
            IF v_cat_cnt <> 0 OR v_rad_cnt <> 0 THEN
                RAISE EXCEPTION 'QA_FAIL_D4_T3_NOT_HIDDEN_INSTANTLY_ON_CUTOFF';
            END IF;

            v_err := false;
            BEGIN
                PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m_d4, p_branch_id => v_b_d4, p_amount => 100.00, p_payment_type => 'cash', p_unique_payment_ref => 'D4-BLK-POS', p_sw_short_code => 'SW-D4-BLK', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%MERCHANT_QUEUE_FULL_BLOCKED%' THEN v_err := true; ELSE RAISE; END IF;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_D4_BREACH_POS_NOT_BLOCKED'; END IF;

            -- Pay overdue debt -> instant unlock & catalog/radar restoration
            v_free_b := ABS((SELECT actual_cash_balance FROM sawyan_qa.merchants WHERE id = v_m_d4));
            PERFORM sawyan_qa.process_merchant_topup_fifo(v_m_d4, v_free_b, 'D4-SETTLE-CYC2', gen_random_uuid(), 0.00, 'bank_transfer');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            SELECT COUNT(*) INTO v_cat_cnt FROM sawyan_qa.get_public_merchants_catalog('EG', NULL) WHERE merchant_id = v_m_d4;
            IF COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE OR v_cat_cnt <> 1 THEN
                RAISE EXCEPTION 'QA_FAIL_D4_UNLOCK_AFTER_SETTLE: % cat=%', v_eff, v_cat_cnt;
            END IF;

            -- T4B: Multi-day override (3 days cycle, 4h grace)
            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m_d4,
                p_action => 'update_contract', p_reason => 'QA D4 3-day cycle + 4h grace',
                p_deferred_settlement_cutoff_time => '23:59:00'::time,
                p_d4_cycle_days_override => 3::smallint, p_d4_grace_hours_override => 4.00,
                p_d4_disable_time_trigger => false
            );
            v_t4 := (('2026-06-17 10:00:00'::timestamp) AT TIME ZONE v_tz);
            PERFORM set_config('app_qa.fixed_now_utc', v_t4::text, true);
            PERFORM sawyan_qa.submit_pos_transaction(p_member_id => v_mem_id, p_merchant_id => v_m_d4, p_branch_id => v_b_d4, p_amount => 500.00, p_payment_type => 'cash', p_unique_payment_ref => 'D4-3DAY-1', p_sw_short_code => 'SW-D4-3D', p_idempotency_key => gen_random_uuid(), p_is_instant_pin => true);

            -- Day 3 noon: NOT due yet
            PERFORM set_config('app_qa.fixed_now_utc', ((('2026-06-19 12:00:00'::timestamp) AT TIME ZONE v_tz)::text), true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_effective_cycle_days')::int, 0) <> 3
               OR COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE
               OR COALESCE((v_eff->>'d4_in_grace_window')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_3DAY_EARLY_TRIGGER: %', v_eff;
            END IF;

            -- Day 4 02:00 AM: INSIDE 4h grace window [23:59 .. 03:59)
            PERFORM set_config('app_qa.fixed_now_utc', ((('2026-06-20 02:00:00'::timestamp) AT TIME ZONE v_tz)::text), true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_in_grace_window')::boolean, false) IS NOT TRUE
               OR COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_3DAY_GRACE_AT_0200: %', v_eff;
            END IF;

            -- Day 4 04:05 AM: breached!
            v_t5 := (('2026-06-20 04:05:00'::timestamp) AT TIME ZONE v_tz);
            PERFORM set_config('app_qa.fixed_now_utc', v_t5::text, true);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_cutoff_breached')::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_3DAY_BREACH_AT_0405: %', v_eff;
            END IF;

            -- Cap-only opt-out disables time lock cleanly
            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m_d4,
                p_action => 'update_contract', p_reason => 'QA cap-only mode', p_d4_disable_time_trigger => true
            );
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF COALESCE((v_eff->>'d4_cutoff_breached')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_D4_CAP_ONLY_OPT_OUT: %', v_eff;
            END IF;

            -- Re-enable time trigger & advance 15 days -> suspended_compliance
            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m_d4,
                p_action => 'update_contract', p_reason => 'Re-enable time trigger', p_d4_disable_time_trigger => false
            );
            v_t15d := v_t5 + interval '15 days';
            PERFORM set_config('app_qa.fixed_now_utc', v_t15d::text, true);
            v_eff := sawyan_qa.sync_merchant_status_flags(v_m_d4);
            IF (v_eff->>'governance_status') <> 'suspended_compliance' THEN
                RAISE EXCEPTION 'QA_FAIL_14DAY_AUTO_COMPLIANCE_SUSPEND: %', v_eff;
            END IF;

            -- Top-up alone MUST NOT lift suspended_compliance
            v_free_b := ABS((SELECT actual_cash_balance FROM sawyan_qa.merchants WHERE id = v_m_d4));
            PERFORM sawyan_qa.process_merchant_topup_fifo(v_m_d4, v_free_b, 'D4-SETTLE-AFTER-15D', gen_random_uuid(), 0.00, 'bank_transfer');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF (v_eff->>'governance_status') <> 'suspended_compliance'
               OR COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_TOPUP_LIFTED_SUSPENSION_WITHOUT_ADMIN: %', v_eff;
            END IF;

            -- Admin lifts suspension
            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m_d4,
                p_action => 'update_contract', p_reason => 'Admin lifted compliance hold after repayment',
                p_governance_status => 'good_standing'
            );

            -- T6: Self-Service Pause & Resume
            PERFORM set_config('app_qa.fixed_now_utc', '', true);
            PERFORM sawyan_qa.manage_merchant_cashier_and_settings(p_merchant_id => v_m_d4, p_action => 'toggle_merchant_pause');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF (v_eff->>'governance_status') <> 'paused_by_merchant'
               OR (v_eff->>'pre_pause_governance_status') <> 'good_standing'
               OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_SELF_PAUSE: %', v_eff;
            END IF;
            PERFORM sawyan_qa.manage_merchant_cashier_and_settings(p_merchant_id => v_m_d4, p_action => 'toggle_merchant_pause');
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m_d4);
            IF (v_eff->>'governance_status') <> 'good_standing'
               OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QA_FAIL_SELF_RESUME: %', v_eff;
            END IF;

            -- T7: Member Direct Complaints -> Admin Verification -> Escalation to restricted_no_reject
            v_comp1 := (sawyan_qa.submit_member_merchant_complaint(v_mem_id,  v_m1, 'evasion_excuse', 'Refused invoice #1', 'Cashier claimed system down without checking')->>'complaint_id')::uuid;
            v_comp2 := (sawyan_qa.submit_member_merchant_complaint(v_mem2_id, v_m1, 'refused_verification', 'Refused invoice #2', 'Refused to scan member QR at register')->>'complaint_id')::uuid;
            v_comp3 := (sawyan_qa.submit_member_merchant_complaint(v_mem3_id, v_m1, 'hidden_fee', 'Extra 5% fee demanded', 'Cashier asked 5% surcharge above menu price')->>'complaint_id')::uuid;

            IF (sawyan_qa.compute_merchant_effective_state(v_m1)->>'governance_status') <> 'good_standing' THEN
                RAISE EXCEPTION 'QA_FAIL_OPEN_COMPLAINT_PENALIZED_EARLY';
            END IF;

            PERFORM sawyan_qa.admin_operational_decision(v_founder_id, v_ftok, 'merchant_complaint', v_comp1::text, 'verified', 'Confirmed with receipt #1', NULL);
            PERFORM sawyan_qa.admin_operational_decision(v_founder_id, v_ftok, 'merchant_complaint', v_comp2::text, 'verified', 'Confirmed with receipt #2', NULL);
            IF (sawyan_qa.compute_merchant_effective_state(v_m1)->>'governance_status') <> 'probation_warning' THEN
                RAISE EXCEPTION 'QA_FAIL_2_VERIFIED_COMPLAINTS_PROBATION';
            END IF;

            PERFORM sawyan_qa.admin_operational_decision(v_founder_id, v_ftok, 'merchant_complaint', v_comp3::text, 'verified', 'Confirmed surcharge violation #3', NULL);
            v_eff := sawyan_qa.compute_merchant_effective_state(v_m1);
            IF (v_eff->>'governance_status') <> 'restricted_no_reject'
               OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, true) IS NOT FALSE
               OR COALESCE((v_eff->'effective_access'->>'can_reject_pending_manually')::boolean, true) IS NOT FALSE THEN
                RAISE EXCEPTION 'QA_FAIL_3_VERIFIED_COMPLAINTS_RESTRICT: %', v_eff;
            END IF;

            INSERT INTO sawyan_qa.transactions (member_id, merchant_id, branch_id, country_id, sw_short_code, unique_payment_ref, idempotency_key, amount, total_amount, commission_amount, currency_code, fx_rate_used, payment_type, status, commission_snapshot)
            VALUES (v_mem_id, v_m1, v_b1, v_eg_id, 'SW-QATEST1', 'QA-PEND-D2-REJ', gen_random_uuid(), 100, 100, 10, 'EGP', 50.0, 'cash', 'pending', '{"deduction_percent":10}'::jsonb)
            RETURNING id INTO v_pend_id;
            v_err := false;
            BEGIN
                PERFORM sawyan_qa.confirm_or_reject_pending_tx(v_m1, v_pend_id, 'reject', 'Trying blocked reject', NULL);
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%MERCHANT_MANUAL_REJECT_REVOKED_D2%' THEN v_err := true; ELSE RAISE; END IF;
            END;
            IF NOT v_err THEN RAISE EXCEPTION 'QA_FAIL_RESTRICTED_MANUAL_REJECT_NOT_REVOKED'; END IF;

            -- T8: Maker-Checker RBAC for non-Founder + Bitemporal D4 Settings Update
            v_mc_res := sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_approv_id, p_session_token => v_atok, p_merchant_id => v_m1,
                p_action => 'update_contract', p_credit_limit => 9999.00,
                p_reason => 'Non-founder trying to grant credit limit'
            );
            IF COALESCE((v_mc_res->>'pending_maker_checker')::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QA_FAIL_NON_FOUNDER_CREDIT_NOT_ROUTED_TO_MC: %', v_mc_res;
            END IF;

            v_set_res := sawyan_qa.admin_submit_governance_request(
                v_founder_id, v_ftok, 'BITEMPORAL_SETTINGS_UPDATE', 'settings', 'GLOBAL',
                jsonb_build_object(
                    'merchant_warn1_pct', 30, 'merchant_warn2_pct', 20, 'merchant_isolate_pct', 10,
                    'unsecured_queue_cap', 4, 'unconfirmed_soft_hold_cap_pct', 20,
                    'fifo_default_days', 14, 'pending_sla_hours', 48,
                    'd4_cycle_days', 2, 'd4_cycle_cutoff_time', '22:30:00', 'd4_grace_hours', 3.50,
                    'effective_from', now()
                ),
                'QA update global D4 cycle/cutoff/grace settings'
            );
            PERFORM 1 FROM sawyan_qa.settings
             WHERE country_id IS NULL AND d4_cycle_days = 2 AND d4_cycle_cutoff_time = '22:30:00'::time AND d4_grace_hours = 3.50;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'QA_FAIL_GLOBAL_D4_SETTINGS_NOT_SAVED: %', v_set_res;
            END IF;

            PERFORM sawyan_qa.admin_manage_merchant_contract(
                p_admin_id => v_founder_id, p_session_token => v_ftok, p_merchant_id => v_m_d4,
                p_action => 'update_contract', p_reason => 'Clear merchant overrides',
                p_clear_cutoff_time => true, p_clear_d4_cycle_days => true,
                p_clear_d4_grace_hours => true, p_d4_disable_time_trigger => false
            );
            v_bundle := sawyan_qa.get_merchant_dashboard_bundle(v_m_d4, NULL, 'today', NULL);
            IF (v_bundle->'profile'->>'d4_effective_cycle_days')::int <> 2
               OR (v_bundle->'profile'->>'d4_effective_cutoff_time') <> '22:30:00'
               OR (v_bundle->'profile'->>'d4_effective_grace_hours')::numeric <> 3.50 THEN
                RAISE EXCEPTION 'QA_FAIL_D4_GLOBAL_INHERITANCE: %', v_bundle->'profile';
            END IF;
        END $$;
        """
        run_sql(qa_block, token)
        print(" [PASS] All Stage 10 Lifecycle, Thresholds, FIFO, D4 Cycle+Grace, 14d Suspension, Pause, Complaints & Maker-Checker checks passed!")

    finally:
        print("=== [3/3] Cleaning Up Ephemeral QA Sandbox (sawyan_qa) ===")
        run_sql("DROP SCHEMA IF EXISTS sawyan_qa CASCADE;", token)
        print(" [PASS] Dropped sawyan_qa cleanly.")


if __name__ == "__main__":
    main()
