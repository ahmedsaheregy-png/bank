-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 25: COMPACT CIRCULAR TREE RPC (9-FIELD INSPECTOR,
-- EXACT RELATIVE STOPPER-11 RESERVE TEAM, & DB-ENFORCED 10-UPLINE PHONE PRIVACY)
-- ============================================================================
-- Upgrades `get_member_tree_subtree` on BOTH `sawyan` and `sawyan_demo`:
--   1) Adds `sponsor_name` (real upline/sponsor), `country_name_ar`,
--      `admin_fx_rate`, `target_required_local`, `achieved_local`,
--      `remaining_local`, `left_team_count`, `right_team_count`.
--   2) Computes exact relative `is_reserve_team` (⚫ Dark Gray beyond S01=11
--      qualified ancestors along the vertical path from viewer, honoring D12
--      reserved seat 1/11 and Roll-Up skipping unqualified members).
--   3) Enforces D26 phone privacy strictly in PostgreSQL: `phone` is returned
--      ONLY when `NOT is_tombstone_banned AND viewer_depth BETWEEN 0 AND 10`
--      (regardless of qualification status or country), and NULL for depth >= 11.
--   4) Honors country lens transparency (`in_country_lens`): true if residency
--      matches `v_eff_cc` OR member holds a qualified box in `v_eff_cc`.
-- Strictly Idempotent across `sawyan` and `sawyan_demo`.
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
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
SET statement_timeout TO '10s'
AS $body$
DECLARE
    v_viewer         %1$I.members%%ROWTYPE;
    v_root           %1$I.members%%ROWTYPE;
    v_period_ym      CHAR(7);
    v_prev_period_ym CHAR(7);
    v_max_depth      INT;
    v_node_limit     INT;
    v_eff_cc         CHAR(2);
    v_s01            INT := 11;
    v_s02            INT := 11;
    v_nodes          JSONB := '[]'::jsonb;
    v_breadcrumb     JSONB := '[]'::jsonb;
    v_avail_cc       JSONB := '[]'::jsonb;
    v_near_qual      JSONB := '[]'::jsonb;
    v_rollup_risk    JSONB := '[]'::jsonb;
    v_left_total     BIGINT := 0;
    v_right_total    BIGINT := 0;
    v_left_qual      BIGINT := 0;
    v_right_qual     BIGINT := 0;
    v_weaker_side    TEXT := 'right';
    v_spill_parent   BIGINT := NULL;
    v_spill_side     TEXT := 'right';
    v_new_7d         BIGINT := 0;
    v_new_month      BIGINT := 0;
    v_tx_members     BIGINT := 0;
    v_tx_count       BIGINT := 0;
    v_near_cnt       BIGINT := 0;
    v_rollup_cnt     BIGINT := 0;
    v_est_comm_usd   NUMERIC(18,2) := 0.00;
    v_prev_comm_usd  NUMERIC(18,2) := 0.00;
    v_comm_delta_pct NUMERIC(8,1) := 0.0;
    v_unit_share     NUMERIC(18,2) := 2.25;
    v_total_sub      BIGINT := 0;
    v_month_start    TIMESTAMPTZ;
    v_month_end      TIMESTAMPTZ;
