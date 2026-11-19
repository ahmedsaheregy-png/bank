-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 PHASE 4.5 SECURITY LOCKDOWN & SETTLEMENT STEPS 5-6
-- Closes all 11 Forensic Audit Findings:
--   1. Revokes default PostgreSQL PUBLIC execute privileges on all schema functions
--   2. Implements Settlement Steps 5 & 6 (Zero-Discrepancy, IAS 21, S03 Pro-Rata,
--      WHT Tax, Double-Entry Wallet Crediting & Hard Lock)
--   3. Implements Member Payout Methods (72h Cooldown W07) & Withdrawal RPC (D7)
--   4. Implements S10 Price-Gouging Report RPC
-- ============================================================================

-- 1. الخطوتان 5 و6 من التسوية الشهرية: المطابقة الصفرية + IAS 21 + S03 + ترحيل المحافظ + Hard Lock (مع عزل الدول وفرز النزاعات 1-A)
DROP FUNCTION IF EXISTS sawyan.finalize_settlement_payout_step5_6(CHAR, UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION sawyan.finalize_settlement_payout_step5_6(
    p_period_ym          CHAR(7),
    p_maker_admin_id     UUID,
    p_checker_admin_id   UUID,
    p_ias21_fx_delta_usd NUMERIC(18,2) DEFAULT 0.00,
    p_country_code       CHAR(2) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_maker          sawyan.admins%ROWTYPE;
    v_checker        sawyan.admins%ROWTYPE;
    v_settings       sawyan.settings%ROWTYPE;
    v_target_cid     INT := NULL;
    v_target_cc      CHAR(2) := NULL;
    v_lock_rec       RECORD;
    v_pivot_rec      RECORD;
    v_cycle_cnt      INT := 0;
    v_sum_dr         NUMERIC(18,2);
    v_sum_cr         NUMERIC(18,2);
    v_bad_pools      INT := 0;
    v_ias_entry_id   UUID := NULL;
    v_comp_rec       RECORD;
    v_comp_je_id     UUID;
    v_round_rec      RECORD;
    v_tot_rounding   NUMERIC(18,2) := 0.00;
    v_round_je_id    UUID;
    v_ben_rec        RECORD;
    v_s03            JSONB;
    v_s03_item       JSONB;
    v_total_net      NUMERIC(18,2);
    v_payable        NUMERIC(18,2);
    v_excess         NUMERIC(18,2);
    v_res_country    sawyan.countries%ROWTYPE;
    v_wht_usd        NUMERIC(18,2);
    v_net_wallet     NUMERIC(18,2);
    v_dist_je_id     UUID;
    v_wallet_id      UUID;
    v_wtx_id         UUID;
    v_credited_cnt   INT := 0;
    v_credited_sum   NUMERIC(18,2) := 0.00;
BEGIN
    IF p_maker_admin_id IS NULL OR p_checker_admin_id IS NULL OR p_maker_admin_id = p_checker_admin_id THEN
        RAISE EXCEPTION 'MAKER_CHECKER_DISTINCT_ADMINS_REQUIRED';
    END IF;

    SELECT * INTO v_maker FROM sawyan.admins WHERE id = p_maker_admin_id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'MAKER_ADMIN_NOT_ACTIVE'; END IF;

    SELECT * INTO v_checker FROM sawyan.admins WHERE id = p_checker_admin_id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHECKER_ADMIN_NOT_ACTIVE'; END IF;

    IF NULLIF(upper(trim(COALESCE(p_country_code, ''))), '') IS NOT NULL
       AND upper(trim(p_country_code)) <> 'ALL'
    THEN
        SELECT id, country_code INTO v_target_cid, v_target_cc
          FROM sawyan.countries
         WHERE country_code = upper(trim(p_country_code));
        IF NOT FOUND THEN
            RAISE EXCEPTION 'COUNTRY_NOT_FOUND: %', p_country_code;
        END IF;
    END IF;

    -- ترتيب الأقفال الموحد (T04): قراءة المعرّفات بلا قفل -> pg_advisory_xact_lock مرتباً -> FOR UPDATE
    FOR v_lock_rec IN
        SELECT country_id, period_ym
          FROM sawyan.settlement_cycles
         WHERE period_ym = p_period_ym
           AND step_status = 4
           AND is_hard_locked = false
           AND payout_executed_at IS NULL
           AND (v_target_cid IS NULL OR country_id = v_target_cid)
         ORDER BY country_id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(hashtext('sawyan_period_lock_' || v_lock_rec.country_id::text || '_' || v_lock_rec.period_ym));
    END LOOP;

    PERFORM 1
      FROM sawyan.settlement_cycles
     WHERE period_ym = p_period_ym
       AND (v_target_cid IS NULL OR country_id = v_target_cid)
     FOR UPDATE;

    SELECT COUNT(*) INTO v_cycle_cnt
      FROM sawyan.settlement_cycles
     WHERE period_ym = p_period_ym
       AND step_status = 4
       AND is_hard_locked = false
       AND payout_executed_at IS NULL
       AND (v_target_cid IS NULL OR country_id = v_target_cid);

    IF v_cycle_cnt = 0 THEN
        RAISE EXCEPTION 'NO_STEP4_OPEN_CYCLES_FOR_PERIOD: %', p_period_ym;
    END IF;

    -- رفض الصرف إذا كانت المسودة موسومة بالحاجة لإعادة الحساب بعد مرتجع أو اعتماد Soft Hold متأخر (T03)
    IF EXISTS (
        SELECT 1
          FROM sawyan.settlement_cycles
         WHERE period_ym = p_period_ym
           AND is_hard_locked = false
           AND (v_target_cid IS NULL OR country_id = v_target_cid)
           AND recalc_required = true
    ) THEN
        RAISE EXCEPTION 'DRAFT_STALE_RECALC_REQUIRED: Settlement draft for period % requires recalculation before Step 5-6 payout.', p_period_ym;
    END IF;

    -- الفرز الذكي ثنائي الفئة للنزاعات قبل الصرف (الخيار 1-أ الموصى به بالإجماع 26/26):
    -- التذكرة غير الكاسرة للتأهل لا توقف الصرف؛ أما التذكرة الكاسرة للتأهل في الدولة المستهدفة (أو في دولة إقامة صاحب D1 بها) فتوقف زر الصرف لهذه الدولة المتأثرة فقط
    SELECT q.member_id, q.country_code, q.sample_dispute_id
      INTO v_pivot_rec
      FROM (
          SELECT t.member_id,
                 t.country_id,
                 c.country_code,
                 MIN(d.id::text) AS sample_dispute_id,
                 SUM(t.income_plan_share_usd) AS disputed_usd
            FROM sawyan.dispute_tickets d
            JOIN sawyan.transactions t ON t.id = d.transaction_id
            JOIN sawyan.countries c ON c.id = t.country_id
            JOIN sawyan.members mem ON mem.id = t.member_id
           WHERE d.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
             AND t.status = 'completed'
             AND d.dispute_category IN ('return_stalled', 'merchant_return_escalation')
             AND COALESCE(t.commission_snapshot->>'effective_period_ym',
                          to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')) = p_period_ym
             AND (
                 v_target_cid IS NULL
                 OR t.country_id = v_target_cid
                 OR (
                     t.country_id = mem.residency_country_id
                     AND EXISTS (
                         SELECT 1
                           FROM sawyan.compensatory_settlements cs
                           JOIN sawyan.settlement_cycles sc ON sc.id = cs.settlement_cycle_id
                          WHERE sc.period_ym = p_period_ym
                            AND sc.country_id = v_target_cid
                            AND cs.member_id = mem.id
                     )
                 )
             )
           GROUP BY t.member_id, t.country_id, c.country_code
      ) q
      JOIN sawyan.monthly_target_boxes b
        ON b.member_id = q.member_id
       AND b.country_id = q.country_id
       AND b.period_ym = p_period_ym
     WHERE (b.carry_on_in_usd + b.current_month_purchases_usd) >= b.target_required_usd
       AND ((b.carry_on_in_usd + b.current_month_purchases_usd) - q.disputed_usd) < b.target_required_usd
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'QUALIFICATION_BREAKING_DISPUTE_OPEN: Resolve qualification-breaking return dispute [ticket=% member=% country=%] before releasing payout for period %.',
            v_pivot_rec.sample_dispute_id, v_pivot_rec.member_id, v_pivot_rec.country_code, p_period_ym;
    END IF;

    SELECT * INTO v_settings FROM sawyan.settings
     WHERE country_id IS NULL AND effective_from <= now()
     ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;

    -- بوابة المطابقة الصفرية الصارمة (Zero-Discrepancy Gate — D23 / D28)
    SELECT COALESCE(SUM(debit_usd), 0.00), COALESCE(SUM(credit_usd), 0.00)
      INTO v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines;
    IF v_sum_dr <> v_sum_cr THEN
        RAISE EXCEPTION 'ZERO_DISCREPANCY_LEDGER_IMBALANCE: dr=% cr=%', v_sum_dr, v_sum_cr;
    END IF;

    SELECT COUNT(*) INTO v_bad_pools
      FROM sawyan.pool_transactions pt
      JOIN sawyan.settlement_cycles sc ON sc.id = pt.settlement_cycle_id
     WHERE sc.period_ym = p_period_ym
       AND (v_target_cid IS NULL OR sc.country_id = v_target_cid)
       AND ROUND((pt.total_distributed_usd + pt.rounding_diff_usd)::numeric, 2) <> pt.target_consumed_usd;
    IF v_bad_pools > 0 THEN
        RAISE EXCEPTION 'ZERO_DISCREPANCY_POOL_MISMATCH: count=%', v_bad_pools;
    END IF;

    -- قيد إعادة تقييم العملات IAS 21 عند وجود فروق عملة (D28)
    IF COALESCE(p_ias21_fx_delta_usd, 0.00) <> 0.00 THEN
        INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
        VALUES ('IAS21_REVALUATION', gen_random_uuid(), v_target_cid, 1.000000, 'IAS 21 Period-End FX Revaluation: ' || p_period_ym || COALESCE(' (' || v_target_cc || ')', ''))
        RETURNING id INTO v_ias_entry_id;

        IF p_ias21_fx_delta_usd > 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code) VALUES
            (v_ias_entry_id, '1101', 'treasury', p_ias21_fx_delta_usd, 0.00, p_ias21_fx_delta_usd, 'USD'),
            (v_ias_entry_id, '4301', 'treasury', 0.00, p_ias21_fx_delta_usd, p_ias21_fx_delta_usd, 'USD');
        ELSE
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code) VALUES
            (v_ias_entry_id, '4301', 'treasury', ABS(p_ias21_fx_delta_usd), 0.00, ABS(p_ias21_fx_delta_usd), 'USD'),
            (v_ias_entry_id, '1101', 'treasury', 0.00, ABS(p_ias21_fx_delta_usd), ABS(p_ias21_fx_delta_usd), 'USD');
        END IF;
    END IF;

    -- قيود تسوية الأهداف التعويضية لحسابات الخزانة 4102 و4103 مع حارس منع التكرار (D1)
    FOR v_comp_rec IN
        SELECT cs.*
          FROM sawyan.compensatory_settlements cs
          JOIN sawyan.settlement_cycles sc ON sc.id = cs.settlement_cycle_id
         WHERE sc.period_ym = p_period_ym
           AND sc.is_hard_locked = false
           AND (v_target_cid IS NULL OR sc.country_id = v_target_cid)
           AND NOT EXISTS (
               SELECT 1 FROM sawyan.journal_entries je
                WHERE je.source_type = 'COMPENSATORY_SETTLEMENT' AND je.source_id = cs.id
           )
    LOOP
        IF (v_comp_rec.treasury_counterpart_usd + v_comp_rec.admin_fee_usd) > 0 THEN
            INSERT INTO sawyan.journal_entries (settlement_cycle_id, source_type, source_id, country_id, fx_rate_used, description)
            VALUES (v_comp_rec.settlement_cycle_id, 'COMPENSATORY_SETTLEMENT', v_comp_rec.id, v_comp_rec.foreign_country_id, 1.000000, 'Compensatory Treasury & Admin Share')
            RETURNING id INTO v_comp_je_id;

            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code) VALUES
            (v_comp_je_id, '2201', 'member', v_comp_rec.member_id, v_comp_rec.treasury_counterpart_usd + v_comp_rec.admin_fee_usd, 0.00, v_comp_rec.treasury_counterpart_usd + v_comp_rec.admin_fee_usd, 'USD'),
            (v_comp_je_id, '4102', 'treasury', NULL, 0.00, v_comp_rec.treasury_counterpart_usd, v_comp_rec.treasury_counterpart_usd, 'USD');

            IF v_comp_rec.admin_fee_usd > 0 THEN
                INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code) VALUES
                (v_comp_je_id, '4103', 'treasury', 0.00, v_comp_rec.admin_fee_usd, v_comp_rec.admin_fee_usd, 'USD');
            END IF;
        END IF;
    END LOOP;

    -- قيد فروق التقريب من القطع TRUNC لكل دورة مع حارس منع التكرار إلى حساب 4301 (D11 / F07)
    FOR v_round_rec IN
        SELECT sc.id AS cycle_id, sc.country_id,
               COALESCE(ROUND(SUM(pt.rounding_diff_usd)::numeric, 2), 0.00) AS rsum
          FROM sawyan.settlement_cycles sc
          JOIN sawyan.pool_transactions pt ON pt.settlement_cycle_id = sc.id
         WHERE sc.period_ym = p_period_ym
           AND sc.is_hard_locked = false
           AND (v_target_cid IS NULL OR sc.country_id = v_target_cid)
           AND NOT EXISTS (
               SELECT 1 FROM sawyan.journal_entries je
                WHERE je.settlement_cycle_id = sc.id AND je.source_type = 'ROUNDING_ADJUSTMENT'
           )
         GROUP BY sc.id, sc.country_id
    LOOP
        IF v_round_rec.rsum > 0 THEN
            INSERT INTO sawyan.journal_entries (settlement_cycle_id, source_type, source_id, country_id, fx_rate_used, description)
            VALUES (v_round_rec.cycle_id, 'ROUNDING_ADJUSTMENT', gen_random_uuid(), v_round_rec.country_id, 1.000000, 'TRUNC Cent Remainders to 4301: ' || p_period_ym)
            RETURNING id INTO v_round_je_id;

            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code) VALUES
            (v_round_je_id, '2201', 'treasury', v_round_rec.rsum, 0.00, v_round_rec.rsum, 'USD'),
            (v_round_je_id, '4301', 'treasury', 0.00, v_round_rec.rsum, v_round_rec.rsum, 'USD');

            v_tot_rounding := v_tot_rounding + v_round_rec.rsum;
        END IF;
    END LOOP;

    -- ترحيل صافي أرباح المستفيدين بعد تطبيق S03 Pro-Rata وضريبة المنبع WHT إلى المحافظ (يوم 15)
    FOR v_ben_rec IN
        SELECT DISTINCT cd.beneficiary_id, m.residency_country_id
          FROM sawyan.commission_distributions cd
          JOIN sawyan.pool_transactions pt ON pt.id = cd.pool_transaction_id
          JOIN sawyan.settlement_cycles sc ON sc.id = pt.settlement_cycle_id
          JOIN sawyan.members m ON m.id = cd.beneficiary_id
         WHERE sc.period_ym = p_period_ym
           AND (v_target_cid IS NULL OR sc.country_id = v_target_cid)
           AND cd.added_to_wallet = false
    LOOP
        v_s03 := sawyan.calculate_s03_pro_rata_payout(v_ben_rec.beneficiary_id, p_period_ym);
        IF v_target_cid IS NULL THEN
            v_total_net := COALESCE((v_s03->>'total_net_usd')::numeric(18,2), 0.00);
            v_payable   := COALESCE((v_s03->>'payable_usd')::numeric(18,2), 0.00);
            v_excess    := COALESCE((v_s03->>'s03_suspense_excess_usd')::numeric(18,2), 0.00);
        ELSE
            SELECT elem INTO v_s03_item
              FROM jsonb_array_elements(COALESCE(v_s03->'pro_rata_breakdown', '[]'::jsonb)) elem
             WHERE elem->>'country_code' = v_target_cc
             LIMIT 1;
            v_total_net := GREATEST(0.00, COALESCE((v_s03_item->>'gross_net_usd')::numeric(18,2), 0.00));
            v_payable   := GREATEST(0.00, COALESCE((v_s03_item->>'payable_usd')::numeric(18,2), 0.00));
            v_excess    := GREATEST(0.00, COALESCE((v_s03_item->>'s03_excess_usd')::numeric(18,2), 0.00));
        END IF;

        IF v_total_net > 0 THEN
            SELECT * INTO v_res_country FROM sawyan.countries WHERE id = v_ben_rec.residency_country_id;
            IF v_payable >= COALESCE(v_settings.wht_threshold_usd, 200.00) AND COALESCE(v_res_country.wht_rate, 0) > 0 THEN
                v_wht_usd := ROUND((v_payable * (v_res_country.wht_rate / 100.0))::numeric, 2);
            ELSE
                v_wht_usd := 0.00;
            END IF;
            v_net_wallet := v_payable - v_wht_usd;

            INSERT INTO sawyan.wallets (member_id) VALUES (v_ben_rec.beneficiary_id) ON CONFLICT (member_id) DO NOTHING;
            SELECT id INTO v_wallet_id FROM sawyan.wallets WHERE member_id = v_ben_rec.beneficiary_id FOR UPDATE;

            INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
            VALUES ('MONTHLY_DISTRIBUTION', v_ben_rec.beneficiary_id, COALESCE(v_target_cid, v_res_country.id), 1.000000, 'Day-15 Commission Release: ' || p_period_ym || COALESCE(' (' || v_target_cc || ')', ''))
            RETURNING id INTO v_dist_je_id;

            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_dist_je_id, '2201', 'member', v_ben_rec.beneficiary_id, v_total_net, 0.00, v_total_net, 'USD');

            IF v_net_wallet > 0 THEN
                INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
                VALUES (v_dist_je_id, '2302', 'member', v_ben_rec.beneficiary_id, 0.00, v_net_wallet, v_net_wallet, 'USD');
            END IF;
            IF v_excess > 0 THEN
                INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
                VALUES (v_dist_je_id, '2303', 'member', v_ben_rec.beneficiary_id, 0.00, v_excess, v_excess, 'USD');
            END IF;
            IF v_wht_usd > 0 THEN
                INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
                VALUES (v_dist_je_id, '2401', 'treasury', NULL, 0.00, v_wht_usd, v_wht_usd, 'USD');
            END IF;

            UPDATE sawyan.wallets
               SET balance_usd              = balance_usd + v_net_wallet,
                   s03_suspense_balance_usd = s03_suspense_balance_usd + v_excess,
                   total_earned_usd         = total_earned_usd + v_net_wallet,
                   updated_at               = now()
             WHERE id = v_wallet_id;

            INSERT INTO sawyan.wallet_transactions (
                wallet_id, transaction_type, amount_usd, currency_code, fx_rate_used, journal_entry_id, status
            ) VALUES (
                v_wallet_id, 'commission', v_net_wallet, 'USD', 1.000000, v_dist_je_id, 'available'
            ) RETURNING id INTO v_wtx_id;

            IF v_wht_usd > 0 THEN
                INSERT INTO sawyan.wallet_transactions (
                    wallet_id, transaction_type, amount_usd, currency_code, fx_rate_used, journal_entry_id, status
                ) VALUES (
                    v_wallet_id, 'wht_tax', v_wht_usd, 'USD', 1.000000, v_dist_je_id, 'completed'
                );
            END IF;

            UPDATE sawyan.commission_distributions cd
               SET added_to_wallet       = true,
                   wallet_transaction_id = v_wtx_id
              FROM sawyan.pool_transactions pt
              JOIN sawyan.settlement_cycles sc ON sc.id = pt.settlement_cycle_id
             WHERE cd.pool_transaction_id = pt.id
               AND sc.period_ym = p_period_ym
               AND (v_target_cid IS NULL OR sc.country_id = v_target_cid)
               AND cd.beneficiary_id = v_ben_rec.beneficiary_id
               AND cd.added_to_wallet = false;

            v_credited_cnt := v_credited_cnt + 1;
            v_credited_sum := v_credited_sum + v_net_wallet;
        END IF;
    END LOOP;

    -- القفل النهائي وختم الصرف القطعي غير القابل للإلغاء على المرتجعات (Step 6 Hard Lock — D5 + D28)
    UPDATE sawyan.settlement_cycles
       SET step_status                   = 6,
           zero_discrepancy_passed       = true,
           recalc_required               = false,
           ias21_fx_revaluation_entry_id = COALESCE(v_ias_entry_id, ias21_fx_revaluation_entry_id),
           maker_admin_id                = p_maker_admin_id,
           checker_admin_id              = p_checker_admin_id,
           is_hard_locked                = true,
           payout_executed_at            = COALESCE(payout_executed_at, now())
     WHERE period_ym = p_period_ym
       AND is_hard_locked = false
       AND (v_target_cid IS NULL OR country_id = v_target_cid);

    PERFORM sawyan.append_audit_log(
        'admin',
        p_checker_admin_id,
        'settlement_period_hard_locked_step6',
        'settlement_cycles',
        COALESCE(v_target_cc || ':', '') || p_period_ym,
        jsonb_build_object('step_status', 4),
        jsonb_build_object('step_status', 6, 'country_code', COALESCE(v_target_cc, 'ALL'), 'credited_members', v_credited_cnt, 'total_net_credited_usd', v_credited_sum, 'maker_admin_id', p_maker_admin_id)
    );

    RETURN jsonb_build_object(
        'status', 'hard_locked_step_6',
        'period_ym', p_period_ym,
        'country_code', COALESCE(v_target_cc, 'ALL'),
        'cycles_locked', v_cycle_cnt,
        'credited_members_count', v_credited_cnt,
        'total_net_credited_usd', v_credited_sum,
        'rounding_posted_usd', v_tot_rounding
    );
