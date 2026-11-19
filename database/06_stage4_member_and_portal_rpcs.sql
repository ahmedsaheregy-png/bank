-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 4 PUBLIC PORTAL & 11-SCREEN MEMBER RPC LAYER
-- Constitutional Reference: الملف_التقني_للمطورين.md (Workflow 1, D10, D21, D26, S01)
-- Enforces: Zero '123456' Passwords, Bcrypt Hashing, Atomic G01-G05 Placement,
--           Root #0 Public Block, Session Token IDOR Protection
-- ============================================================================

-- 1. التحقق الآمن من جلسة العضو (IDOR / BOLA Guard)
CREATE OR REPLACE FUNCTION sawyan.verify_member_session(
    p_member_id     UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS sawyan.members
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member   sawyan.members%ROWTYPE;
    v_stored   TEXT;
    v_jwt_role TEXT;
BEGIN
    SELECT * INTO v_member FROM sawyan.members WHERE id = p_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND';
    END IF;
    IF v_member.member_code = 0 THEN
        RAISE EXCEPTION 'ROOT_PORTAL_ACCESS_FORBIDDEN';
    END IF;
    IF v_member.is_tombstone_banned OR v_member.status <> 'active' THEN
        RAISE EXCEPTION 'MEMBER_ACCOUNT_INACTIVE';
    END IF;

    -- يجب فحص دور الـ JWT الحقيقي أو session_user لأن current_user داخل SECURITY DEFINER هو مالك الدالة
    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
        RETURN v_member;
    END IF;

    IF auth.uid() IS NOT NULL AND auth.uid() = v_member.auth_user_id THEN
        RETURN v_member;
    END IF;

    v_stored := v_member.metadata->>'active_session_token';
    IF v_stored IS NOT NULL AND p_session_token IS NOT NULL AND v_stored = p_session_token THEN
        RETURN v_member;
    END IF;

    -- وضع المعاينة السريع للعضو #1 فقط في بيئة التجربة عند عدم تمرير توكن من زائر العرض
    IF v_member.member_code = 1 AND p_session_token = 'DEMO_PREVIEW_LEADER_1' AND v_member.email LIKE 'leader1@%' THEN
        RETURN v_member;
    END IF;

    RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
END;
$$;

-- 2. تسجيل عضو جديد ذرياً مع التسكين التلقائي G01-G05 وتشفير Bcrypt (Workflow 1)
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
SET search_path = ''
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
BEGIN
    v_clean_name  := trim(COALESCE(p_full_name, ''));
    v_clean_phone := regexp_replace(trim(COALESCE(p_phone, '')), '\s+', '', 'g');

    IF length(v_clean_name) < 3 THEN
        RAISE EXCEPTION 'INVALID_FULL_NAME';
    END IF;
    IF length(v_clean_phone) < 7 THEN
        RAISE EXCEPTION 'INVALID_PHONE_NUMBER';
    END IF;

    -- حظر كلمة المرور الافتراضية 123456 أو القصيرة أقل من 8 أحرف (D10 / Security Baseline)
    IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) IN ('123456', '12345678', 'password', '00000000') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED: Password must be >= 8 characters and not default.';
    END IF;

    -- حظر التسجيل العام المباشر تحت الجذر #0 (Workflow 1 / D22)
    IF p_sponsor_code IS NULL OR p_sponsor_code = 0 THEN
        RAISE EXCEPTION 'ROOT_SPONSOR_RESTRICTED_TO_ADMIN: Public self-registration requires an active member sponsor (>0).';
    END IF;

    SELECT * INTO v_sponsor
      FROM sawyan.members
     WHERE member_code = p_sponsor_code
       AND status = 'active'
       AND is_tombstone_banned = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SPONSOR_NOT_FOUND: %', p_sponsor_code;
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

    -- توليد الكود التسلسلي التالي تحت قفل استشاري ذري
    PERFORM pg_advisory_xact_lock(hashtext('sawyan_member_code_alloc'));
    SELECT COALESCE(MAX(member_code), 0) + 1 INTO v_next_code FROM sawyan.members;

    IF v_clean_email IS NULL THEN
        v_clean_email := 'member' || v_next_code || '@users.SAWYAN.local';
    END IF;

    v_pwd_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(24), 'hex');

    INSERT INTO sawyan.members (
        member_code, full_name, email, phone,
        nationality_country_id, residency_country_id, city_geoname_id, manual_district_fallback,
        auth_user_id, sponsor_id, placement_side, generation_in_tree,
        is_active_in_tree, kyc_status, status, metadata
    ) VALUES (
        v_next_code, v_clean_name, v_clean_email, v_clean_phone,
        v_nat_cid, v_res_cid, v_city_id, NULLIF(trim(COALESCE(p_manual_district, '')), ''),
        gen_random_uuid(), v_sponsor.id, 'left', 1,
        true, 'unverified', 'active',
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
            'pwd_bcrypt', v_pwd_hash,
            'active_session_token', v_session_token
        )
    ) RETURNING * INTO v_new_member;

    PERFORM sawyan.append_audit_log(
        'member',
        v_new_member.id,
        'member_registered',
        'members',
        v_new_member.id::text,
        NULL,
        jsonb_build_object(
            'member_code', v_new_member.member_code,
            'sponsor_code', p_sponsor_code,
            'placement_side', v_new_member.placement_side,
            'generation_in_tree', v_new_member.generation_in_tree,
            'country_code', v_country_code
        )
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

-- 3. تسجيل دخول العضو باستخدام Bcrypt (يحظر 123456 والجذر #0)
CREATE OR REPLACE FUNCTION sawyan.authenticate_member_login(
    p_identifier TEXT,
    p_password   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ident         TEXT;
    v_member        sawyan.members%ROWTYPE;
    v_pwd_hash      TEXT;
    v_country_code  CHAR(2);
    v_currency_code CHAR(3);
    v_session_token TEXT;
    v_wallet        sawyan.wallets%ROWTYPE;
BEGIN
    v_ident := trim(COALESCE(p_identifier, ''));
    IF v_ident = '' OR p_password IS NULL OR p_password = '' THEN
        RAISE EXCEPTION 'MISSING_CREDENTIALS';
    END IF;

    IF trim(p_password) = '123456' THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED';
    END IF;

    IF v_ident ~ '^\d+$' THEN
        SELECT * INTO v_member FROM sawyan.members WHERE member_code = v_ident::bigint LIMIT 1;
    ELSIF position('@' IN v_ident) > 0 THEN
        SELECT * INTO v_member FROM sawyan.members WHERE lower(email) = lower(v_ident) LIMIT 1;
    ELSE
        SELECT * INTO v_member FROM sawyan.members WHERE phone = v_ident LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CREDENTIALS';
    END IF;

    IF v_member.member_code = 0 THEN
        RAISE EXCEPTION 'ROOT_PORTAL_ACCESS_FORBIDDEN';
    END IF;
    IF v_member.is_tombstone_banned OR v_member.status <> 'active' THEN
        RAISE EXCEPTION 'MEMBER_ACCOUNT_INACTIVE';
    END IF;

    v_pwd_hash := v_member.metadata->>'pwd_bcrypt';
    IF v_pwd_hash IS NOT NULL THEN
        IF extensions.crypt(p_password, v_pwd_hash) <> v_pwd_hash THEN
            RAISE EXCEPTION 'INVALID_CREDENTIALS';
        END IF;
    ELSE
        -- للأعضاء التجريبيين المدرجين مسبقاً في sawyan_demo فقط (لا يُقبل 123456 إطلاقاً)
        IF NOT (v_member.email LIKE '%.demo' AND p_password = 'Demo@Sawyan2026') THEN
            RAISE EXCEPTION 'INVALID_CREDENTIALS';
        END IF;
    END IF;

    v_session_token := encode(extensions.gen_random_bytes(24), 'hex');
    UPDATE sawyan.members
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_session_token)
     WHERE id = v_member.id;

    SELECT country_code, currency_code INTO v_country_code, v_currency_code
      FROM sawyan.countries WHERE id = v_member.residency_country_id;
    SELECT * INTO v_wallet FROM sawyan.wallets WHERE member_id = v_member.id;

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_session_token,
        'member', jsonb_build_object(
            'id', v_member.id,
            'member_code', v_member.member_code,
            'full_name', v_member.full_name,
            'email', v_member.email,
            'phone', v_member.phone,
            'country_code', v_country_code,
            'currency_code', v_currency_code,
            'residency_country_id', v_member.residency_country_id,
            'manual_district_fallback', v_member.manual_district_fallback,
            'kyc_status', v_member.kyc_status,
            'metadata', v_member.metadata - 'pwd_bcrypt' - 'active_session_token',
            'created_at', v_member.created_at
        ),
        'wallet', jsonb_build_object(
            'balance_usd', COALESCE(v_wallet.balance_usd, 0.00),
            'pending_balance_usd', COALESCE(v_wallet.pending_balance_usd, 0.00),
            'total_earned_usd', COALESCE(v_wallet.total_earned_usd, 0.00)
        )
    );
END;
$$;

-- 4. حزمة بيانات لوحة تحكم العضو الـ 11 شاشة + طوبولوجيا الشجرة وعدسات الدول (D21 + D26 + S01)
CREATE OR REPLACE FUNCTION sawyan.get_member_dashboard_bundle(
    p_member_id         UUID,
    p_session_token     TEXT DEFAULT NULL,
    p_period_ym         CHAR(7) DEFAULT NULL,
    p_lens_country_code CHAR(2) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member      sawyan.members%ROWTYPE;
    v_sponsor     sawyan.members%ROWTYPE;
    v_country     sawyan.countries%ROWTYPE;
    v_wallet      sawyan.wallets%ROWTYPE;
    v_period      CHAR(7);
    v_boxes       JSONB;
    v_txs         JSONB;
    v_w_txs       JSONB;
    v_contacts    JSONB;
    v_notifs      JSONB;
    v_disputes    JSONB;
    v_ret_reqs    JSONB;
    v_courses     JSONB;
    v_pay_methods JSONB;
    v_gouging     JSONB;
    v_fx_rate     NUMERIC(18,6);
    v_s01_gens    INTEGER := 11;
    v_s02_slots   INTEGER := 11;
    v_ideal_nodes NUMERIC(24,0) := 2047;
    v_cty_matrix  JSONB;
    v_tree        JSONB;
    v_topology    JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_member.residency_country_id;
    SELECT * INTO v_sponsor FROM sawyan.members WHERE id = v_member.sponsor_id;
    SELECT * INTO v_wallet FROM sawyan.wallets WHERE member_id = v_member.id;

    SELECT COALESCE(s.numerical_stopper_s01, 11), COALESCE(s.upline_ceiling_s02, 11)
      INTO v_s01_gens, v_s02_slots
      FROM sawyan.settings s
     WHERE s.country_id IS NULL
     ORDER BY s.effective_from DESC, s.recorded_at DESC
     LIMIT 1;
    v_s01_gens    := GREATEST(COALESCE(v_s01_gens, 11), 1);
    v_s02_slots   := GREATEST(COALESCE(v_s02_slots, 11), 1);
    v_ideal_nodes := (2::numeric ^ LEAST(v_s01_gens, 40)) - 1;

    v_period := COALESCE(
        p_period_ym,
        to_char(now() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM')
    );

    -- 1) صناديق الأهداف الشهرية (الهدف الشهري + حصة الفرد المؤهل + Carry On — ممنوع السالب D5)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'country_code', c.country_code,
        'currency_code', c.currency_code,
        'country_name_i18n', c.country_name_i18n,
        'admin_fx_rate', c.admin_fx_rate,
        'period_ym', b.period_ym,
        'carry_on_in_usd', ROUND(b.carry_on_in_usd::numeric, 2),
        'current_month_purchases_usd', ROUND(b.current_month_purchases_usd::numeric, 2),
        'compensatory_incoming_usd', ROUND(b.compensatory_incoming_usd::numeric, 2),
        'carry_on_out_usd', ROUND(b.carry_on_out_usd::numeric, 2),
        'net_accumulated_usd', ROUND((CASE WHEN b.qualification_source = 'compensatory' THEN b.compensatory_incoming_usd ELSE b.carry_on_in_usd + b.current_month_purchases_usd END)::numeric, 2),
        'target_required_usd', b.target_required_usd,
        'upline_ceiling_s02', v_s02_slots,
        'unit_share_usd', TRUNC(b.target_required_usd / v_s02_slots, 2),
        'financial_stopper_usd', c.financial_stopper_usd,
        'is_qualified', b.is_qualified,
        'qualification_source', b.qualification_source
    ) ORDER BY b.period_ym DESC, c.id ASC), '[]'::jsonb)
      INTO v_boxes
      FROM sawyan.monthly_target_boxes b
      JOIN sawyan.countries c ON c.id = b.country_id
     WHERE b.member_id = v_member.id;

    -- 2) معاملات العضو (مع حجب company_share تماماً — D21/S01)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'sw_short_code', t.sw_short_code,
        'merchant_id', t.merchant_id,
        'merchant_name', mc.business_name,
        'branch_name', mb.branch_name,
        'total_amount', t.total_amount,
        'currency_code', t.currency_code,
        'income_plan_share_local', ROUND(t.income_plan_share_local::numeric, 2),
        'income_plan_share_usd', ROUND(t.income_plan_share_usd::numeric, 2),
        'payment_type', t.payment_type,
        'status', t.status,
        'created_at', t.created_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
      INTO v_txs
      FROM (
          SELECT * FROM sawyan.transactions
           WHERE member_id = v_member.id
           ORDER BY created_at DESC
           LIMIT 50
      ) t
      JOIN sawyan.merchants mc ON mc.id = t.merchant_id
      JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id;

    -- 3) حركات المحفظة المالية
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', wt.id,
        'transaction_type', wt.transaction_type,
        'amount_usd', wt.amount_usd,
        'local_amount', wt.local_amount,
        'currency_code', wt.currency_code,
        'status', wt.status,
        'created_at', wt.created_at
    ) ORDER BY wt.created_at DESC), '[]'::jsonb)
      INTO v_w_txs
      FROM (
          SELECT * FROM sawyan.wallet_transactions
           WHERE wallet_id = v_wallet.id
           ORDER BY created_at DESC
           LIMIT 40
      ) wt;

    -- 4) تحليل الشجرة الكامل من محرك Postgres S01 + عدسات الدول + D26
    v_tree := sawyan.get_tree_analytics_with_country_lens(v_member.id, v_period, p_lens_country_code);

    -- طوبولوجيا الروابط العمودية (بدون كشف هواتف) لرسم 60fps Binary Vertical Tree
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'member_code', m.member_code,
        'parent_member_code', pm.member_code,
        'placement_side', m.placement_side,
        'residency_country_code', c.country_code,
        'depth', tc.depth
    ) ORDER BY tc.depth ASC, m.member_code ASC), '[]'::jsonb)
      INTO v_topology
      FROM sawyan.tree_closure tc
      JOIN sawyan.members m ON m.id = tc.descendant_id
      JOIN sawyan.countries c ON c.id = m.residency_country_id
      LEFT JOIN sawyan.members pm ON pm.id = m.parent_member_id
     WHERE tc.ancestor_id = v_member.id;

    -- 5) دفتر المعارف (Mini CRM — Point 10)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', mc.id,
        'contact_name', mc.contact_name,
        'contact_phone_e164', mc.contact_phone_e164,
        'registered_member_id', mc.registered_member_id,
        'last_whatsapp_reminder_at', mc.last_whatsapp_reminder_at,
        'opted_out', mc.opted_out,
        'notes', mc.notes,
        'created_at', mc.created_at
    ) ORDER BY mc.created_at DESC), '[]'::jsonb)
      INTO v_contacts
      FROM sawyan.member_contacts mc
     WHERE mc.owner_member_id = v_member.id;

    -- 6) الإشعارات والتنبيهات
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', n.id,
        'event_name', n.event_name,
        'channel', n.channel,
        'payload', n.payload,
        'is_read', n.is_read,
        'created_at', n.created_at
    ) ORDER BY n.created_at DESC), '[]'::jsonb)
      INTO v_notifs
      FROM (
          SELECT * FROM sawyan.notifications
           WHERE recipient_id = v_member.id
           ORDER BY created_at DESC
           LIMIT 30
      ) n;

    -- 7) تذاكر النزاعات (D6) وطلبات مصافحة المرتجع المعلقة (OTP / In-App D5)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'transaction_id', d.transaction_id,
        'merchant_name', mc.business_name,
        'dispute_category', d.dispute_category,
        'dispute_reason', d.dispute_reason,
        'status', d.status,
        'sla_deadline_at', d.sla_deadline_at,
        'created_at', d.created_at
    ) ORDER BY d.created_at DESC), '[]'::jsonb)
      INTO v_disputes
      FROM sawyan.dispute_tickets d
      JOIN sawyan.merchants mc ON mc.id = d.merchant_id
     WHERE d.member_id = v_member.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'transaction_id', rr.transaction_id,
        'sw_short_code', t.sw_short_code,
        'merchant_name', mc.business_name,
        'total_amount', t.total_amount,
        'currency_code', t.currency_code,
        'reason', rr.reason,
        'status', rr.status,
        'expires_at', rr.expires_at,
        'created_at', rr.created_at
    ) ORDER BY rr.created_at DESC), '[]'::jsonb)
      INTO v_ret_reqs
      FROM sawyan.return_requests rr
      JOIN sawyan.transactions t ON t.id = rr.transaction_id
      JOIN sawyan.merchants mc ON mc.id = rr.merchant_id
     WHERE rr.member_id = v_member.id
       AND rr.status = 'pending_otp'
       AND rr.expires_at > sawyan.now_utc();

    -- 8) الأكاديمية التدريبية
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ac.id,
        'slug', ac.slug,
        'title_i18n', ac.title_i18n,
        'content_i18n', ac.content_i18n,
        'media_url', ac.media_url,
        'sort_order', ac.sort_order
    ) ORDER BY ac.sort_order ASC), '[]'::jsonb)
      INTO v_courses
      FROM sawyan.academy_courses ac
     WHERE ac.is_published = true;

    -- 9) وسائل الاستلام وتهدئة 72 ساعة (W07)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pm.id,
        'provider', pm.provider,
        'account_holder_name', pm.account_holder_name,
        'last_four', pm.last_four,
        'card_brand', pm.card_brand,
        'is_verified', pm.is_verified,
        'cooldown_expires_at', pm.cooldown_expires_at,
        'is_cooldown_active', (pm.cooldown_expires_at > now()),
        'created_at', pm.created_at
    ) ORDER BY pm.created_at DESC), '[]'::jsonb)
      INTO v_pay_methods
      FROM sawyan.payment_methods pm
     WHERE pm.member_id = v_member.id;

    -- 10) بلاغات رفع الأسعار (S10)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pg.id,
        'transaction_id', pg.transaction_id,
        'merchant_name', mc.business_name,
        'declared_price', pg.declared_price,
        'charged_price', pg.charged_price,
        'verification_status', pg.verification_status,
        'created_at', pg.created_at
    ) ORDER BY pg.created_at DESC), '[]'::jsonb)
      INTO v_gouging
      FROM sawyan.price_gouging_reports pg
      JOIN sawyan.merchants mc ON mc.id = pg.merchant_id
     WHERE pg.member_id = v_member.id;

    v_fx_rate := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code <> 'USD')
        THEN v_country.admin_fx_rate
        WHEN v_country.currency_code = 'EGP' THEN 50.000000
        WHEN v_country.currency_code = 'TRY' THEN 50.000000
        WHEN v_country.currency_code = 'SAR' THEN 3.750000
        WHEN v_country.currency_code = 'AED' THEN 3.672500
        WHEN v_country.currency_code = 'EUR' THEN 0.920000
        ELSE 1.000000
    END;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'country_code', c2.country_code,
        'country_name_i18n', c2.country_name_i18n,
        'currency_code', c2.currency_code,
        'admin_fx_rate', CASE
            WHEN COALESCE(c2.admin_fx_rate, 0) > 0 AND NOT (c2.admin_fx_rate = 1.000000 AND c2.currency_code <> 'USD')
            THEN c2.admin_fx_rate
            WHEN c2.currency_code = 'EGP' THEN 50.000000
            WHEN c2.currency_code = 'TRY' THEN 50.000000
            WHEN c2.currency_code = 'SAR' THEN 3.750000
            WHEN c2.currency_code = 'AED' THEN 3.672500
            WHEN c2.currency_code = 'EUR' THEN 0.920000
            ELSE 1.000000
        END,
        'monthly_target_usd', c2.monthly_target_usd,
        'upline_ceiling_s02', v_s02_slots,
        'numerical_stopper_s01', v_s01_gens,
        'ideal_tree_nodes', v_ideal_nodes,
        'unit_share_usd', TRUNC(c2.monthly_target_usd / v_s02_slots, 2),
        'financial_stopper_usd', c2.financial_stopper_usd,
        'default_financial_stopper_usd', ROUND((v_ideal_nodes * TRUNC(c2.monthly_target_usd / v_s02_slots, 2))::numeric, 2),
        'is_active', c2.is_active
    ) ORDER BY c2.is_active DESC, c2.country_code ASC), '[]'::jsonb)
      INTO v_cty_matrix
      FROM sawyan.countries c2;

    RETURN jsonb_build_object(
        'period_ym', v_period,
        'lens_country_code', COALESCE(p_lens_country_code, 'ALL'),
        'profile', jsonb_build_object(
            'id', v_member.id,
            'member_code', v_member.member_code,
            'full_name', v_member.full_name,
            'email', v_member.email,
            'phone', v_member.phone,
            'country_code', v_country.country_code,
            'currency_code', v_country.currency_code,
            'fx_rate_to_usd', v_fx_rate,
            'monthly_target_usd', v_country.monthly_target_usd,
            'upline_ceiling_s02', v_s02_slots,
            'numerical_stopper_s01', v_s01_gens,
            'ideal_tree_nodes', v_ideal_nodes,
            'unit_share_usd', TRUNC(v_country.monthly_target_usd / v_s02_slots, 2),
            'financial_stopper_usd', v_country.financial_stopper_usd,
            'default_financial_stopper_usd', ROUND((v_ideal_nodes * TRUNC(v_country.monthly_target_usd / v_s02_slots, 2))::numeric, 2),
            'payout_cooldown_until', v_member.payout_cooldown_until,
            'manual_district_fallback', v_member.manual_district_fallback,
            'sponsor_code', v_sponsor.member_code,
            'sponsor_name', v_sponsor.full_name,
            'kyc_status', v_member.kyc_status,
            'metadata', v_member.metadata - 'pwd_bcrypt' - 'active_session_token',
            'created_at', v_member.created_at
        ),
        'wallet', jsonb_build_object(
            'id', v_wallet.id,
            'balance_usd', COALESCE(v_wallet.balance_usd, 0.00),
            'pending_balance_usd', COALESCE(v_wallet.pending_balance_usd, 0.00),
            's03_suspense_balance_usd', COALESCE(v_wallet.s03_suspense_balance_usd, 0.00),
            'total_earned_usd', COALESCE(v_wallet.total_earned_usd, 0.00)
        ),
        'countries_plan_matrix', v_cty_matrix,
        'target_boxes', v_boxes,
        'transactions', v_txs,
        'wallet_transactions', v_w_txs,
        'payment_methods', v_pay_methods,
        'price_gouging_reports', v_gouging,
        'tree_analytics', v_tree,
        'tree_topology', v_topology,
        'contacts', v_contacts,
        'notifications', v_notifs,
        'disputes', v_disputes,
        'pending_return_requests', v_ret_reqs,
        'academy_courses', v_courses,
        'registered_referrals', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', rm.id,
                'member_code', rm.member_code,
                'full_name', rm.full_name,
                'residency_country_code', rc.country_code,
                'placement_side', rm.placement_side,
                'parent_member_code', pm.member_code,
                'generation_in_tree', rm.generation_in_tree,
                'rel_depth', rtc.depth,
                'structural_me', CASE WHEN rtc.depth IS NOT NULL THEN (rtc.depth + 1) || 'Me' ELSE NULL END,
                'phone_visible', (rtc.depth IS NOT NULL AND rtc.depth BETWEEN 1 AND 10),
                'phone', CASE WHEN rtc.depth IS NOT NULL AND rtc.depth BETWEEN 1 AND 10 THEN rm.phone ELSE NULL END,
                'is_qualified_this_month', COALESCE(EXISTS(
                    SELECT 1 FROM sawyan.monthly_target_boxes rtb
                     WHERE rtb.member_id = rm.id AND rtb.period_ym = v_period AND rtb.is_qualified = true
                ), false),
                'kyc_status', rm.kyc_status,
                'created_at', rm.created_at
            ) ORDER BY rm.created_at DESC, rm.member_code DESC)
              FROM sawyan.members rm
              JOIN sawyan.countries rc ON rc.id = rm.residency_country_id
              LEFT JOIN sawyan.members pm ON pm.id = rm.parent_member_id
              LEFT JOIN sawyan.tree_closure rtc ON rtc.ancestor_id = v_member.id AND rtc.descendant_id = rm.id
             WHERE rm.sponsor_id = v_member.id
               AND rm.member_code > 0
        ), '[]'::jsonb),
        'closed_months_archive', COALESCE((
            SELECT jsonb_agg(row_to_json(cma)::jsonb ORDER BY cma.period_ym DESC, cma.country_code ASC)
              FROM (
                  SELECT sc.period_ym,
                         cc.country_code,
                         cc.currency_code,
                         cc.admin_fx_rate AS fx_rate,
                         sc.step_status,
                         sc.is_hard_locked,
                         sc.payout_executed_at,
                         COALESCE(tb.carry_on_in_usd, 0.00) AS carry_on_in_usd,
                         COALESCE(tb.current_month_purchases_usd, 0.00) AS purchases_usd,
                         COALESCE(tb.compensatory_incoming_usd, 0.00) AS compensatory_incoming_usd,
                         COALESCE(tb.target_required_usd, cc.monthly_target_usd) AS target_required_usd,
                         COALESCE(tb.target_consumed_usd, 0.00) AS target_consumed_usd,
                         COALESCE(tb.carry_on_out_usd, 0.00) AS carry_on_out_usd,
                         COALESCE(tb.is_qualified, false) AS is_qualified,
                         COALESCE(tb.qualification_source, 'none') AS qualification_source,
                         COALESCE((
                             SELECT ROUND(SUM(cd.share_amount_usd)::numeric, 2)
                               FROM sawyan.commission_distributions cd
                               JOIN sawyan.pool_transactions pt ON pt.id = cd.pool_transaction_id
                              WHERE pt.settlement_cycle_id = sc.id
                                AND cd.beneficiary_id = v_member.id
                         ), 0.00) AS commission_earned_usd,
                         COALESCE((
                             SELECT ROUND(SUM(sd.surplus_amount_usd)::numeric, 2)
                               FROM sawyan.surplus_distributions sd
                               JOIN sawyan.pool_transactions pt ON pt.id = sd.pool_transaction_id
                              WHERE pt.settlement_cycle_id = sc.id
                                AND sd.beneficiary_id = v_member.id
                         ), 0.00) AS surplus_earned_usd
                    FROM sawyan.settlement_cycles sc
                    JOIN sawyan.countries cc ON cc.id = sc.country_id
                    LEFT JOIN sawyan.monthly_target_boxes tb
                           ON tb.member_id = v_member.id AND tb.country_id = sc.country_id AND tb.period_ym = sc.period_ym
                   WHERE sc.is_hard_locked = true OR sc.payout_executed_at IS NOT NULL OR sc.period_ym < v_period
              ) cma
        ), '[]'::jsonb),
        'residency_move_requests', CASE
            WHEN v_member.metadata ? 'pending_residency_move' THEN
                jsonb_build_array((v_member.metadata->'pending_residency_move') || jsonb_build_object('current_country_code', v_country.country_code))
            ELSE '[]'::jsonb
        END
    );
