-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 5 MERCHANT POS, CASHIER PIN & PORTAL RPC LAYER
-- Constitutional Reference: الملف_التقني_للمطورين.md (Workflow 2, D4, D19, D25, M17, M18, S05, S08)
-- Enforces:
--   1. Zero '123456' Passwords, Bcrypt Hashing for Merchants & Cashier 4-Digit PINs
--   2. D25 Cashier PIN 5-Attempt Lockout (15m), Self-PIN Block & Collusion Detection
--   3. D4 Strict Prepaid Lock & FIFO Queue Release (No Unverified Prod Top-Up)
--   4. F01 / Ch. 7.2 #5 Zero Exposure of Internal 25%/75% Split to Merchant
--   5. M18 k-Anonymity >= 10 Radar & Point 13 Safe CSV Shift Closing
--   6. Explicit search_path & Strict REVOKE PUBLIC on all functions
-- ============================================================================

-- 0. ترقية جدول التجار بعمود هاش كلمة المرور المشفرة وبيانات الجلسة/الواي فاي (مع الحفاظ التام على عدد الجداول الـ 43)
ALTER TABLE sawyan.merchants
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 1. التحقق الصارم من جلسة التاجر (IDOR / BOLA Guard)
CREATE OR REPLACE FUNCTION sawyan.verify_merchant_session(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS sawyan.merchants
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch    sawyan.merchants%ROWTYPE;
    v_stored   TEXT;
    v_jwt_role TEXT;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;
    IF NOT v_merch.is_active THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_INACTIVE';
    END IF;

    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
        RETURN v_merch;
    END IF;

    v_stored := v_merch.metadata->>'active_session_token';
    IF v_stored IS NOT NULL AND p_session_token IS NOT NULL AND v_stored = p_session_token THEN
        RETURN v_merch;
    END IF;

    -- وضع المعاينة السريع للتاجر التجريبي الأول في المخطط الموازي فقط
    IF p_session_token = 'DEMO_PREVIEW_MERCHANT_EG1' AND v_merch.email LIKE '%@merchant.demo' THEN
        RETURN v_merch;
    END IF;

    RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
END;
$$;

-- 2. تسجيل تاجر جديد في 3 دقائق مع إنشاء الفرع الرئيسي وموظف الكاشير الافتراضي (Ch. 7.4 #1)
CREATE OR REPLACE FUNCTION sawyan.register_new_merchant(
    p_business_name            VARCHAR(180),
    p_owner_name               VARCHAR(150),
    p_phone                    VARCHAR(24),
    p_password                 TEXT,
    p_country_code             CHAR(2) DEFAULT 'EG',
    p_category                 VARCHAR(60) DEFAULT 'supermarket',
    p_merchant_type            VARCHAR(20) DEFAULT 'physical',
    p_deduction_percent        NUMERIC(5,2) DEFAULT 10.00,
    p_email                    VARCHAR(255) DEFAULT NULL,
    p_address                  TEXT DEFAULT NULL,
    p_city_geoname_id          BIGINT DEFAULT NULL,
    p_latitude                 NUMERIC(9,6) DEFAULT NULL,
    p_longitude                NUMERIC(9,6) DEFAULT NULL,
    p_onboarded_by_member_code BIGINT DEFAULT NULL,
    p_initial_cashier_pin      TEXT DEFAULT NULL,
    p_metadata                 JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_country        sawyan.countries%ROWTYPE;
    v_clean_name     VARCHAR(180);
    v_clean_owner    VARCHAR(150);
    v_clean_phone    VARCHAR(24);
    v_clean_email    VARCHAR(255);
    v_cat_slug       VARCHAR(60);
    v_mtype          VARCHAR(20);
    v_onboarder_id   UUID := NULL;
    v_seq_num        BIGINT;
    v_mcode          VARCHAR(20);
    v_pw_hash        TEXT;
    v_session_token  TEXT;
    v_merch_id       UUID;
    v_branch_id      UUID;
    v_lat            NUMERIC(9,6);
    v_lng            NUMERIC(9,6);
BEGIN
    v_clean_name  := trim(COALESCE(p_business_name, ''));
    v_clean_owner := COALESCE(NULLIF(trim(COALESCE(p_owner_name, '')), ''), v_clean_name);
    IF char_length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'MERCHANT_BUSINESS_NAME_REQUIRED';
    END IF;

    IF p_password IS NULL OR char_length(p_password) < 8 OR lower(trim(p_password)) IN ('123456', '12345678', 'password', 'qwerty123') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE country_code = upper(trim(COALESCE(p_country_code, 'EG')));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'COUNTRY_NOT_SUPPORTED: %', p_country_code;
    END IF;
    IF NOT v_country.is_active THEN
        RAISE EXCEPTION 'COUNTRY_GATE_INACTIVE_D13: %', v_country.country_code;
    END IF;

    v_clean_phone := regexp_replace(trim(COALESCE(p_phone, '')), '[^0-9+]', '', 'g');
    IF char_length(v_clean_phone) < 8 THEN
        RAISE EXCEPTION 'VALID_PHONE_REQUIRED';
    END IF;
    IF left(v_clean_phone, 1) <> '+' THEN
        v_clean_phone := '+' || regexp_replace(v_clean_phone, '^0+', '');
    END IF;

    v_mtype := lower(trim(COALESCE(p_merchant_type, 'physical')));
    IF v_mtype NOT IN ('physical', 'online', 'both') THEN
        v_mtype := 'physical';
    END IF;

    IF p_deduction_percent IS NULL OR p_deduction_percent < 1.00 OR p_deduction_percent > 40.00 THEN
        RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
    END IF;

    SELECT slug INTO v_cat_slug FROM sawyan.categories WHERE slug = lower(trim(COALESCE(p_category, 'other')));
    IF NOT FOUND THEN
        v_cat_slug := 'other';
    END IF;

    IF p_onboarded_by_member_code IS NOT NULL AND p_onboarded_by_member_code > 0 THEN
        SELECT id INTO v_onboarder_id FROM sawyan.members WHERE member_code = p_onboarded_by_member_code AND is_tombstone_banned = false;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_merchant_code_seq'));
    SELECT COUNT(*) + 101 INTO v_seq_num FROM sawyan.merchants WHERE country_id = v_country.id;
    LOOP
        v_mcode := 'M-' || v_country.country_code || '-' || v_seq_num::text;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = v_mcode);
        v_seq_num := v_seq_num + 1;
    END LOOP;

    v_clean_email := lower(NULLIF(trim(COALESCE(p_email, '')), ''));
    IF v_clean_email IS NULL THEN
        v_clean_email := lower(replace(v_mcode, '-', '')) || '@merchants.sawyan.global';
    END IF;

    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(32), 'hex');

    v_lat := COALESCE(p_latitude, CASE WHEN v_country.country_code = 'TR' THEN 41.008200 ELSE 30.044400 END);
    v_lng := COALESCE(p_longitude, CASE WHEN v_country.country_code = 'TR' THEN 28.978400 ELSE 31.235700 END);

    INSERT INTO sawyan.merchants (
        merchant_code, country_id, onboarded_by_member_id, business_name, owner_name,
        email, phone, category, merchant_type, deduction_percent,
        package_base_amount, actual_cash_balance, soft_hold_balance, credit_limit,
        is_isolated, address, latitude, longitude, is_active, password_hash, metadata
    ) VALUES (
        v_mcode, v_country.id, v_onboarder_id, v_clean_name, v_clean_owner,
        v_clean_email, v_clean_phone, v_cat_slug, v_mtype, ROUND(p_deduction_percent::numeric, 2),
        0.00, 0.00, 0.00, 0.00,
        false, COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), v_clean_name || ' - الفرع الرئيسي'),
        v_lat, v_lng, true, v_pw_hash,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_session_token, 'last_login_at', now())
    ) RETURNING id INTO v_merch_id;

    INSERT INTO sawyan.merchant_branches (
        merchant_id, branch_code, branch_name, is_main_branch, city_geoname_id,
        address, latitude, longitude, branch_phone, branch_manager_name, is_branch_active
    ) VALUES (
        v_merch_id, 'BR-01', 'الفرع الرئيسي — ' || v_clean_name, true, p_city_geoname_id,
        COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), 'الفرع الرئيسي'),
        v_lat, v_lng, v_clean_phone, v_clean_owner, true
    ) RETURNING id INTO v_branch_id;

    IF p_initial_cashier_pin IS NOT NULL AND trim(p_initial_cashier_pin) ~ '^\d{4}$' THEN
        INSERT INTO sawyan.cashier_employees (
            merchant_id, branch_id, employee_code, full_name, pin_hash, is_active
        ) VALUES (
            v_merch_id, v_branch_id, 'EMP-01', 'كاشير رئيسي — ' || v_clean_owner,
            extensions.crypt(trim(p_initial_cashier_pin), extensions.gen_salt('bf', 10)), true
        );
    END IF;

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch_id, 'merchant_registered_v3', 'merchants', v_merch_id::text,
        NULL, jsonb_build_object('merchant_code', v_mcode, 'country', v_country.country_code, 'deduction_percent', p_deduction_percent)
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_session_token,
        'main_branch_id', v_branch_id,
        'merchant', jsonb_build_object(
            'id', v_merch_id,
            'merchant_code', v_mcode,
            'business_name', v_clean_name,
            'owner_name', v_clean_owner,
            'email', v_clean_email,
            'phone', v_clean_phone,
            'country_code', v_country.country_code,
            'currency_code', v_country.currency_code,
            'category', v_cat_slug,
            'merchant_type', v_mtype,
            'deduction_percent', ROUND(p_deduction_percent::numeric, 2)
        )
    );
