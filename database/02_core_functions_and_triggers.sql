-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.1 CORE ENGINE (POSTGRESQL STORED FUNCTIONS & TRIGGERS)
-- Constitutional Reference: الملف_التقني_للمطورين.md (Chapters 4, 5, 6, 7 & 11)
-- Golden Vectors Supported: V1-V9 & GV01-GV10 (100% Server-Side Enforcement D21)
-- ============================================================================

-- Schema-locked UTC clock helper: evaluates to constant pg_catalog.now() in `sawyan` and `sawyan_demo`,
-- and honors session-local QA clock overrides strictly inside ephemeral `sawyan_qa*` test schemas.
CREATE OR REPLACE FUNCTION sawyan.now_utc() RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN left('sawyan.countries', 9) = 'sawyan_qa'
             AND session_user IN ('postgres', 'supabase_admin')
             AND NULLIF(current_setting('sawyan.qa_fixed_now_utc', true), '') IS NOT NULL
        THEN current_setting('sawyan.qa_fixed_now_utc', true)::timestamptz
        ELSE pg_catalog.now()
    END;
$$;

-- ============================================================================
-- 1. AUTO-PLACEMENT TRIGGER (G01-G05, Advisory Lock, Root #0 & Closure Table)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.auto_set_member_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_sponsor       sawyan.members%ROWTYPE;
    v_target_parent sawyan.members%ROWTYPE;
    v_chosen_side   VARCHAR(12);
    v_right_count   BIGINT := 0;
    v_left_count    BIGINT := 0;
    v_mc_approved   BOOLEAN := false;
BEGIN
    -- جذر الشركة (#0) استثناء تأسيسي وحيد (D22 + G04)
    IF NEW.member_code = 0 THEN
        NEW.parent_member_id   := NULL;
        NEW.sponsor_id         := NULL;
        NEW.generation_in_tree := 0;
        NEW.placement_side     := 'root_direct';
        RETURN NEW;
    END IF;

    -- رفض أي محاولة تسجيل بدون راعٍ (قاعدة دستورية قطعية: لا اشتراك بدون راعٍ)
    IF NEW.sponsor_id IS NULL THEN
        RAISE EXCEPTION 'SPONSOR_REQUIRED: Member cannot register without a valid sponsor_id.';
    END IF;

    -- قفل تزامن استشاري ذري لمنع سباق التسكين المتزامن (D22)
    PERFORM pg_advisory_xact_lock(hashtext('sawyan_tree_placement_' || NEW.sponsor_id::text));

    SELECT * INTO v_sponsor FROM sawyan.members WHERE id = NEW.sponsor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SPONSOR_NOT_FOUND: %', NEW.sponsor_id;
    END IF;

    -- التسكين المباشر المفتوح تحت جذر الشركة #0 يخضع لاعتماد مزدوج إجباري (Maker-Checker — D22 + D27)
    IF v_sponsor.member_code = 0 AND COALESCE(NEW.placement_side, '') = 'root_direct' THEN
        SELECT EXISTS (
            SELECT 1 FROM sawyan.maker_checker_requests
             WHERE action_type = 'ROOT_DIRECT_PLACEMENT'
               AND status = 'approved'
               AND target_id = NEW.member_code::text
               AND maker_admin_id <> checker_admin_id
        ) INTO v_mc_approved;

        IF NOT v_mc_approved AND COALESCE((NEW.metadata->>'seed_root_approved')::boolean, false) = false THEN
            RAISE EXCEPTION 'MAKER_CHECKER_REQUIRED_FOR_ROOT_0: Direct placement under Root #0 requires dual admin approval.';
        END IF;

        NEW.parent_member_id   := v_sponsor.id;
        NEW.placement_side     := 'root_direct';
        NEW.generation_in_tree := 1;
        RETURN NEW;
    END IF;

    -- فرض عدم السماح بتجاوز التسكين التلقائي يدوياً للأعضاء العاديين (G03)
    -- ملاحظة: للبيانات المرجعية أو المحاكاة الموثقة فقط يُسمح بتمرير explicit_parent_id في metadata إن لزم لاختبارات خاصة، وإلا فالتلقائي إلزامي
    IF NEW.parent_member_id IS NOT NULL AND COALESCE((NEW.metadata->>'allow_explicit_test_placement')::boolean, false) = true THEN
        SELECT * INTO v_target_parent FROM sawyan.members WHERE id = NEW.parent_member_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'EXPLICIT_PARENT_NOT_FOUND';
        END IF;
        NEW.generation_in_tree := v_target_parent.generation_in_tree + 1;
        IF NEW.placement_side IS NULL THEN
            NEW.placement_side := CASE WHEN v_target_parent.right_child_id IS NULL THEN 'right' ELSE 'left' END;
        END IF;
        RETURN NEW;
    END IF;

    -- خوارزمية التسكين الذرية الإجبارية G01-G05:
    -- 1. إذا كان للراعي مقعد شاغر مباشر (يمين أولاً G02)
    IF v_sponsor.right_child_id IS NULL OR v_sponsor.left_child_id IS NULL THEN
        SELECT * INTO v_target_parent FROM sawyan.members WHERE id = v_sponsor.id FOR UPDATE;
        v_chosen_side := CASE WHEN v_target_parent.right_child_id IS NULL THEN 'right' ELSE 'left' END;
    ELSE
        -- 2. قياس حجم الذراعين تحت الراعي لاختيار الذراع الأضعف (G01) وكسر التعادل يمين أولاً (G02)
        SELECT COUNT(*) INTO v_right_count
          FROM sawyan.tree_closure
         WHERE ancestor_id = v_sponsor.right_child_id;

        SELECT COUNT(*) INTO v_left_count
          FROM sawyan.tree_closure
         WHERE ancestor_id = v_sponsor.left_child_id;

        -- البحث بالعرض (BFS عبر tree_closure):
        -- 1) أقرب جيل 2) الذراع الأضعف 3) الأقل تفرعاً (0 أبناء قبل 1 ابن) 4) الأقدم (member_code ASC)
        SELECT m.* INTO v_target_parent
          FROM sawyan.tree_closure tc
          JOIN sawyan.members m ON m.id = tc.descendant_id
         WHERE tc.ancestor_id = CASE WHEN v_right_count <= v_left_count
                                     THEN v_sponsor.right_child_id
                                     ELSE v_sponsor.left_child_id END
           AND (m.left_child_id IS NULL OR m.right_child_id IS NULL)
           AND m.is_active_in_tree = true
         ORDER BY tc.depth ASC,
                  (CASE WHEN m.left_child_id IS NULL AND m.right_child_id IS NULL THEN 0 ELSE 1 END) ASC,
                  m.member_code ASC
         LIMIT 1
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NO_AVAILABLE_TREE_SLOT_UNDER_SPONSOR: %', NEW.sponsor_id;
        END IF;

        v_chosen_side := CASE WHEN v_target_parent.right_child_id IS NULL THEN 'right' ELSE 'left' END;
    END IF;

    NEW.parent_member_id   := v_target_parent.id;
    NEW.placement_side     := v_chosen_side;
    NEW.generation_in_tree := v_target_parent.generation_in_tree + 1;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.trg_after_member_insert_closure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_upline RECORD;
BEGIN
    -- 1. تحديث مؤشر الابن (يمين/يسار) عند الأب المباشر (لغير root_direct)
    IF NEW.parent_member_id IS NOT NULL THEN
        IF NEW.placement_side = 'right' THEN
            UPDATE sawyan.members SET right_child_id = NEW.id WHERE id = NEW.parent_member_id AND right_child_id IS NULL;
        ELSIF NEW.placement_side = 'left' THEN
            UPDATE sawyan.members SET left_child_id = NEW.id WHERE id = NEW.parent_member_id AND left_child_id IS NULL;
        END IF;
    END IF;

    -- 2. إدراج المسار الذاتي (depth = 0) ومسارات الأسلاف في sawyan.tree_closure
    INSERT INTO sawyan.tree_closure (ancestor_id, descendant_id, depth, root_arm_side)
    VALUES (NEW.id, NEW.id, 0, 'self')
    ON CONFLICT DO NOTHING;

    IF NEW.parent_member_id IS NOT NULL THEN
        INSERT INTO sawyan.tree_closure (ancestor_id, descendant_id, depth, root_arm_side)
        SELECT tc.ancestor_id,
               NEW.id,
               tc.depth + 1,
               CASE WHEN tc.depth = 0 THEN NEW.placement_side ELSE tc.root_arm_side END
          FROM sawyan.tree_closure tc
         WHERE tc.descendant_id = NEW.parent_member_id
        ON CONFLICT DO NOTHING;
    END IF;

    -- 3. إنشاء محفظة العضو تلقائياً
    INSERT INTO sawyan.wallets (member_id)
    VALUES (NEW.id)
    ON CONFLICT (member_id) DO NOTHING;

    -- 4. حدث الإشعار الفوري OnMemberRegistered مقيداً بالراعي والأب و10 أجيال هيكلية فقط (Point 10)
    IF NEW.member_code > 0 THEN
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        SELECT DISTINCT 'member', r.rec_id, 'OnMemberRegistered', 'in_app',
               jsonb_build_object('new_member_id', NEW.id, 'new_member_code', NEW.member_code, 'full_name', NEW.full_name)
          FROM (
              SELECT NEW.sponsor_id AS rec_id WHERE NEW.sponsor_id IS NOT NULL
              UNION
              SELECT NEW.parent_member_id AS rec_id WHERE NEW.parent_member_id IS NOT NULL
              UNION
              SELECT tc.ancestor_id AS rec_id
                FROM sawyan.tree_closure tc
                JOIN sawyan.members anc ON anc.id = tc.ancestor_id
               WHERE tc.descendant_id = NEW.id
                 AND tc.depth BETWEEN 1 AND 10
                 AND anc.member_code > 0
          ) r;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_member_placement ON sawyan.members;
CREATE TRIGGER trg_before_member_placement
    BEFORE INSERT ON sawyan.members
    FOR EACH ROW EXECUTE FUNCTION sawyan.auto_set_member_placement();

DROP TRIGGER IF EXISTS trg_after_member_closure ON sawyan.members;
CREATE TRIGGER trg_after_member_closure
    AFTER INSERT ON sawyan.members
    FOR EACH ROW EXECUTE FUNCTION sawyan.trg_after_member_insert_closure();

-- ============================================================================
-- 2. DEFAULT CAP RECALCULATION TRIGGER (D27 — NO FLOOR -> 4,605.75$)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.recalculate_default_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_unit_share_trunc NUMERIC(18,2);
    v_s01_gens         INTEGER;
    v_ideal_nodes      NUMERIC(24,0);
BEGIN
    IF NEW.cap_auto_calc = true THEN
        v_s01_gens         := GREATEST(COALESCE(NEW.numerical_stopper_s01, NEW.generations_count, 11), 1);
        v_unit_share_trunc := TRUNC(NEW.monthly_target_usd / GREATEST(NEW.upline_ceiling_s02, 1), 2);
        v_ideal_nodes      := (2::numeric ^ LEAST(v_s01_gens, 40)) - 1;
        NEW.cap_amount     := ROUND((v_ideal_nodes * v_unit_share_trunc)::numeric, 2);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settings_recalculate_cap ON sawyan.settings;
CREATE TRIGGER trg_settings_recalculate_cap
    BEFORE INSERT OR UPDATE ON sawyan.settings
    FOR EACH ROW EXECUTE FUNCTION sawyan.recalculate_default_cap();

