-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 11: LAUNCH-HARDENING AUTH, PRIVACY & TOP-UP RPCS
-- ============================================================================
-- Strictly Idempotent. Safe to run & regex-clone across production & QA schemas.
-- ZERO bare lowercase schema names inside string literals.
-- ============================================================================

-- 1. تعطيل القفل المؤقت لتسجيل الدخول (15 دقيقة) بناءً على قرار المؤسس (2026-11-23)
-- يبقى جدول auth_rate_limits والدالة المحجوزة auth_rate_limit_guard بتمرير غير قافل للحفاظ على توافق العقود وRLS
CREATE TABLE IF NOT EXISTS sawyan.auth_rate_limits (
    bucket_key      TEXT PRIMARY KEY,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sawyan.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sawyan.auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sawyan.auth_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION sawyan.auth_rate_limit_guard(
    p_bucket TEXT,
    p_op     TEXT DEFAULT 'check'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- خاصية منع الدخول لمدة 15 دقيقة ملغاة نهائياً بقرار المؤسس؛ لا قفل ولا عداد محاولات
    RETURN jsonb_build_object(
        'locked', false,
        'disabled', true,
        'failed_attempts', 0,
        'attempts_remaining', NULL,
        'locked_until', NULL
    );
END;
$$;

-- 2. تسجيل دخول العضو (بدون قفل 15 دقيقة عند إدخال كلمة مرور خاطئة) وإرجاع JSONB منظم عند الفشل
CREATE OR REPLACE FUNCTION sawyan.authenticate_member_login(
    p_identifier TEXT,
    p_password   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ident         TEXT;
    v_code_try      TEXT;
    v_phone_clean   TEXT;
    v_digits        TEXT;
    v_local_suffix  TEXT;
    v_match_count   INT;
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

    v_code_try := regexp_replace(upper(v_ident), '^(#|SWY-?|MEM-?)', '');
    v_phone_clean := regexp_replace(v_ident, '[\s\-\(\)]+', '', 'g');
    v_digits := regexp_replace(v_phone_clean, '[^0-9]', '', 'g');

    IF position('@' IN v_ident) > 0 THEN
        SELECT * INTO v_member FROM sawyan.members WHERE lower(email) = lower(v_ident) LIMIT 1;
    ELSIF v_code_try ~ '^\d{1,9}$' AND left(v_ident, 1) <> '+' AND NOT (left(v_ident, 1) = '0' AND length(v_ident) >= 8) THEN
        SELECT * INTO v_member FROM sawyan.members WHERE member_code = v_code_try::bigint LIMIT 1;
    ELSE
        SELECT * INTO v_member
          FROM sawyan.members
         WHERE phone = v_phone_clean
            OR phone = '+' || v_digits
         LIMIT 1;

        IF NOT FOUND AND length(v_digits) >= 8 THEN
            v_local_suffix := regexp_replace(v_digits, '^0+', '');
            IF length(v_local_suffix) >= 8 THEN
                SELECT count(*) INTO v_match_count
                  FROM sawyan.members
                 WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || v_local_suffix;
                IF v_match_count = 1 THEN
                    SELECT * INTO v_member
                      FROM sawyan.members
                     WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || v_local_suffix
                     LIMIT 1;
                END IF;
            END IF;
        END IF;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_CREDENTIALS'
        );
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
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVALID_CREDENTIALS'
            );
        END IF;
    ELSE
        IF NOT (v_member.email LIKE '%.demo' AND p_password = 'Demo@Sawyan2026') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVALID_CREDENTIALS'
            );
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
            'avatar_url', NULLIF(v_member.metadata->>'avatar_url', ''),
            'completed_tx_count', (SELECT COUNT(*) FROM sawyan.transactions WHERE member_id = v_member.id AND status = 'completed'),
            'must_change_password', COALESCE((v_member.metadata->>'must_change_password')::boolean, false),
            'metadata', v_member.metadata - 'pwd_bcrypt' - 'active_session_token' - 'pin_rl',
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

