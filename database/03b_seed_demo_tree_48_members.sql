-- ============================================================================
-- SAWYAN PARALLEL SITE (`sawyan_demo`) — 48-MEMBER REALISTIC TREE & DEMO SEED
-- Tree Mix (Screen 4 Spec): 48 Members (28 Right: 17 EG + 11 TR | 20 Left: 13 EG + 7 TR)
-- NOTE: Executed ONLY on `sawyan_demo` (NEVER on Production `sawyan`)
-- ============================================================================

DO $$
DECLARE
    v_eg_id        INT;
    v_tr_id        INT;
    v_root_id      UUID;
    v_admin_maker  UUID := '11111111-1111-4111-8111-111111111101';
    v_admin_check  UUID := '11111111-1111-4111-8111-111111111102';
    v_m            UUID[];
    v_tmp_id       UUID;
    v_parent_idx   INT;
    v_side         TEXT;
    v_res_id       INT;
    v_geo_id       BIGINT;
    v_phone        TEXT;
    v_name         TEXT;
    v_merch_eg_id  UUID;
    v_merch_tr_id  UUID;
    v_br_eg_1      UUID;
    v_br_eg_2      UUID;
    v_br_tr_1      UUID;
    v_cashier_eg   UUID;
    v_tx_id        UUID;
    i              INT;