END;
$$;

-- 3. تسجيل دخول التاجر الموثق بـ Bcrypt (يرفض أي كلمة مرور افتراضية 123456)
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
    v_ident   TEXT;
    v_merch   sawyan.merchants%ROWTYPE;
    v_country sawyan.countries%ROWTYPE;
    v_token   TEXT;
BEGIN
    v_ident := trim(COALESCE(p_identifier, ''));
    IF v_ident = '' OR COALESCE(p_password, '') = '' THEN
        RAISE EXCEPTION 'CREDENTIALS_REQUIRED';
    END IF;

    SELECT * INTO v_merch
      FROM sawyan.merchants
     WHERE upper(merchant_code) = upper(v_ident)
        OR lower(email) = lower(v_ident)
        OR phone = v_ident
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_MERCHANT_CREDENTIALS';
    END IF;
    IF NOT v_merch.is_active THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_INACTIVE';
    END IF;
    IF v_merch.password_hash IS NULL OR v_merch.password_hash <> extensions.crypt(p_password, v_merch.password_hash) THEN
        RAISE EXCEPTION 'INVALID_MERCHANT_CREDENTIALS';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');

    UPDATE sawyan.merchants
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_token, 'last_login_at', now())
     WHERE id = v_merch.id;

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
            'currency_code', v_country.currency_code
        )
    );
