-- ============================================================================
-- SAWYAN V3.0 — Stage 35 Phase P4: Authoritative `team_size_incl_self` (`>= 1`)
-- Constitutional Reference: D21 (Authoritative Read-Model First), D12 (`1Me` Rule)
-- ============================================================================
-- Patches all 4 tree / leader read-model RPCs across `sawyan` & `sawyan_demo`
-- so `team_size_incl_self` (member + downlines >= 1) is computed once in
-- PostgreSQL and returned authoritatively to all Member & Admin screens:
--   1. get_tree_analytics_with_country_lens (top-level + per-node)
--   2. get_member_tree_subtree              (top-level + per-node)
--   3. get_admin_full_tree                  (summary + per-node)
--   4. admin_manage_root_leaders            (direct_leaders rows)
-- Idempotent & Zero-Destructive.
-- ============================================================================

DO $stage35_p4$
DECLARE
    v_schema TEXT;
    v_def    TEXT;
    v_new    TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo'] LOOP
        -- 1. get_tree_analytics_with_country_lens (Member Home + Tree Lens + Member Bundle)
        v_def := pg_get_functiondef(format('%I.get_tree_analytics_with_country_lens(uuid,bpchar,bpchar)', v_schema)::regprocedure);
        IF position('team_size_incl_self' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$'total_team_count', v_total_team,$a$,
                $b$'total_team_count', v_total_team, 'team_size_incl_self', (COALESCE(v_total_team, 0) + 1),$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: get_tree_analytics_with_country_lens (total) on %', v_schema;
            END IF;
            v_def := v_new;
            v_new := replace(
                v_def,
                $a$'subtree_total', subtree_total,$a$,
                $b$'subtree_total', subtree_total, 'team_size_incl_self', (COALESCE(subtree_total, 0) + 1),$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: get_tree_analytics_with_country_lens (node) on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- 2. get_member_tree_subtree (Member Tree Studio)
        v_def := pg_get_functiondef(format('%I.get_member_tree_subtree(uuid,text,bigint,bpchar,integer,integer,bpchar)', v_schema)::regprocedure);
        IF position('team_size_incl_self' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$'total_subtree_members', v_total_sub,$a$,
                $b$'total_subtree_members', v_total_sub, 'team_size_incl_self', (COALESCE(v_total_sub, 0) + 1),$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: get_member_tree_subtree (total) on %', v_schema;
            END IF;
            v_def := v_new;
            v_new := replace(
                v_def,
                format($a$'subtree_count', (SELECT COUNT(*) FROM %I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0),$a$, v_schema),
                format($b$'subtree_count', (SELECT COUNT(*) FROM %I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0), 'team_size_incl_self', ((SELECT COUNT(*) FROM %I.tree_closure tsub WHERE tsub.ancestor_id = m.id AND tsub.depth > 0) + 1),$b$, v_schema, v_schema)
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: get_member_tree_subtree (node) on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- 3. get_admin_full_tree (Admin Full Circular Tree Explorer)
        v_def := pg_get_functiondef(format('%I.get_admin_full_tree(uuid,text,bigint,bpchar,bpchar,integer)', v_schema)::regprocedure);
        IF position('team_size_incl_self' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$'subtree_total', v_rec.sub_total,$a$,
                $b$'subtree_total', v_rec.sub_total, 'team_size_incl_self', (COALESCE(v_rec.sub_total, 0) + 1),$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: get_admin_full_tree (node) on %', v_schema;
            END IF;
            v_def := v_new;
            v_new := replace(
                v_def,
                $a$'subtree_total_members', v_subtree_total,$a$,
                $b$'subtree_total_members', v_subtree_total, 'team_size_incl_self', CASE WHEN v_root.member_code = 0 THEN COALESCE(v_subtree_total, 0) ELSE GREATEST(1, COALESCE(v_subtree_total, 0)) END,$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: get_admin_full_tree (summary) on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- 4. admin_manage_root_leaders (Direct Root #0 Leaders List)
        v_def := pg_get_functiondef(format('%I.admin_manage_root_leaders(uuid,text,varchar,varchar,varchar,bpchar,text,varchar,text)', v_schema)::regprocedure);
        IF position('team_size_incl_self' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$(SELECT COUNT(*) FROM %I.tree_closure tc WHERE tc.ancestor_id = m.id AND tc.depth > 0) AS team_size$a$, v_schema),
                format($b$(SELECT COUNT(*) FROM %I.tree_closure tc WHERE tc.ancestor_id = m.id AND tc.depth > 0) AS team_size, ((SELECT COUNT(*) FROM %I.tree_closure tc WHERE tc.ancestor_id = m.id AND tc.depth > 0) + 1) AS team_size_incl_self$b$, v_schema, v_schema)
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE35_P4_PATCH_MISS: admin_manage_root_leaders on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;
    END LOOP;
END $stage35_p4$;
