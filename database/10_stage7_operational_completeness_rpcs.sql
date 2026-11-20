-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 7: END-TO-END OPERATIONAL COMPLETENESS LAYER
-- Closes all 12 Joint-Committee Operational Gaps while preserving:
--   * Exact 43-table constitutional count & 100% RLS enabled
--   * Explicit `SET search_path = pg_catalog, pg_temp` on all SECURITY DEFINER RPCs
--   * Zero raw `anon` SELECT on `sawyan.members` / `sawyan.merchants`
--   * Sovereign Founder 1-Step Authority + Strict Maker-Checker for Staff
-- ============================================================================

-- 0. ترقية الأعمدة التشغيلية داخل الجداول الـ 43 القائمة (دون إنشاء جداول غير محمية)
ALTER TABLE sawyan.support_tickets
    ADD COLUMN IF NOT EXISTS subject      TEXT,
    ADD COLUMN IF NOT EXISTS message_body TEXT,
    ADD COLUMN IF NOT EXISTS admin_reply  TEXT,
    ADD COLUMN IF NOT EXISTS metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- إضافة دولة الإمارات العربية المتحدة (AE) كبذرة جاهزة + توسيع شامل للمحافظات والمدن (الفجوة 2)
INSERT INTO sawyan.countries (
    country_code, country_name_i18n, currency_code, iana_timezone, brand_display_title,
    admin_fx_rate, financial_stopper_usd, monthly_target_usd, compensatory_admin_fee_usd,
    vat_rate, wht_rate, tax_exclusive, payout_day, return_cutoff_day,
    legal_opinion_verified, local_terms_version, min_merchants_threshold, is_active
) VALUES (
    'AE',
    '{"ar":"الإمارات","en":"United Arab Emirates","tr":"BAE"}'::jsonb,
    'AED', 'Asia/Dubai', 'SAWYAN',
    3.672500, 4605.75, 24.75, 0.00,
    5.0000, 0.0000, true, 15, 14,
    true, 'v3.0-AE', 1, false
) ON CONFLICT (country_code) DO NOTHING;

INSERT INTO sawyan.geonames_locations (geoname_id, country_code, admin1_name, city_name, asciiname, alternate_names, latitude, longitude, search_vector) VALUES
-- مصر (تغطية المحافظات الرئيسية)
(360761, 'EG', 'Dakahlia', 'المنصورة (الدقهلية)', 'Mansoura', 'المنصورة الدقهلية Mansoura', 31.036370, 31.380690, 'EG Mansoura المنصورة الدقهلية'),
(347296, 'EG', 'Gharbia', 'طنطا (الغربية)', 'Tanta', 'طنطا المحلة الغربية Tanta', 30.788470, 31.001920, 'EG Tanta طنطا المحلة الغربية'),
(346030, 'EG', 'Sharqia', 'الزقازيق والعاشر (الشرقية)', 'Zagazig', 'الزقازيق الشرقية العاشر من رمضان Zagazig', 30.587680, 31.502000, 'EG Zagazig الزقازيق الشرقية العاشر'),
(358619, 'EG', 'Port Said', 'بورسعيد', 'Port Said', 'بورسعيد Port Said', 31.256540, 32.284110, 'EG Port Said بورسعيد'),
(361055, 'EG', 'Ismailia', 'الإسماعيلية', 'Ismailia', 'الإسماعيلية Ismailia', 30.604270, 32.272250, 'EG Ismailia الإسماعيلية'),
(359796, 'EG', 'Suez', 'السويس', 'Suez', 'السويس Suez', 29.973710, 32.526270, 'EG Suez السويس'),
(358048, 'EG', 'Qalyubia', 'بنها وشبرا (القليوبية)', 'Banha', 'بنها شبرا الخيمة القليوبية Banha', 30.459770, 31.184200, 'EG Banha بنها شبرا القليوبية'),
(350203, 'EG', 'Monufia', 'شبين الكوم (المنوفية)', 'Shibin El Kom', 'شبين الكوم السادات المنوفية', 30.552580, 31.009040, 'EG Monufia شبين الكوم المنوفية'),
(358095, 'EG', 'Beheira', 'دمنهور (البحيرة)', 'Damanhur', 'دمنهور كفر الدوار البحيرة Damanhur', 31.034080, 30.468230, 'EG Damanhur دمنهور البحيرة'),
(354502, 'EG', 'Kafr El Sheikh', 'كفر الشيخ', 'Kafr El Sheikh', 'كفر الشيخ دسوق', 31.111740, 30.939910, 'EG Kafr El Sheikh كفر الشيخ'),
(358044, 'EG', 'Damietta', 'دمياط ودمياط الجديدة', 'Damietta', 'دمياط Damietta', 31.416480, 31.813320, 'EG Damietta دمياط'),
(361370, 'EG', 'Faiyum', 'الفيوم', 'Faiyum', 'الفيوم Faiyum', 29.309950, 30.841800, 'EG Faiyum الفيوم'),
(359173, 'EG', 'Beni Suef', 'بني سويف', 'Beni Suef', 'بني سويف Beni Suef', 29.074410, 31.097850, 'EG Beni Suef بني سويف'),
(360686, 'EG', 'Minya', 'المنيا', 'Minya', 'المنيا ملوي Minya', 28.109880, 30.750300, 'EG Minya المنيا'),
(359783, 'EG', 'Assiut', 'أسيوط', 'Assiut', 'أسيوط Assiut', 27.180960, 31.183680, 'EG Assiut أسيوط'),
(347796, 'EG', 'Sohag', 'سوهاج', 'Sohag', 'سوهاج Sohag', 26.556950, 31.694780, 'EG Sohag سوهاج'),
(350550, 'EG', 'Qena', 'قنا', 'Qena', 'قنا نجع حمادي Qena', 26.164180, 32.726710, 'EG Qena قنا'),
(360502, 'EG', 'Luxor', 'الأقصر', 'Luxor', 'الأقصر Luxor', 25.687240, 32.639630, 'EG Luxor الأقصر'),
(359792, 'EG', 'Aswan', 'أسوان', 'Aswan', 'أسوان Aswan', 24.090820, 32.899420, 'EG Aswan أسوان'),
(361291, 'EG', 'Red Sea', 'الغردقة (البحر الأحمر)', 'Hurghada', 'الغردقة البحر الأحمر Hurghada', 27.257380, 33.812910, 'EG Hurghada الغردقة البحر الأحمر'),
(349340, 'EG', 'South Sinai', 'شرم الشيخ (جنوب سيناء)', 'Sharm El Sheikh', 'شرم الشيخ جنوب سيناء', 27.915820, 34.329950, 'EG Sharm شرم الشيخ سيناء'),
(360612, 'EG', 'Matrouh', 'مرسى مطروح والساحل', 'Marsa Matruh', 'مرسى مطروح العلمين Matruh', 31.352540, 27.245280, 'EG Matruh مرسى مطروح العلمين'),
-- السعودية
(108410, 'SA', 'Riyadh', 'الرياض', 'Riyadh', 'الرياض Riyadh', 24.713552, 46.675296, 'SA Riyadh الرياض'),
(105343, 'SA', 'Makkah', 'جدة', 'Jeddah', 'جدة Jeddah', 21.485811, 39.192505, 'SA Jeddah جدة'),
(104515, 'SA', 'Makkah', 'مكة المكرمة', 'Makkah', 'مكة المكرمة Mecca', 21.426640, 39.825630, 'SA Makkah مكة المكرمة'),
(109223, 'SA', 'Madinah', 'المدينة المنورة', 'Madinah', 'المدينة المنورة Medina', 24.468610, 39.614170, 'SA Madinah المدينة المنورة'),
(110336, 'SA', 'Eastern', 'الدمام والخبر', 'Dammam', 'الدمام الخبر الظهران الشرقية Dammam Khobar', 26.434420, 50.103260, 'SA Dammam Khobar الدمام الخبر الشرقية'),
(107968, 'SA', 'Makkah', 'الطائف', 'Taif', 'الطائف Taif', 21.270280, 40.415830, 'SA Taif الطائف'),
(101628, 'SA', 'Tabuk', 'تبوك', 'Tabuk', 'تبوك نيوم Tabuk', 28.399800, 36.571510, 'SA Tabuk تبوك'),
(108648, 'SA', 'Qassim', 'بريدة وعنيزة (القصيم)', 'Buraidah', 'بريدة عنيزة القصيم Qassim', 26.325990, 43.974970, 'SA Qassim بريدة القصيم'),
(110690, 'SA', 'Asir', 'أبها وخميس مشيط', 'Abha', 'أبها خميس مشيط عسير Abha', 18.216390, 42.505280, 'SA Abha أبها خميس مشيط'),
-- تركيا
(323786, 'TR', 'Ankara', 'أنقرة', 'Ankara', 'أنقرة Ankara', 39.919870, 32.854270, 'TR Ankara أنقرة'),
(311046, 'TR', 'Izmir', 'إزمير', 'Izmir', 'إزمير Izmir', 38.412730, 27.138380, 'TR Izmir إزمير'),
(750269, 'TR', 'Bursa', 'بورصة', 'Bursa', 'بورصة Bursa', 40.195590, 29.060130, 'TR Bursa بورصة'),
(323777, 'TR', 'Antalya', 'أنطاليا', 'Antalya', 'أنطاليا Antalya', 36.908120, 30.695560, 'TR Antalya أنطاليا'),
(314830, 'TR', 'Gaziantep', 'غازي عنتاب', 'Gaziantep', 'غازي عنتاب Gaziantep', 37.059440, 37.382500, 'TR Gaziantep غازي عنتاب'),
(306571, 'TR', 'Konya', 'قونيا', 'Konya', 'قونيا Konya', 37.871350, 32.484640, 'TR Konya قونيا'),
(311728, 'TR', 'Mersin', 'مرسين', 'Mersin', 'مرسين Mersin', 36.812100, 34.641480, 'TR Mersin مرسين'),
-- الإمارات
(292223, 'AE', 'Dubai', 'دبي', 'Dubai', 'دبي Dubai', 25.204849, 55.270783, 'AE Dubai دبي'),
(292968, 'AE', 'Abu Dhabi', 'أبوظبي والعين', 'Abu Dhabi', 'أبوظبي العين Abu Dhabi', 24.453884, 54.377344, 'AE Abu Dhabi أبوظبي العين'),
(292672, 'AE', 'Sharjah', 'الشارقة وعجمان', 'Sharjah', 'الشارقة عجمان Sharjah Ajman', 25.346255, 55.420932, 'AE Sharjah الشارقة عجمان')
ON CONFLICT (geoname_id) DO NOTHING;

