-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 PHASE 2: ADAPTIVE LAZY SUBTREE RPC & TREE PULSE ENGINE
-- ============================================================================
-- Delivers:
--   * `sawyan.get_member_tree_subtree(...)`:
--       - Server-side depth-capped lazy loading (`p_max_depth` 1..8, `p_node_limit` 15..500)
--         so mid-range mobiles render 4-5 gens (<=80 DOM nodes) smoothly at 60fps while
--         laptops/desktops explore 6-8 gens (up to ~500 nodes) with instant drill-down.
--       - Enforces strict session auth (`verify_member_session`) + IDOR subtree ownership check
--         + D26 10-generation spatial phone visibility (`viewer_depth BETWEEN 1 AND 10`).
--       - Returns member `avatar_url`, exact SVG progress ring percentage, hidden descendant
--         counts (`+N` expand badge), Breadcrumb path, Right/Left Power Bar, Next Spillover
--         Slot (G01/G02), Dynamic Country Lenses, Month-End 72h War Room (`70-99%` & `Roll-Up`
--         alerts), and Founder's «نبض شجرتي» (`tree_pulse`: new signups, active transactors,
--         and commission progression).
--
-- Strictly Idempotent. ZERO bare lowercase `sawyan` inside string literals for clean cloning.
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.get_member_tree_subtree(
    p_member_id        UUID,
    p_session_token    TEXT,
    p_root_member_code BIGINT  DEFAULT NULL,
    p_period_ym        CHAR(7) DEFAULT NULL,
    p_max_depth        INT     DEFAULT 4,
    p_node_limit       INT     DEFAULT 80,
    p_country_code     CHAR(2) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_viewer         sawyan.members%ROWTYPE;
    v_root           sawyan.members%ROWTYPE;
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
    -- 1. Strict session authentication
    v_viewer := sawyan.verify_member_session(p_member_id, p_session_token);

    v_period_ym := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
    v_month_start := to_timestamp(v_period_ym || '-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS') AT TIME ZONE 'UTC';
    v_month_end   := v_month_start + interval '1 month';
    v_prev_period_ym := to_char(v_month_start - interval '1 day', 'YYYY-MM');

    v_max_depth  := LEAST(GREATEST(COALESCE(p_max_depth, 4), 1), 8);
    v_node_limit := LEAST(GREATEST(COALESCE(p_node_limit, 80), 15), 500);
    v_eff_cc     := CASE WHEN upper(trim(COALESCE(p_country_code, ''))) IN ('', 'ALL') THEN NULL ELSE upper(trim(p_country_code)) END;

    SELECT COALESCE(numerical_stopper_s01, 11), COALESCE(upline_ceiling_s02, 11)
      INTO v_s01, v_s02
      FROM sawyan.settings
     WHERE country_id IS NULL AND effective_from <= now()
     ORDER BY effective_from DESC, recorded_at DESC
     LIMIT 1;
    v_s01 := GREATEST(COALESCE(v_s01, 11), 1);
    v_s02 := GREATEST(COALESCE(v_s02, 11), 1);

    SELECT TRUNC(GREATEST(COALESCE(c.monthly_target_usd, 24.75), 0.01) / v_s02, 2)
      INTO v_unit_share
      FROM sawyan.countries c
     WHERE c.id = v_viewer.residency_country_id;
    v_unit_share := COALESCE(v_unit_share, 2.25);

    -- 2. Resolve focused root node & enforce strict subtree ownership (Zero IDOR)
    IF p_root_member_code IS NULL OR p_root_member_code = v_viewer.member_code THEN
        v_root := v_viewer;
    ELSE
        SELECT m.* INTO v_root
          FROM sawyan.members m
          JOIN sawyan.tree_closure tc ON tc.descendant_id = m.id
         WHERE tc.ancestor_id = v_viewer.id
           AND m.member_code = p_root_member_code;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'SUBTREE_ROOT_FORBIDDEN_OR_NOT_FOUND';
        END IF;
    END IF;

    -- 3. Breadcrumb from viewer down to current focused root
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'member_code', anc.member_code,
        'full_name', anc.full_name,
        'depth_from_viewer', tc_v.depth
    ) ORDER BY tc_v.depth ASC), '[]'::jsonb)
      INTO v_breadcrumb
      FROM sawyan.tree_closure tc_r
      JOIN sawyan.tree_closure tc_v
        ON tc_v.ancestor_id = v_viewer.id
       AND tc_v.descendant_id = tc_r.ancestor_id
      JOIN sawyan.members anc ON anc.id = tc_r.ancestor_id
     WHERE tc_r.descendant_id = v_root.id;

    -- 4. Depth-capped, node-limited subtree slice with avatars, progress rings & hidden counts
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
                  'is_direct_referral', (m.sponsor_id = v_viewer.id),
                  'placement_side', m.placement_side,
                  'rel_depth', tc_r.depth,
                  'viewer_depth', COALESCE(tc_v.depth, 0),
                  'full_name', CASE WHEN m.is_tombstone_banned THEN 'حساب مجمّد (#' || m.member_code || ')' ELSE m.full_name END,
                  'avatar_url', CASE WHEN m.is_tombstone_banned THEN NULL ELSE NULLIF(trim(COALESCE(m.metadata->>'avatar_url', '')), '') END,
                  'country_code', c.country_code,
                  'currency_code', c.currency_code,
                  'is_tombstone_banned', m.is_tombstone_banned,
                  'is_qualified', COALESCE(tb.is_qualified, false),
                  'in_country_lens', (v_eff_cc IS NULL OR c.country_code = v_eff_cc),
                  'target_required_usd', ROUND(COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75)::numeric, 2),
                  'accumulated_usd', ROUND((COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0))::numeric, 2),
                  'remaining_usd', ROUND(GREATEST(0, COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75) - (COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)))::numeric, 2),
                  'progress_pct', LEAST(100.0, ROUND(((COALESCE(tb.carry_on_in_usd, 0) + COALESCE(tb.current_month_purchases_usd, 0) + COALESCE(tb.compensatory_incoming_usd, 0)) / NULLIF(COALESCE(tb.target_required_usd, c.monthly_target_usd, 24.75), 0) * 100.0)::numeric, 1)),
                  'has_left_child', (m.left_child_id IS NOT NULL),
                  'has_right_child', (m.right_child_id IS NOT NULL),
                  'subtree_count', (SELECT COUNT(*) FROM sawyan.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0),
                  'hidden_descendants', CASE
                      WHEN tc_r.depth >= v_max_depth THEN (SELECT COUNT(*) FROM sawyan.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0)
                      ELSE 0
                  END,
                  -- D26 Privacy Rule: phone visible strictly for spatial generations 1..10 below viewer (2Me..11Me)
                  'phone', CASE
                      WHEN NOT m.is_tombstone_banned AND COALESCE(tc_v.depth, 0) BETWEEN 1 AND 10 THEN m.phone
                      ELSE NULL
                  END,
                  'created_at', m.created_at
              ) AS row_obj
            FROM sawyan.tree_closure tc_r
            JOIN sawyan.members m ON m.id = tc_r.descendant_id
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            LEFT JOIN sawyan.members pm ON pm.id = m.parent_member_id
            LEFT JOIN sawyan.members sp ON sp.id = m.sponsor_id
            LEFT JOIN sawyan.tree_closure tc_v
              ON tc_v.ancestor_id = v_viewer.id
             AND tc_v.descendant_id = m.id
            LEFT JOIN sawyan.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
           WHERE tc_r.ancestor_id = v_root.id
             AND tc_r.depth <= v_max_depth
           ORDER BY tc_r.depth ASC, m.placement_side DESC, m.member_code ASC
           LIMIT v_node_limit
      ) sliced;

    -- 5. Right/Left Power Bar across viewer's full subtree + Dynamic Country Lenses
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'left'),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'right'),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'left' AND COALESCE(tb.is_qualified, false) = true),
        COUNT(*) FILTER (WHERE tc.root_arm_side = 'right' AND COALESCE(tb.is_qualified, false) = true),
        COUNT(*) FILTER (WHERE m.created_at >= now() - interval '7 days'),
        COUNT(*) FILTER (WHERE m.created_at >= v_month_start AND m.created_at < v_month_end)
      INTO v_total_sub, v_left_total, v_right_total, v_left_qual, v_right_qual, v_new_7d, v_new_month
      FROM sawyan.tree_closure tc
      JOIN sawyan.members m ON m.id = tc.descendant_id
      LEFT JOIN sawyan.monthly_target_boxes tb
        ON tb.member_id = m.id
       AND tb.country_id = m.residency_country_id
       AND tb.period_ym = v_period_ym
     WHERE tc.ancestor_id = v_viewer.id
       AND tc.depth > 0;

    v_weaker_side := CASE WHEN v_left_total < v_right_total THEN 'left' ELSE 'right' END;

    -- Next Spillover Slot under viewer (G01/G02: shallowest open slot in weaker arm, right-first tie break)
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
          FROM sawyan.tree_closure tc
          JOIN sawyan.members cand ON cand.id = tc.descendant_id
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

    -- Dynamic Country Breakdown in Viewer's Subtree
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'country_code', cc_stats.country_code,
        'count', cc_stats.cnt,
        'qualified', cc_stats.q_cnt
    ) ORDER BY cc_stats.cnt DESC, cc_stats.country_code ASC), '[]'::jsonb)
      INTO v_avail_cc
      FROM (
          SELECT c.country_code,
                 COUNT(*) AS cnt,
                 COUNT(*) FILTER (WHERE COALESCE(tb.is_qualified, false) = true) AS q_cnt
            FROM sawyan.tree_closure tc
            JOIN sawyan.members m ON m.id = tc.descendant_id
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            LEFT JOIN sawyan.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
           WHERE tc.ancestor_id = v_viewer.id
             AND tc.depth > 0
           GROUP BY c.country_code
      ) cc_stats;

    -- 6. Founder's «نبض شجرتي» (Tree Pulse) & Month-End 72h War Room (70-99% + Roll-Up Risk)
    SELECT COUNT(DISTINCT t.member_id), COUNT(*)
      INTO v_tx_members, v_tx_count
      FROM sawyan.tree_closure tc
      JOIN sawyan.transactions t ON t.member_id = tc.descendant_id
     WHERE tc.ancestor_id = v_viewer.id
       AND tc.depth > 0
       AND t.status = 'completed'
       AND COALESCE(t.completed_at, t.created_at) >= v_month_start
       AND COALESCE(t.completed_at, t.created_at) < v_month_end;

    -- Near-Qualification (70% to 99.9%) in S01 commission team
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
                  'depth', tc.depth,
                  'progress_pct', pct,
                  'remaining_usd', rem_usd,
                  'phone', CASE WHEN tc.depth BETWEEN 1 AND 10 THEN m.phone ELSE NULL END
              ) AS obj
            FROM sawyan.tree_closure tc
            JOIN sawyan.members m ON m.id = tc.descendant_id
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            JOIN sawyan.monthly_target_boxes tb
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

    -- Roll-Up Alert: unqualified members inside S01 who have qualified downlines under them
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
                  'depth', tc.depth,
                  'qualified_downlines', q_down.qual_downlines,
                  'at_risk_usd', ROUND((q_down.qual_downlines * v_unit_share)::numeric, 2),
                  'phone', CASE WHEN tc.depth BETWEEN 1 AND 10 THEN m.phone ELSE NULL END
              ) AS obj
            FROM sawyan.tree_closure tc
            JOIN sawyan.members m ON m.id = tc.descendant_id
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            LEFT JOIN sawyan.monthly_target_boxes tb
              ON tb.member_id = m.id
             AND tb.country_id = m.residency_country_id
             AND tb.period_ym = v_period_ym
            CROSS JOIN LATERAL (
                SELECT COUNT(*) AS qual_downlines
                  FROM sawyan.tree_closure tsub
                  JOIN sawyan.monthly_target_boxes tb2
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

    -- Commission Progression (Current Month Estimated vs Previous Month Settled)
    v_est_comm_usd := ROUND(((v_left_qual + v_right_qual) * v_unit_share)::numeric, 2);

    SELECT COALESCE(SUM(cd.share_amount_usd), 0.00)
      INTO v_prev_comm_usd
      FROM sawyan.commission_distributions cd
      JOIN sawyan.pool_transactions pt ON pt.id = cd.pool_transaction_id
      JOIN sawyan.monthly_target_boxes mb ON mb.id = pt.target_box_id
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
$$;

REVOKE ALL ON FUNCTION sawyan.get_member_tree_subtree(UUID, TEXT, BIGINT, CHAR, INT, INT, CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.get_member_tree_subtree(UUID, TEXT, BIGINT, CHAR, INT, INT, CHAR) TO anon, authenticated, service_role;
