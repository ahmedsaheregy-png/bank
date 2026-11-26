-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 28: CROSS-COUNTRY & DERIVED-NUMBER CONSISTENCY
-- ============================================================================
-- Fixes ALL 5 cross-screen data-consistency bugs verified live on `sawyan`:
--   1) `get_tree_analytics_with_country_lens`: Per-country independent reports
--      (never leaks foreign box qualification into residency country!), honors
--      D1 compensatory threshold, viewer qualification (`at_risk_rollup_usd`),
--      and explicit `viewer_self_share_usd` + `total_actual_incl_self_usd`.
--   2) `get_member_tree_subtree`: Resolves boxes strictly by active Country
--      Lens (or highest active box on ALL), returns full `country_boxes[]`,
--      includes foreign-box countries in `available_countries`, fixes
--      `power_bar` + `is_reserve_team` + `near/rollup`, and shares the single
--      truth formula for `estimated_month_commission_usd`.
--   3) `get_admin_sovereign_bundle`: Aggregates all per-country boxes for each
--      member + live projected `carry_on_out_usd` + `qualified_countries` +
--      raises report limits (500 members / 250 merchants).
--   4) `get_admin_full_tree`: Strict lens-box isolation (never falls back to
--      another country on specific lens), adds `box_country_code`,
--      `country_boxes[]`, `projected_carry_on_out_usd`, `maker_share_usd`,
--      `downline_est_comm_usd`, `estimated_month_commission_usd`,
--      `at_risk_rollup_usd`, and per-country accurate `country_breakdown`.
-- Strictly Idempotent across BOTH `sawyan` and `sawyan_demo`.
-- ============================================================================

DO $$
DECLARE
    v_schema TEXT;
    v_sql    TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo'] LOOP
        IF to_regnamespace(v_schema) IS NULL THEN
            CONTINUE;
        END IF;

        -- 1) get_tree_analytics_with_country_lens
        v_sql := format($fn$
CREATE OR REPLACE FUNCTION %1$I.get_tree_analytics_with_country_lens(
    p_viewer_member_id uuid,
    p_period_ym character,
    p_country_code character DEFAULT NULL::bpchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $body$

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
    v_lens_target_usd   NUMERIC(18,2) := NULL;
    v_actual_usd        NUMERIC(18,2) := 0.00;
    v_self_share_usd    NUMERIC(18,2) := 0.00;
    v_at_risk_usd       NUMERIC(18,2) := 0.00;
    v_exp_orange_usd    NUMERIC(18,2) := 0.00;
    v_country_reports   JSONB := '[]'::jsonb;
    v_next_preview      JSONB := NULL;
    v_next_parent       %1$I.members%%ROWTYPE;
    v_next_side         VARCHAR(12);
    v_bfs_right_cnt     BIGINT := 0;
    v_bfs_left_cnt      BIGINT := 0;
    v_home_gate_open    BOOLEAN := false;
BEGIN
    SELECT generation_in_tree, residency_country_id, right_child_id, left_child_id
      INTO v_viewer_gen, v_viewer_cid, v_viewer_right_id, v_viewer_left_id
      FROM %1$I.members
     WHERE id = p_viewer_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VIEWER_NOT_FOUND';
    END IF;

    -- Decision 3 (D1 / بند 5): Foreign compensatory gate requires active residency qualification (or inactive residency)
    SELECT (
        COALESCE((SELECT NOT ch.is_active FROM %1$I.countries ch WHERE ch.id = v_viewer_cid), false)
        OR COALESCE((
            SELECT bq.is_qualified OR ((bq.carry_on_in_usd + bq.current_month_purchases_usd) >= bq.target_required_usd)
              FROM %1$I.monthly_target_boxes bq
             WHERE bq.member_id = p_viewer_member_id
               AND bq.country_id = v_viewer_cid
               AND bq.period_ym = p_period_ym
        ), false)
    ) INTO v_home_gate_open;

    SELECT numerical_stopper_s01, upline_ceiling_s02, company_percent
      INTO v_s01, v_s02, v_company_pct
      FROM %1$I.settings
     WHERE effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC LIMIT 1;
    v_s01 := COALESCE(v_s01, 11);
    v_s02 := GREATEST(COALESCE(v_s02, 11), 1);
    v_company_pct := COALESCE(v_company_pct, 25.00);

    IF p_country_code IS NOT NULL AND upper(trim(p_country_code)) NOT IN ('', 'ALL') THEN
        SELECT id, currency_code, admin_fx_rate, monthly_target_usd
          INTO v_lens_cid, v_lens_curr, v_lens_fx, v_lens_target_usd
          FROM %1$I.countries
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
        team_bucket              VARCHAR(20),
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
               CASE
                   WHEN v_lens_cid IS NOT NULL THEN
                       ROUND(COALESCE(MAX(b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd + b_lens.compensatory_incoming_usd), 0.00)::numeric, 2)
                   ELSE
                       ROUND(COALESCE(
                           MAX(b_best.accum_usd),
                           0.00
                       )::numeric, 2)
               END AS box_accum_usd,
               CASE
                   WHEN v_lens_cid IS NOT NULL THEN
                       ROUND(COALESCE(MAX(b_lens.target_required_usd), v_lens_target_usd, 24.75)::numeric, 2)
                   ELSE
                       ROUND(COALESCE(MAX(b_best.target_required_usd), c_res.monthly_target_usd, 24.75)::numeric, 2)
               END AS target_req_usd,
               MAX(b_best.country_id) AS best_box_cid,
               MAX(b_best.currency_code) AS best_box_curr,
               MAX(b_best.admin_fx_rate) AS best_box_fx,
               COALESCE(sc.sub_total, 0) AS sub_total,
               COALESCE(sc.sub_left, 0) AS sub_left,
               COALESCE(sc.sub_right, 0) AS sub_right
          FROM %1$I.tree_closure tc
          JOIN %1$I.members m ON m.id = tc.descendant_id
          JOIN %1$I.countries c_res ON c_res.id = m.residency_country_id
          LEFT JOIN %1$I.countries c_nat ON c_nat.id = m.nationality_country_id
          LEFT JOIN %1$I.members pm ON pm.id = m.parent_member_id
          LEFT JOIN %1$I.members sm ON sm.id = m.sponsor_id
          LEFT JOIN %1$I.monthly_target_boxes b
                 ON b.member_id = m.id AND b.period_ym = p_period_ym
          LEFT JOIN %1$I.monthly_target_boxes b_lens
                 ON b_lens.member_id = m.id AND b_lens.period_ym = p_period_ym AND b_lens.country_id = v_lens_cid
          LEFT JOIN LATERAL (
              SELECT b2.country_id,
                     c2.currency_code,
                     c2.admin_fx_rate,
                     b2.target_required_usd,
                     (b2.carry_on_in_usd + b2.current_month_purchases_usd + b2.compensatory_incoming_usd) AS accum_usd
                FROM %1$I.monthly_target_boxes b2
                JOIN %1$I.countries c2 ON c2.id = b2.country_id
               WHERE b2.member_id = m.id
                 AND b2.period_ym = p_period_ym
               ORDER BY b2.is_qualified DESC,
                        (b2.carry_on_in_usd + b2.current_month_purchases_usd + b2.compensatory_incoming_usd) DESC,
                        (b2.country_id = m.residency_country_id) DESC
               LIMIT 1
          ) b_best ON true
          LEFT JOIN (
              SELECT st.ancestor_id,
                     COUNT(*) AS sub_total,
                     COUNT(*) FILTER (WHERE st.root_arm_side = 'left') AS sub_left,
                     COUNT(*) FILTER (WHERE st.root_arm_side = 'right') AS sub_right
                FROM %1$I.tree_closure st
               WHERE st.depth >= 1
                 AND st.ancestor_id IN (
                     SELECT descendant_id FROM %1$I.tree_closure WHERE ancestor_id = p_viewer_member_id
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
                ELSE v_color := 'BLACK';
                END IF;
            ELSE
                IF v_rec.any_qual THEN v_color := 'GREEN';
                ELSIF v_rec.any_val > 0 THEN v_color := 'ORANGE';
                ELSE v_color := 'WHITE';
                END IF;
            END IF;

            IF v_rec.rel_depth = 0 THEN
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
            v_rpt_cid  := COALESCE(v_lens_cid, v_rec.best_box_cid, v_rec.residency_country_id);
            v_eff_curr := COALESCE(CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_curr ELSE v_rec.best_box_curr END, v_rec.res_curr);
            v_eff_fx   := COALESCE(CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_fx ELSE v_rec.best_box_fx END, v_rec.res_fx, 1.000000);
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

    -- Stage 28: Per-Country Independent Constitutional Reports (NEVER attribute foreign box to residency country!)
    SELECT COALESCE(jsonb_agg(row_to_json(cr)::jsonb ORDER BY cr.is_foreign ASC, cr.country_code ASC), '[]'::jsonb)
      INTO v_country_reports
      FROM (
          SELECT c.country_code,
                 c.country_name_i18n,
                 c.currency_code,
                 c.admin_fx_rate AS fx_rate,
                 c.monthly_target_usd,
                 TRUNC(c.monthly_target_usd / v_s02, 2) AS unit_share_usd,
                 c_meta.comp_thresh_usd AS compensatory_threshold_usd,
                 (c.id <> v_viewer_cid) AS is_foreign,
                 c_meta.viewer_qual AS viewer_locally_qualified,
                 CASE WHEN c_meta.viewer_qual THEN TRUNC(c.monthly_target_usd / v_s02, 2) ELSE 0.00 END AS viewer_self_share_usd,
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
                     WHEN c.id = v_viewer_cid AND NOT c_meta.viewer_qual THEN COALESCE(agg.gross_actual_usd, 0.00)
                     WHEN c.id <> v_viewer_cid AND NOT c_meta.viewer_qual AND NOT v_home_gate_open
                          AND COALESCE(agg.gross_actual_usd, 0.00) >= c_meta.comp_thresh_usd
                          THEN (COALESCE(agg.gross_actual_usd, 0.00) - c_meta.comp_thresh_usd) + TRUNC(c.monthly_target_usd / v_s02, 2)
                     ELSE 0.00
                 END)::numeric, 2) AS at_risk_rollup_usd,
                 ROUND((CASE
                     WHEN c.id <> v_viewer_cid AND NOT c_meta.viewer_qual THEN
                         CASE WHEN v_home_gate_open AND COALESCE(agg.gross_actual_usd, 0.00) >= c_meta.comp_thresh_usd
                              THEN (COALESCE(agg.gross_actual_usd, 0.00) - c_meta.comp_thresh_usd) + TRUNC(c.monthly_target_usd / v_s02, 2)
                              ELSE 0.00 END
                     WHEN c.id = v_viewer_cid AND NOT c_meta.viewer_qual THEN
                         0.00
                     ELSE
                         COALESCE(agg.gross_actual_usd, 0.00)
                 END)::numeric, 2) AS net_actual_usd,
                 ROUND((CASE
                     WHEN c.id <> v_viewer_cid AND NOT c_meta.viewer_qual THEN
                         CASE WHEN v_home_gate_open THEN
                             GREATEST(0.00,
                                 GREATEST(0.00, (COALESCE(agg.gross_actual_usd, 0.00) + COALESCE(agg.gross_expected_usd, 0.00)) - c_meta.comp_thresh_usd)
                                 - GREATEST(0.00, COALESCE(agg.gross_actual_usd, 0.00) - c_meta.comp_thresh_usd)
                             )
                         ELSE 0.00 END
                     ELSE
                         COALESCE(agg.gross_expected_usd, 0.00)
                 END)::numeric, 2) AS net_expected_orange_usd
            FROM %1$I.countries c
            CROSS JOIN LATERAL (
                SELECT ROUND((
                           c.monthly_target_usd
                           + ROUND((c.monthly_target_usd * (v_company_pct / GREATEST(100.0 - v_company_pct, 1.0)))::numeric, 2)
                           + COALESCE(c.compensatory_admin_fee_usd, 0.00)
                       )::numeric, 2) AS comp_thresh_usd,
                       COALESCE((
                           SELECT bq.is_qualified OR ((bq.carry_on_in_usd + bq.current_month_purchases_usd) >= bq.target_required_usd)
                             FROM %1$I.monthly_target_boxes bq
                            WHERE bq.member_id = p_viewer_member_id
                              AND bq.country_id = c.id
                              AND bq.period_ym = p_period_ym
                       ), false) AS viewer_qual
            ) c_meta
            LEFT JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE dm.in_country) AS total_members,
                       COUNT(*) FILTER (WHERE dm.in_country AND dm.root_arm_side = 'left') AS left_count,
                       COUNT(*) FILTER (WHERE dm.in_country AND dm.root_arm_side = 'right') AS right_count,
                       COUNT(*) FILTER (WHERE dm.is_comm_green) AS green_comm_count,
                       COUNT(*) FILTER (WHERE dm.is_orange) AS orange_count,
                       COUNT(*) FILTER (WHERE dm.is_white) AS white_count,
                       COUNT(*) FILTER (WHERE dm.in_country AND dm.is_reserve) AS reserve_count,
                       COUNT(*) FILTER (WHERE NOT dm.in_country) AS black_count,
                       ROUND((COUNT(*) FILTER (WHERE dm.is_comm_green) * TRUNC(c.monthly_target_usd / v_s02, 2))::numeric, 2) AS gross_actual_usd,
                       ROUND((COUNT(*) FILTER (WHERE dm.is_orange) * TRUNC(c.monthly_target_usd / v_s02, 2))::numeric, 2) AS gross_expected_usd
                  FROM (
                      SELECT tc.root_arm_side,
                             (m.residency_country_id = c.id OR tb.id IS NOT NULL) AS in_country,
                             (1 + COALESCE(mid_q.cnt, 0) >= v_s01) AS is_reserve,
                             (NOT m.is_tombstone_banned AND COALESCE(tb.is_qualified, false) AND (1 + COALESCE(mid_q.cnt, 0) < v_s01)) AS is_comm_green,
                             (NOT m.is_tombstone_banned AND NOT COALESCE(tb.is_qualified, false)
                              AND (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0)) > 0
                              AND (1 + COALESCE(mid_q.cnt, 0) < v_s01)) AS is_orange,
                             (m.residency_country_id = c.id AND NOT COALESCE(tb.is_qualified, false)
                              AND (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0)) = 0
                              AND (1 + COALESCE(mid_q.cnt, 0) < v_s01)) AS is_white
                        FROM %1$I.tree_closure tc
                        JOIN %1$I.members m ON m.id = tc.descendant_id
                        LEFT JOIN %1$I.monthly_target_boxes tb
                               ON tb.member_id = m.id
                              AND tb.country_id = c.id
                              AND tb.period_ym = p_period_ym
                        LEFT JOIN LATERAL (
                            SELECT COUNT(*) AS cnt
                              FROM %1$I.tree_closure tc_a
                              JOIN %1$I.tree_closure tc_b
                                ON tc_b.ancestor_id = tc_a.descendant_id
                               AND tc_b.descendant_id = m.id
                              JOIN %1$I.members mid ON mid.id = tc_a.descendant_id
                              JOIN %1$I.monthly_target_boxes mtb
                                ON mtb.member_id = mid.id
                               AND mtb.country_id = c.id
                               AND mtb.period_ym = p_period_ym
                             WHERE tc_a.ancestor_id = p_viewer_member_id
                               AND tc_a.depth > 0
                               AND tc_b.depth > 0
                               AND mid.is_tombstone_banned = false
                               AND mtb.is_qualified = true
                        ) mid_q ON true
                       WHERE tc.ancestor_id = p_viewer_member_id
                         AND tc.depth >= 1
                  ) dm
            ) agg ON true
           WHERE (v_lens_cid IS NULL AND (c.is_active = true OR COALESCE(agg.total_members, 0) > 0 OR c.id = v_viewer_cid OR c_meta.viewer_qual))
              OR (v_lens_cid IS NOT NULL AND c.id = v_lens_cid)
      ) cr;

    SELECT COALESCE(SUM((el->>'net_actual_usd')::numeric), 0.00),
           COALESCE(SUM((el->>'viewer_self_share_usd')::numeric), 0.00),
           COALESCE(SUM((el->>'at_risk_rollup_usd')::numeric), 0.00),
           COALESCE(SUM((el->>'net_expected_orange_usd')::numeric), 0.00)
      INTO v_actual_usd, v_self_share_usd, v_at_risk_usd, v_exp_orange_usd
      FROM jsonb_array_elements(v_country_reports) el;

    IF v_viewer_right_id IS NULL OR v_viewer_left_id IS NULL THEN
        SELECT * INTO v_next_parent FROM %1$I.members WHERE id = p_viewer_member_id;
        v_next_side := CASE WHEN v_viewer_right_id IS NULL THEN 'right' ELSE 'left' END;
        SELECT CASE WHEN v_viewer_right_id IS NULL THEN 0 ELSE COALESCE((SELECT COUNT(*) FROM %1$I.tree_closure WHERE ancestor_id = v_viewer_right_id), 0) END,
               CASE WHEN v_viewer_left_id IS NULL THEN 0 ELSE COALESCE((SELECT COUNT(*) FROM %1$I.tree_closure WHERE ancestor_id = v_viewer_left_id), 0) END
          INTO v_bfs_right_cnt, v_bfs_left_cnt;
    ELSE
        SELECT COUNT(*) INTO v_bfs_right_cnt FROM %1$I.tree_closure WHERE ancestor_id = v_viewer_right_id;
        SELECT COUNT(*) INTO v_bfs_left_cnt  FROM %1$I.tree_closure WHERE ancestor_id = v_viewer_left_id;
        SELECT m.* INTO v_next_parent
          FROM %1$I.tree_closure tc
          JOIN %1$I.members m ON m.id = tc.descendant_id
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
        'member_code', member_code, 'full_name', full_name, 'parent_member_code', parent_member_code,
        'structural_me', structural_me || 'Me', 'company_gen', company_gen,
        'placement_side', placement_side, 'viewer_root_arm', viewer_root_arm,
        'node_color', node_color, 'visual_color', visual_color, 'team_bucket', team_bucket,
        'stopper_slot', CASE WHEN stopper_rank IS NOT NULL THEN stopper_rank || '/' || v_s01 ELSE NULL END,
        'reverse_ceiling_11', reverse_ceiling_11, 'phone_visible', phone_visible, 'phone', phone_masked,
        'real_sponsor_code', real_sponsor_code, 'real_sponsor_name', real_sponsor_name,
        'is_direct_sponsored', is_direct_sponsored, 'placement_type_label', placement_type_label,
        'nationality_country_code', nationality_country_code, 'residency_country_code', residency_country_code,
        'currency_code', currency_code, 'fx_rate', fx_rate, 'target_pct', target_pct,
        'box_accumulated_usd', box_accumulated_usd, 'target_required_usd', target_required_usd,
        'subtree_total', subtree_total, 'subtree_left', subtree_left, 'subtree_right', subtree_right,
        'node_actual_share_usd', node_actual_share_usd, 'node_expected_share_usd', node_expected_share_usd,
        'has_left_child', has_left_child, 'has_right_child', has_right_child
    ) ORDER BY structural_me ASC, member_code ASC)
      INTO v_nodes_json
      FROM _tmp_tree_nodes_v2
     WHERE run_id = v_run_id;

    RETURN jsonb_build_object(
        'viewer_member_id', p_viewer_member_id,
        'lens_country_code', COALESCE(upper(trim(p_country_code)), 'ALL'),
        'commission_team_count', v_comm_cnt,
        'reserve_team_aggregated_count', v_reserve_cnt,
        'total_team_count', v_total_team,
        'left_arm_count', v_left_arm_cnt,
        'right_arm_count', v_right_arm_cnt,
        'actual_earnings_usd', v_actual_usd,
        'viewer_self_share_usd', v_self_share_usd,
        'total_actual_incl_self_usd', ROUND((v_actual_usd + v_self_share_usd)::numeric, 2),
        'at_risk_rollup_usd', v_at_risk_usd,
        'expected_orange_earnings_usd', v_exp_orange_usd,
        'next_placement_preview', v_next_preview,
        'country_reports', v_country_reports,
        'nodes', COALESCE(v_nodes_json, '[]'::jsonb)
    );