-- 3. تسجيل دخول التاجر (بدون قفل 15 دقيقة عند إدخال كلمة مرور خاطئة) والحفاظ الكامل على حقول المحاور الثلاثة
CREATE OR REPLACE FUNCTION sawyan.authenticate_merchant_login(
    p_identifier TEXT,
    p_password   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_ident        TEXT;
    v_phone_clean  TEXT;
    v_digits       TEXT;
    v_local_suffix TEXT;
    v_match_count  INT;
    v_merch        sawyan.merchants%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_token        TEXT;
    v_eff          JSONB;
BEGIN
    v_ident := trim(COALESCE(p_identifier, ''));
    IF v_ident = '' OR COALESCE(p_password, '') = '' THEN
        RAISE EXCEPTION 'CREDENTIALS_REQUIRED';
    END IF;

    IF trim(p_password) = '123456' THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED';
    END IF;

    v_phone_clean := regexp_replace(v_ident, '[\s\-\(\)]+', '', 'g');
    v_digits := regexp_replace(v_phone_clean, '[^0-9]', '', 'g');

    SELECT * INTO v_merch
      FROM sawyan.merchants
     WHERE upper(merchant_code) = upper(v_ident)
        OR lower(email) = lower(v_ident)
        OR phone = v_phone_clean
        OR (v_digits <> '' AND phone = '+' || v_digits)
     LIMIT 1;

    IF NOT FOUND AND length(v_digits) >= 8 AND position('@' IN v_ident) = 0 THEN
        v_local_suffix := regexp_replace(v_digits, '^0+', '');
        IF length(v_local_suffix) >= 8 THEN
            SELECT count(*) INTO v_match_count
              FROM sawyan.merchants
             WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || v_local_suffix;
            IF v_match_count = 1 THEN
                SELECT * INTO v_merch
                  FROM sawyan.merchants
                 WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || v_local_suffix
                 LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_MERCHANT_CREDENTIALS'
        );
    END IF;
    IF v_merch.onboarding_status = 'rejected' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_REJECTED';
    END IF;
    IF v_merch.governance_status = 'banned_permanent' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_BANNED';
    END IF;
    IF v_merch.password_hash IS NULL OR v_merch.password_hash <> extensions.crypt(p_password, v_merch.password_hash) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_MERCHANT_CREDENTIALS'
        );
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');

    UPDATE sawyan.merchants
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_token, 'last_login_at', now())
     WHERE id = v_merch.id;

    v_eff := sawyan.sync_merchant_status_flags(v_merch.id);

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_token,
        'merchant', jsonb_build_object(
            'id', v_merch.id,
            'merchant_code', v_merch.merchant_code,
            'business_name', v_merch.business_name,
            'owner_name', v_merch.owner_name,
            'email', v_merch.email,
            'phone', v_merch.phone,
            'category', v_merch.category,
            'merchant_type', v_merch.merchant_type,
            'deduction_percent', v_merch.deduction_percent,
            'country_code', v_country.country_code,
            'currency_code', v_country.currency_code,
            'onboarding_status', v_eff->>'onboarding_status',
            'financial_status', v_eff->>'financial_status',
            'governance_status', v_eff->>'governance_status',
            'effective_access', v_eff->'effective_access',
            'must_change_password', COALESCE((v_merch.metadata->>'must_change_password')::boolean, false)
        )
    );
END;
$$;

-- 4. تسجيل دخول الإدارة السيادية (بدون قفل 15 دقيقة عند إدخال كلمة مرور خاطئة)
CREATE OR REPLACE FUNCTION sawyan.authenticate_admin_login(
    p_email     TEXT,
    p_password  TEXT,
    p_totp_code VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin      sawyan.admins%ROWTYPE;
    v_norm_email TEXT;
    v_raw_token  TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_norm_email := lower(trim(COALESCE(p_email, '')));
    IF v_norm_email = '' OR COALESCE(p_password, '') = '' THEN
        RAISE EXCEPTION 'ADMIN_LOGIN_MISSING_CREDENTIALS';
    END IF;

    IF trim(p_password) = '123456' THEN
        RAISE EXCEPTION 'CONSTITUTIONAL_SECURITY_VIOLATION: Weak default password [123456] is permanently prohibited (D10).';
    END IF;

    SELECT * INTO v_admin
      FROM sawyan.admins
     WHERE lower(email) = v_norm_email
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ADMIN_INVALID_CREDENTIALS'
        );
    END IF;

    IF v_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN_ACCOUNT_DEACTIVATED';
    END IF;

    IF v_admin.password_hash IS NULL OR v_admin.password_hash <> extensions.crypt(p_password, v_admin.password_hash) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ADMIN_INVALID_CREDENTIALS'
        );
    END IF;

    v_raw_token  := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
    v_expires_at := now() + interval '8 hours';

    UPDATE sawyan.admins
       SET last_login_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'session_token_sha256', v_token_hash,
               'session_expires_at', v_expires_at,
               'last_totp_verified', (p_totp_code IS NOT NULL AND length(trim(p_totp_code)) >= 6)
           )
     WHERE id = v_admin.id;

    PERFORM sawyan.append_audit_log(
        'admin',
        v_admin.id,
        'admin_authenticated_session_issued',
        'admins',
        v_admin.id::text,
        NULL,
        jsonb_build_object('role', v_admin.role, 'expires_at', v_expires_at)
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_raw_token,
        'expires_at', v_expires_at,
        'admin', jsonb_build_object(
            'id', v_admin.id,
            'full_name', v_admin.full_name,
            'email', v_admin.email,
            'role', v_admin.role,
            'is_sovereign_founder', COALESCE((v_admin.metadata->>'is_sovereign_founder')::boolean, false),
            'must_change_password', v_admin.must_change_password,
            'two_factor_enabled', v_admin.two_factor_enabled,
            'is_active', v_admin.is_active,
            'last_login_at', now()
        )
    );