-- ============================================================================
-- 3. REAL-TIME TARGET BOX FEEDER & ATOMIC QUOTA LOCK (D4, D8, D15, D19, D25)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.feed_monthly_target_box(
    p_transaction_id UUID,
    p_actor_id       UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_tx            sawyan.transactions%ROWTYPE;
    v_member        sawyan.members%ROWTYPE;
    v_merchant      sawyan.merchants%ROWTYPE;
    v_branch        sawyan.merchant_branches%ROWTYPE;
    v_country       sawyan.countries%ROWTYPE;
    v_settings      sawyan.settings%ROWTYPE;
    v_cashier       sawyan.cashier_employees%ROWTYPE;
    v_prev_status   VARCHAR(35);
    v_free_balance  NUMERIC(18,2);
    v_company_pct   NUMERIC(5,2);
    v_company_amt   NUMERIC(18,6);
    v_plan_local    NUMERIC(18,6);
    v_plan_usd      NUMERIC(18,6);
    v_debit_usd     NUMERIC(18,2);
    v_comp_usd_2    NUMERIC(18,2);
    v_plan_usd_2    NUMERIC(18,2);
    v_fx_diff_usd   NUMERIC(18,2);
    v_period_ym     CHAR(7);
    v_tx_ym         CHAR(7);
    v_curr_ym       CHAR(7);
    v_local_now     TIMESTAMP;
    v_past_cutoff   BOOLEAN := false;
    v_queue_count   INTEGER;
    v_free_pct      NUMERIC(5,2);
    v_branch_today  NUMERIC(18,2);
    v_in_tree       BOOLEAN := false;
    v_journal_id    UUID;
    v_vat_rate      NUMERIC(6,4);
    v_vat_amt_local NUMERIC(18,2);
    v_vat_amt_usd   NUMERIC(18,2);
    v_tax_inv_num   VARCHAR(50);
    v_tax_seq       BIGINT;
BEGIN
    -- 1. قفل صف الفاتورة
    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND: %', p_transaction_id;
    END IF;
    IF v_tx.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'already_completed', 'transaction_id', p_transaction_id);
    END IF;
    v_prev_status := v_tx.status;

    SELECT * INTO v_member   FROM sawyan.members WHERE id = v_tx.member_id;
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = v_tx.merchant_id FOR UPDATE;
    SELECT * INTO v_branch   FROM sawyan.merchant_branches WHERE id = v_tx.branch_id;
    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_tx.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_tx.country_id OR country_id IS NULL)
       AND effective_from <= v_tx.created_at
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    -- 2. حوكمة موظفي الكاشير وكاشف التواطؤ (D25 — V8)
    IF v_tx.cashier_employee_id IS NOT NULL THEN
        SELECT * INTO v_cashier FROM sawyan.cashier_employees WHERE id = v_tx.cashier_employee_id;
        IF FOUND THEN
            -- منع الموظف من التوثيق لحسابه الشخصي بـ PIN مع تحويل تنبيه فوري لصاحب المتجر
            IF v_cashier.linked_member_id IS NOT NULL AND v_cashier.linked_member_id = v_tx.member_id THEN
                UPDATE sawyan.transactions SET status = 'rejected' WHERE id = v_tx.id;
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                VALUES ('merchant', v_merchant.id, 'CashierSelfPinBlocked', 'in_app',
                        jsonb_build_object('transaction_id', v_tx.id, 'employee_id', v_cashier.id, 'employee_code', v_cashier.employee_code));
                RETURN jsonb_build_object('status', 'rejected_self_cashier_pin', 'transaction_id', v_tx.id, 'notified_merchant', true);
            END IF;

            -- فحص سقف المبلغ الاختياري للموظف
            IF v_cashier.max_tx_amount_limit IS NOT NULL AND v_tx.amount > v_cashier.max_tx_amount_limit THEN
                RAISE EXCEPTION 'CASHIER_TX_LIMIT_EXCEEDED';
            END IF;

            -- كاشف التواطؤ السري: إذا كان المشتري ضمن شجرة الموظف المرتبطة (D25)
            IF v_cashier.linked_member_id IS NOT NULL THEN
                SELECT EXISTS (
                    SELECT 1 FROM sawyan.tree_closure
                     WHERE (ancestor_id = v_cashier.linked_member_id AND descendant_id = v_tx.member_id AND depth > 0)
                        OR (ancestor_id = v_tx.member_id AND descendant_id = v_cashier.linked_member_id AND depth > 0)
                ) INTO v_in_tree;

                IF v_in_tree THEN
                    INSERT INTO sawyan.fraud_graph_signals (
                        signal_type, severity, involved_member_ids, involved_merchant_id, evidence_payload, status
                    ) VALUES (
                        'cashier_upline_collusion', 'medium', ARRAY[v_cashier.linked_member_id, v_tx.member_id],
                        v_merchant.id, jsonb_build_object('transaction_id', v_tx.id, 'employee_id', v_cashier.id), 'open'
                    );
                    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                    VALUES ('merchant', v_merchant.id, 'CashierTreeAlert', 'in_app',
                            jsonb_build_object('transaction_id', v_tx.id, 'employee_code', v_cashier.employee_code));
                END IF;
            END IF;
        END IF;
    END IF;

    -- 3. فحص السقف اليومي للفرع إن وُجد (تعدد الفروع)
    IF v_branch.daily_commission_cap_local IS NOT NULL THEN
        SELECT COALESCE(SUM(commission_amount), 0) INTO v_branch_today
          FROM sawyan.transactions
         WHERE branch_id = v_branch.id
           AND status = 'completed'
           AND (created_at AT TIME ZONE v_country.iana_timezone)::date = (v_tx.created_at AT TIME ZONE v_country.iana_timezone)::date;
        IF (v_branch_today + v_tx.commission_amount) > v_branch.daily_commission_cap_local THEN
            RAISE EXCEPTION 'BRANCH_DAILY_CAP_EXCEEDED: branch=%', v_branch.id;
        END IF;
    END IF;

    -- 4. فحص الرصيد الحر المتاح للتاجر الأم ذرياً (D4)
    v_free_balance := v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit;
    IF v_tx.status = 'pending' THEN
        -- استرداد ما حجزته هذه الفاتورة من Soft Hold إن كان محسوباً
        v_free_balance := v_free_balance + LEAST(v_merchant.soft_hold_balance, v_tx.commission_amount);
    END IF;

    IF v_free_balance < v_tx.commission_amount THEN
        SELECT COUNT(*) INTO v_queue_count
          FROM sawyan.transactions
         WHERE merchant_id = v_merchant.id AND status = 'awaiting_merchant_topup';

        IF v_queue_count >= v_settings.unsecured_queue_cap THEN
            RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
        END IF;

        UPDATE sawyan.transactions
           SET status = 'awaiting_merchant_topup'
         WHERE id = v_tx.id;

        -- عزل التاجر وفروعه عن الخريطة فوراً (D4 + V3)
        UPDATE sawyan.merchants
           SET is_isolated = true,
               soft_hold_balance = CASE WHEN v_tx.status = 'pending'
                                        THEN GREATEST(0, soft_hold_balance - v_tx.commission_amount)
                                        ELSE soft_hold_balance END
         WHERE id = v_merchant.id;

        RETURN jsonb_build_object('status', 'awaiting_merchant_topup', 'fifo_seq', v_tx.fifo_seq);
    END IF;

    -- 5. تقسيم العمولة الصافية بدقة NUMERIC(18,6) وسعر الصرف المثبت fx_rate_used (D8 + D11 + D19)
    v_company_pct := COALESCE(v_settings.company_percent, 25.00);
    v_company_amt := ROUND((v_tx.commission_amount * (v_company_pct / 100.0))::numeric, 6);
    v_plan_local  := v_tx.commission_amount - v_company_amt;
    v_plan_usd    := v_plan_local / v_tx.fx_rate_used;

    -- تحديد الشهر المحاسبي الفعلي (D4 + القرار #2):
    -- 1) طابور FIFO غير الممول يدخل دائماً في الشهر المفتوح وقت شحن التاجر
    -- 2) الفواتير المعلقة الممولة مسبقاً (Soft Hold) من آخر يوم تدخل شهر الشراء الفعلي إذا اعتُمدت قبل القطع/الصرف وإلا فالشهر المفتوح
    v_local_now := sawyan.now_utc() AT TIME ZONE v_country.iana_timezone;
    v_curr_ym   := to_char(v_local_now, 'YYYY-MM');
    v_tx_ym     := to_char(v_tx.created_at AT TIME ZONE v_country.iana_timezone, 'YYYY-MM');

    IF v_prev_status = 'awaiting_merchant_topup' THEN
        v_period_ym := v_curr_ym;
    ELSE
        SELECT (
            EXISTS (
                SELECT 1 FROM sawyan.settlement_cycles sc
                 WHERE sc.country_id = v_country.id
                   AND sc.period_ym = v_tx_ym
                   AND (sc.is_hard_locked IS TRUE OR sc.step_status >= 5 OR sc.payout_executed_at IS NOT NULL)
            )
            OR v_local_now >= ((to_date(v_tx_ym || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp + (v_country.return_cutoff_day || ' days')::interval)
        ) INTO v_past_cutoff;

        v_period_ym := CASE WHEN COALESCE(v_past_cutoff, false) THEN v_curr_ym ELSE v_tx_ym END;
    END IF;

    PERFORM pg_advisory_xact_lock_shared(hashtext('sawyan_period_lock_' || v_country.id::text || '_' || v_period_ym));

    -- 6. خصم الرصيد من التاجر الأم + فحص العزل بالنسب المئوية فقط (30/20/10 — D15)
    v_vat_rate      := COALESCE(v_country.vat_rate, 0.0000);
    v_vat_amt_local := ROUND((v_tx.commission_amount * (v_vat_rate / 100.0))::numeric, 2);
    v_vat_amt_usd   := ROUND((v_vat_amt_local / v_tx.fx_rate_used)::numeric, 2);

    UPDATE sawyan.merchants
       SET actual_cash_balance = actual_cash_balance - v_tx.commission_amount - v_vat_amt_local,
           soft_hold_balance   = CASE WHEN v_tx.status = 'pending'
                                      THEN GREATEST(0, soft_hold_balance - v_tx.commission_amount)
                                      ELSE soft_hold_balance END
     WHERE id = v_merchant.id
    RETURNING * INTO v_merchant;

    IF GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit) > 0 THEN
        v_free_pct := ((v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit)
                       / GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit)) * 100.0;
        IF v_free_pct <= v_settings.merchant_isolate_pct THEN
            UPDATE sawyan.merchants SET is_isolated = true WHERE id = v_merchant.id;
        END IF;
    END IF;

    -- 7. تغذية صندوق الهدف الشهري للعضو وتحديث حالة التأهل لحظياً (D23 + Real-Time S01 + حظر تأهيل Tombstone)
    INSERT INTO sawyan.monthly_target_boxes (
        member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd,
        is_qualified, qualification_source
    ) VALUES (
        v_tx.member_id, v_tx.country_id, v_period_ym, v_plan_usd, v_country.monthly_target_usd,
        ((v_plan_usd >= v_country.monthly_target_usd) AND NOT COALESCE(v_member.is_tombstone_banned, false)),
        CASE WHEN (v_plan_usd >= v_country.monthly_target_usd) AND NOT COALESCE(v_member.is_tombstone_banned, false) THEN 'local_purchases' ELSE 'none' END
    )
    ON CONFLICT (member_id, country_id, period_ym) DO UPDATE
       SET current_month_purchases_usd = sawyan.monthly_target_boxes.current_month_purchases_usd + EXCLUDED.current_month_purchases_usd,
           is_qualified = (((sawyan.monthly_target_boxes.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd + EXCLUDED.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                           AND NOT COALESCE(v_member.is_tombstone_banned, false)),
           qualification_source = CASE
               WHEN ((sawyan.monthly_target_boxes.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd + EXCLUDED.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                    AND NOT COALESCE(v_member.is_tombstone_banned, false)
               THEN CASE WHEN sawyan.monthly_target_boxes.carry_on_in_usd >= sawyan.monthly_target_boxes.target_required_usd THEN 'carry_on' ELSE 'local_purchases' END
               ELSE 'none'
           END;

    -- 8. قيد دفتر الأستاذ المزدوج (Immutable Double-Entry Ledger) مع تسوية أي فرق سنت FX وحماية الفواتير الصغيرة chk_debit_xor_credit
    v_debit_usd   := ROUND((v_tx.commission_amount / v_tx.fx_rate_used)::numeric, 2);
    v_comp_usd_2  := ROUND((v_company_amt / v_tx.fx_rate_used)::numeric, 2);
    v_plan_usd_2  := ROUND(v_plan_usd::numeric, 2);
    v_fx_diff_usd := v_debit_usd - (v_comp_usd_2 + v_plan_usd_2);

    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('INVOICE', v_tx.id, v_tx.country_id, v_tx.fx_rate_used, 'POS Verified Commission Split 25/75 + B2B Tax')
    RETURNING id INTO v_journal_id;

    IF (v_debit_usd + v_vat_amt_usd) > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '2101', 'merchant', v_merchant.id, v_debit_usd + v_vat_amt_usd, 0.00, v_tx.commission_amount + v_vat_amt_local, v_tx.currency_code);
    END IF;
    IF v_comp_usd_2 > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '4101', 'treasury', NULL, 0.00, v_comp_usd_2, v_company_amt, v_tx.currency_code);
    END IF;
    IF v_plan_usd_2 > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '2201', 'member', v_tx.member_id, 0.00, v_plan_usd_2, v_plan_local, v_tx.currency_code);
    END IF;

    IF v_vat_amt_usd > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '2402', 'treasury', NULL, 0.00, v_vat_amt_usd, v_vat_amt_local, v_tx.currency_code);
    END IF;

    IF v_fx_diff_usd > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '4301', 'treasury', NULL, 0.00, v_fx_diff_usd, ROUND((v_fx_diff_usd * v_tx.fx_rate_used)::numeric, 2), v_tx.currency_code);
    ELSIF v_fx_diff_usd < 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '4301', 'treasury', NULL, ABS(v_fx_diff_usd), 0.00, ROUND((ABS(v_fx_diff_usd) * v_tx.fx_rate_used)::numeric, 2), v_tx.currency_code);
    END IF;

    -- 9. إصدار الفاتورة الضريبية المزدوجة B2B Tax-Exclusive بقفل تسلسلي ذري (D19 + T04)
    PERFORM pg_advisory_xact_lock(hashtext('sawyan_tax_seq_' || v_country.id::text));
    SELECT COUNT(*) + 1 INTO v_tax_seq FROM sawyan.b2b_tax_invoices WHERE country_id = v_country.id;
    v_tax_inv_num := 'SAWYAN-TAX-' || v_country.country_code || '-' || replace(v_period_ym, '-', '') || '-' || LPAD(v_tax_seq::text, 6, '0');

    INSERT INTO sawyan.b2b_tax_invoices (
        invoice_number, document_type, merchant_id, branch_id, country_id, transaction_id,
        merchant_tax_reg_no, net_commission_amount, vat_rate_applied, vat_amount, gross_invoice_total,
        currency_code, fx_rate_used, journal_entry_id
    ) VALUES (
        v_tax_inv_num, 'tax_invoice', v_merchant.id, v_tx.branch_id, v_country.id, v_tx.id,
        v_merchant.tax_registration_no, ROUND(v_tx.commission_amount::numeric, 2), v_vat_rate, v_vat_amt_local,
        ROUND(v_tx.commission_amount::numeric, 2) + v_vat_amt_local,
        v_tx.currency_code, v_tx.fx_rate_used, v_journal_id
    );

    UPDATE sawyan.transactions
       SET status                  = 'completed',
           company_share           = v_company_amt,
           income_plan_share_local = v_plan_local,
           income_plan_share_usd   = v_plan_usd,
           vat_amount              = v_vat_amt_local,
           completed_at            = COALESCE(completed_at, sawyan.now_utc()),
           commission_snapshot     = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object('effective_period_ym', v_period_ym)
     WHERE id = v_tx.id;

    -- مزامنة الشهر الجديد ووسم المسودة بالحاجة لإعادة الحساب إذا اعتُمد طلب معلق (Soft Hold) لشهر سابق في الأيام 1-14
    IF v_period_ym < v_curr_ym THEN
        PERFORM sawyan.recalculate_target_box_and_cascade(v_tx.member_id, v_tx.country_id, v_period_ym, v_curr_ym);
        UPDATE sawyan.settlement_cycles
           SET recalc_required = true,
               zero_discrepancy_passed = false
         WHERE period_ym = v_period_ym
           AND is_hard_locked = false
           AND payout_executed_at IS NULL
           AND recalc_required = false
           AND (country_id = v_country.id OR v_country.id = v_member.residency_country_id);
    END IF;

    RETURN jsonb_build_object(
        'status', 'completed',
        'plan_added_usd', v_plan_usd,
        'b2b_tax_invoice_number', v_tax_inv_num,
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- ============================================================================
-- 4. MERCHANT TOP-UP, PSP RECONCILIATION & FIFO UN-ISOLATION (V3 + V9)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.process_merchant_topup_fifo(
    p_merchant_id     UUID,
    p_topup_amount    NUMERIC(18,2),
    p_payment_ref     VARCHAR,
    p_idempotency_key UUID,
    p_psp_fee         NUMERIC(18,2) DEFAULT 0.00,
    p_provider        VARCHAR DEFAULT 'bank_transfer'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing_idem  sawyan.idempotency_keys%ROWTYPE;
    v_merchant       sawyan.merchants%ROWTYPE;
    v_country        sawyan.countries%ROWTYPE;
    v_settings       sawyan.settings%ROWTYPE;
    v_queued_tx      RECORD;
    v_released_count INT := 0;
    v_remaining_q    INT := 0;
    v_free_pct       NUMERIC(5,2) := 0;
    v_fx_rate        NUMERIC(18,6) := 1.000000;
    v_journal_topup  UUID;
    v_journal_psp    UUID;
    v_gross_usd      NUMERIC(18,2);
    v_fee_usd        NUMERIC(18,2);
    v_net_usd        NUMERIC(18,2);
    v_res_body       JSONB;
BEGIN
    IF p_topup_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_TOPUP_AMOUNT';
    END IF;
    IF p_psp_fee < 0 OR p_psp_fee >= p_topup_amount THEN
        RAISE EXCEPTION 'INVALID_PSP_FEE';
    END IF;

    -- فحص منع التكرار Idempotency-Key (S05)
    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
    VALUES (p_idempotency_key, p_merchant_id, 'process_merchant_topup_fifo', encode(extensions.digest(p_payment_ref, 'sha256'), 'hex'))
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
        IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
            RETURN v_existing_idem.response_body;
        END IF;
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_merchant.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

    v_fx_rate := COALESCE((v_merchant.actual_cash_balance * 0) + NULLIF((SELECT fx_rate_used FROM sawyan.transactions WHERE merchant_id = p_merchant_id ORDER BY created_at DESC LIMIT 1), 0),
                          CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'EUR' THEN 0.92 ELSE 1.0 END);

    v_gross_usd := ROUND((p_topup_amount / v_fx_rate)::numeric, 2);
    v_fee_usd   := ROUND((p_psp_fee / v_fx_rate)::numeric, 2);
    v_net_usd   := v_gross_usd - v_fee_usd;

    -- قيد الشحن الأولي: Dr 1102 (قيد تسوية البوابة) / Cr 2101 (محفظة التاجر)
    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('MERCHANT_TOPUP', p_merchant_id, v_country.id, v_fx_rate, 'Merchant Prepaid Top-Up: ' || p_payment_ref)
    RETURNING id INTO v_journal_topup;

    INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
    VALUES
        (v_journal_topup, '1102', 'psp', NULL, v_gross_usd, 0.00, p_topup_amount, v_country.currency_code),
        (v_journal_topup, '2101', 'merchant', p_merchant_id, 0.00, v_gross_usd, p_topup_amount, v_country.currency_code);

    -- قيد تسوية البوابة والبنك: Dr 1101 (البنك الفعلي) + Dr 5301 (عمولة البوابة) / Cr 1102
    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('PSP_SETTLEMENT', p_merchant_id, v_country.id, v_fx_rate, 'PSP Batch Settlement Reconciliation: ' || p_payment_ref)
    RETURNING id INTO v_journal_psp;

    INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
    VALUES
        (v_journal_psp, '1101', 'treasury', NULL, v_net_usd, 0.00, p_topup_amount - p_psp_fee, v_country.currency_code),
        (v_journal_psp, '1102', 'psp', NULL, 0.00, v_gross_usd, p_topup_amount, v_country.currency_code);

    IF v_fee_usd > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_psp, '5301', 'treasury', NULL, v_fee_usd, 0.00, p_psp_fee, v_country.currency_code);
    END IF;

    INSERT INTO sawyan.psp_settlement_batches (
        provider, country_id, psp_payout_batch_ref, gross_collected_amount, psp_gateway_fee_amount,
        net_bank_deposited_amount, currency_code, fx_rate_used, reconciliation_status, discrepancy_amount,
        journal_entry_id, settled_at
    ) VALUES (
        p_provider, v_country.id, p_payment_ref, p_topup_amount, p_psp_fee,
        p_topup_amount - p_psp_fee, v_country.currency_code, v_fx_rate, 'matched_zero_diff', 0.00,
        v_journal_psp, now()
    );

    -- إضافة رصيد الشحن الفعلي للتاجر الأم
    UPDATE sawyan.merchants
       SET actual_cash_balance = actual_cash_balance + p_topup_amount,
           package_base_amount = GREATEST(package_base_amount, actual_cash_balance + p_topup_amount)
     WHERE id = p_merchant_id
    RETURNING * INTO v_merchant;

    -- تحرير الفواتير المعلقة بترتيب fifo_seq ASC فقط (Anti-Cherry-Picking — Point 3 / V3)
    FOR v_queued_tx IN
        SELECT id, commission_amount
          FROM sawyan.transactions
         WHERE merchant_id = p_merchant_id AND status = 'awaiting_merchant_topup'
         ORDER BY fifo_seq ASC
    LOOP
        SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
        IF (v_merchant.actual_cash_balance - v_merchant.soft_hold_balance) >= v_queued_tx.commission_amount THEN
            PERFORM sawyan.feed_monthly_target_box(v_queued_tx.id, p_merchant_id);
            v_released_count := v_released_count + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    -- فحص شرط رفع العزل الصارم: تصفير الطابور 100% + تجاوز عتبة العزل (10%)
    SELECT COUNT(*) INTO v_remaining_q
      FROM sawyan.transactions
     WHERE merchant_id = p_merchant_id AND status = 'awaiting_merchant_topup';

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit) > 0 THEN
        v_free_pct := ((v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit)
                       / GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit)) * 100.0;
    END IF;

    IF v_remaining_q = 0 AND v_free_pct > v_settings.merchant_isolate_pct THEN
        UPDATE sawyan.merchants SET is_isolated = false WHERE id = p_merchant_id;
    ELSE
        UPDATE sawyan.merchants SET is_isolated = true WHERE id = p_merchant_id;
    END IF;

    v_res_body := jsonb_build_object(
        'released_fifo_count', v_released_count,
        'remaining_queue', v_remaining_q,
        'free_balance_pct', ROUND(v_free_pct, 2),
        'is_isolated', NOT (v_remaining_q = 0 AND v_free_pct > v_settings.merchant_isolate_pct)
    );

    UPDATE sawyan.idempotency_keys
       SET response_status = 200, response_body = v_res_body
     WHERE idempotency_key = p_idempotency_key;

    RETURN v_res_body;