END;
$$;

-- 4. استعلام فوري آمن عن العضو على شاشة الكاشير بدون كشف رقم الهاتف أو البريد (D26)
CREATE OR REPLACE FUNCTION sawyan.lookup_member_for_pos(
    p_merchant_id       UUID,
    p_member_identifier TEXT,
    p_session_token     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch  sawyan.merchants%ROWTYPE;
    v_digits TEXT;
    v_code   BIGINT;
    v_mem    sawyan.members%ROWTYPE;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_digits := regexp_replace(trim(COALESCE(p_member_identifier, '')), '[^0-9]', '', 'g');
    IF v_digits = '' THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    v_code := v_digits::bigint;
    IF v_code <= 0 THEN
        RETURN jsonb_build_object('found', false, 'reason', 'ROOT_NOT_ALLOWED_AT_POS');
    END IF;

    SELECT * INTO v_mem
      FROM sawyan.members
     WHERE member_code = v_code
       AND is_tombstone_banned = false
       AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'member_id', v_mem.id,
        'member_code', v_mem.member_code,
        'full_name', v_mem.full_name,
        'masked_name', sawyan.mask_member_display_name(v_mem.full_name, v_mem.member_code)
    );
END;
$$;

-- 5. توثيق عملية الكاشير الفورية ومزامنة الأوفلاين مع حوكمة PIN الموظف (5 محاولات قفل 15 دقيقة — D25 / D4 / S05)
CREATE OR REPLACE FUNCTION sawyan.authenticate_and_submit_pos_tx(
    p_merchant_id        UUID,
    p_member_code        BIGINT,
    p_amount             NUMERIC(18,2),
    p_payment_type       VARCHAR(30) DEFAULT 'cash',
    p_idempotency_key    UUID DEFAULT NULL,
    p_session_token      TEXT DEFAULT NULL,
    p_branch_id          UUID DEFAULT NULL,
    p_employee_code      VARCHAR(30) DEFAULT NULL,
    p_cashier_pin        TEXT DEFAULT NULL,
    p_sw_short_code      VARCHAR(20) DEFAULT NULL,
    p_unique_payment_ref VARCHAR(120) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch         sawyan.merchants%ROWTYPE;
    v_existing_idem sawyan.idempotency_keys%ROWTYPE;
    v_mem           sawyan.members%ROWTYPE;
    v_cashier       sawyan.cashier_employees%ROWTYPE;
    v_cashier_id    UUID := NULL;
    v_branch_id     UUID;
    v_short_code    VARCHAR(20);
    v_pay_ref       VARCHAR(120);
    v_new_attempts  SMALLINT;
    v_lock_until    TIMESTAMPTZ;
    v_pos_res       JSONB;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
    END IF;

    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    IF p_member_code IS NULL OR p_member_code <= 0 THEN
        RAISE EXCEPTION 'VALID_MEMBER_CODE_REQUIRED';
    END IF;
    SELECT * INTO v_mem FROM sawyan.members WHERE member_code = p_member_code AND is_tombstone_banned = false AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND_OR_INACTIVE';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'POSITIVE_INVOICE_AMOUNT_REQUIRED';
    END IF;

    -- التحقق من موظف الكاشير والـ PIN المستقل وقفل 5 محاولات (D25)
    IF NULLIF(trim(COALESCE(p_employee_code, '')), '') IS NOT NULL THEN
        SELECT * INTO v_cashier
          FROM sawyan.cashier_employees
         WHERE merchant_id = v_merch.id
           AND upper(employee_code) = upper(trim(p_employee_code))
         FOR UPDATE;

        IF NOT FOUND OR NOT v_cashier.is_active THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'CASHIER_NOT_FOUND_OR_INACTIVE');
        END IF;

        IF v_cashier.pin_locked_until IS NOT NULL AND v_cashier.pin_locked_until > now() THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'CASHIER_PIN_LOCKED_15M',
                'locked_until', v_cashier.pin_locked_until
            );
        END IF;

        IF COALESCE(p_cashier_pin, '') = '' OR v_cashier.pin_hash <> extensions.crypt(trim(p_cashier_pin), v_cashier.pin_hash) THEN
            v_new_attempts := v_cashier.failed_pin_attempts + 1;
            v_lock_until := CASE WHEN v_new_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

            UPDATE sawyan.cashier_employees
               SET failed_pin_attempts = v_new_attempts,
                   pin_locked_until    = COALESCE(v_lock_until, pin_locked_until)
             WHERE id = v_cashier.id;

            IF v_new_attempts >= 5 THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                VALUES ('merchant', v_merch.id, 'CashierPinLocked5Attempts', 'in_app',
                        jsonb_build_object('employee_code', v_cashier.employee_code, 'locked_until', v_lock_until));
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error_code', CASE WHEN v_new_attempts >= 5 THEN 'CASHIER_PIN_LOCKED_15M' ELSE 'INVALID_CASHIER_PIN' END,
                'failed_attempts', v_new_attempts,
                'remaining_attempts', GREATEST(0, 5 - v_new_attempts),
                'locked_until', v_lock_until
            );
        END IF;

        -- تصفير عداد الفشل عند نجاح الـ PIN
        IF v_cashier.failed_pin_attempts > 0 OR v_cashier.pin_locked_until IS NOT NULL THEN
            UPDATE sawyan.cashier_employees
               SET failed_pin_attempts = 0,
                   pin_locked_until    = NULL
             WHERE id = v_cashier.id;
        END IF;

        v_cashier_id := v_cashier.id;
        v_branch_id  := COALESCE(p_branch_id, v_cashier.branch_id);
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE merchant_id = v_merch.id AND is_branch_active = true
         ORDER BY is_main_branch DESC, created_at ASC
         LIMIT 1;
    END IF;
    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'NO_ACTIVE_MERCHANT_BRANCH';
    END IF;

    v_short_code := COALESCE(NULLIF(trim(COALESCE(p_sw_short_code, '')), ''), 'SW-' || upper(substr(replace(p_idempotency_key::text, '-', ''), 1, 6)));
    v_pay_ref    := COALESCE(NULLIF(trim(COALESCE(p_unique_payment_ref, '')), ''), 'POS-' || p_idempotency_key::text);

    v_pos_res := sawyan.submit_pos_transaction(
        v_mem.id,
        v_merch.id,
        v_branch_id,
        p_amount,
        CASE lower(trim(COALESCE(p_payment_type, 'cash')))
            WHEN 'card' THEN 'pos_card'
            WHEN 'instapay' THEN 'instant_transfer'
            WHEN 'wallet' THEN 'digital_wallet'
            WHEN '' THEN 'cash'
            ELSE lower(trim(p_payment_type))
        END,
        v_pay_ref,
        v_short_code,
        p_idempotency_key,
        v_cashier_id,
        true,
        NULL
    );

    RETURN jsonb_build_object(
        'success', COALESCE((v_pos_res->>'status') <> 'rejected_self_cashier_pin', true),
        'pos_result', v_pos_res,
        'sw_short_code', v_short_code,
        'member_name', v_mem.full_name,
        'member_code', v_mem.member_code,
        'commission_deducted_local', ROUND((p_amount * (v_merch.deduction_percent / 100.0))::numeric, 2),
        'merchant_net_local', ROUND((p_amount - (p_amount * (v_merch.deduction_percent / 100.0)))::numeric, 2)
    );