END;

$body$;
$fn$, v_schema);
        EXECUTE v_sql;

        -- 2) get_member_tree_subtree
        v_sql := format($fn$

CREATE OR REPLACE FUNCTION %1$I.get_member_tree_subtree(
    p_member_id uuid,
    p_session_token text,
    p_root_member_code bigint DEFAULT NULL::bigint,
    p_period_ym character DEFAULT NULL::bpchar,
    p_max_depth integer DEFAULT 4,
    p_node_limit integer DEFAULT 80,
    p_country_code character DEFAULT NULL::bpchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
SET statement_timeout TO '10s'
AS $body$
DECLARE
    v_viewer          %1$I.members%%ROWTYPE;
    v_root            %1$I.members%%ROWTYPE;
    v_period_ym       CHAR(7);
    v_prev_period_ym  CHAR(7);
    v_max_depth       INT;
    v_node_limit      INT;
    v_eff_cc          CHAR(2);
    v_lens_cid        INT := NULL;
    v_lens_cc         CHAR(2) := NULL;
    v_lens_name_ar    TEXT := NULL;
    v_lens_curr       CHAR(3) := NULL;
    v_lens_fx         NUMERIC(18,6) := NULL;
    v_lens_target_usd NUMERIC(18,2) := NULL;
    v_s01             INT := 11;
    v_s02             INT := 11;
    v_nodes           JSONB := '[]'::jsonb;
    v_breadcrumb      JSONB := '[]'::jsonb;
    v_avail_cc        JSONB := '[]'::jsonb;
    v_near_qual       JSONB := '[]'::jsonb;
    v_rollup_risk     JSONB := '[]'::jsonb;
    v_left_total      BIGINT := 0;
    v_right_total     BIGINT := 0;
    v_left_qual       BIGINT := 0;
    v_right_qual      BIGINT := 0;
    v_weaker_side     TEXT := 'right';
    v_spill_parent    BIGINT := NULL;
    v_spill_side      TEXT := 'right';
    v_new_7d          BIGINT := 0;
    v_new_month       BIGINT := 0;
    v_tx_members      BIGINT := 0;
    v_tx_count        BIGINT := 0;
    v_near_cnt        BIGINT := 0;
    v_rollup_cnt      BIGINT := 0;
    v_analytics       JSONB := '{}'::jsonb;
    v_est_comm_usd    NUMERIC(18,2) := 0.00;
    v_self_share_usd  NUMERIC(18,2) := 0.00;
    v_at_risk_usd     NUMERIC(18,2) := 0.00;
    v_prev_comm_usd   NUMERIC(18,2) := 0.00;
    v_comm_delta_pct  NUMERIC(8,1) := 0.0;
    v_unit_share      NUMERIC(18,2) := 2.25;
    v_total_sub       BIGINT := 0;
    v_month_start     TIMESTAMPTZ;
    v_month_end       TIMESTAMPTZ;
BEGIN
    v_viewer := %1$I.verify_member_session(p_member_id, p_session_token);

    v_period_ym := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
    v_month_start := to_timestamp(v_period_ym || '-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS') AT TIME ZONE 'UTC';
    v_month_end   := v_month_start + interval '1 month';
    v_prev_period_ym := to_char(v_month_start - interval '1 day', 'YYYY-MM');

    v_max_depth  := LEAST(GREATEST(COALESCE(p_max_depth, 4), 1), 8);
    v_node_limit := LEAST(GREATEST(COALESCE(p_node_limit, 80), 15), 500);
    v_eff_cc     := CASE WHEN upper(trim(COALESCE(p_country_code, ''))) IN ('', 'ALL') THEN NULL ELSE upper(trim(p_country_code)) END;

    IF v_eff_cc IS NOT NULL THEN
        SELECT c.id,
               c.country_code,
               COALESCE(c.country_name_i18n->>'ar', c.country_name_i18n->>'en', c.country_code),
               c.currency_code,
               COALESCE(c.admin_fx_rate, 1),
               COALESCE(c.monthly_target_usd, 24.75)
          INTO v_lens_cid, v_lens_cc, v_lens_name_ar, v_lens_curr, v_lens_fx, v_lens_target_usd
          FROM %1$I.countries c
         WHERE c.country_code = v_eff_cc;
    END IF;

    SELECT COALESCE(numerical_stopper_s01, 11), COALESCE(upline_ceiling_s02, 11)
      INTO v_s01, v_s02
      FROM %1$I.settings
     WHERE country_id IS NULL AND effective_from <= now()
     ORDER BY effective_from DESC, recorded_at DESC
     LIMIT 1;
    v_s01 := GREATEST(COALESCE(v_s01, 11), 1);
    v_s02 := GREATEST(COALESCE(v_s02, 11), 1);

    SELECT TRUNC(GREATEST(COALESCE(c.monthly_target_usd, 24.75), 0.01) / v_s02, 2)
      INTO v_unit_share
      FROM %1$I.countries c
     WHERE c.id = COALESCE(v_lens_cid, v_viewer.residency_country_id);
    v_unit_share := COALESCE(v_unit_share, 2.25);

    IF p_root_member_code IS NULL OR p_root_member_code = v_viewer.member_code THEN
        v_root := v_viewer;
    ELSE
        SELECT m.* INTO v_root
          FROM %1$I.members m
          JOIN %1$I.tree_closure tc ON tc.descendant_id = m.id
         WHERE tc.ancestor_id = v_viewer.id
           AND m.member_code = p_root_member_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'SUBTREE_ROOT_FORBIDDEN_OR_NOT_FOUND';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'member_code', anc.member_code,
        'full_name', anc.full_name,
        'depth_from_viewer', tc_v.depth
    ) ORDER BY tc_v.depth ASC), '[]'::jsonb)
      INTO v_breadcrumb
      FROM %1$I.tree_closure tc_r
      JOIN %1$I.tree_closure tc_v
        ON tc_v.ancestor_id = v_viewer.id
       AND tc_v.descendant_id = tc_r.ancestor_id
      JOIN %1$I.members anc ON anc.id = tc_r.ancestor_id
     WHERE tc_r.descendant_id = v_root.id;

    -- Stage 28: Nodes resolve monthly_target_boxes strictly by active Country Lens (or highest active box on ALL)
    SELECT COALESCE(jsonb_agg(row_obj ORDER BY rel_depth ASC, placement_side DESC, member_code ASC), '[]'::jsonb)
      INTO v_nodes
      FROM (
          SELECT
              tc_r.depth AS rel_depth,
              m.placement_side,
              m.member_code,
              jsonb_build_object(
                  'id', m.id,
                  'member_code', m.member_code,
                  'parent_code', pm.member_code,
                  'sponsor_code', sp.member_code,
                  'sponsor_name', CASE
                      WHEN sp.id IS NULL THEN NULL
                      WHEN sp.is_tombstone_banned THEN 'حساب مجمّد (#' || sp.member_code || ')'
                      ELSE sp.full_name
                  END,
                  'is_direct_referral', (m.sponsor_id = v_viewer.id),
                  'placement_side', m.placement_side,
                  'rel_depth', tc_r.depth,
                  'viewer_depth', COALESCE(tc_v.depth, 0),
                  'full_name', CASE WHEN m.is_tombstone_banned THEN 'حساب مجمّد (#' || m.member_code || ')' ELSE m.full_name END,
                  'avatar_url', CASE WHEN m.is_tombstone_banned THEN NULL ELSE NULLIF(trim(COALESCE(m.metadata->>'avatar_url', '')), '') END,
                  'country_code', c.country_code,
                  'country_name_ar', COALESCE(c.country_name_i18n->>'ar', c.country_name_i18n->>'en', c.country_code),
                  'currency_code', eff.box_currency_code,
                  'residency_currency_code', c.currency_code,
                  'admin_fx_rate', eff.box_fx_rate,
                  'box_country_code', eff.box_country_code,
                  'box_country_name_ar', eff.box_country_name_ar,
                  'box_currency_code', eff.box_currency_code,
                  'is_tombstone_banned', m.is_tombstone_banned,
                  'is_qualified', eff.is_qualified,
                  'is_reserve_team', (
                      COALESCE(tc_v.depth, 0) > 0
                      AND (
                          1 + (
                              SELECT COUNT(*)
                                FROM %1$I.tree_closure tc_a
                                JOIN %1$I.tree_closure tc_b
                                  ON tc_b.ancestor_id = tc_a.descendant_id
                                 AND tc_b.descendant_id = m.id
                                JOIN %1$I.members mid ON mid.id = tc_a.descendant_id
                               WHERE tc_a.ancestor_id = v_viewer.id
                                 AND tc_a.depth > 0
                                 AND tc_b.depth > 0
                                 AND mid.is_tombstone_banned = false
                                 AND EXISTS (
                                     SELECT 1
                                       FROM %1$I.monthly_target_boxes mtb
                                      WHERE mtb.member_id = mid.id
                                        AND mtb.period_ym = v_period_ym
                                        AND mtb.is_qualified = true
                                        AND (v_lens_cid IS NULL OR mtb.country_id = v_lens_cid)
                                 )
                          )
                      ) >= v_s01
                  ),
                  'in_country_lens', (
                      v_lens_cid IS NULL
                      OR m.residency_country_id = v_lens_cid
                      OR EXISTS (
                          SELECT 1
                            FROM %1$I.monthly_target_boxes tb_lens
                           WHERE tb_lens.member_id = m.id
                             AND tb_lens.period_ym = v_period_ym
                             AND tb_lens.country_id = v_lens_cid
                             AND (tb_lens.is_qualified = true OR (tb_lens.carry_on_in_usd + tb_lens.current_month_purchases_usd) > 0)
                      )
                  ),
                  'target_required_usd', ROUND(eff.req_usd::numeric, 2),
                  'accumulated_usd', ROUND(eff.acc_usd::numeric, 2),
                  'remaining_usd', ROUND(GREATEST(0.00, eff.req_usd - eff.acc_usd)::numeric, 2),
                  'projected_carry_on_out_usd', ROUND(eff.proj_carry_out_usd::numeric, 2),
                  'target_required_local', ROUND((eff.req_usd * eff.box_fx_rate)::numeric, 2),
                  'achieved_local', ROUND((eff.acc_usd * eff.box_fx_rate)::numeric, 2),
                  'remaining_local', ROUND((GREATEST(0.00, eff.req_usd - eff.acc_usd) * eff.box_fx_rate)::numeric, 2),
                  'projected_carry_on_out_local', ROUND((eff.proj_carry_out_usd * eff.box_fx_rate)::numeric, 2),
                  'progress_pct', LEAST(100.0, ROUND(((eff.acc_usd / NULLIF(eff.req_usd, 0)) * 100.0)::numeric, 1)),
                  'country_boxes', COALESCE((
                      SELECT jsonb_agg(jsonb_build_object(
                          'country_code', cb.country_code,
                          'country_name_ar', COALESCE(cb.country_name_i18n->>'ar', cb.country_name_i18n->>'en', cb.country_code),
                          'currency_code', cb.currency_code,
                          'admin_fx_rate', COALESCE(cb.admin_fx_rate, 1),
                          'is_residency', (cb.id = m.residency_country_id),
                          'is_qualified', COALESCE(mb.is_qualified, false),
                          'accumulated_usd', ROUND(COALESCE(mb.carry_on_in_usd + mb.current_month_purchases_usd + mb.compensatory_incoming_usd, 0.00)::numeric, 2),
                          'target_required_usd', ROUND(COALESCE(mb.target_required_usd, cb.monthly_target_usd, 24.75)::numeric, 2),
                          'achieved_local', ROUND((COALESCE(mb.carry_on_in_usd + mb.current_month_purchases_usd + mb.compensatory_incoming_usd, 0.00) * COALESCE(cb.admin_fx_rate, 1))::numeric, 2),
                          'target_required_local', ROUND((COALESCE(mb.target_required_usd, cb.monthly_target_usd, 24.75) * COALESCE(cb.admin_fx_rate, 1))::numeric, 2),
                          'projected_carry_on_out_usd', ROUND((
                              CASE
                                  WHEN COALESCE(mb.carry_on_out_usd, 0) > 0 THEN mb.carry_on_out_usd
                                  WHEN COALESCE(mb.is_qualified, false) THEN GREATEST(0.00, (mb.carry_on_in_usd + mb.current_month_purchases_usd) - mb.target_required_usd)
                                  ELSE COALESCE(mb.carry_on_in_usd + mb.current_month_purchases_usd, 0.00)
                              END
                          )::numeric, 2),
                          'progress_pct', LEAST(100.0, ROUND((COALESCE(mb.carry_on_in_usd + mb.current_month_purchases_usd + mb.compensatory_incoming_usd, 0.00) / NULLIF(COALESCE(mb.target_required_usd, cb.monthly_target_usd, 24.75), 0) * 100.0)::numeric, 1))
                      ) ORDER BY COALESCE(mb.is_qualified, false) DESC, (cb.id = m.residency_country_id) DESC, cb.country_code ASC)
                        FROM %1$I.countries cb
                        LEFT JOIN %1$I.monthly_target_boxes mb
                               ON mb.member_id = m.id
                              AND mb.country_id = cb.id
                              AND mb.period_ym = v_period_ym
                       WHERE cb.id = m.residency_country_id OR mb.id IS NOT NULL
                  ), '[]'::jsonb),
                  'has_left_child', (m.left_child_id IS NOT NULL),
                  'has_right_child', (m.right_child_id IS NOT NULL),
                  'subtree_count', (SELECT COUNT(*) FROM %1$I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0),
                  'left_team_count', (SELECT COUNT(*) FROM %1$I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0 AND tsub.root_arm_side = 'left'),
                  'right_team_count', (SELECT COUNT(*) FROM %1$I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0 AND tsub.root_arm_side = 'right'),
                  'hidden_descendants', CASE
                      WHEN tc_r.depth >= v_max_depth THEN (SELECT COUNT(*) FROM %1$I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0)
                      ELSE 0
                  END,
                  'phone', CASE
                      WHEN NOT m.is_tombstone_banned AND COALESCE(tc_v.depth, 0) BETWEEN 0 AND 10 THEN m.phone
                      ELSE NULL
                  END,
                  'phone_visible', (NOT m.is_tombstone_banned AND COALESCE(tc_v.depth, 0) BETWEEN 0 AND 10),
                  'created_at', m.created_at
              ) AS row_obj
            FROM %1$I.tree_closure tc_r
            JOIN %1$I.members m ON m.id = tc_r.descendant_id
            JOIN %1$I.countries c ON c.id = m.residency_country_id
            LEFT JOIN %1$I.members pm ON pm.id = m.parent_member_id
            LEFT JOIN %1$I.members sp ON sp.id = m.sponsor_id
            LEFT JOIN %1$I.tree_closure tc_v
              ON tc_v.ancestor_id = v_viewer.id
             AND tc_v.descendant_id = m.id
            CROSS JOIN LATERAL (
                SELECT
                    COALESCE(bx.b_cc, CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_cc ELSE c.country_code END) AS box_country_code,
                    COALESCE(bx.b_name_ar, CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_name_ar ELSE COALESCE(c.country_name_i18n->>'ar', c.country_name_i18n->>'en', c.country_code) END) AS box_country_name_ar,
                    COALESCE(bx.b_curr, CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_curr ELSE c.currency_code END) AS box_currency_code,
                    COALESCE(bx.b_fx, CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_fx ELSE COALESCE(c.admin_fx_rate, 1) END, 1) AS box_fx_rate,
                    COALESCE(bx.is_qualified, false) AS is_qualified,
                    COALESCE(bx.target_required_usd, CASE WHEN v_lens_cid IS NOT NULL THEN v_lens_target_usd ELSE c.monthly_target_usd END, 24.75) AS req_usd,
                    COALESCE(bx.acc_usd, 0.00) AS acc_usd,
                    COALESCE(bx.proj_carry_out_usd, 0.00) AS proj_carry_out_usd
                  FROM (SELECT 1) dummy
                  LEFT JOIN LATERAL (
                      SELECT bc.country_code AS b_cc,
                             COALESCE(bc.country_name_i18n->>'ar', bc.country_name_i18n->>'en', bc.country_code) AS b_name_ar,
                             bc.currency_code AS b_curr,
                             COALESCE(bc.admin_fx_rate, 1) AS b_fx,
                             tb.is_qualified,
                             tb.target_required_usd,
                             (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)) AS acc_usd,
                             CASE
                                 WHEN COALESCE(tb.carry_on_out_usd, 0) > 0 THEN tb.carry_on_out_usd
                                 WHEN tb.is_qualified THEN GREATEST(0.00, (tb.carry_on_in_usd + tb.current_month_purchases_usd) - tb.target_required_usd)
                                 ELSE (tb.carry_on_in_usd + tb.current_month_purchases_usd)
                             END AS proj_carry_out_usd
                        FROM %1$I.monthly_target_boxes tb
                        JOIN %1$I.countries bc ON bc.id = tb.country_id
                       WHERE tb.member_id = m.id
                         AND tb.period_ym = v_period_ym
                         AND (v_lens_cid IS NULL OR tb.country_id = v_lens_cid)
                       ORDER BY tb.is_qualified DESC,
                                (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)) DESC,
                                (tb.country_id = m.residency_country_id) DESC
                       LIMIT 1
                  ) bx ON true
            ) eff
           WHERE tc_r.ancestor_id = v_root.id
             AND tc_r.depth <= v_max_depth
           ORDER BY tc_r.depth ASC, m.placement_side DESC, m.member_code ASC
           LIMIT v_node_limit
      ) sliced;

    -- Power Bar respects active Country Lens (or ANY qualified country on ALL)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'left'),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'right'),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'left' AND EXISTS (
            SELECT 1 FROM %1$I.monthly_target_boxes tb
             WHERE tb.member_id = m.id AND tb.period_ym = v_period_ym AND tb.is_qualified = true
               AND (v_lens_cid IS NULL OR tb.country_id = v_lens_cid)
        )),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'right' AND EXISTS (
            SELECT 1 FROM %1$I.monthly_target_boxes tb
             WHERE tb.member_id = m.id AND tb.period_ym = v_period_ym AND tb.is_qualified = true
               AND (v_lens_cid IS NULL OR tb.country_id = v_lens_cid)
        )),
        COUNT(*) FILTER (WHERE m.created_at >= now() - interval '7 days'),
        COUNT(*) FILTER (WHERE m.created_at >= v_month_start AND m.created_at < v_month_end)
      INTO v_total_sub, v_left_total, v_right_total, v_left_qual, v_right_qual, v_new_7d, v_new_month
      FROM %1$I.tree_closure tc
      JOIN %1$I.members m ON m.id = tc.descendant_id
     WHERE tc.ancestor_id = v_viewer.id
       AND tc.depth > 0;

    v_weaker_side := CASE WHEN v_left_total < v_right_total THEN 'left' ELSE 'right' END;

    IF v_viewer.right_child_id IS NULL THEN
        v_spill_parent := v_viewer.member_code;
        v_spill_side   := 'right';
    ELSIF v_viewer.left_child_id IS NULL THEN
        v_spill_parent := v_viewer.member_code;
        v_spill_side   := 'left';
    ELSE
        SELECT cand.member_code,
               CASE WHEN cand.right_child_id IS NULL THEN 'right' ELSE 'left' END
          INTO v_spill_parent, v_spill_side
          FROM %1$I.tree_closure tc
          JOIN %1$I.members cand ON cand.id = tc.descendant_id
         WHERE tc.ancestor_id = v_viewer.id
           AND tc.depth > 0
           AND tc.root_arm_side = v_weaker_side
           AND (cand.right_child_id IS NULL OR cand.left_child_id IS NULL)
           AND cand.is_tombstone_banned = false
         ORDER BY tc.depth ASC,
                  (CASE WHEN cand.right_child_id IS NULL AND cand.left_child_id IS NULL THEN 0 ELSE 1 END) ASC,
                  cand.created_at ASC
         LIMIT 1;
    END IF;

    -- Stage 28: Available Countries includes BOTH residency countries AND any country where team has active boxes!
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'country_code', cc_stats.country_code,
        'country_name_ar', cc_stats.country_name_ar,
        'count', cc_stats.cnt,
        'qualified', cc_stats.q_cnt
    ) ORDER BY cc_stats.q_cnt DESC, cc_stats.cnt DESC, cc_stats.country_code ASC), '[]'::jsonb)
      INTO v_avail_cc
      FROM (
          SELECT c.country_code,
                 COALESCE(c.country_name_i18n->>'ar', c.country_name_i18n->>'en', c.country_code) AS country_name_ar,
                 COUNT(DISTINCT sub.member_id) AS cnt,
                 COUNT(DISTINCT sub.member_id) FILTER (WHERE sub.is_qual) AS q_cnt
            FROM (
                SELECT m.id AS member_id,
                       m.residency_country_id AS cid,
                       EXISTS (
                           SELECT 1 FROM %1$I.monthly_target_boxes tb0
                            WHERE tb0.member_id = m.id AND tb0.country_id = m.residency_country_id
                              AND tb0.period_ym = v_period_ym AND tb0.is_qualified = true
                       ) AS is_qual
                  FROM %1$I.tree_closure tc
                  JOIN %1$I.members m ON m.id = tc.descendant_id
                 WHERE tc.ancestor_id = v_viewer.id
                   AND tc.depth > 0
                UNION
                SELECT tb.member_id,
                       tb.country_id AS cid,
                       tb.is_qualified AS is_qual
                  FROM %1$I.tree_closure tc
                  JOIN %1$I.monthly_target_boxes tb ON tb.member_id = tc.descendant_id
                 WHERE tc.ancestor_id = v_viewer.id
                   AND tc.depth >= 0
                   AND tb.period_ym = v_period_ym
                   AND (tb.is_qualified = true OR (tb.carry_on_in_usd + tb.current_month_purchases_usd) > 0)
            ) sub
            JOIN %1$I.countries c ON c.id = sub.cid
           GROUP BY c.country_code, c.country_name_i18n
      ) cc_stats;

    SELECT COUNT(DISTINCT t.member_id), COUNT(*)
      INTO v_tx_members, v_tx_count
      FROM %1$I.tree_closure tc
      JOIN %1$I.transactions t ON t.member_id = tc.descendant_id
     WHERE tc.ancestor_id = v_viewer.id
       AND tc.depth > 0
       AND t.status = 'completed'
       AND COALESCE(t.completed_at, t.created_at) >= v_month_start
       AND COALESCE(t.completed_at, t.created_at) < v_month_end
       AND (v_lens_cid IS NULL OR t.country_id = v_lens_cid);

    SELECT COUNT(*),
           COALESCE(jsonb_agg(nq.obj ORDER BY nq.pct DESC), '[]'::jsonb)
      INTO v_near_cnt, v_near_qual
      FROM (
          SELECT
              pct,
              jsonb_build_object(
                  'member_code', m.member_code,
                  'full_name', m.full_name,
                  'country_code', bc.country_code,
                  'currency_code', bc.currency_code,
                  'depth', tc.depth,
                  'progress_pct', pct,
                  'remaining_usd', rem_usd,
                  'remaining_local', ROUND((rem_usd * COALESCE(bc.admin_fx_rate, 1))::numeric, 2),
                  'phone', CASE WHEN tc.depth BETWEEN 1 AND 10 THEN m.phone ELSE NULL END
              ) AS obj
            FROM %1$I.tree_closure tc
            JOIN %1$I.members m ON m.id = tc.descendant_id
            JOIN %1$I.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.period_ym = v_period_ym
             AND (v_lens_cid IS NULL OR tb.country_id = v_lens_cid)
            JOIN %1$I.countries bc ON bc.id = tb.country_id
            CROSS JOIN LATERAL (
                SELECT
                    ROUND(((COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)) / NULLIF(COALESCE(tb.target_required_usd, 24.75), 0) * 100.0)::numeric, 1) AS pct,
                    ROUND(GREATEST(0, COALESCE(tb.target_required_usd, 24.75) - (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)))::numeric, 2) AS rem_usd
            ) calc
           WHERE tc.ancestor_id = v_viewer.id
             AND tc.depth BETWEEN 1 AND v_s01
             AND m.is_tombstone_banned = false
             AND COALESCE(tb.is_qualified, false) = false
             AND calc.pct >= 70.0 AND calc.pct < 100.0
           ORDER BY calc.pct DESC
           LIMIT 12
      ) nq;

    SELECT COUNT(*),
           COALESCE(jsonb_agg(ru.obj ORDER BY ru.qual_downlines DESC), '[]'::jsonb)
      INTO v_rollup_cnt, v_rollup_risk
      FROM (
          SELECT
              q_down.qual_downlines,
              jsonb_build_object(
                  'member_code', m.member_code,
                  'full_name', m.full_name,
                  'country_code', c.country_code,
                  'currency_code', c.currency_code,
                  'depth', tc.depth,
                  'qualified_downlines', q_down.qual_downlines,
                  'at_risk_usd', ROUND((q_down.qual_downlines * v_unit_share)::numeric, 2),
                  'at_risk_local', ROUND((q_down.qual_downlines * v_unit_share * COALESCE(c.admin_fx_rate, 1))::numeric, 2),
                  'phone', CASE WHEN tc.depth BETWEEN 1 AND 10 THEN m.phone ELSE NULL END
              ) AS obj
            FROM %1$I.tree_closure tc
            JOIN %1$I.members m ON m.id = tc.descendant_id
            JOIN %1$I.countries c ON c.id = COALESCE(v_lens_cid, m.residency_country_id)
            CROSS JOIN LATERAL (
                SELECT COUNT(DISTINCT tb2.member_id) AS qual_downlines
                  FROM %1$I.tree_closure tsub
                  JOIN %1$I.monthly_target_boxes tb2
                    ON tb2.member_id = tsub.descendant_id
                   AND tb2.period_ym = v_period_ym
                   AND tb2.is_qualified = true
                   AND (v_lens_cid IS NULL OR tb2.country_id = v_lens_cid)
                 WHERE tsub.ancestor_id = m.id
                   AND tsub.depth BETWEEN 1 AND v_s01
            ) q_down
           WHERE tc.ancestor_id = v_viewer.id
             AND tc.depth BETWEEN 1 AND v_s01
             AND m.is_tombstone_banned = false
             AND NOT EXISTS (
                 SELECT 1 FROM %1$I.monthly_target_boxes tb
                  WHERE tb.member_id = m.id AND tb.period_ym = v_period_ym AND tb.is_qualified = true
                    AND (v_lens_cid IS NULL OR tb.country_id = v_lens_cid)
             )
             AND q_down.qual_downlines > 0
           ORDER BY q_down.qual_downlines DESC
           LIMIT 12
      ) ru;

    -- Single Source of Truth for open-month estimated commission (includes Maker Share + Stopper 11 + D1 Threshold!)
    v_analytics := %1$I.get_tree_analytics_with_country_lens(v_viewer.id, v_period_ym, v_eff_cc);
    v_est_comm_usd   := COALESCE((v_analytics->>'total_actual_incl_self_usd')::numeric, 0.00);
    v_self_share_usd := COALESCE((v_analytics->>'viewer_self_share_usd')::numeric, 0.00);
    v_at_risk_usd    := COALESCE((v_analytics->>'at_risk_rollup_usd')::numeric, 0.00);

    SELECT COALESCE(SUM(cd.share_amount_usd), 0.00)
      INTO v_prev_comm_usd
      FROM %1$I.commission_distributions cd
      JOIN %1$I.pool_transactions pt ON pt.id = cd.pool_transaction_id
      JOIN %1$I.monthly_target_boxes mb ON mb.id = pt.target_box_id
     WHERE cd.beneficiary_id = v_viewer.id
       AND mb.period_ym = v_prev_period_ym;

    IF v_prev_comm_usd > 0 THEN
        v_comm_delta_pct := ROUND((((v_est_comm_usd - v_prev_comm_usd) / v_prev_comm_usd) * 100.0)::numeric, 1);
    ELSIF v_est_comm_usd > 0 THEN
        v_comm_delta_pct := 100.0;
    ELSE
        v_comm_delta_pct := 0.0;
    END IF;

    RETURN jsonb_build_object(
        'viewer_code', v_viewer.member_code,
        'root_code', v_root.member_code,
        'period_ym', v_period_ym,
        'lens_country_code', COALESCE(v_eff_cc, 'ALL'),
        'max_depth', v_max_depth,
        'node_limit', v_node_limit,
        's01_gens', v_s01,
        's02_slots', v_s02,
        'total_subtree_members', v_total_sub,
        'breadcrumb', v_breadcrumb,
        'nodes', v_nodes,
        'available_countries', v_avail_cc,
        'power_bar', jsonb_build_object(
            'left_total', v_left_total,
            'right_total', v_right_total,
            'left_qualified', v_left_qual,
            'right_qualified', v_right_qual,
            'weaker_side', v_weaker_side,
            'next_spillover_parent_code', v_spill_parent,
            'next_spillover_side', v_spill_side
        ),
        'tree_pulse', jsonb_build_object(
            'new_members_7d', v_new_7d,
            'new_members_month', v_new_month,
            'active_transactors_month', v_tx_members,
            'tx_count_month', v_tx_count,
            'near_qualification_count', v_near_cnt,
            'near_qualification_members', v_near_qual,
            'rollup_risk_count', v_rollup_cnt,
            'rollup_risk_members', v_rollup_risk,
            'estimated_month_commission_usd', v_est_comm_usd,
            'viewer_self_share_usd', v_self_share_usd,
            'at_risk_rollup_usd', v_at_risk_usd,
            'prev_month_commission_usd', v_prev_comm_usd,
            'commission_delta_pct', v_comm_delta_pct,
            'unit_share_usd', v_unit_share
        )
    );
