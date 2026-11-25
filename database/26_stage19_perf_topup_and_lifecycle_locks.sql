-- ============================================================================
-- SAWYAN V3.0 — Stage 19: Tree Performance Optimization, Configurable Optional
-- Merchant Top-Up Proof Policy, Anti-Duplicate Guards & Dashboard Timeout Locks
-- File: database/26_stage19_perf_topup_and_lifecycle_locks.sql
-- Idempotent & Dual-Schema Safe (`sawyan` & `sawyan_demo`)
-- ============================================================================

-- 1. Extend admin_toggle_kill_switch to allow toggling REQUIRE_TOPUP_PROOF
--    (default false = merchants may notify SAWYAN of top-ups with amount only;
--     founder can flip to true anytime from Admin Settings -> Break-Glass/Policies)
CREATE OR REPLACE FUNCTION sawyan.admin_toggle_kill_switch(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_switch_key    VARCHAR,
    p_enabled       BOOLEAN,
    p_reason        TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_adm         JSONB;
    v_key         TEXT := upper(trim(COALESCE(p_switch_key, '')));
    v_reason      TEXT := trim(COALESCE(p_reason, ''));
    v_settings_id INT;
    v_old_sw      JSONB;
    v_new_sw      JSONB;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance'], true);

    IF v_key NOT IN ('K_REG', 'K_TX', 'K_WD', 'K_PAY', 'K_CLOSE', 'REQUIRE_TOPUP_PROOF') THEN
        RAISE EXCEPTION 'INVALID_KILL_SWITCH_KEY: %', v_key;
    END IF;

    IF length(v_reason) < 5 THEN
        RAISE EXCEPTION 'BREAK_GLASS_REASON_REQUIRED: Mandatory reason (>= 5 chars) required.';
    END IF;

    SELECT id, operational_kill_switches
      INTO v_settings_id, v_old_sw
      FROM sawyan.settings
     WHERE country_id IS NULL
     ORDER BY effective_from DESC, recorded_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_settings_id IS NULL THEN
        RAISE EXCEPTION 'GLOBAL_SETTINGS_ROW_MISSING';
    END IF;

    v_new_sw := COALESCE(v_old_sw, '{"K_REG":false,"K_TX":false,"K_WD":false,"K_PAY":false,"K_CLOSE":false,"REQUIRE_TOPUP_PROOF":false}'::jsonb)
             || jsonb_build_object(v_key, COALESCE(p_enabled, false));

    UPDATE sawyan.settings
       SET operational_kill_switches = v_new_sw,
           recorded_at = now()
     WHERE id = v_settings_id;

    PERFORM sawyan.append_audit_log(
        'admin',
        p_admin_id,
        CASE WHEN COALESCE(p_enabled, false) THEN 'break_glass_kill_switch_enabled' ELSE 'break_glass_kill_switch_disabled' END,
        'settings',
        v_settings_id::text,
        jsonb_build_object(v_key, COALESCE((v_old_sw->>v_key)::boolean, false)),
        jsonb_build_object(v_key, COALESCE(p_enabled, false), 'reason', v_reason, 'actor_role', v_adm->>'role')
    );

    RETURN jsonb_build_object(
        'success', true,
        'switch_key', v_key,
        'enabled', COALESCE(p_enabled, false),
        'operational_kill_switches', v_new_sw
    );
END;
$function$;

-- 2. Harden merchant_initiate_topup:
--    - Respects settings.operational_kill_switches->>'REQUIRE_TOPUP_PROOF' (default false)
--    - When false (temporary launch flexibility): accepts amount-only notice without receipt/ref
--    - When true: enforces bank ref (>=3 chars) OR receipt attachment at DB level
--    - Always blocks accidental duplicate identical-amount submissions within 120 seconds
--      and duplicate explicit bank reference numbers for the same merchant.
CREATE OR REPLACE FUNCTION sawyan.merchant_initiate_topup(
    p_merchant_id        UUID,
    p_amount             NUMERIC,
    p_provider           VARCHAR DEFAULT 'bank_transfer'::character varying,
    p_payment_ref        VARCHAR DEFAULT NULL::character varying,
    p_idempotency_key    UUID DEFAULT NULL::uuid,
    p_session_token      TEXT DEFAULT NULL::text,
    p_receipt_image_data TEXT DEFAULT NULL::text,
    p_receipt_note       TEXT DEFAULT NULL::text
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_merch         sawyan.merchants%ROWTYPE;
    v_idem          UUID;
    v_raw_ref       TEXT := trim(COALESCE(p_payment_ref, ''));
    v_ref           VARCHAR(120);
    v_fifo_res      JSONB;
    v_maker_id      UUID;
    v_req_id        UUID;
    v_rec_img       TEXT;
    v_note          TEXT;
    v_require_proof BOOLEAN := false;
    v_is_notice     BOOLEAN := false;
    v_dup_exists    BOOLEAN := false;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'POSITIVE_TOPUP_AMOUNT_REQUIRED';
    END IF;

    SELECT COALESCE((s.operational_kill_switches->>'REQUIRE_TOPUP_PROOF')::boolean, false)
      INTO v_require_proof
      FROM sawyan.settings s
     WHERE s.country_id IS NULL
     ORDER BY s.effective_from DESC, s.recorded_at DESC
     LIMIT 1;

    v_rec_img   := sawyan.validate_attachment_data(p_receipt_image_data, 480000, true);
    v_note      := left(trim(COALESCE(p_receipt_note, '')), 500);
    v_is_notice := (v_raw_ref = '' AND v_rec_img IS NULL);

    IF COALESCE(v_require_proof, false) AND length(v_raw_ref) < 3 AND v_rec_img IS NULL THEN
        RAISE EXCEPTION 'TOPUP_PROOF_OR_REF_REQUIRED: Bank reference (>=3 chars) or receipt image is currently mandatory.';
    END IF;

    v_idem := COALESCE(p_idempotency_key, gen_random_uuid());
    v_ref  := CASE
        WHEN v_raw_ref <> '' THEN left(v_raw_ref, 120)
        WHEN v_is_notice     THEN 'NOTICE-' || upper(substr(replace(v_idem::text, '-', ''), 1, 8))
        ELSE 'TOP-' || upper(substr(replace(v_idem::text, '-', ''), 1, 8))
    END;

    IF v_merch.email LIKE '%@merchant.demo' OR v_merch.email LIKE '%@sawyan.demo' THEN
        v_fifo_res := sawyan.process_merchant_topup_fifo(v_merch.id, p_amount, v_ref, v_idem, 0.00, COALESCE(p_provider, 'demo_sandbox'));
        RETURN jsonb_build_object('success', true, 'mode', 'demo_instant_fifo', 'topup_result', v_fifo_res, 'payment_ref', v_ref, 'is_notice_only', v_is_notice);
    END IF;

    -- Guard 1: Prevent duplicate explicit bank reference on active/approved requests
    IF v_raw_ref <> '' THEN
        SELECT EXISTS (
            SELECT 1
              FROM sawyan.maker_checker_requests mc
             WHERE mc.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION'
               AND mc.target_id = v_merch.id::text
               AND mc.status IN ('pending', 'approved')
               AND lower(trim(COALESCE(mc.payload_after->>'payment_ref', ''))) = lower(v_raw_ref)
        ) INTO v_dup_exists;
        IF v_dup_exists THEN
            RAISE EXCEPTION 'DUPLICATE_PAYMENT_REFERENCE: This bank transfer reference was already submitted.';
        END IF;
    END IF;

    -- Guard 2: Prevent accidental double-click identical-amount duplicate within 120 seconds
    SELECT EXISTS (
        SELECT 1
          FROM sawyan.maker_checker_requests mc
         WHERE mc.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION'
           AND mc.target_id = v_merch.id::text
           AND mc.status = 'pending'
           AND ROUND(COALESCE((mc.payload_after->>'amount')::numeric, 0), 2) = ROUND(p_amount::numeric, 2)
           AND mc.created_at >= now() - interval '120 seconds'
    ) INTO v_dup_exists;
    IF v_dup_exists THEN
        RAISE EXCEPTION 'DUPLICATE_TOPUP_NOTICE_COOLDOWN: An identical pending top-up request was just submitted. Please wait 2 minutes before submitting again.';
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
                'is_notice_only', v_is_notice,
                'idempotency_key', v_idem
            ),
            CASE
                WHEN v_is_notice THEN 'إشعار شحن رصيد من التاجر (بدون مرفق مؤقتاً) — ' || v_ref
                ELSE 'طلب شحن رصيد متجر عبر التحويل البنكي — مرجع ' || v_ref
            END,
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
            'is_notice_only', v_is_notice,
            'verification_request_id', v_req_id,
            'submitted_at', now()
        )
    );

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch.id, 'merchant_topup_verification_submitted', 'merchants', v_merch.id::text,
        NULL, jsonb_build_object('amount', p_amount, 'provider', p_provider, 'payment_ref', v_ref, 'has_receipt', (v_rec_img IS NOT NULL), 'is_notice_only', v_is_notice)
    );

    RETURN jsonb_build_object(
        'success', true,
        'mode', 'pending_bank_or_webhook_verification',
        'verification_request_id', v_req_id,
        'payment_ref', v_ref,
        'is_notice_only', v_is_notice
    );
