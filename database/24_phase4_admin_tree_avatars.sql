-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 PHASE 4C: ADMIN FULL TREE AVATARS & TEMP-FREE RPC
-- ============================================================================
-- Upgrades `sawyan.get_admin_full_tree(...)` to:
--   1. Include `avatar_url` for both `root_node` and every member in `nodes`.
--   2. Eliminate per-call `CREATE TEMP TABLE` / `ON COMMIT DROP` catalog churn
--      by tracking S01 stopper state in-memory via JSONB (`v_state_map`),
--      preventing `pg_class`/`pg_attribute` bloat under concurrent admin reads.
--
-- Strictly Idempotent (CREATE OR REPLACE). ZERO bare lowercase `sawyan` inside
-- string literals so `sawyan` -> `sawyan_demo` schema cloning stays exact.
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.get_admin_full_tree(
    p_admin_id         UUID,
    p_session_token    TEXT,
    p_root_member_code BIGINT  DEFAULT 0,
    p_period_ym        CHAR(7) DEFAULT NULL,
    p_country_code     CHAR(2) DEFAULT NULL,
    p_max_depth        INT     DEFAULT 15
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_adm               JSONB;
    v_scope             VARCHAR(10) := 'GLOBAL';
    v_eff_cc            CHAR(2) := NULL;
    v_lens_cid          INT := NULL;
    v_s01               INT := 11;
    v_s02               INT := 11;
    v_period_ym         CHAR(7);
    v_root_code         BIGINT;
    v_root              sawyan.members%ROWTYPE;
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
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);

    SELECT COALESCE(NULLIF(upper(trim(metadata->>'country_scope')), ''), 'GLOBAL')
      INTO v_scope
      FROM sawyan.admins
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
        SELECT id INTO v_lens_cid
          FROM sawyan.countries
         WHERE country_code = v_eff_cc;
    END IF;

    SELECT numerical_stopper_s01, upline_ceiling_s02
      INTO v_s01, v_s02
      FROM sawyan.settings
     WHERE effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;
    v_s01 := GREATEST(COALESCE(v_s01, 11), 1);
    v_s02 := GREATEST(COALESCE(v_s02, 11), 1);

    v_period_ym := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));
    v_root_code := COALESCE(p_root_member_code, 0);
    v_max_depth := LEAST(GREATEST(COALESCE(p_max_depth, 15), 1), 40);

    SELECT * INTO v_root
      FROM sawyan.members
     WHERE member_code = v_root_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TREE_ROOT_MEMBER_NOT_FOUND: %', v_root_code;
    END IF;

    SELECT country_code INTO v_root_cc
      FROM sawyan.countries
     WHERE id = v_root.residency_country_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'member_code', anc.member_code,
        'full_name', anc.full_name,
        'company_gen', anc.generation_in_tree
    ) ORDER BY tc.depth DESC), '[]'::jsonb)
      INTO v_breadcrumb
      FROM sawyan.tree_closure tc
      JOIN sawyan.members anc ON anc.id = tc.ancestor_id
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
               ROUND(COALESCE(
                   MAX(CASE WHEN b.country_id = COALESCE(v_lens_cid, m.residency_country_id)
                            THEN (b.carry_on_in_usd + b.current_month_purchases_usd + b.compensatory_incoming_usd)
                            ELSE NULL END),
                   MAX(b.carry_on_in_usd + b.current_month_purchases_usd + b.compensatory_incoming_usd),
                   0.00
               )::numeric, 2) AS box_accum_usd,
               ROUND(COALESCE(
                   MAX(CASE WHEN b.country_id = COALESCE(v_lens_cid, m.residency_country_id)
                            THEN b.target_required_usd ELSE NULL END),
                   MAX(b.target_required_usd),
                   c_res.monthly_target_usd,
                   24.75
               )::numeric, 2) AS target_req_usd,
               COALESCE(MAX(sub_agg.sub_total), 0) AS sub_total,
               COALESCE(MAX(sub_agg.sub_left), 0) AS sub_left,
               COALESCE(MAX(sub_agg.sub_right), 0) AS sub_right
          FROM sawyan.tree_closure tc
          JOIN sawyan.members m ON m.id = tc.descendant_id
          JOIN sawyan.countries c_res ON c_res.id = m.residency_country_id
          LEFT JOIN sawyan.countries c_nat ON c_nat.id = m.nationality_country_id
          LEFT JOIN sawyan.members pm ON pm.id = m.parent_member_id
          LEFT JOIN sawyan.members sm ON sm.id = m.sponsor_id
          LEFT JOIN sawyan.wallets w ON w.member_id = m.id
          LEFT JOIN sawyan.monthly_target_boxes b
                 ON b.member_id = m.id AND b.period_ym = v_period_ym
          LEFT JOIN sawyan.monthly_target_boxes b_lens
                 ON b_lens.member_id = m.id AND b_lens.period_ym = v_period_ym AND b_lens.country_id = v_lens_cid
          LEFT JOIN (
              SELECT st.ancestor_id,
                     COUNT(*) FILTER (WHERE st.depth >= 1) AS sub_total,
                     COUNT(*) FILTER (WHERE st.depth >= 1 AND st.root_arm_side = 'left') AS sub_left,
                     COUNT(*) FILTER (WHERE st.depth >= 1 AND st.root_arm_side = 'right') AS sub_right
                FROM sawyan.tree_closure st
               WHERE st.ancestor_id IN (
                   SELECT tc2.descendant_id
                     FROM sawyan.tree_closure tc2
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
            'box_accumulated_usd', v_rec.box_accum_usd,
            'target_required_usd', v_rec.target_req_usd,
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
      FROM sawyan.members
     WHERE member_code > 0;

    SELECT COUNT(*) FILTER (WHERE m.member_code > 0),
           COUNT(*) FILTER (WHERE m.member_code > 0 AND m.parent_member_id = v_root.id AND m.placement_side = 'root_direct'),
           COUNT(*) FILTER (WHERE tc.depth >= 1 AND tc.root_arm_side = 'right'),
           COUNT(*) FILTER (WHERE tc.depth >= 1 AND tc.root_arm_side = 'left'),
           COALESCE(MAX(tc.depth), 0)
      INTO v_subtree_total, v_direct_leaders, v_right_arm_cnt, v_left_arm_cnt, v_max_sub_depth
      FROM sawyan.tree_closure tc
      JOIN sawyan.members m ON m.id = tc.descendant_id
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
          FROM sawyan.tree_closure tc
          JOIN sawyan.members m ON m.id = tc.descendant_id
          LEFT JOIN (
              SELECT b.member_id,
                     bool_or(b.is_qualified) AS any_qual,
                     MAX(b.carry_on_in_usd + b.current_month_purchases_usd) AS any_val,
                     bool_or(b.is_qualified) FILTER (WHERE b.country_id = v_lens_cid) AS lens_qual,
                     MAX(b.carry_on_in_usd + b.current_month_purchases_usd) FILTER (WHERE b.country_id = v_lens_cid) AS lens_val
                FROM sawyan.monthly_target_boxes b
               WHERE b.period_ym = v_period_ym
               GROUP BY b.member_id
          ) bx ON bx.member_id = m.id
         WHERE tc.ancestor_id = v_root.id
           AND m.member_code > 0;
    END IF;

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
            FROM sawyan.countries c
            LEFT JOIN (
                SELECT m.residency_country_id AS cid,
                       COUNT(*) AS total_members,
                       COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND COALESCE(bx.any_qual, false)) AS green_count,
                       COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND NOT COALESCE(bx.any_qual, false) AND COALESCE(bx.any_val, 0) > 0) AS orange_count,
                       COUNT(*) FILTER (WHERE NOT m.is_tombstone_banned AND NOT COALESCE(bx.any_qual, false) AND COALESCE(bx.any_val, 0) = 0) AS white_count,
                       COUNT(*) FILTER (WHERE m.is_tombstone_banned) AS banned_count
                  FROM sawyan.tree_closure tc
                  JOIN sawyan.members m ON m.id = tc.descendant_id
                  LEFT JOIN (
                      SELECT b.member_id,
                             bool_or(b.is_qualified) AS any_qual,
                             MAX(b.carry_on_in_usd + b.current_month_purchases_usd) AS any_val
                        FROM sawyan.monthly_target_boxes b
                       WHERE b.period_ym = v_period_ym
                       GROUP BY b.member_id
                  ) bx ON bx.member_id = m.id
                 WHERE tc.ancestor_id = v_root.id
                   AND m.member_code > 0
                 GROUP BY m.residency_country_id
            ) agg ON agg.cid = c.id
           WHERE (v_scope = 'GLOBAL' AND (c.is_active = true OR COALESCE(agg.total_members, 0) > 0))
              OR (v_scope <> 'GLOBAL' AND c.country_code = v_scope)
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
$function$;

GRANT EXECUTE ON FUNCTION sawyan.get_admin_full_tree(UUID, TEXT, BIGINT, CHAR, CHAR, INT) TO anon, authenticated, service_role;