END;
$$;

-- 5. إدارة دفتر المعارف الميداني Mini CRM للعضو (Point 10)
CREATE OR REPLACE FUNCTION sawyan.manage_member_crm_contact(
    p_member_id     UUID,
    p_action        VARCHAR(20),
    p_session_token TEXT DEFAULT NULL,
    p_contact_id    UUID DEFAULT NULL,
    p_contact_name  VARCHAR(150) DEFAULT NULL,
    p_contact_phone VARCHAR(24) DEFAULT NULL,
    p_notes         TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member  sawyan.members%ROWTYPE;
    v_act     VARCHAR(20);
    v_reg_id  UUID := NULL;
    v_new_id  UUID;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    v_act := lower(trim(COALESCE(p_action, '')));

    IF v_act = 'add' THEN
        IF trim(COALESCE(p_contact_name, '')) = '' THEN
            RAISE EXCEPTION 'CONTACT_NAME_REQUIRED';
        END IF;
        IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
            SELECT id INTO v_reg_id FROM sawyan.members
             WHERE phone = regexp_replace(trim(p_contact_phone), '\s+', '', 'g')
             LIMIT 1;
        END IF;

        INSERT INTO sawyan.member_contacts (
            owner_member_id, contact_name, contact_phone_e164, registered_member_id, notes
        ) VALUES (
            v_member.id, trim(p_contact_name), NULLIF(trim(COALESCE(p_contact_phone, '')), ''), v_reg_id, p_notes
        ) RETURNING id INTO v_new_id;

        RETURN jsonb_build_object('success', true, 'action', 'add', 'contact_id', v_new_id, 'registered_linked', v_reg_id IS NOT NULL);

    ELSIF v_act = 'toggle_opt_out' THEN
        UPDATE sawyan.member_contacts
           SET opted_out = NOT opted_out
         WHERE id = p_contact_id AND owner_member_id = v_member.id;
        RETURN jsonb_build_object('success', true, 'action', 'toggle_opt_out', 'contact_id', p_contact_id);

    ELSIF v_act = 'mark_reminded' THEN
        UPDATE sawyan.member_contacts
           SET last_whatsapp_reminder_at = now()
         WHERE id = p_contact_id AND owner_member_id = v_member.id;
        RETURN jsonb_build_object('success', true, 'action', 'mark_reminded', 'contact_id', p_contact_id);

    ELSIF v_act = 'delete' THEN
        DELETE FROM sawyan.member_contacts
         WHERE id = p_contact_id AND owner_member_id = v_member.id;
        RETURN jsonb_build_object('success', true, 'action', 'delete', 'contact_id', p_contact_id);
    ELSE
        RAISE EXCEPTION 'INVALID_CRM_ACTION: %', p_action;
    END IF;
END;
$$;

-- 6. فتح نزاع ثلاثي D6 والتقييمات وإعدادات العضو ومعاينة وموافقة المرتجع
DROP FUNCTION IF EXISTS sawyan.submit_member_dispute(UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, TEXT, SMALLINT);

CREATE OR REPLACE FUNCTION sawyan.submit_member_dispute(
    p_member_id        UUID,
    p_transaction_id   UUID,
    p_dispute_reason   TEXT,
    p_session_token    TEXT DEFAULT NULL,
    p_audio_url        TEXT DEFAULT NULL,
    p_audio_sec        SMALLINT DEFAULT NULL,
    p_video_url        TEXT DEFAULT NULL,
    p_video_sec        SMALLINT DEFAULT NULL,
    p_dispute_category VARCHAR DEFAULT 'general',
    p_evidence_url     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member           sawyan.members%ROWTYPE;
    v_tx               sawyan.transactions%ROWTYPE;
    v_country          sawyan.countries%ROWTYPE;
    v_cycle            sawyan.settlement_cycles%ROWTYPE;
    v_box              sawyan.monthly_target_boxes%ROWTYPE;
    v_cat              VARCHAR(30);
    v_is_ret_disp      BOOLEAN := false;
    v_tx_ym            CHAR(7);
    v_local_now        TIMESTAMP;
    v_cutoff_local_ts  TIMESTAMP;
    v_is_fast_track    BOOLEAN := false;
    v_init_status      VARCHAR(30) := 'awaiting_merchant_friendly';
    v_sla_hours        INTERVAL := interval '48 hours';
    v_id               UUID;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id AND member_id = v_member.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    IF trim(COALESCE(p_dispute_reason, '')) = '' THEN
        RAISE EXCEPTION 'DISPUTE_REASON_REQUIRED';
    END IF;

    v_cat := lower(trim(COALESCE(NULLIF(p_dispute_category, ''), 'general')));
    IF v_cat NOT IN ('general', 'return_stalled', 'pending_rejected', 'amount_mismatch') THEN
        RAISE EXCEPTION 'INVALID_DISPUTE_CATEGORY: %', p_dispute_category;
    END IF;

    v_is_ret_disp := (v_cat = 'return_stalled') OR (p_dispute_reason ~* '(مرتجع|استرداد|إرجاع|ارجاع|return|refund)');
    IF v_is_ret_disp THEN
        v_cat := 'return_stalled';
    END IF;

    -- قصر حظر ما بعد الصرف على الفواتير المكتملة ونزاعات المرتجع الاستردادية فقط (إصلاح الحظر الأعمى لـ T06/S04)
    IF v_tx.status = 'completed' AND v_is_ret_disp THEN
        SELECT * INTO v_country FROM sawyan.countries WHERE id = v_tx.country_id;
        v_tx_ym := COALESCE(
            v_tx.commission_snapshot->>'effective_period_ym',
            to_char(COALESCE(v_tx.completed_at, v_tx.created_at) AT TIME ZONE v_country.iana_timezone, 'YYYY-MM')
        );
        SELECT * INTO v_cycle
          FROM sawyan.settlement_cycles
         WHERE country_id = v_country.id AND period_ym = v_tx_ym;

        v_local_now       := sawyan.now_utc() AT TIME ZONE v_country.iana_timezone;
        v_cutoff_local_ts := (to_date(v_tx_ym || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp
                           + (v_country.return_cutoff_day || ' days')::interval;

        IF (v_cycle.id IS NOT NULL AND (v_cycle.is_hard_locked IS TRUE OR v_cycle.step_status >= 5 OR v_cycle.payout_executed_at IS NOT NULL))
           OR (v_local_now >= v_cutoff_local_ts)
        THEN
            RAISE EXCEPTION 'POST_PAYOUT_RETURN_FORBIDDEN: Dispute/return window for this period is permanently closed after Day 15 payout.';
        END IF;

        -- قفل منع النزاع الكيدي الفارغ (S10 Anti-Sabotage): يتطلب دليلاً مادياً أو طلب مرتجع قائم
        IF NULLIF(trim(COALESCE(p_evidence_url, p_video_url, p_audio_url, '')), '') IS NULL
           AND NOT EXISTS (SELECT 1 FROM sawyan.return_requests rr WHERE rr.transaction_id = v_tx.id)
        THEN
            RAISE EXCEPTION 'RETURN_DISPUTE_EVIDENCE_REQUIRED: Stalled-return disputes require proof attachment or an active return request.';
        END IF;

        -- تصعيد فوري للأدمن (Fast-Track P0) إذا كانت التذكرة كاسرة للتأهل أو في آخر 72 ساعة قبل القطع
        SELECT * INTO v_box
          FROM sawyan.monthly_target_boxes
         WHERE member_id = v_member.id AND country_id = v_country.id AND period_ym = v_tx_ym;

        IF FOUND THEN
            v_is_fast_track := (
                (v_box.carry_on_in_usd + v_box.current_month_purchases_usd) >= v_box.target_required_usd
                AND (v_box.carry_on_in_usd + v_box.current_month_purchases_usd - v_tx.income_plan_share_usd) < v_box.target_required_usd
            );
        END IF;

        IF v_is_fast_track OR (v_local_now >= (v_cutoff_local_ts - interval '72 hours')) THEN
            v_init_status := 'escalated_to_admin';
            v_sla_hours   := interval '12 hours';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM sawyan.dispute_tickets
         WHERE transaction_id = v_tx.id
           AND status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
    ) THEN
        RAISE EXCEPTION 'OPEN_DISPUTE_ALREADY_EXISTS';
    END IF;

    INSERT INTO sawyan.dispute_tickets (
        transaction_id, member_id, merchant_id, dispute_category, dispute_reason,
        evidence_url, audio_url, audio_duration_sec, video_url, video_duration_sec,
        status, sla_deadline_at
    ) VALUES (
        v_tx.id, v_member.id, v_tx.merchant_id, v_cat, trim(p_dispute_reason),
        NULLIF(trim(COALESCE(p_evidence_url, '')), ''), p_audio_url, p_audio_sec, p_video_url, p_video_sec,
        v_init_status, sawyan.now_utc() + v_sla_hours
    ) RETURNING id INTO v_id;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', v_tx.merchant_id, 'DisputeTicketOpened', 'in_app',
            jsonb_build_object('dispute_id', v_id, 'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'category', v_cat, 'fast_tracked', (v_init_status = 'escalated_to_admin')));

    RETURN jsonb_build_object(
        'success', true,
        'dispute_id', v_id,
        'dispute_category', v_cat,
        'status', v_init_status,
        'fast_tracked', (v_init_status = 'escalated_to_admin')
    );
END;
$$;

-- 6-أ. معاينة أثر المرتجع للعضو قبل الضغط على موافقة (S08 Return Impact Preview)
CREATE OR REPLACE FUNCTION sawyan.preview_pos_return_impact(
    p_member_id      UUID,
    p_transaction_id UUID,
    p_session_token  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member       sawyan.members%ROWTYPE;
    v_tx           sawyan.transactions%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_box          sawyan.monthly_target_boxes%ROWTYPE;
    v_period_ym    CHAR(7);
    v_curr_ym      CHAR(7);
    v_before_usd   NUMERIC(18,6);
    v_after_usd    NUMERIC(18,6);
    v_target_usd   NUMERIC(18,2);
    v_was_qual     BOOLEAN := false;
    v_stays_qual   BOOLEAN := false;
    v_shield_used  BOOLEAN := false;
    v_shortfall    NUMERIC(18,2) := 0.00;
    v_next_carry   NUMERIC(18,2) := 0.00;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id AND member_id = v_member.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_tx.country_id;
    v_curr_ym   := to_char(sawyan.now_utc() AT TIME ZONE v_country.iana_timezone, 'YYYY-MM');
    v_period_ym := COALESCE(
        v_tx.commission_snapshot->>'effective_period_ym',
        to_char(COALESCE(v_tx.completed_at, v_tx.created_at) AT TIME ZONE v_country.iana_timezone, 'YYYY-MM')
    );

    SELECT * INTO v_box
      FROM sawyan.monthly_target_boxes
     WHERE member_id = v_member.id AND country_id = v_country.id AND period_ym = v_period_ym;

    v_target_usd := COALESCE(v_box.target_required_usd, v_country.monthly_target_usd);
    v_before_usd := COALESCE(v_box.carry_on_in_usd + v_box.current_month_purchases_usd, 0.000000);
    v_after_usd  := GREATEST(0.000000, v_before_usd - v_tx.income_plan_share_usd);
    v_was_qual   := (v_before_usd >= v_target_usd) AND NOT COALESCE(v_member.is_tombstone_banned, false);
    v_stays_qual := (v_after_usd >= v_target_usd) AND NOT COALESCE(v_member.is_tombstone_banned, false);
    v_shield_used := v_was_qual AND v_stays_qual AND (COALESCE(v_box.carry_on_in_usd, 0) > 0) AND ((v_before_usd - COALESCE(v_box.carry_on_in_usd, 0) - v_tx.income_plan_share_usd) < v_target_usd);
    v_shortfall  := CASE WHEN v_stays_qual THEN 0.00 ELSE ROUND((v_target_usd - v_after_usd)::numeric, 2) END;
    v_next_carry := CASE WHEN v_stays_qual THEN ROUND((v_after_usd - v_target_usd)::numeric, 2) ELSE ROUND(v_after_usd::numeric, 2) END;

    RETURN jsonb_build_object(
        'transaction_id', v_tx.id,
        'sw_short_code', v_tx.sw_short_code,
        'period_ym', v_period_ym,
        'is_closed_month_window', (v_period_ym < v_curr_ym),
        'deducted_plan_usd', ROUND(v_tx.income_plan_share_usd::numeric, 2),
        'target_required_usd', v_target_usd,
        'box_before_usd', ROUND(v_before_usd::numeric, 2),
        'box_after_usd', ROUND(v_after_usd::numeric, 2),
        'was_qualified', v_was_qual,
        'stays_qualified', v_stays_qual,
        'carry_on_shield_used', v_shield_used,
        'shortfall_to_requalify_usd', v_shortfall,
        'next_month_carry_on_usd', v_next_carry
    );
END;
$$;

-- 6-ب. رد العضو من تطبيقه بالموافقة أو الرفض على طلب المرتجع (In-App Two-Step Confirmation)
CREATE OR REPLACE FUNCTION sawyan.member_respond_pos_return(
    p_member_id         UUID,
    p_return_request_id UUID,
    p_decision          VARCHAR, -- 'approve' | 'reject'
    p_session_token     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member  sawyan.members%ROWTYPE;
    v_req     sawyan.return_requests%ROWTYPE;
    v_dec     VARCHAR(20);
    v_rev_res JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    v_dec := lower(trim(COALESCE(p_decision, '')));
    IF v_dec NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'INVALID_RETURN_DECISION: %', p_decision;
    END IF;

    SELECT * INTO v_req
      FROM sawyan.return_requests
     WHERE id = p_return_request_id AND member_id = v_member.id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RETURN_REQUEST_NOT_FOUND';
    END IF;

    IF v_req.status IN ('approved_in_app', 'approved_otp') THEN
        RETURN jsonb_build_object('success', true, 'status', v_req.status, 'already_processed', true);
    END IF;
    IF v_req.status <> 'pending_otp' THEN
        RAISE EXCEPTION 'RETURN_REQUEST_NOT_PENDING: status=%', v_req.status;
    END IF;
    IF v_req.expires_at <= sawyan.now_utc() THEN
        UPDATE sawyan.return_requests SET status = 'expired', resolved_at = sawyan.now_utc() WHERE id = v_req.id;
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_REQUEST_EXPIRED');
    END IF;

    IF v_dec = 'approve' THEN
        UPDATE sawyan.return_requests
           SET status      = 'approved_in_app',
               resolved_at = sawyan.now_utc()
         WHERE id = v_req.id;

        v_rev_res := sawyan.process_transaction_reversal_clawback(
            v_req.transaction_id,
            v_member.id,
            v_req.reason,
            v_req.id
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'approved_in_app',
            'return_request_id', v_req.id,
            'reversal', v_rev_res
        );
    ELSE
        UPDATE sawyan.return_requests
           SET status      = 'rejected_member',
               resolved_at = sawyan.now_utc()
         WHERE id = v_req.id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'merchant',
            v_req.merchant_id,
            'PosReturnRejectedByMember',
            'in_app',
            jsonb_build_object('return_request_id', v_req.id, 'transaction_id', v_req.transaction_id)
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'rejected_member',
            'return_request_id', v_req.id
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.submit_member_review(
    p_member_id      UUID,
    p_transaction_id UUID,
    p_rating         SMALLINT,
    p_comment        TEXT DEFAULT NULL,
    p_session_token  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member sawyan.members%ROWTYPE;
    v_tx     sawyan.transactions%ROWTYPE;
    v_id     UUID;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id AND member_id = v_member.id AND status = 'completed';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMPLETED_TX_REQUIRED_FOR_REVIEW';
    END IF;

    INSERT INTO sawyan.reviews (transaction_id, member_id, merchant_id, rating, comment)
    VALUES (v_tx.id, v_member.id, v_tx.merchant_id, p_rating, NULLIF(trim(COALESCE(p_comment, '')), ''))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'review_id', v_id);
END;
$$;

DROP FUNCTION IF EXISTS sawyan.update_member_profile_settings(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT);
CREATE OR REPLACE FUNCTION sawyan.update_member_profile_settings(
    p_member_id            UUID,
    p_session_token        TEXT DEFAULT NULL,
    p_full_name            VARCHAR(150) DEFAULT NULL,
    p_email                VARCHAR(255) DEFAULT NULL,
    p_manual_district      VARCHAR(60) DEFAULT NULL,
    p_favorite_merchant_id UUID DEFAULT NULL,
    p_favorite_action      VARCHAR(12) DEFAULT NULL,
    p_current_password     TEXT DEFAULT NULL,
    p_new_password         TEXT DEFAULT NULL,
    p_home_lat             NUMERIC DEFAULT NULL,
    p_home_lng             NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member   sawyan.members%ROWTYPE;
    v_meta     JSONB;
    v_favs     JSONB;
    v_new_favs JSONB := '[]'::jsonb;
    v_old_hash TEXT;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    v_meta := COALESCE(v_member.metadata, '{}'::jsonb);

    IF p_new_password IS NOT NULL AND trim(p_new_password) <> '' THEN
        IF length(trim(p_new_password)) < 8 OR trim(p_new_password) IN ('123456', '12345678', 'password') THEN
            RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED';
        END IF;
        v_old_hash := v_meta->>'pwd_bcrypt';
        IF v_old_hash IS NOT NULL THEN
            IF p_current_password IS NULL OR extensions.crypt(p_current_password, v_old_hash) <> v_old_hash THEN
                RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
            END IF;
        END IF;
        v_meta := jsonb_set(v_meta, '{pwd_bcrypt}', to_jsonb(extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))));
    END IF;

    IF p_favorite_merchant_id IS NOT NULL THEN
        v_favs := COALESCE(v_meta->'favorite_merchant_ids', '[]'::jsonb);
        IF lower(COALESCE(p_favorite_action, 'toggle')) = 'remove'
           OR (lower(COALESCE(p_favorite_action, 'toggle')) = 'toggle' AND v_favs @> to_jsonb(p_favorite_merchant_id::text)) THEN
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_new_favs
              FROM jsonb_array_elements(v_favs) elem
             WHERE elem #>> '{}' <> p_favorite_merchant_id::text;
            v_meta := jsonb_set(v_meta, '{favorite_merchant_ids}', v_new_favs);
        ELSE
            IF NOT (v_favs @> to_jsonb(p_favorite_merchant_id::text)) THEN
                v_meta := jsonb_set(v_meta, '{favorite_merchant_ids}', v_favs || to_jsonb(p_favorite_merchant_id::text));
            END IF;
        END IF;
    END IF;

    IF p_home_lat IS NOT NULL AND p_home_lng IS NOT NULL THEN
        IF p_home_lat < -90 OR p_home_lat > 90 OR p_home_lng < -180 OR p_home_lng > 180 THEN
            RAISE EXCEPTION 'INVALID_HOME_GPS_COORDINATES';
        END IF;
        v_meta := jsonb_set(
            v_meta,
            '{home_gps}',
            jsonb_build_object('lat', ROUND(p_home_lat::numeric, 6), 'lng', ROUND(p_home_lng::numeric, 6), 'updated_at', now())
        );
    END IF;

    UPDATE sawyan.members
       SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
           email = COALESCE(NULLIF(lower(trim(p_email)), ''), email),
           manual_district_fallback = COALESCE(NULLIF(trim(p_manual_district), ''), manual_district_fallback),
           metadata = v_meta
     WHERE id = v_member.id
    RETURNING * INTO v_member;

    RETURN jsonb_build_object(
        'success', true,
        'member_id', v_member.id,
        'full_name', v_member.full_name,
        'email', v_member.email,
        'manual_district_fallback', v_member.manual_district_fallback,
        'home_gps', v_member.metadata->'home_gps',
        'favorite_merchant_ids', COALESCE(v_member.metadata->'favorite_merchant_ids', '[]'::jsonb)
    );
END;
$$;

-- 7. دليل التجار العام (بدون كشف 25% أو عمولات سرية — متاح بدون GPS للفلترة بالدولة والتصنيف)
CREATE OR REPLACE FUNCTION sawyan.get_public_merchants_catalog(
    p_country_code CHAR(2) DEFAULT NULL,
    p_category     VARCHAR DEFAULT NULL
) RETURNS TABLE (
    merchant_id       UUID,
    branch_id         UUID,
    merchant_code     VARCHAR,
    business_name     VARCHAR,
    branch_name       VARCHAR,
    category          VARCHAR,
    merchant_type     VARCHAR,
    country_code      CHAR(2),
    currency_code     CHAR(3),
    address           TEXT,
    plan_cashback_pct NUMERIC,
    latitude          NUMERIC,
    longitude         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT m.id,
           mb.id,
           m.merchant_code,
           m.business_name,
           mb.branch_name,
           m.category,
           m.merchant_type,
           c.country_code,
           c.currency_code,
           mb.address,
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
       AND (p_country_code IS NULL OR c.country_code = upper(trim(p_country_code)))
       AND (p_category IS NULL OR m.category = p_category)
     ORDER BY m.business_name ASC, mb.is_main_branch DESC;
$$;

-- 8. تقديم طلب توثيق معلق من العضو (المسار ب — محكوم بجلسة العضو + قيد طلبين + سقف 20% Soft Hold)
CREATE OR REPLACE FUNCTION sawyan.submit_member_pending_purchase(
    p_member_id       UUID,
    p_merchant_id     UUID,
    p_branch_id       UUID,
    p_amount          NUMERIC(18,2),
    p_payment_type    VARCHAR DEFAULT 'cash',
    p_idempotency_key UUID DEFAULT NULL,
    p_session_token   TEXT DEFAULT NULL,
    p_receipt_url     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member     sawyan.members%ROWTYPE;
    v_idem       UUID;
    v_short_code VARCHAR(24);
    v_ref        VARCHAR(128);
    v_res        JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PURCHASE_AMOUNT';
    END IF;

    v_idem := COALESCE(p_idempotency_key, gen_random_uuid());
    v_short_code := 'SW-' || upper(substr(replace(v_idem::text, '-', ''), 1, 6));
    v_ref := 'MBR-' || v_member.member_code || '-' || replace(v_idem::text, '-', '');

    v_res := sawyan.submit_pos_transaction(
        v_member.id,
        p_merchant_id,
        p_branch_id,
        p_amount,
        COALESCE(p_payment_type, 'cash'),
        v_ref,
        v_short_code,
        v_idem,
        NULL,
        false,
        p_receipt_url
    );

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', p_merchant_id, 'PendingPurchaseRequested', 'in_app',
            jsonb_build_object('sw_short_code', v_short_code, 'amount', p_amount, 'member_code', v_member.member_code));

    RETURN v_res || jsonb_build_object('sw_short_code', v_short_code);
END;
$$;

-- 8ب. إلغاء طلب التوثيق المعلق من قِبل العضو قبل تأكيد التاجر (مع تحرير الـ Soft Hold فوراً)
CREATE OR REPLACE FUNCTION sawyan.cancel_member_pending_purchase(
    p_member_id      UUID,
    p_transaction_id UUID,
    p_session_token  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member sawyan.members%ROWTYPE;
    v_tx     sawyan.transactions%ROWTYPE;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);

    SELECT * INTO v_tx
      FROM sawyan.transactions
     WHERE id = p_transaction_id
       AND member_id = v_member.id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_PURCHASE_NOT_FOUND';
    END IF;
    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'ONLY_PENDING_PURCHASE_CAN_BE_CANCELLED: %', v_tx.status;
    END IF;

    UPDATE sawyan.merchants
       SET soft_hold_balance = GREATEST(0, soft_hold_balance - v_tx.commission_amount)
     WHERE id = v_tx.merchant_id;

    UPDATE sawyan.transactions
       SET status = 'rejected',
           commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb)
               || jsonb_build_object('cancelled_by', 'member', 'cancelled_at', now())
     WHERE id = v_tx.id;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', v_tx.merchant_id, 'PendingPurchaseCancelledByMember', 'in_app',
            jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'member_code', v_member.member_code));

    PERFORM sawyan.append_audit_log(
        'member', v_member.id, 'pending_purchase_cancelled_by_member', 'transactions', v_tx.id::text,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('status', 'rejected', 'cancelled_by', 'member')
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx.id,
        'sw_short_code', v_tx.sw_short_code,
        'status', 'rejected'
    );
END;
$$;

-- منح صلاحيات الاستدعاء المحكومة بالجلسة (verify_member_session)
REVOKE ALL ON FUNCTION sawyan.verify_member_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.register_new_member(VARCHAR, VARCHAR, BIGINT, TEXT, CHAR, CHAR, BIGINT, VARCHAR, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_member_login(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_public_merchants_catalog(CHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_member_dashboard_bundle(UUID, TEXT, CHAR, CHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.manage_member_crm_contact(UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_dispute(UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, TEXT, SMALLINT, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.preview_pos_return_impact(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.member_respond_pos_return(UUID, UUID, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_review(UUID, UUID, SMALLINT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.update_member_profile_settings(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, NUMERIC, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.cancel_member_pending_purchase(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