END;
$$;

-- ============================================================================
-- 5. ZERO-LIABILITY PRE-PAYOUT REVERSAL, CARRY-ON SHIELD & DAY-15 HARD BLOCK (D5)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.recalculate_target_box_and_cascade(
    p_member_id       UUID,
    p_country_id      INT,
    p_from_period_ym  CHAR(7),
    p_curr_period_ym  CHAR(7)
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_country       sawyan.countries%ROWTYPE;
    v_member        sawyan.members%ROWTYPE;
    v_box           sawyan.monthly_target_boxes%ROWTYPE;
    v_cur_ym        CHAR(7) := p_from_period_ym;
    v_next_ym       CHAR(7);
    v_purchases_sum NUMERIC(18,6);
    v_net_accum     NUMERIC(18,6);
    v_is_qual       BOOLEAN;
    v_qual_src      VARCHAR(20);
    v_carry_out     NUMERIC(18,6);
    v_consumed      NUMERIC(18,2);
    v_m_was_qual    BOOLEAN := false;
    v_m_now_qual    BOOLEAN := false;
    v_m_carry_out   NUMERIC(18,6) := 0.000000;
    v_m1_was_qual   BOOLEAN := false;
    v_m1_now_qual   BOOLEAN := false;
    v_m1_carry_in   NUMERIC(18,6) := 0.000000;
    v_step_idx      INT := 0;
BEGIN
    SELECT * INTO v_country FROM sawyan.countries WHERE id = p_country_id;
    SELECT * INTO v_member  FROM sawyan.members   WHERE id = p_member_id;

    PERFORM 1
      FROM sawyan.monthly_target_boxes
     WHERE member_id = p_member_id
       AND country_id = p_country_id
       AND period_ym >= p_from_period_ym
     ORDER BY period_ym ASC
     FOR UPDATE;

    LOOP
        v_step_idx := v_step_idx + 1;
        IF v_step_idx > 24 THEN
            RAISE EXCEPTION 'CASCADE_DEPTH_EXCEEDED: Target box cascade exceeded 24 months.';
        END IF;

        SELECT COALESCE(SUM(t.income_plan_share_usd), 0.000000)
          INTO v_purchases_sum
          FROM sawyan.transactions t
         WHERE t.member_id = p_member_id
           AND t.country_id = p_country_id
           AND t.status = 'completed'
           AND COALESCE(t.commission_snapshot->>'effective_period_ym',
                        to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE v_country.iana_timezone, 'YYYY-MM')) = v_cur_ym;

        INSERT INTO sawyan.monthly_target_boxes (
            member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd
        ) VALUES (
            p_member_id, p_country_id, v_cur_ym, v_purchases_sum, v_country.monthly_target_usd
        )
        ON CONFLICT (member_id, country_id, period_ym) DO NOTHING;

        SELECT * INTO v_box
          FROM sawyan.monthly_target_boxes
         WHERE member_id = p_member_id AND country_id = p_country_id AND period_ym = v_cur_ym
         FOR UPDATE;

        IF v_step_idx = 1 THEN
            v_m_was_qual := v_box.is_qualified;
        ELSIF v_step_idx = 2 THEN
            v_m1_was_qual := v_box.is_qualified;
        END IF;

        v_net_accum := v_box.carry_on_in_usd + v_purchases_sum;

        IF v_net_accum >= v_box.target_required_usd AND NOT COALESCE(v_member.is_tombstone_banned, false) THEN
            v_is_qual   := true;
            v_qual_src  := CASE
                               WHEN v_box.carry_on_in_usd >= v_box.target_required_usd THEN 'carry_on'
                               WHEN v_purchases_sum > 0 THEN 'local_purchases'
                               ELSE 'carry_on'
                           END;
            v_consumed  := CASE WHEN v_cur_ym < p_curr_period_ym THEN v_box.target_required_usd ELSE 0.00 END;
            v_carry_out := v_net_accum - v_box.target_required_usd;
        ELSE
            v_is_qual   := false;
            v_qual_src  := 'none';
            v_consumed  := 0.00;
            v_carry_out := GREATEST(0.000000, v_net_accum);
        END IF;

        v_next_ym := to_char((to_date(v_cur_ym || '-01', 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');

        IF v_cur_ym < p_curr_period_ym OR EXISTS (
            SELECT 1 FROM sawyan.monthly_target_boxes
             WHERE member_id = p_member_id AND country_id = p_country_id AND period_ym = v_next_ym
        ) THEN
            UPDATE sawyan.monthly_target_boxes
               SET current_month_purchases_usd = v_purchases_sum,
                   target_consumed_usd         = CASE WHEN v_is_qual THEN v_box.target_required_usd ELSE 0.00 END,
                   carry_on_out_usd            = v_carry_out,
                   is_qualified                = v_is_qual,
                   qualification_source        = v_qual_src
             WHERE id = v_box.id;

            IF v_step_idx = 1 THEN
                v_m_now_qual  := v_is_qual;
                v_m_carry_out := v_carry_out;
            ELSIF v_step_idx = 2 THEN
                v_m1_now_qual := v_is_qual;
                v_m1_carry_in := v_box.carry_on_in_usd;
            END IF;

            INSERT INTO sawyan.monthly_target_boxes (
                member_id, country_id, period_ym, carry_on_in_usd, target_required_usd,
                is_qualified, qualification_source
            ) VALUES (
                p_member_id, p_country_id, v_next_ym, v_carry_out, v_country.monthly_target_usd,
                (v_carry_out >= v_country.monthly_target_usd AND NOT COALESCE(v_member.is_tombstone_banned, false)),
                CASE
                    WHEN v_carry_out >= v_country.monthly_target_usd AND NOT COALESCE(v_member.is_tombstone_banned, false) THEN 'carry_on'
                    ELSE 'none'
                END
            )
            ON CONFLICT (member_id, country_id, period_ym) DO UPDATE
               SET carry_on_in_usd = EXCLUDED.carry_on_in_usd;

            v_cur_ym := v_next_ym;
        ELSE
            UPDATE sawyan.monthly_target_boxes
               SET current_month_purchases_usd = v_purchases_sum,
                   target_consumed_usd         = v_consumed,
                   carry_on_out_usd            = 0.000000,
                   is_qualified                = v_is_qual,
                   qualification_source        = v_qual_src
             WHERE id = v_box.id;

            IF v_step_idx = 1 THEN
                v_m_now_qual  := v_is_qual;
                v_m_carry_out := 0.000000;
            ELSIF v_step_idx = 2 THEN
                v_m1_now_qual := v_is_qual;
                v_m1_carry_in := v_box.carry_on_in_usd;
            END IF;
            EXIT;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'period_m_was_qualified', v_m_was_qual,
        'period_m_is_qualified', v_m_now_qual,
        'period_m_carry_on_out_usd', ROUND(v_m_carry_out::numeric, 6),
        'period_m1_was_qualified', v_m1_was_qual,
        'period_m1_is_qualified', v_m1_now_qual,
        'period_m1_carry_on_in_usd', ROUND(v_m1_carry_in::numeric, 6)
    );
END;
$$;

DROP FUNCTION IF EXISTS sawyan.process_transaction_reversal_clawback(UUID, VARCHAR, UUID, CHAR);

CREATE OR REPLACE FUNCTION sawyan.process_transaction_reversal_clawback(
    p_transaction_id  UUID,
    p_actor_id        UUID,
    p_reason          TEXT DEFAULT 'Statutory return within pre-payout window',
    p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing_idem    sawyan.idempotency_keys%ROWTYPE;
    v_tx_peek          RECORD;
    v_tx               sawyan.transactions%ROWTYPE;
    v_merchant         sawyan.merchants%ROWTYPE;
    v_member           sawyan.members%ROWTYPE;
    v_country          sawyan.countries%ROWTYPE;
    v_settings         sawyan.settings%ROWTYPE;
    v_cycle            sawyan.settlement_cycles%ROWTYPE;
    v_orig_je          sawyan.journal_entries%ROWTYPE;
    v_orig_tax         sawyan.b2b_tax_invoices%ROWTYPE;
    v_tx_period_ym     CHAR(7);
    v_curr_period_ym   CHAR(7);
    v_local_now        TIMESTAMP;
    v_next_month_start TIMESTAMP;
    v_cutoff_local_ts  TIMESTAMP;
    v_derived_phase    VARCHAR(20);
    v_journal_id       UUID;
    v_cn_num           VARCHAR(50);
    v_tax_seq          BIGINT;
    v_cascade_res      JSONB;
    v_queued_tx        RECORD;
    v_released_q       INT := 0;
    v_remaining_q      INT := 0;
    v_free_pct         NUMERIC(6,2) := 0.00;
    v_tot_usd          NUMERIC(18,2);
    v_comp_usd         NUMERIC(18,2);
    v_plan_usd         NUMERIC(18,2);
    v_vat_usd          NUMERIC(18,2);
    v_fx_diff          NUMERIC(18,2);
    v_res_body         JSONB;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_idem
          FROM sawyan.idempotency_keys
         WHERE idempotency_key = p_idempotency_key;
        IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
            RETURN v_existing_idem.response_body;
        END IF;

        INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
        VALUES (
            p_idempotency_key,
            p_actor_id,
            'process_transaction_reversal_clawback',
            encode(extensions.digest(p_transaction_id::text, 'sha256'), 'hex')
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        IF NOT FOUND THEN
            SELECT * INTO v_existing_idem
              FROM sawyan.idempotency_keys
             WHERE idempotency_key = p_idempotency_key;
            IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
                RETURN v_existing_idem.response_body;
            END IF;
        END IF;
    END IF;

    SELECT t.country_id, t.created_at, t.completed_at, t.commission_snapshot
      INTO v_tx_peek
      FROM sawyan.transactions t
     WHERE t.id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND: %', p_transaction_id;
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_tx_peek.country_id;
    v_tx_period_ym := COALESCE(
        v_tx_peek.commission_snapshot->>'effective_period_ym',
        to_char(COALESCE(v_tx_peek.completed_at, v_tx_peek.created_at) AT TIME ZONE v_country.iana_timezone, 'YYYY-MM')
    );

    -- قفل مشترك للدورة يمنع سباق الصرف/المحرك ولا يعطّل المرتجعات المتوازية (T04 Lock Order)
    PERFORM pg_advisory_xact_lock_shared(hashtext('sawyan_period_lock_' || v_country.id::text || '_' || v_tx_period_ym));

    SELECT * INTO v_cycle
      FROM sawyan.settlement_cycles
     WHERE country_id = v_country.id AND period_ym = v_tx_period_ym;

    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF v_tx.status = 'reversed' THEN
        RAISE EXCEPTION 'TX_ALREADY_REVERSED: %', p_transaction_id;
    END IF;
    IF v_tx.status <> 'completed' THEN
        RAISE EXCEPTION 'TX_NOT_REVERSIBLE: status=%', v_tx.status;
    END IF;

    v_local_now        := sawyan.now_utc() AT TIME ZONE v_country.iana_timezone;
    v_curr_period_ym   := to_char(v_local_now, 'YYYY-MM');
    v_next_month_start := (to_date(v_tx_period_ym || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp;
    v_cutoff_local_ts  := v_next_month_start + (v_country.return_cutoff_day || ' days')::interval;

    -- الحظر البرمجي القاطع لأي مرتجع بعد يوم الصرف (يوم 15) أو بعد تنفيذ الصرف الفعلي (D5 + T16)
    IF (v_cycle.id IS NOT NULL AND (
            v_cycle.is_hard_locked IS TRUE
            OR v_cycle.step_status >= 5
            OR v_cycle.payout_executed_at IS NOT NULL
            OR EXISTS (
                SELECT 1
                  FROM sawyan.commission_distributions cd
                  JOIN sawyan.pool_transactions pt ON pt.id = cd.pool_transaction_id
                 WHERE pt.settlement_cycle_id = v_cycle.id
                   AND cd.added_to_wallet IS TRUE
            )
       ))
       OR (v_local_now >= v_cutoff_local_ts)
    THEN
        RAISE EXCEPTION 'POST_PAYOUT_RETURN_FORBIDDEN: Returns for period % in country % are strictly prohibited after Day % cutoff / payout. Any commercial return accepted after Day % is borne 100%% by the merchant outside SAWYAN.',
            v_tx_period_ym, v_country.country_code, v_country.return_cutoff_day, v_country.payout_day;
    END IF;

    IF v_local_now < v_next_month_start THEN
        v_derived_phase := 'in_month';
    ELSE
        v_derived_phase := 'window_1_14';
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = v_tx.merchant_id FOR UPDATE;
    SELECT * INTO v_member   FROM sawyan.members   WHERE id = v_tx.member_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_country.id OR country_id IS NULL) AND effective_from <= sawyan.now_utc()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC LIMIT 1;

    UPDATE sawyan.merchants
       SET actual_cash_balance = actual_cash_balance + v_tx.commission_amount + v_tx.vat_amount
     WHERE id = v_merchant.id
    RETURNING * INTO v_merchant;

    -- تحرير أي فواتير عالقة بطابور طوارئ التاجر بالترتيب الزمني FIFO من الرصيد العائد (D4 + S10)
    FOR v_queued_tx IN
        SELECT id, commission_amount
          FROM sawyan.transactions
         WHERE merchant_id = v_merchant.id AND status = 'awaiting_merchant_topup'
         ORDER BY fifo_seq ASC
    LOOP
        SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = v_merchant.id;
        IF (v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit) >= v_queued_tx.commission_amount THEN
            PERFORM sawyan.feed_monthly_target_box(v_queued_tx.id, p_actor_id);
            v_released_q := v_released_q + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = v_merchant.id;
    SELECT COUNT(*) INTO v_remaining_q
      FROM sawyan.transactions
     WHERE merchant_id = v_merchant.id AND status = 'awaiting_merchant_topup';

    IF v_merchant.is_isolated AND v_remaining_q = 0 AND GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit) > 0 THEN
        v_free_pct := ((v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit)
                       / GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit)) * 100.0;
        IF v_free_pct > COALESCE(v_settings.merchant_isolate_pct, 10.00) THEN
            UPDATE sawyan.merchants SET is_isolated = false WHERE id = v_merchant.id;
        END IF;
    END IF;

    UPDATE sawyan.transactions
       SET status      = 'reversed',
           reversed_at = sawyan.now_utc()
     WHERE id = v_tx.id;

    -- إغلاق أي تذكرة نزاع مفتوحة على هذه الفاتورة تلقائياً منعاً للنزاعات المعلقة الوهمية (Zombie Disputes)
    UPDATE sawyan.dispute_tickets
       SET status             = 'resolved_member',
           appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
     WHERE transaction_id = v_tx.id
       AND status IN ('awaiting_merchant_friendly', 'escalated_to_admin');

    -- قيد عكسي مرآوي متطابق 100% مع قيد الفاتورة الأصلي (صفر تحمّل للخزانة 0.00$)
    SELECT * INTO v_orig_je
      FROM sawyan.journal_entries
     WHERE source_type = 'INVOICE' AND source_id = v_tx.id
     ORDER BY posted_at ASC LIMIT 1;

    INSERT INTO sawyan.journal_entries (
        settlement_cycle_id, source_type, source_id, country_id, fx_rate_used, reverses_entry_id, description
    ) VALUES (
        v_cycle.id, 'CLAWBACK_REVERSAL', v_tx.id, v_country.id, v_tx.fx_rate_used, v_orig_je.id,
        'Pre-Payout Invoice Reversal (' || v_derived_phase || '): ' || COALESCE(NULLIF(trim(p_reason), ''), v_tx.sw_short_code)
    ) RETURNING id INTO v_journal_id;

    IF v_orig_je.id IS NOT NULL THEN
        INSERT INTO sawyan.journal_lines (
            journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code
        )
        SELECT v_journal_id, jl.account_code, jl.entity_type, jl.entity_id,
               jl.credit_usd, jl.debit_usd, jl.amount_local, jl.currency_code
          FROM sawyan.journal_lines jl
         WHERE jl.journal_entry_id = v_orig_je.id;
    ELSE
        v_tot_usd  := ROUND((v_tx.commission_amount / v_tx.fx_rate_used)::numeric, 2);
        v_comp_usd := ROUND((v_tx.company_share / v_tx.fx_rate_used)::numeric, 2);
        v_plan_usd := ROUND(v_tx.income_plan_share_usd::numeric, 2);
        v_vat_usd  := ROUND((v_tx.vat_amount / v_tx.fx_rate_used)::numeric, 2);
        v_fx_diff  := v_tot_usd - (v_comp_usd + v_plan_usd);

        IF v_comp_usd > 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_journal_id, '4101', 'treasury', NULL, v_comp_usd, 0.00, v_tx.company_share, v_tx.currency_code);
        END IF;
        IF v_plan_usd > 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_journal_id, '2201', 'member', v_tx.member_id, v_plan_usd, 0.00, v_tx.income_plan_share_local, v_tx.currency_code);
        END IF;
        IF (v_tot_usd + v_vat_usd) > 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_journal_id, '2101', 'merchant', v_merchant.id, 0.00, v_tot_usd + v_vat_usd, v_tx.commission_amount + v_tx.vat_amount, v_tx.currency_code);
        END IF;
        IF v_vat_usd > 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_journal_id, '2402', 'treasury', v_vat_usd, 0.00, v_tx.vat_amount, v_tx.currency_code);
        END IF;
        IF v_fx_diff > 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_journal_id, '4301', 'treasury', v_fx_diff, 0.00, ROUND((v_fx_diff * v_tx.fx_rate_used)::numeric, 2), v_tx.currency_code);
        ELSIF v_fx_diff < 0 THEN
            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, debit_usd, credit_usd, amount_local, currency_code)
            VALUES (v_journal_id, '4301', 'treasury', 0.00, ABS(v_fx_diff), ROUND((ABS(v_fx_diff) * v_tx.fx_rate_used)::numeric, 2), v_tx.currency_code);
        END IF;
    END IF;

    -- درع الكاري أون والمزامنة المتسلسلة مع الشهر الجديد (Carry-On Shield M -> M+1)
    v_cascade_res := sawyan.recalculate_target_box_and_cascade(
        v_tx.member_id,
        v_tx.country_id,
        v_tx_period_ym,
        GREATEST(v_curr_period_ym, CASE WHEN v_derived_phase = 'window_1_14'
            THEN to_char(v_next_month_start, 'YYYY-MM') ELSE v_tx_period_ym END)
    );

    -- نمط التحديث المؤجل Lazy Dirty-Flag (T03/T04): وسم المسودات المتأثرة فقط بدل إعادة مسح الدولة داخل طلب الكاشير
    UPDATE sawyan.settlement_cycles
       SET recalc_required         = true,
           zero_discrepancy_passed = false
     WHERE period_ym = v_tx_period_ym
       AND is_hard_locked = false
       AND payout_executed_at IS NULL
       AND recalc_required = false
       AND (
           country_id = v_country.id
           OR (
               v_tx.country_id = v_member.residency_country_id
               AND (v_cascade_res->>'period_m_was_qualified')::boolean IS DISTINCT FROM (v_cascade_res->>'period_m_is_qualified')::boolean
           )
       );

    SELECT * INTO v_orig_tax
      FROM sawyan.b2b_tax_invoices
     WHERE transaction_id = v_tx.id AND document_type = 'tax_invoice'
     LIMIT 1;

    IF v_orig_tax.id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM sawyan.b2b_tax_invoices WHERE original_tax_invoice_id = v_orig_tax.id AND document_type = 'credit_note'
    ) THEN
        PERFORM pg_advisory_xact_lock(hashtext('sawyan_tax_seq_' || v_country.id::text));
        SELECT COUNT(*) + 1 INTO v_tax_seq FROM sawyan.b2b_tax_invoices WHERE country_id = v_country.id;
        v_cn_num := 'SAWYAN-CN-' || v_country.country_code || '-' || replace(v_curr_period_ym, '-', '') || '-' || LPAD(v_tax_seq::text, 6, '0');

        INSERT INTO sawyan.b2b_tax_invoices (
            invoice_number, document_type, original_tax_invoice_id, merchant_id, branch_id, country_id,
            transaction_id, settlement_cycle_id, merchant_tax_reg_no, net_commission_amount, vat_rate_applied,
            vat_amount, gross_invoice_total, currency_code, fx_rate_used, journal_entry_id
        ) VALUES (
            v_cn_num, 'credit_note', v_orig_tax.id, v_merchant.id, v_tx.branch_id, v_country.id,
            v_tx.id, v_cycle.id, v_merchant.tax_registration_no, -v_orig_tax.net_commission_amount, v_orig_tax.vat_rate_applied,
            -v_orig_tax.vat_amount, -v_orig_tax.gross_invoice_total, v_tx.currency_code, v_tx.fx_rate_used, v_journal_id
        );
    END IF;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES (
        'member',
        v_tx.member_id,
        'InvoiceReversedTargetBoxUpdated',
        'in_app',
        jsonb_build_object(
            'transaction_id', v_tx.id,
            'sw_short_code', v_tx.sw_short_code,
            'period_ym', v_tx_period_ym,
            'phase', v_derived_phase,
            'deducted_plan_usd', ROUND(v_tx.income_plan_share_usd::numeric, 2),
            'deducted_plan_local', ROUND(v_tx.income_plan_share_local::numeric, 2),
            'currency_code', v_tx.currency_code,
            'cascade', v_cascade_res
        )
    );

    IF COALESCE((v_cascade_res->>'period_m1_was_qualified')::boolean, false) IS TRUE
       AND COALESCE((v_cascade_res->>'period_m1_is_qualified')::boolean, false) IS FALSE
    THEN
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'member',
            v_tx.member_id,
            'NextMonthCarryOnDepletedAlert',
            'in_app',
            jsonb_build_object(
                'current_period_ym', v_curr_period_ym,
                'new_carry_on_in_usd', (v_cascade_res->>'period_m1_carry_on_in_usd')::numeric,
                'message_ar', 'تنبيه هام: استُهلك جزء من رصيد الكاري أون لتغطية مرتجع الشهر السابق، فأصبح صندوق الشهر الحالي بحاجة لاستكمال الهدف الشهري.'
            )
        );
    END IF;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES (
        'merchant',
        v_merchant.id,
        'PosReturnCreditNoteIssued',
        'in_app',
        jsonb_build_object(
            'transaction_id', v_tx.id,
            'sw_short_code', v_tx.sw_short_code,
            'refunded_commission_local', v_tx.commission_amount + v_tx.vat_amount,
            'credit_note_number', v_cn_num,
            'released_fifo_count', v_released_q
        )
    );

    PERFORM sawyan.append_audit_log(
        'system',
        p_actor_id,
        'transaction_reversed_' || v_derived_phase,
        'transactions',
        v_tx.id::text,
        jsonb_build_object('status', 'completed'),
        jsonb_build_object('status', 'reversed', 'phase', v_derived_phase, 'credit_note', v_cn_num, 'released_fifo', v_released_q, 'cascade', v_cascade_res)
    );

    v_res_body := jsonb_build_object(
        'status', 'reversed',
        'phase', v_derived_phase,
        'period_ym', v_tx_period_ym,
        'journal_entry_id', v_journal_id,
        'credit_note_number', v_cn_num,
        'released_fifo_count', v_released_q,
        'treasury_loss_usd', 0.00,
        'member_negative_balance_usd', 0.00,
        'uplines_delta_usd', 0.00,
        'box_cascade', v_cascade_res
    );

    IF p_idempotency_key IS NOT NULL THEN
        UPDATE sawyan.idempotency_keys
           SET response_status = 200, response_body = v_res_body
         WHERE idempotency_key = p_idempotency_key;
    END IF;

    RETURN v_res_body;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.now_utc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.now_utc() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION sawyan.recalculate_target_box_and_cascade(UUID, INT, CHAR, CHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.process_transaction_reversal_clawback(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.recalculate_target_box_and_cascade(UUID, INT, CHAR, CHAR) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.process_transaction_reversal_clawback(UUID, UUID, TEXT, UUID) TO service_role;

-- ============================================================================
-- 6. MONTHLY SETTLEMENT ENGINE (BOTTOM-UP DAG PASS, ROLL-UP, D1, TRUNC, S03)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.run_monthly_settlement_engine(
    p_settlement_cycle_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_peek_cid         INT;
    v_peek_ym          CHAR(7);
    v_cycle            sawyan.settlement_cycles%ROWTYPE;
    v_country          sawyan.countries%ROWTYPE;
    v_settings         sawyan.settings%ROWTYPE;
    v_next_ym          CHAR(7);
    v_max_gen          INT;
    v_gen              INT;
    v_box              RECORD;
    v_mem              RECORD;
    v_net_box          NUMERIC(18,6);
    v_qual_src         VARCHAR(20);
    v_share_orig       NUMERIC(18,6);
    v_s02_slots        INT;
    v_pool_id          BIGINT;
    v_comp_pool_id     BIGINT;
    v_incoming_sum     NUMERIC(18,6);
    v_home_qualified   BOOLEAN;
    v_comp_t02         NUMERIC(18,2);
    v_treasury_part    NUMERIC(18,2);
    v_admin_fee        NUMERIC(18,2);
    v_pkt              RECORD;
    v_pool_rec         RECORD;
    v_benef_count      INT;
    v_surplus_pool     NUMERIC(18,6);
    v_surplus_each     NUMERIC(18,2);
    v_total_paid_pool  NUMERIC(18,2);
    v_rounding_diff    NUMERIC(18,6);
    v_pools_created    INT := 0;
    v_total_rounding   NUMERIC(18,2) := 0.00;
BEGIN
    -- ترتيب أقفال موحد (T04 Lock Order): قراءة المعرّف بلا قفل -> قفل استشاري حصري للدورة -> قفل صف الدورة
    SELECT country_id, period_ym INTO v_peek_cid, v_peek_ym
      FROM sawyan.settlement_cycles WHERE id = p_settlement_cycle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SETTLEMENT_CYCLE_NOT_FOUND';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_period_lock_' || v_peek_cid::text || '_' || v_peek_ym));

    SELECT * INTO v_cycle FROM sawyan.settlement_cycles WHERE id = p_settlement_cycle_id FOR UPDATE;
    IF v_cycle.is_hard_locked OR v_cycle.payout_executed_at IS NOT NULL THEN
        RAISE EXCEPTION 'HARD_LOCK_VIOLATION: Cycle % is permanently locked / paid out.', v_cycle.period_ym;
    END IF;

    -- تطهير ذري لأي مسودة سابقة أو قيم تعويضية قديمة لضمان قابلية إعادة التشغيل (Idempotency)
    DELETE FROM sawyan.surplus_distributions
     WHERE pool_transaction_id IN (SELECT id FROM sawyan.pool_transactions WHERE settlement_cycle_id = v_cycle.id);
    DELETE FROM sawyan.commission_distributions
     WHERE pool_transaction_id IN (SELECT id FROM sawyan.pool_transactions WHERE settlement_cycle_id = v_cycle.id);
    DELETE FROM sawyan.pool_transactions WHERE settlement_cycle_id = v_cycle.id;
    DELETE FROM sawyan.compensatory_settlements WHERE settlement_cycle_id = v_cycle.id;

    UPDATE sawyan.monthly_target_boxes
       SET compensatory_incoming_usd = 0.000000
     WHERE country_id = v_cycle.country_id
       AND period_ym = v_cycle.period_ym
       AND compensatory_incoming_usd <> 0;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_cycle.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_cycle.country_id OR country_id IS NULL)
       AND effective_from <= v_cycle.closure_utc_instant
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_next_ym    := to_char((to_date(v_cycle.period_ym || '-01', 'YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');
    v_s02_slots  := COALESCE(v_settings.upline_ceiling_s02, 11);
    v_share_orig := ROUND((v_country.monthly_target_usd / v_s02_slots)::numeric, 6); -- 2.25$
    v_treasury_part := ROUND((v_country.monthly_target_usd * (v_settings.company_percent / (100.0 - v_settings.company_percent)))::numeric, 2); -- 8.25$
    v_admin_fee  := COALESCE(v_country.compensatory_admin_fee_usd, 0.00);
    v_comp_t02   := v_country.monthly_target_usd + v_treasury_part + v_admin_fee; -- >= 33.00$

    -- جدول عمل مؤقت لتدفق الحصص الصاعدة (Bottom-Up DAG Packets)
    CREATE TEMP TABLE IF NOT EXISTS _tmp_dag_packets (
        pool_id           BIGINT NOT NULL,
        current_member_id UUID NOT NULL,
        remaining_slots   INT NOT NULL,
        share_amount      NUMERIC(18,6) NOT NULL,
        next_position     SMALLINT NOT NULL
    ) ON COMMIT DROP;
    TRUNCATE TABLE _tmp_dag_packets;

    -- ------------------------------------------------------------------------
    -- الطور 1: فحص صناديق الأهداف المحلية والـ Carry On (GV01, GV02)
    -- ------------------------------------------------------------------------
    FOR v_box IN
        SELECT b.*, m.parent_member_id, m.is_tombstone_banned, m.member_code, m.generation_in_tree
          FROM sawyan.monthly_target_boxes b
          JOIN sawyan.members m ON m.id = b.member_id
         WHERE b.country_id = v_cycle.country_id
           AND b.period_ym = v_cycle.period_ym
           AND m.member_code > 0
         FOR UPDATE OF b
    LOOP
        v_net_box := v_box.carry_on_in_usd + v_box.current_month_purchases_usd;

        IF v_net_box >= v_box.target_required_usd AND NOT v_box.is_tombstone_banned THEN
            v_qual_src := CASE WHEN v_box.carry_on_in_usd >= v_box.target_required_usd THEN 'carry_on' ELSE 'local_purchases' END;

            UPDATE sawyan.monthly_target_boxes
               SET target_consumed_usd  = v_box.target_required_usd,
                   carry_on_out_usd     = v_net_box - v_box.target_required_usd,
                   is_qualified         = true,
                   qualification_source = v_qual_src
             WHERE id = v_box.id;

            -- ترحيل ومزامنة الـ Carry On للشهر التالي (حتى لو صار صفراً بعد استهلاك الكاري أون في مرتجع)
            IF (v_net_box - v_box.target_required_usd) > 0 OR EXISTS (
                SELECT 1 FROM sawyan.monthly_target_boxes
                 WHERE member_id = v_box.member_id AND country_id = v_cycle.country_id AND period_ym = v_next_ym
            ) THEN
                INSERT INTO sawyan.monthly_target_boxes (member_id, country_id, period_ym, carry_on_in_usd, target_required_usd, is_qualified, qualification_source)
                VALUES (
                    v_box.member_id, v_cycle.country_id, v_next_ym,
                    v_net_box - v_box.target_required_usd, v_country.monthly_target_usd,
                    ((v_net_box - v_box.target_required_usd) >= v_country.monthly_target_usd AND NOT COALESCE(v_box.is_tombstone_banned, false)),
                    CASE WHEN (v_net_box - v_box.target_required_usd) >= v_country.monthly_target_usd AND NOT COALESCE(v_box.is_tombstone_banned, false) THEN 'carry_on' ELSE 'none' END
                )
                ON CONFLICT (member_id, country_id, period_ym) DO UPDATE
                   SET carry_on_in_usd      = EXCLUDED.carry_on_in_usd,
                       is_qualified         = (((EXCLUDED.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                                               AND NOT COALESCE(v_box.is_tombstone_banned, false)),
                       qualification_source = CASE
                           WHEN ((EXCLUDED.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                                AND NOT COALESCE(v_box.is_tombstone_banned, false)
                           THEN CASE WHEN EXCLUDED.carry_on_in_usd >= sawyan.monthly_target_boxes.target_required_usd THEN 'carry_on' ELSE 'local_purchases' END
                           ELSE 'none'
                       END;
            END IF;

            -- إنشاء توزيعة الوعاء ومنح الصانع الحصة الأولى (1/11) ثم صعود 10 حصص لـ parent
            INSERT INTO sawyan.pool_transactions (
                settlement_cycle_id, member_id, target_box_id, source_type, target_consumed_usd,
                deducted_amount_usd, company_share_usd, members_share_usd, share_per_member_usd,
                beneficiaries_count, total_distributed_usd, settings_snapshot
            ) VALUES (
                v_cycle.id, v_box.member_id, v_box.id, 'LOCAL_TARGET_BOX', v_box.target_required_usd,
                v_box.target_required_usd, 0.000000, v_box.target_required_usd, v_share_orig,
                1, ROUND(v_share_orig::numeric, 2), to_jsonb(v_settings)
            ) RETURNING id INTO v_pool_id;

            v_pools_created := v_pools_created + 1;

            INSERT INTO sawyan.commission_distributions (
                pool_transaction_id, beneficiary_id, share_amount_usd, beneficiary_generation, beneficiary_position
            ) VALUES (
                v_pool_id, v_box.member_id, TRUNC(v_share_orig, 2), v_box.generation_in_tree, 1
            );

            IF v_box.parent_member_id IS NOT NULL AND v_s02_slots > 1 THEN
                INSERT INTO _tmp_dag_packets VALUES (v_pool_id, v_box.parent_member_id, v_s02_slots - 1, v_share_orig, 2);
            END IF;
        ELSE
            -- غير مؤهل محلياً: ترحيل الـ Carry On الموجب للشهر التالي بلا أي قيم سالبة (GV01 / GV09)
            UPDATE sawyan.monthly_target_boxes
               SET target_consumed_usd  = 0.00,
                   carry_on_out_usd     = GREATEST(0, v_net_box),
                   is_qualified         = false,
                   qualification_source = 'none'
             WHERE id = v_box.id;

            IF v_net_box > 0 OR EXISTS (
                SELECT 1 FROM sawyan.monthly_target_boxes
                 WHERE member_id = v_box.member_id AND country_id = v_cycle.country_id AND period_ym = v_next_ym
            ) THEN
                INSERT INTO sawyan.monthly_target_boxes (
                    member_id, country_id, period_ym, carry_on_in_usd, target_required_usd, is_qualified, qualification_source
                )
                VALUES (
                    v_box.member_id, v_cycle.country_id, v_next_ym, GREATEST(0, v_net_box), v_country.monthly_target_usd,
                    (GREATEST(0, v_net_box) >= v_country.monthly_target_usd AND NOT COALESCE(v_box.is_tombstone_banned, false)),
                    CASE WHEN GREATEST(0, v_net_box) >= v_country.monthly_target_usd AND NOT COALESCE(v_box.is_tombstone_banned, false) THEN 'carry_on' ELSE 'none' END
                )
                ON CONFLICT (member_id, country_id, period_ym) DO UPDATE
                   SET carry_on_in_usd      = EXCLUDED.carry_on_in_usd,
                       is_qualified         = (((EXCLUDED.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                                               AND NOT COALESCE(v_box.is_tombstone_banned, false)),
                       qualification_source = CASE
                           WHEN ((EXCLUDED.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                                AND NOT COALESCE(v_box.is_tombstone_banned, false)
                           THEN CASE
                               WHEN EXCLUDED.carry_on_in_usd >= sawyan.monthly_target_boxes.target_required_usd THEN 'carry_on'
                               WHEN sawyan.monthly_target_boxes.current_month_purchases_usd > 0 THEN 'local_purchases'
                               ELSE 'carry_on'
                           END
                           ELSE 'none'
                       END;
            END IF;
        END IF;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- الطور 2: المسح الصعودي الحتمي مستوىً بمستوى + الهدف التعويضي (D1 + D28 + GV06)
    -- ------------------------------------------------------------------------
    SELECT COALESCE(MAX(generation_in_tree), 0) INTO v_max_gen FROM sawyan.members;

    FOR v_gen IN REVERSE v_max_gen..1 LOOP
        FOR v_mem IN
            SELECT DISTINCT m.id, m.member_code, m.parent_member_id, m.residency_country_id,
                   m.generation_in_tree, m.is_tombstone_banned,
                   COALESCE(b.is_qualified, false) AS is_local_qual
              FROM _tmp_dag_packets p
              JOIN sawyan.members m ON m.id = p.current_member_id
              LEFT JOIN sawyan.monthly_target_boxes b
                     ON b.member_id = m.id AND b.country_id = v_cycle.country_id AND b.period_ym = v_cycle.period_ym
             WHERE m.generation_in_tree = v_gen
        LOOP
            SELECT COALESCE(SUM(share_amount), 0) INTO v_incoming_sum
              FROM _tmp_dag_packets WHERE current_member_id = v_mem.id;

            -- التحقق من التأهل المحلي أو التعويضي للعضو الأجنبي (D1 + GV06 — مستقل عن ترتيب إغلاق الدول)
            IF NOT v_mem.is_local_qual AND NOT v_mem.is_tombstone_banned AND v_mem.residency_country_id <> v_cycle.country_id THEN
                SELECT (
                    COALESCE((SELECT NOT c_home.is_active FROM sawyan.countries c_home WHERE c_home.id = v_mem.residency_country_id), false)
                    OR COALESCE((SELECT ((b_home.carry_on_in_usd + b_home.current_month_purchases_usd) >= b_home.target_required_usd OR b_home.is_qualified)
                                   FROM sawyan.monthly_target_boxes b_home
                                  WHERE b_home.member_id = v_mem.id
                                    AND b_home.country_id = v_mem.residency_country_id
                                    AND b_home.period_ym = v_cycle.period_ym), false)
                ) INTO v_home_qualified;

                IF COALESCE(v_home_qualified, false) AND v_incoming_sum >= v_comp_t02 THEN
                    -- تأهل تعويضي ناجح! (GV06)
                    v_mem.is_local_qual := true;

                    INSERT INTO sawyan.monthly_target_boxes (
                        member_id, country_id, period_ym, compensatory_incoming_usd, target_required_usd,
                        target_consumed_usd, is_qualified, qualification_source
                    ) VALUES (
                        v_mem.id, v_cycle.country_id, v_cycle.period_ym, v_incoming_sum, v_country.monthly_target_usd,
                        v_country.monthly_target_usd, true, 'compensatory'
                    )
                    ON CONFLICT (member_id, country_id, period_ym) DO UPDATE
                       SET compensatory_incoming_usd = EXCLUDED.compensatory_incoming_usd,
                           is_qualified              = true,
                           qualification_source      = 'compensatory',
                           carry_on_out_usd          = sawyan.monthly_target_boxes.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd; -- حفظ الكاري أون والمشتريات الجزئية دون دمج

                    -- مزامنة الكاري أون المحفوظ للدولة الأجنبية مع الشهر التالي (D1 + GV06)
                    UPDATE sawyan.monthly_target_boxes nx
                       SET carry_on_in_usd = cur.carry_on_out_usd
                      FROM sawyan.monthly_target_boxes cur
                     WHERE cur.member_id = v_mem.id
                       AND cur.country_id = v_cycle.country_id
                       AND cur.period_ym = v_cycle.period_ym
                       AND nx.member_id = v_mem.id
                       AND nx.country_id = v_cycle.country_id
                       AND nx.period_ym = v_next_ym
                       AND cur.carry_on_out_usd > 0;

                    -- قيد التسوية التعويضية وحسابَي الخزانة (D1)
                    INSERT INTO sawyan.compensatory_settlements (
                        settlement_cycle_id, member_id, foreign_country_id, gross_incoming_usd,
                        target_box_portion_usd, treasury_counterpart_usd, admin_fee_usd, net_payable_usd
                    ) VALUES (
                        v_cycle.id, v_mem.id, v_cycle.country_id, v_incoming_sum,
                        v_country.monthly_target_usd, v_treasury_part, v_admin_fee,
                        GREATEST(0, v_incoming_sum - v_comp_t02)
                    );

                    -- إنشاء توزيعة تعويضية (24.75$ -> +2.25$ للعضو نفسه + صعود لـ parent_member_id)
                    INSERT INTO sawyan.pool_transactions (
                        settlement_cycle_id, member_id, target_box_id, source_type, target_consumed_usd,
                        deducted_amount_usd, company_share_usd, members_share_usd, share_per_member_usd,
                        beneficiaries_count, total_distributed_usd, settings_snapshot
                    )
                    SELECT v_cycle.id, v_mem.id, b2.id, 'COMPENSATORY_SETTLEMENT', v_country.monthly_target_usd,
                           v_comp_t02, v_treasury_part + v_admin_fee, v_country.monthly_target_usd, v_share_orig,
                           1, ROUND(v_share_orig::numeric, 2), to_jsonb(v_settings)
                      FROM sawyan.monthly_target_boxes b2
                     WHERE b2.member_id = v_mem.id AND b2.country_id = v_cycle.country_id AND b2.period_ym = v_cycle.period_ym
                    RETURNING id INTO v_comp_pool_id;

                    v_pools_created := v_pools_created + 1;

                    INSERT INTO sawyan.commission_distributions (
                        pool_transaction_id, beneficiary_id, share_amount_usd, beneficiary_generation, beneficiary_position
                    ) VALUES (
                        v_comp_pool_id, v_mem.id, TRUNC(v_share_orig, 2), v_mem.generation_in_tree, 1
                    );

                    IF v_mem.parent_member_id IS NOT NULL AND v_s02_slots > 1 THEN
                        INSERT INTO _tmp_dag_packets VALUES (v_comp_pool_id, v_mem.parent_member_id, v_s02_slots - 1, v_share_orig, 2);
                    END IF;
                END IF;
            END IF;

            -- معالجة كافة الحزم الواردة إلى هذا العضو
            IF v_mem.is_local_qual AND NOT v_mem.is_tombstone_banned THEN
                FOR v_pkt IN SELECT * FROM _tmp_dag_packets WHERE current_member_id = v_mem.id LOOP
                    INSERT INTO sawyan.commission_distributions (
                        pool_transaction_id, beneficiary_id, share_amount_usd, beneficiary_generation, beneficiary_position
                    ) VALUES (
                        v_pkt.pool_id, v_mem.id, TRUNC(v_pkt.share_amount, 2), v_mem.generation_in_tree, v_pkt.next_position
                    );

                    IF v_pkt.remaining_slots > 1 AND v_mem.parent_member_id IS NOT NULL THEN
                        INSERT INTO _tmp_dag_packets VALUES (
                            v_pkt.pool_id, v_mem.parent_member_id, v_pkt.remaining_slots - 1, v_pkt.share_amount, v_pkt.next_position + 1
                        );
                    END IF;
                END LOOP;
            ELSE
                -- Roll-up: تخطي غير المؤهل أو المحظور Tombstone دون استهلاك أي مقعد من الـ 11 (GV03 / V1)
                IF v_mem.parent_member_id IS NOT NULL THEN
                    UPDATE _tmp_dag_packets
                       SET current_member_id = v_mem.parent_member_id
                     WHERE current_member_id = v_mem.id;
                END IF;
            END IF;

            -- حذف الحزم التي انتهت عند هذا العضو (أو وصلت للستوبر)
            DELETE FROM _tmp_dag_packets WHERE current_member_id = v_mem.id;
        END LOOP;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- الطور 3: فائض القمة والقطع للأسفل TRUNC + حساب فروق التقريب 4301 (D11 + D27 + V5 + GV05)
    -- ------------------------------------------------------------------------
    FOR v_pool_rec IN
        SELECT pt.id, pt.target_consumed_usd,
               COUNT(cd.id) AS k_count,
               COALESCE(SUM(cd.share_amount_usd), 0.00) AS base_sum
          FROM sawyan.pool_transactions pt
          JOIN sawyan.commission_distributions cd ON cd.pool_transaction_id = pt.id
         WHERE pt.settlement_cycle_id = v_cycle.id
         GROUP BY pt.id, pt.target_consumed_usd
    LOOP
        IF v_pool_rec.k_count < v_s02_slots AND v_pool_rec.k_count > 0 THEN
            v_surplus_pool := v_pool_rec.target_consumed_usd - v_pool_rec.base_sum;
            -- القطع للأسفل لأقرب سنت TRUNC وليس التقريب (D11 / V5)
            v_surplus_each := TRUNC(v_surplus_pool / v_pool_rec.k_count, 2);

            IF v_surplus_each > 0 THEN
                INSERT INTO sawyan.surplus_distributions (pool_transaction_id, beneficiary_id, surplus_amount_usd, distribution_rule)
                SELECT v_pool_rec.id, cd.beneficiary_id, v_surplus_each, 'equal'
                  FROM sawyan.commission_distributions cd
                 WHERE cd.pool_transaction_id = v_pool_rec.id;
            END IF;

            v_total_paid_pool := v_pool_rec.base_sum + (v_surplus_each * v_pool_rec.k_count);
            v_rounding_diff   := v_pool_rec.target_consumed_usd - v_total_paid_pool;

            UPDATE sawyan.pool_transactions
               SET beneficiaries_count   = v_pool_rec.k_count,
                   total_distributed_usd = v_total_paid_pool,
                   surplus_usd           = v_surplus_each * v_pool_rec.k_count,
                   rounding_diff_usd     = v_rounding_diff
             WHERE id = v_pool_rec.id;

            v_total_rounding := v_total_rounding + v_rounding_diff;
        ELSE
            v_total_paid_pool := v_pool_rec.base_sum;
            v_rounding_diff   := v_pool_rec.target_consumed_usd - v_total_paid_pool;

            UPDATE sawyan.pool_transactions
               SET beneficiaries_count   = v_pool_rec.k_count,
                   total_distributed_usd = v_total_paid_pool,
                   rounding_diff_usd     = GREATEST(0, v_rounding_diff)
             WHERE id = v_pool_rec.id;

            v_total_rounding := v_total_rounding + GREATEST(0, v_rounding_diff);
        END IF;
    END LOOP;

    UPDATE sawyan.settlement_cycles
       SET step_status     = 4,
           recalc_required = false
     WHERE id = v_cycle.id;

    RETURN jsonb_build_object(
        'settlement_cycle_id', v_cycle.id,
        'period_ym', v_cycle.period_ym,
        'pools_created', v_pools_created,
        'rounding_differences_account_credit_usd', v_total_rounding
    );
END;
$$;

-- ============================================================================
-- 7. RADAR, K-ANONYMITY (>= 10), S03 PRO-RATA & COUNTRY LENS ANALYTICS (D2/D14/D26/M18)
-- ============================================================================

-- 7.1 رادار التجار للأعضاء (يرجع الفروع النشطة ونسبة خطة الدخل الصافية فقط دون كشف 25% — القسم 7.2)
CREATE OR REPLACE FUNCTION sawyan.get_merchants_radar(
    p_lat          NUMERIC,
    p_lng          NUMERIC,
    p_radius_km    NUMERIC DEFAULT 10.0,
    p_country_code CHAR(2) DEFAULT NULL,
    p_category     VARCHAR DEFAULT NULL
) RETURNS TABLE (
    merchant_id       UUID,
    branch_id         UUID,
    business_name     VARCHAR,
    branch_name       VARCHAR,
    category          VARCHAR,
    distance_km       NUMERIC,
    plan_cashback_pct NUMERIC,
    latitude          NUMERIC,
    longitude         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT m.id,
           mb.id,
           m.business_name,
           mb.branch_name,
           m.category,
           ROUND((6371.0 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(p_lat)) * cos(radians(mb.latitude)) * cos(radians(mb.longitude) - radians(p_lng))
               + sin(radians(p_lat)) * sin(radians(mb.latitude))
           ))))::numeric, 2) AS distance_km,
           ROUND((m.deduction_percent * ((100.0 - COALESCE(s.company_percent, 25.0)) / 100.0))::numeric, 2) AS plan_cashback_pct,
           mb.latitude,
           mb.longitude
      FROM sawyan.merchant_branches mb
      JOIN sawyan.merchants m ON m.id = mb.merchant_id
      JOIN sawyan.countries c ON c.id = m.country_id
      LEFT JOIN LATERAL (
          SELECT company_percent FROM sawyan.settings
           WHERE (country_id = m.country_id OR country_id IS NULL) AND effective_from <= now()
           ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1
      ) s ON true
     WHERE m.is_active = true
       AND m.is_isolated = false
       AND mb.is_branch_active = true
       AND (p_country_code IS NULL OR c.country_code = p_country_code)
       AND (p_category IS NULL OR m.category = p_category)
       AND (6371.0 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(p_lat)) * cos(radians(mb.latitude)) * cos(radians(mb.longitude) - radians(p_lng))
               + sin(radians(p_lat)) * sin(radians(mb.latitude))
           )))) <= p_radius_km
     ORDER BY distance_km ASC;
$$;

-- 7.2 رادار كثافة الأعضاء للتجار بقيد إخفاء الهوية الإلزامي (k-Anonymity >= 10 — M18 + V7)
CREATE OR REPLACE FUNCTION sawyan.get_merchant_members_density(
    p_branch_id UUID,
    p_radius_km NUMERIC DEFAULT 3.0
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_branch sawyan.merchant_branches%ROWTYPE;
    v_cnt    INTEGER := 0;
BEGIN
    IF p_radius_km NOT IN (1, 2, 3, 5) THEN
        RAISE EXCEPTION 'INVALID_GEOFENCE_RADIUS: Allowed values are 1, 2, 3, 5 km.';
    END IF;

    SELECT * INTO v_branch FROM sawyan.merchant_branches WHERE id = p_branch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BRANCH_NOT_FOUND';
    END IF;

    SELECT COUNT(*) INTO v_cnt
      FROM sawyan.members m
      JOIN sawyan.geonames_locations g ON g.geoname_id = m.city_geoname_id
     WHERE m.member_code > 0
       AND m.is_active_in_tree = true
       AND (6371.0 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(v_branch.latitude)) * cos(radians(g.latitude)) * cos(radians(g.longitude) - radians(v_branch.longitude))
               + sin(radians(v_branch.latitude)) * sin(radians(g.latitude))
           )))) <= p_radius_km;

    IF v_cnt < 10 THEN
        RETURN jsonb_build_object(
            'branch_id', p_branch_id,
            'radius_km', p_radius_km,
            'k_anonymity_enforced', true,
            'members_cluster_indicator', '< 10',
            'exact_count', NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'branch_id', p_branch_id,
        'radius_km', p_radius_km,
        'k_anonymity_enforced', true,
        'members_cluster_indicator', v_cnt::text,
        'exact_count', v_cnt
    );