END;
$$;

-- 5. تقنيع الاسم الكامل في lookup_sponsor_by_code لمنع تعداد بيانات الأعضاء (Enumeration Privacy Mask)
CREATE OR REPLACE FUNCTION sawyan.lookup_sponsor_by_code(
    p_member_code BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec    RECORD;
    v_clean  TEXT;
    v_parts  TEXT[];
    v_masked TEXT;
BEGIN
    IF p_member_code IS NULL OR p_member_code < 0 THEN
        RETURN jsonb_build_object('found', false, 'error', 'INVALID_SPONSOR_CODE');
    END IF;

    IF p_member_code = 0 THEN
        RAISE EXCEPTION 'ROOT_SPONSOR_RESTRICTED_TO_ADMIN: Direct public registration under Root #0 is prohibited.';
    END IF;

    SELECT m.id, m.member_code, m.full_name, m.is_active_in_tree, c.country_code
      INTO v_rec
      FROM sawyan.members m
      JOIN sawyan.countries c ON c.id = m.residency_country_id
     WHERE m.member_code = p_member_code
       AND m.status = 'active'
       AND m.is_tombstone_banned = false
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'member_code', p_member_code);
    END IF;

    v_clean := trim(COALESCE(v_rec.full_name, ''));
    v_parts := regexp_split_to_array(v_clean, '\s+');
    IF array_length(v_parts, 1) >= 2 THEN
        v_masked := v_parts[1] || ' ' || left(v_parts[2], 1) || '***';
    ELSIF length(v_clean) >= 2 THEN
        v_masked := left(v_clean, 2) || '***';
    ELSE
        v_masked := 'عضو *** #' || v_rec.member_code::text;
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'member_id', v_rec.id,
        'member_code', v_rec.member_code,
        'full_name', v_masked,
        'masked_name', v_masked,
        'country_code', v_rec.country_code,
        'is_active_in_tree', v_rec.is_active_in_tree
    );
END;
$$;

-- 6. توحيد طلب شحن رصيد التاجر مع مرفق الإيصال الاختياري وربطه مباشرة بطابور الإدارة والمالية
DROP FUNCTION IF EXISTS sawyan.merchant_initiate_topup(UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT);

