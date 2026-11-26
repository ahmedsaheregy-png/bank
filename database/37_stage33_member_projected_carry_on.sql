-- ============================================================================
-- SAWYAN V3.0 — Stage 33: Authoritative Live Projected Carry-On in Member Bundle
-- Constitutional Reference: D21 (Authoritative Read-Model First), D16 (Open-Ended
-- Carry-On), S07 (Single Monthly Target Consumption per Period)
-- ============================================================================
-- Patches `get_member_dashboard_bundle(uuid, text, bpchar, bpchar)` across both
-- `sawyan` and `sawyan_demo` so every box in `target_boxes` includes:
--   - `projected_carry_on_out_usd`   (exact surplus / preserved Carry-On in USD)
--   - `projected_carry_on_out_local` (exact Carry-On in box local currency)
--   - `projected_carry_on_months`    (full future qualification months covered)
-- Matches `run_monthly_settlement_engine` Phase 1 & Phase 3 (compensatory) 1:1.
-- Idempotent & Zero-Destructive.
-- ============================================================================

DO $stage33$
DECLARE
    v_schema TEXT;
    v_def    TEXT;
    v_new    TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo'] LOOP
        v_def := pg_get_functiondef(format('%I.get_member_dashboard_bundle(uuid,text,bpchar,bpchar)', v_schema)::regprocedure);

        IF position('projected_carry_on_out_usd' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$'carry_on_out_usd', ROUND(b.carry_on_out_usd::numeric, 2),$a$,
                $b$'carry_on_out_usd', ROUND(b.carry_on_out_usd::numeric, 2),
        'projected_carry_on_out_usd', ROUND((CASE
            WHEN b.carry_on_out_usd > 0 THEN b.carry_on_out_usd
            WHEN b.qualification_source = 'compensatory' THEN GREATEST(0, b.carry_on_in_usd + b.current_month_purchases_usd)
            WHEN b.is_qualified OR (b.carry_on_in_usd + b.current_month_purchases_usd) >= b.target_required_usd
                 THEN GREATEST(0, (b.carry_on_in_usd + b.current_month_purchases_usd) - b.target_required_usd)
            ELSE GREATEST(0, b.carry_on_in_usd + b.current_month_purchases_usd)
        END)::numeric, 2),
        'projected_carry_on_out_local', ROUND(((CASE
            WHEN b.carry_on_out_usd > 0 THEN b.carry_on_out_usd
            WHEN b.qualification_source = 'compensatory' THEN GREATEST(0, b.carry_on_in_usd + b.current_month_purchases_usd)
            WHEN b.is_qualified OR (b.carry_on_in_usd + b.current_month_purchases_usd) >= b.target_required_usd
                 THEN GREATEST(0, (b.carry_on_in_usd + b.current_month_purchases_usd) - b.target_required_usd)
            ELSE GREATEST(0, b.carry_on_in_usd + b.current_month_purchases_usd)
        END) * COALESCE(c.admin_fx_rate, 1))::numeric, 2),
        'projected_carry_on_months', CASE
            WHEN b.target_required_usd > 0 THEN FLOOR((CASE
                WHEN b.carry_on_out_usd > 0 THEN b.carry_on_out_usd
                WHEN b.qualification_source = 'compensatory' THEN GREATEST(0, b.carry_on_in_usd + b.current_month_purchases_usd)
                WHEN b.is_qualified OR (b.carry_on_in_usd + b.current_month_purchases_usd) >= b.target_required_usd
                     THEN GREATEST(0, (b.carry_on_in_usd + b.current_month_purchases_usd) - b.target_required_usd)
                ELSE GREATEST(0, b.carry_on_in_usd + b.current_month_purchases_usd)
            END) / b.target_required_usd)::int
            ELSE 0
        END,$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE33_PATCH_MISS: get_member_dashboard_bundle on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;
    END LOOP;
END $stage33$;