END;
$function$;

-- 3. Optimized get_tree_analytics_with_country_lens (eliminates 3*N tree_closure subqueries & N countries lookups)
CREATE OR REPLACE FUNCTION sawyan.get_tree_analytics_with_country_lens(p_viewer_member_id uuid, p_period_ym character, p_country_code character DEFAULT NULL::bpchar)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET statement_timeout TO '12s'
AS $function$
DECLARE
    v_run_id            UUID := gen_random_uuid();
    v_viewer_gen        INT;
    v_viewer_cid        INT;
    v_viewer_right_id   UUID;
    v_viewer_left_id    UUID;
    v_s01               INT := 11;
    v_s02               INT := 11;
    v_company_pct       NUMERIC(5,2) := 25.00;
    v_w09_phone_gen     INT := 10;
    v_lens_cid          INT := NULL;
    v_lens_curr         CHAR(3) := NULL;
    v_lens_fx           NUMERIC(18,6) := NULL;
    v_rec               RECORD;
    v_parent_out        INT;
    v_parent_res        BOOLEAN;
    v_my_rank           INT;
    v_my_out            INT;
    v_my_res            BOOLEAN;
    v_nodes_json        JSONB;
    v_reserve_cnt       INT := 0;
    v_comm_cnt          INT := 0;
    v_total_team        INT := 0;
    v_left_arm_cnt      INT := 0;
    v_right_arm_cnt     INT := 0;
    v_actual_usd        NUMERIC(18,2) := 0.00;
    v_exp_orange_usd    NUMERIC(18,2) := 0.00;
    v_country_reports   JSONB := '[]'::jsonb;
    v_next_preview      JSONB := NULL;
    v_next_parent       sawyan.members%ROWTYPE;
    v_next_side         VARCHAR(12);
    v_bfs_right_cnt     BIGINT := 0;
    v_bfs_left_cnt      BIGINT := 0;