BEGIN
    v_viewer := %1$I.verify_member_session(p_member_id, p_session_token);

    v_period_ym := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
    v_month_start := to_timestamp(v_period_ym || '-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS') AT TIME ZONE 'UTC';
    v_month_end   := v_month_start + interval '1 month';
    v_prev_period_ym := to_char(v_month_start - interval '1 day', 'YYYY-MM');

    v_max_depth  := LEAST(GREATEST(COALESCE(p_max_depth, 4), 1), 8);
    v_node_limit := LEAST(GREATEST(COALESCE(p_node_limit, 80), 15), 500);
    v_eff_cc     := CASE WHEN upper(trim(COALESCE(p_country_code, ''))) IN ('', 'ALL') THEN NULL ELSE upper(trim(p_country_code)) END;

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
     WHERE c.id = v_viewer.residency_country_id;
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
                  'currency_code', c.currency_code,
                  'admin_fx_rate', COALESCE(c.admin_fx_rate, 1),
                  'is_tombstone_banned', m.is_tombstone_banned,
                  'is_qualified', COALESCE(tb.is_qualified, false),
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
                                JOIN %1$I.countries mc ON mc.id = mid.residency_country_id
                                JOIN %1$I.monthly_target_boxes mtb
                                  ON mtb.member_id = mid.id
                                 AND mtb.country_id = mid.residency_country_id
                                 AND mtb.period_ym = v_period_ym
                               WHERE tc_a.ancestor_id = v_viewer.id
                                 AND tc_a.depth > 0
                                 AND tc_b.depth > 0
                                 AND mid.is_tombstone_banned = false
                                 AND mtb.is_qualified = true
                                 AND (v_eff_cc IS NULL OR mc.country_code = v_eff_cc)
                          )
                      ) >= v_s01
                  ),
                  'in_country_lens', (
                      v_eff_cc IS NULL
                      OR c.country_code = v_eff_cc
                      OR EXISTS (
                          SELECT 1
                            FROM %1$I.monthly_target_boxes tb_lens
                            JOIN %1$I.countries c_lens ON c_lens.id = tb_lens.country_id
                           WHERE tb_lens.member_id = m.id
                             AND tb_lens.period_ym = v_period_ym
                             AND c_lens.country_code = v_eff_cc
                             AND tb_lens.is_qualified = true
                      )
                  ),
                  'target_required_usd', ROUND(COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75)::numeric, 2),
                  'accumulated_usd', ROUND((COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0))::numeric, 2),
                  'remaining_usd', ROUND(GREATEST(0, COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75) - (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)))::numeric, 2),
                  'target_required_local', ROUND((COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75) * COALESCE(c.admin_fx_rate, 1))::numeric, 2),
                  'achieved_local', ROUND(((COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)) * COALESCE(c.admin_fx_rate, 1))::numeric, 2),
                  'remaining_local', ROUND((GREATEST(0, COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75) - (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0))) * COALESCE(c.admin_fx_rate, 1))::numeric, 2),
                  'progress_pct', LEAST(100.0, ROUND(((COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)) / NULLIF(COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75), 0) * 100.0)::numeric, 1)),
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
            LEFT JOIN %1$I.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
           WHERE tc_r.ancestor_id = v_root.id
             AND tc_r.depth <= v_max_depth
           ORDER BY tc_r.depth ASC, m.placement_side DESC, m.member_code ASC
           LIMIT v_node_limit
      ) sliced;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'left'),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'right'),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'left' AND COALESCE(tb.is_qualified, false) = true),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'right' AND COALESCE(tb.is_qualified, false) = true),
        COUNT(*) FILTER (WHERE m.created_at >= now() - interval '7 days'),
        COUNT(*) FILTER (WHERE m.created_at >= v_month_start AND m.created_at < v_month_end)
      INTO v_total_sub, v_left_total, v_right_total, v_left_qual, v_right_qual, v_new_7d, v_new_month
      FROM %1$I.tree_closure tc
      JOIN %1$I.members m ON m.id = tc.descendant_id
      LEFT JOIN %1$I.monthly_target_boxes tb
        ON tb.member_id = m.id
       AND tb.country_id = m.residency_country_id
       AND tb.period_ym = v_period_ym
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

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'country_code', cc_stats.country_code,
        'country_name_ar', cc_stats.country_name_ar,
        'count', cc_stats.cnt,
        'qualified', cc_stats.q_cnt
    ) ORDER BY cc_stats.cnt DESC, cc_stats.country_code ASC), '[]'::jsonb)
      INTO v_avail_cc
      FROM (
          SELECT c.country_code,
                 COALESCE(c.country_name_i18n->>'ar', c.country_name_i18n->>'en', c.country_code) AS country_name_ar,
                 COUNT(*) AS cnt,
                 COUNT(*) FILTER (WHERE COALESCE(tb.is_qualified, false) = true) AS q_cnt
            FROM %1$I.tree_closure tc
            JOIN %1$I.members m ON m.id = tc.descendant_id
            JOIN %1$I.countries c ON c.id = m.residency_country_id
            LEFT JOIN %1$I.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
           WHERE tc.ancestor_id = v_viewer.id
             AND tc.depth > 0
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
       AND COALESCE(t.completed_at, t.created_at) < v_month_end;

    SELECT COUNT(*),
           COALESCE(jsonb_agg(nq.obj ORDER BY nq.pct DESC), '[]'::jsonb)
      INTO v_near_cnt, v_near_qual
      FROM (
          SELECT
              pct,
              jsonb_build_object(
                  'member_code', m.member_code,
                  'full_name', m.full_name,
                  'country_code', c.country_code,
                  'currency_code', c.currency_code,
                  'depth', tc.depth,
                  'progress_pct', pct,
                  'remaining_usd', rem_usd,
                  'remaining_local', ROUND((rem_usd * COALESCE(c.admin_fx_rate, 1))::numeric, 2),
                  'phone', CASE WHEN tc.depth BETWEEN 1 AND 10 THEN m.phone ELSE NULL END
              ) AS obj
            FROM %1$I.tree_closure tc
            JOIN %1$I.members m ON m.id = tc.descendant_id
            JOIN %1$I.countries c ON c.id = m.residency_country_id
            JOIN %1$I.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
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
            JOIN %1$I.countries c ON c.id = m.residency_country_id
            LEFT JOIN %1$I.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
            CROSS JOIN LATERAL (
                SELECT COUNT(*) AS qual_downlines
                  FROM %1$I.tree_closure tsub
                  JOIN %1$I.monthly_target_boxes tb2
                    ON tb2.member_id = tsub.descendant_id
                   AND tb2.period_ym = v_period_ym
                   AND tb2.is_qualified = true
                 WHERE tsub.ancestor_id = m.id
                   AND tsub.depth BETWEEN 1 AND v_s01
            ) q_down
           WHERE tc.ancestor_id = v_viewer.id
             AND tc.depth BETWEEN 1 AND v_s01
             AND m.is_tombstone_banned = false
             AND COALESCE(tb.is_qualified, false) = false
             AND q_down.qual_downlines > 0
           ORDER BY q_down.qual_downlines DESC
           LIMIT 12
      ) ru;

    v_est_comm_usd := ROUND(((v_left_qual + v_right_qual) * v_unit_share)::numeric, 2);

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
            'prev_month_commission_usd', v_prev_comm_usd,
            'commission_delta_pct', v_comm_delta_pct,
            'unit_share_usd', v_unit_share
        )
    );
END;
$body$;
GRANT EXECUTE ON FUNCTION %1$I.get_member_tree_subtree(uuid, text, bigint, character, integer, integer, character) TO anon, authenticated;
$fn$, v_schema);

        EXECUTE v_sql;
    END LOOP;
END;
$$;
