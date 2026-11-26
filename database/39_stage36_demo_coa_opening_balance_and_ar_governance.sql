-- ============================================================================
-- SAWYAN V3.0 — Stage 36 Wave 2: Demo COA Opening Balance Reconciliation (F6),
-- Arabic Maker-Checker Demo Governance Reasons (F6), & Academy Local-Currency
-- Constitutional Lock #3 Compliance (C2)
-- Idempotent & safe for both `sawyan` (Production: Academy copy ONLY) and
-- `sawyan_demo` (Preview/Sandbox: COA opening seed + Arabic MC reasons + Academy).
-- NEVER drops schemas or touches Production `sawyan` financial ledger/users.
-- ============================================================================

-- 1. sawyan_demo ONLY: Post balanced double-entry opening seed in journal_entries /
--    journal_lines so Account 2101 (Merchant Prepaid Float) matches actual_cash_balance
--    and Account 2201 (Plan Pool Liability) reflects open-month obligations >= 0.
DO $$
DECLARE
    v_entry_id         UUID;
    v_next_num         BIGINT;
    v_eg_id            INT;
    v_actual_merch_usd NUMERIC(18,2);
    v_coa_2101_usd     NUMERIC(18,2);
    v_delta_2101       NUMERIC(18,2);
    v_open_boxes_usd   NUMERIC(18,2);
    v_coa_2201_usd     NUMERIC(18,2);
    v_delta_2201       NUMERIC(18,2);
    v_total_debit      NUMERIC(18,2);
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sawyan_demo.journal_entries
         WHERE description LIKE 'قيد افتتاحي متوازن لبذرة%'
    ) THEN
        SELECT id INTO v_eg_id FROM sawyan_demo.countries WHERE country_code = 'EG' LIMIT 1;

        SELECT COALESCE(ROUND(SUM(m.actual_cash_balance / NULLIF(c.admin_fx_rate, 0))::numeric, 2), 0.00)
          INTO v_actual_merch_usd
          FROM sawyan_demo.merchants m
          JOIN sawyan_demo.countries c ON c.id = m.country_id;

        SELECT COALESCE(ROUND(SUM(credit_usd - debit_usd)::numeric, 2), 0.00)
          INTO v_coa_2101_usd
          FROM sawyan_demo.journal_lines
         WHERE account_code = '2101';

        v_delta_2101 := GREATEST(0.00, ROUND((v_actual_merch_usd - v_coa_2101_usd)::numeric, 2));

        SELECT COALESCE(ROUND(SUM(tb.carry_on_in_usd + tb.current_month_purchases_usd + tb.compensatory_incoming_usd)::numeric, 2), 0.00)
          INTO v_open_boxes_usd
          FROM sawyan_demo.monthly_target_boxes tb
         WHERE NOT EXISTS (
             SELECT 1
               FROM sawyan_demo.settlement_cycles sc
              WHERE sc.country_id = tb.country_id
                AND sc.period_ym  = tb.period_ym
                AND sc.step_status >= 5
         );

        SELECT COALESCE(ROUND(SUM(credit_usd - debit_usd)::numeric, 2), 0.00)
          INTO v_coa_2201_usd
          FROM sawyan_demo.journal_lines
         WHERE account_code = '2201';

        v_delta_2201 := GREATEST(0.00, ROUND((v_open_boxes_usd - v_coa_2201_usd)::numeric, 2));
        v_total_debit := ROUND((v_delta_2101 + v_delta_2201)::numeric, 2);

        IF v_total_debit > 0.00 THEN
            SELECT COALESCE(MAX(entry_number), 0) + 1 INTO v_next_num FROM sawyan_demo.journal_entries;
            v_entry_id := gen_random_uuid();

            INSERT INTO sawyan_demo.journal_entries (
                id, entry_number, settlement_cycle_id, source_type, source_id,
                country_id, fx_rate_used, reverses_entry_id, description, posted_at
            ) VALUES (
                v_entry_id, v_next_num, NULL, 'MANUAL_AUDIT_ADJUSTMENT', gen_random_uuid(),
                v_eg_id, 50.000000, NULL,
                'قيد افتتاحي متوازن لبذرة بيئة العرض التجريبي (رصيد شحن التجار وصناديق الأهداف)',
                '2026-08-01 00:00:00+00'::timestamptz
            );

            IF v_delta_2101 > 0.00 AND v_delta_2201 > 0.00 THEN
                INSERT INTO sawyan_demo.journal_lines (
                    journal_entry_id, account_code, entity_type, entity_id,
                    debit_usd, credit_usd, amount_local, currency_code
                ) VALUES
                    (v_entry_id, '1101', 'treasury', NULL, v_total_debit, 0.00, ROUND((v_total_debit * 50.0)::numeric, 2), 'EGP'),
                    (v_entry_id, '2101', 'merchant', NULL, 0.00, v_delta_2101, ROUND((v_delta_2101 * 50.0)::numeric, 2), 'EGP'),
                    (v_entry_id, '2201', 'treasury', NULL, 0.00, v_delta_2201, ROUND((v_delta_2201 * 50.0)::numeric, 2), 'EGP');
            ELSIF v_delta_2101 > 0.00 THEN
                INSERT INTO sawyan_demo.journal_lines (
                    journal_entry_id, account_code, entity_type, entity_id,
                    debit_usd, credit_usd, amount_local, currency_code
                ) VALUES
                    (v_entry_id, '1101', 'treasury', NULL, v_delta_2101, 0.00, ROUND((v_delta_2101 * 50.0)::numeric, 2), 'EGP'),
                    (v_entry_id, '2101', 'merchant', NULL, 0.00, v_delta_2101, ROUND((v_delta_2101 * 50.0)::numeric, 2), 'EGP');
            ELSE
                INSERT INTO sawyan_demo.journal_lines (
                    journal_entry_id, account_code, entity_type, entity_id,
                    debit_usd, credit_usd, amount_local, currency_code
                ) VALUES
                    (v_entry_id, '1101', 'treasury', NULL, v_delta_2201, 0.00, ROUND((v_delta_2201 * 50.0)::numeric, 2), 'EGP'),
                    (v_entry_id, '2201', 'treasury', NULL, 0.00, v_delta_2201, ROUND((v_delta_2201 * 50.0)::numeric, 2), 'EGP');
            END IF;
        END IF;
    END IF;