BEGIN
    SELECT generation_in_tree, residency_country_id, right_child_id, left_child_id
      INTO v_viewer_gen, v_viewer_cid, v_viewer_right_id, v_viewer_left_id
      FROM sawyan.members
     WHERE id = p_viewer_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VIEWER_NOT_FOUND';
    END IF;

    SELECT numerical_stopper_s01, upline_ceiling_s02, company_percent
      INTO v_s01, v_s02, v_company_pct
      FROM sawyan.settings
     WHERE effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC LIMIT 1;
    v_s01 := COALESCE(v_s01, 11);
    v_s02 := GREATEST(COALESCE(v_s02, 11), 1);
    v_company_pct := COALESCE(v_company_pct, 25.00);

    IF p_country_code IS NOT NULL THEN
        SELECT id, currency_code, admin_fx_rate
          INTO v_lens_cid, v_lens_curr, v_lens_fx
          FROM sawyan.countries
         WHERE country_code = upper(trim(p_country_code));
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _tmp_tree_nodes_v2 (
        run_id                   UUID NOT NULL,
        member_id                UUID NOT NULL,
        member_code              BIGINT,
        full_name                VARCHAR(150),
        parent_member_id         UUID,
        parent_member_code       BIGINT,
        placement_side           VARCHAR(12),
        viewer_root_arm          VARCHAR(12),
        structural_me            INT,
        company_gen              INT,
        node_color               VARCHAR(10),
        visual_color             VARCHAR(15),
        team_bucket              VARCHAR(20), -- 'COMMISSION_TEAM' | 'UNQUALIFIED_SKIPPED' | 'RESERVE_TEAM'
        stopper_rank             INT,
        stopper_out              INT,
        is_reserve_zone          BOOLEAN,
        reverse_ceiling_11       INT,
        phone_visible            BOOLEAN,
        phone_masked             VARCHAR(24),
        real_sponsor_code        BIGINT,
        real_sponsor_name        VARCHAR(150),
        is_direct_sponsored      BOOLEAN,
        placement_type_label     TEXT,
        nationality_country_code CHAR(2),
        residency_country_code   CHAR(2),
        report_country_id        INT,
        currency_code            CHAR(3),
        fx_rate                  NUMERIC(18,6),
        target_pct               NUMERIC(6,1),
        box_accumulated_usd      NUMERIC(18,2),
        target_required_usd      NUMERIC(18,2),
        subtree_total            BIGINT,
        subtree_left             BIGINT,
        subtree_right            BIGINT,
        node_actual_share_usd    NUMERIC(18,2),
        node_expected_share_usd  NUMERIC(18,2),
        has_left_child           BOOLEAN,
        has_right_child          BOOLEAN,
        PRIMARY KEY (run_id, member_id)
    ) ON COMMIT DROP;

    FOR v_rec IN
        SELECT m.id, m.member_code, m.full_name, m.parent_member_id, pm.member_code AS parent_member_code,
               m.placement_side, tc.root_arm_side AS viewer_root_arm, m.generation_in_tree AS company_gen,
               m.residency_country_id, m.is_tombstone_banned, m.phone,
               m.sponsor_id, sm.member_code AS sponsor_code, sm.full_name AS sponsor_name,
               c_res.country_code AS res_cc,
               COALESCE(c_nat.country_code, c_res.country_code) AS nat_cc,
               c_res.currency_code AS res_curr,
               c_res.admin_fx_rate AS res_fx,
               c_res.monthly_target_usd AS res_target_usd,
               (m.left_child_id IS NOT NULL) AS has_left_child,
               (m.right_child_id IS NOT NULL) AS has_right_child,
               tc.depth AS rel_depth,
               COALESCE(bool_or(b.is_qualified), false) AS any_qual,
               COALESCE(MAX(b_lens.is_qualified::int), 0) = 1 AS lens_qual,
               COALESCE(MAX((b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd)), 0) AS lens_val,
               COALESCE(MAX((b.carry_on_in_usd + b.current_month_purchases_usd)), 0) AS any_val,
               ROUND(COALESCE(
                   MAX(CASE WHEN b.country_id = COALESCE(v_lens_cid, m.residency_country_id)
                            THEN (b.carry_on_in_usd + b.current_month_purchases_usd + b.compensatory_incoming_usd)
                            ELSE NULL END),
                   MAX(b.carry_on_in_usd + b.current_month_purchases_usd + b.compensatory_incoming_usd),
                   0
               )::numeric, 2) AS box_accum_usd,
               ROUND(COALESCE(
                   MAX(CASE WHEN b.country_id = COALESCE(v_lens_cid, m.residency_country_id)
                            THEN b.target_required_usd ELSE NULL END),
                   MAX(b.target_required_usd),
                   c_res.monthly_target_usd,
                   24.75
               )::numeric, 2) AS target_req_usd,
               COALESCE(sc.sub_total, 0) AS sub_total,
               COALESCE(sc.sub_left, 0) AS sub_left,
               COALESCE(sc.sub_right, 0) AS sub_right
          FROM sawyan.tree_closure tc
          JOIN sawyan.members m ON m.id = tc.descendant_id
          JOIN sawyan.countries c_res ON c_res.id = m.residency_country_id
          LEFT JOIN sawyan.countries c_nat ON c_nat.id = m.nationality_country_id
          LEFT JOIN sawyan.members pm ON pm.id = m.parent_member_id
          LEFT JOIN sawyan.members sm ON sm.id = m.sponsor_id
          LEFT JOIN sawyan.monthly_target_boxes b
                 ON b.member_id = m.id AND b.period_ym = p_period_ym
          LEFT JOIN sawyan.monthly_target_boxes b_lens
                 ON b_lens.member_id = m.id AND b_lens.period_ym = p_period_ym AND b_lens.country_id = v_lens_cid
          LEFT JOIN (
              SELECT st.ancestor_id,
                     COUNT(*) AS sub_total,
                     COUNT(*) FILTER (WHERE st.root_arm_side = 'left') AS sub_left,
                     COUNT(*) FILTER (WHERE st.root_arm_side = 'right') AS sub_right
                FROM sawyan.tree_closure st
               WHERE st.depth >= 1
                 AND st.ancestor_id IN (
                     SELECT descendant_id FROM sawyan.tree_closure WHERE ancestor_id = p_viewer_member_id
                 )
               GROUP BY st.ancestor_id
          ) sc ON sc.ancestor_id = m.id
         WHERE tc.ancestor_id = p_viewer_member_id
         GROUP BY m.id, m.member_code, m.full_name, m.parent_member_id, pm.member_code,
                  m.placement_side, tc.root_arm_side, m.generation_in_tree,
                  m.residency_country_id, m.is_tombstone_banned, m.phone,
                  m.sponsor_id, sm.member_code, sm.full_name,
                  c_res.country_code, c_nat.country_code, c_res.currency_code, c_res.admin_fx_rate, c_res.monthly_target_usd,
                  m.left_child_id, m.right_child_id, tc.depth, sc.sub_total, sc.sub_left, sc.sub_right
         ORDER BY tc.depth ASC, m.member_code ASC
    LOOP
        DECLARE
            v_color          VARCHAR(10);
            v_visual_color   VARCHAR(15);
            v_in_scope_w09   BOOLEAN;
            v_place_label    TEXT;
            v_pct            NUMERIC(6,1);
            v_unit_share     NUMERIC(18,2);
            v_actual_node    NUMERIC(18,2) := 0.00;
            v_expected_node  NUMERIC(18,2) := 0.00;
            v_eff_curr       CHAR(3);
            v_eff_fx         NUMERIC(18,6);
            v_rpt_cid        INT;
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
                  FROM _tmp_tree_nodes_v2 WHERE run_id = v_run_id AND member_id = v_rec.parent_member_id;

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

            v_visual_color := CASE
                WHEN v_color = 'BLACK' THEN 'BLACK'
                WHEN v_my_res THEN 'GRAY'
                ELSE v_color
            END;

            v_in_scope_w09 := (v_rec.rel_depth BETWEEN 1 AND v_w09_phone_gen);

            v_place_label := CASE
                WHEN v_rec.rel_depth = 0 THEN 'أنت (صاحب الشجرة)'
                WHEN v_rec.sponsor_id = p_viewer_member_id AND v_rec.parent_member_id = p_viewer_member_id THEN 'مباشر لك وتحت رعايتك مباشرة'
                WHEN v_rec.sponsor_id = p_viewer_member_id THEN 'مسجل بكودك (إسقاط تلقائي Spillover)'
                WHEN v_rec.parent_member_id = p_viewer_member_id THEN 'إسقاط من أعلى الشجرة تحتك مباشرة'
                ELSE 'من بناء فريقك (شبكة الأجيال)'
            END;

            v_pct := LEAST(ROUND(((v_rec.box_accum_usd / GREATEST(v_rec.target_req_usd, 0.01)) * 100.0)::numeric, 1), 100.0);
            v_rpt_cid := COALESCE(v_lens_cid, v_rec.residency_country_id);
            v_eff_curr := COALESCE(CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_curr ELSE v_rec.res_curr END, v_rec.res_curr);
            v_eff_fx   := COALESCE(CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_fx ELSE v_rec.res_fx END, v_rec.res_fx, 1.000000);
            v_unit_share := TRUNC(GREATEST(v_rec.target_req_usd, 0.00) / v_s02, 2);

            IF v_rec.rel_depth >= 1 THEN
                IF NOT v_my_res AND v_my_rank IS NOT NULL THEN
                    v_actual_node := v_unit_share;
                ELSIF NOT v_my_res AND v_color = 'ORANGE' THEN
                    v_expected_node := v_unit_share;
                END IF;
            END IF;

            INSERT INTO _tmp_tree_nodes_v2 VALUES (
                v_run_id, v_rec.id, v_rec.member_code, v_rec.full_name, v_rec.parent_member_id, v_rec.parent_member_code,
                v_rec.placement_side, v_rec.viewer_root_arm, v_rec.rel_depth + 1, v_rec.company_gen,
                v_color, v_visual_color,
                CASE WHEN v_my_res THEN 'RESERVE_TEAM'
                     WHEN v_my_rank IS NOT NULL THEN 'COMMISSION_TEAM'
                     ELSE 'UNQUALIFIED_SKIPPED' END,
                v_my_rank, v_my_out, v_my_res,
                CASE WHEN v_my_res THEN 0 ELSE GREATEST(0, v_s01 - COALESCE(v_my_out, 1)) END,
                v_in_scope_w09,
                CASE WHEN v_in_scope_w09 THEN v_rec.phone ELSE NULL END,
                CASE WHEN v_in_scope_w09 THEN v_rec.sponsor_code ELSE NULL END,
                CASE WHEN v_in_scope_w09 THEN v_rec.sponsor_name ELSE NULL END,
                (v_rec.sponsor_id = p_viewer_member_id),
                v_place_label,
                v_rec.nat_cc, v_rec.res_cc, v_rpt_cid, v_eff_curr, v_eff_fx,
                v_pct, v_rec.box_accum_usd, v_rec.target_req_usd,
                v_rec.sub_total, v_rec.sub_left, v_rec.sub_right,
                v_actual_node, v_expected_node,
                v_rec.has_left_child, v_rec.has_right_child
            );
        END;
    END LOOP;

    SELECT COUNT(*) INTO v_reserve_cnt FROM _tmp_tree_nodes_v2 WHERE run_id = v_run_id AND team_bucket = 'RESERVE_TEAM';
    SELECT COUNT(*) INTO v_comm_cnt    FROM _tmp_tree_nodes_v2 WHERE run_id = v_run_id AND team_bucket = 'COMMISSION_TEAM';
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE viewer_root_arm = 'left'),
           COUNT(*) FILTER (WHERE viewer_root_arm = 'right')
      INTO v_total_team, v_left_arm_cnt, v_right_arm_cnt
      FROM _tmp_tree_nodes_v2
     WHERE run_id = v_run_id AND structural_me >= 2;

    -- حساب تقارير الدول وحماية الأرباح الأجنبية التعويضية (GREATEST(0, ...) بلا خصم عكسي — D1 + T03)
    SELECT COALESCE(jsonb_agg(row_to_json(cr)::jsonb ORDER BY cr.is_foreign ASC, cr.country_code ASC), '[]'::jsonb)
      INTO v_country_reports
      FROM (
          SELECT c.country_code,
                 c.country_name_i18n,
                 c.currency_code,
                 c.admin_fx_rate AS fx_rate,
                 c.monthly_target_usd,
                 TRUNC(c.monthly_target_usd / v_s02, 2) AS unit_share_usd,
                 ROUND((
                     c.monthly_target_usd
                     + ROUND((c.monthly_target_usd * (v_company_pct / GREATEST(100.0 - v_company_pct, 1.0)))::numeric, 2)
                     + COALESCE(c.compensatory_admin_fee_usd, 0.00)
                 )::numeric, 2) AS compensatory_threshold_usd,
                 (c.id <> v_viewer_cid) AS is_foreign,
                 COALESCE((
                     SELECT bq.is_qualified OR ((bq.carry_on_in_usd + bq.current_month_purchases_usd) >= bq.target_required_usd)
                       FROM sawyan.monthly_target_boxes bq
                      WHERE bq.member_id = p_viewer_member_id AND bq.country_id = c.id AND bq.period_ym = p_period_ym
                 ), false) AS viewer_locally_qualified,
                 COALESCE(agg.total_members, 0) AS total_members,
                 COALESCE(agg.left_count, 0) AS left_count,
                 COALESCE(agg.right_count, 0) AS right_count,
                 COALESCE(agg.green_comm_count, 0) AS green_comm_count,
                 COALESCE(agg.orange_count, 0) AS orange_count,
                 COALESCE(agg.white_count, 0) AS white_count,
                 COALESCE(agg.reserve_count, 0) AS reserve_count,
                 COALESCE(agg.black_count, 0) AS black_count,
                 COALESCE(agg.gross_actual_usd, 0.00) AS gross_actual_usd,
                 COALESCE(agg.gross_expected_usd, 0.00) AS gross_expected_usd,
                 ROUND((CASE
                     WHEN c.id <> v_viewer_cid AND NOT COALESCE((
                         SELECT bq.is_qualified OR ((bq.carry_on_in_usd + bq.current_month_purchases_usd) >= bq.target_required_usd)
                           FROM sawyan.monthly_target_boxes bq
                          WHERE bq.member_id = p_viewer_member_id AND bq.country_id = c.id AND bq.period_ym = p_period_ym
                     ), false)
                     THEN GREATEST(0.00, COALESCE(agg.gross_actual_usd, 0.00) - (
                         c.monthly_target_usd
                         + ROUND((c.monthly_target_usd * (v_company_pct / GREATEST(100.0 - v_company_pct, 1.0)))::numeric, 2)
                         + COALESCE(c.compensatory_admin_fee_usd, 0.00)
                     ))
                     ELSE COALESCE(agg.gross_actual_usd, 0.00)
                 END)::numeric, 2) AS net_actual_usd,
                 ROUND((CASE
                     WHEN c.id <> v_viewer_cid AND NOT COALESCE((
                         SELECT bq.is_qualified OR ((bq.carry_on_in_usd + bq.current_month_purchases_usd) >= bq.target_required_usd)
                           FROM sawyan.monthly_target_boxes bq
                          WHERE bq.member_id = p_viewer_member_id AND bq.country_id = c.id AND bq.period_ym = p_period_ym
                     ), false)
                     THEN GREATEST(0.00,
                         GREATEST(0.00, (COALESCE(agg.gross_actual_usd, 0.00) + COALESCE(agg.gross_expected_usd, 0.00)) - (
                             c.monthly_target_usd
                             + ROUND((c.monthly_target_usd * (v_company_pct / GREATEST(100.0 - v_company_pct, 1.0)))::numeric, 2)
                             + COALESCE(c.compensatory_admin_fee_usd, 0.00)
                         ))
                         - GREATEST(0.00, COALESCE(agg.gross_actual_usd, 0.00) - (
                             c.monthly_target_usd
                             + ROUND((c.monthly_target_usd * (v_company_pct / GREATEST(100.0 - v_company_pct, 1.0)))::numeric, 2)
                             + COALESCE(c.compensatory_admin_fee_usd, 0.00)
                         ))
                     )
                     ELSE COALESCE(agg.gross_expected_usd, 0.00)
                 END)::numeric, 2) AS net_expected_orange_usd
            FROM sawyan.countries c
            LEFT JOIN (
                SELECT report_country_id AS cid,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND node_color <> 'BLACK') AS total_members,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND node_color <> 'BLACK' AND viewer_root_arm = 'left') AS left_count,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND node_color <> 'BLACK' AND viewer_root_arm = 'right') AS right_count,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND team_bucket = 'COMMISSION_TEAM') AS green_comm_count,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND NOT is_reserve_zone AND node_color = 'ORANGE') AS orange_count,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND NOT is_reserve_zone AND node_color = 'WHITE') AS white_count,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND team_bucket = 'RESERVE_TEAM' AND node_color <> 'BLACK') AS reserve_count,
                       COUNT(*) FILTER (WHERE structural_me >= 2 AND node_color = 'BLACK') AS black_count,
                       COALESCE(SUM(node_actual_share_usd), 0.00) AS gross_actual_usd,
                       COALESCE(SUM(node_expected_share_usd), 0.00) AS gross_expected_usd
                  FROM _tmp_tree_nodes_v2
                 WHERE run_id = v_run_id
                 GROUP BY report_country_id
            ) agg ON agg.cid = c.id
           WHERE (v_lens_cid IS NULL AND (c.is_active = true OR COALESCE(agg.total_members, 0) > 0 OR c.id = v_viewer_cid))
              OR (v_lens_cid IS NOT NULL AND c.id = v_lens_cid)
      ) cr;

    SELECT COALESCE(SUM((el->>'net_actual_usd')::numeric), 0.00),
           COALESCE(SUM((el->>'net_expected_orange_usd')::numeric), 0.00)
      INTO v_actual_usd, v_exp_orange_usd
      FROM jsonb_array_elements(v_country_reports) el;

    -- معاينة موقع الإسقاط المتوازن القادم للعضو (مطابقة 100% لخوارزمية auto_set_member_placement)
    IF v_viewer_right_id IS NULL OR v_viewer_left_id IS NULL THEN
        SELECT * INTO v_next_parent FROM sawyan.members WHERE id = p_viewer_member_id;
        v_next_side := CASE WHEN v_viewer_right_id IS NULL THEN 'right' ELSE 'left' END;
        SELECT CASE WHEN v_viewer_right_id IS NULL THEN 0 ELSE COALESCE((SELECT COUNT(*) FROM sawyan.tree_closure WHERE ancestor_id = v_viewer_right_id), 0) END,
               CASE WHEN v_viewer_left_id IS NULL THEN 0 ELSE COALESCE((SELECT COUNT(*) FROM sawyan.tree_closure WHERE ancestor_id = v_viewer_left_id), 0) END
          INTO v_bfs_right_cnt, v_bfs_left_cnt;
    ELSE
        SELECT COUNT(*) INTO v_bfs_right_cnt FROM sawyan.tree_closure WHERE ancestor_id = v_viewer_right_id;
        SELECT COUNT(*) INTO v_bfs_left_cnt  FROM sawyan.tree_closure WHERE ancestor_id = v_viewer_left_id;
        SELECT m.* INTO v_next_parent
          FROM sawyan.tree_closure tc
          JOIN sawyan.members m ON m.id = tc.descendant_id
         WHERE tc.ancestor_id = CASE WHEN v_bfs_right_cnt <= v_bfs_left_cnt THEN v_viewer_right_id ELSE v_viewer_left_id END
           AND (m.left_child_id IS NULL OR m.right_child_id IS NULL)
           AND m.is_active_in_tree = true
         ORDER BY tc.depth ASC,
                  (CASE WHEN m.left_child_id IS NULL AND m.right_child_id IS NULL THEN 0 ELSE 1 END) ASC,
                  m.member_code ASC
         LIMIT 1;
        IF FOUND THEN
            v_next_side := CASE WHEN v_next_parent.right_child_id IS NULL THEN 'right' ELSE 'left' END;
        END IF;
    END IF;

    IF v_next_parent.id IS NOT NULL THEN
        v_next_preview := jsonb_build_object(
            'next_parent_code', v_next_parent.member_code,
            'next_parent_name', v_next_parent.full_name,
            'next_side', v_next_side,
            'target_arm', CASE WHEN v_viewer_right_id IS NULL THEN 'right'
                               WHEN v_viewer_left_id IS NULL THEN 'left'
                               WHEN v_bfs_right_cnt <= v_bfs_left_cnt THEN 'right'
                               ELSE 'left' END,
            'right_arm_count', v_bfs_right_cnt,
            'left_arm_count', v_bfs_left_cnt
        );
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'member_code', member_code,
        'full_name', full_name,
        'parent_member_code', parent_member_code,
        'structural_me', structural_me || 'Me',
        'company_gen', company_gen,
        'placement_side', placement_side,
        'viewer_root_arm', viewer_root_arm,
        'node_color', node_color,
        'visual_color', visual_color,
        'team_bucket', team_bucket,
        'stopper_slot', CASE WHEN stopper_rank IS NOT NULL THEN stopper_rank || '/' || v_s01 ELSE NULL END,
        'reverse_ceiling_11', reverse_ceiling_11,
        'phone_visible', phone_visible,
        'phone', phone_masked,
        'real_sponsor_code', real_sponsor_code,
        'real_sponsor_name', real_sponsor_name,
        'is_direct_sponsored', is_direct_sponsored,
        'placement_type_label', placement_type_label,
        'nationality_country_code', nationality_country_code,
        'residency_country_code', residency_country_code,
        'currency_code', currency_code,
        'fx_rate', fx_rate,
        'target_pct', target_pct,
        'box_accumulated_usd', box_accumulated_usd,
        'target_required_usd', target_required_usd,
        'subtree_total', subtree_total,
        'subtree_left', subtree_left,
        'subtree_right', subtree_right,
        'node_actual_share_usd', node_actual_share_usd,
        'node_expected_share_usd', node_expected_share_usd,
        'has_left_child', has_left_child,
        'has_right_child', has_right_child
    ) ORDER BY structural_me ASC, member_code ASC)
      INTO v_nodes_json
      FROM _tmp_tree_nodes_v2
     WHERE run_id = v_run_id;

    RETURN jsonb_build_object(
        'viewer_member_id', p_viewer_member_id,
        'lens_country_code', COALESCE(upper(trim(p_country_code)), 'ALL'),
        'commission_team_count', v_comm_cnt,
        'reserve_team_aggregated_count', v_reserve_cnt, -- رقم إجمالي مجمع فقط (D26)
        'total_team_count', v_total_team,
        'left_arm_count', v_left_arm_cnt,
        'right_arm_count', v_right_arm_cnt,
        'actual_earnings_usd', v_actual_usd,
        'expected_orange_earnings_usd', v_exp_orange_usd,
        'next_placement_preview', v_next_preview,
        'country_reports', v_country_reports,
        'nodes', COALESCE(v_nodes_json, '[]'::jsonb)
    );