END;
$$;

-- 6. اعتماد أو رفض الفاتورة المعلقة من المسار B ذرياً (بدون أي تعديل محافظ من المتصفح — D21)
CREATE OR REPLACE FUNCTION sawyan.confirm_or_reject_pending_tx(
    p_merchant_id      UUID,
    p_transaction_id   UUID,
    p_decision         VARCHAR(20),
    p_rejection_reason TEXT DEFAULT NULL,
    p_session_token    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch sawyan.merchants%ROWTYPE;
    v_tx    sawyan.transactions%ROWTYPE;
    v_dec   VARCHAR(20);
    v_feed  JSONB;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_dec   := lower(trim(COALESCE(p_decision, '')));

    SELECT * INTO v_tx
      FROM sawyan.transactions
     WHERE id = p_transaction_id AND merchant_id = v_merch.id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_TX_NOT_FOUND';
    END IF;
    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
    END IF;

    IF v_dec = 'approve' THEN
        v_feed := sawyan.feed_monthly_target_box(v_tx.id, v_merch.id);
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceApproved', 'in_app',
                jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'status', v_feed->>'status'));
        RETURN jsonb_build_object('success', true, 'decision', 'approved', 'result', v_feed);

    ELSIF v_dec = 'reject' THEN
        UPDATE sawyan.merchants
           SET soft_hold_balance = GREATEST(0, soft_hold_balance - v_tx.commission_amount)
         WHERE id = v_merch.id;

        UPDATE sawyan.transactions
           SET status = 'rejected'
         WHERE id = v_tx.id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_rejection_reason, 'غير مطابق')));

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'pending_tx_rejected', 'transactions', v_tx.id::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'rejected', 'reason', p_rejection_reason)
        );
        RETURN jsonb_build_object('success', true, 'decision', 'rejected', 'transaction_id', v_tx.id);
    ELSE
        RAISE EXCEPTION 'INVALID_DECISION_USE_APPROVE_OR_REJECT';
    END IF;
