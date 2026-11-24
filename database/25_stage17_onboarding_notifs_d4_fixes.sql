-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 17: BI-DIRECTIONAL LIVE NOTIFICATIONS,
-- MERCHANT ONBOARDING CLARITY, D4 CREDIT CYCLE FIX & SELF-PURCHASE GUARD
-- ============================================================================
-- Strictly Idempotent (CREATE OR REPLACE / IF NOT EXISTS / guarded backfill).
-- ZERO bare lowercase schema names inside string literals so cloning to
-- parallel demo schema stays 100% clean.
-- ============================================================================

-- 1. Performance Partial Indexes for Live Bell Notifications (Admin/Merchant/Member)
CREATE INDEX IF NOT EXISTS idx_notifications_admin_recent
    ON sawyan.notifications (is_read, created_at DESC)
    WHERE recipient_type = 'admin';

CREATE INDEX IF NOT EXISTS idx_notifications_actor_recent
    ON sawyan.notifications (recipient_type, recipient_id, created_at DESC);

-- 2. Founder Decision: cover_image_url & onboarded_by_code optional temporarily
--    (Toggleable back to required anytime from Admin -> Registration Form Builder)
UPDATE sawyan.registration_field_configs
   SET display_mode          = CASE WHEN display_mode = 'initial_required' THEN 'initial_optional' ELSE display_mode END,
       required_in_initial   = false,
       required_in_dashboard = false,
       updated_at            = now()
 WHERE form_type = 'merchant'
   AND field_key IN ('cover_image_url', 'onboarded_by_code');

-- 3. Profile Completion Evaluator (adds onboarded_by_code check when toggled)
CREATE OR REPLACE FUNCTION sawyan.evaluate_merchant_profile_complete(p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_fld          RECORD;
    v_missing      TEXT[] := ARRAY[]::TEXT[];
    v_ok           BOOLEAN;
    v_addr_fb      BOOLEAN;
    v_geo_fb       BOOLEAN;
    v_meta         JSONB;
    v_social       JSONB;
    v_wh           JSONB;
    v_has_cashier  BOOLEAN := false;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('is_complete', false, 'missing_fields', jsonb_build_array('merchant_not_found'));
    END IF;

    SELECT * INTO v_main_br
      FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC
     LIMIT 1;

    v_meta    := COALESCE(v_merch.metadata, '{}'::jsonb);
    v_addr_fb := COALESCE((v_meta->>'address_is_fallback')::boolean, false);
    v_geo_fb  := COALESCE((v_meta->>'geo_is_fallback')::boolean, false);

    SELECT EXISTS (
        SELECT 1 FROM sawyan.cashier_employees WHERE merchant_id = v_merch.id AND is_active = true
    ) INTO v_has_cashier;

    IF COALESCE(v_merch.deduction_percent, 0) < 0.50 OR COALESCE((v_meta->>'commission_pending')::boolean, false) THEN
        v_missing := array_append(v_missing, 'commission_percent');
    END IF;

    FOR v_fld IN
        SELECT field_key
          FROM sawyan.registration_field_configs
         WHERE form_type = 'merchant'
           AND show_in_dashboard = true
           AND required_in_dashboard = true
           AND display_mode <> 'hidden'
         ORDER BY sort_order ASC
    LOOP
        v_ok := true;
        CASE v_fld.field_key
            WHEN 'commission_percent' THEN
                v_ok := COALESCE(v_merch.deduction_percent, 0) >= 0.50 AND NOT COALESCE((v_meta->>'commission_pending')::boolean, false);
            WHEN 'business_name' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.business_name, '')), '') IS NOT NULL;
            WHEN 'owner_name' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.owner_name, '')), '') IS NOT NULL;
            WHEN 'email' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.email, '')), '') IS NOT NULL;
            WHEN 'phone' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.phone, '')), '') IS NOT NULL;
            WHEN 'merchant_type' THEN
                v_ok := v_merch.merchant_type IN ('physical', 'online', 'both');
            WHEN 'business_category' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.category, '')), '') IS NOT NULL;
            WHEN 'country_code' THEN
                v_ok := v_merch.country_id IS NOT NULL;
            WHEN 'city' THEN
                v_ok := v_main_br.city_geoname_id IS NOT NULL
                        OR NULLIF(trim(COALESCE(v_meta->>'city_geoname_id', '')), '') IS NOT NULL
                        OR NULLIF(trim(COALESCE(v_meta->>'city_name', '')), '') IS NOT NULL
                        OR (NULLIF(trim(COALESCE(v_merch.address, v_main_br.address, '')), '') IS NOT NULL AND NOT v_addr_fb);
            WHEN 'district' THEN
                IF v_merch.merchant_type IN ('physical', 'both') THEN
                    v_ok := NULLIF(trim(COALESCE(v_meta->>'district', '')), '') IS NOT NULL
                            OR (NULLIF(trim(COALESCE(v_merch.address, v_main_br.address, '')), '') IS NOT NULL AND NOT v_addr_fb);
                END IF;
            WHEN 'address' THEN
                IF v_merch.merchant_type IN ('physical', 'both') THEN
                    v_ok := (NULLIF(trim(COALESCE(v_merch.address, v_main_br.address, '')), '') IS NOT NULL AND NOT v_addr_fb);
                END IF;
            WHEN 'geo_location' THEN
                IF v_merch.merchant_type IN ('physical', 'both') THEN
                    v_ok := (
                        (COALESCE(v_merch.latitude, v_main_br.latitude) IS NOT NULL AND COALESCE(v_merch.longitude, v_main_br.longitude) IS NOT NULL AND NOT v_geo_fb)
                        OR NULLIF(trim(COALESCE(v_meta->>'google_maps_url', '')), '') IS NOT NULL
                    );
                END IF;
            WHEN 'website_url' THEN
                IF v_merch.merchant_type IN ('online', 'both') THEN
                    v_ok := NULLIF(trim(COALESCE(v_meta->>'website_url', '')), '') IS NOT NULL;
                END IF;
            WHEN 'business_description' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'description', '')), '') IS NOT NULL;
            WHEN 'whatsapp' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'whatsapp', '')), '') IS NOT NULL;
            WHEN 'logo_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'logo_url', '')), '') IS NOT NULL;
            WHEN 'cover_image_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'cover_image_url', '')), '') IS NOT NULL;
            WHEN 'gallery_images' THEN
                v_ok := jsonb_typeof(v_meta->'images') = 'array' AND jsonb_array_length(v_meta->'images') > 0;
            WHEN 'working_hours' THEN
                v_wh := v_meta->'working_hours';
                v_ok := v_wh IS NOT NULL AND jsonb_typeof(v_wh) <> 'null' AND NULLIF(trim(v_wh::text), '') NOT IN ('""', '{}', 'null');
            WHEN 'social_links' THEN
                v_social := v_meta->'social';
                v_ok := v_social IS NOT NULL AND jsonb_typeof(v_social) = 'object' AND (
                    NULLIF(trim(COALESCE(v_social->>'facebook', '')), '') IS NOT NULL
                    OR NULLIF(trim(COALESCE(v_social->>'instagram', '')), '') IS NOT NULL
                    OR NULLIF(trim(COALESCE(v_social->>'twitter', '')), '') IS NOT NULL
                    OR NULLIF(trim(COALESCE(v_social->>'tiktok', '')), '') IS NOT NULL
                );
            WHEN 'commercial_reg_no' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'commercial_reg_no', '')), '') IS NOT NULL;
            WHEN 'tax_id' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.tax_registration_no, v_meta->>'tax_id', '')), '') IS NOT NULL;
            WHEN 'commercial_doc_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta #>> '{kyc_docs,commercial_reg}', '')), '') IS NOT NULL;
            WHEN 'tax_doc_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta #>> '{kyc_docs,tax_card}', '')), '') IS NOT NULL;
            WHEN 'webhook_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'webhook_url', '')), '') IS NOT NULL;
            WHEN 'initial_cashier_pin' THEN
                v_ok := v_has_cashier;
            WHEN 'onboarded_by_code' THEN
                v_ok := (v_merch.onboarded_by_member_id IS NOT NULL);
            ELSE
                v_ok := true;
        END CASE;

        IF NOT COALESCE(v_ok, false) AND NOT (v_fld.field_key = ANY(v_missing)) THEN
            v_missing := array_append(v_missing, v_fld.field_key);
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'is_complete', (cardinality(v_missing) = 0),
        'missing_fields', to_jsonb(v_missing)
    );
END;
$function$;

-- 4. Fix D4 Credit Cycle Infinite Reset Bug (derive true debt start timestamp)
CREATE OR REPLACE FUNCTION sawyan.compute_merchant_d4_cycle_info(p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_merch             sawyan.merchants%ROWTYPE;
    v_country           sawyan.countries%ROWTYPE;
    v_settings          sawyan.settings%ROWTYPE;
    v_now_utc           TIMESTAMPTZ := sawyan.now_utc();
    v_tz                TEXT;
    v_time_disabled     BOOLEAN := false;
    v_cycle_days        INT := 1;
    v_cutoff_time       TIME := '23:59:00'::time;
    v_grace_hours       NUMERIC(5,2) := 2.00;
    v_debt_start_utc    TIMESTAMPTZ;
    v_last_topup_utc    TIMESTAMPTZ := NULL;
    v_derived_debt_utc  TIMESTAMPTZ := NULL;
    v_local_debt        TIMESTAMP;
    v_base_days_offset  INT := 0;
    v_cycle_close_local TIMESTAMP;
    v_cycle_close_utc   TIMESTAMPTZ := NULL;
    v_grace_due_utc     TIMESTAMPTZ := NULL;
    v_next_start_utc    TIMESTAMPTZ := NULL;
    v_total_debt        NUMERIC(18,2) := 0.00;
    v_post_comm         NUMERIC(18,2) := 0.00;
    v_statement_due     NUMERIC(18,2) := 0.00;
    v_open_cycle_comm   NUMERIC(18,2) := 0.00;
    v_in_grace          BOOLEAN := false;
    v_breached          BOOLEAN := false;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= v_now_utc
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_tz := COALESCE(NULLIF(trim(v_country.iana_timezone), ''), 'UTC');
    v_time_disabled := COALESCE((v_merch.metadata->>'d4_time_trigger_disabled')::boolean, false);
    v_cycle_days := GREATEST(1, LEAST(90, COALESCE(v_merch.d4_cycle_days_override, v_settings.d4_cycle_days, 1)::int));
    v_cutoff_time := COALESCE(v_merch.deferred_settlement_cutoff_time, v_settings.d4_cycle_cutoff_time, '23:59:00'::time);
    v_grace_hours := GREATEST(0.00, LEAST(168.00, COALESCE(v_merch.d4_grace_hours_override, v_settings.d4_grace_hours, 2.00)::numeric));

    IF v_merch.credit_limit > 0 AND NOT v_time_disabled AND v_merch.actual_cash_balance < 0 THEN
        v_total_debt := ROUND(ABS(v_merch.actual_cash_balance)::numeric, 2);
        v_debt_start_utc := NULLIF(trim(COALESCE(v_merch.metadata->>'d4_debt_started_at', '')), '')::timestamptz;
        IF v_debt_start_utc IS NULL THEN
            SELECT MAX(je.posted_at) INTO v_last_topup_utc
              FROM sawyan.journal_entries je
             WHERE je.source_type = 'MERCHANT_TOPUP'
               AND je.source_id = v_merch.id;

            SELECT MIN(COALESCE(tx.completed_at, tx.created_at)) INTO v_derived_debt_utc
              FROM sawyan.transactions tx
             WHERE tx.merchant_id = v_merch.id
               AND tx.status = 'completed'
               AND (v_last_topup_utc IS NULL OR COALESCE(tx.completed_at, tx.created_at) >= v_last_topup_utc);

            v_debt_start_utc := COALESCE(v_derived_debt_utc, v_merch.created_at, v_now_utc);
        END IF;
        v_local_debt := v_debt_start_utc AT TIME ZONE v_tz;
        v_base_days_offset := (CASE WHEN v_local_debt::time >= v_cutoff_time THEN 1 ELSE 0 END) + (v_cycle_days - 1);
        v_cycle_close_local := (v_local_debt::date + v_base_days_offset) + v_cutoff_time;
        v_cycle_close_utc := v_cycle_close_local AT TIME ZONE v_tz;
        v_grace_due_utc := v_cycle_close_utc + (v_grace_hours::text || ' hours')::interval;

        IF v_now_utc < v_cycle_close_utc THEN
            v_statement_due   := 0.00;
            v_open_cycle_comm := v_total_debt;
            v_in_grace        := false;
            v_breached        := false;
        ELSE
            SELECT COALESCE(SUM(tx.commission_amount + COALESCE(tx.vat_amount, 0.00)), 0.00),
                   MIN(COALESCE(tx.completed_at, tx.created_at))
              INTO v_post_comm, v_next_start_utc
              FROM sawyan.transactions tx
             WHERE tx.merchant_id = v_merch.id
               AND tx.status = 'completed'
               AND COALESCE(tx.completed_at, tx.created_at) >= v_cycle_close_utc;

            v_statement_due   := GREATEST(0.00, ROUND((v_total_debt - v_post_comm)::numeric, 2));
            v_open_cycle_comm := LEAST(v_total_debt, ROUND(v_post_comm::numeric, 2));
            v_in_grace        := (v_statement_due > 0 AND v_now_utc >= v_cycle_close_utc AND v_now_utc < v_grace_due_utc);
            v_breached        := (v_statement_due > 0 AND v_now_utc >= v_grace_due_utc);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'd4_effective_cycle_days', v_cycle_days,
        'd4_effective_cutoff_time', to_char(v_cutoff_time, 'HH24:MI:SS'),
        'd4_effective_grace_hours', v_grace_hours,
        'd4_time_trigger_disabled', v_time_disabled,
        'd4_cycle_close_at', v_cycle_close_utc,
        'd4_grace_due_at', v_grace_due_utc,
        'd4_next_debt_start_at', v_next_start_utc,
        'd4_statement_due_local', v_statement_due,
        'd4_open_cycle_comm_local', v_open_cycle_comm,
        'd4_in_grace_window', v_in_grace,
        'd4_cutoff_breached', v_breached
    );
END;
$function$;