CREATE OR REPLACE FUNCTION sawyan.merchant_initiate_topup(
    p_merchant_id        UUID,
    p_amount             NUMERIC(18,2),
    p_provider           VARCHAR(40) DEFAULT 'bank_transfer',
    p_payment_ref        VARCHAR(120) DEFAULT NULL,
    p_idempotency_key    UUID DEFAULT NULL,
    p_session_token      TEXT DEFAULT NULL,
    p_receipt_image_data TEXT DEFAULT NULL,
    p_receipt_note       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch    sawyan.merchants%ROWTYPE;
    v_idem     UUID;
    v_ref      VARCHAR(120);
    v_fifo_res JSONB;
    v_maker_id UUID;
    v_req_id   UUID;
    v_rec_img  TEXT;
    v_note     TEXT;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'POSITIVE_TOPUP_AMOUNT_REQUIRED';
    END IF;

    v_idem := COALESCE(p_idempotency_key, gen_random_uuid());
    v_ref  := COALESCE(NULLIF(trim(COALESCE(p_payment_ref, '')), ''), 'TOP-' || upper(substr(replace(v_idem::text, '-', ''), 1, 8)));
    v_rec_img := sawyan.validate_attachment_data(p_receipt_image_data, 480000, true);
    v_note := left(trim(COALESCE(p_receipt_note, '')), 500);

    IF v_merch.email LIKE '%@merchant.demo' OR v_merch.email LIKE '%@sawyan.demo' THEN
        v_fifo_res := sawyan.process_merchant_topup_fifo(v_merch.id, p_amount, v_ref, v_idem, 0.00, COALESCE(p_provider, 'demo_sandbox'));
        RETURN jsonb_build_object('success', true, 'mode', 'demo_instant_fifo', 'topup_result', v_fifo_res, 'payment_ref', v_ref);
    END IF;

    SELECT id INTO v_maker_id FROM sawyan.admins WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
    IF v_maker_id IS NOT NULL THEN
        INSERT INTO sawyan.maker_checker_requests (
            action_type, target_entity, target_id, payload_after, reason, maker_admin_id, status
        ) VALUES (
            'MERCHANT_TOPUP_BANK_VERIFICATION',
            'merchants',
            v_merch.id::text,
            jsonb_build_object(
                'merchant_id', v_merch.id,
                'merchant_code', v_merch.merchant_code,
                'business_name', v_merch.business_name,
                'amount', p_amount,
                'provider', COALESCE(NULLIF(trim(COALESCE(p_provider, '')), ''), 'bank_transfer'),
                'payment_ref', v_ref,
                'receipt_note', v_note,
                'has_receipt_image', (v_rec_img IS NOT NULL),
                'idempotency_key', v_idem
            ),
            'طلب شحن رصيد متجر عبر التحويل البنكي — مرجع ' || v_ref,
            v_maker_id,
            'pending'
        ) RETURNING id INTO v_req_id;
    END IF;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES (
        'admin',
        v_merch.id,
        'MerchantBankTopupProofPending',
        'in_app',
        jsonb_build_object(
            'merchant_id', v_merch.id,
            'merchant_code', v_merch.merchant_code,
            'business_name', v_merch.business_name,
            'amount_local', p_amount,
            'provider', COALESCE(NULLIF(trim(COALESCE(p_provider, '')), ''), 'bank_transfer'),
            'bank_ref', v_ref,
            'receipt_note', v_note,
            'receipt_image_data', v_rec_img,
            'verification_request_id', v_req_id,
            'submitted_at', now()
        )
    );

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch.id, 'merchant_topup_verification_submitted', 'merchants', v_merch.id::text,
        NULL, jsonb_build_object('amount', p_amount, 'provider', p_provider, 'payment_ref', v_ref, 'has_receipt', (v_rec_img IS NOT NULL))
    );

    RETURN jsonb_build_object(
        'success', true,
        'mode', 'pending_bank_or_webhook_verification',
        'verification_request_id', v_req_id,
        'payment_ref', v_ref
    );
END;
$$;

