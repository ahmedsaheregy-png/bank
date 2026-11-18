-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 3 API / RPC LAYER, RBAC, SHIFT CLOSING & WEBHOOKS
-- Constitutional Reference: الملف_التقني_للمطورين.md (Chapters 6, 7 & 11)
-- Covers: Point 12 (Flash Offers / Y08), Point 13 (Shift Closing + CSV Safe),
--         D20/A19 (Maker-Checker), D26 (Anti-Scraping Verify), S05 (Webhooks), Workflow 1
-- ============================================================================

-- 1. دالة تطهير خلايا CSV/Excel ضد حقن المعادلات (CSV Formula Injection — Point 13)
CREATE OR REPLACE FUNCTION sawyan.sanitize_csv_cell(p_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_str TEXT;
    v_trimmed TEXT;
    v_first CHAR(1);
BEGIN
    IF p_val IS NULL THEN
        RETURN '';
    END IF;
    v_str := p_val;
    v_trimmed := ltrim(v_str, E' \t\r\n');
    v_first := COALESCE(left(v_str, 1), '');

    IF v_first IN ('=', '+', '-', '@', E'\t', E'\r', E'\n')
       OR left(v_trimmed, 1) IN ('=', '+', '-', '@') THEN
        RETURN '''' || v_str;
    END IF;
    RETURN v_str;
END;
$$;

-- 2. دالة تقنيع اسم العضو لعرضه للتجار وصفحة التحقق العامة فقط (D26 Anti-Scraping)
CREATE OR REPLACE FUNCTION sawyan.mask_member_display_name(
    p_full_name   TEXT,
    p_member_code BIGINT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
    v_parts TEXT[];
BEGIN
    v_clean := trim(COALESCE(p_full_name, ''));
    IF v_clean = '' THEN
        RETURN '#' || COALESCE(p_member_code::text, '0');
    END IF;

    v_parts := regexp_split_to_array(v_clean, '\s+');
    IF array_length(v_parts, 1) >= 2 THEN
        RETURN v_parts[1] || ' ' || left(v_parts[2], 1) || '. — #' || COALESCE(p_member_code::text, '0');
    ELSE
        RETURN v_parts[1] || ' — #' || COALESCE(p_member_code::text, '0');
    END IF;
END;
$$;

-- 3. دالة الإدراج الآمنة في سجل التدقيق المتسلسل بالهاش (Append-Only Hash Chain — audit_logs)
CREATE OR REPLACE FUNCTION sawyan.append_audit_log(
    p_actor_type  VARCHAR(20),
    p_actor_id    UUID,
    p_action      VARCHAR(80),
    p_table_name  VARCHAR(60),
    p_record_id   TEXT,
    p_before_data JSONB DEFAULT NULL,
    p_after_data  JSONB DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_prev_hash CHAR(64);
    v_row_hash  CHAR(64);
    v_new_id    BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('sawyan_audit_chain_lock'));

    SELECT row_hash INTO v_prev_hash
      FROM sawyan.audit_logs
     ORDER BY id DESC
     LIMIT 1;

    v_prev_hash := COALESCE(v_prev_hash, repeat('0', 64));
    v_row_hash := encode(
        extensions.digest(
            v_prev_hash || '|' || p_actor_type || '|' || p_actor_id::text || '|' ||
            p_action || '|' || p_table_name || '|' || p_record_id || '|' ||
            COALESCE(p_after_data::text, ''),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO sawyan.audit_logs (
        actor_type, actor_id, action, table_name, record_id,
        before_data, after_data, prev_row_hash, row_hash
    ) VALUES (
        p_actor_type, p_actor_id, p_action, p_table_name, p_record_id,
        p_before_data, p_after_data, v_prev_hash, v_row_hash
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- 4. واجهة التحقق العلنية الآمنة من المعاملة (verify.html — D26 Anti-Scraping)
CREATE OR REPLACE FUNCTION sawyan.public_verify_transaction(
    p_short_code VARCHAR
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_code VARCHAR(24);
    v_rec  RECORD;
BEGIN
    v_code := upper(trim(COALESCE(p_short_code, '')));
    IF v_code = '' THEN
        RETURN jsonb_build_object('found', false, 'error', 'EMPTY_SHORT_CODE');
    END IF;

    SELECT t.sw_short_code,
           t.status,
           t.total_amount,
           t.currency_code,
           t.payment_type,
           t.created_at,
           mc.business_name AS merchant_name,
           mc.category AS merchant_category,
           mb.branch_name,
           m.full_name AS member_full_name,
           m.member_code AS member_code
      INTO v_rec
      FROM sawyan.transactions t
      JOIN sawyan.merchants mc ON mc.id = t.merchant_id
      JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
      JOIN sawyan.members m ON m.id = t.member_id
     WHERE upper(t.sw_short_code) = v_code
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'short_code', v_code);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'short_code', v_rec.sw_short_code,
        'status', v_rec.status,
        'total_amount', v_rec.total_amount,
        'currency_code', v_rec.currency_code,
        'payment_type', v_rec.payment_type,
        'created_at', v_rec.created_at,
        'merchant_name', v_rec.merchant_name,
        'merchant_category', v_rec.merchant_category,
        'branch_name', v_rec.branch_name,
        'masked_member_name', sawyan.mask_member_display_name(v_rec.member_full_name, v_rec.member_code)
    );
END;
$$;

-- 5. واجهة البحث عن الراعي عند التسجيل وحظر الجذر #0 على العامة (Workflow 1 / A08)
CREATE OR REPLACE FUNCTION sawyan.lookup_sponsor_by_code(
    p_member_code BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    IF p_member_code IS NULL OR p_member_code < 0 THEN
        RETURN jsonb_build_object('found', false, 'error', 'INVALID_SPONSOR_CODE');
    END IF;

    -- الجذر #0 محظور على التسجيل العام المباشر ويتطلب توكن/موافقة إدارة ثنائية (Maker-Checker D22)
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

    RETURN jsonb_build_object(
        'found', true,
        'member_id', v_rec.id,
        'member_code', v_rec.member_code,
        'full_name', v_rec.full_name,
        'country_code', v_rec.country_code,
        'is_active_in_tree', v_rec.is_active_in_tree
    );
END;
$$;

-- 6. واجهة تقفيل الوردية وتصدير المحاسب الآمن للتاجر (Point 13 / M18)
CREATE OR REPLACE FUNCTION sawyan.get_merchant_shift_closing(
    p_merchant_id   UUID,
    p_branch_id     UUID DEFAULT NULL,
    p_period_filter VARCHAR DEFAULT 'today',
    p_from_date     TIMESTAMPTZ DEFAULT NULL,
    p_to_date       TIMESTAMPTZ DEFAULT NULL,
    p_export_format VARCHAR DEFAULT NULL,
    p_actor_id      UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_merchant       sawyan.merchants%ROWTYPE;
    v_country        sawyan.countries%ROWTYPE;
    v_start_ts       TIMESTAMPTZ;
    v_end_ts         TIMESTAMPTZ;
    v_local_now      TIMESTAMP;
    v_filter         VARCHAR(20);
    v_summary        JSONB;
    v_breakdown      JSONB;
    v_rows           JSONB;
    v_audit_id       BIGINT := NULL;
BEGIN
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND: %', p_merchant_id;
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merchant.country_id;
    v_filter := lower(COALESCE(p_period_filter, 'today'));
    v_local_now := now() AT TIME ZONE v_country.iana_timezone;

    IF v_filter = 'today' THEN
        v_start_ts := (date_trunc('day', v_local_now)) AT TIME ZONE v_country.iana_timezone;
        v_end_ts   := now() + interval '1 second';
    ELSIF v_filter = 'yesterday' THEN
        v_start_ts := (date_trunc('day', v_local_now) - interval '1 day') AT TIME ZONE v_country.iana_timezone;
        v_end_ts   := (date_trunc('day', v_local_now)) AT TIME ZONE v_country.iana_timezone;
    ELSIF v_filter = 'week' THEN
        v_start_ts := (date_trunc('day', v_local_now) - interval '6 days') AT TIME ZONE v_country.iana_timezone;
        v_end_ts   := now() + interval '1 second';
    ELSIF v_filter = 'month' THEN
        v_start_ts := (date_trunc('month', v_local_now)) AT TIME ZONE v_country.iana_timezone;
        v_end_ts   := now() + interval '1 second';
    ELSIF v_filter = 'custom' AND p_from_date IS NOT NULL AND p_to_date IS NOT NULL THEN
        v_start_ts := p_from_date;
        v_end_ts   := p_to_date;
    ELSE
        v_start_ts := (date_trunc('day', v_local_now)) AT TIME ZONE v_country.iana_timezone;
        v_end_ts   := now() + interval '1 second';
    END IF;

    -- تجميع المجاميع الأربعة دون كشف 25%/75% مطلقاً
    SELECT jsonb_build_object(
        'completed_count', COUNT(*) FILTER (WHERE t.status = 'completed'),
        'completed_amount', COALESCE(ROUND(SUM(t.total_amount) FILTER (WHERE t.status = 'completed')::numeric, 2), 0.00),
        'completed_commission', COALESCE(ROUND(SUM(t.commission_amount) FILTER (WHERE t.status = 'completed')::numeric, 2), 0.00),
        'pending_count', COUNT(*) FILTER (WHERE t.status = 'pending'),
        'pending_amount', COALESCE(ROUND(SUM(t.total_amount) FILTER (WHERE t.status = 'pending')::numeric, 2), 0.00),
        'awaiting_topup_count', COUNT(*) FILTER (WHERE t.status = 'awaiting_merchant_topup'),
        'awaiting_topup_amount', COALESCE(ROUND(SUM(t.total_amount) FILTER (WHERE t.status = 'awaiting_merchant_topup')::numeric, 2), 0.00),
        'reversed_count', COUNT(*) FILTER (WHERE t.status = 'reversed'),
        'reversed_amount', COALESCE(ROUND(SUM(t.total_amount) FILTER (WHERE t.status = 'reversed')::numeric, 2), 0.00),
        'currency_code', v_country.currency_code
    ) INTO v_summary
      FROM sawyan.transactions t
     WHERE t.merchant_id = p_merchant_id
       AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
       AND t.created_at >= v_start_ts
       AND t.created_at <= v_end_ts;

    -- التفصيل حسب الفرع ثم موظف الكاشير (D25)
    SELECT COALESCE(jsonb_agg(b_row ORDER BY b_row->>'branch_code', b_row->>'cashier_code'), '[]'::jsonb)
      INTO v_breakdown
      FROM (
          SELECT jsonb_build_object(
              'branch_id', mb.id,
              'branch_code', mb.branch_code,
              'branch_name', mb.branch_name,
              'cashier_employee_id', ce.id,
              'cashier_code', COALESCE(ce.employee_code, 'OWNER_DIRECT'),
              'cashier_name', COALESCE(ce.full_name, 'مباشر عبر المالك / النظام'),
              'completed_count', COUNT(*) FILTER (WHERE t.status = 'completed'),
              'completed_amount', COALESCE(ROUND(SUM(t.total_amount) FILTER (WHERE t.status = 'completed')::numeric, 2), 0.00),
              'completed_commission', COALESCE(ROUND(SUM(t.commission_amount) FILTER (WHERE t.status = 'completed')::numeric, 2), 0.00),
              'pending_count', COUNT(*) FILTER (WHERE t.status = 'pending'),
              'awaiting_topup_count', COUNT(*) FILTER (WHERE t.status = 'awaiting_merchant_topup'),
              'reversed_count', COUNT(*) FILTER (WHERE t.status = 'reversed')
          ) AS b_row
          FROM sawyan.transactions t
          JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
          LEFT JOIN sawyan.cashier_employees ce ON ce.id = t.cashier_employee_id
         WHERE t.merchant_id = p_merchant_id
           AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
           AND t.created_at >= v_start_ts
           AND t.created_at <= v_end_ts
         GROUP BY mb.id, mb.branch_code, mb.branch_name, ce.id, ce.employee_code, ce.full_name
      ) sub;

    -- صفوف العمليات المقنّعة والمطهّرة للتصدير (CSV Injection Safe + D26 Privacy)
    SELECT COALESCE(jsonb_agg(r_row ORDER BY (r_row->>'created_at') DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
          SELECT jsonb_build_object(
              'short_code', t.sw_short_code,
              'created_at', t.created_at,
              'masked_member', sawyan.mask_member_display_name(m.full_name, m.member_code),
              'branch_name', mb.branch_name,
              'cashier_name', COALESCE(ce.full_name, 'مباشر'),
              'total_amount', t.total_amount,
              'commission_amount', ROUND(t.commission_amount::numeric, 2),
              'currency_code', t.currency_code,
              'payment_type', t.payment_type,
              'status', t.status,
              'csv_safe_row', jsonb_build_object(
                  'short_code', sawyan.sanitize_csv_cell(t.sw_short_code),
                  'created_at', sawyan.sanitize_csv_cell(to_char(t.created_at AT TIME ZONE v_country.iana_timezone, 'YYYY-MM-DD HH24:MI:SS')),
                  'member', sawyan.sanitize_csv_cell(sawyan.mask_member_display_name(m.full_name, m.member_code)),
                  'branch', sawyan.sanitize_csv_cell(mb.branch_name),
                  'cashier', sawyan.sanitize_csv_cell(COALESCE(ce.full_name, 'مباشر')),
                  'total_amount', t.total_amount,
                  'commission_amount', ROUND(t.commission_amount::numeric, 2),
                  'currency', sawyan.sanitize_csv_cell(t.currency_code),
                  'payment_type', sawyan.sanitize_csv_cell(t.payment_type),
                  'status', sawyan.sanitize_csv_cell(t.status)
              )
          ) AS r_row
          FROM sawyan.transactions t
          JOIN sawyan.members m ON m.id = t.member_id
          JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
          LEFT JOIN sawyan.cashier_employees ce ON ce.id = t.cashier_employee_id
         WHERE t.merchant_id = p_merchant_id
           AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
           AND t.created_at >= v_start_ts
           AND t.created_at <= v_end_ts
      ) rows_sub;

    IF p_export_format IS NOT NULL AND trim(p_export_format) <> '' THEN
        IF lower(p_export_format) NOT IN ('csv', 'pdf') THEN
            RAISE EXCEPTION 'INVALID_EXPORT_FORMAT: %', p_export_format;
        END IF;

        v_audit_id := sawyan.append_audit_log(
            'merchant',
            COALESCE(p_actor_id, p_merchant_id),
            'merchant_shift_export',
            'transactions',
            p_merchant_id::text,
            NULL,
            jsonb_build_object(
                'export_format', lower(p_export_format),
                'period_filter', v_filter,
                'branch_id', p_branch_id,
                'window_start', v_start_ts,
                'window_end', v_end_ts
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'merchant_id', p_merchant_id,
        'period_filter', v_filter,
        'window_start', v_start_ts,
        'window_end', v_end_ts,
        'summary', v_summary,
        'by_branch_and_cashier', v_breakdown,
        'transactions', v_rows,
        'export_audit_log_id', v_audit_id
    );
END;
$$;

-- 7. واجهة تقديم العروض الخاطفة للتجار (Point 12 / M17 / Y08)
CREATE OR REPLACE FUNCTION sawyan.submit_merchant_flash_offer(
    p_merchant_id   UUID,
    p_title         TEXT,
    p_body          TEXT,
    p_discount_hint VARCHAR DEFAULT NULL,
    p_actor_id      UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_merchant       sawyan.merchants%ROWTYPE;
    v_settings       sawyan.settings%ROWTYPE;
    v_free_balance   NUMERIC(18,2);
    v_free_pct       NUMERIC(5,2);
    v_warn1_pct      NUMERIC(5,2);
    v_combined_text  TEXT;
    v_weekly_count   INT;
    v_offer_id       UUID;
BEGIN
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND: %', p_merchant_id;
    END IF;

    IF v_merchant.is_active IS NOT TRUE OR v_merchant.is_isolated IS TRUE THEN
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_MERCHANT_INACTIVE_OR_ISOLATED';
    END IF;

    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_warn1_pct := COALESCE(v_settings.merchant_warn1_pct, 30.00);
    v_free_balance := v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit;
    IF GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit) > 0 THEN
        v_free_pct := (v_free_balance / GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit)) * 100.0;
    ELSIF v_free_balance > 0 THEN
        v_free_pct := 100.00;
    ELSE
        v_free_pct := 0.00;
    END IF;

    -- اشتراط المنطقة الخضراء الصارم (> 30%)
    IF v_free_pct <= v_warn1_pct THEN
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_WALLET_NOT_GREEN: free_pct=% <= warn1=%', ROUND(v_free_pct, 2), v_warn1_pct;
    END IF;

    -- فحص محتوى الإعلان لمنع الروابط الخارجية وأرقام الهواتف/الدفع المباشر (Y08)
    IF trim(COALESCE(p_title, '')) = '' OR trim(COALESCE(p_body, '')) = '' THEN
        RAISE EXCEPTION 'FLASH_OFFER_EMPTY_TITLE_OR_BODY';
    END IF;

    v_combined_text := COALESCE(p_title, '') || ' ' || COALESCE(p_body, '') || ' ' || COALESCE(p_discount_hint, '');
    IF v_combined_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|app|co|me|eg|tr|sa|de)\b|t\.me/|wa\.me/)' THEN
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT: External links are strictly prohibited.';
    END IF;
    IF v_combined_text ~ '([0-9٠-٩][\s\-\(\)\.]{0,2}){7,}' THEN
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT: Direct phone or payment numbers are strictly prohibited.';
    END IF;

    -- قيد التكرار الأسبوعي (حد أقصى حملتان خلال 7 أيام)
    SELECT COUNT(*) INTO v_weekly_count
      FROM sawyan.notifications
     WHERE event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved')
       AND payload->>'merchant_id' = p_merchant_id::text
       AND created_at >= now() - interval '7 days';

    IF v_weekly_count >= 2 THEN
        RAISE EXCEPTION 'FLASH_OFFER_WEEKLY_LIMIT_EXCEEDED: Maximum 2 flash offers per 7 days.';
    END IF;

    INSERT INTO sawyan.notifications (
        recipient_type, recipient_id, event_name, channel, payload
    ) VALUES (
        'admin_queue',
        p_merchant_id,
        'MerchantFlashOfferPending',
        'in_app',
        jsonb_build_object(
            'status', 'pending_admin_approval',
            'merchant_id', p_merchant_id,
            'business_name', v_merchant.business_name,
            'title', trim(p_title),
            'body', trim(p_body),
            'discount_hint', p_discount_hint,
            'free_balance_pct', ROUND(v_free_pct, 2),
            'submitted_at', now()
        )
    ) RETURNING id INTO v_offer_id;

    PERFORM sawyan.append_audit_log(
        'merchant',
        COALESCE(p_actor_id, p_merchant_id),
        'merchant_flash_offer_submitted',
        'notifications',
        v_offer_id::text,
        NULL,
        jsonb_build_object('merchant_id', p_merchant_id, 'title', trim(p_title), 'free_pct', ROUND(v_free_pct, 2))
    );

    RETURN jsonb_build_object(
        'offer_id', v_offer_id,
        'status', 'pending_admin_approval',
        'free_balance_pct', ROUND(v_free_pct, 2),
        'weekly_remaining', GREATEST(0, 2 - (v_weekly_count + 1))
    );
END;
$$;

-- 8. واجهة استقبال وتحقق الـ Webhooks مع منع Replay (300 ثانية) ومنع التكرار (S05 / GV09)
CREATE OR REPLACE FUNCTION sawyan.process_payment_webhook(
    p_provider           VARCHAR,
    p_event_id           VARCHAR,
    p_event_type         VARCHAR,
    p_transaction_id     UUID DEFAULT NULL,
    p_merchant_id        UUID DEFAULT NULL,
    p_amount             NUMERIC(18,2) DEFAULT 0.00,
    p_psp_fee            NUMERIC(18,2) DEFAULT 0.00,
    p_currency           CHAR(3) DEFAULT 'USD',
    p_webhook_timestamp  BIGINT DEFAULT NULL,
    p_signature_verified BOOLEAN DEFAULT false,
    p_payload            JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_log sawyan.payment_logs%ROWTYPE;
    v_log_id       UUID;
    v_net_settled  NUMERIC(18,2);
    v_topup_res    JSONB := NULL;
BEGIN
    IF p_signature_verified IS NOT TRUE THEN
        RAISE EXCEPTION 'WEBHOOK_SIGNATURE_INVALID';
    END IF;

    IF p_webhook_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM now()) - p_webhook_timestamp) > 300 THEN
        RAISE EXCEPTION 'WEBHOOK_TIMESTAMP_EXPIRED_300S: Webhook timestamp outside +/-300s window.';
    END IF;

    IF trim(COALESCE(p_provider, '')) = '' OR trim(COALESCE(p_event_id, '')) = '' THEN
        RAISE EXCEPTION 'WEBHOOK_MISSING_PROVIDER_OR_EVENT_ID';
    END IF;

    SELECT * INTO v_existing_log
      FROM sawyan.payment_logs
     WHERE provider = p_provider
       AND provider_event_id = p_event_id
     LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'duplicate_ignored',
            'provider', p_provider,
            'event_id', p_event_id,
            'payment_log_id', v_existing_log.id
        );
    END IF;

    v_net_settled := ROUND((COALESCE(p_amount, 0.00) - COALESCE(p_psp_fee, 0.00))::numeric, 2);

    INSERT INTO sawyan.payment_logs (
        transaction_id, provider, action, amount, currency_code, status,
        hmac_verified, provider_event_id, provider_response
    ) VALUES (
        p_transaction_id, p_provider, p_event_type, COALESCE(p_amount, 0.00), COALESCE(p_currency, 'USD'),
        'processed', true, p_event_id,
        jsonb_build_object(
            'psp_fee', COALESCE(p_psp_fee, 0.00),
            'net_settled_amount', v_net_settled,
            'webhook_timestamp', p_webhook_timestamp,
            'raw_payload', COALESCE(p_payload, '{}'::jsonb)
        )
    ) RETURNING id INTO v_log_id;

    IF p_event_type = 'merchant_topup_succeeded' AND p_merchant_id IS NOT NULL AND p_amount > 0 THEN
        v_topup_res := sawyan.process_merchant_topup_fifo(
            p_merchant_id,
            p_amount,
            p_provider || ':' || p_event_id,
            md5(p_provider || ':' || p_event_id)::uuid,
            COALESCE(p_psp_fee, 0.00),
            p_provider
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'processed',
        'payment_log_id', v_log_id,
        'provider', p_provider,
        'event_id', p_event_id,
        'net_settled_amount', v_net_settled,
        'topup_result', v_topup_res
    );
END;
$$;

-- 9. دوال حوكمة Maker-Checker الثنائية في قاعدة البيانات (D20 / A19 / V7)
CREATE OR REPLACE FUNCTION sawyan.submit_maker_checker_request(
    p_action_type       VARCHAR,
    p_target_entity     VARCHAR,
    p_target_id         TEXT,
    p_payload_after     JSONB,
    p_maker_admin_id    UUID,
    p_reason            TEXT,
    p_payload_before    JSONB DEFAULT NULL,
    p_impact_simulation JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_maker  sawyan.admins%ROWTYPE;
    v_req_id UUID;
BEGIN
    SELECT * INTO v_maker FROM sawyan.admins WHERE id = p_maker_admin_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVE_MAKER_ADMIN_REQUIRED';
    END IF;

    INSERT INTO sawyan.maker_checker_requests (
        action_type, target_entity, target_id, payload_before, payload_after,
        impact_simulation, reason, maker_admin_id, status
    ) VALUES (
        p_action_type, p_target_entity, p_target_id, p_payload_before, p_payload_after,
        p_impact_simulation, p_reason, p_maker_admin_id, 'pending'
    ) RETURNING id INTO v_req_id;

    PERFORM sawyan.append_audit_log(
        'admin',
        p_maker_admin_id,
        'maker_checker_submitted',
        'maker_checker_requests',
        v_req_id::text,
        p_payload_before,
        p_payload_after
    );

    RETURN jsonb_build_object(
        'request_id', v_req_id,
        'status', 'pending',
        'maker_admin_id', p_maker_admin_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.decide_maker_checker_request(
    p_request_id       UUID,
    p_checker_admin_id UUID,
    p_decision         VARCHAR,
    p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_req     sawyan.maker_checker_requests%ROWTYPE;
    v_checker sawyan.admins%ROWTYPE;
    v_dec     VARCHAR(20);
BEGIN
    v_dec := lower(trim(COALESCE(p_decision, '')));
    IF v_dec NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'INVALID_MAKER_CHECKER_DECISION: %', p_decision;
    END IF;

    SELECT * INTO v_checker FROM sawyan.admins WHERE id = p_checker_admin_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVE_CHECKER_ADMIN_REQUIRED';
    END IF;

    SELECT * INTO v_req FROM sawyan.maker_checker_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MAKER_CHECKER_REQUEST_NOT_FOUND';
    END IF;

    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'MAKER_CHECKER_ALREADY_DECIDED: status=%', v_req.status;
    END IF;

    -- القاعدة الحاكمة الصارمة: لا يمكن للمُعدّ (Maker) أن يعتمد طلبه أبداً
    IF p_checker_admin_id = v_req.maker_admin_id THEN
        RAISE EXCEPTION 'MAKER_CANNOT_APPROVE_OWN_REQUEST: Maker and Checker must be distinct admins.';
    END IF;

    UPDATE sawyan.maker_checker_requests
       SET checker_admin_id = p_checker_admin_id,
           status = v_dec,
           decided_at = now()
     WHERE id = p_request_id;

    PERFORM sawyan.append_audit_log(
        'admin',
        p_checker_admin_id,
        'maker_checker_' || v_dec,
        'maker_checker_requests',
        p_request_id::text,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('status', v_dec, 'checker_admin_id', p_checker_admin_id, 'rejection_reason', p_rejection_reason)
    );

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', v_dec,
        'maker_admin_id', v_req.maker_admin_id,
        'checker_admin_id', p_checker_admin_id
    );
END;
$$;

-- 10. منح الصلاحيات التنفيذية المضبوطة حسب كل دور
REVOKE ALL ON FUNCTION sawyan.append_audit_log(VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.process_payment_webhook(VARCHAR, VARCHAR, VARCHAR, UUID, UUID, NUMERIC, NUMERIC, CHAR, BIGINT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.sanitize_csv_cell(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.mask_member_display_name(TEXT, BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.public_verify_transaction(VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.lookup_sponsor_by_code(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_shift_closing(UUID, UUID, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_merchant_flash_offer(UUID, TEXT, TEXT, VARCHAR, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.process_payment_webhook(VARCHAR, VARCHAR, VARCHAR, UUID, UUID, NUMERIC, NUMERIC, CHAR, BIGINT, BOOLEAN, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_maker_checker_request(VARCHAR, VARCHAR, TEXT, JSONB, UUID, TEXT, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.decide_maker_checker_request(UUID, UUID, VARCHAR, TEXT) TO authenticated, service_role;