END;
$function$
;

-- 4. Updated get_merchant_dashboard_bundle (exposes require_topup_proof + 12s statement_timeout)
CREATE OR REPLACE FUNCTION sawyan.get_merchant_dashboard_bundle(p_merchant_id uuid, p_session_token text DEFAULT NULL::text, p_shift_filter character varying DEFAULT 'today'::character varying, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET statement_timeout TO '12s'
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
            'allow_zero_hold_in_isolation', COALESCE(v_settings.allow_zero_hold_in_isolation, true),
            'require_topup_proof', COALESCE((v_settings.operational_kill_switches->>'REQUIRE_TOPUP_PROOF')::boolean, false)
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
$function$
;

-- 5. Protect heavy SECURITY DEFINER dashboard bundle RPCs from Supabase anon 3s timeout under peak load
ALTER FUNCTION sawyan.get_member_dashboard_bundle(uuid, text, character, character) SET statement_timeout = '12s';
ALTER FUNCTION sawyan.get_admin_sovereign_bundle(uuid, text, character) SET statement_timeout = '12s';

-- 6. Preserve least-privilege execute grants
REVOKE ALL ON FUNCTION sawyan.admin_toggle_kill_switch(uuid, text, character varying, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.admin_toggle_kill_switch(uuid, text, character varying, boolean, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.merchant_initiate_topup(uuid, numeric, character varying, character varying, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.merchant_initiate_topup(uuid, numeric, character varying, character varying, uuid, text, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.get_tree_analytics_with_country_lens(uuid, character, character) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.get_tree_analytics_with_country_lens(uuid, character, character) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.get_merchant_dashboard_bundle(uuid, text, character varying, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_dashboard_bundle(uuid, text, character varying, uuid) TO anon, authenticated, service_role;