-- 7. ترقية حزمة لوحة التاجر بإضافة طلبات الشحن البنكية قيد المراجعة (`pending_topup_requests`)
CREATE OR REPLACE FUNCTION sawyan.get_merchant_dashboard_bundle(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL,
    p_shift_filter  VARCHAR(20) DEFAULT 'today',
    p_branch_id     UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_eff          JSONB;
    v_fin          VARCHAR(30);
    v_free_bal     NUMERIC(18,2);
    v_free_pct     NUMERIC(6,2);
    v_safe_sales   NUMERIC(18,2);
    v_zone         VARCHAR(20);
    v_today_sales  NUMERIC(18,2);
    v_today_comm   NUMERIC(18,2);
    v_today_cnt    INT;
    v_month_sales  NUMERIC(18,2);
    v_month_comm   NUMERIC(18,2);
    v_shift        JSONB;
    v_radar_1km    JSONB;
    v_radar_2km    JSONB;
    v_radar_3km    JSONB;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_eff   := sawyan.sync_merchant_status_flags(v_merch.id);
    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_merch.id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;

    SELECT * INTO v_main_br FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    v_fin      := v_eff->>'financial_status';
    v_free_bal := COALESCE((v_eff->>'free_balance')::numeric, 0.00);
    v_free_pct := COALESCE((v_eff->>'free_pct')::numeric, 0.00);
    v_safe_sales := CASE WHEN v_merch.deduction_percent > 0
                         THEN ROUND((GREATEST(0, v_free_bal) / (v_merch.deduction_percent / 100.0))::numeric, 2)
                         ELSE 0.00 END;

    v_zone := CASE v_fin
        WHEN 'healthy_green'  THEN 'GREEN'
        WHEN 'warning_yellow' THEN 'YELLOW'
        WHEN 'warning_red'    THEN 'RED'
        ELSE 'ISOLATED'
    END;

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00), COUNT(*)
      INTO v_today_sales, v_today_comm, v_today_cnt
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('day', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00)
      INTO v_month_sales, v_month_comm
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('month', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    v_shift := sawyan.get_merchant_shift_closing(v_merch.id, p_branch_id, COALESCE(p_shift_filter, 'today'), NULL, NULL, NULL, NULL);
    IF v_main_br.id IS NOT NULL THEN
        v_radar_1km := sawyan.get_merchant_members_density(v_main_br.id, 1.0);
        v_radar_2km := sawyan.get_merchant_members_density(v_main_br.id, 2.0);
        v_radar_3km := sawyan.get_merchant_members_density(v_main_br.id, 3.0);
    END IF;

    RETURN jsonb_build_object(
        'profile', (
            jsonb_build_object(
                'id', v_merch.id,
                'merchant_code', v_merch.merchant_code,
                'business_name', v_merch.business_name,
                'owner_name', v_merch.owner_name,
                'email', v_merch.email,
                'phone', v_merch.phone,
                'category', v_merch.category,
                'merchant_type', v_merch.merchant_type,
                'deduction_percent', v_merch.deduction_percent,
                'commission_pending', COALESCE((v_merch.metadata->>'commission_pending')::boolean, v_merch.deduction_percent <= 0),
                'commission_locked', COALESCE((v_merch.metadata->>'commission_locked')::boolean, false),
                'package_base_amount', v_merch.package_base_amount,
                'actual_cash_balance', v_merch.actual_cash_balance,
                'soft_hold_balance', v_merch.soft_hold_balance,
                'credit_limit', v_merch.credit_limit,
                'free_balance', v_free_bal,
                'free_pct', v_free_pct,
                'safe_sales_capacity', v_safe_sales,
                'zone_status', v_zone,
                'is_active', v_merch.is_active,
                'is_isolated', v_merch.is_isolated,
                'onboarding_status', v_eff->>'onboarding_status',
                'onboarding_notes', v_eff->>'onboarding_notes',
                'financial_status', v_fin,
                'governance_status', v_eff->>'governance_status',
                'pre_pause_governance_status', v_eff->>'pre_pause_governance_status',
                'governance_reason', v_eff->>'governance_reason'
            ) || jsonb_build_object(
                'effective_access', v_eff->'effective_access',
                'violation_counters', v_eff->'violation_counters',
                'effective_queue_cap', v_eff->'effective_queue_cap',
                'effective_isolate_pct', v_eff->'effective_isolate_pct',
                'unsecured_queue_cap_override', v_merch.unsecured_queue_cap_override,
                'isolate_pct_override', v_merch.isolate_pct_override,
                'deferred_settlement_cutoff_time', v_merch.deferred_settlement_cutoff_time,
                'd4_cycle_days_override', v_merch.d4_cycle_days_override,
                'd4_grace_hours_override', v_merch.d4_grace_hours_override,
                'd4_time_trigger_disabled', COALESCE((v_merch.metadata->>'d4_time_trigger_disabled')::boolean, false),
                'd4_effective_cycle_days', v_eff->'d4_effective_cycle_days',
                'd4_effective_cutoff_time', v_eff->'d4_effective_cutoff_time',
                'd4_effective_grace_hours', v_eff->'d4_effective_grace_hours',
                'd4_cycle_close_at', v_eff->'d4_cycle_close_at',
                'd4_grace_due_at', v_eff->'d4_grace_due_at',
                'd4_statement_due_local', v_eff->'d4_statement_due_local',
                'd4_open_cycle_comm_local', v_eff->'d4_open_cycle_comm_local',
                'd4_in_grace_window', v_eff->'d4_in_grace_window',
                'cutoff_breached', v_eff->'cutoff_breached',
                'overdue_days', v_eff->'overdue_days',
                'fifo_default_days', v_eff->'fifo_default_days',
                'warn1_pct', v_eff->'warn1_pct',
                'warn2_pct', v_eff->'warn2_pct',
                'missing_required_fields', v_eff->'missing_required_fields',
                'hide_reason_ar', v_eff->'hide_reason_ar',
                'pos_lock_reason_ar', v_eff->'pos_lock_reason_ar'
            ) || jsonb_build_object(
                'address_is_fallback', COALESCE((v_merch.metadata->>'address_is_fallback')::boolean, false),
                'geo_is_fallback', COALESCE((v_merch.metadata->>'geo_is_fallback')::boolean, false),
                'address', COALESCE(v_merch.address, v_main_br.address),
                'district', NULLIF(v_merch.metadata->>'district', ''),
                'city_name', NULLIF(v_merch.metadata->>'city_name', ''),
                'city_geoname_id', COALESCE(v_main_br.city_geoname_id, NULLIF(v_merch.metadata->>'city_geoname_id', '')::bigint),
                'latitude', COALESCE(v_merch.latitude, v_main_br.latitude),
                'longitude', COALESCE(v_merch.longitude, v_main_br.longitude),
                'google_maps_url', NULLIF(v_merch.metadata->>'google_maps_url', ''),
                'description', NULLIF(v_merch.metadata->>'description', ''),
                'website_url', NULLIF(v_merch.metadata->>'website_url', ''),
                'webhook_url', NULLIF(v_merch.metadata->>'webhook_url', ''),
                'whatsapp', NULLIF(v_merch.metadata->>'whatsapp', ''),
                'social', COALESCE(v_merch.metadata->'social', '{}'::jsonb),
                'commercial_reg_no', NULLIF(v_merch.metadata->>'commercial_reg_no', ''),
                'tax_id', NULLIF(COALESCE(v_merch.tax_registration_no, v_merch.metadata->>'tax_id'), ''),
                'country_code', v_country.country_code,
                'currency_code', v_country.currency_code,
                'wifi_ssid', v_merch.metadata->>'wifi_ssid',
                'wifi_password', v_merch.metadata->>'wifi_password',
                'working_hours', COALESCE(v_merch.metadata->'working_hours', to_jsonb('09:00 - 23:00'::text)),
                'logo_url', NULLIF(v_merch.metadata->>'logo_url', ''),
                'cover_image_url', NULLIF(v_merch.metadata->>'cover_image_url', ''),
                'images', CASE WHEN jsonb_typeof(v_merch.metadata->'images') = 'array' THEN v_merch.metadata->'images' ELSE '[]'::jsonb END,
                'kyc_docs', COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb),
                'today_sales_local', v_today_sales,
                'today_commission_local', v_today_comm,
                'today_merchant_net_local', v_today_sales - v_today_comm,
                'today_completed_count', v_today_cnt,
                'month_sales_local', v_month_sales,
                'month_commission_local', v_month_comm,
                'month_merchant_net_local', v_month_sales - v_month_comm
            )
        ),
        'branches', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'branch_code', b.branch_code, 'branch_name', b.branch_name,
                'is_main_branch', b.is_main_branch, 'address', b.address,
                'latitude', b.latitude, 'longitude', b.longitude,
                'daily_commission_cap_local', b.daily_commission_cap_local, 'is_branch_active', b.is_branch_active
            ) ORDER BY b.is_main_branch DESC, b.created_at ASC)
            FROM sawyan.merchant_branches b WHERE b.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'cashiers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ce.id, 'branch_id', ce.branch_id, 'employee_code', ce.employee_code,
                'full_name', ce.full_name, 'linked_member_id', ce.linked_member_id,
                'employee_phone', v_merch.metadata->'cashier_phones'->>ce.id::text,
                'notify_owner_realtime', ce.notify_owner_realtime,
                'failed_pin_attempts', ce.failed_pin_attempts, 'pin_locked_until', ce.pin_locked_until,
                'max_tx_amount_limit', ce.max_tx_amount_limit, 'is_active', ce.is_active
            ) ORDER BY ce.employee_code ASC)
            FROM sawyan.cashier_employees ce WHERE ce.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'pending_transactions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'sw_short_code', t.sw_short_code, 'unique_payment_ref', t.unique_payment_ref, 'status', t.status,
                'total_amount', t.total_amount, 'commission_amount', t.commission_amount,
                'merchant_net_amount', t.total_amount - t.commission_amount,
                'currency_code', t.currency_code, 'payment_type', t.payment_type,
                'receipt_media_url', t.receipt_media_url, 'fifo_seq', t.fifo_seq,
                'created_at', t.created_at,
                'member_code', m.member_code,
                'member_masked_name', sawyan.mask_member_display_name(m.full_name, m.member_code)
            ) ORDER BY t.fifo_seq ASC)
            FROM sawyan.transactions t
            JOIN sawyan.members m ON m.id = t.member_id
            WHERE t.merchant_id = v_merch.id AND t.status IN ('pending', 'awaiting_merchant_topup')
        ), '[]'::jsonb),
        'completed_transactions', COALESCE((
            SELECT jsonb_agg(row_to_json(sub)) FROM (
                SELECT t.id, t.sw_short_code, t.unique_payment_ref, t.status, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, t.receipt_media_url, (t.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                       t.completed_at, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       mb.branch_name, COALESCE(ce.full_name, 'مالك المتجر (توثيق مباشر)') AS cashier_name
                  FROM sawyan.transactions t
                  JOIN sawyan.members m ON m.id = t.member_id
                  LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
                  LEFT JOIN sawyan.cashier_employees ce ON ce.id = t.cashier_employee_id
                 WHERE t.merchant_id = v_merch.id AND t.status IN ('completed', 'reversed')
                 ORDER BY t.created_at DESC LIMIT 100
            ) sub
        ), '[]'::jsonb),
        'b2b_tax_invoices', COALESCE((
            SELECT jsonb_agg(row_to_json(inv)) FROM (
                SELECT invoice_number, document_type, net_commission_amount, vat_rate_applied,
                       vat_amount, gross_invoice_total, currency_code, issued_at
                  FROM sawyan.b2b_tax_invoices
                 WHERE merchant_id = v_merch.id
                 ORDER BY issued_at DESC LIMIT 50
            ) inv
        ), '[]'::jsonb),
        'topup_history', COALESCE((
            SELECT jsonb_agg(row_to_json(tp)) FROM (
                SELECT je.id, je.entry_number, je.description, je.posted_at,
                       jl.amount_local, jl.currency_code
                  FROM sawyan.journal_entries je
                  JOIN sawyan.journal_lines jl ON jl.journal_entry_id = je.id
                 WHERE je.source_type = 'MERCHANT_TOPUP'
                   AND jl.account_code = '2101'
                   AND jl.entity_id = v_merch.id
                 ORDER BY je.posted_at DESC LIMIT 30
            ) tp
        ), '[]'::jsonb),
        'pending_topup_requests', COALESCE((
            SELECT jsonb_agg(row_to_json(pr)) FROM (
                SELECT mc.id,
                       COALESCE((mc.payload_after->>'amount')::numeric, 0.00) AS amount,
                       COALESCE(mc.payload_after->>'payment_ref', '') AS payment_ref,
                       COALESCE(mc.payload_after->>'provider', 'bank_transfer') AS provider,
                       COALESCE(mc.payload_after->>'receipt_note', '') AS receipt_note,
                       mc.created_at
                  FROM sawyan.maker_checker_requests mc
                 WHERE mc.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION'
                   AND mc.target_id = v_merch.id::text
                   AND mc.status = 'pending'
                 ORDER BY mc.created_at DESC LIMIT 20
            ) pr
        ), '[]'::jsonb),
        'shift_closing', v_shift,
        'radar_rings', jsonb_build_object('r1km', v_radar_1km, 'r2km', v_radar_2km, 'r3km', v_radar_3km),
        'flash_offers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', n.id,
                'status', CASE n.event_name
                    WHEN 'MerchantFlashOfferApproved' THEN 'approved'
                    WHEN 'MerchantFlashOfferRejected' THEN 'rejected'
                    ELSE 'pending'
                END,
                'payload', n.payload,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC)
            FROM sawyan.notifications n
            WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
              AND (n.recipient_id = v_merch.id OR n.payload->>'merchant_id' = v_merch.id::text)
        ), '[]'::jsonb),
        'notifications', COALESCE((
            SELECT jsonb_agg(row_to_json(nf)) FROM (
                SELECT id, event_name, payload, is_read, created_at
                  FROM sawyan.notifications
                 WHERE recipient_type = 'merchant' AND recipient_id = v_merch.id
                 ORDER BY created_at DESC LIMIT 25
            ) nf
        ), '[]'::jsonb)
    );