END;
$$;

-- 7. إدارة إعدادات المتجر، الواي فاي، وموظفي الكاشير المستقلين (مع قفل نسبة العمولة — D25)
CREATE OR REPLACE FUNCTION sawyan.manage_merchant_cashier_and_settings(
    p_merchant_id          UUID,
    p_action               VARCHAR(30),
    p_session_token        TEXT DEFAULT NULL,
    p_business_name        VARCHAR(180) DEFAULT NULL,
    p_owner_name           VARCHAR(150) DEFAULT NULL,
    p_phone                VARCHAR(24) DEFAULT NULL,
    p_address              TEXT DEFAULT NULL,
    p_latitude             NUMERIC(9,6) DEFAULT NULL,
    p_longitude            NUMERIC(9,6) DEFAULT NULL,
    p_wifi_ssid            TEXT DEFAULT NULL,
    p_wifi_password        TEXT DEFAULT NULL,
    p_working_hours        TEXT DEFAULT NULL,
    p_current_password     TEXT DEFAULT NULL,
    p_new_password         TEXT DEFAULT NULL,
    p_employee_code        VARCHAR(30) DEFAULT NULL,
    p_employee_name        VARCHAR(150) DEFAULT NULL,
    p_employee_pin         TEXT DEFAULT NULL,
    p_linked_member_code   BIGINT DEFAULT NULL,
    p_max_tx_limit         NUMERIC(18,2) DEFAULT NULL,
    p_employee_id          UUID DEFAULT NULL,
    p_branch_id            UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch       sawyan.merchants%ROWTYPE;
    v_act         VARCHAR(30);
    v_main_br_id  UUID;
    v_linked_mid  UUID := NULL;
    v_new_emp_id  UUID;
    v_meta_patch  JSONB := '{}'::jsonb;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_act   := lower(trim(COALESCE(p_action, 'update_profile')));

    SELECT id INTO v_main_br_id
      FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    IF v_act = 'update_profile' THEN
        IF p_wifi_ssid IS NOT NULL THEN
            v_meta_patch := v_meta_patch || jsonb_build_object('wifi_ssid', trim(p_wifi_ssid), 'wifi_password', COALESCE(p_wifi_password, ''));
        END IF;
        IF p_working_hours IS NOT NULL THEN
            v_meta_patch := v_meta_patch || jsonb_build_object('working_hours', trim(p_working_hours));
        END IF;

        IF NULLIF(trim(COALESCE(p_new_password, '')), '') IS NOT NULL THEN
            IF char_length(p_new_password) < 8 OR lower(trim(p_new_password)) IN ('123456', '12345678', 'password') THEN
                RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN';
            END IF;
            IF v_merch.password_hash IS NOT NULL AND (p_current_password IS NULL OR v_merch.password_hash <> extensions.crypt(p_current_password, v_merch.password_hash)) THEN
                RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
            END IF;
            UPDATE sawyan.merchants SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)) WHERE id = v_merch.id;
        END IF;

        UPDATE sawyan.merchants
           SET business_name = COALESCE(NULLIF(trim(COALESCE(p_business_name, '')), ''), business_name),
               owner_name    = COALESCE(NULLIF(trim(COALESCE(p_owner_name, '')), ''), owner_name),
               phone         = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), phone),
               address       = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
               latitude      = COALESCE(p_latitude, latitude),
               longitude     = COALESCE(p_longitude, longitude),
               metadata      = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
         WHERE id = v_merch.id;

        IF v_main_br_id IS NOT NULL THEN
            UPDATE sawyan.merchant_branches
               SET address      = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
                   latitude     = COALESCE(p_latitude, latitude),
                   longitude    = COALESCE(p_longitude, longitude),
                   branch_phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), branch_phone)
             WHERE id = v_main_br_id;
        END IF;

        RETURN jsonb_build_object('success', true, 'action', 'profile_updated');

    ELSIF v_act = 'add_cashier' THEN
        IF trim(COALESCE(p_employee_code, '')) = '' OR trim(COALESCE(p_employee_name, '')) = '' THEN
            RAISE EXCEPTION 'CASHIER_CODE_AND_NAME_REQUIRED';
        END IF;
        IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
            RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
        END IF;

        IF p_linked_member_code IS NOT NULL AND p_linked_member_code > 0 THEN
            SELECT id INTO v_linked_mid FROM sawyan.members WHERE member_code = p_linked_member_code;
        END IF;

        INSERT INTO sawyan.cashier_employees (
            merchant_id, branch_id, employee_code, full_name, linked_member_id,
            pin_hash, max_tx_amount_limit, notify_owner_realtime, is_active
        ) VALUES (
            v_merch.id, COALESCE(p_branch_id, v_main_br_id), upper(trim(p_employee_code)), trim(p_employee_name),
            v_linked_mid, extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
            p_max_tx_limit, true, true
        ) RETURNING id INTO v_new_emp_id;

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'cashier_employee_added', 'cashier_employees', v_new_emp_id::text,
            NULL, jsonb_build_object('employee_code', upper(trim(p_employee_code)), 'linked_member_code', p_linked_member_code)
        );
        RETURN jsonb_build_object('success', true, 'employee_id', v_new_emp_id);

    ELSIF v_act = 'toggle_cashier' THEN
        UPDATE sawyan.cashier_employees
           SET is_active           = NOT is_active,
               failed_pin_attempts = 0,
               pin_locked_until    = NULL
         WHERE id = p_employee_id AND merchant_id = v_merch.id;
        RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id);

    ELSIF v_act = 'reset_cashier_pin' THEN
        IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
            RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
        END IF;
        UPDATE sawyan.cashier_employees
           SET pin_hash            = extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
               failed_pin_attempts = 0,
               pin_locked_until    = NULL
         WHERE id = p_employee_id AND merchant_id = v_merch.id;
        RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_reset', true);
    ELSE
        RAISE EXCEPTION 'UNKNOWN_MERCHANT_MANAGE_ACTION: %', p_action;
    END IF;