END;
$$;

-- 7.3 تطبيق الستوبر المالي S03 والتفكيك التناسبي Pro-Rata (V4 + GV07)
CREATE OR REPLACE FUNCTION sawyan.calculate_s03_pro_rata_payout(
    p_member_id UUID,
    p_period_ym CHAR(7)
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_residency_s03 NUMERIC(18,2);
    v_total_net     NUMERIC(18,2) := 0.00;
    v_payable_usd   NUMERIC(18,2) := 0.00;
    v_excess_usd    NUMERIC(18,2) := 0.00;
    v_breakdown     JSONB := '[]'::jsonb;
    v_c             RECORD;
    v_c_excess      NUMERIC(18,2);
    v_sum_excess    NUMERIC(18,2) := 0.00;
    v_max_country   CHAR(2) := NULL;
    v_max_net       NUMERIC(18,2) := -1;
    v_remainder     NUMERIC(18,2) := 0.00;
BEGIN
    SELECT c.financial_stopper_usd INTO v_residency_s03
      FROM sawyan.members m
      JOIN sawyan.countries c ON c.id = m.residency_country_id
     WHERE m.id = p_member_id;

    CREATE TEMP TABLE IF NOT EXISTS _tmp_country_nets (
        country_code CHAR(2),
        net_usd      NUMERIC(18,2),
        excess_usd   NUMERIC(18,2),
        payable_usd  NUMERIC(18,2)
    ) ON COMMIT DROP;
    TRUNCATE TABLE _tmp_country_nets;

    INSERT INTO _tmp_country_nets (country_code, net_usd, excess_usd, payable_usd)
    SELECT x.country_code, ROUND(SUM(x.amt)::numeric, 2), 0.00, ROUND(SUM(x.amt)::numeric, 2)
      FROM (
          SELECT c.country_code,
                 cd.share_amount_usd + COALESCE(sd.surplus_amount_usd, 0.00) AS amt
            FROM sawyan.commission_distributions cd
            JOIN sawyan.pool_transactions pt ON pt.id = cd.pool_transaction_id
            JOIN sawyan.settlement_cycles sc ON sc.id = pt.settlement_cycle_id
            JOIN sawyan.countries c ON c.id = sc.country_id
            LEFT JOIN sawyan.surplus_distributions sd ON sd.pool_transaction_id = pt.id AND sd.beneficiary_id = cd.beneficiary_id
           WHERE cd.beneficiary_id = p_member_id AND sc.period_ym = p_period_ym
          UNION ALL
          SELECT c.country_code, - (cs.target_box_portion_usd + cs.treasury_counterpart_usd + cs.admin_fee_usd) AS amt
            FROM sawyan.compensatory_settlements cs
            JOIN sawyan.settlement_cycles sc ON sc.id = cs.settlement_cycle_id
            JOIN sawyan.countries c ON c.id = sc.country_id
           WHERE cs.member_id = p_member_id AND sc.period_ym = p_period_ym
      ) x
     GROUP BY x.country_code;

    SELECT COALESCE(SUM(net_usd), 0.00) INTO v_total_net FROM _tmp_country_nets;

    IF v_total_net <= v_residency_s03 THEN
        v_payable_usd := v_total_net;
        v_excess_usd  := 0.00;
    ELSE
        v_payable_usd := v_residency_s03;
        v_excess_usd  := v_total_net - v_residency_s03;

        FOR v_c IN SELECT * FROM _tmp_country_nets WHERE net_usd > 0 ORDER BY net_usd DESC LOOP
            IF v_max_country IS NULL THEN
                v_max_country := v_c.country_code;
            END IF;
            v_c_excess   := TRUNC((v_c.net_usd / v_total_net) * v_excess_usd, 2);
            v_sum_excess := v_sum_excess + v_c_excess;
            UPDATE _tmp_country_nets
               SET excess_usd  = v_c_excess,
                   payable_usd = net_usd - v_c_excess
             WHERE country_code = v_c.country_code;
        END LOOP;

        -- مطابقة سنت الفارق التناسبي مع أكبر دولة مساهمة لحفظ تطابق مجموع الفائض والصرف 100%
        v_remainder := v_excess_usd - v_sum_excess;
        IF v_remainder > 0 AND v_max_country IS NOT NULL THEN
            UPDATE _tmp_country_nets
               SET excess_usd  = excess_usd + v_remainder,
                   payable_usd = net_usd - (excess_usd + v_remainder)
             WHERE country_code = v_max_country;
        END IF;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'country_code', country_code, 'gross_net_usd', net_usd,
        's03_excess_usd', excess_usd, 'payable_usd', payable_usd
    ) ORDER BY net_usd ASC)
      INTO v_breakdown
      FROM _tmp_country_nets;

    RETURN jsonb_build_object(
        'member_id', p_member_id,
        'period_ym', p_period_ym,
        's03_limit_usd', v_residency_s03,
        'total_net_usd', v_total_net,
        'payable_usd', v_payable_usd,
        's03_suspense_excess_usd', v_excess_usd,
        'pro_rata_breakdown', COALESCE(v_breakdown, '[]'::jsonb)
    );