END $$;

-- 2. sawyan_demo ONLY: Translate English Maker-Checker verification logs to clear Arabic
UPDATE sawyan_demo.maker_checker_requests
   SET reason = CASE reason
       WHEN 'Emergency audited Break-Glass verification'
           THEN 'تفعيل فتح طوارئ موثّق ومراجَع حسابياً (Break-Glass)'
       WHEN 'Approve Turkey corporate partner D24'
           THEN 'اعتماد اتفاقية الشريك التشغيلي في تركيا (ضبط الفصل الشجري)'
       WHEN 'Attempt SA activation before merchant threshold'
           THEN 'اختبار حوكمة: منع تفعيل دولة قبل استيفاء حد المتاجر المعتمد'
       WHEN 'Constitutional Stage 6 Maker-Checker Verification'
           THEN 'تحقق حوكمة صانع/معتمد لتحديث إعدادات المنظومة الدستورية'
       WHEN 'Self-approval negative test'
           THEN 'اختبار أمان: رفض الاعتماد الذاتي لنفس الإداري المنشئ'
       ELSE reason
   END
 WHERE reason IN (
     'Emergency audited Break-Glass verification',
     'Approve Turkey corporate partner D24',
     'Attempt SA activation before merchant threshold',
     'Constitutional Stage 6 Maker-Checker Verification',
     'Self-approval negative test'
 );

-- 3. Both `sawyan` and `sawyan_demo`: Financial Lock #3 — remove USD amounts from
--    Arabic Academy track/course descriptions shown on Member daily screens.
UPDATE sawyan.academy_tracks
   SET description_i18n = jsonb_set(
       description_i18n,
       '{ar}',
       to_jsonb('شرح عملي لآلية تقسيم العمولة (75% خطة الدخل / 25% خزانة الشركة)، صندوق الهدف الشهري بعملة إقامتك، الترحيل المستمر Carry On، والحصص الـ 11 المتساوية.'::text)
   )
 WHERE slug = 'track-income-plan';

UPDATE sawyan.academy_courses
   SET title_i18n = jsonb_set(
           title_i18n,
           '{ar}',
           to_jsonb('١. شرح صندوق الهدف الشهري والترحيل المستمر (Carry On)'::text)
       ),
       content_i18n = jsonb_set(
           content_i18n,
           '{ar}',
           to_jsonb('كل فاتورة شراء معتمدة تغذي صندوق هدفك الشهري بعملة دولة إقامتك المعتمدة وفق سعر الصرف الإداري. إذا لم يكتمل الهدف خلال الشهر، لا يضيع رصيدك أبداً بل يُرحّل تلقائياً عبر عملية Carry On للشهر التالي دون حد زمني. وعند اكتمال الهدف، تُقسَّم حصيلة الصندوق بالتساوي على 11 حصة (حصتك كصانع هدف + 10 آباء مؤهلين صعوداً عبر الـ Roll-up)، وتخضع العمولات لمهلة مراجعة 14 يوماً ثم تُتاح للسحب يوم 15 من الشهر التالي.'::text)
       )
 WHERE slug = 'income-plan-2475-explained';

UPDATE sawyan_demo.academy_tracks
   SET description_i18n = jsonb_set(
       description_i18n,
       '{ar}',
       to_jsonb('شرح عملي لآلية تقسيم العمولة (75% خطة الدخل / 25% خزانة الشركة)، صندوق الهدف الشهري بعملة إقامتك، الترحيل المستمر Carry On، والحصص الـ 11 المتساوية.'::text)
   )
 WHERE slug = 'track-income-plan';

UPDATE sawyan_demo.academy_courses
   SET title_i18n = jsonb_set(
           title_i18n,
           '{ar}',
           to_jsonb('١. شرح صندوق الهدف الشهري والترحيل المستمر (Carry On)'::text)
       ),
       content_i18n = jsonb_set(
           content_i18n,
           '{ar}',
           to_jsonb('كل فاتورة شراء معتمدة تغذي صندوق هدفك الشهري بعملة دولة إقامتك المعتمدة وفق سعر الصرف الإداري. إذا لم يكتمل الهدف خلال الشهر، لا يضيع رصيدك أبداً بل يُرحّل تلقائياً عبر عملية Carry On للشهر التالي دون حد زمني. وعند اكتمال الهدف، تُقسَّم حصيلة الصندوق بالتساوي على 11 حصة (حصتك كصانع هدف + 10 آباء مؤهلين صعوداً عبر الـ Roll-up)، وتخضع العمولات لمهلة مراجعة 14 يوماً ثم تُتاح للسحب يوم 15 من الشهر التالي.'::text)
       )
 WHERE slug = 'income-plan-2475-explained';