-- 5. Sync Merchant Flags (persist derived d4_debt_started_at on negative D4 cash)
CREATE OR REPLACE FUNCTION sawyan.sync_merchant_status_flags(p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_merch       sawyan.merchants%ROWTYPE;
    v_country     sawyan.countries%ROWTYPE;
    v_eff         JSONB;
    v_fin         VARCHAR(30);
    v_gov         VARCHAR(30);
    v_fifo        INT;
    v_free        NUMERIC(18,2);
    v_cutoff_br   BOOLEAN;
    v_over_days   INT;
    v_def_days    INT;
    v_vc          JSONB;
    v_esc_30d     INT;
    v_lost_30d    INT;
    v_comp_30d    INT;
    v_goug_cnt    INT;
    v_w_esc       INT;
    v_r_esc       INT;
    v_w_lost      INT;
    v_r_lost      INT;
    v_w_comp      INT;
    v_r_comp      INT;
    v_new_gov     VARCHAR(30) := NULL;
    v_new_reason  TEXT := NULL;
    v_local_today TEXT;
    v_can_login   BOOLEAN;
    v_last_tp_at  TIMESTAMPTZ := NULL;
    v_deriv_d4_at TIMESTAMPTZ := NULL;
    v_vis_radar   BOOLEAN;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;

    -- حفظ تاريخ بدء مديونية D4 تلقائياً إن كان الرصيد النقدي سالباً وبدون ختم زمني سابق
    IF v_merch.credit_limit > 0
       AND v_merch.actual_cash_balance < 0
       AND NULLIF(trim(COALESCE(v_merch.metadata->>'d4_debt_started_at', '')), '') IS NULL
    THEN
        SELECT MAX(je.posted_at) INTO v_last_tp_at
          FROM sawyan.journal_entries je
         WHERE je.source_type = 'MERCHANT_TOPUP'
           AND je.source_id = v_merch.id;

        SELECT MIN(COALESCE(tx.completed_at, tx.created_at)) INTO v_deriv_d4_at
          FROM sawyan.transactions tx
         WHERE tx.merchant_id = v_merch.id
           AND tx.status = 'completed'
           AND (v_last_tp_at IS NULL OR COALESCE(tx.completed_at, tx.created_at) >= v_last_tp_at);

        UPDATE sawyan.merchants
           SET metadata = COALESCE(metadata, '{}'::jsonb)
                          || jsonb_build_object('d4_debt_started_at', COALESCE(v_deriv_d4_at, v_merch.created_at, sawyan.now_utc()))
         WHERE id = p_merchant_id
        RETURNING * INTO v_merch;
    END IF;

    v_eff       := sawyan.compute_merchant_effective_state(p_merchant_id);
    v_fin       := v_eff->>'financial_status';
    v_gov       := v_eff->>'governance_status';
    v_fifo      := COALESCE((v_eff->>'fifo_queue_count')::int, 0);
    v_free      := COALESCE((v_eff->>'free_balance')::numeric, 0);
    v_cutoff_br := COALESCE((v_eff->>'cutoff_breached')::boolean, false);
    v_over_days := COALESCE((v_eff->>'overdue_days')::int, 0);
    v_def_days  := COALESCE((v_eff->>'fifo_default_days')::int, 14);
    v_vc        := v_eff->'violation_counters';
    v_esc_30d   := COALESCE((v_vc->>'escalated_pending_30d')::int, 0);
    v_lost_30d  := COALESCE((v_vc->>'lost_disputes_30d')::int, 0);
    v_comp_30d  := COALESCE((v_vc->>'verified_complaints_30d')::int, 0);
    v_goug_cnt  := COALESCE((v_vc->>'verified_price_gouging_count')::int, 0);
    v_w_esc     := COALESCE((v_vc->>'warn_escalated_tx_30d')::int, 3);
    v_r_esc     := COALESCE((v_vc->>'restrict_escalated_tx_30d')::int, 5);
    v_w_lost    := COALESCE((v_vc->>'warn_lost_disputes_30d')::int, 2);
    v_r_lost    := COALESCE((v_vc->>'restrict_lost_disputes_30d')::int, 3);
    v_w_comp    := COALESCE((v_vc->>'warn_verified_complaints_30d')::int, 2);
    v_r_comp    := COALESCE((v_vc->>'restrict_verified_complaints_30d')::int, 3);

    -- أ) ضبط مؤقت بدء التأخر overdue_since_at وعلامات دين D4
    IF v_fifo > 0 OR v_free < 0 OR v_cutoff_br THEN
        IF v_merch.overdue_since_at IS NULL THEN
            UPDATE sawyan.merchants SET overdue_since_at = sawyan.now_utc() WHERE id = p_merchant_id;
        END IF;
    ELSIF v_merch.overdue_since_at IS NOT NULL THEN
        UPDATE sawyan.merchants SET overdue_since_at = NULL WHERE id = p_merchant_id;
    END IF;

    IF v_merch.actual_cash_balance >= 0 AND (v_merch.metadata ? 'd4_debt_started_at') THEN
        v_local_today := to_char(sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM-DD');
        UPDATE sawyan.merchants
           SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'd4_debt_started_at')
                          || jsonb_build_object('last_d4_settlement_date', v_local_today)
         WHERE id = p_merchant_id;
    END IF;

    -- ب) التصعيدات التلقائية التصاعدية الصارمة (Auto-Escalations)
    IF v_over_days >= v_def_days AND v_gov NOT IN ('suspended_compliance', 'banned_permanent') THEN
        v_new_gov    := 'suspended_compliance';
        v_new_reason := 'تصعيد امتثال تلقائي: استمرار مديونية/طابور FIFO أو عدم السداد لمدة >= ' || v_def_days || ' يوماً';
    ELSIF (
        v_goug_cnt >= 3
        OR v_esc_30d >= v_r_esc
        OR v_lost_30d >= v_r_lost
        OR v_comp_30d >= v_r_comp
    ) AND v_gov IN ('good_standing', 'probation_warning') THEN
        v_new_gov := 'restricted_no_reject';
        IF v_goug_cnt >= 3 THEN
            v_new_reason := 'تقييد تلقائي (درجة 2 / S10): وصول بلاغات التلاعب بالأسعار الموثقة إلى ' || v_goug_cnt || ' أعضاء';
        ELSE
            v_new_reason := 'تقييد تلقائي (درجة 2): تجاوز سقف المخالفات خلال 30 يوماً (معلقة متأخرة=' || v_esc_30d || '، نزاعات خاسرة=' || v_lost_30d || '، شكاوى موثقة=' || v_comp_30d || ')';
        END IF;
    ELSIF (
        v_esc_30d >= v_w_esc
        OR v_lost_30d >= v_w_lost
        OR v_comp_30d >= v_w_comp
    ) AND v_gov = 'good_standing' THEN
        v_new_gov    := 'probation_warning';
        v_new_reason := 'تحت المراقبة والإنذار (درجة 1): رصد تنبيهات امتثال خلال 30 يوماً (معلقة متأخرة=' || v_esc_30d || '، نزاعات خاسرة=' || v_lost_30d || '، شكاوى موثقة=' || v_comp_30d || ')';
    END IF;

    IF v_new_gov IS NOT NULL AND v_new_gov IS DISTINCT FROM v_merch.governance_status THEN
        UPDATE sawyan.merchants
           SET governance_status           = v_new_gov,
               pre_pause_governance_status = CASE WHEN v_new_gov IN ('restricted_no_reject', 'suspended_compliance', 'banned_permanent') THEN NULL ELSE pre_pause_governance_status END,
               governance_reason           = v_new_reason,
               governance_updated_at       = now()
         WHERE id = p_merchant_id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES
            ('merchant', p_merchant_id, 'MerchantComplianceAutoEscalated', 'in_app',
             jsonb_build_object('merchant_code', v_merch.merchant_code, 'new_governance_status', v_new_gov, 'reason', v_new_reason), now()),
            ('admin', p_merchant_id, 'MerchantComplianceAutoEscalated', 'in_app',
             jsonb_build_object('merchant_id', p_merchant_id, 'merchant_code', v_merch.merchant_code, 'business_name', v_merch.business_name, 'new_governance_status', v_new_gov, 'reason', v_new_reason), now());

        PERFORM sawyan.append_audit_log(
            'system', p_merchant_id, 'merchant_auto_escalated_' || v_new_gov, 'merchants', p_merchant_id::text,
            jsonb_build_object('governance_status', v_merch.governance_status),
            jsonb_build_object('governance_status', v_new_gov, 'reason', v_new_reason)
        );
    END IF;

    -- ج) مزامنة العمودين الموروثين is_active & is_isolated بدقة
    v_eff       := sawyan.compute_merchant_effective_state(p_merchant_id);
    v_can_login := COALESCE((v_eff->'effective_access'->>'can_login_portal')::boolean, true);
    v_vis_radar := COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false);

    UPDATE sawyan.merchants
       SET is_active   = v_can_login,
           is_isolated = NOT v_vis_radar
     WHERE id = p_merchant_id
       AND (is_active IS DISTINCT FROM v_can_login OR is_isolated IS DISTINCT FROM (NOT v_vis_radar));

    RETURN v_eff;
END;
$function$;