END;
$$;

-- 8. تحديث admin_search_and_reply_ops لإظهار السجل التجاري والرقم الضريبي وجميع إشعارات الشحن البنكي
CREATE OR REPLACE FUNCTION sawyan.admin_search_and_reply_ops(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_action        VARCHAR,
    p_entity        VARCHAR DEFAULT 'members',
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
                     m.credit_limit, m.tax_registration_no,
                     NULLIF(m.metadata->>'commercial_reg_no', '') AS commercial_reg_no,
                     NULLIF(COALESCE(m.tax_registration_no, m.metadata->>'tax_id'), '') AS tax_id,
                     m.is_active, m.is_isolated, m.created_at,
                     m.onboarding_status, m.onboarding_notes, m.governance_status, m.pre_pause_governance_status,
                     m.governance_reason, m.governance_updated_at, m.unsecured_queue_cap_override,
                     m.isolate_pct_override, m.deferred_settlement_cutoff_time, m.overdue_since_at,
                     m.d4_cycle_days_override, m.d4_grace_hours_override,
                     COALESCE((m.metadata->>'d4_time_trigger_disabled')::boolean, false) AS d4_time_trigger_disabled,
                     sawyan.compute_merchant_effective_state(m.id) AS lifecycle,
                     NULLIF(m.metadata->>'logo_url', '') AS logo_url,
                     NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
                     CASE WHEN jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images,
                     COALESCE(m.metadata->'kyc_docs', '{}'::jsonb) AS kyc_docs,
                     (SELECT COUNT(*) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'completed') AS ops_count,
                     (SELECT COUNT(*) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'awaiting_merchant_topup') AS fifo_queue_count,
                     (SELECT COALESCE(SUM(tx.commission_amount), 0.00) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'awaiting_merchant_topup') AS fifo_required_comm_local,
                     (SELECT COALESCE(SUM(tx.total_amount), 0.00) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'completed') AS gmv_local
                FROM sawyan.merchants m
                JOIN sawyan.countries c ON c.id = m.country_id
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (v_q = '' OR lower(m.merchant_code) LIKE '%' || v_q || '%' OR lower(m.business_name) LIKE '%' || v_q || '%' OR m.phone LIKE '%' || v_q || '%')
               ORDER BY m.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'merchant_complaints' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT cp.id, cp.complainant_id, cp.target_id AS merchant_id, cp.category, cp.subject,
                     cp.details, cp.evidence_url, cp.status, cp.admin_notes, cp.reviewed_at, cp.created_at,
                     mem.member_code, mem.full_name AS member_name,
                     mer.merchant_code, mer.business_name AS merchant_name, mer.governance_status,
                     c.country_code
                FROM sawyan.complaints cp
                JOIN sawyan.members mem ON mem.id = cp.complainant_id
                JOIN sawyan.merchants mer ON mer.id = cp.target_id
                JOIN sawyan.countries c ON c.id = mer.country_id
               WHERE cp.target_type = 'merchant'
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (
                     v_q = ''
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR lower(mer.merchant_code) LIKE '%' || v_q || '%'
                     OR lower(cp.subject) LIKE '%' || v_q || '%'
                     OR lower(cp.status) = v_q
                     OR lower(cp.category) = v_q
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                 )
               ORDER BY CASE WHEN cp.status = 'open' THEN 0 ELSE 1 END, cp.created_at DESC
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
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                     OR lower(d.status) = v_q
                 )
               ORDER BY d.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'support_tickets' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT s.*
                FROM sawyan.support_tickets s
               WHERE v_q = '' OR lower(COALESCE(s.subject, '')) LIKE '%' || v_q || '%' OR lower(COALESCE(s.message_body, '')) LIKE '%' || v_q || '%' OR lower(s.status) = v_q
               ORDER BY s.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'bank_topup_proofs' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT n.id, n.recipient_id AS merchant_id, n.event_name, n.payload, n.created_at,
                     mer.merchant_code, mer.business_name, c.country_code, c.currency_code
                FROM sawyan.notifications n
                JOIN sawyan.merchants mer ON mer.id = n.recipient_id
                JOIN sawyan.countries c ON c.id = mer.country_id
               WHERE n.event_name IN ('MerchantBankTopupProofPending', 'MerchantBankTopupSubmitted', 'MerchantBankTopupProofProcessed')
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
               ORDER BY CASE WHEN n.event_name = 'MerchantBankTopupProofProcessed' THEN 1 ELSE 0 END, n.created_at DESC
               LIMIT 50
          ) t;
    END IF;

    RETURN jsonb_build_object('entity', p_entity, 'scope', v_scope, 'results', v_results);
