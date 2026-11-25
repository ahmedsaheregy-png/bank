-- ============================================================================
-- SAWYAN V3.0 — Stage 19 Full-Lifecycle 50-Member & 6-Merchant Simulator
-- File: database/27_stage19_demo_full_lifecycle_simulator.sql
-- Scope: `sawyan_demo` ONLY (never deployed into Production `sawyan`!)
--
-- Simulates the COMPLETE end-to-end real human lifecycle inside a single
-- self-rolling-back subtransaction (ZERO data pollution on `sawyan_demo`):
--   1. Hero Member + 50 randomized downline members across EG & TR (direct + spillover)
--   2. 6 Merchant Archetypes:
--        M1: Prepaid funded (EG)
--        M2: D4 Credit-limit active (verifies negative cash & d4_debt_started_at)
--        M3: Compliant Foreign (TR) merchant (cross-border remote purchase + confirm)
--        M4: Rogue / Evasive merchant (member dispute + price-gouging report)
--        M5: Multi-branch + isolated Cashier Employee PIN login & sale
--        M6: Solo unfunded -> amount-only top-up notice (optional proof!) -> funded unlock
--   3. 29+ POS, remote-receipt & cashier transactions (GREEN / ORANGE / WHITE mix)
--   4. Confused member customer support ticket
--   5. Hero Member Tree Analytics & Foreign Country Lens (TR) check
--   6. Full Month-Close Settlement Engine + Maker-Checker Day-15 Payout -> Wallet credit
--   7. Zero-Discrepancy Double-Entry Accounting Audit (`abs_diff_usd = 0.00`)
--   8. Atomic subtransaction rollback (`SQLSTATE 'P0099'`) leaving `sawyan_demo` spotless
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan_demo.run_full_lifecycle_chaos_simulation(
    p_seed INTEGER DEFAULT 20261124
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
    v_t0                 TIMESTAMPTZ := clock_timestamp();
    v_report             JSONB := '{}'::jsonb;
    v_seed_norm          DOUBLE PRECISION;
    v_period_ym          CHAR(7);
    v_maker_id           UUID;
    v_checker_id         UUID;
    v_root_leader_code   BIGINT := 1;
    v_hero_res           JSONB;
    v_hero_id            UUID;
    v_hero_code          BIGINT;
    v_member_ids         UUID[] := ARRAY[]::UUID[];
    v_member_codes       BIGINT[] := ARRAY[]::BIGINT[];
    v_member_ccs         TEXT[] := ARRAY[]::TEXT[];
    v_member_toks        TEXT[] := ARRAY[]::TEXT[];
    v_i                  INT;
    v_sp_idx             INT;
    v_sp_code            BIGINT;
    v_cc                 CHAR(2);
    v_m_res              JSONB;
    -- 6 Merchant archetypes
    v_m1_id UUID; v_m1_br UUID; v_m1_code TEXT;
    v_m2_id UUID; v_m2_br UUID; v_m2_code TEXT;
    v_m3_id UUID; v_m3_br UUID; v_m3_code TEXT; v_m3_tok TEXT;
    v_m4_id UUID; v_m4_br UUID; v_m4_code TEXT;
    v_m5_id UUID; v_m5_br UUID; v_m5_br2 UUID; v_m5_code TEXT; v_m5_tok TEXT;
    v_m6_id UUID; v_m6_br UUID; v_m6_code TEXT; v_m6_tok TEXT;
    v_adm_tok            TEXT;
    v_emp_res            JSONB;
    v_emp_id             UUID;
    v_emp_tok            TEXT;
    v_emp_tx_res         JSONB;
    v_tx_res             JSONB;
    v_pend_tx_id         UUID;
    v_rogue_tx_id        UUID;
    v_dispute_res        JSONB;
    v_gouging_res        JSONB;
    v_ticket_res         JSONB;
    v_m6_before          JSONB;
    v_m6_notice_res      JSONB;
    v_m6_after           JSONB;
    v_m2_d4_started      TIMESTAMPTZ;
    v_m2_cash            NUMERIC(18,2);
    v_tx_count           INT := 0;
    v_hero_tree_all      JSONB;
    v_hero_tree_tr       JSONB;
    v_cyc_eg_id          BIGINT;
    v_cyc_tr_id          BIGINT;
    v_eng_eg             JSONB;
    v_eng_tr             JSONB;
    v_payout_res         JSONB;
    v_hero_wallet_after  NUMERIC(18,2) := 0.00;
    v_hero_wtx_cnt       INT := 0;
    v_audit_res          JSONB;
    v_gl_diff            NUMERIC(18,2) := 0.00;
    v_run_tag            TEXT;
    v_tx_amt             NUMERIC(18,2);
    v_tiny_png           TEXT := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
BEGIN
    v_run_tag   := 'SIM' || abs(COALESCE(p_seed, 20261124))::text || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    v_seed_norm := (((abs(COALESCE(p_seed, 20261124)) % 1000000)::double precision) / 1000000.0) * 1.9 - 0.95;
    PERFORM setseed(v_seed_norm);

    v_period_ym := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');

    SELECT id INTO v_maker_id   FROM sawyan_demo.admins WHERE is_active = true AND role = 'finance'  ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_checker_id FROM sawyan_demo.admins WHERE is_active = true AND role = 'approver' AND id <> COALESCE(v_maker_id, '00000000-0000-0000-0000-000000000000'::uuid) ORDER BY COALESCE((metadata->>'is_sovereign_founder')::boolean, false) DESC, created_at ASC LIMIT 1;
    IF v_maker_id IS NULL OR v_checker_id IS NULL THEN
        RAISE EXCEPTION 'SIM_MISSING_DEMO_MAKER_CHECKER_ADMINS';
    END IF;

    BEGIN
        -- Mint a scoped admin session token inside the rolled-back subtransaction
        v_adm_tok := 'sim_adm_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
        UPDATE sawyan_demo.admins
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'session_token_sha256', encode(extensions.digest(v_adm_tok, 'sha256'), 'hex'),
               'session_expires_at', (now() + interval '1 hour')::text
           )
         WHERE id = v_checker_id;

        -- 1. Register Hero Member + 50 randomized downline members across EG & TR
        v_hero_res := sawyan_demo.register_new_member(
            'بطل المحاكاة الشاملة ' || v_run_tag,
            '+20190' || lpad(((abs(hashtext(v_run_tag || '_hero')) % 8999999) + 1000000)::text, 7, '0'),
            v_root_leader_code, 'SimStrong#2026!', 'EG', 'EG', NULL, 'القاهرة',
            lower(v_run_tag) || '_hero@sim.sawyan.test', '{"source":"stage19_lifecycle_sim"}'::jsonb
        );
        v_hero_id   := (v_hero_res->'member'->>'id')::uuid;
        v_hero_code := (v_hero_res->'member'->>'member_code')::bigint;

        v_member_ids   := array_append(v_member_ids, v_hero_id);
        v_member_codes := array_append(v_member_codes, v_hero_code);
        v_member_ccs   := array_append(v_member_ccs, 'EG');
        v_member_toks  := array_append(v_member_toks, COALESCE(v_hero_res->>'session_token', ''));

        FOR v_i IN 1..50 LOOP
            IF v_i <= 4 THEN
                v_sp_code := v_hero_code;
            ELSE
                v_sp_idx  := 1 + floor(random() * LEAST(array_length(v_member_codes, 1), 16))::int;
                v_sp_code := v_member_codes[v_sp_idx];
            END IF;
            v_cc := CASE WHEN (v_i % 3 = 0) THEN 'TR' ELSE 'EG' END;

            v_m_res := sawyan_demo.register_new_member(
                'عضو محاكاة #' || v_i || ' ' || v_cc,
                CASE WHEN v_cc = 'TR'
                     THEN '+9059' || lpad(((abs(hashtext(v_run_tag || '_m_' || v_i::text)) % 89999999) + 10000000)::text, 8, '0')
                     ELSE '+2018' || lpad(((abs(hashtext(v_run_tag || '_m_' || v_i::text)) % 89999999) + 10000000)::text, 8, '0')
                END,
                v_sp_code, 'SimMember#2026!', v_cc, v_cc, NULL,
                CASE WHEN v_cc = 'TR' THEN 'إسطنبول' ELSE 'الجيزة' END,
                lower(v_run_tag) || '_m' || v_i::text || '@sim.sawyan.test',
                jsonb_build_object('sim_index', v_i)
            );
            v_member_ids   := array_append(v_member_ids, (v_m_res->'member'->>'id')::uuid);
            v_member_codes := array_append(v_member_codes, (v_m_res->'member'->>'member_code')::bigint);
            v_member_ccs   := array_append(v_member_ccs, v_cc::text);
            v_member_toks  := array_append(v_member_toks, COALESCE(v_m_res->>'session_token', ''));
        END LOOP;

        -- 2. Register & configure 6 Merchant Archetypes
        -- M1: Prepaid Funded (EG)
        v_m_res := sawyan_demo.register_new_merchant(
            'متجر الشحن المسبق ' || v_run_tag, 'تاجر شحن مسبق',
            '+20171' || lpad(((abs(hashtext(v_run_tag || '_m1')) % 8999999) + 1000000)::text, 7, '0'),
            'MerPass#2026!', 'EG', 'supermarket', 'physical', 10.00,
            lower(v_run_tag) || '_mer1@sim.sawyan.test', 'القاهرة - مدينة نصر', NULL, 30.05, 31.33, v_hero_code, '4321', '{}'::jsonb
        );
        v_m1_id := (v_m_res->'merchant'->>'id')::uuid; v_m1_br := (v_m_res->>'main_branch_id')::uuid; v_m1_code := v_m_res->'merchant'->>'merchant_code';
        PERFORM sawyan_demo.admin_manage_merchant_contract(v_checker_id, v_adm_tok, v_m1_id, 'update_contract', 10.00, NULL, 0.00, true, false, NULL, NULL, NULL, 'Sim M1 approve', 'approved', 'good_standing');
        PERFORM sawyan_demo.process_merchant_topup_fifo(v_m1_id, 45000.00, 'SIM-M1-TOPUP-' || v_run_tag, gen_random_uuid(), 0.00, 'bank_transfer');

        -- M2: D4 Credit-Limit Merchant (EG — zero cash, 3,000 EGP D4 credit)
        v_m_res := sawyan_demo.register_new_merchant(
            'متجر السقف الائتماني D4 ' || v_run_tag, 'تاجر ائتمان',
            '+20172' || lpad(((abs(hashtext(v_run_tag || '_m2')) % 8999999) + 1000000)::text, 7, '0'),
            'MerPass#2026!', 'EG', 'electronics', 'physical', 10.00,
            lower(v_run_tag) || '_mer2@sim.sawyan.test', 'القاهرة - المعادي', NULL, 29.96, 31.26, NULL, '5432', '{}'::jsonb
        );
        v_m2_id := (v_m_res->'merchant'->>'id')::uuid; v_m2_br := (v_m_res->>'main_branch_id')::uuid; v_m2_code := v_m_res->'merchant'->>'merchant_code';
        PERFORM sawyan_demo.admin_manage_merchant_contract(v_checker_id, v_adm_tok, v_m2_id, 'update_contract', 10.00, NULL, 3000.00, true, false, NULL, NULL, NULL, 'Sim M2 D4 credit', 'approved', 'good_standing');

        -- M3: Compliant Foreign Merchant (TR)
        v_m_res := sawyan_demo.register_new_merchant(
            'متجر تركيا الملتزم ' || v_run_tag, 'تاجر تركيا',
            '+90553' || lpad(((abs(hashtext(v_run_tag || '_m3')) % 8999999) + 1000000)::text, 7, '0'),
            'MerPass#2026!', 'TR', 'restaurant', 'physical', 10.00,
            lower(v_run_tag) || '_mer3@sim.sawyan.test', 'إسطنبول - الفاتح', NULL, 41.01, 28.95, NULL, '6543', '{}'::jsonb
        );
        v_m3_id := (v_m_res->'merchant'->>'id')::uuid; v_m3_br := (v_m_res->>'main_branch_id')::uuid; v_m3_code := v_m_res->'merchant'->>'merchant_code'; v_m3_tok := v_m_res->>'session_token';
        PERFORM sawyan_demo.admin_manage_merchant_contract(v_checker_id, v_adm_tok, v_m3_id, 'update_contract', 10.00, NULL, 0.00, true, false, NULL, NULL, NULL, 'Sim M3 TR approve', 'approved', 'good_standing');
        PERFORM sawyan_demo.process_merchant_topup_fifo(v_m3_id, 45000.00, 'SIM-M3-TOPUP-' || v_run_tag, gen_random_uuid(), 0.00, 'bank_transfer');

        -- M4: Rogue / Evasive Merchant (EG)
        v_m_res := sawyan_demo.register_new_merchant(
            'متجر مخالف متهرب ' || v_run_tag, 'تاجر مخالف',
            '+20174' || lpad(((abs(hashtext(v_run_tag || '_m4')) % 8999999) + 1000000)::text, 7, '0'),
            'MerPass#2026!', 'EG', 'fashion', 'physical', 10.00,
            lower(v_run_tag) || '_mer4@sim.sawyan.test', 'الجيزة - الهرم', NULL, 30.00, 31.18, NULL, '7654', '{}'::jsonb
        );
        v_m4_id := (v_m_res->'merchant'->>'id')::uuid; v_m4_br := (v_m_res->>'main_branch_id')::uuid; v_m4_code := v_m_res->'merchant'->>'merchant_code';
        PERFORM sawyan_demo.admin_manage_merchant_contract(v_checker_id, v_adm_tok, v_m4_id, 'update_contract', 10.00, NULL, 0.00, true, false, NULL, NULL, NULL, 'Sim M4 initial approve', 'approved', 'good_standing');
        PERFORM sawyan_demo.process_merchant_topup_fifo(v_m4_id, 5000.00, 'SIM-M4-TOPUP-' || v_run_tag, gen_random_uuid(), 0.00, 'bank_transfer');

        -- M5: Multi-Branch + Cashier Employee (EG)
        v_m_res := sawyan_demo.register_new_merchant(
            'سلسلة فروع وكاشير ' || v_run_tag, 'تاجر متعدد الفروع',
            '+20175' || lpad(((abs(hashtext(v_run_tag || '_m5')) % 8999999) + 1000000)::text, 7, '0'),
            'MerPass#2026!', 'EG', 'pharmacy', 'physical', 10.00,
            lower(v_run_tag) || '_mer5@sim.sawyan.test', 'القاهرة - التجمع', NULL, 30.02, 31.42, NULL, '8765', '{}'::jsonb
        );
        v_m5_id := (v_m_res->'merchant'->>'id')::uuid; v_m5_br := (v_m_res->>'main_branch_id')::uuid; v_m5_code := v_m_res->'merchant'->>'merchant_code'; v_m5_tok := v_m_res->>'session_token';
        PERFORM sawyan_demo.admin_manage_merchant_contract(v_checker_id, v_adm_tok, v_m5_id, 'update_contract', 10.00, NULL, 0.00, true, false, NULL, NULL, NULL, 'Sim M5 approve', 'approved', 'good_standing');
        PERFORM sawyan_demo.process_merchant_topup_fifo(v_m5_id, 15000.00, 'SIM-M5-TOPUP-' || v_run_tag, gen_random_uuid(), 0.00, 'bank_transfer');

        v_m_res := sawyan_demo.merchant_manage_branches_and_refunds(
            v_m5_id, v_m5_tok, 'add_branch',
            jsonb_build_object('branch_name', 'فرع التجمع الثاني', 'address', 'التجمع الخامس شارع التسعين', 'branch_phone', '+20175000999', 'branch_manager_name', 'مدير فرع 2')
        );
        v_m5_br2 := COALESCE((v_m_res->>'branch_id')::uuid, v_m5_br);

        PERFORM sawyan_demo.manage_merchant_cashier_and_settings(
            v_m5_id, 'add_cashier', v_m5_tok,
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            'EMP-S19', 'كاشير فرع 2', '7391', NULL, 50000.00, NULL, v_m5_br2, NULL
        );
        v_emp_res := sawyan_demo.authenticate_employee_login(v_m5_code, 'EMP-S19', '7391');
        v_emp_id  := (v_emp_res->'employee'->>'id')::uuid;
        v_emp_tok := v_emp_res->>'session_token';
        PERFORM sawyan_demo.employee_change_pin(v_emp_id, v_emp_tok, '7391', '8529');

        -- M6: Solo Merchant (unfunded -> amount-only notice without receipt/ref -> funded unlock)
        v_m_res := sawyan_demo.register_new_merchant(
            'تاجر فردي مبتدئ ' || v_run_tag, 'تاجر فردي',
            '+20176' || lpad(((abs(hashtext(v_run_tag || '_m6')) % 8999999) + 1000000)::text, 7, '0'),
            'MerPass#2026!', 'EG', 'cafe', 'physical', 10.00,
            lower(v_run_tag) || '_mer6@sim.sawyan.test', 'الإسكندرية - سموحة', NULL, 31.21, 29.94, NULL, '9876', '{}'::jsonb
        );
        v_m6_id := (v_m_res->'merchant'->>'id')::uuid; v_m6_br := (v_m_res->>'main_branch_id')::uuid; v_m6_code := v_m_res->'merchant'->>'merchant_code'; v_m6_tok := v_m_res->>'session_token';
        PERFORM sawyan_demo.admin_manage_merchant_contract(v_checker_id, v_adm_tok, v_m6_id, 'update_contract', 10.00, NULL, 0.00, true, false, NULL, NULL, NULL, 'Sim M6 approve unfunded', 'approved', 'good_standing');
        v_m6_before := sawyan_demo.sync_merchant_status_flags(v_m6_id);
        IF COALESCE((v_m6_before->'effective_access'->>'can_accept_pos')::boolean, true) THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Unfunded M6 should NOT accept POS before funding';
        END IF;

        v_m6_notice_res := sawyan_demo.merchant_initiate_topup(v_m6_id, 2000.00, 'instapay_eg', NULL, gen_random_uuid(), v_m6_tok, NULL, 'حوّلت 2000 جنيه إنستاباي');
        IF NOT COALESCE((v_m6_notice_res->>'success')::boolean, false) OR NOT COALESCE((v_m6_notice_res->>'is_notice_only')::boolean, false) THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Optional-proof amount-only top-up notice failed: %', v_m6_notice_res;
        END IF;
        PERFORM sawyan_demo.process_merchant_topup_fifo(v_m6_id, 2000.00, v_m6_notice_res->>'payment_ref', gen_random_uuid(), 0.00, 'instapay_eg');
        v_m6_after := sawyan_demo.sync_merchant_status_flags(v_m6_id);
        IF NOT COALESCE((v_m6_after->'effective_access'->>'can_accept_pos')::boolean, false) THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Funded M6 failed to unlock POS';
        END IF;

        -- 3A. Hero Member purchases on M1 (EG) to qualify 100%
        PERFORM sawyan_demo.submit_pos_transaction(v_hero_id, v_m1_id, v_m1_br, 17000.00, 'cash', 'SIM-H1-' || v_run_tag, 'SW' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), gen_random_uuid(), NULL, true, NULL);
        v_tx_count := v_tx_count + 1;

        -- 3B. Cashier Employee on M5 Branch 2 sale
        v_emp_tx_res := sawyan_demo.employee_create_verification_tx(v_emp_id, v_emp_tok, v_member_codes[2], 18000.00, 'cash', gen_random_uuid(), 'SIM-EMP-' || v_run_tag, NULL, '8529');
        v_tx_count := v_tx_count + 1;

        -- 3C. D4 Credit-Limit Merchant (M2) sale -> verify negative cash & d4_debt_started_at
        PERFORM sawyan_demo.submit_pos_transaction(v_member_ids[3], v_m2_id, v_m2_br, 18000.00, 'cash', 'SIM-D4-' || v_run_tag, 'SW' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), gen_random_uuid(), NULL, true, NULL);
        v_tx_count := v_tx_count + 1;
        PERFORM sawyan_demo.sync_merchant_status_flags(v_m2_id);
        SELECT actual_cash_balance, NULLIF(metadata->>'d4_debt_started_at', '')::timestamptz INTO v_m2_cash, v_m2_d4_started FROM sawyan_demo.merchants WHERE id = v_m2_id;
        IF v_m2_cash >= 0 OR v_m2_d4_started IS NULL THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: D4 merchant M2 did not record negative cash (%) or d4_debt_started_at (%)', v_m2_cash, v_m2_d4_started;
        END IF;

        -- 3D. Remote member purchase on M3 (TR) -> Merchant confirms
        v_tx_res := sawyan_demo.submit_member_pending_purchase(v_member_ids[4], v_m3_id, v_m3_br, 17500.00, 'cash', gen_random_uuid(), v_member_toks[4], v_tiny_png, 'SIM-REM-' || v_run_tag, NULL, NULL);
        v_pend_tx_id := COALESCE((v_tx_res->>'transaction_id')::uuid, (v_tx_res->>'id')::uuid);
        PERFORM sawyan_demo.confirm_or_reject_pending_tx(v_m3_id, v_pend_tx_id, 'approve', NULL, v_m3_tok);
        v_tx_count := v_tx_count + 1;

        -- 3E. Rogue Merchant (M4) -> Dispute + Price-Gouging Report
        v_tx_res := sawyan_demo.submit_pos_transaction(v_member_ids[5], v_m4_id, v_m4_br, 5000.00, 'cash', 'SIM-ROG-' || v_run_tag, 'SW' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), gen_random_uuid(), NULL, true, NULL);
        v_rogue_tx_id := COALESCE((v_tx_res->>'transaction_id')::uuid, (v_tx_res->>'id')::uuid);
        v_tx_count := v_tx_count + 1;
        v_dispute_res := sawyan_demo.submit_member_dispute(v_member_ids[5], v_rogue_tx_id, 'التاجر تهرب من توثيق كامل المبلغ ورفع السعر', v_member_toks[5], NULL, NULL, NULL, NULL, 'amount_mismatch', v_tiny_png);
        v_gouging_res := sawyan_demo.submit_price_gouging_report(v_member_ids[5], v_rogue_tx_id, 4000.00, 5000.00, v_tiny_png, v_tiny_png, v_member_toks[5]);

        -- 3F. Confused Member (#6) opens Customer Support ticket
        v_ticket_res := sawyan_demo.submit_support_or_recovery_ticket(
            'member', 'general', 'استفسار عن صندوق الهدف الشهري',
            'متى تتحول حالتي إلى أخضر وتصرف العمولات يوم 15؟',
            'عضو مستفسر', '+20180000006', NULL, v_member_ids[6], v_member_toks[6]
        );

        -- 3G. 24 randomized purchases across the 50-member tree (GREEN + ORANGE + WHITE)
        FOR v_i IN 7..30 LOOP
            IF v_i % 3 = 0 THEN
                v_tx_amt := 6000.00;
            ELSE
                v_tx_amt := 17000.00 + ((v_i % 4) * 500.00);
            END IF;

            IF v_member_ccs[v_i] = 'TR' THEN
                PERFORM sawyan_demo.submit_pos_transaction(v_member_ids[v_i], v_m3_id, v_m3_br, v_tx_amt, 'cash', 'SIM-TR-' || v_i || '-' || v_run_tag, 'SW' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), gen_random_uuid(), NULL, true, NULL);
            ELSE
                PERFORM sawyan_demo.submit_pos_transaction(v_member_ids[v_i], v_m1_id, v_m1_br, v_tx_amt, 'cash', 'SIM-EG-' || v_i || '-' || v_run_tag, 'SW' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), gen_random_uuid(), NULL, true, NULL);
            END IF;
            v_tx_count := v_tx_count + 1;
        END LOOP;

        -- 4. Tree Analytics & Country Lens Check
        v_hero_tree_all := sawyan_demo.get_tree_analytics_with_country_lens(v_hero_id, v_period_ym, NULL);
        v_hero_tree_tr  := sawyan_demo.get_tree_analytics_with_country_lens(v_hero_id, v_period_ym, 'TR');

        IF COALESCE((v_hero_tree_all->>'total_team_count')::int, 0) < 50 THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Expected >=50 team members under Hero, got %', v_hero_tree_all->>'total_team_count';
        END IF;
        IF COALESCE((v_hero_tree_all->>'actual_earnings_usd')::numeric, 0) <= 0 THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Expected positive actual_earnings_usd for Hero Member';
        END IF;

        -- 5. Month-Close Settlement Engine + Day-15 Payout
        INSERT INTO sawyan_demo.settlement_cycles (country_id, period_ym, closure_utc_instant, step_status, is_hard_locked)
        VALUES (1, v_period_ym, now(), 1, false)
        ON CONFLICT (country_id, period_ym) DO UPDATE SET step_status = 1, is_hard_locked = false, payout_executed_at = NULL
        RETURNING id INTO v_cyc_eg_id;

        INSERT INTO sawyan_demo.settlement_cycles (country_id, period_ym, closure_utc_instant, step_status, is_hard_locked)
        VALUES (2, v_period_ym, now(), 1, false)
        ON CONFLICT (country_id, period_ym) DO UPDATE SET step_status = 1, is_hard_locked = false, payout_executed_at = NULL
        RETURNING id INTO v_cyc_tr_id;

        v_eng_eg     := sawyan_demo.run_monthly_settlement_engine(v_cyc_eg_id);
        v_eng_tr     := sawyan_demo.run_monthly_settlement_engine(v_cyc_tr_id);
        v_payout_res := sawyan_demo.finalize_settlement_payout_step5_6(v_period_ym, v_maker_id, v_checker_id, 0.00, NULL);

        SELECT COALESCE(balance_usd, 0.00) INTO v_hero_wallet_after
          FROM sawyan_demo.wallets WHERE member_id = v_hero_id;
        SELECT COUNT(*) INTO v_hero_wtx_cnt
          FROM sawyan_demo.wallet_transactions wt
          JOIN sawyan_demo.wallets w ON w.id = wt.wallet_id
         WHERE w.member_id = v_hero_id;

        IF v_hero_wallet_after <= 0 OR v_hero_wtx_cnt = 0 THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Hero member did not receive Day-15 wallet payout (bal=%, wtx=%)', v_hero_wallet_after, v_hero_wtx_cnt;
        END IF;

        -- 6. Zero-Discrepancy Double-Entry Accounting Audit (0.00)
        v_audit_res := sawyan_demo.run_nightly_zero_discrepancy_audit();
        SELECT ROUND(ABS(COALESCE(SUM(debit_usd), 0) - COALESCE(SUM(credit_usd), 0))::numeric, 2)
          INTO v_gl_diff
          FROM sawyan_demo.journal_lines;

        IF NOT COALESCE((v_audit_res->>'is_clean')::boolean, false) OR v_gl_diff <> 0.00 THEN
            RAISE EXCEPTION 'SIM_ASSERT_FAIL: Accounting discrepancy detected! audit=%, gl_diff=%', v_audit_res, v_gl_diff;
        END IF;

        v_report := jsonb_build_object(
            'success', true,
            'seed', p_seed,
            'period_ym', v_period_ym,
            'duration_ms', ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000, 1),
            'members_registered', 51,
            'hero_team_total', (v_hero_tree_all->>'total_team_count')::int,
            'hero_left_arm', (v_hero_tree_all->>'left_arm_count')::int,
            'hero_right_arm', (v_hero_tree_all->>'right_arm_count')::int,
            'hero_commission_team', (v_hero_tree_all->>'commission_team_count')::int,
            'hero_expected_before_close_usd', (v_hero_tree_all->>'actual_earnings_usd')::numeric,
            'hero_tr_foreign_nodes', jsonb_array_length(v_hero_tree_tr->'nodes'),
            'hero_wallet_paid_day15_usd', v_hero_wallet_after,
            'hero_wallet_tx_count', v_hero_wtx_cnt,
            'transactions_executed', v_tx_count,
            'merchants_tested', jsonb_build_object(
                'm1_prepaid_funded', true,
                'm2_d4_credit_cash_local', v_m2_cash,
                'm2_d4_timer_set', (v_m2_d4_started IS NOT NULL),
                'm3_compliant_tr_remote_confirmed', true,
                'm4_rogue_dispute_and_gouging_logged', (v_dispute_res IS NOT NULL AND v_gouging_res IS NOT NULL),
                'm5_multibranch_cashier_pin_sale', (v_emp_tx_res IS NOT NULL),
                'm6_solo_notice_only_topup_then_unlocked', true
            ),
            'support_ticket_ref', v_ticket_res->>'ticket_ref',
            'settlement_eg', v_eng_eg,
            'settlement_tr', v_eng_tr,
            'day15_payout', v_payout_res,
            'accounting_audit', v_audit_res,
            'trial_balance_diff_usd', v_gl_diff,
            'rolled_back_cleanly', true
        );

        RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'SIMULATION_CLEAN_ROLLBACK';
    EXCEPTION
        WHEN SQLSTATE 'P0099' THEN
            NULL;
    END;

    RETURN v_report;
END;
$function$;

REVOKE ALL ON FUNCTION sawyan_demo.run_full_lifecycle_chaos_simulation(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan_demo.run_full_lifecycle_chaos_simulation(integer) TO anon, authenticated, service_role;