-- 6. Register New Merchant (auto-link owner_member_id + send Admin Bell notification)
CREATE OR REPLACE FUNCTION sawyan.register_new_merchant(p_business_name character varying, p_owner_name character varying, p_phone character varying, p_password text, p_country_code character DEFAULT 'EG'::bpchar, p_category character varying DEFAULT 'supermarket'::character varying, p_merchant_type character varying DEFAULT 'physical'::character varying, p_deduction_percent numeric DEFAULT NULL::numeric, p_email character varying DEFAULT NULL::character varying, p_address text DEFAULT NULL::text, p_city_geoname_id bigint DEFAULT NULL::bigint, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_onboarded_by_member_code bigint DEFAULT NULL::bigint, p_initial_cashier_pin text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_country        sawyan.countries%ROWTYPE;
    v_clean_name     VARCHAR(180);
    v_clean_owner    VARCHAR(150);
    v_clean_phone    VARCHAR(24);
    v_clean_email    VARCHAR(255);
    v_cat_slug       VARCHAR(60);
    v_mtype          VARCHAR(20);
    v_onboarder_id   UUID := NULL;
    v_owner_mem_id   UUID := NULL;
    v_onboarder_src  VARCHAR(30) := NULL;
    v_seq_num        BIGINT;
    v_mcode          VARCHAR(20);
    v_pw_hash        TEXT;
    v_session_token  TEXT;
    v_merch_id       UUID;
    v_branch_id      UUID;
    v_lat            NUMERIC(9,6);
    v_lng            NUMERIC(9,6);
    v_eff_pct        NUMERIC(5,2);
    v_comm_pending   BOOLEAN := false;
    v_safe_meta      JSONB := '{}'::jsonb;
    v_logo           TEXT;
    v_cover          TEXT;
    v_img_arr        JSONB := '[]'::jsonb;
    v_img_item       TEXT;
    v_img_cnt        INT := 0;
    v_kyc_obj        JSONB := '{}'::jsonb;
    v_k_key          TEXT;
    v_k_val          TEXT;
    v_district       TEXT;
    v_city_name      TEXT;
    v_comm_reg       TEXT;
    v_tax_id         TEXT;
    v_addr_fallback  BOOLEAN := false;
    v_geo_fallback   BOOLEAN := false;
    v_prof_eval      JSONB;
    v_onboard_st     VARCHAR(30);
    v_eff            JSONB;
BEGIN
    v_clean_name := trim(COALESCE(p_business_name, ''));
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

    v_clean_owner := trim(COALESCE(p_owner_name, ''));
    IF v_clean_owner = '' AND sawyan.is_reg_field_required('merchant', 'owner_name', 'initial') THEN
        RAISE EXCEPTION 'MERCHANT_OWNER_NAME_REQUIRED';
    END IF;
    v_clean_owner := COALESCE(NULLIF(v_clean_owner, ''), v_clean_name);

    v_clean_phone := sawyan.validate_and_normalize_e164_phone(v_country.country_code, p_phone);

    v_clean_email := sawyan.validate_strict_email(p_email);
    IF v_clean_email IS NULL AND sawyan.is_reg_field_required('merchant', 'email', 'initial') THEN
        RAISE EXCEPTION 'MERCHANT_EMAIL_REQUIRED';
    END IF;

    v_mtype := lower(trim(COALESCE(p_merchant_type, 'physical')));
    IF v_mtype NOT IN ('physical', 'online', 'both') THEN
        v_mtype := 'physical';
    END IF;

    IF p_deduction_percent IS NULL THEN
        IF sawyan.is_reg_field_required('merchant', 'commission_percent', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_COMMISSION_REQUIRED';
        END IF;
        v_eff_pct := 0.00;
        v_comm_pending := true;
    ELSE
        IF p_deduction_percent < 0.50 OR p_deduction_percent > 95.00 THEN
            RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
        END IF;
        v_eff_pct := ROUND(p_deduction_percent::numeric, 2);
        v_comm_pending := false;
    END IF;

    SELECT slug INTO v_cat_slug FROM sawyan.categories WHERE slug = lower(trim(COALESCE(p_category, 'other')));
    IF NOT FOUND THEN
        v_cat_slug := 'other';
    END IF;

    IF p_onboarded_by_member_code IS NULL THEN
        IF sawyan.is_reg_field_required('merchant', 'onboarded_by_code', 'initial') THEN
            RAISE EXCEPTION 'ONBOARDER_CODE_REQUIRED';
        END IF;
    ELSIF p_onboarded_by_member_code = 0 THEN
        SELECT id INTO v_onboarder_id FROM sawyan.members WHERE member_code = 0 LIMIT 1;
        v_onboarder_src := 'company_direct';
    ELSIF p_onboarded_by_member_code > 0 THEN
        SELECT id INTO v_onboarder_id FROM sawyan.members WHERE member_code = p_onboarded_by_member_code AND is_tombstone_banned = false;
        IF v_onboarder_id IS NULL THEN
            RAISE EXCEPTION 'ONBOARDER_MEMBER_NOT_FOUND: %', p_onboarded_by_member_code;
        END IF;
        v_onboarder_src := 'member_ambassador';
    ELSE
        RAISE EXCEPTION 'ONBOARDER_MEMBER_NOT_FOUND: %', p_onboarded_by_member_code;
    END IF;

    v_district  := NULLIF(trim(COALESCE(p_metadata->>'district', '')), '');
    v_city_name := NULLIF(trim(COALESCE(p_metadata->>'city_name', '')), '');
    v_comm_reg  := NULLIF(trim(COALESCE(p_metadata->>'commercial_reg_no', '')), '');
    v_tax_id    := NULLIF(trim(COALESCE(p_metadata->>'tax_id', '')), '');

    -- حظر إعادة تسجيل التاجر المحظور نهائياً بالهاتف أو السجل أو الرقم الضريبي
    IF EXISTS (
        SELECT 1
          FROM sawyan.merchants bm
         WHERE bm.governance_status = 'banned_permanent'
           AND (
               bm.phone = v_clean_phone
               OR (v_comm_reg IS NOT NULL AND NULLIF(trim(COALESCE(bm.metadata->>'commercial_reg_no', '')), '') = v_comm_reg)
               OR (v_tax_id IS NOT NULL AND NULLIF(trim(COALESCE(bm.tax_registration_no, bm.metadata->>'tax_id', '')), '') = v_tax_id)
           )
    ) THEN
        RAISE EXCEPTION 'MERCHANT_BANNED_RE_REGISTRATION_BLOCKED';
    END IF;

    IF sawyan.is_reg_field_required('merchant', 'city', 'initial')
       AND p_city_geoname_id IS NULL AND v_city_name IS NULL AND NULLIF(trim(COALESCE(p_address, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MERCHANT_CITY_REQUIRED';
    END IF;

    IF v_mtype IN ('physical', 'both')
       AND sawyan.is_reg_field_required('merchant', 'district', 'initial')
       AND v_district IS NULL AND NULLIF(trim(COALESCE(p_address, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MERCHANT_DISTRICT_REQUIRED';
    END IF;

    IF sawyan.is_reg_field_required('merchant', 'address', 'initial') AND NULLIF(trim(COALESCE(p_address, '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_ADDRESS_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'business_description', 'initial') AND NULLIF(trim(COALESCE(p_metadata->>'description', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_DESCRIPTION_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'website_url', 'initial') AND v_mtype IN ('online', 'both') AND NULLIF(trim(COALESCE(p_metadata->>'website_url', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_WEBSITE_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'whatsapp', 'initial') AND NULLIF(trim(COALESCE(p_metadata->>'whatsapp', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_WHATSAPP_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'geo_location', 'initial') AND (p_latitude IS NULL OR p_longitude IS NULL) AND NULLIF(trim(COALESCE(p_metadata->>'google_maps_url', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_GEO_LOCATION_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'commercial_reg_no', 'initial') AND v_comm_reg IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_COMMERCIAL_REG_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'tax_id', 'initial') AND v_tax_id IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_TAX_ID_REQUIRED';
    END IF;

    IF p_initial_cashier_pin IS NOT NULL AND trim(p_initial_cashier_pin) <> '' AND trim(p_initial_cashier_pin) !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'INVALID_CASHIER_PIN_FORMAT';
    END IF;
    IF (p_initial_cashier_pin IS NULL OR trim(p_initial_cashier_pin) = '') AND sawyan.is_reg_field_required('merchant', 'initial_cashier_pin', 'initial') THEN
        RAISE EXCEPTION 'INITIAL_CASHIER_PIN_REQUIRED';
    END IF;

    IF EXISTS (SELECT 1 FROM sawyan.merchants WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'MERCHANT_PHONE_ALREADY_REGISTERED';
    END IF;

    IF v_clean_email IS NOT NULL AND EXISTS (SELECT 1 FROM sawyan.merchants WHERE lower(email) = v_clean_email) THEN
        RAISE EXCEPTION 'MERCHANT_EMAIL_ALREADY_REGISTERED';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_merchant_code_seq'));
    SELECT COUNT(*) + 101 INTO v_seq_num FROM sawyan.merchants WHERE country_id = v_country.id;
    LOOP
        v_mcode := 'M-' || v_country.country_code || '-' || v_seq_num::text;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = v_mcode);
        v_seq_num := v_seq_num + 1;
    END LOOP;

    IF v_clean_email IS NULL THEN
        v_clean_email := lower(replace(v_mcode, '-', '')) || '@merchants.SAWYAN.global';
    END IF;

    v_pw_hash       := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(32), 'hex');

    v_addr_fallback := (NULLIF(trim(COALESCE(p_address, '')), '') IS NULL);
    v_geo_fallback  := ((p_latitude IS NULL OR p_longitude IS NULL) AND NULLIF(trim(COALESCE(p_metadata->>'google_maps_url', '')), '') IS NULL);

    v_lat := COALESCE(p_latitude, CASE WHEN v_country.country_code = 'TR' THEN 41.008200 WHEN v_country.country_code = 'SA' THEN 24.713552 ELSE 30.044400 END);
    v_lng := COALESCE(p_longitude, CASE WHEN v_country.country_code = 'TR' THEN 28.978400 WHEN v_country.country_code = 'SA' THEN 46.675296 ELSE 31.235700 END);

    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        IF v_district IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('district', left(v_district, 120)); END IF;
        IF v_city_name IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('city_name', left(v_city_name, 120)); END IF;
        IF p_city_geoname_id IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('city_geoname_id', p_city_geoname_id); END IF;
        IF p_metadata ? 'description' AND NULLIF(trim(COALESCE(p_metadata->>'description', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('description', left(trim(p_metadata->>'description'), 1000));
        END IF;
        IF p_metadata ? 'website_url' AND NULLIF(trim(COALESCE(p_metadata->>'website_url', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('website_url', left(trim(p_metadata->>'website_url'), 300));
        END IF;
        IF p_metadata ? 'webhook_url' AND NULLIF(trim(COALESCE(p_metadata->>'webhook_url', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('webhook_url', left(trim(p_metadata->>'webhook_url'), 300));
        END IF;
        IF p_metadata ? 'whatsapp' AND NULLIF(trim(COALESCE(p_metadata->>'whatsapp', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('whatsapp', left(trim(p_metadata->>'whatsapp'), 40));
        END IF;
        IF p_metadata ? 'google_maps_url' AND NULLIF(trim(COALESCE(p_metadata->>'google_maps_url', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('google_maps_url', left(trim(p_metadata->>'google_maps_url'), 400));
        END IF;
        IF p_metadata ? 'social' AND jsonb_typeof(p_metadata->'social') = 'object' THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('social', p_metadata->'social');
        END IF;
        IF p_metadata ? 'working_hours' AND p_metadata->'working_hours' IS NOT NULL AND jsonb_typeof(p_metadata->'working_hours') <> 'null' THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('working_hours', p_metadata->'working_hours');
        END IF;
        IF v_comm_reg IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('commercial_reg_no', left(v_comm_reg, 80));
        END IF;
        IF v_tax_id IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('tax_id', left(v_tax_id, 80));
        END IF;
        IF p_metadata ? 'wifi_ssid' AND NULLIF(trim(COALESCE(p_metadata->>'wifi_ssid', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('wifi_ssid', left(trim(p_metadata->>'wifi_ssid'), 80));
        END IF;

        v_logo := sawyan.validate_attachment_data(p_metadata->>'logo_url', 200000, true);
        IF v_logo IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('logo_url', v_logo); END IF;
        IF v_logo IS NULL AND sawyan.is_reg_field_required('merchant', 'logo_url', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_LOGO_REQUIRED';
        END IF;

        v_cover := sawyan.validate_attachment_data(p_metadata->>'cover_image_url', 480000, true);
        IF v_cover IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('cover_image_url', v_cover); END IF;
        IF v_cover IS NULL AND sawyan.is_reg_field_required('merchant', 'cover_image_url', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_COVER_REQUIRED';
        END IF;

        IF p_metadata ? 'images' AND jsonb_typeof(p_metadata->'images') = 'array' THEN
            FOR v_img_item IN SELECT elem #>> '{}' FROM jsonb_array_elements(p_metadata->'images') elem LOOP
                IF v_img_cnt >= 6 THEN EXIT; END IF;
                v_img_item := sawyan.validate_attachment_data(v_img_item, 350000, true);
                IF v_img_item IS NOT NULL THEN
                    v_img_arr := v_img_arr || to_jsonb(v_img_item);
                    v_img_cnt := v_img_cnt + 1;
                END IF;
            END LOOP;
            IF v_img_cnt > 0 THEN v_safe_meta := v_safe_meta || jsonb_build_object('images', v_img_arr); END IF;
        END IF;

        IF p_metadata ? 'kyc_docs' AND jsonb_typeof(p_metadata->'kyc_docs') = 'object' THEN
            FOR v_k_key, v_k_val IN SELECT key, value FROM jsonb_each_text(p_metadata->'kyc_docs') LOOP
                IF v_k_key IN ('commercial_reg', 'tax_card', 'owner_id', 'store_license', 'storefront_photo') THEN
                    v_k_val := sawyan.validate_attachment_data(v_k_val, 480000, true);
                    IF v_k_val IS NOT NULL THEN v_kyc_obj := v_kyc_obj || jsonb_build_object(v_k_key, v_k_val); END IF;
                END IF;
            END LOOP;
            IF v_kyc_obj <> '{}'::jsonb THEN v_safe_meta := v_safe_meta || jsonb_build_object('kyc_docs', v_kyc_obj); END IF;
        END IF;
    END IF;

    IF v_onboarder_src IS NOT NULL THEN
        v_safe_meta := v_safe_meta || jsonb_build_object('onboarded_source', v_onboarder_src);
    END IF;
    v_safe_meta := v_safe_meta || jsonb_build_object(
        'commission_pending', v_comm_pending,
        'commission_locked', false,
        'address_is_fallback', v_addr_fallback,
        'geo_is_fallback', v_geo_fallback
    );

    SELECT id INTO v_owner_mem_id
      FROM sawyan.members
     WHERE member_code > 0
       AND is_tombstone_banned = false
       AND (
           phone = v_clean_phone
           OR (v_clean_email IS NOT NULL AND lower(email) = lower(v_clean_email))
       )
     ORDER BY created_at ASC
     LIMIT 1;

    INSERT INTO sawyan.merchants (
        merchant_code, country_id, onboarded_by_member_id, owner_member_id, business_name, owner_name,
        email, phone, category, merchant_type, deduction_percent,
        package_base_amount, actual_cash_balance, soft_hold_balance, credit_limit,
        is_isolated, address, latitude, longitude, is_active,
        onboarding_status, governance_status, tax_registration_no,
        password_hash, metadata
    ) VALUES (
        v_mcode, v_country.id, v_onboarder_id, v_owner_mem_id, v_clean_name, v_clean_owner,
        v_clean_email, v_clean_phone, v_cat_slug, v_mtype, v_eff_pct,
        0.00, 0.00, 0.00, 0.00,
        true, COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), COALESCE(v_city_name || COALESCE(' - ' || v_district, ''), v_clean_name || ' - الفرع الرئيسي')),
        v_lat, v_lng, true,
        'draft_incomplete', 'good_standing', v_tax_id,
        v_pw_hash,
        v_safe_meta || jsonb_build_object('active_session_token', v_session_token, 'last_login_at', now())
    ) RETURNING id INTO v_merch_id;

    INSERT INTO sawyan.merchant_branches (
        merchant_id, branch_code, branch_name, is_main_branch, city_geoname_id,
        address, latitude, longitude, branch_phone, branch_manager_name, is_branch_active
    ) VALUES (
        v_merch_id, 'BR-01', 'الفرع الرئيسي — ' || v_clean_name, true, p_city_geoname_id,
        COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), COALESCE(v_city_name || COALESCE(' - ' || v_district, ''), 'الفرع الرئيسي')),
        v_lat, v_lng, v_clean_phone, v_clean_owner, true
    ) RETURNING id INTO v_branch_id;

    IF p_initial_cashier_pin IS NOT NULL AND trim(p_initial_cashier_pin) ~ '^\d{4}$' THEN
        INSERT INTO sawyan.cashier_employees (
            merchant_id, branch_id, employee_code, full_name, pin_hash, is_active
        ) VALUES (
            v_merch_id, v_branch_id, 'EMP-01', 'المالك / المُوثِّق الرئيسي — ' || v_clean_owner,
            extensions.crypt(trim(p_initial_cashier_pin), extensions.gen_salt('bf', 10)), true
        );
    END IF;

    v_prof_eval  := sawyan.evaluate_merchant_profile_complete(v_merch_id);
    v_onboard_st := CASE WHEN COALESCE((v_prof_eval->>'is_complete')::boolean, false) THEN 'approved' ELSE 'draft_incomplete' END;

    UPDATE sawyan.merchants
       SET onboarding_status = v_onboard_st
     WHERE id = v_merch_id;

    v_eff := sawyan.sync_merchant_status_flags(v_merch_id);

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
    VALUES (
        'admin',
        v_merch_id,
        'NewMerchantRegistered',
        'in_app',
        jsonb_build_object(
            'merchant_id', v_merch_id,
            'merchant_code', v_mcode,
            'business_name', v_clean_name,
            'owner_name', v_clean_owner,
            'country_code', v_country.country_code,
            'category', v_cat_slug,
            'deduction_percent', v_eff_pct,
            'onboarding_status', v_onboard_st,
            'missing_fields', COALESCE(v_prof_eval->'missing_fields', '[]'::jsonb)
        ),
        now()
    );

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch_id, 'merchant_registered_v3', 'merchants', v_merch_id::text,
        NULL, jsonb_build_object(
            'merchant_code', v_mcode, 'country', v_country.country_code,
            'deduction_percent', v_eff_pct, 'commission_pending', v_comm_pending,
            'onboarding_status', v_onboard_st
        )
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
            'deduction_percent', v_eff_pct,
            'commission_pending', v_comm_pending,
            'onboarding_status', v_eff->>'onboarding_status',
            'financial_status', v_eff->>'financial_status',
            'governance_status', v_eff->>'governance_status',
            'effective_access', v_eff->'effective_access'
        )
    );
END;
$function$;

-- 7. Admin Manage Merchant Contract (send Merchant Bell + Web Push on approval/changes)
CREATE OR REPLACE FUNCTION sawyan.admin_manage_merchant_contract(p_admin_id uuid, p_session_token text, p_merchant_id uuid, p_action character varying, p_deduction_percent numeric DEFAULT NULL::numeric, p_category character varying DEFAULT NULL::character varying, p_credit_limit numeric DEFAULT NULL::numeric, p_is_active boolean DEFAULT NULL::boolean, p_is_isolated boolean DEFAULT NULL::boolean, p_topup_amount_local numeric DEFAULT NULL::numeric, p_topup_bank_ref text DEFAULT NULL::text, p_topup_proof_notif_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'تحديث تعاقدي معتمد من إدارة علاقات التجار'::text, p_onboarding_status character varying DEFAULT NULL::character varying, p_governance_status character varying DEFAULT NULL::character varying, p_unsecured_queue_cap_override smallint DEFAULT NULL::smallint, p_clear_queue_cap_override boolean DEFAULT false, p_isolate_pct_override numeric DEFAULT NULL::numeric, p_clear_isolate_pct_override boolean DEFAULT false, p_deferred_settlement_cutoff_time time without time zone DEFAULT NULL::time without time zone, p_clear_cutoff_time boolean DEFAULT false, p_onboarding_notes text DEFAULT NULL::text, p_d4_cycle_days_override smallint DEFAULT NULL::smallint, p_clear_d4_cycle_days boolean DEFAULT false, p_d4_grace_hours_override numeric DEFAULT NULL::numeric, p_clear_d4_grace_hours boolean DEFAULT false, p_d4_disable_time_trigger boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_adm           JSONB;
    v_mer           sawyan.merchants%ROWTYPE;
    v_act           VARCHAR(30);
    v_mc_res        JSONB;
    v_qtx           RECORD;
    v_released      INT := 0;
    v_rem_q         INT := 0;
    v_free_bal      NUMERIC(18,2) := 0.00;
    v_eff           JSONB;
    v_is_founder    BOOLEAN := false;
    v_eff_gov       VARCHAR(30);
    v_eff_onb       VARCHAR(30);
    v_cred_changed  BOOLEAN := false;
    v_needs_mc      BOOLEAN := false;
    v_payload       JSONB;
    v_old_onb       VARCHAR(30);
    v_old_gov       VARCHAR(30);
    v_old_cred      NUMERIC(18,2);
    v_old_pct       NUMERIC(5,2);
    v_notif_ev      VARCHAR(60);
    v_push_title    TEXT;
    v_push_body     TEXT;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance', 'reviewer'], true);
    v_act := lower(trim(COALESCE(p_action, 'update_contract')));
    v_is_founder := COALESCE((v_adm->>'is_sovereign_founder')::boolean, false);

    SELECT * INTO v_mer FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;
    v_old_onb  := v_mer.onboarding_status;
    v_old_gov  := v_mer.governance_status;
    v_old_cred := v_mer.credit_limit;
    v_old_pct  := v_mer.deduction_percent;

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
    END IF;

    IF p_deduction_percent IS NOT NULL AND (p_deduction_percent < 0.50 OR p_deduction_percent > 95.00) THEN
        RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
    END IF;
    IF p_credit_limit IS NOT NULL AND p_credit_limit < 0 THEN
        RAISE EXCEPTION 'INVALID_CREDIT_LIMIT_NEGATIVE';
    END IF;
    IF p_d4_cycle_days_override IS NOT NULL AND (p_d4_cycle_days_override < 1 OR p_d4_cycle_days_override > 90) THEN
        RAISE EXCEPTION 'INVALID_D4_CYCLE_DAYS_RANGE';
    END IF;
    IF p_d4_grace_hours_override IS NOT NULL AND (p_d4_grace_hours_override < 0 OR p_d4_grace_hours_override > 168) THEN
        RAISE EXCEPTION 'INVALID_D4_GRACE_HOURS_RANGE';
    END IF;

    v_eff_onb := NULLIF(lower(trim(COALESCE(p_onboarding_status, ''))), '');
    IF v_eff_onb IS NOT NULL AND v_eff_onb NOT IN ('draft_incomplete', 'needs_correction', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'INVALID_ONBOARDING_STATUS: %', p_onboarding_status;
    END IF;

    v_eff_gov := NULLIF(lower(trim(COALESCE(p_governance_status, ''))), '');
    IF v_eff_gov IS NOT NULL AND v_eff_gov NOT IN (
        'good_standing', 'probation_warning', 'restricted_no_reject',
        'paused_by_merchant', 'paused_by_admin', 'suspended_compliance', 'banned_permanent'
    ) THEN
        RAISE EXCEPTION 'INVALID_GOVERNANCE_STATUS: %', p_governance_status;
    END IF;

    -- توافق رجعي مع الاستدعاءات التي تمرر p_is_active فقط
    IF v_eff_gov IS NULL THEN
        IF p_is_active IS FALSE THEN
            v_eff_gov := 'paused_by_admin';
        ELSIF p_is_active IS TRUE AND v_mer.governance_status IN ('paused_by_admin', 'paused_by_merchant') THEN
            v_eff_gov := COALESCE(v_mer.pre_pause_governance_status, 'good_standing');
        END IF;
    END IF;

    v_cred_changed := (p_credit_limit IS NOT NULL AND p_credit_limit IS DISTINCT FROM v_mer.credit_limit);
    v_needs_mc := (
        NOT v_is_founder
        AND (
            v_cred_changed
            OR v_eff_gov IN ('suspended_compliance', 'banned_permanent')
        )
    );

    IF v_needs_mc THEN
        v_payload := jsonb_strip_nulls(jsonb_build_object(
            'merchant_id', v_mer.id,
            'deduction_percent', p_deduction_percent,
            'category', NULLIF(trim(COALESCE(p_category, '')), ''),
            'credit_limit', p_credit_limit,
            'onboarding_status', v_eff_onb,
            'onboarding_notes', NULLIF(trim(COALESCE(p_onboarding_notes, '')), ''),
            'governance_status', v_eff_gov,
            'governance_reason', NULLIF(trim(COALESCE(p_reason, '')), ''),
            'unsecured_queue_cap_override', p_unsecured_queue_cap_override,
            'clear_queue_cap_override', CASE WHEN p_clear_queue_cap_override THEN true ELSE NULL END,
            'isolate_pct_override', p_isolate_pct_override,
            'clear_isolate_pct_override', CASE WHEN p_clear_isolate_pct_override THEN true ELSE NULL END,
            'deferred_settlement_cutoff_time', CASE WHEN p_deferred_settlement_cutoff_time IS NOT NULL THEN p_deferred_settlement_cutoff_time::text ELSE NULL END,
            'clear_cutoff_time', CASE WHEN p_clear_cutoff_time THEN true ELSE NULL END,
            'd4_cycle_days_override', p_d4_cycle_days_override,
            'clear_d4_cycle_days', CASE WHEN p_clear_d4_cycle_days THEN true ELSE NULL END,
            'd4_grace_hours_override', p_d4_grace_hours_override,
            'clear_d4_grace_hours', CASE WHEN p_clear_d4_grace_hours THEN true ELSE NULL END,
            'd4_disable_time_trigger', p_d4_disable_time_trigger
        ));

        v_mc_res := sawyan.admin_submit_governance_request(
            p_admin_id,
            p_session_token,
            'MERCHANT_GOVERNANCE_ACTION',
            'merchants',
            v_mer.id::text,
            v_payload,
            COALESCE(NULLIF(trim(p_reason), ''), 'طلب حوكمة/حد ائتمان D4 بانتظار المعتمد المالي/المؤسس')
        );
        RETURN v_mc_res || jsonb_build_object(
            'pending_maker_checker', true,
            'merchant_id', v_mer.id,
            'merchant_code', v_mer.merchant_code
        );
    END IF;

    UPDATE sawyan.merchants
       SET deduction_percent               = COALESCE(p_deduction_percent, deduction_percent),
           category                        = COALESCE(NULLIF(trim(p_category), ''), category),
           credit_limit                    = COALESCE(p_credit_limit, credit_limit),
           package_base_amount             = GREATEST(package_base_amount, COALESCE(p_credit_limit, credit_limit)),
           onboarding_status               = COALESCE(v_eff_onb, onboarding_status),
           onboarding_notes                = CASE
               WHEN p_onboarding_notes IS NOT NULL THEN NULLIF(trim(p_onboarding_notes), '')
               WHEN v_eff_onb = 'approved' THEN NULL
               ELSE onboarding_notes
           END,
           governance_status               = COALESCE(v_eff_gov, governance_status),
           pre_pause_governance_status     = CASE
               WHEN v_eff_gov IN ('good_standing', 'probation_warning', 'restricted_no_reject', 'suspended_compliance', 'banned_permanent') THEN NULL
               WHEN v_eff_gov IN ('paused_by_admin', 'paused_by_merchant') AND governance_status IN ('good_standing', 'probation_warning') THEN governance_status
               ELSE pre_pause_governance_status
           END,
           governance_reason               = CASE
               WHEN v_eff_gov IS NOT NULL OR NULLIF(trim(COALESCE(p_reason, '')), '') IS NOT NULL
               THEN COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), governance_reason)
               ELSE governance_reason
           END,
           governance_updated_at           = CASE WHEN v_eff_gov IS NOT NULL THEN now() ELSE governance_updated_at END,
           unsecured_queue_cap_override    = CASE
               WHEN p_clear_queue_cap_override THEN NULL
               WHEN p_unsecured_queue_cap_override IS NOT NULL THEN p_unsecured_queue_cap_override
               ELSE unsecured_queue_cap_override
           END,
           isolate_pct_override            = CASE
               WHEN p_clear_isolate_pct_override THEN NULL
               WHEN p_isolate_pct_override IS NOT NULL THEN ROUND(p_isolate_pct_override::numeric, 2)
               ELSE isolate_pct_override
           END,
           deferred_settlement_cutoff_time = CASE
               WHEN p_clear_cutoff_time THEN NULL
               WHEN p_deferred_settlement_cutoff_time IS NOT NULL THEN p_deferred_settlement_cutoff_time
               ELSE deferred_settlement_cutoff_time
           END,
           d4_cycle_days_override          = CASE
               WHEN p_clear_d4_cycle_days THEN NULL
               WHEN p_d4_cycle_days_override IS NOT NULL THEN p_d4_cycle_days_override
               ELSE d4_cycle_days_override
           END,
           d4_grace_hours_override         = CASE
               WHEN p_clear_d4_grace_hours THEN NULL
               WHEN p_d4_grace_hours_override IS NOT NULL THEN ROUND(p_d4_grace_hours_override::numeric, 2)
               ELSE d4_grace_hours_override
           END,
           metadata                        = (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'contract_reviewed_at', now(),
               'contract_reviewed_by', p_admin_id,
               'commission_locked', CASE
                   WHEN COALESCE(p_deduction_percent, deduction_percent) >= 0.50
                        AND (COALESCE(v_eff_onb, onboarding_status) = 'approved' OR COALESCE(p_credit_limit, credit_limit) > 0 OR actual_cash_balance > 0 OR p_deduction_percent IS NOT NULL)
                   THEN true
                   ELSE COALESCE((metadata->>'commission_locked')::boolean, false)
               END,
               'commission_pending', CASE WHEN COALESCE(p_deduction_percent, deduction_percent) >= 0.50 THEN false ELSE true END
           )) || CASE
               WHEN p_d4_disable_time_trigger IS NOT NULL THEN jsonb_build_object('d4_time_trigger_disabled', p_d4_disable_time_trigger)
               ELSE '{}'::jsonb
           END
     WHERE id = v_mer.id
    RETURNING * INTO v_mer;

    FOR v_qtx IN
        SELECT id, commission_amount
          FROM sawyan.transactions
         WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup'
         ORDER BY fifo_seq ASC
    LOOP
        SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
        IF (v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit) >= v_qtx.commission_amount THEN
            PERFORM sawyan.feed_monthly_target_box(v_qtx.id, p_admin_id);
            v_released := v_released + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    v_eff := sawyan.sync_merchant_status_flags(v_mer.id);
    IF p_is_isolated IS TRUE AND COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false) THEN
        UPDATE sawyan.merchants SET is_isolated = true WHERE id = v_mer.id;
    END IF;

    SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
    SELECT COUNT(*) INTO v_rem_q FROM sawyan.transactions WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup';
    v_free_bal := v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit;

    IF v_mer.onboarding_status IS DISTINCT FROM v_old_onb
       OR v_mer.governance_status IS DISTINCT FROM v_old_gov
       OR v_mer.credit_limit IS DISTINCT FROM v_old_cred
       OR v_mer.deduction_percent IS DISTINCT FROM v_old_pct
    THEN
        IF v_mer.onboarding_status IS DISTINCT FROM v_old_onb AND v_mer.onboarding_status = 'approved' THEN
            v_notif_ev   := 'MerchantOnboardingApproved';
            v_push_title := '✅ تم اعتماد متجرك بياناتياً في SAWYAN';
            v_push_body  := CASE
                WHEN (v_eff->>'financial_status') = 'unfunded'
                THEN 'مبروك! تم قبول بيانات متجرك (' || v_mer.merchant_code || '). الخطوة الأخيرة: اشحن رصيد متجرك من لوحة التحكم ليظهر فوراً في الدليل وتفتح شاشة الكاشير.'
                ELSE 'مبروك! تم اعتماد متجرك (' || v_mer.merchant_code || ') وأصبح جاهزاً للعمل.'
            END;
        ELSIF v_mer.onboarding_status IS DISTINCT FROM v_old_onb THEN
            v_notif_ev   := 'MerchantOnboardingUpdated';
            v_push_title := CASE v_mer.onboarding_status
                WHEN 'needs_correction' THEN '✏️ مطلوب استكمال/تصحيح بيانات متجرك'
                WHEN 'rejected' THEN '🚫 تحديث بشأن طلب تسجيل متجرك'
                ELSE '📋 تحديث حالة تأهيل متجرك'
            END;
            v_push_body  := COALESCE(NULLIF(trim(COALESCE(v_mer.onboarding_notes, '')), ''), COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'يرجى مراجعة إعدادات المتجر في لوحة التحكم.'));
        ELSE
            v_notif_ev   := 'MerchantContractUpdated';
            v_push_title := '⚙️ تم تحديث بيانات تعاقد متجرك';
            v_push_body  := COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'تم تحديث إعدادات العقد أو الحد الائتماني من إدارة علاقات التجار.');
        END IF;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES (
            'merchant',
            v_mer.id,
            v_notif_ev,
            'in_app',
            jsonb_build_object(
                'merchant_id', v_mer.id,
                'merchant_code', v_mer.merchant_code,
                'business_name', v_mer.business_name,
                'onboarding_status', v_mer.onboarding_status,
                'onboarding_notes', v_mer.onboarding_notes,
                'governance_status', v_mer.governance_status,
                'financial_status', v_eff->>'financial_status',
                'credit_limit', v_mer.credit_limit,
                'deduction_percent', v_mer.deduction_percent,
                'needs_topup', ((v_eff->>'financial_status') = 'unfunded'),
                'title', v_push_title,
                'message', v_push_body,
                'reason', p_reason
            ),
            now()
        );

        BEGIN
            PERFORM sawyan.enqueue_and_dispatch_push(
                v_notif_ev,
                ARRAY['merchant_owner'],
                v_push_title,
                v_push_body,
                v_mer.id,
                NULL,
                NULL,
                NULL,
                'merchant-dashboard/dashboard.html',
                'merchant-contract-' || v_mer.id::text,
                jsonb_build_object('onboarding_status', v_mer.onboarding_status, 'financial_status', v_eff->>'financial_status')
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    PERFORM sawyan.append_audit_log(
        'admin', p_admin_id, 'merchant_contract_updated', 'merchants', v_mer.id::text, NULL,
        jsonb_build_object(
            'deduction_percent', v_mer.deduction_percent,
            'credit_limit', v_mer.credit_limit,
            'onboarding_status', v_mer.onboarding_status,
            'governance_status', v_mer.governance_status,
            'financial_status', v_eff->>'financial_status',
            'actual_cash_balance', v_mer.actual_cash_balance,
            'soft_hold_balance', v_mer.soft_hold_balance,
            'free_balance', v_free_bal,
            'is_active', v_mer.is_active,
            'is_isolated', v_mer.is_isolated,
            'released_fifo_count', v_released,
            'remaining_queue', v_rem_q,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'merchant_id', v_mer.id,
        'merchant_code', v_mer.merchant_code,
        'deduction_percent', v_mer.deduction_percent,
        'credit_limit', v_mer.credit_limit,
        'onboarding_status', v_mer.onboarding_status,
        'governance_status', v_mer.governance_status,
        'financial_status', v_eff->>'financial_status',
        'effective_access', v_eff->'effective_access',
        'actual_cash_balance', v_mer.actual_cash_balance,
        'soft_hold_balance', v_mer.soft_hold_balance,
        'free_balance', v_free_bal,
        'is_active', v_mer.is_active,
        'is_isolated', v_mer.is_isolated,
        'released_fifo_count', v_released,
        'remaining_queue', v_rem_q,
        'pending_maker_checker', false
    );
END;
$function$;

-- 8. Process Merchant Top-Up FIFO (send Merchant Bell + Web Push on credited top-up)
CREATE OR REPLACE FUNCTION sawyan.process_merchant_topup_fifo(p_merchant_id uuid, p_topup_amount numeric, p_payment_ref character varying, p_idempotency_key uuid, p_psp_fee numeric DEFAULT 0.00, p_provider character varying DEFAULT 'bank_transfer'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
    v_now_utc        TIMESTAMPTZ := sawyan.now_utc();
    v_pre_d4         JSONB;
    v_pre_stmt_due   NUMERIC(18,2) := 0.00;
    v_pre_close_at   TIMESTAMPTZ := NULL;
    v_next_start_utc TIMESTAMPTZ := NULL;
    v_eff            JSONB;
    v_res_body       JSONB;
BEGIN
    IF p_topup_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_TOPUP_AMOUNT';
    END IF;
    IF p_psp_fee < 0 OR p_psp_fee >= p_topup_amount THEN
        RAISE EXCEPTION 'INVALID_PSP_FEE';
    END IF;

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

    v_fx_rate := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
        THEN v_country.admin_fx_rate
        ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
    END;

    v_gross_usd := ROUND((p_topup_amount / v_fx_rate)::numeric, 2);
    v_fee_usd   := ROUND((p_psp_fee / v_fx_rate)::numeric, 2);
    v_net_usd   := v_gross_usd - v_fee_usd;

    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('MERCHANT_TOPUP', p_merchant_id, v_country.id, v_fx_rate, 'Merchant Prepaid Top-Up: ' || p_payment_ref)
    RETURNING id INTO v_journal_topup;

    INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
    VALUES
        (v_journal_topup, '1102', 'psp', NULL, v_gross_usd, 0.00, p_topup_amount, v_country.currency_code),
        (v_journal_topup, '2101', 'merchant', p_merchant_id, 0.00, v_gross_usd, p_topup_amount, v_country.currency_code);

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

    v_pre_d4       := sawyan.compute_merchant_d4_cycle_info(p_merchant_id);
    v_pre_stmt_due := COALESCE((v_pre_d4->>'d4_statement_due_local')::numeric, 0.00);
    v_pre_close_at := NULLIF(COALESCE(v_pre_d4->>'d4_cycle_close_at', ''), '')::timestamptz;

    -- شحن الرصيد الفعلي وقفل النسبة على أول تمويل + تصفير دين D4 إذا أصبحت المحفظة >= 0
    UPDATE sawyan.merchants
       SET actual_cash_balance = actual_cash_balance + p_topup_amount,
           package_base_amount = GREATEST(package_base_amount, actual_cash_balance + p_topup_amount),
           metadata            = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('commission_locked', CASE WHEN deduction_percent >= 0.50 THEN true ELSE COALESCE((metadata->>'commission_locked')::boolean, false) END)
               || CASE
                      WHEN (actual_cash_balance + p_topup_amount) >= 0
                      THEN jsonb_build_object('last_d4_settlement_date', to_char(v_now_utc AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM-DD'))
                      ELSE '{}'::jsonb
                  END
     WHERE id = p_merchant_id
    RETURNING * INTO v_merchant;

    FOR v_queued_tx IN
        SELECT id, commission_amount
          FROM sawyan.transactions
         WHERE merchant_id = p_merchant_id AND status = 'awaiting_merchant_topup'
         ORDER BY fifo_seq ASC
    LOOP
        SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
        IF (v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit) >= v_queued_tx.commission_amount THEN
            PERFORM sawyan.feed_monthly_target_box(v_queued_tx.id, p_merchant_id);
            v_released_count := v_released_count + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF v_merchant.credit_limit > 0 AND v_merchant.actual_cash_balance < 0
       AND v_pre_close_at IS NOT NULL AND v_now_utc >= v_pre_close_at
       AND p_topup_amount >= v_pre_stmt_due THEN
        SELECT COALESCE(MIN(COALESCE(tx.completed_at, tx.created_at)), v_now_utc)
          INTO v_next_start_utc
          FROM sawyan.transactions tx
         WHERE tx.merchant_id = p_merchant_id
           AND tx.status = 'completed'
           AND COALESCE(tx.completed_at, tx.created_at) >= v_pre_close_at;

        UPDATE sawyan.merchants
           SET metadata = COALESCE(metadata, '{}'::jsonb)
                          || jsonb_build_object(
                              'd4_debt_started_at', v_next_start_utc,
                              'last_d4_settlement_date', to_char(v_now_utc AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM-DD')
                          )
         WHERE id = p_merchant_id;
    END IF;

    SELECT COUNT(*) INTO v_remaining_q
      FROM sawyan.transactions
     WHERE merchant_id = p_merchant_id AND status = 'awaiting_merchant_topup';

    -- الشحن وحده لا يرفع تعليق الامتثال ولا الإيقاف الإداري ولا التقييد (sync_merchant_status_flags تحكم الجميع)
    v_eff := sawyan.sync_merchant_status_flags(p_merchant_id);
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    v_free_pct := COALESCE((v_eff->>'free_pct')::numeric, 0.00);

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
    VALUES (
        'merchant',
        p_merchant_id,
        'MerchantTopupApproved',
        'in_app',
        jsonb_build_object(
            'merchant_id', p_merchant_id,
            'merchant_code', v_merchant.merchant_code,
            'amount_local', p_topup_amount,
            'currency_code', v_country.currency_code,
            'new_cash_balance', v_merchant.actual_cash_balance,
            'released_fifo_count', v_released_count,
            'payment_ref', p_payment_ref,
            'is_visible_on_radar', COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false),
            'title', '💳 تم شحن رصيد متجرك بنجاح',
            'message', 'تمت إضافة ' || ROUND(p_topup_amount::numeric, 2)::text || ' ' || v_country.currency_code || ' (مرجع ' || p_payment_ref || ') — رصيدك الحالي ' || ROUND(v_merchant.actual_cash_balance::numeric, 2)::text || ' ' || v_country.currency_code || CASE WHEN v_released_count > 0 THEN ' وتحرير ' || v_released_count::text || ' فاتورة تلقائياً.' ELSE ' وأصبح متجرك جاهزاً لاستقبال وتوثيق المبيعات.' END
        ),
        now()
    );

    BEGIN
        PERFORM sawyan.enqueue_and_dispatch_push(
            'MerchantTopupApproved',
            ARRAY['merchant_owner'],
            '💳 تم شحن رصيد متجرك بنجاح',
            'تمت إضافة ' || ROUND(p_topup_amount::numeric, 2)::text || ' ' || v_country.currency_code || ' لحساب ' || v_merchant.business_name || ' — متجرك جاهز للتشغيل الآن.',
            p_merchant_id,
            NULL,
            NULL,
            NULL,
            'merchant-dashboard/dashboard.html',
            'merchant-topup-' || p_merchant_id::text,
            jsonb_build_object('amount_local', p_topup_amount, 'currency_code', v_country.currency_code)
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    v_res_body := jsonb_build_object(
        'released_fifo_count', v_released_count,
        'remaining_queue', v_remaining_q,
        'free_balance_pct', ROUND(v_free_pct, 2),
        'is_isolated', v_merchant.is_isolated,
        'financial_status', v_eff->>'financial_status',
        'governance_status', v_eff->>'governance_status'
    );

    UPDATE sawyan.idempotency_keys
       SET response_status = 200, response_body = v_res_body
     WHERE idempotency_key = p_idempotency_key;

    RETURN v_res_body;
END;
$function$;

-- 9. Submit Member Pending Purchase (block merchant owner self-purchase)
CREATE OR REPLACE FUNCTION sawyan.submit_member_pending_purchase(p_member_id uuid, p_merchant_id uuid, p_branch_id uuid, p_amount numeric, p_payment_type character varying DEFAULT 'cash'::character varying, p_idempotency_key uuid DEFAULT NULL::uuid, p_session_token text DEFAULT NULL::text, p_receipt_url text DEFAULT NULL::text, p_unique_payment_ref character varying DEFAULT NULL::character varying, p_employee_code character varying DEFAULT NULL::character varying, p_cashier_pin text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_member         sawyan.members%ROWTYPE;
    v_merchant       sawyan.merchants%ROWTYPE;
    v_settings       sawyan.settings%ROWTYPE;
    v_eff            JSONB;
    v_fin_status     VARCHAR(30);
    v_gov_status     VARCHAR(30);
    v_idem           UUID;
    v_branch_id      UUID;
    v_short_code     VARCHAR(24);
    v_ref            VARCHAR(128);
    v_pay_type       VARCHAR(30);
    v_clean_rec      TEXT;
    v_spam_thresh    INT;
    v_spam_win_hrs   INT;
    v_spam_req_hrs   INT;
    v_rej_cnt        INT := 0;
    v_last_rej_at    TIMESTAMPTZ;
    v_res            JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PURCHASE_AMOUNT';
    END IF;

    -- Security Hardening (Stage 14): Cashier PIN is strictly forbidden on customer phones
    IF NULLIF(trim(COALESCE(p_employee_code, '')), '') IS NOT NULL
       OR NULLIF(trim(COALESCE(p_cashier_pin, '')), '') IS NOT NULL
    THEN
        RAISE EXCEPTION 'CASHIER_PIN_ONLY_ON_EMPLOYEE_OR_MERCHANT_DEVICE';
    END IF;

    v_pay_type := CASE lower(trim(COALESCE(p_payment_type, 'cash')))
        WHEN 'card' THEN 'pos_card'
        WHEN 'instapay' THEN 'instant_transfer'
        WHEN 'wallet' THEN 'digital_wallet'
        WHEN '' THEN 'cash'
        ELSE lower(trim(p_payment_type))
    END;
    IF v_pay_type NOT IN (
        'cash', 'pos_card', 'instant_transfer', 'iban_swift_sepa', 'digital_wallet',
        'payment_gateway', 'bnpl', 'cheque', 'cod', 'marketplace_escrow'
    ) THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_TYPE: %', p_payment_type;
    END IF;

    v_clean_rec := sawyan.validate_attachment_data(p_receipt_url, 480000, true);

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    -- حظر الشراء الذاتي لمالك المتجر من متجره الشخصي
    IF (v_merchant.owner_member_id IS NOT NULL AND v_merchant.owner_member_id = v_member.id)
       OR (
           lower(COALESCE(v_merchant.email, '')) NOT LIKE '%.demo'
           AND (
               (NULLIF(trim(COALESCE(v_merchant.phone, '')), '') IS NOT NULL AND v_merchant.phone = v_member.phone)
               OR (NULLIF(lower(trim(COALESCE(v_merchant.email, ''))), '') IS NOT NULL AND lower(v_merchant.email) = lower(v_member.email))
           )
       )
    THEN
        RAISE EXCEPTION 'MERCHANT_OWNER_SELF_PURCHASE_FORBIDDEN';
    END IF;

    v_eff        := sawyan.compute_merchant_effective_state(v_merchant.id);
    v_fin_status := v_eff->>'financial_status';
    v_gov_status := v_eff->>'governance_status';

    IF COALESCE(v_merchant.deduction_percent, 0) <= 0 THEN
        RAISE EXCEPTION 'MERCHANT_COMMISSION_NOT_SET_YET';
    END IF;
    IF v_merchant.onboarding_status <> 'approved' THEN
        RAISE EXCEPTION 'MERCHANT_ONBOARDING_INCOMPLETE';
    END IF;
    IF v_gov_status IN ('paused_by_merchant', 'paused_by_admin') THEN
        RAISE EXCEPTION 'MERCHANT_TEMPORARILY_PAUSED';
    END IF;
    IF v_gov_status IN ('suspended_compliance', 'banned_permanent') THEN
        RAISE EXCEPTION 'MERCHANT_COMPLIANCE_SUSPENDED';
    END IF;
    IF v_fin_status = 'unfunded' THEN
        RAISE EXCEPTION 'MERCHANT_UNFUNDED_TOPUP_REQUIRED';
    END IF;
    IF v_fin_status = 'locked_queue_full' THEN
        RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE id = p_branch_id AND merchant_id = p_merchant_id AND is_branch_active = true;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_MERCHANT_BRANCH';
        END IF;
    ELSE
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE merchant_id = p_merchant_id AND is_branch_active = true
         ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'NO_ACTIVE_MERCHANT_BRANCH';
        END IF;
    END IF;

    -- Hidden Admin-Configurable Anti-Spam Guard (zero friction for honest members)
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_spam_thresh  := COALESCE(v_settings.spam_reject_threshold, 2);
    v_spam_win_hrs := COALESCE(v_settings.spam_reject_window_hours, 24);
    v_spam_req_hrs := COALESCE(v_settings.spam_require_receipt_hours, 24);

    IF v_clean_rec IS NULL AND v_spam_thresh > 0 THEN
        SELECT COUNT(*), MAX(COALESCE(NULLIF(commission_snapshot->>'rejected_at', '')::timestamptz, created_at))
          INTO v_rej_cnt, v_last_rej_at
          FROM sawyan.transactions
         WHERE merchant_id = p_merchant_id
           AND member_id   = v_member.id
           AND status      = 'rejected'
           AND receipt_media_url IS NULL
           AND COALESCE((commission_snapshot->>'cancelled_by_member')::boolean, false) = false
           AND COALESCE(NULLIF(commission_snapshot->>'rejected_at', '')::timestamptz, created_at) >= (now() - make_interval(hours => v_spam_win_hrs));

        IF v_rej_cnt >= v_spam_thresh
           AND v_last_rej_at IS NOT NULL
           AND v_last_rej_at >= (now() - make_interval(hours => v_spam_req_hrs))
        THEN
            RAISE EXCEPTION 'SPAM_GUARD_RECEIPT_REQUIRED: %', v_spam_req_hrs;
        END IF;
    END IF;

    v_idem       := COALESCE(p_idempotency_key, gen_random_uuid());
    v_short_code := 'SW-' || upper(substr(replace(v_idem::text, '-', ''), 1, 6));
    v_ref        := COALESCE(NULLIF(trim(COALESCE(p_unique_payment_ref, '')), ''), 'MBR-' || v_member.member_code || '-' || replace(v_idem::text, '-', ''));

    v_res := sawyan.submit_pos_transaction(
        v_member.id, p_merchant_id, v_branch_id,
        p_amount, v_pay_type, v_ref, v_short_code, v_idem, NULL, false, v_clean_rec
    );

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', p_merchant_id, 'PendingPurchaseRequested', 'in_app',
            jsonb_build_object(
                'transaction_id', v_res->>'transaction_id',
                'branch_id', v_branch_id,
                'sw_short_code', v_short_code,
                'amount', p_amount,
                'payment_type', v_pay_type,
                'member_code', v_member.member_code,
                'has_receipt', (v_clean_rec IS NOT NULL)
            ));

    RETURN v_res || jsonb_build_object('success', true, 'sw_short_code', v_short_code, 'mode', 'unified_pending');
END;
$function$;

-- 10. Merchant Dashboard Bundle (expose profile_complete + onboarded_by_member_code)
CREATE OR REPLACE FUNCTION sawyan.get_merchant_dashboard_bundle(p_merchant_id uuid, p_session_token text DEFAULT NULL::text, p_shift_filter character varying DEFAULT 'today'::character varying, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_settings     sawyan.settings%ROWTYPE;
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
    v_onb_code     BIGINT := NULL;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_eff   := sawyan.sync_merchant_status_flags(v_merch.id);
    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_merch.id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    IF v_merch.onboarded_by_member_id IS NOT NULL THEN
        SELECT member_code INTO v_onb_code FROM sawyan.members WHERE id = v_merch.onboarded_by_member_id;
    END IF;

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
                'profile_complete', COALESCE((v_eff->>'profile_complete')::boolean, false),
                'onboarded_by_member_id', v_merch.onboarded_by_member_id,
                'onboarded_by_member_code', v_onb_code,
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
        'verification_settings', jsonb_build_object(
            'employee_shift_hours', COALESCE(v_settings.employee_shift_hours, 8),
            'employee_idle_timeout_mins', COALESCE(v_settings.employee_idle_timeout_mins, 60),
            'live_poll_interval_secs', COALESCE(v_settings.live_poll_interval_secs, 8),
            'max_pending_per_merchant', COALESCE(v_settings.max_pending_per_merchant, 2),
            'allow_zero_hold_in_isolation', COALESCE(v_settings.allow_zero_hold_in_isolation, true)
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
                'max_tx_amount_limit', ce.max_tx_amount_limit, 'is_active', ce.is_active,
                'must_change_pin', COALESCE(ce.must_change_pin, false),
                'pin_changed_at', ce.pin_changed_at,
                'session_active', (ce.session_expires_at IS NOT NULL AND ce.session_expires_at > now() AND ce.session_token_hash IS NOT NULL)
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
                'created_at', t.created_at, 'branch_id', t.branch_id,
                'branch_name', COALESCE(mb.branch_name, 'الفرع الرئيسي'),
                'zero_hold_in_isolation', COALESCE((t.commission_snapshot->>'zero_hold_in_isolation')::boolean, false),
                'member_code', m.member_code,
                'member_masked_name', sawyan.mask_member_display_name(m.full_name, m.member_code)
            ) ORDER BY t.fifo_seq ASC)
            FROM sawyan.transactions t
            JOIN sawyan.members m ON m.id = t.member_id
            LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
            WHERE t.merchant_id = v_merch.id AND t.status IN ('pending', 'awaiting_merchant_topup')
        ), '[]'::jsonb),
        'recent_employee_rejections', COALESCE((
            SELECT jsonb_agg(row_to_json(er)) FROM (
                SELECT t.id, t.sw_short_code, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, t.receipt_media_url, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       t.commission_snapshot->>'rejected_by_employee_code' AS employee_code,
                       t.commission_snapshot->>'rejected_by_employee_name' AS employee_name,
                       t.commission_snapshot->>'rejection_reason'          AS rejection_reason,
                       t.commission_snapshot->>'rejected_at'               AS rejected_at,
                       t.commission_snapshot->>'owner_override_deadline'   AS owner_override_deadline
                  FROM sawyan.transactions t
                  JOIN sawyan.members m ON m.id = t.member_id
                 WHERE t.merchant_id = v_merch.id
                   AND t.status = 'rejected'
                   AND NULLIF(COALESCE(t.commission_snapshot->>'rejected_by_employee_id', ''), '') IS NOT NULL
                   AND now() <= COALESCE(
                       NULLIF(t.commission_snapshot->>'owner_override_deadline', '')::timestamptz,
                       COALESCE(NULLIF(t.commission_snapshot->>'rejected_at', '')::timestamptz, t.created_at) + interval '48 hours'
                   )
                 ORDER BY t.created_at DESC
                 LIMIT 20
            ) er
        ), '[]'::jsonb),
        'completed_transactions', COALESCE((
            SELECT jsonb_agg(row_to_json(sub)) FROM (
                SELECT t.id, t.sw_short_code, t.unique_payment_ref, t.status, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, t.receipt_media_url, (t.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                       t.completed_at, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       mb.branch_name, COALESCE(ce.full_name, 'مالك المتجر') AS cashier_name
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
$function$;

-- 11. Admin Sovereign Bundle (expose live admin_notifications feed for Admin Bell)
CREATE OR REPLACE FUNCTION sawyan.get_admin_sovereign_bundle(p_admin_id uuid, p_session_token text, p_period_ym character DEFAULT NULL::bpchar)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_admin_info    JSONB;
    v_period_ym     CHAR(7);
    v_sum_dr        NUMERIC(18,2);
    v_sum_cr        NUMERIC(18,2);
    v_unbal_je      INT;
    v_bad_pools     INT;
    v_kpis          JSONB;
    v_trial_bal     JSONB;
    v_countries     JSONB;
    v_settings      JSONB;
    v_cycles        JSONB;
    v_mc_queue      JSONB;
    v_flash_queue   JSONB;
    v_members       JSONB;
    v_merchants     JSONB;
    v_transactions  JSONB;
    v_disputes      JSONB;
    v_gouging       JSONB;
    v_fraud         JSONB;
    v_withdrawals   JSONB;
    v_tickets       JSONB;
    v_partners      JSONB;
    v_admins_list   JSONB;
    v_audit_logs    JSONB;
    v_chain_broken  INT;
    v_adm_notifs    JSONB := '[]'::jsonb;
BEGIN
    v_admin_info := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    v_period_ym  := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));

    -- 1. فحص المطابقة الصفرية الحية على دفتر الأستاذ المزدوج (Zero-Discrepancy Gate — P0-7 / D23)
    SELECT COALESCE(SUM(debit_usd), 0.00), COALESCE(SUM(credit_usd), 0.00)
      INTO v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines;

    SELECT COUNT(*) INTO v_unbal_je
      FROM (
          SELECT journal_entry_id
            FROM sawyan.journal_lines
           GROUP BY journal_entry_id
          HAVING COALESCE(SUM(debit_usd), 0.00) <> COALESCE(SUM(credit_usd), 0.00)
      ) x;

    SELECT COUNT(*) INTO v_bad_pools
      FROM sawyan.pool_transactions pt
     WHERE ROUND((pt.total_distributed_usd + pt.rounding_diff_usd)::numeric, 2) <> pt.target_consumed_usd;

    SELECT COALESCE(jsonb_agg(row_to_json(tb)::jsonb ORDER BY tb.account_code ASC), '[]'::jsonb)
      INTO v_trial_bal
      FROM (
          SELECT coa.account_code,
                 coa.account_name_ar,
                 coa.account_name_en,
                 coa.normal_balance,
                 COALESCE(SUM(jl.debit_usd), 0.00) AS total_debit_usd,
                 COALESCE(SUM(jl.credit_usd), 0.00) AS total_credit_usd,
                 CASE WHEN coa.normal_balance = 'D'
                      THEN COALESCE(SUM(jl.debit_usd - jl.credit_usd), 0.00)
                      ELSE COALESCE(SUM(jl.credit_usd - jl.debit_usd), 0.00)
                 END AS net_balance_usd
            FROM sawyan.chart_of_accounts coa
            LEFT JOIN sawyan.journal_lines jl ON jl.account_code = coa.account_code
           GROUP BY coa.account_code, coa.account_name_ar, coa.account_name_en, coa.normal_balance
      ) tb;

    -- 2. المؤشرات السيادية الحية (KPIs)
    v_kpis := jsonb_build_object(
        'period_ym', v_period_ym,
        'members_total', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0),
        'members_active', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0 AND is_tombstone_banned = false AND is_active_in_tree = true),
        'members_pending_kyc', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0 AND kyc_status = 'pending'),
        'members_banned', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0 AND is_tombstone_banned = true),
        'members_with_root', (SELECT COUNT(*) FROM sawyan.members),
        'qualified_members_period', (SELECT COUNT(DISTINCT member_id) FROM sawyan.monthly_target_boxes WHERE period_ym = v_period_ym AND is_qualified = true),
        'merchants_total', (SELECT COUNT(*) FROM sawyan.merchants),
        'merchants_active', (SELECT COUNT(*) FROM sawyan.merchants WHERE is_active = true AND is_isolated = false),
        'merchants_isolated', (SELECT COUNT(*) FROM sawyan.merchants WHERE is_isolated = true),
        'transactions_total', (SELECT COUNT(*) FROM sawyan.transactions),
        'transactions_completed', (SELECT COUNT(*) FROM sawyan.transactions WHERE status = 'completed'),
        'transactions_pending', (SELECT COUNT(*) FROM sawyan.transactions WHERE status IN ('pending', 'awaiting_merchant_topup')),
        'transactions_awaiting_topup', (SELECT COUNT(*) FROM sawyan.transactions WHERE status = 'awaiting_merchant_topup'),
        'transactions_pending_review', (SELECT COUNT(*) FROM sawyan.transactions WHERE status = 'pending'),
        'awaiting_topup_gmv_usd', (SELECT COALESCE(ROUND(SUM(total_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM sawyan.transactions WHERE status = 'awaiting_merchant_topup'),
        'awaiting_topup_commission_usd', (SELECT COALESCE(ROUND(SUM(commission_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM sawyan.transactions WHERE status = 'awaiting_merchant_topup'),
        'gmv_local_completed', (SELECT COALESCE(SUM(total_amount), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'commission_local_completed', (SELECT COALESCE(SUM(commission_amount), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'gmv_usd_completed', (SELECT COALESCE(ROUND(SUM(total_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'commission_usd_completed', (SELECT COALESCE(ROUND(SUM(commission_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'gmv_and_commission_by_currency', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'currency_code', x.currency_code,
                'gmv_local', x.gmv_local,
                'commission_local', x.commission_local,
                'tx_count', x.tx_count
            ) ORDER BY x.currency_code)
            FROM (
                SELECT currency_code,
                       ROUND(SUM(total_amount)::numeric, 2) AS gmv_local,
                       ROUND(SUM(commission_amount)::numeric, 2) AS commission_local,
                       COUNT(*) AS tx_count
                  FROM sawyan.transactions
                 WHERE status = 'completed'
                 GROUP BY currency_code
            ) x
        ), '[]'::jsonb),
        'treasury_revenue_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code IN ('4101', '4102', '4103')),
        'plan_pool_liability_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code = '2201'),
        'merchant_prepaid_float_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code = '2101'),
        'member_wallets_payable_usd', (SELECT COALESCE(SUM(balance_usd), 0.00) FROM sawyan.wallets),
        's03_suspense_usd', (SELECT COALESCE(SUM(s03_suspense_balance_usd), 0.00) FROM sawyan.wallets),
        'rounding_4301_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code = '4301'),
        'pending_mc_requests', (SELECT COUNT(*) FROM sawyan.maker_checker_requests WHERE status = 'pending'),
        'open_disputes', (SELECT COUNT(*) FROM sawyan.dispute_tickets WHERE status IN ('awaiting_merchant_friendly', 'escalated_to_admin', 'appealed_72h')),
        'pending_gouging_reports', (SELECT COUNT(*) FROM sawyan.price_gouging_reports WHERE verification_status = 'pending'),
        'open_fraud_signals', (SELECT COUNT(*) FROM sawyan.fraud_graph_signals WHERE status IN ('open', 'payout_held')),
        'pending_withdrawals', (SELECT COUNT(*) FROM sawyan.wallet_transactions WHERE transaction_type = 'withdrawal' AND status = 'processing_payout'),
        'corporate_partners_count', (SELECT COUNT(*) FROM sawyan.partners WHERE is_active = true)
    );

    -- 3. بوابة الدول وجاهزية الامتثال (D13 / D18 / D19) + حصة الفرد المؤهل وديفولت S03 لكل دولة
    SELECT COALESCE(jsonb_agg(row_to_json(ct)::jsonb ORDER BY ct.is_active DESC, ct.country_code ASC), '[]'::jsonb)
      INTO v_countries
      FROM (
          SELECT c.id, c.country_code, c.country_name_i18n, c.currency_code, c.iana_timezone,
                 c.admin_fx_rate,
                 c.financial_stopper_usd, c.monthly_target_usd, c.compensatory_admin_fee_usd,
                 gs.s01_gens AS numerical_stopper_s01,
                 gs.s02_slots AS upline_ceiling_s02,
                 ((2::numeric ^ LEAST(gs.s01_gens, 40)) - 1) AS ideal_tree_nodes,
                 TRUNC(c.monthly_target_usd / gs.s02_slots, 2) AS unit_share_usd,
                 ROUND((((2::numeric ^ LEAST(gs.s01_gens, 40)) - 1) * TRUNC(c.monthly_target_usd / gs.s02_slots, 2))::numeric, 2) AS default_financial_stopper_usd,
                 c.vat_rate, c.wht_rate, c.payout_day, c.return_cutoff_day,
                 c.legal_opinion_verified, c.legal_opinion_doc_url, c.local_terms_version,
                 c.min_merchants_threshold, c.activation_notice_days, c.is_active, c.effective_from,
                 (SELECT COUNT(*) FROM sawyan.merchants m WHERE m.country_id = c.id AND m.is_active = true) AS active_merchants_count,
                 (SELECT COUNT(*) FROM sawyan.transactions t WHERE t.country_id = c.id AND t.status = 'completed') AS completed_tx_count,
                 (SELECT COUNT(*) FROM sawyan.members mem WHERE mem.residency_country_id = c.id AND mem.member_code > 0) AS resident_members_count
            FROM sawyan.countries c
            CROSS JOIN LATERAL (
                SELECT GREATEST(COALESCE(s.numerical_stopper_s01, 11), 1) AS s01_gens,
                       GREATEST(COALESCE(s.upline_ceiling_s02, 11), 1) AS s02_slots
                  FROM sawyan.settings s
                 WHERE s.country_id IS NULL
                 ORDER BY s.effective_from DESC, s.recorded_at DESC
                 LIMIT 1
            ) gs
      ) ct;

    -- 4. سجل المعاملات ثنائي الزمن (Bitemporal Settings — D28)
    SELECT COALESCE(jsonb_agg(row_to_json(st)::jsonb ORDER BY st.recorded_at DESC), '[]'::jsonb)
      INTO v_settings
      FROM (
          SELECT s.*, c.country_code
            FROM sawyan.settings s
            LEFT JOIN sawyan.countries c ON c.id = s.country_id
           ORDER BY s.recorded_at DESC
           LIMIT 15
      ) st;

    -- 5. دورات الإقفال الشهري ذات الـ 6 خطوات (D3 / D28)
    SELECT COALESCE(jsonb_agg(row_to_json(sc)::jsonb ORDER BY sc.period_ym DESC, sc.country_code ASC), '[]'::jsonb)
      INTO v_cycles
      FROM (
          SELECT cyc.*, c.country_code, c.currency_code,
                 am.full_name AS maker_name, ac.full_name AS checker_name,
                 (SELECT COUNT(*) FROM sawyan.pool_transactions pt WHERE pt.settlement_cycle_id = cyc.id) AS pools_count
            FROM sawyan.settlement_cycles cyc
            JOIN sawyan.countries c ON c.id = cyc.country_id
            LEFT JOIN sawyan.admins am ON am.id = cyc.maker_admin_id
            LEFT JOIN sawyan.admins ac ON ac.id = cyc.checker_admin_id
           ORDER BY cyc.period_ym DESC, cyc.id DESC
           LIMIT 25
      ) sc;

    -- 6. طابور الاعتماد المزدوج Maker-Checker (D20)
    SELECT COALESCE(jsonb_agg(row_to_json(mc)::jsonb ORDER BY mc.created_at DESC), '[]'::jsonb)
      INTO v_mc_queue
      FROM (
          SELECT r.*,
                 am.full_name AS maker_name, am.role AS maker_role,
                 ac.full_name AS checker_name, ac.role AS checker_role
            FROM sawyan.maker_checker_requests r
            JOIN sawyan.admins am ON am.id = r.maker_admin_id
            LEFT JOIN sawyan.admins ac ON ac.id = r.checker_admin_id
           ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
           LIMIT 40
      ) mc;

    -- 7. طابور مراجعة العروض الخاطفة للتجار (Point 12)
    SELECT COALESCE(jsonb_agg(row_to_json(fo)::jsonb ORDER BY fo.created_at DESC), '[]'::jsonb)
      INTO v_flash_queue
      FROM (
          SELECT n.id, n.event_name, n.payload, n.created_at
            FROM sawyan.notifications n
           WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
           ORDER BY CASE WHEN n.event_name = 'MerchantFlashOfferPending' THEN 0 ELSE 1 END, n.created_at DESC
           LIMIT 20
      ) fo;

    -- 8. قائمة الأعضاء وحالة التأهل والمحافظ والـ KYC
    SELECT COALESCE(jsonb_agg(row_to_json(mm)::jsonb ORDER BY mm.member_code ASC), '[]'::jsonb)
      INTO v_members
      FROM (
          SELECT m.id, m.member_code, m.full_name, m.email, m.phone, m.placement_side,
                 m.generation_in_tree, m.is_active_in_tree, m.is_tombstone_banned,
                 m.kyc_status, m.payout_cooldown_until, m.status, m.created_at,
                 c.country_code AS residency_country_code,
                 sp.member_code AS sponsor_code,
                 pr.member_code AS parent_code,
                 COALESCE(w.balance_usd, 0.00) AS wallet_balance_usd,
                 COALESCE(w.total_earned_usd, 0.00) AS total_earned_usd,
                 COALESCE(w.s03_suspense_balance_usd, 0.00) AS s03_suspense_usd,
                 COALESCE(tb.current_month_purchases_usd, 0.000000) AS current_purchases_usd,
                 COALESCE(tb.carry_on_in_usd, 0.000000) AS carry_on_in_usd,
                 COALESCE(tb.carry_on_out_usd, 0.000000) AS carry_on_out_usd,
                 COALESCE(tb.is_qualified, false) AS is_qualified_period
            FROM sawyan.members m
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            LEFT JOIN sawyan.members sp ON sp.id = m.sponsor_id
            LEFT JOIN sawyan.members pr ON pr.id = m.parent_member_id
            LEFT JOIN sawyan.wallets w ON w.member_id = m.id
            LEFT JOIN sawyan.monthly_target_boxes tb
                   ON tb.member_id = m.id AND tb.country_id = m.residency_country_id AND tb.period_ym = v_period_ym
           ORDER BY m.member_code ASC
           LIMIT 60
      ) mm;

    -- 9. قائمة التجار وأرصدة الشحن والعزل وطابور FIFO
    SELECT COALESCE(jsonb_agg(row_to_json(mr)::jsonb ORDER BY mr.created_at DESC), '[]'::jsonb)
      INTO v_merchants
      FROM (
          SELECT m.id, m.merchant_code, m.business_name, m.owner_name, m.email, m.phone,
                 m.category, m.merchant_type, m.deduction_percent, m.package_base_amount,
                 m.actual_cash_balance, m.soft_hold_balance, m.credit_limit,
                 m.is_isolated, m.is_active, m.tax_registration_no, m.created_at,
                 c.country_code, c.currency_code,
                 CASE WHEN GREATEST(m.package_base_amount, m.credit_limit) > 0
                      THEN ROUND((((m.actual_cash_balance - m.soft_hold_balance + m.credit_limit) / GREATEST(m.package_base_amount, m.credit_limit)) * 100.0)::numeric, 2)
                      ELSE 0.00 END AS free_balance_pct,
                 (SELECT COUNT(*) FROM sawyan.merchant_branches mb WHERE mb.merchant_id = m.id) AS branches_count,
                 (SELECT COUNT(*) FROM sawyan.transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS ops_count,
                 (SELECT COUNT(*) FROM sawyan.transactions t WHERE t.merchant_id = m.id AND t.status = 'awaiting_merchant_topup') AS fifo_queue_count,
                 (SELECT COALESCE(SUM(t.total_amount), 0.00) FROM sawyan.transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS gmv_completed,
                 NULLIF(m.metadata->>'logo_url', '') AS logo_url,
                 NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
                 CASE WHEN jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images,
                 COALESCE(m.metadata->'kyc_docs', '{}'::jsonb) AS kyc_docs
            FROM sawyan.merchants m
            JOIN sawyan.countries c ON c.id = m.country_id
           ORDER BY m.created_at DESC
           LIMIT 50
      ) mr;

    -- 10. الفواتير والعمليات والفوترة الضريبية B2B
    SELECT COALESCE(jsonb_agg(row_to_json(tx)::jsonb ORDER BY tx.created_at DESC), '[]'::jsonb)
      INTO v_transactions
      FROM (
          SELECT t.id, t.sw_short_code, t.unique_payment_ref, t.amount, t.total_amount,
                 t.commission_amount, t.company_share, t.income_plan_share_local,
                 t.income_plan_share_usd, t.vat_amount, t.currency_code, t.fx_rate_used,
                 c.country_code, t.payment_type, t.status, t.receipt_media_url, t.fifo_seq,
                 t.completed_at, t.reversed_at, t.created_at,
                 (t.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                 mem.member_code, mem.full_name AS member_name,
                 mer.merchant_code, mer.business_name AS merchant_name,
                 mb.branch_name,
                 bti.invoice_number AS b2b_invoice_number
            FROM sawyan.transactions t
            JOIN sawyan.countries c ON c.id = t.country_id
            JOIN sawyan.members mem ON mem.id = t.member_id
            JOIN sawyan.merchants mer ON mer.id = t.merchant_id
            LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
            LEFT JOIN sawyan.b2b_tax_invoices bti ON bti.transaction_id = t.id AND bti.document_type = 'tax_invoice'
           ORDER BY t.created_at DESC
           LIMIT 60
      ) tx;

    -- 11. تذاكر النزاعات الثلاثية (D6 + Option 1-A فرز التأهل) وبلاغات رفع الأسعار (S10) وكاشف الغش الشبكي
    SELECT COALESCE(jsonb_agg(row_to_json(dp)::jsonb ORDER BY dp.is_qualification_breaking DESC, dp.created_at DESC), '[]'::jsonb)
      INTO v_disputes
      FROM (
          SELECT d.*, t.sw_short_code, t.total_amount, t.currency_code, t.status AS tx_status,
                 c.country_code AS tx_country_code,
                 COALESCE(t.commission_snapshot->>'effective_period_ym',
                          to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')) AS dispute_period_ym,
                 ROUND(t.income_plan_share_usd::numeric, 2) AS income_plan_share_usd,
                 mem.member_code, mem.full_name AS member_name,
                 mer.merchant_code, mer.business_name AS merchant_name,
                 ROUND((EXTRACT(EPOCH FROM (d.sla_deadline_at - sawyan.now_utc())) / 3600.0)::numeric, 1) AS sla_hours_left,
                 (
                     t.status = 'completed'
                     AND d.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
                     AND d.dispute_category IN ('return_stalled', 'merchant_return_escalation')
                     AND mb.id IS NOT NULL
                     AND (mb.carry_on_in_usd + mb.current_month_purchases_usd) >= mb.target_required_usd
                     AND ((mb.carry_on_in_usd + mb.current_month_purchases_usd) - COALESCE(open_sum.disputed_usd, t.income_plan_share_usd)) < mb.target_required_usd
                 ) AS is_qualification_breaking,
                 CASE
                     WHEN t.status = 'completed'
                      AND d.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
                      AND d.dispute_category IN ('return_stalled', 'merchant_return_escalation')
                      AND mb.id IS NOT NULL
                      AND (mb.carry_on_in_usd + mb.current_month_purchases_usd) >= mb.target_required_usd
                      AND ((mb.carry_on_in_usd + mb.current_month_purchases_usd) - COALESCE(open_sum.disputed_usd, t.income_plan_share_usd)) < mb.target_required_usd
                     THEN ROUND(COALESCE(
                         (SELECT SUM(pt.members_share_usd) FROM sawyan.pool_transactions pt WHERE pt.target_box_id = mb.id),
                         mb.target_required_usd * 0.70
                     )::numeric, 2)
                     ELSE 0.00
                 END AS estimated_commission_at_stake_usd
            FROM sawyan.dispute_tickets d
            JOIN sawyan.transactions t ON t.id = d.transaction_id
            JOIN sawyan.countries c ON c.id = t.country_id
            JOIN sawyan.members mem ON mem.id = d.member_id
            JOIN sawyan.merchants mer ON mer.id = d.merchant_id
            LEFT JOIN sawyan.monthly_target_boxes mb
              ON mb.member_id = t.member_id
             AND mb.country_id = t.country_id
             AND mb.period_ym = COALESCE(
                     t.commission_snapshot->>'effective_period_ym',
                     to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')
                 )
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(t2.income_plan_share_usd), 0.000000) AS disputed_usd
                  FROM sawyan.dispute_tickets d2
                  JOIN sawyan.transactions t2 ON t2.id = d2.transaction_id
                  JOIN sawyan.countries c2 ON c2.id = t2.country_id
                 WHERE d2.member_id = t.member_id
                   AND t2.country_id = t.country_id
                   AND t2.status = 'completed'
                   AND d2.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
                   AND d2.dispute_category IN ('return_stalled', 'merchant_return_escalation')
                   AND COALESCE(t2.commission_snapshot->>'effective_period_ym',
                                to_char(COALESCE(t2.completed_at, t2.created_at) AT TIME ZONE c2.iana_timezone, 'YYYY-MM')) = COALESCE(
                                    t.commission_snapshot->>'effective_period_ym',
                                    to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')
                                )
            ) open_sum ON true
           ORDER BY is_qualification_breaking DESC, d.created_at DESC
           LIMIT 50
      ) dp;

    SELECT COALESCE(jsonb_agg(row_to_json(pg)::jsonb ORDER BY pg.created_at DESC), '[]'::jsonb)
      INTO v_gouging
      FROM (
          SELECT p.*, t.sw_short_code,
                 mem.member_code, mem.full_name AS member_name,
                 mer.merchant_code, mer.business_name AS merchant_name
            FROM sawyan.price_gouging_reports p
            JOIN sawyan.transactions t ON t.id = p.transaction_id
            JOIN sawyan.members mem ON mem.id = p.member_id
            JOIN sawyan.merchants mer ON mer.id = p.merchant_id
           ORDER BY p.created_at DESC
           LIMIT 30
      ) pg;

    SELECT COALESCE(jsonb_agg(row_to_json(fg)::jsonb ORDER BY fg.created_at DESC), '[]'::jsonb)
      INTO v_fraud
      FROM (
          SELECT f.*, mer.merchant_code, mer.business_name AS merchant_name
            FROM sawyan.fraud_graph_signals f
            LEFT JOIN sawyan.merchants mer ON mer.id = f.involved_merchant_id
           ORDER BY f.created_at DESC
           LIMIT 30
      ) fg;

    -- 12. طلبات السحب النقدي للأعضاء (D7 / W05 / W07) وتذاكر الدعم الفني
    SELECT COALESCE(jsonb_agg(row_to_json(wd)::jsonb ORDER BY wd.created_at DESC), '[]'::jsonb)
      INTO v_withdrawals
      FROM (
          SELECT wt.id, wt.amount_usd, wt.local_amount, wt.currency_code, wt.fx_rate_used,
                 wt.status, wt.created_at, wt.reference_id,
                 mem.id AS member_id, mem.member_code, mem.full_name AS member_name,
                 mem.kyc_status, mem.payout_cooldown_until
            FROM sawyan.wallet_transactions wt
            JOIN sawyan.wallets w ON w.id = wt.wallet_id
            JOIN sawyan.members mem ON mem.id = w.member_id
           WHERE wt.transaction_type = 'withdrawal'
           ORDER BY wt.created_at DESC
           LIMIT 30
      ) wd;

    SELECT COALESCE(jsonb_agg(row_to_json(st)::jsonb ORDER BY st.created_at DESC), '[]'::jsonb)
      INTO v_tickets
      FROM (
          SELECT s.*
            FROM sawyan.support_tickets s
           ORDER BY s.created_at DESC
           LIMIT 30
      ) st;

    -- 13. سجل شركاء الشركة الفعليين داخل الإدارة فقط (D24 Corporate Partners)
    SELECT COALESCE(jsonb_agg(row_to_json(pt)::jsonb ORDER BY pt.created_at DESC), '[]'::jsonb)
      INTO v_partners
      FROM (
          SELECT p.id, p.partner_code, p.full_name, p.email, p.phone,
                 p.partnership_scope, p.scope_targets, p.profit_basis,
                 p.profit_share_pct, p.contract_ref, p.is_active, p.created_at
            FROM sawyan.partners p
           ORDER BY p.created_at DESC
      ) pt;

    -- 14. قائمة الإداريين وسجل التدقيق غير القابل للمحو مع فحص سلسلة التجزئة SHA-256
    SELECT COALESCE(jsonb_agg(row_to_json(ad)::jsonb ORDER BY ad.created_at ASC), '[]'::jsonb)
      INTO v_admins_list
      FROM (
          SELECT a.id, a.full_name, a.email, a.role, a.must_change_password,
                 a.two_factor_enabled, a.is_active, a.last_login_at, a.created_at
            FROM sawyan.admins a
           ORDER BY a.created_at ASC
      ) ad;

    SELECT COUNT(*) INTO v_chain_broken
      FROM (
          SELECT id, prev_row_hash,
                 LAG(row_hash) OVER (ORDER BY id ASC) AS expected_prev
            FROM sawyan.audit_logs
      ) ch
     WHERE ch.expected_prev IS NOT NULL AND ch.prev_row_hash IS DISTINCT FROM ch.expected_prev;

    SELECT COALESCE(jsonb_agg(row_to_json(al)::jsonb ORDER BY al.id DESC), '[]'::jsonb)
      INTO v_audit_logs
      FROM (
          SELECT l.id, l.actor_type, l.actor_id, l.action, l.table_name,
                 l.record_id, l.recorded_at, l.prev_row_hash, l.row_hash
            FROM sawyan.audit_logs l
           ORDER BY l.id DESC
           LIMIT 35
      ) al;

    SELECT COALESCE(jsonb_agg(row_to_json(an)::jsonb ORDER BY an.is_read ASC, an.created_at DESC), '[]'::jsonb)
      INTO v_adm_notifs
      FROM (
          SELECT n.id,
                 n.recipient_id,
                 n.event_name,
                 COALESCE(n.payload, '{}'::jsonb) - 'receipt_image_data' AS payload,
                 n.is_read,
                 n.created_at
            FROM sawyan.notifications n
           WHERE n.recipient_type = 'admin'
             AND n.event_name NOT IN ('MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
           ORDER BY n.is_read ASC, n.created_at DESC
           LIMIT 40
      ) an;

    RETURN jsonb_build_object(
        'admin', v_admin_info,
        'admin_notifications', v_adm_notifs,
        'kpis', v_kpis,
        'zero_discrepancy', jsonb_build_object(
            'total_debit_usd', v_sum_dr,
            'total_credit_usd', v_sum_cr,
            'ledger_diff_usd', v_sum_dr - v_sum_cr,
            'unbalanced_entries_count', v_unbal_je,
            'pool_mismatch_count', v_bad_pools,
            'is_zero_discrepancy_intact', (v_sum_dr = v_sum_cr AND v_unbal_je = 0 AND v_bad_pools = 0),
            'trial_balance', v_trial_bal
        ),
        'countries', v_countries,
        'settings', v_settings,
        'settlement_cycles', v_cycles,
        'maker_checker_queue', v_mc_queue,
        'flash_offers_queue', v_flash_queue,
        'members', v_members,
        'merchants', v_merchants,
        'transactions', v_transactions,
        'disputes', v_disputes,
        'price_gouging_reports', v_gouging,
        'fraud_signals', v_fraud,
        'withdrawals', v_withdrawals,
        'support_tickets', v_tickets,
        'partners', v_partners,
        'admins', v_admins_list,
        'audit_chain', jsonb_build_object(
            'is_hash_chain_intact', (v_chain_broken = 0),
            'broken_links_count', v_chain_broken,
            'recent_logs', v_audit_logs
        )
    );
END;
$function$;

-- 12. Admin Search & Reply Ops (mark notifications read + authoritative SLA/self-purchase flags)
CREATE OR REPLACE FUNCTION sawyan.admin_search_and_reply_ops(p_admin_id uuid, p_session_token text, p_action character varying, p_entity character varying DEFAULT 'members'::character varying, p_query text DEFAULT NULL::text, p_record_id uuid DEFAULT NULL::uuid, p_reply_text text DEFAULT NULL::text, p_new_status character varying DEFAULT 'closed'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_adm          JSONB;
    v_scope        VARCHAR(10);
    v_q            TEXT;
    v_results      JSONB := '[]'::jsonb;
    v_can_view_kyc BOOLEAN := false;
    v_viewed_cnt   INT := 0;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, (lower(trim(p_action)) NOT IN ('search', 'mark_notification_read', 'mark_all_notifications_read')));
    SELECT COALESCE(metadata->>'country_scope', 'GLOBAL') INTO v_scope FROM sawyan.admins WHERE id = p_admin_id;
    v_q := lower(trim(COALESCE(p_query, '')));
    v_can_view_kyc := COALESCE(v_adm->>'role', '') IN ('kyc_officer', 'approver', 'reviewer', 'auditor');

    IF lower(trim(p_action)) = 'mark_notification_read' THEN
        IF p_record_id IS NOT NULL THEN
            UPDATE sawyan.notifications
               SET is_read = true
             WHERE id = p_record_id
               AND recipient_type = 'admin';
        END IF;
        RETURN jsonb_build_object('status', 'ok', 'action', 'mark_notification_read', 'record_id', p_record_id);
    END IF;

    IF lower(trim(p_action)) = 'mark_all_notifications_read' THEN
        UPDATE sawyan.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND is_read = false;
        RETURN jsonb_build_object('status', 'ok', 'action', 'mark_all_notifications_read');
    END IF;

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
                     tx.soft_hold_expires_at,
                     tx.commission_snapshot->>'effective_period_ym' AS effective_period_ym,
                     (tx.status = 'pending' AND tx.created_at <= now() - (COALESCE((SELECT pending_sla_hours FROM sawyan.settings WHERE country_id IS NULL ORDER BY effective_from DESC, recorded_at DESC LIMIT 1), 48) || ' hours')::interval) AS is_sla_escalated,
                     ((mer.owner_member_id IS NOT NULL AND mer.owner_member_id = tx.member_id)
                      OR (lower(COALESCE(mer.email, '')) NOT LIKE '%.demo'
                          AND ((NULLIF(trim(COALESCE(mer.phone, '')), '') IS NOT NULL AND mer.phone = mem.phone)
                               OR (NULLIF(lower(trim(COALESCE(mer.email, ''))), '') IS NOT NULL AND lower(mer.email) = lower(mem.email))))) AS is_self_purchase_flag,
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
$function$;

-- 13. Persistent Authenticated Mark-as-Read RPC for Member / Merchant / Admin Bells
CREATE OR REPLACE FUNCTION sawyan.mark_actor_notifications_read(
    p_actor_type      VARCHAR(20),
    p_actor_id        UUID,
    p_session_token   TEXT,
    p_notification_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_type VARCHAR(20);
    v_cnt  INT := 0;
BEGIN
    v_type := lower(trim(COALESCE(p_actor_type, '')));
    IF v_type = 'merchant' THEN
        PERFORM sawyan.verify_merchant_session(p_actor_id, p_session_token);
        UPDATE sawyan.notifications
           SET is_read = true
         WHERE recipient_type = 'merchant'
           AND recipient_id = p_actor_id
           AND (p_notification_id IS NULL OR id = p_notification_id)
           AND is_read = false;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
    ELSIF v_type = 'member' THEN
        PERFORM sawyan.verify_member_session(p_actor_id, p_session_token);
        UPDATE sawyan.notifications
           SET is_read = true
         WHERE recipient_type = 'member'
           AND recipient_id = p_actor_id
           AND (p_notification_id IS NULL OR id = p_notification_id)
           AND is_read = false;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
    ELSIF v_type = 'admin' THEN
        PERFORM sawyan.verify_admin_session(p_actor_id, p_session_token, NULL, false);
        UPDATE sawyan.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND (p_notification_id IS NULL OR id = p_notification_id)
           AND is_read = false;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'INVALID_NOTIFICATION_ACTOR_TYPE: %', p_actor_type;
    END IF;

    RETURN jsonb_build_object('ok', true, 'actor_type', v_type, 'marked_count', v_cnt);
END;
$function$;

REVOKE ALL ON FUNCTION sawyan.mark_actor_notifications_read(VARCHAR, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.mark_actor_notifications_read(VARCHAR, UUID, TEXT, UUID) TO anon, authenticated, service_role;

-- 14. Idempotent Data Backfill & Live Flag Re-Sync
DO $$
DECLARE
    v_m RECORD;
    v_last_tp TIMESTAMPTZ;
    v_deriv_d4 TIMESTAMPTZ;
    v_eff JSONB;
BEGIN
    -- A) Auto-link owner_member_id on existing non-demo merchants matching an active member
    UPDATE sawyan.merchants m
       SET owner_member_id = (
           SELECT mem.id
             FROM sawyan.members mem
            WHERE mem.member_code > 0
              AND mem.is_tombstone_banned = false
              AND (
                  (NULLIF(trim(COALESCE(m.phone, '')), '') IS NOT NULL AND mem.phone = m.phone)
                  OR (NULLIF(lower(trim(COALESCE(m.email, ''))), '') IS NOT NULL AND lower(mem.email) = lower(m.email))
              )
            ORDER BY mem.created_at ASC
            LIMIT 1
       )
     WHERE m.owner_member_id IS NULL
       AND lower(COALESCE(m.email, '')) NOT LIKE '%.demo';

    -- B) Backfill missing d4_debt_started_at for merchants already in negative D4 balance
    FOR v_m IN
        SELECT id, created_at
          FROM sawyan.merchants
         WHERE credit_limit > 0
           AND actual_cash_balance < 0
           AND NULLIF(trim(COALESCE(metadata->>'d4_debt_started_at', '')), '') IS NULL
    LOOP
        SELECT MAX(je.posted_at) INTO v_last_tp
          FROM sawyan.journal_entries je
         WHERE je.source_type = 'MERCHANT_TOPUP'
           AND je.source_id = v_m.id;

        SELECT MIN(COALESCE(tx.completed_at, tx.created_at)) INTO v_deriv_d4
          FROM sawyan.transactions tx
         WHERE tx.merchant_id = v_m.id
           AND tx.status = 'completed'
           AND (v_last_tp IS NULL OR COALESCE(tx.completed_at, tx.created_at) >= v_last_tp);

        UPDATE sawyan.merchants
           SET metadata = COALESCE(metadata, '{}'::jsonb)
                          || jsonb_build_object('d4_debt_started_at', COALESCE(v_deriv_d4, v_m.created_at, sawyan.now_utc()))
         WHERE id = v_m.id;
    END LOOP;

    -- C) Re-sync lifecycle flags for all merchants & backfill missing onboarding/registration notifications (last 7d non-demo)
    FOR v_m IN
        SELECT m.id, m.merchant_code, m.business_name, m.owner_name, m.category,
               m.deduction_percent, m.onboarding_status, m.email, m.created_at,
               c.country_code
          FROM sawyan.merchants m
          JOIN sawyan.countries c ON c.id = m.country_id
    LOOP
        v_eff := sawyan.sync_merchant_status_flags(v_m.id);

        IF v_m.created_at >= now() - interval '7 days'
           AND lower(COALESCE(v_m.email, '')) NOT LIKE '%.demo'
        THEN
            IF NOT EXISTS (
                SELECT 1 FROM sawyan.notifications n
                 WHERE n.recipient_type = 'admin'
                   AND n.recipient_id = v_m.id
                   AND n.event_name = 'NewMerchantRegistered'
            ) THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'admin', v_m.id, 'NewMerchantRegistered', 'in_app',
                    jsonb_build_object(
                        'merchant_id', v_m.id,
                        'merchant_code', v_m.merchant_code,
                        'business_name', v_m.business_name,
                        'owner_name', v_m.owner_name,
                        'country_code', v_m.country_code,
                        'category', v_m.category,
                        'deduction_percent', v_m.deduction_percent,
                        'onboarding_status', v_m.onboarding_status
                    ),
                    v_m.created_at
                );
            END IF;

            IF v_m.onboarding_status = 'approved'
               AND (v_eff->>'financial_status') = 'unfunded'
               AND NOT EXISTS (
                   SELECT 1 FROM sawyan.notifications n
                    WHERE n.recipient_type = 'merchant'
                      AND n.recipient_id = v_m.id
                      AND n.event_name = 'MerchantOnboardingApproved'
               )
            THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'merchant', v_m.id, 'MerchantOnboardingApproved', 'in_app',
                    jsonb_build_object(
                        'merchant_id', v_m.id,
                        'merchant_code', v_m.merchant_code,
                        'business_name', v_m.business_name,
                        'onboarding_status', 'approved',
                        'financial_status', 'unfunded',
                        'needs_topup', true,
                        'title', '✅ تم اعتماد متجرك بياناتياً في SAWYAN',
                        'message', 'مبروك! تم قبول بيانات متجرك (' || v_m.merchant_code || '). الخطوة الأخيرة: اضغط «اشحن رصيدك الآن» ليظهر متجرك في الدليل وتفتح شاشة الكاشير.'
                    ),
                    now()
                );
            END IF;
        END IF;
    END LOOP;
END;
$$;