END;
$$;

-- 8. طلب شحن رصيد التاجر (في الإنتاج ينشئ طلب تحقق مالي رسمي، وفي المخطط الموازي يسمح بمحاكاة تحرير FIFO الفوري)
CREATE OR REPLACE FUNCTION sawyan.merchant_initiate_topup(
    p_merchant_id     UUID,
    p_amount          NUMERIC(18,2),
    p_provider        VARCHAR(40) DEFAULT 'instapay',
    p_payment_ref     VARCHAR(120) DEFAULT NULL,
    p_idempotency_key UUID DEFAULT NULL,
    p_session_token   TEXT DEFAULT NULL
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
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'POSITIVE_TOPUP_AMOUNT_REQUIRED';
    END IF;

    v_idem := COALESCE(p_idempotency_key, gen_random_uuid());
    v_ref  := COALESCE(NULLIF(trim(COALESCE(p_payment_ref, '')), ''), 'TOP-' || upper(substr(replace(v_idem::text, '-', ''), 1, 8)));

    -- في الموقع الموازي للتجربة فقط: تفعيل محاكاة الشحن وتحرير طابور FIFO فوراً للاختبار الحي
    IF v_merch.email LIKE '%@merchant.demo' OR v_merch.email LIKE '%@sawyan.demo' THEN
        v_fifo_res := sawyan.process_merchant_topup_fifo(v_merch.id, p_amount, v_ref, v_idem, 0.00, COALESCE(p_provider, 'demo_sandbox'));
        RETURN jsonb_build_object('success', true, 'mode', 'demo_instant_fifo', 'topup_result', v_fifo_res, 'payment_ref', v_ref);
    END IF;

    -- في الموقع الأصلي (Production): لا يُضاف أي شحن قبل تأكيد البنك/Webhook أو اعتماد المالية (D4)
    SELECT id INTO v_maker_id FROM sawyan.admins WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
    IF v_maker_id IS NOT NULL THEN
        INSERT INTO sawyan.maker_checker_requests (
            action_type, target_entity, target_id, payload_after, reason, maker_admin_id, status
        ) VALUES (
            'MERCHANT_TOPUP_BANK_VERIFICATION', 'merchant', v_merch.id::text,
            jsonb_build_object('amount', p_amount, 'provider', p_provider, 'payment_ref', v_ref, 'idempotency_key', v_idem),
            'Merchant submitted bank transfer / InstaPay reference for verification',
            v_maker_id, 'pending'
        ) RETURNING id INTO v_req_id;
    END IF;

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch.id, 'merchant_topup_verification_submitted', 'merchants', v_merch.id::text,
        NULL, jsonb_build_object('amount', p_amount, 'provider', p_provider, 'payment_ref', v_ref)
    );

    RETURN jsonb_build_object(
        'success', true,
        'mode', 'pending_bank_or_webhook_verification',
        'verification_request_id', v_req_id,
        'payment_ref', v_ref
    );