END;
$$;

-- 7.4 محرك الشجرة والعدسات الدولية وفصل S01 (11 نزولاً) والخصوصية D26 (V1 + GV04)
CREATE OR REPLACE FUNCTION sawyan.get_tree_analytics_with_country_lens(
    p_viewer_member_id UUID,
    p_period_ym        CHAR(7),
    p_country_code     CHAR(2) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_viewer_gen    INT;
    v_s01           INT := 11;
    v_w09_phone_gen INT := 10;
    v_lens_cid      INT := NULL;
    v_rec           RECORD;
    v_parent_out    INT;
    v_parent_res    BOOLEAN;
    v_my_rank       INT;
    v_my_out        INT;
    v_my_res        BOOLEAN;
    v_nodes_json    JSONB;
    v_reserve_cnt   INT := 0;
    v_comm_cnt      INT := 0;
BEGIN
    SELECT generation_in_tree INTO v_viewer_gen FROM sawyan.members WHERE id = p_viewer_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VIEWER_NOT_FOUND';
    END IF;

    SELECT numerical_stopper_s01 INTO v_s01
      FROM sawyan.settings
     WHERE effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;
    v_s01 := COALESCE(v_s01, 11);

    IF p_country_code IS NOT NULL THEN
        SELECT id INTO v_lens_cid FROM sawyan.countries WHERE country_code = p_country_code;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _tmp_tree_nodes (
        member_id          UUID PRIMARY KEY,
        member_code        BIGINT,
        full_name          VARCHAR(150),
        parent_member_id   UUID,
        placement_side     VARCHAR(12),
        structural_me      INT,
        node_color         VARCHAR(10),
        team_bucket        VARCHAR(20), -- 'COMMISSION_TEAM' | 'UNQUALIFIED_SKIPPED' | 'RESERVE_TEAM'
        stopper_rank       INT,
        stopper_out        INT,
        is_reserve_zone    BOOLEAN,
        phone_visible      BOOLEAN,
        phone_masked       VARCHAR(24)
    ) ON COMMIT DROP;
    TRUNCATE TABLE _tmp_tree_nodes;

    FOR v_rec IN
        SELECT m.id, m.member_code, m.full_name, m.parent_member_id, m.placement_side,
               m.residency_country_id, m.is_tombstone_banned, m.phone,
               tc.depth AS rel_depth,
               COALESCE(bool_or(b.is_qualified), false) AS any_qual,
               COALESCE(MAX(b_lens.is_qualified::int), 0) = 1 AS lens_qual,
               COALESCE(MAX((b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd)), 0) AS lens_val,
               COALESCE(MAX((b.carry_on_in_usd + b.current_month_purchases_usd)), 0) AS any_val
          FROM sawyan.tree_closure tc
          JOIN sawyan.members m ON m.id = tc.descendant_id
          LEFT JOIN sawyan.monthly_target_boxes b
                 ON b.member_id = m.id AND b.period_ym = p_period_ym
          LEFT JOIN sawyan.monthly_target_boxes b_lens
                 ON b_lens.member_id = m.id AND b_lens.period_ym = p_period_ym AND b_lens.country_id = v_lens_cid
         WHERE tc.ancestor_id = p_viewer_member_id
         GROUP BY m.id, m.member_code, m.full_name, m.parent_member_id, m.placement_side,
                  m.residency_country_id, m.is_tombstone_banned, m.phone, tc.depth
         ORDER BY tc.depth ASC, m.member_code ASC
    LOOP
        DECLARE
            v_color VARCHAR(10);
        BEGIN
            IF v_lens_cid IS NOT NULL THEN
                IF v_rec.lens_qual THEN v_color := 'GREEN';
                ELSIF v_rec.lens_val > 0 THEN v_color := 'ORANGE';
                ELSIF v_rec.residency_country_id = v_lens_cid THEN v_color := 'WHITE';
                ELSE v_color := 'BLACK'; -- التعتيم الأسود المطفي بالعدسة الأحادية
                END IF;
            ELSE
                IF v_rec.any_qual THEN v_color := 'GREEN';
                ELSIF v_rec.any_val > 0 THEN v_color := 'ORANGE';
                ELSE v_color := 'WHITE';
                END IF;
            END IF;

            IF v_rec.rel_depth = 0 THEN
                -- حجز مقعد صاحب الشجرة (1/11) كمعاينة بصرية تحفيزية (D12)
                v_my_rank := 1;
                v_my_out  := 1;
                v_my_res  := false;
            ELSE
                SELECT stopper_out, is_reserve_zone INTO v_parent_out, v_parent_res
                  FROM _tmp_tree_nodes WHERE member_id = v_rec.parent_member_id;

                IF COALESCE(v_parent_res, false) OR COALESCE(v_parent_out, 0) >= v_s01 THEN
                    v_my_rank := NULL;
                    v_my_out  := v_s01;
                    v_my_res  := true;
                ELSIF v_color = 'GREEN' AND NOT v_rec.is_tombstone_banned THEN
                    v_my_rank := v_parent_out + 1;
                    v_my_out  := v_my_rank;
                    v_my_res  := false;
                ELSE
                    v_my_rank := NULL;
                    v_my_out  := v_parent_out;
                    v_my_res  := false;
                END IF;
            END IF;

            INSERT INTO _tmp_tree_nodes VALUES (
                v_rec.id, v_rec.member_code, v_rec.full_name, v_rec.parent_member_id, v_rec.placement_side,
                v_rec.rel_depth + 1, v_color,
                CASE WHEN v_my_res THEN 'RESERVE_TEAM'
                     WHEN v_my_rank IS NOT NULL THEN 'COMMISSION_TEAM'
                     ELSE 'UNQUALIFIED_SKIPPED' END,
                v_my_rank, v_my_out, v_my_res,
                (v_rec.rel_depth BETWEEN 1 AND v_w09_phone_gen), -- D26: 2Me-11Me هيكلياً فقط
                CASE WHEN (v_rec.rel_depth BETWEEN 1 AND v_w09_phone_gen) THEN v_rec.phone ELSE NULL END
            );
        END;
    END LOOP;

    SELECT COUNT(*) INTO v_reserve_cnt FROM _tmp_tree_nodes WHERE team_bucket = 'RESERVE_TEAM';
    SELECT COUNT(*) INTO v_comm_cnt    FROM _tmp_tree_nodes WHERE team_bucket = 'COMMISSION_TEAM';

    SELECT jsonb_agg(jsonb_build_object(
        'member_code', member_code,
        'full_name', full_name,
        'structural_me', structural_me || 'Me',
        'placement_side', placement_side,
        'node_color', node_color,
        'team_bucket', team_bucket,
        'stopper_slot', CASE WHEN stopper_rank IS NOT NULL THEN stopper_rank || '/' || v_s01 ELSE NULL END,
        'phone_visible', phone_visible,
        'phone', phone_masked
    ) ORDER BY structural_me ASC, member_code ASC)
      INTO v_nodes_json
      FROM _tmp_tree_nodes;

    RETURN jsonb_build_object(
        'viewer_member_id', p_viewer_member_id,
        'lens_country_code', COALESCE(p_country_code, 'ALL'),
        'commission_team_count', v_comm_cnt,
        'reserve_team_aggregated_count', v_reserve_cnt, -- رقم إجمالي مجمع فقط (D26)
        'nodes', COALESCE(v_nodes_json, '[]'::jsonb)
    );
END;
$$;

-- 7.5 واجهة إنشاء فاتورة كاشير/معلق بالـ Soft Hold (حد طلبين للعضو + سقف 20% — Point 14)
CREATE OR REPLACE FUNCTION sawyan.submit_pos_transaction(
    p_member_id           UUID,
    p_merchant_id         UUID,
    p_branch_id           UUID,
    p_amount              NUMERIC(18,2),
    p_payment_type        VARCHAR,
    p_unique_payment_ref  VARCHAR,
    p_sw_short_code       VARCHAR,
    p_idempotency_key     UUID,
    p_cashier_employee_id UUID DEFAULT NULL,
    p_is_instant_pin      BOOLEAN DEFAULT true,
    p_receipt_media_url   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing_idem    sawyan.idempotency_keys%ROWTYPE;
    v_merchant         sawyan.merchants%ROWTYPE;
    v_country          sawyan.countries%ROWTYPE;
    v_settings         sawyan.settings%ROWTYPE;
    v_fx_rate          NUMERIC(18,6);
    v_comm_amt         NUMERIC(18,6);
    v_pending_cnt      INT;
    v_soft_hold_cap    NUMERIC(18,2);
    v_tx_id            UUID;
    v_res              JSONB;
BEGIN
    -- فحص منع التكرار Idempotency-Key (V8 + S05)
    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
    VALUES (p_idempotency_key, p_member_id, 'submit_pos_transaction', encode(extensions.digest(p_unique_payment_ref, 'sha256'), 'hex'))
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
        IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
            RETURN v_existing_idem.response_body;
        END IF;
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_merchant.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL) AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

    v_fx_rate := CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'EUR' THEN 0.92 ELSE 1.0 END;
    v_comm_amt := ROUND((p_amount * (v_merchant.deduction_percent / 100.0))::numeric, 6);

    IF NOT p_is_instant_pin THEN
        -- المسار (ب) المعلق: فحص حد طلبين للعضو لدى نفس التاجر + سقف 20% Soft Hold من الباقة (Point 14)
        SELECT COUNT(*) INTO v_pending_cnt
          FROM sawyan.transactions
         WHERE member_id = p_member_id AND merchant_id = p_merchant_id AND status = 'pending';
        IF v_pending_cnt >= 2 THEN
            RAISE EXCEPTION 'MEMBER_PENDING_LIMIT_REACHED: Maximum 2 pending requests per merchant.';
        END IF;

        v_soft_hold_cap := ROUND((v_merchant.package_base_amount * (v_settings.unconfirmed_soft_hold_cap_pct / 100.0))::numeric, 2);
        IF (v_merchant.soft_hold_balance + v_comm_amt) > v_soft_hold_cap THEN
            RAISE EXCEPTION 'MERCHANT_SOFT_HOLD_CAP_20PCT_EXCEEDED';
        END IF;

        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url,
            soft_hold_expires_at, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, p_payment_type, 'pending', p_receipt_media_url,
            now() + interval '48 hours', jsonb_build_object('deduction_percent', v_merchant.deduction_percent, 'company_percent', v_settings.company_percent)
        ) RETURNING id INTO v_tx_id;

        UPDATE sawyan.merchants
           SET soft_hold_balance = soft_hold_balance + v_comm_amt
         WHERE id = v_merchant.id;

        v_res := jsonb_build_object('transaction_id', v_tx_id, 'status', 'pending', 'soft_hold_added', v_comm_amt);
    ELSE
        -- التوثيق الفوري بـ PIN الكاشير أو مسح QR
        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, p_payment_type, 'pending', p_receipt_media_url,
            jsonb_build_object('deduction_percent', v_merchant.deduction_percent, 'company_percent', v_settings.company_percent)
        ) RETURNING id INTO v_tx_id;

        v_res := sawyan.feed_monthly_target_box(v_tx_id, p_member_id) || jsonb_build_object('transaction_id', v_tx_id);
    END IF;

    UPDATE sawyan.idempotency_keys
       SET response_status = 200, response_body = v_res
     WHERE idempotency_key = p_idempotency_key;

    RETURN v_res;
END;
$$;