END;
$$;

-- 2. إدارة وسائل استلام الأرباح مع تهدئة 72 ساعة إلزامية (W07 / D7)
CREATE OR REPLACE FUNCTION sawyan.manage_member_payout_method(
    p_member_id          UUID,
    p_action             VARCHAR(20),
    p_session_token      TEXT DEFAULT NULL,
    p_provider           VARCHAR(40) DEFAULT NULL,
    p_holder_name        VARCHAR(150) DEFAULT NULL,
    p_account_identifier TEXT DEFAULT NULL,
    p_method_id          UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member     sawyan.members%ROWTYPE;
    v_act        VARCHAR(20);
    v_cool_hours INT := 72;
    v_expires    TIMESTAMPTZ;
    v_clean_acc  TEXT;
    v_new_id     UUID;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    v_act := lower(trim(COALESCE(p_action, '')));

    IF v_act = 'add' THEN
        IF trim(COALESCE(p_provider, '')) = '' OR trim(COALESCE(p_holder_name, '')) = '' OR trim(COALESCE(p_account_identifier, '')) = '' THEN
            RAISE EXCEPTION 'PAYOUT_METHOD_FIELDS_REQUIRED';
        END IF;

        SELECT COALESCE(withdrawal_cooldown_hours, 72) INTO v_cool_hours
          FROM sawyan.settings
         WHERE (country_id = v_member.residency_country_id OR country_id IS NULL)
           AND effective_from <= now()
         ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

        v_expires   := now() + (v_cool_hours || ' hours')::interval;
        v_clean_acc := regexp_replace(trim(p_account_identifier), '\s+', '', 'g');

        INSERT INTO sawyan.payment_methods (
            member_id, provider, account_holder_name, provider_token_enc,
            last_four, is_verified, cooldown_expires_at
        ) VALUES (
            v_member.id,
            lower(trim(p_provider)),
            trim(p_holder_name),
            extensions.pgp_sym_encrypt(v_clean_acc, 'SAWYAN_VAULT_INTERNAL_V3'),
            right(v_clean_acc, 4),
            true,
            v_expires
        ) RETURNING id INTO v_new_id;

        UPDATE sawyan.members SET payout_cooldown_until = v_expires WHERE id = v_member.id;

        PERFORM sawyan.append_audit_log(
            'member', v_member.id, 'payout_method_added_72h_cooldown', 'payment_methods', v_new_id::text,
            NULL, jsonb_build_object('provider', lower(trim(p_provider)), 'last_four', right(v_clean_acc, 4), 'cooldown_expires_at', v_expires)
        );

        RETURN jsonb_build_object(
            'success', true,
            'method_id', v_new_id,
            'cooldown_expires_at', v_expires,
            'cooldown_hours', v_cool_hours
        );

    ELSIF v_act = 'delete' THEN
        DELETE FROM sawyan.payment_methods WHERE id = p_method_id AND member_id = v_member.id;
        RETURN jsonb_build_object('success', true, 'deleted_id', p_method_id);
    ELSE
        RAISE EXCEPTION 'INVALID_PAYOUT_METHOD_ACTION: %', p_action;
    END IF;
END;
$$;

-- 3. طلب سحب أرباح موثق بالهوية KYC + فحص تهدئة 72 ساعة + قيد يومية مزدوج (D7 / W07 / S05)
CREATE OR REPLACE FUNCTION sawyan.request_member_withdrawal(
    p_member_id         UUID,
    p_payment_method_id UUID,
    p_amount_usd        NUMERIC(18,2),
    p_idempotency_key   UUID,
    p_session_token     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member        sawyan.members%ROWTYPE;
    v_existing_idem sawyan.idempotency_keys%ROWTYPE;
    v_pm            sawyan.payment_methods%ROWTYPE;
    v_wallet        sawyan.wallets%ROWTYPE;
    v_je_id         UUID;
    v_wtx_id        UUID;
    v_res           JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
    END IF;

    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    IF v_member.kyc_status <> 'verified' THEN
        RAISE EXCEPTION 'KYC_VERIFICATION_REQUIRED_BEFORE_WITHDRAWAL';
    END IF;

    IF p_amount_usd IS NULL OR p_amount_usd < 10.00 THEN
        RAISE EXCEPTION 'MINIMUM_WITHDRAWAL_10_USD';
    END IF;

    SELECT * INTO v_pm FROM sawyan.payment_methods WHERE id = p_payment_method_id AND member_id = v_member.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYOUT_METHOD_NOT_FOUND';
    END IF;

    IF v_pm.cooldown_expires_at > now() OR (v_member.payout_cooldown_until IS NOT NULL AND v_member.payout_cooldown_until > now()) THEN
        RAISE EXCEPTION 'PAYOUT_METHOD_COOLDOWN_72H_ACTIVE: expires_at=%', GREATEST(v_pm.cooldown_expires_at, COALESCE(v_member.payout_cooldown_until, v_pm.cooldown_expires_at));
    END IF;

    SELECT * INTO v_wallet FROM sawyan.wallets WHERE member_id = v_member.id FOR UPDATE;
    IF NOT FOUND OR v_wallet.balance_usd < p_amount_usd THEN
        RAISE EXCEPTION 'INSUFFICIENT_WALLET_BALANCE: available=%', COALESCE(v_wallet.balance_usd, 0.00);
    END IF;

    INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
    VALUES (p_idempotency_key, v_member.id, 'request_member_withdrawal', encode(extensions.digest(p_payment_method_id::text || ':' || p_amount_usd::text, 'sha256'), 'hex'))
    ON CONFLICT (idempotency_key) DO NOTHING;

    UPDATE sawyan.wallets
       SET balance_usd = balance_usd - p_amount_usd,
           updated_at  = now()
     WHERE id = v_wallet.id;

    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('WITHDRAWAL', v_member.id, v_member.residency_country_id, 1.000000, 'Member Withdrawal Request via ' || v_pm.provider)
    RETURNING id INTO v_je_id;

    INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code) VALUES
    (v_je_id, '2302', 'member', v_member.id, p_amount_usd, 0.00, p_amount_usd, 'USD'),
    (v_je_id, '1102', 'psp', NULL, 0.00, p_amount_usd, p_amount_usd, 'USD');

    INSERT INTO sawyan.wallet_transactions (
        wallet_id, transaction_type, amount_usd, currency_code, fx_rate_used,
        journal_entry_id, reference_id, status
    ) VALUES (
        v_wallet.id, 'withdrawal', p_amount_usd, 'USD', 1.000000,
        v_je_id, v_pm.id, 'processing_payout'
    ) RETURNING id INTO v_wtx_id;

    PERFORM sawyan.append_audit_log(
        'member', v_member.id, 'member_withdrawal_requested', 'wallet_transactions', v_wtx_id::text,
        jsonb_build_object('balance_before', v_wallet.balance_usd),
        jsonb_build_object('amount_usd', p_amount_usd, 'balance_after', v_wallet.balance_usd - p_amount_usd, 'method_id', v_pm.id)
    );

    v_res := jsonb_build_object(
        'success', true,
        'wallet_transaction_id', v_wtx_id,
        'journal_entry_id', v_je_id,
        'amount_usd', p_amount_usd,
        'new_balance_usd', v_wallet.balance_usd - p_amount_usd,
        'status', 'processing_payout'
    );

    UPDATE sawyan.idempotency_keys SET response_status = 200, response_body = v_res WHERE idempotency_key = p_idempotency_key;
    RETURN v_res;
END;
$$;

-- 4. بلاغ رادار رفع الأسعار على الأعضاء (S10 — يطلق إشارة الغش عند 3 بلاغات موثقة)
CREATE OR REPLACE FUNCTION sawyan.submit_price_gouging_report(
    p_member_id       UUID,
    p_transaction_id  UUID,
    p_declared_price  NUMERIC(18,2),
    p_charged_price   NUMERIC(18,2),
    p_shelf_photo_url TEXT,
    p_receipt_url     TEXT,
    p_session_token   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member sawyan.members%ROWTYPE;
    v_tx     sawyan.transactions%ROWTYPE;
    v_rep_id UUID;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);

    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id AND member_id = v_member.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    IF p_declared_price IS NULL OR p_declared_price <= 0 OR p_charged_price IS NULL OR p_charged_price <= p_declared_price THEN
        RAISE EXCEPTION 'CHARGED_PRICE_MUST_EXCEED_DECLARED_PRICE';
    END IF;

    IF trim(COALESCE(p_shelf_photo_url, '')) = '' OR trim(COALESCE(p_receipt_url, '')) = '' THEN
        RAISE EXCEPTION 'SHELF_AND_RECEIPT_PHOTOS_REQUIRED';
    END IF;

    INSERT INTO sawyan.price_gouging_reports (
        transaction_id, member_id, merchant_id, shelf_price_photo_url, receipt_photo_url,
        declared_price, charged_price, verification_status
    ) VALUES (
        v_tx.id, v_member.id, v_tx.merchant_id, trim(p_shelf_photo_url), trim(p_receipt_url),
        p_declared_price, p_charged_price, 'pending'
    ) RETURNING id INTO v_rep_id;

    RETURN jsonb_build_object('success', true, 'report_id', v_rep_id, 'status', 'pending');
END;
$$;

-- ============================================================================
-- 5. STRICT LEAST-PRIVILEGE LOCKDOWN ON ALL SCHEMA FUNCTIONS (CLOSES AUDIT #1)
-- ============================================================================

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sawyan FROM PUBLIC, anon, authenticated;

-- أ) الدوال العامة المصرح بها للزوار والأعضاء (قراءة عامة مقنّعة + تسجيل ودخول)
GRANT EXECUTE ON FUNCTION sawyan.sanitize_csv_cell(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.public_verify_transaction(VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.lookup_sponsor_by_code(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_public_merchants_catalog(CHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchants_radar(NUMERIC, NUMERIC, NUMERIC, CHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.register_new_member(VARCHAR, VARCHAR, BIGINT, TEXT, CHAR, CHAR, BIGINT, VARCHAR, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_member_login(TEXT, TEXT) TO anon, authenticated, service_role;

-- ب) دوال العضو المحمية داخلياً بفحص الجلسة الإلزامي (verify_member_session)
GRANT EXECUTE ON FUNCTION sawyan.get_member_dashboard_bundle(UUID, TEXT, CHAR, CHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.cancel_member_pending_purchase(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.manage_member_crm_contact(UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_dispute(UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, TEXT, SMALLINT, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.preview_pos_return_impact(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.member_respond_pos_return(UUID, UUID, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_review(UUID, UUID, SMALLINT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.update_member_profile_settings(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, NUMERIC, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.manage_member_payout_method(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.request_member_withdrawal(UUID, UUID, NUMERIC, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_price_gouging_report(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ج) دالة RLS المساعدة للجلسات المصادق عليها فقط
GRANT EXECUTE ON FUNCTION sawyan.current_member_id() TO authenticated, service_role;

-- د) كافة دوال المحرك الداخلي والإقفال والشحن والـ Webhooks محصورة بـ service_role فقط
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO service_role;