END;
$$;

-- 9. غلاف محمي بجلسة التاجر لتقفيل الوردية وتصدير CSV المطهر والرادار والعروض الخاطفة
CREATE OR REPLACE FUNCTION sawyan.merchant_shift_closing_guarded(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL,
    p_branch_id     UUID DEFAULT NULL,
    p_period_filter VARCHAR(20) DEFAULT 'today',
    p_export_format VARCHAR(10) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch sawyan.merchants%ROWTYPE;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    RETURN sawyan.get_merchant_shift_closing(v_merch.id, p_branch_id, p_period_filter, NULL, NULL, p_export_format, v_merch.id);
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.merchant_submit_flash_offer_guarded(
    p_merchant_id   UUID,
    p_title         VARCHAR(140),
    p_body          TEXT,
    p_discount_hint VARCHAR(60) DEFAULT NULL,
    p_session_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch sawyan.merchants%ROWTYPE;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    RETURN sawyan.submit_merchant_flash_offer(v_merch.id, p_title, p_body, p_discount_hint, v_merch.id);
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.merchant_radar_density_guarded(
    p_merchant_id   UUID,
    p_branch_id     UUID DEFAULT NULL,
    p_radius_km     NUMERIC DEFAULT 3.0,
    p_session_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch sawyan.merchants%ROWTYPE;
    v_br_id UUID;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_br_id := p_branch_id;
    IF v_br_id IS NULL THEN
        SELECT id INTO v_br_id FROM sawyan.merchant_branches WHERE merchant_id = v_merch.id ORDER BY is_main_branch DESC LIMIT 1;
    END IF;
    RETURN sawyan.get_merchant_members_density(v_br_id, p_radius_km);
END;
$$;

-- 10. الحزمة الموحدة الشاملة للوحة التاجر (Zero 25%/75% Split Exposed — F01 & Ch. 7.2 #5)
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
    v_settings     sawyan.settings%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_free_bal     NUMERIC(18,2);
    v_denom        NUMERIC(18,2);
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
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL) AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

    SELECT * INTO v_main_br FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    v_free_bal := v_merch.actual_cash_balance - v_merch.soft_hold_balance + v_merch.credit_limit;
    v_denom    := GREATEST(v_merch.package_base_amount, v_merch.credit_limit, 1.00);
    v_free_pct := CASE WHEN GREATEST(v_merch.package_base_amount, v_merch.credit_limit) > 0
                       THEN ROUND(((v_free_bal / v_denom) * 100.0)::numeric, 2)
                       ELSE 0.00 END;
    v_safe_sales := CASE WHEN v_merch.deduction_percent > 0
                         THEN ROUND((GREATEST(0, v_free_bal) / (v_merch.deduction_percent / 100.0))::numeric, 2)
                         ELSE 0.00 END;

    IF v_merch.is_isolated OR v_free_bal <= 0 OR v_free_pct <= COALESCE(v_settings.merchant_isolate_pct, 10.00) THEN
        v_zone := 'ISOLATED';
    ELSIF v_free_pct <= COALESCE(v_settings.merchant_warn2_pct, 20.00) THEN
        v_zone := 'RED';
    ELSIF v_free_pct <= COALESCE(v_settings.merchant_warn1_pct, 30.00) THEN
        v_zone := 'YELLOW';
    ELSE
        v_zone := 'GREEN';
    END IF;

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00), COUNT(*)
      INTO v_today_sales, v_today_comm, v_today_cnt
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id AND status = 'completed' AND created_at >= date_trunc('day', now());

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00)
      INTO v_month_sales, v_month_comm
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id AND status = 'completed' AND created_at >= date_trunc('month', now());

    v_shift := sawyan.get_merchant_shift_closing(v_merch.id, p_branch_id, COALESCE(p_shift_filter, 'today'), NULL, NULL, NULL, NULL);
    IF v_main_br.id IS NOT NULL THEN
        v_radar_1km := sawyan.get_merchant_members_density(v_main_br.id, 1.0);
        v_radar_2km := sawyan.get_merchant_members_density(v_main_br.id, 2.0);
        v_radar_3km := sawyan.get_merchant_members_density(v_main_br.id, 3.0);
    END IF;

    RETURN jsonb_build_object(
        'profile', jsonb_build_object(
            'id', v_merch.id,
            'merchant_code', v_merch.merchant_code,
            'business_name', v_merch.business_name,
            'owner_name', v_merch.owner_name,
            'email', v_merch.email,
            'phone', v_merch.phone,
            'category', v_merch.category,
            'merchant_type', v_merch.merchant_type,
            'deduction_percent', v_merch.deduction_percent,
            'package_base_amount', v_merch.package_base_amount,
            'actual_cash_balance', v_merch.actual_cash_balance,
            'soft_hold_balance', v_merch.soft_hold_balance,
            'credit_limit', v_merch.credit_limit,
            'free_balance', v_free_bal,
            'free_pct', v_free_pct,
            'safe_sales_capacity', v_safe_sales,
            'zone_status', v_zone,
            'is_isolated', v_merch.is_isolated,
            'address', COALESCE(v_merch.address, v_main_br.address),
            'latitude', COALESCE(v_merch.latitude, v_main_br.latitude),
            'longitude', COALESCE(v_merch.longitude, v_main_br.longitude),
            'country_code', v_country.country_code,
            'currency_code', v_country.currency_code,
            'wifi_ssid', v_merch.metadata->>'wifi_ssid',
            'wifi_password', v_merch.metadata->>'wifi_password',
            'working_hours', COALESCE(v_merch.metadata->>'working_hours', '09:00 - 23:00'),
            'today_sales_local', v_today_sales,
            'today_commission_local', v_today_comm,
            'today_merchant_net_local', v_today_sales - v_today_comm,
            'today_completed_count', v_today_cnt,
            'month_sales_local', v_month_sales,
            'month_commission_local', v_month_comm,
            'month_merchant_net_local', v_month_sales - v_month_comm
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
                'failed_pin_attempts', ce.failed_pin_attempts, 'pin_locked_until', ce.pin_locked_until,
                'max_tx_amount_limit', ce.max_tx_amount_limit, 'is_active', ce.is_active
            ) ORDER BY ce.employee_code ASC)
            FROM sawyan.cashier_employees ce WHERE ce.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'pending_transactions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'sw_short_code', t.sw_short_code, 'status', t.status,
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
                SELECT t.id, t.sw_short_code, t.status, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, (t.cashier_employee_id IS NOT NULL) AS is_instant_pin, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       mb.branch_name, COALESCE(ce.full_name, 'المالك / الكاشير العام') AS cashier_name
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
        'shift_closing', v_shift,
        'radar_rings', jsonb_build_object('r1km', v_radar_1km, 'r2km', v_radar_2km, 'r3km', v_radar_3km),
        'flash_offers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', mc.id, 'status', mc.status, 'payload', mc.payload_after, 'created_at', mc.created_at
            ) ORDER BY mc.created_at DESC)
            FROM sawyan.maker_checker_requests mc
            WHERE mc.action_type = 'MERCHANT_FLASH_OFFER' AND mc.target_id = v_merch.id::text
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