END;
$body$;

$fn$, v_schema);
        EXECUTE v_sql;

        -- 3) get_admin_sovereign_bundle
        v_sql := format($fn$
CREATE OR REPLACE FUNCTION %1$I.get_admin_sovereign_bundle(
    p_admin_id uuid,
    p_session_token text,
    p_period_ym character DEFAULT NULL::bpchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $body$

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
    v_admin_info := %1$I.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    v_period_ym  := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));

    -- 1. فحص المطابقة الصفرية الحية على دفتر الأستاذ المزدوج (Zero-Discrepancy Gate — P0-7 / D23)
    SELECT COALESCE(SUM(debit_usd), 0.00), COALESCE(SUM(credit_usd), 0.00)
      INTO v_sum_dr, v_sum_cr
      FROM %1$I.journal_lines;

    SELECT COUNT(*) INTO v_unbal_je
      FROM (
          SELECT journal_entry_id
            FROM %1$I.journal_lines
           GROUP BY journal_entry_id
          HAVING COALESCE(SUM(debit_usd), 0.00) <> COALESCE(SUM(credit_usd), 0.00)
      ) x;

    SELECT COUNT(*) INTO v_bad_pools
      FROM %1$I.pool_transactions pt
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
            FROM %1$I.chart_of_accounts coa
            LEFT JOIN %1$I.journal_lines jl ON jl.account_code = coa.account_code
           GROUP BY coa.account_code, coa.account_name_ar, coa.account_name_en, coa.normal_balance
      ) tb;

    -- 2. المؤشرات السيادية الحية (KPIs)
    v_kpis := jsonb_build_object(
        'period_ym', v_period_ym,
        'members_total', (SELECT COUNT(*) FROM %1$I.members WHERE member_code > 0),
        'members_active', (SELECT COUNT(*) FROM %1$I.members WHERE member_code > 0 AND is_tombstone_banned = false AND is_active_in_tree = true),
        'members_pending_kyc', (SELECT COUNT(*) FROM %1$I.members WHERE member_code > 0 AND kyc_status = 'pending'),
        'members_banned', (SELECT COUNT(*) FROM %1$I.members WHERE member_code > 0 AND is_tombstone_banned = true),
        'members_with_root', (SELECT COUNT(*) FROM %1$I.members),
        'qualified_members_period', (SELECT COUNT(DISTINCT member_id) FROM %1$I.monthly_target_boxes WHERE period_ym = v_period_ym AND is_qualified = true),
        'merchants_total', (SELECT COUNT(*) FROM %1$I.merchants),
        'merchants_active', (SELECT COUNT(*) FROM %1$I.merchants WHERE is_active = true AND is_isolated = false),
        'merchants_isolated', (SELECT COUNT(*) FROM %1$I.merchants WHERE is_isolated = true),
        'transactions_total', (SELECT COUNT(*) FROM %1$I.transactions),
        'transactions_completed', (SELECT COUNT(*) FROM %1$I.transactions WHERE status = 'completed'),
        'transactions_pending', (SELECT COUNT(*) FROM %1$I.transactions WHERE status IN ('pending', 'awaiting_merchant_topup')),
        'transactions_awaiting_topup', (SELECT COUNT(*) FROM %1$I.transactions WHERE status = 'awaiting_merchant_topup'),
        'transactions_pending_review', (SELECT COUNT(*) FROM %1$I.transactions WHERE status = 'pending'),
        'awaiting_topup_gmv_usd', (SELECT COALESCE(ROUND(SUM(total_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM %1$I.transactions WHERE status = 'awaiting_merchant_topup'),
        'awaiting_topup_commission_usd', (SELECT COALESCE(ROUND(SUM(commission_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM %1$I.transactions WHERE status = 'awaiting_merchant_topup'),
        'gmv_local_completed', (SELECT COALESCE(SUM(total_amount), 0.00) FROM %1$I.transactions WHERE status = 'completed'),
        'commission_local_completed', (SELECT COALESCE(SUM(commission_amount), 0.00) FROM %1$I.transactions WHERE status = 'completed'),
        'gmv_usd_completed', (SELECT COALESCE(ROUND(SUM(total_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM %1$I.transactions WHERE status = 'completed'),
        'commission_usd_completed', (SELECT COALESCE(ROUND(SUM(commission_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM %1$I.transactions WHERE status = 'completed'),
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
                  FROM %1$I.transactions
                 WHERE status = 'completed'
                 GROUP BY currency_code
            ) x
        ), '[]'::jsonb),
        'treasury_revenue_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM %1$I.journal_lines WHERE account_code IN ('4101', '4102', '4103')),
        'plan_pool_liability_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM %1$I.journal_lines WHERE account_code = '2201'),
        'merchant_prepaid_float_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM %1$I.journal_lines WHERE account_code = '2101'),
        'member_wallets_payable_usd', (SELECT COALESCE(SUM(balance_usd), 0.00) FROM %1$I.wallets),
        's03_suspense_usd', (SELECT COALESCE(SUM(s03_suspense_balance_usd), 0.00) FROM %1$I.wallets),
        'rounding_4301_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM %1$I.journal_lines WHERE account_code = '4301'),
        'pending_mc_requests', (SELECT COUNT(*) FROM %1$I.maker_checker_requests WHERE status = 'pending'),
        'open_disputes', (SELECT COUNT(*) FROM %1$I.dispute_tickets WHERE status IN ('awaiting_merchant_friendly', 'escalated_to_admin', 'appealed_72h')),
        'pending_gouging_reports', (SELECT COUNT(*) FROM %1$I.price_gouging_reports WHERE verification_status = 'pending'),
        'open_fraud_signals', (SELECT COUNT(*) FROM %1$I.fraud_graph_signals WHERE status IN ('open', 'payout_held')),
        'pending_withdrawals', (SELECT COUNT(*) FROM %1$I.wallet_transactions WHERE transaction_type = 'withdrawal' AND status = 'processing_payout'),
        'corporate_partners_count', (SELECT COUNT(*) FROM %1$I.partners WHERE is_active = true)
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
                 (SELECT COUNT(*) FROM %1$I.merchants m WHERE m.country_id = c.id AND m.is_active = true) AS active_merchants_count,
                 (SELECT COUNT(*) FROM %1$I.transactions t WHERE t.country_id = c.id AND t.status = 'completed') AS completed_tx_count,
                 (SELECT COUNT(*) FROM %1$I.members mem WHERE mem.residency_country_id = c.id AND mem.member_code > 0) AS resident_members_count
            FROM %1$I.countries c
            CROSS JOIN LATERAL (
                SELECT GREATEST(COALESCE(s.numerical_stopper_s01, 11), 1) AS s01_gens,
                       GREATEST(COALESCE(s.upline_ceiling_s02, 11), 1) AS s02_slots
                  FROM %1$I.settings s
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
            FROM %1$I.settings s
            LEFT JOIN %1$I.countries c ON c.id = s.country_id
           ORDER BY s.recorded_at DESC
           LIMIT 15
      ) st;

    -- 5. دورات الإقفال الشهري ذات الـ 6 خطوات (D3 / D28)
    SELECT COALESCE(jsonb_agg(row_to_json(sc)::jsonb ORDER BY sc.period_ym DESC, sc.country_code ASC), '[]'::jsonb)
      INTO v_cycles
      FROM (
          SELECT cyc.*, c.country_code, c.currency_code,
                 am.full_name AS maker_name, ac.full_name AS checker_name,
                 (SELECT COUNT(*) FROM %1$I.pool_transactions pt WHERE pt.settlement_cycle_id = cyc.id) AS pools_count
            FROM %1$I.settlement_cycles cyc
            JOIN %1$I.countries c ON c.id = cyc.country_id
            LEFT JOIN %1$I.admins am ON am.id = cyc.maker_admin_id
            LEFT JOIN %1$I.admins ac ON ac.id = cyc.checker_admin_id
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
            FROM %1$I.maker_checker_requests r
            JOIN %1$I.admins am ON am.id = r.maker_admin_id
            LEFT JOIN %1$I.admins ac ON ac.id = r.checker_admin_id
           ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
           LIMIT 40
      ) mc;

    -- 7. طابور مراجعة العروض الخاطفة للتجار (Point 12)
    SELECT COALESCE(jsonb_agg(row_to_json(fo)::jsonb ORDER BY fo.created_at DESC), '[]'::jsonb)
      INTO v_flash_queue
      FROM (
          SELECT n.id, n.event_name, n.payload, n.created_at
            FROM %1$I.notifications n
           WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
           ORDER BY CASE WHEN n.event_name = 'MerchantFlashOfferPending' THEN 0 ELSE 1 END, n.created_at DESC
           LIMIT 20
      ) fo;

    -- 8. قائمة الأعضاء وحالة التأهل متعددة الدول والمحافظ والـ KYC (Stage 28: بدون قص عند 60 وبتوحيد الصناديق والمرحل المتوقع)
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
                 COALESCE(bx.current_purchases_usd, 0.000000) AS current_purchases_usd,
                 COALESCE(bx.carry_on_in_usd, 0.000000) AS carry_on_in_usd,
                 COALESCE(bx.carry_on_out_usd, 0.000000) AS carry_on_out_usd,
                 COALESCE(bx.is_qualified_period, false) AS is_qualified_period,
                 COALESCE(bx.qualified_countries, ARRAY[]::text[]) AS qualified_countries,
                 COALESCE(bx.country_boxes, '[]'::jsonb) AS country_boxes
            FROM %1$I.members m
            JOIN %1$I.countries c ON c.id = m.residency_country_id
            LEFT JOIN %1$I.members sp ON sp.id = m.sponsor_id
            LEFT JOIN %1$I.members pr ON pr.id = m.parent_member_id
            LEFT JOIN %1$I.wallets w ON w.member_id = m.id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(tb.current_month_purchases_usd), 0.000000) AS current_purchases_usd,
                       COALESCE(SUM(tb.carry_on_in_usd), 0.000000) AS carry_on_in_usd,
                       COALESCE(SUM(
                           CASE
                               WHEN COALESCE(tb.carry_on_out_usd, 0) > 0 THEN tb.carry_on_out_usd
                               WHEN tb.is_qualified THEN GREATEST(0.00, (tb.carry_on_in_usd + tb.current_month_purchases_usd) - tb.target_required_usd)
                               ELSE (tb.carry_on_in_usd + tb.current_month_purchases_usd)
                           END
                       ), 0.000000) AS carry_on_out_usd,
                       COALESCE(bool_or(tb.is_qualified), false) AS is_qualified_period,
                       COALESCE(array_agg(DISTINCT bc.country_code::text) FILTER (WHERE tb.is_qualified = true), ARRAY[]::text[]) AS qualified_countries,
                       COALESCE(jsonb_agg(jsonb_build_object(
                           'country_code', bc.country_code,
                           'currency_code', bc.currency_code,
                           'carry_on_in_usd', ROUND(tb.carry_on_in_usd::numeric, 2),
                           'current_purchases_usd', ROUND(tb.current_month_purchases_usd::numeric, 2),
                           'target_required_usd', ROUND(tb.target_required_usd::numeric, 2),
                           'projected_carry_on_out_usd', ROUND((
                               CASE
                                   WHEN COALESCE(tb.carry_on_out_usd, 0) > 0 THEN tb.carry_on_out_usd
                                   WHEN tb.is_qualified THEN GREATEST(0.00, (tb.carry_on_in_usd + tb.current_month_purchases_usd) - tb.target_required_usd)
                                   ELSE (tb.carry_on_in_usd + tb.current_month_purchases_usd)
                               END
                           )::numeric, 2),
                           'is_qualified', tb.is_qualified
                       ) ORDER BY tb.is_qualified DESC, bc.country_code ASC), '[]'::jsonb) AS country_boxes
                  FROM %1$I.monthly_target_boxes tb
                  JOIN %1$I.countries bc ON bc.id = tb.country_id
                 WHERE tb.member_id = m.id
                   AND tb.period_ym = v_period_ym
            ) bx ON true
           ORDER BY m.member_code ASC
           LIMIT 500
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
                 (SELECT COUNT(*) FROM %1$I.merchant_branches mb WHERE mb.merchant_id = m.id) AS branches_count,
                 (SELECT COUNT(*) FROM %1$I.transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS ops_count,
                 (SELECT COUNT(*) FROM %1$I.transactions t WHERE t.merchant_id = m.id AND t.status = 'awaiting_merchant_topup') AS fifo_queue_count,
                 (SELECT COALESCE(SUM(t.total_amount), 0.00) FROM %1$I.transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS gmv_completed,
                 NULLIF(m.metadata->>'logo_url', '') AS logo_url,
                 NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
                 CASE WHEN jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images,
                 COALESCE(m.metadata->'kyc_docs', '{}'::jsonb) AS kyc_docs
            FROM %1$I.merchants m
            JOIN %1$I.countries c ON c.id = m.country_id
           ORDER BY m.created_at DESC
           LIMIT 250
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
            FROM %1$I.transactions t
            JOIN %1$I.countries c ON c.id = t.country_id
            JOIN %1$I.members mem ON mem.id = t.member_id
            JOIN %1$I.merchants mer ON mer.id = t.merchant_id
            LEFT JOIN %1$I.merchant_branches mb ON mb.id = t.branch_id
            LEFT JOIN %1$I.b2b_tax_invoices bti ON bti.transaction_id = t.id AND bti.document_type = 'tax_invoice'
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
                 ROUND((EXTRACT(EPOCH FROM (d.sla_deadline_at - %1$I.now_utc())) / 3600.0)::numeric, 1) AS sla_hours_left,
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
                         (SELECT SUM(pt.members_share_usd) FROM %1$I.pool_transactions pt WHERE pt.target_box_id = mb.id),
                         mb.target_required_usd * 0.70
                     )::numeric, 2)
                     ELSE 0.00
                 END AS estimated_commission_at_stake_usd
            FROM %1$I.dispute_tickets d
            JOIN %1$I.transactions t ON t.id = d.transaction_id
            JOIN %1$I.countries c ON c.id = t.country_id
            JOIN %1$I.members mem ON mem.id = d.member_id
            JOIN %1$I.merchants mer ON mer.id = d.merchant_id
            LEFT JOIN %1$I.monthly_target_boxes mb
              ON mb.member_id = t.member_id
             AND mb.country_id = t.country_id
             AND mb.period_ym = COALESCE(
                     t.commission_snapshot->>'effective_period_ym',
                     to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')
                 )
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(t2.income_plan_share_usd), 0.000000) AS disputed_usd
                  FROM %1$I.dispute_tickets d2
                  JOIN %1$I.transactions t2 ON t2.id = d2.transaction_id
                  JOIN %1$I.countries c2 ON c2.id = t2.country_id
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
            FROM %1$I.price_gouging_reports p
            JOIN %1$I.transactions t ON t.id = p.transaction_id
            JOIN %1$I.members mem ON mem.id = p.member_id
            JOIN %1$I.merchants mer ON mer.id = p.merchant_id
           ORDER BY p.created_at DESC
           LIMIT 30
      ) pg;

    SELECT COALESCE(jsonb_agg(row_to_json(fg)::jsonb ORDER BY fg.created_at DESC), '[]'::jsonb)
      INTO v_fraud
      FROM (
          SELECT f.*, mer.merchant_code, mer.business_name AS merchant_name
            FROM %1$I.fraud_graph_signals f
            LEFT JOIN %1$I.merchants mer ON mer.id = f.involved_merchant_id
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
            FROM %1$I.wallet_transactions wt
            JOIN %1$I.wallets w ON w.id = wt.wallet_id
            JOIN %1$I.members mem ON mem.id = w.member_id
           WHERE wt.transaction_type = 'withdrawal'
           ORDER BY wt.created_at DESC
           LIMIT 30
      ) wd;

    SELECT COALESCE(jsonb_agg(row_to_json(st)::jsonb ORDER BY st.created_at DESC), '[]'::jsonb)
      INTO v_tickets
      FROM (
          SELECT s.*
            FROM %1$I.support_tickets s
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
            FROM %1$I.partners p
           ORDER BY p.created_at DESC
      ) pt;

    -- 14. قائمة الإداريين وسجل التدقيق غير القابل للمحو مع فحص سلسلة التجزئة SHA-256
    SELECT COALESCE(jsonb_agg(row_to_json(ad)::jsonb ORDER BY ad.created_at ASC), '[]'::jsonb)
      INTO v_admins_list
      FROM (
          SELECT a.id, a.full_name, a.email, a.role, a.must_change_password,
                 a.two_factor_enabled, a.is_active, a.last_login_at, a.created_at
            FROM %1$I.admins a
           ORDER BY a.created_at ASC
      ) ad;

    SELECT COUNT(*) INTO v_chain_broken
      FROM (
          SELECT id, prev_row_hash,
                 LAG(row_hash) OVER (ORDER BY id ASC) AS expected_prev
            FROM %1$I.audit_logs
      ) ch
     WHERE ch.expected_prev IS NOT NULL AND ch.prev_row_hash IS DISTINCT FROM ch.expected_prev;

    SELECT COALESCE(jsonb_agg(row_to_json(al)::jsonb ORDER BY al.id DESC), '[]'::jsonb)
      INTO v_audit_logs
      FROM (
          SELECT l.id, l.actor_type, l.actor_id, l.action, l.table_name,
                 l.record_id, l.recorded_at, l.prev_row_hash, l.row_hash
            FROM %1$I.audit_logs l
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
            FROM %1$I.notifications n
           WHERE n.recipient_type = 'admin'
             AND n.event_name NOT IN ('MerchantFlashOfferApproved', 'MerchantFlashOfferRejected', 'MerchantBankTopupProofProcessed', 'MerchantBankTopupProofRejected')
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

$body$;
$fn$, v_schema);
        EXECUTE v_sql;

        -- 4) get_admin_full_tree
        v_sql := format($fn$
CREATE OR REPLACE FUNCTION %1$I.get_admin_full_tree(
    p_admin_id uuid,
    p_session_token text,
    p_root_member_code bigint DEFAULT 0,
    p_period_ym character DEFAULT NULL::bpchar,
    p_country_code character DEFAULT NULL::bpchar,
    p_max_depth integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $body$

DECLARE
    v_adm               JSONB;
    v_scope             VARCHAR(10) := 'GLOBAL';
    v_eff_cc            CHAR(2) := NULL;
    v_lens_cid          INT := NULL;
    v_lens_target_usd   NUMERIC(18,2) := NULL;
    v_s01               INT := 11;
    v_s02               INT := 11;
    v_period_ym         CHAR(7);
    v_root_code         BIGINT;
    v_root              %1$I.members%%ROWTYPE;
    v_root_cc           CHAR(2);
    v_max_depth         INT;
    v_max_nodes         INT := 2500;
    v_rec               RECORD;
    v_state_map         JSONB := '{}'::jsonb;
    v_parent_state      JSONB;
    v_parent_out        INT;
    v_parent_res        BOOLEAN;
    v_my_rank           INT;
    v_my_out            INT;
    v_my_res            BOOLEAN;
    v_color             VARCHAR(12);
    v_visual_color      VARCHAR(15);
    v_team_bucket       VARCHAR(24);
    v_pct               NUMERIC(6,1);
    v_nodes_json        JSONB := '[]'::jsonb;
    v_breadcrumb        JSONB := '[]'::jsonb;
    v_country_breakdown JSONB := '[]'::jsonb;
    v_company_total     BIGINT := 0;
    v_subtree_total     BIGINT := 0;
    v_rendered_total    BIGINT := 0;
    v_rendered_non_root BIGINT := 0;
    v_direct_leaders    BIGINT := 0;
    v_right_arm_cnt     BIGINT := 0;
    v_left_arm_cnt      BIGINT := 0;
    v_max_sub_depth     INT := 0;
    v_green_cnt         BIGINT := 0;
    v_orange_cnt        BIGINT := 0;
    v_white_cnt         BIGINT := 0;
    v_gray_cnt          BIGINT := 0;
    v_black_cnt         BIGINT := 0;
    v_banned_cnt        BIGINT := 0;
    v_truncated         BOOLEAN := false;
BEGIN
    v_adm := %1$I.verify_admin_session(p_admin_id, p_session_token, NULL, false);

    SELECT COALESCE(NULLIF(upper(trim(metadata->>'country_scope')), ''), 'GLOBAL')
      INTO v_scope
      FROM %1$I.admins
     WHERE id = p_admin_id;
    v_scope := COALESCE(v_scope, 'GLOBAL');

    IF v_scope <> 'GLOBAL' THEN
        v_eff_cc := v_scope;
    ELSE
        v_eff_cc := CASE
            WHEN upper(trim(COALESCE(p_country_code, ''))) IN ('', 'ALL') THEN NULL
            ELSE upper(trim(p_country_code))
        END;
    END IF;

    IF v_eff_cc IS NOT NULL THEN
        SELECT id, monthly_target_usd INTO v_lens_cid, v_lens_target_usd
          FROM %1$I.countries
         WHERE country_code = v_eff_cc;
    END IF;

    SELECT numerical_stopper_s01, upline_ceiling_s02
      INTO v_s01, v_s02
      FROM %1$I.settings
     WHERE effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;
    v_s01 := GREATEST(COALESCE(v_s01, 11), 1);
    v_s02 := GREATEST(COALESCE(v_s02, 11), 1);

    v_period_ym := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
    v_root_code := COALESCE(p_root_member_code, 0);
    v_max_depth := LEAST(GREATEST(COALESCE(p_max_depth, 15), 1), 40);

    SELECT * INTO v_root
      FROM %1$I.members
     WHERE member_code = v_root_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TREE_ROOT_MEMBER_NOT_FOUND: %%', v_root_code;
    END IF;

    SELECT country_code INTO v_root_cc
      FROM %1$I.countries
     WHERE id = v_root.residency_country_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'member_code', anc.member_code,
        'full_name', anc.full_name,
        'company_gen', anc.generation_in_tree
    ) ORDER BY tc.depth DESC), '[]'::jsonb)
      INTO v_breadcrumb
      FROM %1$I.tree_closure tc
      JOIN %1$I.members anc ON anc.id = tc.ancestor_id
     WHERE tc.descendant_id = v_root.id;

    FOR v_rec IN
        SELECT m.id,
               m.member_code,
               m.full_name,
               m.email,
               m.phone,
               MAX(NULLIF(trim(COALESCE(m.metadata->>'avatar_url', '')), '')) AS avatar_url,
               pm.member_code AS parent_member_code,
               sm.member_code AS sponsor_code,
               sm.full_name AS sponsor_name,
               m.placement_side,
               tc.root_arm_side AS viewer_root_arm,
               tc.depth AS rel_depth,
               m.generation_in_tree AS company_gen,
               m.residency_country_id,
               c_res.country_code AS res_cc,
               COALESCE(c_nat.country_code, c_res.country_code) AS nat_cc,
               c_res.currency_code AS res_curr,
               c_res.admin_fx_rate AS res_fx,
               c_res.monthly_target_usd AS res_target_usd,
               m.kyc_status,
               m.is_tombstone_banned,
               m.is_active_in_tree,
               (m.left_child_id IS NOT NULL) AS has_left_child,
               (m.right_child_id IS NOT NULL) AS has_right_child,
               COALESCE(w.balance_usd, 0.00) AS wallet_balance_usd,
               COALESCE(w.total_earned_usd, 0.00) AS total_earned_usd,
               m.created_at,
               m.parent_member_id,
               COALESCE(bool_or(b.is_qualified), false) AS any_qual,
               COALESCE(MAX(b_lens.is_qualified::int), 0) = 1 AS lens_qual,
               COALESCE(MAX(b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd), 0.00) AS lens_val,
               COALESCE(MAX(b.carry_on_in_usd + b.current_month_purchases_usd), 0.00) AS any_val,
               CASE
                   WHEN v_lens_cid IS NOT NULL THEN
                       ROUND(COALESCE(MAX(b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd + b_lens.compensatory_incoming_usd), 0.00)::numeric, 2)
                   ELSE
                       ROUND(COALESCE(MAX(b_best.accum_usd), 0.00)::numeric, 2)
               END AS box_accum_usd,
               CASE
                   WHEN v_lens_cid IS NOT NULL THEN
                       ROUND(COALESCE(MAX(b_lens.target_required_usd), v_lens_target_usd, 24.75)::numeric, 2)
                   ELSE
                       ROUND(COALESCE(MAX(b_best.target_required_usd), c_res.monthly_target_usd, 24.75)::numeric, 2)
               END AS target_req_usd,
               COALESCE(CASE WHEN v_lens_cid IS NOT NULL THEN v_eff_cc ELSE MAX(b_best.country_code) END, c_res.country_code) AS box_cc,
               ROUND(COALESCE(
                   CASE
                       WHEN v_lens_cid IS NOT NULL THEN
                           MAX(CASE
                               WHEN COALESCE(b_lens.carry_on_out_usd, 0) > 0 THEN b_lens.carry_on_out_usd
                               WHEN b_lens.is_qualified THEN GREATEST(0.00, (b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd) - b_lens.target_required_usd)
                               ELSE COALESCE(b_lens.carry_on_in_usd + b_lens.current_month_purchases_usd, 0.00)
                           END)
                       ELSE MAX(b_best.proj_carry_out)
                   END,
                   0.00
               )::numeric, 2) AS proj_carry_out_usd,
               COALESCE(
                   jsonb_agg(DISTINCT jsonb_build_object(
                       'country_code', bc_b.country_code,
                       'currency_code', bc_b.currency_code,
                       'accumulated_usd', ROUND((b.carry_on_in_usd + b.current_month_purchases_usd + b.compensatory_incoming_usd)::numeric, 2),
                       'target_required_usd', ROUND(b.target_required_usd::numeric, 2),
                       'projected_carry_on_out_usd', ROUND((
                           CASE
                               WHEN COALESCE(b.carry_on_out_usd, 0) > 0 THEN b.carry_on_out_usd
                               WHEN b.is_qualified THEN GREATEST(0.00, (b.carry_on_in_usd + b.current_month_purchases_usd) - b.target_required_usd)
                               ELSE (b.carry_on_in_usd + b.current_month_purchases_usd)
                           END
                       )::numeric, 2),
                       'is_qualified', b.is_qualified
                   )) FILTER (WHERE b.id IS NOT NULL),
                   '[]'::jsonb
               ) AS country_boxes,
               COALESCE(MAX(b_maker.maker_share_usd), 0.00) AS maker_share_usd,
               COALESCE(MAX(dl_agg.dl_est_usd), 0.00) AS dl_est_usd,
               COALESCE(MAX(dl_agg.dl_at_risk_usd), 0.00) AS dl_at_risk_usd,
               COALESCE(MAX(sub_agg.sub_total), 0) AS sub_total,
               COALESCE(MAX(sub_agg.sub_left), 0) AS sub_left,
               COALESCE(MAX(sub_agg.sub_right), 0) AS sub_right
          FROM %1$I.tree_closure tc
          JOIN %1$I.members m ON m.id = tc.descendant_id
          JOIN %1$I.countries c_res ON c_res.id = m.residency_country_id
          LEFT JOIN %1$I.countries c_nat ON c_nat.id = m.nationality_country_id
          LEFT JOIN %1$I.members pm ON pm.id = m.parent_member_id
          LEFT JOIN %1$I.members sm ON sm.id = m.sponsor_id
          LEFT JOIN %1$I.wallets w ON w.member_id = m.id
          LEFT JOIN %1$I.monthly_target_boxes b
                 ON b.member_id = m.id AND b.period_ym = v_period_ym
          LEFT JOIN %1$I.countries bc_b ON bc_b.id = b.country_id
          LEFT JOIN %1$I.monthly_target_boxes b_lens
                 ON b_lens.member_id = m.id AND b_lens.period_ym = v_period_ym AND b_lens.country_id = v_lens_cid
          LEFT JOIN LATERAL (
              SELECT b2.country_id,
                     c2.country_code,
                     b2.target_required_usd,
                     (b2.carry_on_in_usd + b2.current_month_purchases_usd + b2.compensatory_incoming_usd) AS accum_usd,
                     CASE
                         WHEN COALESCE(b2.carry_on_out_usd, 0) > 0 THEN b2.carry_on_out_usd
                         WHEN b2.is_qualified THEN GREATEST(0.00, (b2.carry_on_in_usd + b2.current_month_purchases_usd) - b2.target_required_usd)
                         ELSE (b2.carry_on_in_usd + b2.current_month_purchases_usd)
                     END AS proj_carry_out
                FROM %1$I.monthly_target_boxes b2
                JOIN %1$I.countries c2 ON c2.id = b2.country_id
               WHERE b2.member_id = m.id
                 AND b2.period_ym = v_period_ym
               ORDER BY b2.is_qualified DESC,
                        (b2.carry_on_in_usd + b2.current_month_purchases_usd + b2.compensatory_incoming_usd) DESC,
                        (b2.country_id = m.residency_country_id) DESC
               LIMIT 1
          ) b_best ON true
          LEFT JOIN LATERAL (
              SELECT ROUND(COALESCE(SUM(TRUNC(bm.target_required_usd / v_s02, 2)), 0.00)::numeric, 2) AS maker_share_usd
                FROM %1$I.monthly_target_boxes bm
               WHERE bm.member_id = m.id
                 AND bm.period_ym = v_period_ym
                 AND bm.is_qualified = true
                 AND (v_lens_cid IS NULL OR bm.country_id = v_lens_cid)
          ) b_maker ON true
          LEFT JOIN (
              SELECT tc_dl.ancestor_id AS member_id,
                     ROUND(COALESCE(SUM(
                         CASE
                             WHEN COALESCE(b_anc.is_qualified, false) = true AND tc_dl.depth <= v_s01
                             THEN TRUNC(b_dl.target_required_usd / v_s02, 2)
                             ELSE 0.00
                         END
                     ), 0.00)::numeric, 2) AS dl_est_usd,
                     ROUND(COALESCE(SUM(
                         CASE
                             WHEN COALESCE(b_anc.is_qualified, false) = false
                              AND b_dl.country_id = m_anc.residency_country_id
                              AND tc_dl.depth <= v_s01
                             THEN TRUNC(b_dl.target_required_usd / v_s02, 2)
                             ELSE 0.00
                         END
                     ), 0.00)::numeric, 2) AS dl_at_risk_usd
                FROM %1$I.tree_closure tc_dl
                JOIN %1$I.members m_anc ON m_anc.id = tc_dl.ancestor_id AND m_anc.member_code > 0
                JOIN %1$I.members m_dl ON m_dl.id = tc_dl.descendant_id AND m_dl.is_tombstone_banned = false
                JOIN %1$I.monthly_target_boxes b_dl
                  ON b_dl.member_id = m_dl.id
                 AND b_dl.period_ym = v_period_ym
                 AND b_dl.is_qualified = true
                 AND (v_lens_cid IS NULL OR b_dl.country_id = v_lens_cid)
                LEFT JOIN %1$I.monthly_target_boxes b_anc
                  ON b_anc.member_id = m_anc.id
                 AND b_anc.country_id = b_dl.country_id
                 AND b_anc.period_ym = v_period_ym
               WHERE tc_dl.depth >= 1
                 AND tc_dl.ancestor_id IN (
                     SELECT tc2.descendant_id
                       FROM %1$I.tree_closure tc2
                      WHERE tc2.ancestor_id = v_root.id
                        AND tc2.depth <= v_max_depth
                 )
               GROUP BY tc_dl.ancestor_id
          ) dl_agg ON dl_agg.member_id = m.id
          LEFT JOIN (
              SELECT st.ancestor_id,
                     COUNT(*) FILTER (WHERE st.depth >= 1) AS sub_total,
                     COUNT(*) FILTER (WHERE st.depth >= 1 AND st.root_arm_side = 'left') AS sub_left,
                     COUNT(*) FILTER (WHERE st.depth >= 1 AND st.root_arm_side = 'right') AS sub_right
                FROM %1$I.tree_closure st
               WHERE st.ancestor_id IN (
                   SELECT tc2.descendant_id
                     FROM %1$I.tree_closure tc2
                    WHERE tc2.ancestor_id = v_root.id
                      AND tc2.depth <= v_max_depth
               )
               GROUP BY st.ancestor_id
          ) sub_agg ON sub_agg.ancestor_id = m.id
         WHERE tc.ancestor_id = v_root.id
           AND tc.depth <= v_max_depth
         GROUP BY m.id, m.member_code, m.full_name, m.email, m.phone,
                  m.parent_member_id, pm.member_code, sm.member_code, sm.full_name,
                  m.placement_side, tc.root_arm_side, tc.depth, m.generation_in_tree,
                  m.residency_country_id, c_res.country_code, c_nat.country_code,
                  c_res.currency_code, c_res.admin_fx_rate, c_res.monthly_target_usd,
                  m.kyc_status, m.is_tombstone_banned, m.is_active_in_tree,
                  m.left_child_id, m.right_child_id,
                  w.balance_usd, w.total_earned_usd, m.created_at
         ORDER BY tc.depth ASC, m.member_code ASC
         LIMIT v_max_nodes
    LOOP
        IF v_rec.member_code = 0 THEN
            v_color         := 'ROOT';
            v_visual_color  := 'ROOT';
            v_team_bucket   := 'COMPANY_ROOT';
            v_my_rank       := NULL;
            v_my_out        := 0;
            v_my_res        := false;
        ELSE
            IF v_rec.is_tombstone_banned THEN
                v_color := 'BANNED';
            ELSIF v_lens_cid IS NOT NULL THEN
                IF v_rec.lens_qual THEN v_color := 'GREEN';
                ELSIF v_rec.lens_val > 0 THEN v_color := 'ORANGE';
                ELSIF v_rec.residency_country_id = v_lens_cid THEN v_color := 'WHITE';
                ELSE v_color := 'BLACK';
                END IF;
            ELSE
                IF v_rec.any_qual THEN v_color := 'GREEN';
                ELSIF v_rec.any_val > 0 THEN v_color := 'ORANGE';
                ELSE v_color := 'WHITE';
                END IF;
            END IF;

            IF v_root.member_code = 0 THEN
                v_my_rank      := NULL;
                v_my_out       := 0;
                v_my_res       := false;
                v_visual_color := v_color;
                v_team_bucket  := CASE
                    WHEN v_color = 'BANNED' THEN 'BANNED'
                    WHEN v_color = 'GREEN'  THEN 'QUALIFIED'
                    WHEN v_color = 'ORANGE' THEN 'IN_PROGRESS'
                    WHEN v_color = 'BLACK'  THEN 'OUTSIDE_LENS'
                    ELSE 'UNQUALIFIED'
                END;
            ELSE
                IF v_rec.rel_depth = 0 THEN
                    v_my_rank := 1;
                    v_my_out  := 1;
                    v_my_res  := false;
                ELSE
                    v_parent_state := v_state_map -> (v_rec.parent_member_id::text);
                    v_parent_out   := COALESCE((v_parent_state->>'out')::int, 0);
                    v_parent_res   := COALESCE((v_parent_state->>'res')::boolean, false);

                    IF v_parent_res OR v_parent_out >= v_s01 THEN
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
                    WHEN v_color = 'BANNED' THEN 'BANNED'
                    WHEN v_color = 'BLACK'  THEN 'BLACK'
                    WHEN v_my_res           THEN 'GRAY'
                    ELSE v_color
                END;

                v_team_bucket := CASE
                    WHEN v_color = 'BANNED'   THEN 'BANNED'
                    WHEN v_my_res             THEN 'RESERVE_TEAM'
                    WHEN v_my_rank IS NOT NULL THEN 'COMMISSION_TEAM'
                    ELSE 'UNQUALIFIED_SKIPPED'
                END;
            END IF;
        END IF;

        v_state_map := v_state_map || jsonb_build_object(
            v_rec.id::text,
            jsonb_build_object('out', COALESCE(v_my_out, 0), 'res', COALESCE(v_my_res, false))
        );

        v_pct := LEAST(ROUND(((v_rec.box_accum_usd / GREATEST(v_rec.target_req_usd, 0.01)) * 100.0)::numeric, 1), 100.0);

        v_rendered_total := v_rendered_total + 1;
        IF v_rec.member_code > 0 THEN
            v_rendered_non_root := v_rendered_non_root + 1;
            IF v_visual_color = 'GREEN' THEN v_green_cnt := v_green_cnt + 1;
            ELSIF v_visual_color = 'ORANGE' THEN v_orange_cnt := v_orange_cnt + 1;
            ELSIF v_visual_color = 'WHITE' THEN v_white_cnt := v_white_cnt + 1;
            ELSIF v_visual_color = 'GRAY' THEN v_gray_cnt := v_gray_cnt + 1;
            ELSIF v_visual_color = 'BLACK' THEN v_black_cnt := v_black_cnt + 1;
            ELSIF v_visual_color = 'BANNED' THEN v_banned_cnt := v_banned_cnt + 1;
            END IF;
        END IF;

        v_nodes_json := v_nodes_json || jsonb_build_array(jsonb_build_object(
            'id', v_rec.id,
            'member_code', v_rec.member_code,
            'full_name', v_rec.full_name,
            'email', CASE WHEN v_scope = 'GLOBAL' OR v_rec.res_cc = v_scope THEN v_rec.email ELSE NULL END,
            'phone', CASE WHEN v_scope = 'GLOBAL' OR v_rec.res_cc = v_scope THEN v_rec.phone ELSE NULL END,
            'avatar_url', v_rec.avatar_url,
            'parent_member_code', v_rec.parent_member_code,
            'sponsor_code', v_rec.sponsor_code,
            'sponsor_name', v_rec.sponsor_name,
            'placement_side', v_rec.placement_side,
            'viewer_root_arm', v_rec.viewer_root_arm,
            'rel_depth', v_rec.rel_depth,
            'company_gen', v_rec.company_gen,
            'residency_country_code', v_rec.res_cc,
            'nationality_country_code', v_rec.nat_cc,
            'currency_code', v_rec.res_curr,
            'fx_rate', v_rec.res_fx,
            'kyc_status', v_rec.kyc_status,
            'is_tombstone_banned', v_rec.is_tombstone_banned,
            'is_active_in_tree', v_rec.is_active_in_tree,
            'node_color', v_color,
            'visual_color', v_visual_color,
            'team_bucket', v_team_bucket,
            'stopper_slot', CASE WHEN v_my_rank IS NOT NULL THEN v_my_rank || '/' || v_s01 ELSE NULL END,
            'reverse_ceiling_11', CASE WHEN v_root.member_code = 0 THEN v_s01
                                       WHEN v_my_res THEN 0
                                       ELSE GREATEST(0, v_s01 - COALESCE(v_my_out, 1)) END,
            'target_pct', v_pct,
            'box_country_code', v_rec.box_cc,
            'box_accumulated_usd', v_rec.box_accum_usd,
            'target_required_usd', v_rec.target_req_usd,
            'projected_carry_on_out_usd', v_rec.proj_carry_out_usd,
            'country_boxes', v_rec.country_boxes,
            'maker_share_usd', v_rec.maker_share_usd,
            'downline_est_comm_usd', v_rec.dl_est_usd,
            'estimated_month_commission_usd', ROUND((v_rec.maker_share_usd + v_rec.dl_est_usd)::numeric, 2),
            'at_risk_rollup_usd', v_rec.dl_at_risk_usd,
            'wallet_balance_usd', v_rec.wallet_balance_usd,
            'total_earned_usd', v_rec.total_earned_usd,
            'subtree_total', v_rec.sub_total,
            'subtree_right', v_rec.sub_right,
            'subtree_left', v_rec.sub_left,
            'has_left_child', v_rec.has_left_child,
            'has_right_child', v_rec.has_right_child,
            'created_at', v_rec.created_at
        ));
    END LOOP;

    SELECT COUNT(*) INTO v_company_total
      FROM %1$I.members
     WHERE member_code > 0;

    SELECT COUNT(*) FILTER (WHERE m.member_code > 0),
           COUNT(*) FILTER (WHERE m.member_code > 0 AND m.parent_member_id = v_root.id AND m.placement_side = 'root_direct'),
           COUNT(*) FILTER (WHERE tc.depth >= 1 AND tc.root_arm_side = 'right'),
           COUNT(*) FILTER (WHERE tc.depth >= 1 AND tc.root_arm_side = 'left'),
           COALESCE(MAX(tc.depth), 0)
      INTO v_subtree_total, v_direct_leaders, v_right_arm_cnt, v_left_arm_cnt, v_max_sub_depth
      FROM %1$I.tree_closure tc
      JOIN %1$I.members m ON m.id = tc.descendant_id
     WHERE tc.ancestor_id = v_root.id;

    v_truncated := (v_rendered_non_root < v_subtree_total);

    IF v_truncated THEN
        SELECT COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND (
                   (v_lens_cid IS NOT NULL AND COALESCE(bx.lens_qual, false))
                   OR (v_lens_cid IS NULL AND COALESCE(bx.any_qual, false))
               )),
               COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND (
                   (v_lens_cid IS NOT NULL AND NOT COALESCE(bx.lens_qual, false) AND COALESCE(bx.lens_val, 0) > 0)
                   OR (v_lens_cid IS NULL AND NOT COALESCE(bx.any_qual, false) AND COALESCE(bx.any_val, 0) > 0)
               )),
               COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND (
                   (v_lens_cid IS NOT NULL AND NOT COALESCE(bx.lens_qual, false) AND COALESCE(bx.lens_val, 0) = 0 AND m.residency_country_id = v_lens_cid)
                   OR (v_lens_cid IS NULL AND NOT COALESCE(bx.any_qual, false) AND COALESCE(bx.any_val, 0) = 0)
               )),
               0,
               COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND v_lens_cid IS NOT NULL AND NOT COALESCE(bx.lens_qual, false) AND COALESCE(bx.lens_val, 0) = 0 AND m.residency_country_id <> v_lens_cid),
               COUNT(*) FILTER (WHERE m.is_tombstone_banned)
          INTO v_green_cnt, v_orange_cnt, v_white_cnt, v_gray_cnt, v_black_cnt, v_banned_cnt
          FROM %1$I.tree_closure tc
          JOIN %1$I.members m ON m.id = tc.descendant_id
          LEFT JOIN (
              SELECT b.member_id,
                     bool_or(b.is_qualified) AS any_qual,
                     MAX(b.carry_on_in_usd + b.current_month_purchases_usd) AS any_val,
                     bool_or(b.is_qualified) FILTER (WHERE b.country_id = v_lens_cid) AS lens_qual,
                     MAX(b.carry_on_in_usd + b.current_month_purchases_usd) FILTER (WHERE b.country_id = v_lens_cid) AS lens_val
                FROM %1$I.monthly_target_boxes b
               WHERE b.period_ym = v_period_ym
               GROUP BY b.member_id
          ) bx ON bx.member_id = m.id
         WHERE tc.ancestor_id = v_root.id
           AND m.member_code > 0;
    END IF;

    -- Stage 28: Per-country breakdown strictly aligned with b.country_id (never leaks EG box into TR!)
    SELECT COALESCE(jsonb_agg(row_to_json(cb)::jsonb ORDER BY cb.total_members DESC, cb.country_code ASC), '[]'::jsonb)
      INTO v_country_breakdown
      FROM (
          SELECT c.country_code,
                 c.country_name_i18n,
                 c.currency_code,
                 COALESCE(agg.total_members, 0) AS total_members,
                 COALESCE(agg.green_count, 0) AS green_count,
                 COALESCE(agg.orange_count, 0) AS orange_count,
                 COALESCE(agg.white_count, 0) AS white_count,
                 COALESCE(agg.banned_count, 0) AS banned_count
            FROM %1$I.countries c
            LEFT JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE m.residency_country_id = c.id OR b.id IS NOT NULL) AS total_members,
                       COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND COALESCE(b.is_qualified, false)) AS green_count,
                       COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND NOT COALESCE(b.is_qualified, false) AND COALESCE(b.carry_on_in_usd + b.current_month_purchases_usd, 0) > 0) AS orange_count,
                       COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND m.residency_country_id = c.id AND NOT COALESCE(b.is_qualified, false) AND COALESCE(b.carry_on_in_usd + b.current_month_purchases_usd, 0) = 0) AS white_count,
                       COUNT(*) FILTER (WHERE m.is_tombstone_banned AND m.residency_country_id = c.id) AS banned_count
                  FROM %1$I.tree_closure tc
                  JOIN %1$I.members m ON m.id = tc.descendant_id
                  LEFT JOIN %1$I.monthly_target_boxes b
                         ON b.member_id = m.id
                        AND b.country_id = c.id
                        AND b.period_ym = v_period_ym
                 WHERE tc.ancestor_id = v_root.id
                   AND m.member_code > 0
                   AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
            ) agg ON true
           WHERE c.is_active = true OR COALESCE(agg.total_members, 0) > 0
      ) cb;

    RETURN jsonb_build_object(
        'period_ym', v_period_ym,
        'lens_country_code', COALESCE(v_eff_cc, 'ALL'),
        'admin_country_scope', v_scope,
        'root_node', jsonb_build_object(
            'id', v_root.id,
            'member_code', v_root.member_code,
            'full_name', v_root.full_name,
            'avatar_url', NULLIF(trim(COALESCE(v_root.metadata->>'avatar_url', '')), ''),
            'company_gen', v_root.generation_in_tree,
            'residency_country_code', v_root_cc,
            'placement_side', v_root.placement_side
        ),
        'ancestors_breadcrumb', v_breadcrumb,
        'summary', jsonb_build_object(
            'company_total_members', v_company_total,
            'subtree_total_members', v_subtree_total,
            'rendered_nodes_count', v_rendered_total,
            'rendered_non_root_count', v_rendered_non_root,
            'direct_root_leaders_count', v_direct_leaders,
            'right_arm_count', v_right_arm_cnt,
            'left_arm_count', v_left_arm_cnt,
            'green_count', v_green_cnt,
            'orange_count', v_orange_cnt,
            'white_count', v_white_cnt,
            'gray_count', v_gray_cnt,
            'black_count', v_black_cnt,
            'banned_count', v_banned_cnt,
            'max_depth_in_subtree', v_max_sub_depth,
            'max_depth_requested', v_max_depth,
            'truncated', v_truncated,
            's01_gens', v_s01,
            's02_slots', v_s02
        ),
        'country_breakdown', v_country_breakdown,
        'nodes', v_nodes_json
    );
