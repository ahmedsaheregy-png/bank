-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 20: PREVENTIVE SCHEMA & GRAPHQL PRIVILEGE LOCK
-- ============================================================================
-- 1) Closes residual direct `anon` SELECT grants on `sawyan_demo` operational
--    tables (`members`, `monthly_target_boxes`, `settings`, `transactions`,
--    `tree_closure`) that triggered Supabase Advisor `pg_graphql_anon_table_exposed`
--    warnings, achieving 1:1 least-privilege parity with Production `sawyan`.
-- 2) Revokes public/anon EXECUTE on `graphql_public.graphql(...)` where permitted
--    by the database role without disturbing PostgREST `/rest/v1/rpc/*`.
-- Strictly Idempotent.
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('sawyan_demo.members') IS NOT NULL THEN
        REVOKE SELECT, INSERT, UPDATE, DELETE ON
            sawyan_demo.members,
            sawyan_demo.monthly_target_boxes,
            sawyan_demo.settings,
            sawyan_demo.transactions,
            sawyan_demo.tree_closure
        FROM PUBLIC, anon;
    END IF;

    IF to_regclass('sawyan.members') IS NOT NULL THEN
        REVOKE SELECT, INSERT, UPDATE, DELETE ON
            sawyan.members,
            sawyan.monthly_target_boxes,
            sawyan.settings,
            sawyan.transactions,
            sawyan.tree_closure
        FROM PUBLIC, anon;
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regprocedure('graphql_public.graphql(text,text,jsonb,jsonb)') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION graphql_public.graphql(text, text, jsonb, jsonb) FROM PUBLIC, anon;
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'graphql_public.graphql owned by supabase_admin; skipped function-level revoke';
END;
$$;