BEGIN
    SELECT id INTO v_eg_id FROM sawyan_demo.countries WHERE country_code = 'EG';
    SELECT id INTO v_tr_id FROM sawyan_demo.countries WHERE country_code = 'TR';
    SELECT id INTO v_root_id FROM sawyan_demo.members WHERE member_code = 0;

    -- 1. مسؤولا تجربة للـ Maker-Checker (بـ Argon2id / Supabase Auth وهمي للتجربة فقط، لا 123456)
    INSERT INTO sawyan_demo.admins (id, full_name, email, auth_user_id, role, must_change_password, two_factor_enabled) VALUES
    (v_admin_maker, 'Demo Finance Maker', 'demo.maker@sawyan.local', '22222222-2222-4222-8222-222222222201', 'data_entry', false, true),
    (v_admin_check, 'Demo Finance Approver', 'demo.checker@sawyan.local', '22222222-2222-4222-8222-222222222202', 'approver', false, true)
    ON CONFLICT (email) DO NOTHING;

    -- 2. تأسيس القائد #1 تحت الجذر #0 باعتماد Maker-Checker
    INSERT INTO sawyan_demo.maker_checker_requests (
        action_type, target_entity, target_id, payload_after, reason, maker_admin_id, checker_admin_id, status, decided_at
    ) VALUES (
        'ROOT_DIRECT_PLACEMENT', 'member', '1', '{"member_code": 1}'::jsonb,
        'Demo Tree Leader #1 Placement', v_admin_maker, v_admin_check, 'approved', now()
    );

    -- إنشاء مصفوفة المعرّفات للأعضاء 1..48 (28 يمين + 20 يسار)
    IF NOT EXISTS (SELECT 1 FROM sawyan_demo.members WHERE member_code = 1) THEN
        v_m := ARRAY_FILL(NULL::uuid, ARRAY[49]);

        -- العضو #1 (أحمد ساهر — قائد الشجرة في مصر) مباشر تحت الجذر #0
        INSERT INTO sawyan_demo.members (
            member_code, full_name, email, phone, residency_country_id, city_geoname_id,
            auth_user_id, sponsor_id, placement_side, generation_in_tree, kyc_status
        ) VALUES (
            1, 'أحمد ساهر (قائد الشجرة التجريبية)', 'leader1@sawyan.demo', '+201000000001',
            v_eg_id, 360630, gen_random_uuid(), v_root_id, 'root_direct', 1, 'verified'
        ) RETURNING id INTO v_tmp_id;
        v_m[1] := v_tmp_id;

        -- الأعضاء 2..29 (28 عضواً بالذراع الأيمن: 17 مصر + 11 تركيا)
        -- والأعضاء 30..49 (20 عضواً بالذراع الأيسر: 13 مصر + 7 تركيا) = 48 عضواً بالشجرة
        FOR i IN 2..49 LOOP
            IF i <= 29 THEN
                -- الذراع الأيمن (28 عضواً: أول 17 EG ثم 11 TR)
                IF i = 2 THEN
                    v_parent_idx := 1;
                    v_side := 'right';
                ELSIF i IN (3, 4) THEN
                    v_parent_idx := 2;
                    v_side := CASE WHEN i = 3 THEN 'right' ELSE 'left' END;
                ELSE
                    v_parent_idx := 3 + ((i - 5) / 2);
                    v_side := CASE WHEN (i % 2 = 1) THEN 'right' ELSE 'left' END;
                END IF;
                IF (i - 1) <= 17 THEN
                    v_res_id := v_eg_id; v_geo_id := 360630; v_phone := '+20101000' || LPAD(i::text, 4, '0');
                ELSE
                    v_res_id := v_tr_id; v_geo_id := 745044; v_phone := '+90531000' || LPAD(i::text, 4, '0');
                END IF;
                v_name := 'عضو يمين #' || i;
            ELSE
                -- الذراع الأيسر (20 عضواً: #30..#49: أول 13 EG ثم 7 TR)
                IF i = 30 THEN
                    v_parent_idx := 1;
                    v_side := 'left';
                ELSE
                    v_parent_idx := 30 + ((i - 31) / 2);
                    v_side := CASE WHEN (i % 2 = 1) THEN 'right' ELSE 'left' END;
                END IF;
                IF (i - 29) <= 13 THEN
                    v_res_id := v_eg_id; v_geo_id := 361058; v_phone := '+20102000' || LPAD(i::text, 4, '0');
                ELSE
                    v_res_id := v_tr_id; v_geo_id := 745044; v_phone := '+90532000' || LPAD(i::text, 4, '0');
                END IF;
                v_name := 'عضو يسار #' || i;
            END IF;

            INSERT INTO sawyan_demo.members (
                member_code, full_name, email, phone, residency_country_id, city_geoname_id,
                auth_user_id, sponsor_id, parent_member_id, placement_side, generation_in_tree,
                kyc_status, metadata
            ) VALUES (
                i, v_name, 'demo' || i || '@sawyan.demo', v_phone, v_res_id, v_geo_id,
                gen_random_uuid(), v_m[1], v_m[v_parent_idx], v_side, 1,
                'unverified', '{"allow_explicit_test_placement": true}'::jsonb
            ) RETURNING id INTO v_tmp_id;
            v_m[i] := v_tmp_id;
        END LOOP;

        -- 3. تجار وفروع تجريبية في مصر وتركيا + باقات شحن مسبق
        INSERT INTO sawyan_demo.merchants (
            merchant_code, country_id, onboarded_by_member_id, business_name, owner_name, email, phone,
            category, merchant_type, deduction_percent, package_base_amount, actual_cash_balance, is_active
        ) VALUES (
            'M-EG-001', v_eg_id, v_m[1], 'سوبر ماركت النخبة', 'محمود النخبة', 'elite@merchant.demo', '+201200000001',
            'supermarket', 'physical', 10.00, 10000.00, 10000.00, true
        ) RETURNING id INTO v_merch_eg_id;

        INSERT INTO sawyan_demo.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch, city_geoname_id, address, latitude, longitude
        ) VALUES
        (v_merch_eg_id, 'BR-01', 'فرع مدينة نصر الرئيسي', true, 360630, 'شارع عباس العقاد - القاهرة', 30.056100, 31.330100)
        RETURNING id INTO v_br_eg_1;

        INSERT INTO sawyan_demo.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch, city_geoname_id, address, latitude, longitude
        ) VALUES
        (v_merch_eg_id, 'BR-02', 'فرع المعادي', false, 360630, 'شارع 9 - المعادي - القاهرة', 29.960200, 31.256900)
        RETURNING id INTO v_br_eg_2;

        INSERT INTO sawyan_demo.cashier_employees (
            merchant_id, branch_id, employee_code, full_name, linked_member_id, pin_hash
        ) VALUES (
            v_merch_eg_id, v_br_eg_1, 'EMP-01', 'كريم كاشير', NULL, 'argon2id_demo_pin_hash'
        ) RETURNING id INTO v_cashier_eg;

        INSERT INTO sawyan_demo.merchants (
            merchant_code, country_id, onboarded_by_member_id, business_name, owner_name, email, phone,
            category, merchant_type, deduction_percent, package_base_amount, actual_cash_balance, is_active
        ) VALUES (
            'M-TR-001', v_tr_id, v_m[1], 'مطعم إسطنبول الذهبي', 'أورهان يلماز', 'istanbul@merchant.demo', '+905550000001',
            'restaurant', 'physical', 10.00, 10000.00, 10000.00, true
        ) RETURNING id INTO v_merch_tr_id;

        INSERT INTO sawyan_demo.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch, city_geoname_id, address, latitude, longitude
        ) VALUES
        (v_merch_tr_id, 'TR-BR-01', 'فرع الفاتح الرئيسي', true, 745044, 'Fatih - Istanbul', 41.018600, 28.949800)
        RETURNING id INTO v_br_tr_1;

        -- 4. معاملة تجريبية مكتملة لتأهيل القائد #1 (16,500 ج.م -> 1,650 عمولة -> 24.75$ خطة دخل)
        PERFORM sawyan_demo.submit_pos_transaction(
            v_m[1], v_merch_eg_id, v_br_eg_1, 16500.00, 'cash',
            'DEMO-REF-0001', 'SW-1001', gen_random_uuid(), v_cashier_eg, true, NULL
        );
    END IF;
END $$;