END;

$body$;
$fn$, v_schema);
        EXECUTE v_sql;

        EXECUTE format('REVOKE ALL ON FUNCTION %1$I.get_member_tree_subtree(uuid,text,bigint,bpchar,integer,integer,bpchar) FROM PUBLIC', v_schema);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %1$I.get_member_tree_subtree(uuid,text,bigint,bpchar,integer,integer,bpchar) TO anon, authenticated, service_role', v_schema);
        EXECUTE format('REVOKE ALL ON FUNCTION %1$I.get_tree_analytics_with_country_lens(uuid,bpchar,bpchar) FROM PUBLIC', v_schema);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %1$I.get_tree_analytics_with_country_lens(uuid,bpchar,bpchar) TO authenticated, service_role', v_schema);
        EXECUTE format('REVOKE ALL ON FUNCTION %1$I.get_admin_sovereign_bundle(uuid,text,bpchar) FROM PUBLIC', v_schema);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %1$I.get_admin_sovereign_bundle(uuid,text,bpchar) TO anon, authenticated, service_role', v_schema);
        EXECUTE format('REVOKE ALL ON FUNCTION %1$I.get_admin_full_tree(uuid,text,bigint,bpchar,bpchar,integer) FROM PUBLIC', v_schema);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %1$I.get_admin_full_tree(uuid,text,bigint,bpchar,bpchar,integer) TO anon, authenticated, service_role', v_schema);
    END LOOP;
END $$;