-- بذرة تأسيسية للأكاديمية التدريبية الرسمية (الفجوة 9)
INSERT INTO sawyan.academy_courses (slug, title_i18n, content_i18n, media_url, sort_order, is_published) VALUES
(
    'sawyan-welcome-constitution',
    '{"ar":"١. دليل الانطلاق السريع: كيف يعمل نظام الاستهلاك الاستثماري SAWYAN؟","en":"1. Quick Start Guide"}'::jsonb,
    '{"ar":"شرح مبسط لمعادلة العمولات الحقيقية من مشترياتك اليومية، صندوق الهدف الشهري ($24.75)، وترحيل الـ Carry On تلقائياً دون أي رسوم اشتراك.","en":"Core consumer cashback & tree system overview."}'::jsonb,
    'https://sawyan.global/academy/welcome',
    1,
    true
),
(
    'leader-10-generations-guide',
    '{"ar":"٢. دليل قادة الشجرة: بناء الفريق المتوازن ومتابعة الأجيال العشرة","en":"2. Tree Leaders Playbook"}'::jsonb,
    '{"ar":"كيف تستخدم رابط الدعوة الذكي وبطاقة QR، وكيف تقرأ رادار الأعضاء القريبين من إغلاق الهدف الشهري قبل نهاية الشهر لمضاعفة التأهل.","en":"How to use smart referral QR and 10-gen follow-up filters."}'::jsonb,
    'https://sawyan.global/academy/leaders',
    2,
    true
),
(
    'kyc-and-safe-withdrawals',
    '{"ar":"٣. توثيق الهوية (KYC) وقواعد السحب النقدي الآمن","en":"3. KYC & Safe Payouts"}'::jsonb,
    '{"ar":"خطوات رفع وثيقة الهوية/الإقامة، مطابقة الاسم البنكي، وفترة التهدئة الأمنية (72 ساعة) عند تغيير وسيلة استلام الأرباح.","en":"KYC verification and payout security rules."}'::jsonb,
    'https://sawyan.global/academy/kyc-payouts',
    3,
    true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 1. الفجوة (2): محرك الدول النشطة والمدن والفئات للواجهات العامة واستمارات التسجيل
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_public_active_countries_and_cities()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_countries     JSONB;
    v_all_countries JSONB;
    v_categories    JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.country_code ASC), '[]'::jsonb)
      INTO v_countries
      FROM (
          SELECT c.id,
                 c.country_code,
                 c.country_name_i18n,
                 c.currency_code,
                 c.iana_timezone,
                 c.admin_fx_rate,
                 c.monthly_target_usd,
                 gs.s01_gens AS numerical_stopper_s01,
                 gs.s02_slots AS upline_ceiling_s02,
                 ((2::numeric ^ LEAST(gs.s01_gens, 40)) - 1) AS ideal_tree_nodes,
                 TRUNC(c.monthly_target_usd / gs.s02_slots, 2) AS unit_share_usd,
                 c.financial_stopper_usd,
                 ROUND((((2::numeric ^ LEAST(gs.s01_gens, 40)) - 1) * TRUNC(c.monthly_target_usd / gs.s02_slots, 2))::numeric, 2) AS default_financial_stopper_usd,
                 c.vat_rate,
                 c.payout_day,
                 COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                         'geoname_id', g.geoname_id,
                         'city_name', g.city_name,
                         'asciiname', g.asciiname,
                         'admin1_name', g.admin1_name
                     ) ORDER BY g.city_name ASC)
                     FROM sawyan.geonames_locations g
                     WHERE g.country_code = c.country_code
                       AND COALESCE(g.alternate_names, '') NOT LIKE '%__GEO_BULK__%'
                 ), '[]'::jsonb) AS cities
            FROM sawyan.countries c
            CROSS JOIN LATERAL (
                SELECT GREATEST(COALESCE(s.numerical_stopper_s01, 11), 1) AS s01_gens,
                       GREATEST(COALESCE(s.upline_ceiling_s02, 11), 1) AS s02_slots
                  FROM sawyan.settings s
                 WHERE s.country_id IS NULL
                 ORDER BY s.effective_from DESC, s.recorded_at DESC
                 LIMIT 1
            ) gs
           WHERE c.is_active = true
      ) t;

    SELECT COALESCE(jsonb_agg(row_to_json(ac)::jsonb ORDER BY ac.is_active DESC, ac.country_code ASC), '[]'::jsonb)
      INTO v_all_countries
      FROM (
          SELECT c.id,
                 c.country_code,
                 c.country_name_i18n,
                 c.currency_code,
                 c.iana_timezone,
                 c.is_active,
                 COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                         'geoname_id', g.geoname_id,
                         'city_name', g.city_name,
                         'asciiname', g.asciiname,
                         'admin1_name', g.admin1_name
                     ) ORDER BY g.city_name ASC)
                     FROM sawyan.geonames_locations g
                     WHERE g.country_code = c.country_code
                       AND COALESCE(g.alternate_names, '') NOT LIKE '%__GEO_BULK__%'
                 ), '[]'::jsonb) AS cities
            FROM sawyan.countries c
      ) ac;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cat.id,
        'slug', cat.slug,
        'name_i18n', cat.name_i18n
    ) ORDER BY cat.id ASC), '[]'::jsonb)
      INTO v_categories
      FROM sawyan.categories cat
     WHERE cat.is_active = true;

    RETURN jsonb_build_object(
        'countries', v_countries,
        'all_countries', v_all_countries,
        'categories', v_categories
    );
END;
$$;

-- إدارة مدن كل دولة من لوحة الإدارة (إضافة / حذف مدينة)
CREATE OR REPLACE FUNCTION sawyan.admin_manage_country_cities(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_action        VARCHAR, -- 'list' | 'add' | 'delete'
    p_country_code  CHAR(2),
    p_city_name_ar  TEXT    DEFAULT NULL,
    p_city_name_en  TEXT    DEFAULT NULL,
    p_geoname_id    BIGINT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_cc     CHAR(2);
    v_act    VARCHAR(20);
    v_new_id BIGINT;
    v_cities JSONB;
BEGIN
    v_act := lower(trim(COALESCE(p_action, 'list')));
    IF v_act = 'list' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    ELSE
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'data_entry', 'reviewer'], true);
    END IF;

    v_cc := upper(substr(trim(COALESCE(p_country_code, '')), 1, 2));
    IF NOT EXISTS (SELECT 1 FROM sawyan.countries WHERE country_code = v_cc) THEN
        RAISE EXCEPTION 'COUNTRY_NOT_FOUND: %', v_cc;
    END IF;

    IF v_act = 'add' THEN
        IF length(trim(COALESCE(p_city_name_ar, ''))) < 2 THEN
            RAISE EXCEPTION 'CITY_NAME_REQUIRED';
        END IF;
        SELECT COALESCE(MAX(geoname_id), 9000000) + 1 INTO v_new_id FROM sawyan.geonames_locations WHERE geoname_id >= 9000000;
        INSERT INTO sawyan.geonames_locations (
            geoname_id, country_code, admin1_name, city_name, asciiname, alternate_names, latitude, longitude, search_vector
        ) VALUES (
            v_new_id,
            v_cc,
            COALESCE(NULLIF(trim(p_city_name_en), ''), trim(p_city_name_ar)),
            trim(p_city_name_ar),
            COALESCE(NULLIF(trim(p_city_name_en), ''), trim(p_city_name_ar)),
            trim(p_city_name_ar) || ' ' || COALESCE(trim(p_city_name_en), ''),
            0.0, 0.0,
            v_cc || ' ' || trim(p_city_name_ar) || ' ' || COALESCE(trim(p_city_name_en), '')
        );
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'country_city_added', 'geonames_locations', v_new_id::text, NULL, jsonb_build_object('country_code', v_cc, 'city_name', trim(p_city_name_ar)));
    ELSIF v_act = 'delete' AND p_geoname_id IS NOT NULL THEN
        UPDATE sawyan.members SET city_geoname_id = NULL WHERE city_geoname_id = p_geoname_id;
        UPDATE sawyan.merchant_branches SET city_geoname_id = NULL WHERE city_geoname_id = p_geoname_id;
        DELETE FROM sawyan.geonames_locations WHERE geoname_id = p_geoname_id AND country_code = v_cc;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'country_city_deleted', 'geonames_locations', p_geoname_id::text, NULL, jsonb_build_object('country_code', v_cc));
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'geoname_id', g.geoname_id,
        'city_name', g.city_name,
        'asciiname', g.asciiname
    ) ORDER BY g.city_name ASC), '[]'::jsonb)
      INTO v_cities
      FROM sawyan.geonames_locations g
     WHERE g.country_code = v_cc;

    RETURN jsonb_build_object('country_code', v_cc, 'cities', v_cities);
END;
$$;

-- ============================================================================
-- 2. الفجوة (1): تأسيس قادة الجيل الأول تحت الجذر المؤسسي #0 (حصري للمؤسس السيادي)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.verify_root_invite_token(
    p_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_root   sawyan.members%ROWTYPE;
    v_tokens JSONB;
    v_item   JSONB;