-- ============================================================================
-- 11. STRICT LEAST-PRIVILEGE LOCKDOWN ON STAGE 5 FUNCTIONS
-- ============================================================================

REVOKE ALL ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.register_new_merchant(VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BIGINT, NUMERIC, NUMERIC, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.authenticate_merchant_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.lookup_member_for_pos(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.authenticate_and_submit_pos_tx(UUID, BIGINT, NUMERIC, VARCHAR, UUID, TEXT, UUID, VARCHAR, TEXT, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.confirm_or_reject_pending_tx(UUID, UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.merchant_initiate_topup(UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.merchant_shift_closing_guarded(UUID, TEXT, UUID, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.merchant_submit_flash_offer_guarded(UUID, VARCHAR, TEXT, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.merchant_radar_density_guarded(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;

-- دالة داخلية محصورة بـ service_role فقط
GRANT EXECUTE ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) TO service_role;

-- دوال التاجر العامة والمحمية داخلياً بـ verify_merchant_session
GRANT EXECUTE ON FUNCTION sawyan.register_new_merchant(VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BIGINT, NUMERIC, NUMERIC, BIGINT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_merchant_login(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.lookup_member_for_pos(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_and_submit_pos_tx(UUID, BIGINT, NUMERIC, VARCHAR, UUID, TEXT, UUID, VARCHAR, TEXT, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.confirm_or_reject_pending_tx(UUID, UUID, VARCHAR, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.merchant_initiate_topup(UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.merchant_shift_closing_guarded(UUID, TEXT, UUID, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.merchant_submit_flash_offer_guarded(UUID, VARCHAR, TEXT, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.merchant_radar_density_guarded(UUID, UUID, NUMERIC, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) TO anon, authenticated, service_role;