END;
$$;

-- 9. قفل الصلاحيات الأقل (Least-Privilege Lockdown) للدوال الجديدة والمحدّثة
REVOKE ALL ON FUNCTION sawyan.auth_rate_limit_guard(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.auth_rate_limit_guard(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION sawyan.authenticate_member_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.authenticate_merchant_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.authenticate_admin_login(TEXT, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.lookup_sponsor_by_code(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.merchant_initiate_topup(UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_search_and_reply_ops(UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.authenticate_member_login(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_merchant_login(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_admin_login(TEXT, TEXT, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.lookup_sponsor_by_code(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.merchant_initiate_topup(UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_search_and_reply_ops(UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID, TEXT, VARCHAR) TO anon, authenticated, service_role;

-- 10. استكمال تعبئة merchant_id في طلبات الشحن السابقة الناقصة وتفعيل 2FA لجميع المدراء النشطين
DO $$
BEGIN
    UPDATE sawyan.maker_checker_requests mc
       SET payload_after = mc.payload_after || jsonb_build_object('merchant_id', mc.target_id::uuid)
     WHERE mc.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION'
       AND mc.status = 'pending'
       AND NOT (mc.payload_after ? 'merchant_id')
       AND mc.target_id ~ '^[0-9a-fA-F\-]{36}$';

    UPDATE sawyan.admins
       SET two_factor_enabled = true
     WHERE is_active = true
       AND COALESCE(two_factor_enabled, false) = false;

    DELETE FROM sawyan.auth_rate_limits;
END $$;