BEGIN
    IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'INVALID_TOKEN_FORMAT');
    END IF;

    SELECT * INTO v_root FROM sawyan.members WHERE member_code = 0;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'ROOT_NOT_FOUND');
    END IF;

    v_tokens := COALESCE(v_root.metadata->'root_invite_tokens', '[]'::jsonb);
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_tokens) LOOP
        IF (v_item->>'token') = trim(p_token) THEN
            IF COALESCE((v_item->>'used')::boolean, false) IS TRUE THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'TOKEN_ALREADY_USED');
            END IF;
            IF ((v_item->>'expires_at')::timestamptz) <= now() THEN
                RETURN jsonb_build_object('valid', false, 'reason', 'TOKEN_EXPIRED');
            END IF;
            RETURN jsonb_build_object(
                'valid', true,
                'sponsor_code', 0,
                'display_name', '👑 الجذر المؤسسي للشركة (#0 — دعوة قائد جيل أول موثقة)',
                'country_code', COALESCE(v_item->>'country_code', 'EG'),
                'leader_note', COALESCE(v_item->>'leader_note', ''),
                'expires_at', v_item->>'expires_at'
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('valid', false, 'reason', 'TOKEN_NOT_FOUND');
END;
$$;

-- ترقية register_new_member لدعم التوكين التأسيسي وحيد الاستخدام تحت #0 مع استمرار الحظر المطلق للعامة بدون توكين
CREATE OR REPLACE FUNCTION sawyan.register_new_member(
    p_full_name                VARCHAR(150),
    p_phone                    VARCHAR(24),
    p_sponsor_code             BIGINT,
    p_password                 TEXT,
    p_residency_country_code   CHAR(2) DEFAULT 'EG',
    p_nationality_country_code CHAR(2) DEFAULT NULL,
    p_city_geoname_id          BIGINT DEFAULT NULL,
    p_manual_district          VARCHAR(60) DEFAULT NULL,
    p_email                    VARCHAR(255) DEFAULT NULL,
    p_metadata                 JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_clean_name     VARCHAR(150);
    v_clean_phone    VARCHAR(24);
    v_clean_email    VARCHAR(255);
    v_res_cid        INT;
    v_nat_cid        INT;
    v_sponsor        sawyan.members%ROWTYPE;
    v_next_code      BIGINT;
    v_pwd_hash       TEXT;
    v_session_token  TEXT;
    v_new_member     sawyan.members%ROWTYPE;
    v_country_code   CHAR(2);
    v_city_id        BIGINT := p_city_geoname_id;
    v_root_token     TEXT;
    v_tokens         JSONB;
    v_new_tokens     JSONB := '[]'::jsonb;
    v_tok_item       JSONB;
    v_tok_matched    BOOLEAN := false;
    v_seed_root_ok   BOOLEAN := false;
    v_safe_meta      JSONB := '{}'::jsonb;
    v_avatar         TEXT;
BEGIN
    v_clean_name  := trim(COALESCE(p_full_name, ''));
    v_clean_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s+', '', 'g');

    IF length(v_clean_name) < 3 THEN
        RAISE EXCEPTION 'INVALID_FULL_NAME';
    END IF;
    IF length(v_clean_phone) < 7 THEN
        RAISE EXCEPTION 'INVALID_PHONE_NUMBER';
    END IF;

    IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) IN ('123456', '12345678', 'password', '00000000') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED: Password must be >= 8 characters and not default.';
    END IF;

    v_root_token := NULLIF(trim(COALESCE(p_metadata->>'root_invite_token', '')), '');

    IF (p_sponsor_code IS NULL OR p_sponsor_code = 0) THEN
        IF v_root_token IS NULL THEN
            RAISE EXCEPTION 'ROOT_SPONSOR_RESTRICTED_TO_ADMIN: Public self-registration requires an active member sponsor (>0) or a valid Founder Root Invite Token.';
        END IF;

        SELECT * INTO v_sponsor FROM sawyan.members WHERE member_code = 0 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ROOT_MEMBER_MISSING'; END IF;

        v_tokens := COALESCE(v_sponsor.metadata->'root_invite_tokens', '[]'::jsonb);
        FOR v_tok_item IN SELECT * FROM jsonb_array_elements(v_tokens) LOOP
            IF (v_tok_item->>'token') = v_root_token
               AND COALESCE((v_tok_item->>'used')::boolean, false) IS FALSE
               AND ((v_tok_item->>'expires_at')::timestamptz) > now() THEN
                v_tok_matched := true;
                v_new_tokens := v_new_tokens || jsonb_build_array(
                    v_tok_item || jsonb_build_object('used', true, 'used_at', now(), 'used_by_phone', v_clean_phone)
                );
            ELSE
                v_new_tokens := v_new_tokens || jsonb_build_array(v_tok_item);
            END IF;
        END LOOP;

        IF NOT v_tok_matched THEN
            RAISE EXCEPTION 'INVALID_OR_EXPIRED_ROOT_INVITE_TOKEN: This one-time Founder link has already been used or expired.';
        END IF;

        UPDATE sawyan.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('root_invite_tokens', v_new_tokens)
         WHERE id = v_sponsor.id;

        v_seed_root_ok := true;
    ELSE
        SELECT * INTO v_sponsor
          FROM sawyan.members
         WHERE member_code = p_sponsor_code
           AND status = 'active'
           AND is_tombstone_banned = false;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SPONSOR_NOT_FOUND: %', p_sponsor_code;
        END IF;
    END IF;

    SELECT id, country_code INTO v_res_cid, v_country_code
      FROM sawyan.countries
     WHERE country_code = upper(trim(COALESCE(p_residency_country_code, 'EG')));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COUNTRY_NOT_REGISTERED: %', p_residency_country_code;
    END IF;

    IF p_nationality_country_code IS NOT NULL THEN
        SELECT id INTO v_nat_cid FROM sawyan.countries WHERE country_code = upper(trim(p_nationality_country_code));
    END IF;
    v_nat_cid := COALESCE(v_nat_cid, v_res_cid);

    IF v_city_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM sawyan.geonames_locations WHERE geoname_id = v_city_id) THEN
            v_city_id := NULL;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM sawyan.members WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'PHONE_ALREADY_REGISTERED';
    END IF;

    v_clean_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
    IF v_clean_email IS NOT NULL AND EXISTS (SELECT 1 FROM sawyan.members WHERE lower(email) = v_clean_email) THEN
        RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_member_code_alloc'));
    SELECT COALESCE(MAX(member_code), 0) + 1 INTO v_next_code FROM sawyan.members;

    IF v_clean_email IS NULL THEN
        v_clean_email := 'member' || v_next_code || '@users.sawyan.local';
    END IF;

    v_pwd_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(24), 'hex');

    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        IF p_metadata ? 'gender' AND NULLIF(trim(COALESCE(p_metadata->>'gender', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('gender', left(trim(p_metadata->>'gender'), 20));
        END IF;
        IF p_metadata ? 'national_id_masked' AND NULLIF(trim(COALESCE(p_metadata->>'national_id_masked', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('national_id_masked', left(trim(p_metadata->>'national_id_masked'), 16));
        END IF;
        IF p_metadata ? 'preferred_lang' AND NULLIF(trim(COALESCE(p_metadata->>'preferred_lang', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('preferred_lang', left(trim(p_metadata->>'preferred_lang'), 10));
        END IF;
        IF p_metadata ? 'device_platform' AND NULLIF(trim(COALESCE(p_metadata->>'device_platform', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('device_platform', left(trim(p_metadata->>'device_platform'), 32));
        END IF;
        IF p_metadata ? 'referral_channel' AND NULLIF(trim(COALESCE(p_metadata->>'referral_channel', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('referral_channel', left(trim(p_metadata->>'referral_channel'), 40));
        END IF;
        IF p_metadata ? 'marketing_opt_in' THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('marketing_opt_in', COALESCE((p_metadata->>'marketing_opt_in')::boolean, false));
        END IF;
        v_avatar := sawyan.validate_attachment_data(p_metadata->>'avatar_url', 200000, true);
        IF v_avatar IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('avatar_url', v_avatar);
        END IF;
    END IF;

    INSERT INTO sawyan.members (
        member_code, full_name, email, phone,
        nationality_country_id, residency_country_id, city_geoname_id, manual_district_fallback,
        auth_user_id, sponsor_id, placement_side, generation_in_tree,
        is_active_in_tree, kyc_status, status, metadata
    ) VALUES (
        v_next_code, v_clean_name, v_clean_email, v_clean_phone,
        v_nat_cid, v_res_cid, v_city_id, NULLIF(trim(COALESCE(p_manual_district, '')), ''),
        gen_random_uuid(), v_sponsor.id,
        CASE WHEN v_seed_root_ok THEN 'root_direct' ELSE 'left' END,
        1,
        true, 'unverified', 'active',
        v_safe_meta || jsonb_build_object(
            'pwd_bcrypt', v_pwd_hash,
            'active_session_token', v_session_token,
            'seed_root_approved', v_seed_root_ok
        )
    ) RETURNING * INTO v_new_member;

    INSERT INTO sawyan.wallets (member_id, balance_usd, pending_balance_usd, s03_suspense_balance_usd, total_earned_usd)
    VALUES (v_new_member.id, 0.00, 0.00, 0.00, 0.00)
    ON CONFLICT (member_id) DO NOTHING;

    PERFORM sawyan.append_audit_log(
        'member',
        v_new_member.id,
        CASE WHEN v_seed_root_ok THEN 'founding_leader_registered_under_root_0' ELSE 'member_registered' END,
        'members',
        v_new_member.id::text,
        NULL,
        jsonb_build_object('member_code', v_new_member.member_code, 'sponsor_code', v_sponsor.member_code, 'country', v_country_code)
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_session_token,
        'member', jsonb_build_object(
            'id', v_new_member.id,
            'member_code', v_new_member.member_code,
            'full_name', v_new_member.full_name,
            'email', v_new_member.email,
            'phone', v_new_member.phone,
            'country_code', v_country_code,
            'residency_country_id', v_new_member.residency_country_id,
            'placement_side', v_new_member.placement_side,
            'generation_in_tree', v_new_member.generation_in_tree,
            'parent_member_id', v_new_member.parent_member_id,
            'sponsor_id', v_new_member.sponsor_id,
            'sponsor_name', v_sponsor.full_name,
            'kyc_status', v_new_member.kyc_status,
            'created_at', v_new_member.created_at
        )
    );
END;
$$;

-- الأداة السيادية الحصرية للمؤسس لإدارة قادة الجيل الأول تحت الجذر #0
CREATE OR REPLACE FUNCTION sawyan.admin_manage_root_leaders(
    p_admin_id         UUID,
    p_session_token    TEXT,
    p_action           VARCHAR, -- 'list' | 'generate_token' | 'create_direct' | 'revoke_token'
    p_leader_name      VARCHAR DEFAULT NULL,
    p_leader_phone     VARCHAR DEFAULT NULL,
    p_country_code     CHAR(2) DEFAULT 'EG',
    p_initial_password TEXT    DEFAULT NULL,
    p_leader_email     VARCHAR DEFAULT NULL,
    p_token_to_revoke  TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm          JSONB;
    v_act          VARCHAR(30);
    v_root         sawyan.members%ROWTYPE;
    v_tokens       JSONB;
    v_new_tok      TEXT;
    v_exp          TIMESTAMPTZ;
    v_leaders      JSONB;
    v_res_cid      INT;
    v_next_code    BIGINT;
    v_new_leader   sawyan.members%ROWTYPE;
    v_clean_phone  VARCHAR(24);
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver'], false);
    v_act := lower(trim(COALESCE(p_action, 'list')));

    IF v_act <> 'list' AND COALESCE((v_adm->>'is_sovereign_founder')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'FOUNDER_EXCLUSIVE_AUTHORITY: Direct placement and invite tokens under Root #0 are strictly exclusive to the Sovereign Founder.';
    END IF;

    SELECT * INTO v_root FROM sawyan.members WHERE member_code = 0 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ROOT_0_MISSING'; END IF;

    v_tokens := COALESCE(v_root.metadata->'root_invite_tokens', '[]'::jsonb);

    IF v_act = 'generate_token' THEN
        v_new_tok := encode(extensions.gen_random_bytes(20), 'hex');
        v_exp     := now() + interval '48 hours';
        v_tokens  := jsonb_build_array(jsonb_build_object(
            'token', v_new_tok,
            'leader_note', COALESCE(NULLIF(trim(p_leader_name), ''), 'قائد جيل أول تأسيسي'),
            'country_code', upper(COALESCE(NULLIF(trim(p_country_code), ''), 'EG')),
            'created_at', now(),
            'expires_at', v_exp,
            'used', false
        )) || v_tokens;

        UPDATE sawyan.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('root_invite_tokens', v_tokens)
         WHERE id = v_root.id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'root_0_one_time_invite_generated', 'members', v_root.id::text, NULL, jsonb_build_object('leader_note', p_leader_name, 'expires_at', v_exp));

    ELSIF v_act = 'revoke_token' AND p_token_to_revoke IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
          INTO v_tokens
          FROM jsonb_array_elements(v_tokens) x
         WHERE (x->>'token') <> trim(p_token_to_revoke);

        UPDATE sawyan.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('root_invite_tokens', v_tokens)
         WHERE id = v_root.id;

    ELSIF v_act = 'create_direct' THEN
        v_clean_phone := regexp_replace(trim(COALESCE(p_leader_phone, '')), '\s+', '', 'g');
        IF length(trim(COALESCE(p_leader_name, ''))) < 3 OR length(v_clean_phone) < 7 THEN
            RAISE EXCEPTION 'LEADER_NAME_AND_PHONE_REQUIRED';
        END IF;
        IF p_initial_password IS NULL OR length(trim(p_initial_password)) < 8 OR trim(p_initial_password) = '123456' THEN
            RAISE EXCEPTION 'STRONG_INITIAL_PASSWORD_REQUIRED';
        END IF;
        IF EXISTS (SELECT 1 FROM sawyan.members WHERE phone = v_clean_phone) THEN
            RAISE EXCEPTION 'PHONE_ALREADY_REGISTERED';
        END IF;

        SELECT id INTO v_res_cid FROM sawyan.countries WHERE country_code = upper(COALESCE(NULLIF(trim(p_country_code), ''), 'EG'));
        IF v_res_cid IS NULL THEN RAISE EXCEPTION 'COUNTRY_NOT_FOUND'; END IF;

        PERFORM pg_advisory_xact_lock(hashtext('sawyan_member_code_alloc'));
        SELECT COALESCE(MAX(member_code), 0) + 1 INTO v_next_code FROM sawyan.members;

        INSERT INTO sawyan.members (
            member_code, full_name, email, phone,
            nationality_country_id, residency_country_id,
            auth_user_id, sponsor_id, parent_member_id, placement_side, generation_in_tree,
            is_active_in_tree, kyc_status, status, metadata
        ) VALUES (
            v_next_code,
            trim(p_leader_name),
            COALESCE(NULLIF(lower(trim(p_leader_email)), ''), 'leader' || v_next_code || '@users.sawyan.local'),
            v_clean_phone,
            v_res_cid, v_res_cid,
            gen_random_uuid(), v_root.id, v_root.id, 'root_direct', 1,
            true, 'verified', 'active',
            jsonb_build_object(
                'pwd_bcrypt', extensions.crypt(trim(p_initial_password), extensions.gen_salt('bf', 10)),
                'seed_root_approved', true,
                'must_change_password', true,
                'created_by_founder', p_admin_id
            )
        ) RETURNING * INTO v_new_leader;

        INSERT INTO sawyan.wallets (member_id, balance_usd, pending_balance_usd, s03_suspense_balance_usd, total_earned_usd)
        VALUES (v_new_leader.id, 0.00, 0.00, 0.00, 0.00)
        ON CONFLICT (member_id) DO NOTHING;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'root_0_direct_leader_created', 'members', v_new_leader.id::text, NULL, jsonb_build_object('member_code', v_next_code, 'full_name', v_new_leader.full_name));
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(ld)::jsonb ORDER BY ld.member_code ASC), '[]'::jsonb)
      INTO v_leaders
      FROM (
          SELECT m.id, m.member_code, m.full_name, m.phone, m.email, c.country_code,
                 m.kyc_status, m.created_at,
                 (SELECT COUNT(*) FROM sawyan.tree_closure tc WHERE tc.ancestor_id = m.id AND tc.depth > 0) AS team_size
            FROM sawyan.members m
            JOIN sawyan.countries c ON c.id = m.residency_country_id
           WHERE m.sponsor_id = v_root.id AND m.member_code > 0
      ) ld;

    RETURN jsonb_build_object(
        'generated_token', v_new_tok,
        'created_leader_code', v_new_leader.member_code,
        'tokens', v_tokens,
        'direct_leaders', v_leaders
    );
END;
$$;

-- ============================================================================
-- 3. الفجوة (3): إدارة الموظفين والصلاحيات السبعة ونطاق الدولة والطرد الفوري (حصري للمؤسس)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_manage_staff_accounts(
    p_admin_id       UUID,
    p_session_token  TEXT,
    p_action         VARCHAR, -- 'list' | 'create' | 'update' | 'reset_password' | 'kill_deactivate' | 'activate'
    p_target_id      UUID    DEFAULT NULL,
    p_full_name      VARCHAR DEFAULT NULL,
    p_email          VARCHAR DEFAULT NULL,
    p_role           VARCHAR DEFAULT NULL,
    p_password       TEXT    DEFAULT NULL,
    p_country_scope  VARCHAR DEFAULT 'GLOBAL'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm   JSONB;
    v_act   VARCHAR(30);
    v_staff JSONB;
    v_tid   UUID;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    v_act := lower(trim(COALESCE(p_action, 'list')));

    IF v_act <> 'list' AND COALESCE((v_adm->>'is_sovereign_founder')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'FOUNDER_EXCLUSIVE_AUTHORITY: Managing admin staff accounts and roles is strictly exclusive to the Sovereign Founder.';
    END IF;

    IF v_act = 'create' THEN
        IF length(trim(COALESCE(p_full_name, ''))) < 3 OR length(trim(COALESCE(p_email, ''))) < 5 THEN
            RAISE EXCEPTION 'STAFF_NAME_AND_EMAIL_REQUIRED';
        END IF;
        IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) = '123456' THEN
            RAISE EXCEPTION 'STRONG_STAFF_PASSWORD_REQUIRED';
        END IF;
        IF p_role NOT IN ('data_entry', 'reviewer', 'approver', 'auditor', 'finance', 'support', 'kyc_officer') THEN
            RAISE EXCEPTION 'INVALID_STAFF_ROLE: %', p_role;
        END IF;

        INSERT INTO sawyan.admins (
            full_name, email, auth_user_id, role, must_change_password, two_factor_enabled, is_active, password_hash, metadata
        ) VALUES (
            trim(p_full_name),
            lower(trim(p_email)),
            gen_random_uuid(),
            p_role,
            true,
            true,
            true,
            extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
            jsonb_build_object('country_scope', upper(COALESCE(NULLIF(trim(p_country_scope), ''), 'GLOBAL')), 'created_by_founder', p_admin_id)
        ) RETURNING id INTO v_tid;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_account_created', 'admins', v_tid::text, NULL, jsonb_build_object('email', lower(trim(p_email)), 'role', p_role, 'country_scope', p_country_scope));

    ELSIF v_act = 'update' AND p_target_id IS NOT NULL THEN
        IF p_role IS NOT NULL AND p_role NOT IN ('data_entry', 'reviewer', 'approver', 'auditor', 'finance', 'support', 'kyc_officer') THEN
            RAISE EXCEPTION 'INVALID_STAFF_ROLE: %', p_role;
        END IF;
        UPDATE sawyan.admins
           SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
               role      = COALESCE(NULLIF(trim(p_role), ''), role),
               metadata  = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('country_scope', upper(COALESCE(NULLIF(trim(p_country_scope), ''), COALESCE(metadata->>'country_scope', 'GLOBAL'))))
         WHERE id = p_target_id
           AND COALESCE((metadata->>'is_sovereign_founder')::boolean, false) IS NOT TRUE;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_account_updated', 'admins', p_target_id::text, NULL, jsonb_build_object('role', p_role, 'country_scope', p_country_scope));

    ELSIF v_act = 'reset_password' AND p_target_id IS NOT NULL THEN
        IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) = '123456' THEN
            RAISE EXCEPTION 'STRONG_STAFF_PASSWORD_REQUIRED';
        END IF;
        UPDATE sawyan.admins
           SET password_hash        = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
               must_change_password = true,
               metadata             = (COALESCE(metadata, '{}'::jsonb) - 'session_token_sha256') || jsonb_build_object('session_expires_at', now() - interval '1 minute')
         WHERE id = p_target_id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_password_reset_and_session_cleared', 'admins', p_target_id::text, NULL, '{}'::jsonb);

    ELSIF v_act = 'kill_deactivate' AND p_target_id IS NOT NULL THEN
        IF p_target_id = p_admin_id THEN
            RAISE EXCEPTION 'CANNOT_DEACTIVATE_OWN_FOUNDER_ACCOUNT';
        END IF;
        UPDATE sawyan.admins
           SET is_active = false,
               metadata  = (COALESCE(metadata, '{}'::jsonb) - 'session_token_sha256') || jsonb_build_object('session_expires_at', now() - interval '1 minute', 'killed_at', now())
         WHERE id = p_target_id
           AND COALESCE((metadata->>'is_sovereign_founder')::boolean, false) IS NOT TRUE;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_session_killed_and_deactivated', 'admins', p_target_id::text, NULL, '{}'::jsonb);

    ELSIF v_act = 'activate' AND p_target_id IS NOT NULL THEN
        UPDATE sawyan.admins
           SET is_active = true
         WHERE id = p_target_id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_account_reactivated', 'admins', p_target_id::text, NULL, '{}'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(ad)::jsonb ORDER BY ad.is_founder DESC, ad.created_at ASC), '[]'::jsonb)
      INTO v_staff
      FROM (
          SELECT a.id, a.full_name, a.email, a.role, a.is_active, a.must_change_password,
                 a.last_login_at, a.created_at,
                 COALESCE((a.metadata->>'is_sovereign_founder')::boolean, false) AS is_founder,
                 COALESCE(a.metadata->>'country_scope', 'GLOBAL') AS country_scope
            FROM sawyan.admins a
      ) ad;

    RETURN jsonb_build_object('staff', v_staff);
END;
$$;

-- ============================================================================
-- 4. الفجوة (5): التذاكر الحية باتجاهين + استعادة كلمة المرور بقفل 72 ساعة + التغيير الذاتي
-- ============================================================================
DROP FUNCTION IF EXISTS sawyan.submit_support_or_recovery_ticket(VARCHAR, VARCHAR, TEXT, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID);
CREATE OR REPLACE FUNCTION sawyan.submit_support_or_recovery_ticket(
    p_requester_type VARCHAR, -- 'public' | 'member' | 'merchant'
    p_category       VARCHAR, -- 'password_recovery' | 'general' | 'kyc' | 'withdrawal' | 'merchant' | 'complaint'
    p_subject        TEXT,
    p_message        TEXT,
    p_contact_name   VARCHAR DEFAULT NULL,
    p_contact_phone  VARCHAR DEFAULT NULL,
    p_contact_email  VARCHAR DEFAULT NULL,
    p_requester_id   UUID    DEFAULT NULL,
    p_session_token  TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_tid        UUID;
    v_ref_code   TEXT;
    v_req_uuid   UUID;
    v_rtype      VARCHAR(20);
    v_cat        VARCHAR(40);
    v_verified   BOOLEAN := false;
    v_jwt_role   TEXT;
BEGIN
    IF length(trim(COALESCE(p_message, ''))) < 4 THEN
        RAISE EXCEPTION 'TICKET_MESSAGE_TOO_SHORT';
    END IF;

    v_rtype := lower(trim(COALESCE(p_requester_type, 'public')));
    IF v_rtype NOT IN ('public', 'member', 'merchant') THEN
        v_rtype := 'public';
    END IF;
    v_cat := COALESCE(NULLIF(lower(trim(p_category)), ''), 'general');
    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');

    IF v_rtype = 'member' THEN
        IF NULLIF(trim(COALESCE(p_session_token, '')), '') IS NOT NULL AND p_requester_id IS NOT NULL THEN
            PERFORM sawyan.verify_member_session(p_requester_id, p_session_token);
            v_req_uuid := p_requester_id;
            v_verified := true;
        ELSIF v_jwt_role = 'service_role' AND p_requester_id IS NOT NULL THEN
            v_req_uuid := p_requester_id;
            v_verified := true;
        ELSIF v_cat = 'password_recovery' AND p_requester_id IS NOT NULL AND EXISTS (SELECT 1 FROM sawyan.members WHERE id = p_requester_id) THEN
            v_req_uuid := p_requester_id;
            v_verified := false;
        ELSE
            v_rtype := 'public';
            v_req_uuid := gen_random_uuid();
            v_verified := false;
        END IF;
    ELSIF v_rtype = 'merchant' THEN
        IF NULLIF(trim(COALESCE(p_session_token, '')), '') IS NOT NULL AND p_requester_id IS NOT NULL THEN
            PERFORM sawyan.verify_merchant_session(p_requester_id, p_session_token);
            v_req_uuid := p_requester_id;
            v_verified := true;
        ELSIF v_jwt_role = 'service_role' AND p_requester_id IS NOT NULL THEN
            v_req_uuid := p_requester_id;
            v_verified := true;
        ELSIF v_cat = 'password_recovery' AND p_requester_id IS NOT NULL AND EXISTS (SELECT 1 FROM sawyan.merchants WHERE id = p_requester_id) THEN
            v_req_uuid := p_requester_id;
            v_verified := false;
        ELSE
            v_rtype := 'public';
            v_req_uuid := gen_random_uuid();
            v_verified := false;
        END IF;
    ELSE
        v_req_uuid := gen_random_uuid();
    END IF;

    v_ref_code := 'TKT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    INSERT INTO sawyan.support_tickets (
        requester_type, requester_id, category, priority, status, sla_due_at,
        subject, message_body, metadata
    ) VALUES (
        v_rtype,
        v_req_uuid,
        v_cat,
        CASE WHEN v_cat = 'password_recovery' THEN 'high' ELSE 'normal' END,
        'open',
        now() + interval '24 hours',
        COALESCE(NULLIF(trim(p_subject), ''), 'طلب دعم فني'),
        trim(p_message),
        jsonb_build_object(
            'ticket_ref', v_ref_code,
            'contact_name', COALESCE(trim(p_contact_name), ''),
            'contact_phone', COALESCE(trim(p_contact_phone), ''),
            'contact_email', COALESCE(trim(p_contact_email), ''),
            'requester_verified', v_verified
        )
    ) RETURNING id INTO v_tid;

    RETURN jsonb_build_object(
        'ticket_id', v_tid,
        'ticket_ref', v_ref_code,
        'requester_type', v_rtype,
        'requester_verified', v_verified,
        'status', 'open',
        'sla_hours', 24
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.get_my_support_tickets(
    p_actor_type    VARCHAR, -- 'member' | 'merchant'
    p_actor_id      UUID,
    p_session_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_list JSONB;
BEGIN
    IF lower(trim(p_actor_type)) = 'member' THEN
        PERFORM sawyan.verify_member_session(p_actor_id, p_session_token);
    ELSIF lower(trim(p_actor_type)) = 'merchant' THEN
        PERFORM sawyan.verify_merchant_session(p_actor_id, p_session_token);
    ELSE
        RAISE EXCEPTION 'INVALID_ACTOR_TYPE';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'ticket_ref', COALESCE(t.metadata->>'ticket_ref', substr(t.id::text, 1, 8)),
        'category', t.category,
        'subject', t.subject,
        'message_body', t.message_body,
        'admin_reply', t.admin_reply,
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
      INTO v_list
      FROM sawyan.support_tickets t
     WHERE t.requester_id = p_actor_id;

    RETURN jsonb_build_object('tickets', v_list);
END;
$$;

-- إعادة تعيين كلمة مرور عضو أو تاجر من قِبل الدعم/المؤسس مع تفعيل قفل التهدئة الأمني 72 ساعة على السحب
CREATE OR REPLACE FUNCTION sawyan.admin_reset_user_password(
    p_admin_id       UUID,
    p_session_token  TEXT,
    p_user_type      VARCHAR, -- 'member' | 'merchant'
    p_user_identifier TEXT,   -- UUID, member_code, merchant_code, phone, or email
    p_temp_password  TEXT,
    p_reason         TEXT DEFAULT 'استعادة موثقة عبر التحقق من ملكية الهاتف'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_utype VARCHAR(20);
    v_hash  TEXT;
    v_mem   sawyan.members%ROWTYPE;
    v_mer   sawyan.merchants%ROWTYPE;
BEGIN
    PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'support', 'kyc_officer'], true);

    IF p_temp_password IS NULL OR length(trim(p_temp_password)) < 8 OR trim(p_temp_password) = '123456' THEN
        RAISE EXCEPTION 'STRONG_TEMP_PASSWORD_REQUIRED';
    END IF;

    v_utype := lower(trim(COALESCE(p_user_type, '')));
    v_hash  := extensions.crypt(trim(p_temp_password), extensions.gen_salt('bf', 10));

    IF v_utype = 'member' THEN
        SELECT * INTO v_mem
          FROM sawyan.members
         WHERE member_code > 0
           AND (
               id::text = trim(p_user_identifier)
               OR member_code::text = regexp_replace(trim(p_user_identifier), '^#', '')
               OR phone = trim(p_user_identifier)
               OR lower(email) = lower(trim(p_user_identifier))
           )
         LIMIT 1 FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND_FOR_RESET'; END IF;

        UPDATE sawyan.members
           SET payout_cooldown_until = GREATEST(COALESCE(payout_cooldown_until, now()), now() + interval '72 hours'),
               metadata              = (COALESCE(metadata, '{}'::jsonb) - 'active_session_token') || jsonb_build_object(
                   'pwd_bcrypt', v_hash,
                   'must_change_password', true,
                   'last_admin_pwd_reset_at', now()
               )
         WHERE id = v_mem.id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_password_reset_with_72h_payout_lock', 'members', v_mem.id::text, NULL, jsonb_build_object('member_code', v_mem.member_code, 'reason', p_reason));
        RETURN jsonb_build_object('user_type', 'member', 'code', v_mem.member_code, 'full_name', v_mem.full_name, 'cooldown_hours', 72);

    ELSIF v_utype = 'merchant' THEN
        SELECT * INTO v_mer
          FROM sawyan.merchants
         WHERE id::text = trim(p_user_identifier)
            OR upper(merchant_code) = upper(trim(p_user_identifier))
            OR phone = trim(p_user_identifier)
            OR lower(email) = lower(trim(p_user_identifier))
         LIMIT 1 FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND_FOR_RESET'; END IF;

        UPDATE sawyan.merchants
           SET password_hash = v_hash,
               metadata      = (COALESCE(metadata, '{}'::jsonb) - 'active_session_token') || jsonb_build_object(
                   'must_change_password', true,
                   'last_admin_pwd_reset_at', now()
               )
         WHERE id = v_mer.id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_password_reset', 'merchants', v_mer.id::text, NULL, jsonb_build_object('merchant_code', v_mer.merchant_code, 'reason', p_reason));
        RETURN jsonb_build_object('user_type', 'merchant', 'code', v_mer.merchant_code, 'business_name', v_mer.business_name);
    ELSE
        RAISE EXCEPTION 'INVALID_USER_TYPE';
    END IF;
END;
$$;

-- التغيير الذاتي لكلمة المرور (عضو / تاجر / إداري)
CREATE OR REPLACE FUNCTION sawyan.change_own_password(
    p_actor_type    VARCHAR, -- 'member' | 'merchant' | 'admin'
    p_actor_id      UUID,
    p_session_token TEXT,
    p_old_password  TEXT,
    p_new_password  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_atype    VARCHAR(20);
    v_mem      sawyan.members%ROWTYPE;
    v_mer      sawyan.merchants%ROWTYPE;
    v_adm      sawyan.admins%ROWTYPE;
    v_new_hash TEXT;
BEGIN
    IF p_new_password IS NULL OR length(trim(p_new_password)) < 8 OR trim(p_new_password) IN ('123456', '12345678', 'password', '00000000') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED: New password must be >= 8 characters.';
    END IF;

    v_atype    := lower(trim(COALESCE(p_actor_type, '')));
    v_new_hash := extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10));

    IF v_atype = 'member' THEN
        v_mem := sawyan.verify_member_session(p_actor_id, p_session_token);
        IF COALESCE(v_mem.metadata->>'pwd_bcrypt', '') <> extensions.crypt(p_old_password, COALESCE(v_mem.metadata->>'pwd_bcrypt', '')) THEN
            RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
        END IF;
        UPDATE sawyan.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('pwd_bcrypt', v_new_hash, 'must_change_password', false)
         WHERE id = v_mem.id;

    ELSIF v_atype = 'merchant' THEN
        v_mer := sawyan.verify_merchant_session(p_actor_id, p_session_token);
        IF v_mer.password_hash IS NULL OR v_mer.password_hash <> extensions.crypt(p_old_password, v_mer.password_hash) THEN
            RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
        END IF;
        UPDATE sawyan.merchants
           SET password_hash = v_new_hash,
               metadata      = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('must_change_password', false)
         WHERE id = v_mer.id;

    ELSIF v_atype = 'admin' THEN
        PERFORM sawyan.verify_admin_session(p_actor_id, p_session_token, NULL, false);
        SELECT * INTO v_adm FROM sawyan.admins WHERE id = p_actor_id FOR UPDATE;
        IF v_adm.password_hash IS NULL OR v_adm.password_hash <> extensions.crypt(p_old_password, v_adm.password_hash) THEN
            RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
        END IF;
        UPDATE sawyan.admins
           SET password_hash        = v_new_hash,
               must_change_password = false
         WHERE id = v_adm.id;
    ELSE
        RAISE EXCEPTION 'INVALID_ACTOR_TYPE';
    END IF;

    PERFORM sawyan.append_audit_log(v_atype, p_actor_id, 'self_password_changed', v_atype || 's', p_actor_id::text, NULL, '{}'::jsonb);
    RETURN jsonb_build_object('status', 'password_updated');
END;
$$;

-- ============================================================================
-- 5. الفجوة (6): دورة السحب النقدي للمحاسب (إتمام بمرجع حوالة إلزامي + رفض بقيد عكسي ذري يعيد 100% للمحفظة)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_decide_withdrawal_v3(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_wallet_tx_id  UUID,
    p_decision      VARCHAR, -- 'completed' | 'rejected'
    p_payout_ref    TEXT    DEFAULT NULL,
    p_reject_reason TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm        JSONB;
    v_is_founder BOOLEAN;
    v_wtx        sawyan.wallet_transactions%ROWTYPE;
    v_wallet     sawyan.wallets%ROWTYPE;
    v_member     sawyan.members%ROWTYPE;
    v_settings   sawyan.settings%ROWTYPE;
    v_rev_je_id  UUID;
    v_dec        VARCHAR(20);
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['finance', 'approver'], true);
    v_is_founder := COALESCE((v_adm->>'is_sovereign_founder')::boolean, false);
    v_dec := lower(trim(COALESCE(p_decision, '')));

    SELECT * INTO v_wtx
      FROM sawyan.wallet_transactions
     WHERE id = p_wallet_tx_id AND transaction_type = 'withdrawal'
     FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_TX_NOT_FOUND'; END IF;
    IF v_wtx.status <> 'processing_payout' THEN
        RAISE EXCEPTION 'WITHDRAWAL_ALREADY_PROCESSED: current_status=%', v_wtx.status;
    END IF;

    SELECT * INTO v_wallet FROM sawyan.wallets WHERE id = v_wtx.wallet_id FOR UPDATE;
    SELECT * INTO v_member FROM sawyan.members WHERE id = v_wallet.member_id;
    SELECT * INTO v_settings FROM sawyan.settings WHERE country_id IS NULL ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;

    IF v_dec = 'completed' THEN
        IF length(trim(COALESCE(p_payout_ref, ''))) < 3 THEN
            RAISE EXCEPTION 'PAYOUT_REFERENCE_REQUIRED: Bank / InstaPay / Wallet transfer reference number is mandatory.';
        END IF;

        IF NOT v_is_founder AND v_wtx.amount_usd >= COALESCE(v_settings.wht_threshold_usd, 200.00) THEN
            RAISE EXCEPTION 'WITHDRAWAL_DUAL_APPROVAL_REQUIRED_W05: Withdrawals >= % USD require Maker-Checker approval.', COALESCE(v_settings.wht_threshold_usd, 200.00);
        END IF;

        UPDATE sawyan.wallet_transactions
           SET status = 'completed'
         WHERE id = v_wtx.id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES (
            'member', v_member.id, 'WithdrawalCompleted', 'in_app',
            jsonb_build_object('wallet_tx_id', v_wtx.id, 'amount_usd', v_wtx.amount_usd, 'payout_ref', trim(p_payout_ref)),
            now()
        );

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'withdrawal_payout_completed', 'wallet_transactions', v_wtx.id::text, NULL, jsonb_build_object('amount_usd', v_wtx.amount_usd, 'payout_ref', trim(p_payout_ref), 'sovereign_founder', v_is_founder));
        RETURN jsonb_build_object('status', 'completed', 'wallet_tx_id', v_wtx.id, 'payout_ref', trim(p_payout_ref));

    ELSIF v_dec = 'rejected' THEN
        IF length(trim(COALESCE(p_reject_reason, ''))) < 4 THEN
            RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
        END IF;

        -- القيد المحاسبي العكسي المتزن 100%: Dr 1102 / Cr 2302 وإعادة كامل الرصيد لمحفظة العضو دون خصم سنت واحد
        INSERT INTO sawyan.journal_entries (
            source_type, source_id, country_id, fx_rate_used, reverses_entry_id, description
        ) VALUES (
            'WITHDRAWAL', v_member.id, v_member.residency_country_id, 1.000000, v_wtx.journal_entry_id,
            'Reversal of Rejected Member Withdrawal: ' || trim(p_reject_reason)
        ) RETURNING id INTO v_rev_je_id;

        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code) VALUES
        (v_rev_je_id, '1102', 'psp', NULL, v_wtx.amount_usd, 0.00, v_wtx.amount_usd, 'USD'),
        (v_rev_je_id, '2302', 'member', v_member.id, 0.00, v_wtx.amount_usd, v_wtx.amount_usd, 'USD');

        UPDATE sawyan.wallets
           SET balance_usd = balance_usd + v_wtx.amount_usd,
               updated_at  = now()
         WHERE id = v_wallet.id;

        UPDATE sawyan.wallet_transactions
           SET status = 'rejected'
         WHERE id = v_wtx.id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES (
            'member', v_member.id, 'WithdrawalRejectedRefunded', 'in_app',
            jsonb_build_object('wallet_tx_id', v_wtx.id, 'amount_usd', v_wtx.amount_usd, 'reason', trim(p_reject_reason)),
            now()
        );

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'withdrawal_rejected_and_refunded_100pct', 'wallet_transactions', v_wtx.id::text, NULL, jsonb_build_object('amount_usd', v_wtx.amount_usd, 'reversal_je_id', v_rev_je_id, 'reason', trim(p_reject_reason)));
        RETURN jsonb_build_object('status', 'rejected', 'refunded_usd', v_wtx.amount_usd, 'reversal_journal_entry_id', v_rev_je_id);
    ELSE
        RAISE EXCEPTION 'INVALID_WITHDRAWAL_DECISION: %', p_decision;
    END IF;
END;
$$;

-- ============================================================================
-- 6. الفجوة (7): رفع توثيق الهوية KYC وطلب نقل دولة الإقامة للعضو (يسري أول الشهر التالي)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.submit_member_kyc_or_residency_move(
    p_member_id                UUID,
    p_session_token            TEXT,
    p_request_kind             VARCHAR, -- 'kyc_verification' | 'residency_move'
    p_legal_full_name          VARCHAR,
    p_document_type            VARCHAR, -- 'national_id' | 'passport' | 'residency_permit'
    p_document_number          VARCHAR,
    p_document_image_data      TEXT    DEFAULT NULL,
    p_target_country_code      CHAR(2) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_mem       sawyan.members%ROWTYPE;
    v_kind      VARCHAR(30);
    v_tgt_cc    CHAR(2);
    v_clean_doc TEXT;
BEGIN
    v_mem  := sawyan.verify_member_session(p_member_id, p_session_token);
    v_kind := lower(trim(COALESCE(p_request_kind, 'kyc_verification')));
    v_clean_doc := COALESCE(sawyan.validate_attachment_data(p_document_image_data, 480000, true), '');

    IF length(trim(COALESCE(p_legal_full_name, ''))) < 5 OR length(trim(COALESCE(p_document_number, ''))) < 4 THEN
        RAISE EXCEPTION 'KYC_FULL_NAME_AND_DOC_NUMBER_REQUIRED';
    END IF;

    IF v_kind = 'residency_move' THEN
        v_tgt_cc := upper(substr(trim(COALESCE(p_target_country_code, '')), 1, 2));
        IF NOT EXISTS (SELECT 1 FROM sawyan.countries WHERE country_code = v_tgt_cc) THEN
            RAISE EXCEPTION 'TARGET_COUNTRY_NOT_REGISTERED: %', v_tgt_cc;
        END IF;
        IF v_tgt_cc = (SELECT country_code FROM sawyan.countries WHERE id = v_mem.residency_country_id) THEN
            RAISE EXCEPTION 'ALREADY_IN_TARGET_COUNTRY';
        END IF;

        UPDATE sawyan.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'pending_residency_move', jsonb_build_object(
                   'target_country_code', v_tgt_cc,
                   'legal_full_name', trim(p_legal_full_name),
                   'document_type', COALESCE(p_document_type, 'residency_permit'),
                   'document_number', trim(p_document_number),
                   'document_preview', v_clean_doc,
                   'submitted_at', now(),
                   'effective_from', date_trunc('month', now() + interval '1 month'),
                   'status', 'pending_review'
               )
           )
         WHERE id = v_mem.id;

        PERFORM sawyan.append_audit_log('member', v_mem.id, 'member_residency_move_submitted', 'members', v_mem.id::text, NULL, jsonb_build_object('target_country', v_tgt_cc));
        RETURN jsonb_build_object('status', 'residency_move_pending', 'target_country_code', v_tgt_cc, 'effective_from', date_trunc('month', now() + interval '1 month'));
    ELSE
        UPDATE sawyan.members
           SET kyc_status       = 'pending',
               kyc_docs_enc_ref = 'KYC-' || upper(COALESCE(p_document_type, 'ID')) || '-' || trim(p_document_number),
               metadata         = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'kyc_submission', jsonb_build_object(
                       'legal_full_name', trim(p_legal_full_name),
                       'document_type', COALESCE(p_document_type, 'national_id'),
                       'document_number', trim(p_document_number),
                       'document_preview', v_clean_doc,
                       'submitted_at', now(),
                       'rejection_note', NULL
                   )
               )
         WHERE id = v_mem.id;

        PERFORM sawyan.append_audit_log('member', v_mem.id, 'member_kyc_submitted', 'members', v_mem.id::text, NULL, jsonb_build_object('doc_type', p_document_type));
        RETURN jsonb_build_object('status', 'pending');
    END IF;
END;
$$;

-- قرار موظف الـ KYC (توثيق / رفض مع ملاحظة تظهر للعضو / اعتماد نقل دولة الإقامة مطلع الشهر القادم)
CREATE OR REPLACE FUNCTION sawyan.admin_review_kyc_or_residency(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_member_id     UUID,
    p_review_type   VARCHAR, -- 'kyc' | 'residency_move'
    p_decision      VARCHAR, -- 'verified' | 'rejected'
    p_notes         TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_mem    sawyan.members%ROWTYPE;
    v_dec    VARCHAR(20);
    v_tgt_cc CHAR(2);
    v_tgt_id INT;
BEGIN
    PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['kyc_officer', 'approver', 'reviewer'], true);
    v_dec := lower(trim(COALESCE(p_decision, '')));

    SELECT * INTO v_mem FROM sawyan.members WHERE id = p_member_id AND member_code > 0 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;

    IF lower(trim(p_review_type)) = 'residency_move' THEN
        v_tgt_cc := v_mem.metadata #>> '{pending_residency_move,target_country_code}';
        IF v_tgt_cc IS NULL THEN RAISE EXCEPTION 'NO_PENDING_RESIDENCY_MOVE'; END IF;

        IF v_dec = 'verified' THEN
            SELECT id INTO v_tgt_id FROM sawyan.countries WHERE country_code = v_tgt_cc;
            UPDATE sawyan.members
               SET kyc_status = 'verified',
                   metadata   = jsonb_set(
                       COALESCE(metadata, '{}'::jsonb),
                       '{pending_residency_move}',
                       (metadata->'pending_residency_move') || jsonb_build_object(
                           'status', 'approved_scheduled_next_month',
                           'approved_target_country_id', v_tgt_id,
                           'reviewed_by', p_admin_id,
                           'reviewed_at', now(),
                           'notes', COALESCE(p_notes, 'تم اعتماد نقل الإقامة بدءاً من مطلع الشهر المحاسبي الجديد')
                       )
                   )
             WHERE id = v_mem.id;
        ELSE
            UPDATE sawyan.members
               SET metadata = jsonb_set(
                       COALESCE(metadata, '{}'::jsonb),
                       '{pending_residency_move}',
                       (metadata->'pending_residency_move') || jsonb_build_object(
                           'status', 'rejected',
                           'reviewed_by', p_admin_id,
                           'reviewed_at', now(),
                           'notes', COALESCE(p_notes, 'يرجى إرفاق مستند إقامة ساري المفعول')
                       )
                   )
             WHERE id = v_mem.id;
        END IF;
    ELSE
        IF v_dec NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'INVALID_KYC_DECISION'; END IF;
        UPDATE sawyan.members
           SET kyc_status = v_dec,
               metadata   = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'kyc_review_note', COALESCE(p_notes, ''),
                   'kyc_reviewed_at', now(),
                   'kyc_reviewed_by', p_admin_id
               )
         WHERE id = v_mem.id;
    END IF;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
    VALUES ('member', v_mem.id, 'KycOrResidencyReviewResult', 'in_app', jsonb_build_object('review_type', p_review_type, 'decision', v_dec, 'notes', COALESCE(p_notes, '')), now());

    PERFORM sawyan.append_audit_log('admin', p_admin_id, 'admin_kyc_residency_' || v_dec, 'members', v_mem.id::text, NULL, jsonb_build_object('review_type', p_review_type, 'notes', p_notes));
    RETURN jsonb_build_object('member_id', v_mem.id, 'review_type', p_review_type, 'status', v_dec);
END;
$$;

-- ============================================================================
-- 7. الفجوة (8 + 10): دورة التاجر (الفروع المتعددة + طلب الشحن البنكي + المرتجع الطوعي + تحرير عقد التاجر إدارياً)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.merchant_manage_branches_and_refunds(
    p_merchant_id       UUID,
    p_session_token     TEXT,
    p_action            VARCHAR, -- 'list_branches' | 'add_branch' | 'toggle_branch' | 'assign_cashier_branch' | 'submit_bank_topup_proof' | 'voluntary_tx_refund'
    p_payload           JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_mer      sawyan.merchants%ROWTYPE;
    v_act      VARCHAR(40);
    v_branches JSONB;
    v_bcode    VARCHAR(30);
    v_tx       sawyan.transactions%ROWTYPE;
    v_claw     JSONB;
    v_notif_id UUID;
    v_rec_img  TEXT;
BEGIN
    SELECT * INTO v_mer FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;
    -- السماح للتاجر قيد التفعيل بقراءة فروعه أو رفع إيصال الشحن الأولي مع التحقق الصارم من التوكين (منع التوكين الفارغ)
    IF NULLIF(trim(COALESCE(p_session_token, '')), '') IS NULL
       OR NULLIF(trim(COALESCE(v_mer.metadata->>'active_session_token', '')), '') IS NULL
       OR (v_mer.metadata->>'active_session_token') <> trim(p_session_token)
    THEN
        RAISE EXCEPTION 'MERCHANT_SESSION_INVALID';
    END IF;

    v_act := lower(trim(COALESCE(p_action, 'list_branches')));

    IF v_act = 'add_branch' THEN
        v_bcode := upper(COALESCE(NULLIF(trim(p_payload->>'branch_code'), ''), 'BR-' || substr(md5(clock_timestamp()::text), 1, 5)));
        INSERT INTO sawyan.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch,
            address, latitude, longitude, branch_phone, branch_manager_name, is_branch_active
        ) VALUES (
            v_mer.id,
            v_bcode,
            COALESCE(NULLIF(trim(p_payload->>'branch_name'), ''), v_mer.business_name || ' — فرع إضافي'),
            false,
            COALESCE(NULLIF(trim(p_payload->>'address'), ''), COALESCE(v_mer.address, 'العنوان الرئيسي')),
            COALESCE((p_payload->>'latitude')::numeric, COALESCE(v_mer.latitude, 30.0444)),
            COALESCE((p_payload->>'longitude')::numeric, COALESCE(v_mer.longitude, 31.2357)),
            NULLIF(trim(p_payload->>'branch_phone'), ''),
            NULLIF(trim(p_payload->>'branch_manager_name'), ''),
            true
        );
        PERFORM sawyan.append_audit_log('merchant', v_mer.id, 'merchant_branch_added', 'merchant_branches', v_bcode, NULL, p_payload);

    ELSIF v_act = 'toggle_branch' THEN
        UPDATE sawyan.merchant_branches
           SET is_branch_active = NOT is_branch_active
         WHERE id = (p_payload->>'branch_id')::uuid AND merchant_id = v_mer.id;

    ELSIF v_act = 'assign_cashier_branch' THEN
        UPDATE sawyan.cashier_employees
           SET branch_id = NULLIF(trim(p_payload->>'branch_id'), '')::uuid
         WHERE id = (p_payload->>'cashier_id')::uuid AND merchant_id = v_mer.id;

    ELSIF v_act = 'submit_bank_topup_proof' THEN
        IF COALESCE((p_payload->>'amount_local')::numeric, 0) <= 0 OR length(trim(COALESCE(p_payload->>'bank_ref', ''))) < 3 THEN
            RAISE EXCEPTION 'TOPUP_AMOUNT_AND_BANK_REF_REQUIRED';
        END IF;
        v_rec_img := sawyan.validate_attachment_data(p_payload->>'receipt_image_data', 480000, true);
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'admin', v_mer.id, 'MerchantBankTopupProofPending', 'in_app',
            jsonb_build_object(
                'merchant_id', v_mer.id,
                'merchant_code', v_mer.merchant_code,
                'business_name', v_mer.business_name,
                'amount_local', (p_payload->>'amount_local')::numeric,
                'bank_ref', trim(p_payload->>'bank_ref'),
                'receipt_note', COALESCE(p_payload->>'receipt_note', ''),
                'receipt_image_data', v_rec_img,
                'submitted_at', now()
            )
        ) RETURNING id INTO v_notif_id;
        RETURN jsonb_build_object('status', 'bank_topup_proof_submitted', 'proof_id', v_notif_id);

    ELSIF v_act = 'voluntary_tx_refund' THEN
        -- تفويض المرتجع الطوعي لبوابة المصافحة الآمنة (OTP / In-App D5 Zero-Liability) بدلاً من العكس المباشر غير الآمن
        v_claw := sawyan.merchant_process_pos_return(
            v_mer.id,
            (p_payload->>'transaction_id')::uuid,
            COALESCE(NULLIF(trim(p_payload->>'reason'), ''), 'مرتجع بضاعة للعميل'),
            NULLIF(trim(COALESCE(p_payload->>'idempotency_key', '')), '')::uuid,
            p_session_token,
            COALESCE(NULLIF(trim(p_payload->>'mode'), ''), 'request_otp'),
            NULLIF(trim(COALESCE(p_payload->>'otp_code', '')), ''),
            NULLIF(trim(COALESCE(p_payload->>'proof_url', '')), '')
        );
        PERFORM sawyan.append_audit_log(
            'merchant',
            v_mer.id,
            'merchant_voluntary_return_flow_' || COALESCE(v_claw->>'status', 'initiated'),
            'transactions',
            (p_payload->>'transaction_id')::text,
            NULL,
            jsonb_build_object('reason', COALESCE(p_payload->>'reason', 'مرتجع بضاعة للعميل'), 'return_flow', v_claw)
        );
        RETURN jsonb_build_object('status', COALESCE(v_claw->>'status', 'awaiting_member_otp'), 'return_flow', v_claw);
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.is_main_branch DESC, b.created_at ASC), '[]'::jsonb)
      INTO v_branches
      FROM sawyan.merchant_branches b
     WHERE b.merchant_id = v_mer.id;

    RETURN jsonb_build_object('branches', v_branches);
END;
$$;

-- نافذة الإدارة لتحرير عقد التاجر (النسبة، التفعيل، العزل، سقف الائتمان D4، واعتماد الشحن البنكي)
CREATE OR REPLACE FUNCTION sawyan.admin_manage_merchant_contract(
    p_admin_id               UUID,
    p_session_token          TEXT,
    p_merchant_id            UUID,
    p_action                 VARCHAR, -- 'update_contract' | 'approve_bank_topup'
    p_deduction_percent      NUMERIC DEFAULT NULL,
    p_category               VARCHAR DEFAULT NULL,
    p_credit_limit           NUMERIC DEFAULT NULL,
    p_is_active              BOOLEAN DEFAULT NULL,
    p_is_isolated            BOOLEAN DEFAULT NULL,
    p_topup_amount_local     NUMERIC DEFAULT NULL,
    p_topup_bank_ref         TEXT    DEFAULT NULL,
    p_topup_proof_notif_id   UUID    DEFAULT NULL,
    p_reason                 TEXT    DEFAULT 'تحديث تعاقدي معتمد من إدارة علاقات التجار'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm      JSONB;
    v_mer      sawyan.merchants%ROWTYPE;
    v_act      VARCHAR(30);
    v_mc_res   JSONB;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance', 'reviewer'], true);
    v_act := lower(trim(COALESCE(p_action, 'update_contract')));

    SELECT * INTO v_mer FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;

    IF v_act = 'approve_bank_topup' THEN
        IF COALESCE(p_topup_amount_local, 0) <= 0 OR length(trim(COALESCE(p_topup_bank_ref, ''))) < 3 THEN
            RAISE EXCEPTION 'VALID_TOPUP_AMOUNT_AND_BANK_REF_REQUIRED';
        END IF;

        v_mc_res := sawyan.admin_submit_governance_request(
            p_admin_id,
            p_session_token,
            'MERCHANT_TOPUP_BANK_VERIFICATION',
            'merchants',
            v_mer.id::text,
            jsonb_build_object(
                'merchant_id', v_mer.id,
                'amount', p_topup_amount_local,
                'payment_ref', trim(p_topup_bank_ref),
                'psp_fee', 0.00,
                'provider', 'bank_transfer'
            ),
            COALESCE(NULLIF(trim(p_reason), ''), 'شحن رصيد بنكي موثق مرجع ' || trim(p_topup_bank_ref))
        );

        IF p_topup_proof_notif_id IS NOT NULL THEN
            UPDATE sawyan.notifications
               SET event_name = 'MerchantBankTopupProofProcessed',
                   is_read    = true
             WHERE id = p_topup_proof_notif_id;
        END IF;

        RETURN v_mc_res;
    ELSE
        UPDATE sawyan.merchants
           SET deduction_percent = COALESCE(p_deduction_percent, deduction_percent),
               category          = COALESCE(NULLIF(trim(p_category), ''), category),
               credit_limit      = COALESCE(p_credit_limit, credit_limit),
               is_active         = COALESCE(p_is_active, is_active),
               is_isolated       = COALESCE(p_is_isolated, is_isolated),
               metadata          = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('contract_reviewed_at', now(), 'contract_reviewed_by', p_admin_id)
         WHERE id = v_mer.id
        RETURNING * INTO v_mer;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_contract_updated', 'merchants', v_mer.id::text, NULL, jsonb_build_object('deduction_percent', v_mer.deduction_percent, 'credit_limit', v_mer.credit_limit, 'is_active', v_mer.is_active, 'reason', p_reason));
        RETURN jsonb_build_object('merchant_id', v_mer.id, 'merchant_code', v_mer.merchant_code, 'deduction_percent', v_mer.deduction_percent, 'credit_limit', v_mer.credit_limit, 'is_active', v_mer.is_active);
    END IF;
END;
$$;

-- ============================================================================
-- 8. الفجوة (9 + 11): إدارة الأكاديمية التدريبية وتصنيفات المتاجر + رادار الـ 10 أجيال لقائد الشجرة
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_manage_academy_and_categories(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_domain        VARCHAR, -- 'academy' | 'category'
    p_action        VARCHAR, -- 'list' | 'upsert' | 'toggle' | 'delete'
    p_payload       JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_act     VARCHAR(20);
    v_dom     VARCHAR(20);
    v_courses JSONB;
    v_cats    JSONB;
    v_slug    VARCHAR(100);
BEGIN
    v_act := lower(trim(COALESCE(p_action, 'list')));
    v_dom := lower(trim(COALESCE(p_domain, 'academy')));

    IF v_act = 'list' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    ELSE
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'data_entry', 'support'], true);
    END IF;

    IF v_dom = 'academy' THEN
        IF v_act = 'upsert' THEN
            v_slug := lower(regexp_replace(COALESCE(NULLIF(trim(p_payload->>'slug'), ''), 'course-' || substr(md5(clock_timestamp()::text), 1, 6)), '[^a-z0-9\-]+', '-', 'g'));
            INSERT INTO sawyan.academy_courses (slug, title_i18n, content_i18n, media_url, sort_order, is_published)
            VALUES (
                v_slug,
                jsonb_build_object('ar', COALESCE(p_payload->>'title_ar', 'درس تدريبي'), 'en', COALESCE(p_payload->>'title_en', 'Training Lesson')),
                jsonb_build_object('ar', COALESCE(p_payload->>'content_ar', ''), 'en', COALESCE(p_payload->>'content_en', '')),
                NULLIF(trim(p_payload->>'media_url'), ''),
                COALESCE((p_payload->>'sort_order')::int, 10),
                COALESCE((p_payload->>'is_published')::boolean, true)
            )
            ON CONFLICT (slug) DO UPDATE
               SET title_i18n   = EXCLUDED.title_i18n,
                   content_i18n = EXCLUDED.content_i18n,
                   media_url    = EXCLUDED.media_url,
                   sort_order   = EXCLUDED.sort_order,
                   is_published = EXCLUDED.is_published;
        ELSIF v_act = 'toggle' THEN
            UPDATE sawyan.academy_courses SET is_published = NOT is_published WHERE id = (p_payload->>'id')::uuid;
        ELSIF v_act = 'delete' THEN
            DELETE FROM sawyan.academy_courses WHERE id = (p_payload->>'id')::uuid;
        END IF;
    ELSIF v_dom = 'category' THEN
        IF v_act = 'upsert' THEN
            v_slug := lower(regexp_replace(COALESCE(NULLIF(trim(p_payload->>'slug'), ''), 'cat-' || substr(md5(clock_timestamp()::text), 1, 5)), '[^a-z0-9_\-]+', '_', 'g'));
            INSERT INTO sawyan.categories (slug, name_i18n, risk_level, is_active)
            VALUES (
                v_slug,
                jsonb_build_object('ar', COALESCE(p_payload->>'name_ar', v_slug), 'en', COALESCE(p_payload->>'name_en', v_slug)),
                COALESCE(p_payload->>'risk_level', 'standard'),
                COALESCE((p_payload->>'is_active')::boolean, true)
            )
            ON CONFLICT (slug) DO UPDATE
               SET name_i18n  = EXCLUDED.name_i18n,
                   risk_level = EXCLUDED.risk_level,
                   is_active  = EXCLUDED.is_active;
        ELSIF v_act = 'toggle' THEN
            UPDATE sawyan.categories SET is_active = NOT is_active WHERE id = (p_payload->>'id')::int;
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(ac)::jsonb ORDER BY ac.sort_order ASC, ac.slug ASC), '[]'::jsonb) INTO v_courses FROM sawyan.academy_courses ac;
    SELECT COALESCE(jsonb_agg(row_to_json(ct)::jsonb ORDER BY ct.id ASC), '[]'::jsonb) INTO v_cats FROM sawyan.categories ct;

    RETURN jsonb_build_object('academy_courses', v_courses, 'categories', v_cats);
END;
$$;

-- رادار متابعة الفريق لقائد الشجرة حتى 10 أجيال مكانية (W09b — نسبة التقدم نحو الهدف فقط دون كشف أسماء المتاجر صوناً للخصوصية!)
CREATE OR REPLACE FUNCTION sawyan.get_leader_10gen_followup_radar(
    p_member_id     UUID,
    p_session_token TEXT,
    p_filter_mode   VARCHAR DEFAULT 'all' -- 'all' | 'near_target_50_99' | 'zero_activity_new' | 'qualified'
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_leader     sawyan.members%ROWTYPE;
    v_period_ym  CHAR(7);
    v_rows       JSONB;
    v_mode       VARCHAR(30);
BEGIN
    v_leader := sawyan.verify_member_session(p_member_id, p_session_token);
    v_period_ym := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
    v_mode := lower(trim(COALESCE(p_filter_mode, 'all')));

    SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.progress_pct DESC, r.spatial_depth ASC), '[]'::jsonb)
      INTO v_rows
      FROM (
          SELECT m.member_code,
                 m.full_name,
                 m.phone,
                 tc.depth AS spatial_depth,
                 (tc.depth + 1) AS spatial_me_label,
                 c.country_code,
                 c.currency_code,
                 c.admin_fx_rate,
                 c.monthly_target_usd,
                 TRUNC(c.monthly_target_usd / 11, 2) AS unit_share_usd,
                 COALESCE(tb.carry_on_in_usd + tb.current_month_purchases_usd + tb.compensatory_incoming_usd, 0.00) AS box_accum_usd,
                 LEAST(ROUND(((COALESCE(tb.carry_on_in_usd + tb.current_month_purchases_usd + tb.compensatory_incoming_usd, 0.00) / GREATEST(c.monthly_target_usd, 0.01)) * 100.0)::numeric, 1), 100.0) AS progress_pct,
                 GREATEST(c.monthly_target_usd - COALESCE(tb.carry_on_in_usd + tb.current_month_purchases_usd + tb.compensatory_incoming_usd, 0.00), 0.00) AS remaining_to_qualify_usd,
                 COALESCE(tb.is_qualified, false) AS is_qualified,
                 m.created_at
            FROM sawyan.tree_closure tc
            JOIN sawyan.members m ON m.id = tc.descendant_id
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            LEFT JOIN sawyan.monthly_target_boxes tb
                   ON tb.member_id = m.id AND tb.country_id = m.residency_country_id AND tb.period_ym = v_period_ym
           WHERE tc.ancestor_id = v_leader.id
             AND tc.depth BETWEEN 1 AND 10
             AND m.is_tombstone_banned = false
      ) r
     WHERE (v_mode = 'all')
        OR (v_mode = 'near_target_50_99' AND r.progress_pct >= 50.0 AND r.progress_pct < 100.0 AND NOT r.is_qualified)
        OR (v_mode = 'zero_activity_new' AND r.box_accum_usd = 0)
        OR (v_mode = 'qualified' AND (r.is_qualified OR r.progress_pct >= 100.0));

    RETURN jsonb_build_object(
        'period_ym', v_period_ym,
        'filter_mode', v_mode,
        'team_members', v_rows
    );
END;
$$;

-- ============================================================================
-- 9. الفجوة (4 + 12): البحث السيرفري السريع + الرد على تذاكر الدعم + التقارير الحية الستة
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_search_and_reply_ops(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_action        VARCHAR, -- 'search' | 'reply_support_ticket'
    p_entity        VARCHAR DEFAULT 'members', -- 'members' | 'merchants' | 'transactions' | 'support_tickets' | 'bank_topup_proofs'
    p_query         TEXT    DEFAULT NULL,
    p_record_id     UUID    DEFAULT NULL,
    p_reply_text    TEXT    DEFAULT NULL,
    p_new_status    VARCHAR DEFAULT 'closed'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm          JSONB;
    v_scope        VARCHAR(10);
    v_q            TEXT;
    v_results      JSONB := '[]'::jsonb;
    v_can_view_kyc BOOLEAN := false;
    v_viewed_cnt   INT := 0;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, (lower(trim(p_action)) <> 'search'));
    SELECT COALESCE(metadata->>'country_scope', 'GLOBAL') INTO v_scope FROM sawyan.admins WHERE id = p_admin_id;
    v_q := lower(trim(COALESCE(p_query, '')));
    v_can_view_kyc := COALESCE(v_adm->>'role', '') IN ('kyc_officer', 'approver', 'reviewer', 'auditor');

    IF lower(trim(p_action)) = 'reply_support_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'approver', 'reviewer'], true);
        UPDATE sawyan.support_tickets
           SET admin_reply       = trim(COALESCE(p_reply_text, '')),
               status            = COALESCE(NULLIF(trim(p_new_status), ''), 'closed'),
               assigned_admin_id = p_admin_id,
               updated_at        = now()
         WHERE id = p_record_id;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'support_ticket_replied', 'support_tickets', p_record_id::text, NULL, jsonb_build_object('status', p_new_status));
        RETURN jsonb_build_object('status', 'replied', 'ticket_id', p_record_id);
    END IF;

    IF lower(trim(p_entity)) = 'members' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb),
               COUNT(*) FILTER (WHERE NULLIF(t.kyc_doc_len, 0) > 0 OR NULLIF(t.res_doc_len, 0) > 0)
          INTO v_results, v_viewed_cnt
          FROM (
              SELECT m.id, m.member_code, m.full_name, m.email, m.phone,
                     c.country_code, m.kyc_status, m.kyc_docs_enc_ref,
                     m.is_active_in_tree, m.is_tombstone_banned, m.placement_side, m.generation_in_tree,
                     sp.member_code AS sponsor_code, sp.full_name AS sponsor_name,
                     COALESCE(w.balance_usd, 0.00) AS wallet_balance_usd,
                     COALESCE(w.total_earned_usd, 0.00) AS total_earned_usd,
                     COALESCE(w.s03_suspense_balance_usd, 0.00) AS s03_suspense_usd,
                     CASE
                         WHEN m.metadata ? 'kyc_submission' THEN
                             CASE WHEN v_can_view_kyc THEN m.metadata->'kyc_submission'
                                  ELSE (m.metadata->'kyc_submission') || '{"document_preview": null, "document_redacted": true}'::jsonb
                             END
                         ELSE NULL
                     END AS kyc_submission,
                     CASE
                         WHEN m.metadata ? 'pending_residency_move' THEN
                             CASE WHEN v_can_view_kyc THEN m.metadata->'pending_residency_move'
                                  ELSE (m.metadata->'pending_residency_move') || '{"document_preview": null, "document_redacted": true}'::jsonb
                             END
                         ELSE NULL
                     END AS pending_residency_move,
                     COALESCE(length(m.metadata #>> '{kyc_submission,document_preview}'), 0) AS kyc_doc_len,
                     COALESCE(length(m.metadata #>> '{pending_residency_move,document_preview}'), 0) AS res_doc_len,
                     m.created_at
                FROM sawyan.members m
                JOIN sawyan.countries c ON c.id = m.residency_country_id
                LEFT JOIN sawyan.members sp ON sp.id = m.sponsor_id
                LEFT JOIN sawyan.wallets w ON w.member_id = m.id
               WHERE m.member_code > 0
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (v_q = '' OR m.member_code::text = regexp_replace(v_q, '^#', '') OR lower(m.full_name) LIKE '%' || v_q || '%' OR m.phone LIKE '%' || v_q || '%' OR lower(COALESCE(m.email, '')) LIKE '%' || v_q || '%')
               ORDER BY m.created_at DESC
               LIMIT 100
          ) t;

        IF v_can_view_kyc AND v_viewed_cnt > 0 THEN
            PERFORM sawyan.append_audit_log('admin', p_admin_id, 'kyc_document_viewed', 'members', 'kyc_view:' || v_scope || ':' || COALESCE(NULLIF(v_q, ''), 'all'), NULL, jsonb_build_object('role', v_adm->>'role', 'viewed_count', v_viewed_cnt, 'query', v_q));
        END IF;

    ELSIF lower(trim(p_entity)) = 'merchants' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT m.id, m.merchant_code, m.business_name, m.owner_name, m.email, m.phone,
                     c.country_code, c.currency_code, m.category, m.merchant_type,
                     m.deduction_percent, m.package_base_amount, m.actual_cash_balance, m.soft_hold_balance,
                     m.credit_limit, m.tax_registration_no, m.is_active, m.is_isolated, m.created_at,
                     NULLIF(m.metadata->>'logo_url', '') AS logo_url,
                     NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
                     CASE WHEN jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images,
                     COALESCE(m.metadata->'kyc_docs', '{}'::jsonb) AS kyc_docs,
                     (SELECT COUNT(*) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'completed') AS ops_count,
                     (SELECT COALESCE(SUM(tx.total_amount), 0.00) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'completed') AS gmv_local
                FROM sawyan.merchants m
                JOIN sawyan.countries c ON c.id = m.country_id
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (v_q = '' OR lower(m.merchant_code) LIKE '%' || v_q || '%' OR lower(m.business_name) LIKE '%' || v_q || '%' OR m.phone LIKE '%' || v_q || '%')
               ORDER BY m.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'transactions' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT tx.id, tx.sw_short_code, tx.unique_payment_ref, tx.amount, tx.total_amount,
                     tx.commission_amount, tx.company_share, tx.income_plan_share_local,
                     tx.income_plan_share_usd, tx.vat_amount, tx.currency_code, tx.fx_rate_used,
                     c.country_code, tx.payment_type, tx.status, tx.receipt_media_url, tx.fifo_seq,
                     tx.completed_at, tx.reversed_at, tx.created_at,
                     (tx.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                     mem.member_code, mem.full_name AS member_name,
                     mer.merchant_code, mer.business_name AS merchant_name,
                     mb.branch_name,
                     bti.invoice_number AS b2b_invoice_number
                FROM sawyan.transactions tx
                JOIN sawyan.countries c ON c.id = tx.country_id
                JOIN sawyan.members mem ON mem.id = tx.member_id
                JOIN sawyan.merchants mer ON mer.id = tx.merchant_id
                LEFT JOIN sawyan.merchant_branches mb ON mb.id = tx.branch_id
                LEFT JOIN sawyan.b2b_tax_invoices bti ON bti.transaction_id = tx.id AND bti.document_type = 'tax_invoice'
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (
                     v_q = ''
                     OR lower(tx.sw_short_code) LIKE '%' || v_q || '%'
                     OR lower(tx.unique_payment_ref) LIKE '%' || v_q || '%'
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR lower(mer.merchant_code) LIKE '%' || v_q || '%'
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                     OR lower(tx.status) = v_q
                     OR lower(tx.payment_type) = v_q
                 )
               ORDER BY tx.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'disputes' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT d.*, tx.sw_short_code, tx.total_amount, tx.currency_code, tx.status AS tx_status,
                     c.country_code AS tx_country_code,
                     ROUND(tx.income_plan_share_usd::numeric, 2) AS income_plan_share_usd,
                     mem.member_code, mem.full_name AS member_name,
                     mer.merchant_code, mer.business_name AS merchant_name
                FROM sawyan.dispute_tickets d
                JOIN sawyan.transactions tx ON tx.id = d.transaction_id
                JOIN sawyan.countries c ON c.id = tx.country_id
                JOIN sawyan.members mem ON mem.id = d.member_id
                JOIN sawyan.merchants mer ON mer.id = d.merchant_id
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (
                     v_q = ''
                     OR lower(tx.sw_short_code) LIKE '%' || v_q || '%'
                     OR lower(d.status) = v_q
                     OR lower(COALESCE(d.dispute_category, '')) = v_q
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                 )
               ORDER BY d.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'support_tickets' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT st.id,
                     COALESCE(st.metadata->>'ticket_ref', substr(st.id::text, 1, 8)) AS ticket_ref,
                     st.requester_type, st.requester_id, st.category, st.priority, st.status,
                     st.subject, st.message_body, st.admin_reply,
                     COALESCE((st.metadata->>'requester_verified')::boolean, false) AS requester_verified,
                     st.metadata->>'contact_name' AS contact_name,
                     st.metadata->>'contact_phone' AS contact_phone,
                     st.metadata->>'contact_email' AS contact_email,
                     st.created_at, st.updated_at
                FROM sawyan.support_tickets st
               WHERE (v_q = '' OR lower(COALESCE(st.subject, '')) LIKE '%' || v_q || '%' OR lower(COALESCE(st.metadata->>'ticket_ref', '')) LIKE '%' || v_q || '%' OR COALESCE(st.metadata->>'contact_phone', '') LIKE '%' || v_q || '%')
               ORDER BY CASE WHEN st.status = 'open' THEN 0 ELSE 1 END, st.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'bank_topup_proofs' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT n.id, n.payload, n.created_at
                FROM sawyan.notifications n
               WHERE n.event_name = 'MerchantBankTopupProofPending'
               ORDER BY n.created_at DESC
               LIMIT 50
          ) t;
    END IF;

    RETURN jsonb_build_object('entity', p_entity, 'results', v_results);
END;
$$;

-- ============================================================================
-- 10. قفل الصلاحيات الأقل (Least-Privilege Lockdown) على كافة دوال المرحلة 7
-- ============================================================================
REVOKE ALL ON FUNCTION sawyan.get_public_active_countries_and_cities() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_country_cities(UUID, TEXT, VARCHAR, CHAR, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.verify_root_invite_token(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.register_new_member(VARCHAR, VARCHAR, BIGINT, TEXT, CHAR, CHAR, BIGINT, VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_root_leaders(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, CHAR, TEXT, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_staff_accounts(UUID, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_support_or_recovery_ticket(VARCHAR, VARCHAR, TEXT, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_my_support_tickets(VARCHAR, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_reset_user_password(UUID, TEXT, VARCHAR, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.change_own_password(VARCHAR, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_decide_withdrawal_v3(UUID, TEXT, UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_member_kyc_or_residency_move(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_review_kyc_or_residency(UUID, TEXT, UUID, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.merchant_manage_branches_and_refunds(UUID, TEXT, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_academy_and_categories(UUID, TEXT, VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_leader_10gen_followup_radar(UUID, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_search_and_reply_ops(UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.get_public_active_countries_and_cities() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_country_cities(UUID, TEXT, VARCHAR, CHAR, TEXT, TEXT, BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.verify_root_invite_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.register_new_member(VARCHAR, VARCHAR, BIGINT, TEXT, CHAR, CHAR, BIGINT, VARCHAR, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_root_leaders(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, CHAR, TEXT, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_staff_accounts(UUID, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_support_or_recovery_ticket(VARCHAR, VARCHAR, TEXT, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_my_support_tickets(VARCHAR, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_reset_user_password(UUID, TEXT, VARCHAR, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.change_own_password(VARCHAR, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_decide_withdrawal_v3(UUID, TEXT, UUID, VARCHAR, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_kyc_or_residency_move(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_review_kyc_or_residency(UUID, TEXT, UUID, VARCHAR, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.merchant_manage_branches_and_refunds(UUID, TEXT, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_academy_and_categories(UUID, TEXT, VARCHAR, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_leader_10gen_followup_radar(UUID, TEXT, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_search_and_reply_ops(UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID, TEXT, VARCHAR) TO anon, authenticated, service_role;
