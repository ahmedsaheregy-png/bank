-- ============================================================================
-- SAWYAN V3.0 — Stage 28: Flash Offer Anti-Duplicate Lock & Actionable Admin Bell
-- Applies symmetrically & idempotently to BOTH `sawyan` and `sawyan_demo`
-- ============================================================================
-- 1. `submit_merchant_flash_offer`:
--    - Per-merchant advisory lock + identical-pending deduplication (prevents
--      double-click duplicates & burning 2/2 weekly slots on the same promo).
--    - Scopes weekly quota strictly to `recipient_type = 'admin_queue'`.
--    - Inserts instant `recipient_type = 'admin'` row so Admin Bell & Realtime
--      toast alert the founder immediately.
-- 2. Actionable + Critical-Alert Admin Bell Standard:
--    - Emits `recipient_type = 'admin'` for:
--        * `MerchantFlashOfferPending`
--        * `MemberWithdrawalRequested`
--        * `DisputeTicketOpened`
--        * `MemberGdprErasureRequested`
--        * `ZeroDiscrepancyBreachAutoHalt`
--    - Auto-marks matching Admin Bell notifications as read (`is_read = true`)
--      immediately upon resolution across all Admin decision RPCs.
--    - Excludes FYI self-action `MerchantBankTopupProofProcessed` from the
--      Admin Bell list in `get_admin_sovereign_bundle` (preserving audit table).
-- 3. Data Hygiene:
--    - Removes ONLY the 10-second duplicate pending promo row for Mirag on
--      `sawyan` (keeping original `5cc65971-be4d-4ea0-b19c-0fe6a47aa0e9` intact).
--    - Idempotently backfills 1 unread Admin Bell row for any pending promo.
-- ============================================================================

DO $stage28$
DECLARE
    v_schema TEXT;
    v_def    TEXT;
    v_new    TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo']
    LOOP
        -- --------------------------------------------------------------------
        -- 1. Upgrade `submit_merchant_flash_offer` (dedup + admin bell + quota)
        -- --------------------------------------------------------------------
        EXECUTE format($sql$
            CREATE OR REPLACE FUNCTION %I.submit_merchant_flash_offer(
                p_merchant_id   UUID,
                p_title         TEXT,
                p_body          TEXT,
                p_discount_hint VARCHAR DEFAULT NULL::character varying,
                p_actor_id      UUID    DEFAULT NULL::uuid
            ) RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path TO 'pg_catalog', 'pg_temp'
            AS $fn$
            DECLARE
                v_merchant       %I.merchants%%ROWTYPE;
                v_eff            JSONB;
                v_free_pct       NUMERIC(5,2);
                v_warn1_pct      NUMERIC(5,2);
                v_combined_text  TEXT;
                v_weekly_count   INT;
                v_existing_id    UUID;
                v_offer_id       UUID;
                v_clean_title    TEXT;
                v_clean_body     TEXT;
            BEGIN
                SELECT * INTO v_merchant FROM %I.merchants WHERE id = p_merchant_id;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'MERCHANT_NOT_FOUND: %%', p_merchant_id;
                END IF;

                -- Serialize rapid/double-click submissions per merchant
                PERFORM pg_advisory_xact_lock(hashtext('flash_offer:' || p_merchant_id::text));

                v_eff       := %I.compute_merchant_effective_state(p_merchant_id);
                v_free_pct  := COALESCE((v_eff->>'free_pct')::numeric, 0.00);
                v_warn1_pct := COALESCE((v_eff->>'warn1_pct')::numeric, 30.00);

                IF NOT COALESCE((v_eff->'effective_access'->>'can_submit_flash_offer')::boolean, false) THEN
                    IF v_merchant.onboarding_status <> 'approved'
                       OR v_merchant.governance_status <> 'good_standing'
                       OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false) IS NOT TRUE
                    THEN
                        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_MERCHANT_INACTIVE_OR_ISOLATED';
                    END IF;
                    RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_WALLET_NOT_GREEN: free_pct=%% <= warn1=%%', ROUND(v_free_pct, 2), v_warn1_pct;
                END IF;

                v_clean_title := trim(COALESCE(p_title, ''));
                v_clean_body  := trim(COALESCE(p_body, ''));
                IF v_clean_title = '' OR v_clean_body = '' THEN
                    RAISE EXCEPTION 'FLASH_OFFER_EMPTY_TITLE_OR_BODY';
                END IF;

                v_combined_text := v_clean_title || ' ' || v_clean_body || ' ' || COALESCE(p_discount_hint, '');
                IF v_combined_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|app|co|me|eg|tr|sa|de)\b|t\.me/|wa\.me/)' THEN
                    RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT: External links are strictly prohibited.';
                END IF;
                IF v_combined_text ~ '([0-9٠-٩][\s\-\(\)\.]{0,2}){7,}' THEN
                    RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT: Direct phone or payment numbers are strictly prohibited.';
                END IF;

                -- Scope weekly quota strictly to canonical admin_queue rows
                SELECT COUNT(*) INTO v_weekly_count
                  FROM %I.notifications
                 WHERE recipient_type = 'admin_queue'
                   AND event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved')
                   AND payload->>'merchant_id' = p_merchant_id::text
                   AND created_at >= now() - interval '7 days';

                -- Idempotency / duplicate-click lock for identical pending offer
                SELECT id INTO v_existing_id
                  FROM %I.notifications
                 WHERE recipient_type = 'admin_queue'
                   AND event_name = 'MerchantFlashOfferPending'
                   AND payload->>'merchant_id' = p_merchant_id::text
                   AND lower(trim(COALESCE(payload->>'title', ''))) = lower(v_clean_title)
                   AND lower(trim(COALESCE(payload->>'body', ''))) = lower(v_clean_body)
                 ORDER BY created_at ASC
                 LIMIT 1;

                IF v_existing_id IS NOT NULL THEN
                    RETURN jsonb_build_object(
                        'offer_id', v_existing_id,
                        'request_id', v_existing_id,
                        'status', 'pending_admin_approval',
                        'deduplicated', true,
                        'free_balance_pct', ROUND(v_free_pct, 2),
                        'weekly_remaining', GREATEST(0, 2 - v_weekly_count)
                    );
                END IF;

                IF v_weekly_count >= 2 THEN
                    RAISE EXCEPTION 'FLASH_OFFER_WEEKLY_LIMIT_EXCEEDED: Maximum 2 flash offers per 7 days.';
                END IF;

                -- 1) Canonical Moderation Queue record (admin_queue)
                INSERT INTO %I.notifications (
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
                        'title', v_clean_title,
                        'body', v_clean_body,
                        'discount_hint', p_discount_hint,
                        'free_balance_pct', ROUND(v_free_pct, 2),
                        'submitted_at', now()
                    )
                ) RETURNING id INTO v_offer_id;

                -- 2) Actionable Admin Bell notification (live bell + Realtime toast)
                INSERT INTO %I.notifications (
                    recipient_type, recipient_id, event_name, channel, payload
                ) VALUES (
                    'admin',
                    p_merchant_id,
                    'MerchantFlashOfferPending',
                    'in_app',
                    jsonb_build_object(
                        'offer_id', v_offer_id,
                        'status', 'pending_admin_approval',
                        'merchant_id', p_merchant_id,
                        'business_name', v_merchant.business_name,
                        'title', v_clean_title,
                        'body', v_clean_body,
                        'discount_hint', p_discount_hint,
                        'free_balance_pct', ROUND(v_free_pct, 2),
                        'submitted_at', now()
                    )
                );

                PERFORM %I.append_audit_log(
                    'merchant',
                    COALESCE(p_actor_id, p_merchant_id),
                    'merchant_flash_offer_submitted',
                    'notifications',
                    v_offer_id::text,
                    NULL,
                    jsonb_build_object('merchant_id', p_merchant_id, 'title', v_clean_title, 'free_pct', ROUND(v_free_pct, 2))
                );

                RETURN jsonb_build_object(
                    'offer_id', v_offer_id,
                    'request_id', v_offer_id,
                    'status', 'pending_admin_approval',
                    'deduplicated', false,
                    'free_balance_pct', ROUND(v_free_pct, 2),
                    'weekly_remaining', GREATEST(0, 2 - (v_weekly_count + 1))
                );
            END;
            $fn$;
            REVOKE ALL ON FUNCTION %I.submit_merchant_flash_offer(UUID, TEXT, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
            GRANT EXECUTE ON FUNCTION %I.submit_merchant_flash_offer(UUID, TEXT, TEXT, VARCHAR, UUID) TO service_role;
        $sql$,
            v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema
        );

        -- --------------------------------------------------------------------
        -- 2. Patch `get_admin_sovereign_bundle`: exclude FYI self-action
        --    `MerchantBankTopupProofProcessed` from Admin Bell
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.get_admin_sovereign_bundle(uuid,text,bpchar)', v_schema)::regprocedure);
        IF position('MerchantBankTopupProofProcessed' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$AND n.event_name NOT IN ('MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')$a$,
                $b$AND n.event_name NOT IN ('MerchantFlashOfferApproved', 'MerchantFlashOfferRejected', 'MerchantBankTopupProofProcessed')$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: get_admin_sovereign_bundle on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 3. Patch `admin_operational_decision`: auto-clear Admin Bell rows
        --    upon flash_offer, merchant_complaint, dispute_ticket,
        --    withdrawal_payout, and support_ticket decisions
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.admin_operational_decision(uuid,text,varchar,text,varchar,text,varchar)', v_schema)::regprocedure);
        IF position('/*STAGE28_AUTO_CLEAR_BELL*/' IN v_def) = 0 THEN
            v_new := v_def;

            -- 3a. flash_offer
            v_new := replace(
                v_new,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'flash_offer_' || v_dec,$a$, v_schema),
                format($b$/*STAGE28_AUTO_CLEAR_BELL*/
        UPDATE %I.notifications
           SET is_read    = true,
               event_name = CASE WHEN v_dec = 'approved' THEN 'MerchantFlashOfferApproved' ELSE 'MerchantFlashOfferRejected' END
         WHERE recipient_type = 'admin'
           AND event_name = 'MerchantFlashOfferPending'
           AND (
               payload->>'offer_id' = v_notif.id::text
               OR (
                   recipient_id = COALESCE((v_notif.payload->>'merchant_id')::uuid, v_notif.recipient_id)
                   AND lower(trim(COALESCE(payload->>'title', ''))) = lower(trim(COALESCE(v_notif.payload->>'title', '')))
                   AND is_read = false
               )
           );
        PERFORM %I.append_audit_log('admin', p_admin_id, 'flash_offer_' || v_dec,$b$, v_schema, v_schema)
            );

            -- 3b. merchant_complaint
            v_new := replace(
                v_new,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'merchant_complaint_' || v_dec,$a$, v_schema),
                format($b$UPDATE %I.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND event_name = 'MerchantComplaintFiled'
           AND is_read = false
           AND (payload->>'complaint_id' = v_comp.id::text OR recipient_id = v_comp.target_id);
        PERFORM %I.append_audit_log('admin', p_admin_id, 'merchant_complaint_' || v_dec,$b$, v_schema, v_schema)
            );

            -- 3c. dispute_ticket
            v_new := replace(
                v_new,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'dispute_' || v_dec,$a$, v_schema),
                format($b$UPDATE %I.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND event_name = 'DisputeTicketOpened'
           AND is_read = false
           AND payload->>'dispute_id' = v_dispute.id::text;
        PERFORM %I.append_audit_log('admin', p_admin_id, 'dispute_' || v_dec,$b$, v_schema, v_schema)
            );

            -- 3d. withdrawal_payout
            v_new := replace(
                v_new,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'withdrawal_completed',$a$, v_schema),
                format($b$UPDATE %I.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND event_name = 'MemberWithdrawalRequested'
           AND is_read = false
           AND payload->>'wallet_tx_id' = v_wtx.id::text;
        PERFORM %I.append_audit_log('admin', p_admin_id, 'withdrawal_completed',$b$, v_schema, v_schema)
            );

            -- 3e. support_ticket (GDPR erasure tickets)
            v_new := replace(
                v_new,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'support_ticket_' || v_dec,$a$, v_schema),
                format($b$IF v_dec IN ('closed', 'resolved') THEN
            UPDATE %I.notifications
               SET is_read = true
             WHERE recipient_type = 'admin'
               AND event_name = 'MemberGdprErasureRequested'
               AND is_read = false
               AND payload->>'ticket_id' = p_record_id;
        END IF;
        PERFORM %I.append_audit_log('admin', p_admin_id, 'support_ticket_' || v_dec,$b$, v_schema, v_schema)
            );

            IF v_new = v_def OR position('/*STAGE28_AUTO_CLEAR_BELL*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: admin_operational_decision on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 4. Patch `admin_decide_withdrawal_v3`: auto-clear withdrawal bell
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.admin_decide_withdrawal_v3(uuid,text,uuid,varchar,text,text)', v_schema)::regprocedure);
        IF position('/*STAGE28_WD_CLEAR*/' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'withdrawal_payout_completed',$a$, v_schema),
                format($b$/*STAGE28_WD_CLEAR*/
        UPDATE %I.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND event_name = 'MemberWithdrawalRequested'
           AND is_read = false
           AND payload->>'wallet_tx_id' = v_wtx.id::text;
        PERFORM %I.append_audit_log('admin', p_admin_id, 'withdrawal_payout_completed',$b$, v_schema, v_schema)
            );
            v_new := replace(
                v_new,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'withdrawal_rejected_and_refunded_100pct',$a$, v_schema),
                format($b$UPDATE %I.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND event_name = 'MemberWithdrawalRequested'
           AND is_read = false
           AND payload->>'wallet_tx_id' = v_wtx.id::text;
        PERFORM %I.append_audit_log('admin', p_admin_id, 'withdrawal_rejected_and_refunded_100pct',$b$, v_schema, v_schema)
            );
            IF position('/*STAGE28_WD_CLEAR*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: admin_decide_withdrawal_v3 on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 5. Patch `admin_manage_merchant_contract`: auto-clear NewMerchantRegistered
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.admin_manage_merchant_contract(uuid,text,uuid,varchar,numeric,varchar,numeric,boolean,boolean,numeric,text,uuid,text,varchar,varchar,smallint,boolean,numeric,boolean,time without time zone,boolean,text,smallint,boolean,numeric,boolean,boolean)', v_schema)::regprocedure);
        IF position('/*STAGE28_MER_CLEAR*/' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$PERFORM %I.append_audit_log(
        'admin', p_admin_id, 'merchant_contract_updated',$a$, v_schema),
                format($b$/*STAGE28_MER_CLEAR*/
    IF v_mer.onboarding_status IS DISTINCT FROM v_old_onb AND v_mer.onboarding_status IN ('approved', 'rejected') THEN
        UPDATE %I.notifications
           SET is_read = true
         WHERE recipient_type = 'admin'
           AND event_name = 'NewMerchantRegistered'
           AND recipient_id = v_mer.id
           AND is_read = false;
    END IF;
    PERFORM %I.append_audit_log(
        'admin', p_admin_id, 'merchant_contract_updated',$b$, v_schema, v_schema)
            );
            IF position('/*STAGE28_MER_CLEAR*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: admin_manage_merchant_contract on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 6. Patch `admin_search_and_reply_ops`: auto-clear GDPR bell on close
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.admin_search_and_reply_ops(uuid,text,varchar,varchar,text,uuid,text,varchar)', v_schema)::regprocedure);
        IF position('/*STAGE28_TICKET_CLEAR*/' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$PERFORM %I.append_audit_log('admin', p_admin_id, 'support_ticket_replied',$a$, v_schema),
                format($b$/*STAGE28_TICKET_CLEAR*/
        IF lower(trim(COALESCE(p_new_status, 'closed'))) IN ('closed', 'resolved') AND p_record_id IS NOT NULL THEN
            UPDATE %I.notifications
               SET is_read = true
             WHERE recipient_type = 'admin'
               AND event_name = 'MemberGdprErasureRequested'
               AND is_read = false
               AND payload->>'ticket_id' = p_record_id::text;
        END IF;
        PERFORM %I.append_audit_log('admin', p_admin_id, 'support_ticket_replied',$b$, v_schema, v_schema)
            );
            IF position('/*STAGE28_TICKET_CLEAR*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: admin_search_and_reply_ops on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 7. Patch `request_member_withdrawal`: emit MemberWithdrawalRequested
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.request_member_withdrawal(uuid,uuid,numeric,uuid,text)', v_schema)::regprocedure);
        IF position('MemberWithdrawalRequested' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$PERFORM %I.append_audit_log(
        'member', v_member.id, 'member_withdrawal_requested',$a$, v_schema),
                format($b$INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES (
        'admin',
        v_member.id,
        'MemberWithdrawalRequested',
        'in_app',
        jsonb_build_object(
            'wallet_tx_id', v_wtx_id,
            'member_id', v_member.id,
            'member_code', v_member.member_code,
            'full_name', v_member.full_name,
            'amount_usd', p_amount_usd,
            'provider', v_pm.provider
        )
    );
    PERFORM %I.append_audit_log(
        'member', v_member.id, 'member_withdrawal_requested',$b$, v_schema, v_schema)
            );
            IF position('MemberWithdrawalRequested' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: request_member_withdrawal on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 8. Patch `submit_member_dispute`: emit DisputeTicketOpened to Admin Bell
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.submit_member_dispute(uuid,uuid,text,text,text,smallint,text,smallint,varchar,text)', v_schema)::regprocedure);
        IF position('/*STAGE28_ADMIN_DISPUTE*/' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', v_tx.merchant_id, 'DisputeTicketOpened', 'in_app',
            jsonb_build_object('dispute_id', v_id, 'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'category', v_cat, 'fast_tracked', (v_init_status = 'escalated_to_admin')));$a$, v_schema),
                format($b$/*STAGE28_ADMIN_DISPUTE*/
    INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES
        ('merchant', v_tx.merchant_id, 'DisputeTicketOpened', 'in_app',
         jsonb_build_object('dispute_id', v_id, 'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'category', v_cat, 'fast_tracked', (v_init_status = 'escalated_to_admin'))),
        ('admin', v_member.id, 'DisputeTicketOpened', 'in_app',
         jsonb_build_object('dispute_id', v_id, 'transaction_id', v_tx.id, 'merchant_id', v_tx.merchant_id, 'member_code', v_member.member_code, 'sw_short_code', v_tx.sw_short_code, 'category', v_cat, 'fast_tracked', (v_init_status = 'escalated_to_admin')));$b$, v_schema)
            );
            IF position('/*STAGE28_ADMIN_DISPUTE*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: submit_member_dispute on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 9. Patch `member_request_gdpr_erasure` & `gdpr_pseudonymize_member_data`
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.member_request_gdpr_erasure(uuid,text,text)', v_schema)::regprocedure);
        IF position('MemberGdprErasureRequested' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$PERFORM %I.append_audit_log($a$, v_schema),
                format($b$INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload)
                VALUES (
                    'admin',
                    v_member.id,
                    'MemberGdprErasureRequested',
                    'in_app',
                    jsonb_build_object(
                        'ticket_id', v_ticket_id,
                        'member_id', v_member.id,
                        'member_code', v_member.member_code,
                        'full_name', v_member.full_name,
                        'sla_hours', 72,
                        'reason', v_reason
                    )
                );
                PERFORM %I.append_audit_log($b$, v_schema, v_schema)
            );
            IF position('MemberGdprErasureRequested' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: member_request_gdpr_erasure on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        v_def := pg_get_functiondef(format('%I.gdpr_pseudonymize_member_data(uuid,text,uuid,text)', v_schema)::regprocedure);
        IF position('/*STAGE28_GDPR_CLEAR*/' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$PERFORM %I.append_audit_log($a$, v_schema),
                format($b$/*STAGE28_GDPR_CLEAR*/
                UPDATE %I.notifications
                   SET is_read = true
                 WHERE recipient_type = 'admin'
                   AND event_name = 'MemberGdprErasureRequested'
                   AND recipient_id = v_member.id
                   AND is_read = false;
                PERFORM %I.append_audit_log($b$, v_schema, v_schema)
            );
            IF position('/*STAGE28_GDPR_CLEAR*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: gdpr_pseudonymize_member_data on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 10. Patch `run_nightly_zero_discrepancy_audit`: emit to Admin Bell too
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.run_nightly_zero_discrepancy_audit()', v_schema)::regprocedure);
        IF position('/*STAGE28_ZERO_DISC_BELL*/' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                format($a$INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'admin_queue',
            '00000000-0000-0000-0000-000000000000'::uuid,
            'ZeroDiscrepancyBreachAutoHalt',
            'in_app',
            v_report || jsonb_build_object('auto_halted_switches', jsonb_build_array('K_PAY', 'K_WD'))
        );$a$, v_schema),
                format($b$/*STAGE28_ZERO_DISC_BELL*/
        INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES
            ('admin_queue', '00000000-0000-0000-0000-000000000000'::uuid, 'ZeroDiscrepancyBreachAutoHalt', 'in_app',
             v_report || jsonb_build_object('auto_halted_switches', jsonb_build_array('K_PAY', 'K_WD'))),
            ('admin', '00000000-0000-0000-0000-000000000000'::uuid, 'ZeroDiscrepancyBreachAutoHalt', 'in_app',
             v_report || jsonb_build_object('auto_halted_switches', jsonb_build_array('K_PAY', 'K_WD')));$b$, v_schema)
            );
            IF position('/*STAGE28_ZERO_DISC_BELL*/' IN v_new) = 0 THEN
                RAISE EXCEPTION 'STAGE28_PATCH_MISS: run_nightly_zero_discrepancy_audit on %', v_schema;
            END IF;
            EXECUTE v_new;
            EXECUTE format('REVOKE ALL ON FUNCTION %I.run_nightly_zero_discrepancy_audit() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION %I.run_nightly_zero_discrepancy_audit() TO service_role;', v_schema, v_schema);
        END IF;

        -- --------------------------------------------------------------------
        -- 11. Backfill 1 unread Admin Bell row for any pending admin_queue offer
        -- --------------------------------------------------------------------
        IF v_schema = 'sawyan' THEN
            IF EXISTS (
                SELECT 1 FROM sawyan.notifications
                 WHERE id = '5cc65971-be4d-4ea0-b19c-0fe6a47aa0e9'::uuid
                   AND recipient_type = 'admin_queue'
            ) THEN
                DELETE FROM sawyan.notifications
                 WHERE id = 'f6baf7e0-bb0e-445e-aa99-aa743e2f6d6b'::uuid
                   AND recipient_type = 'admin_queue'
                   AND event_name = 'MerchantFlashOfferPending';
            END IF;
        END IF;

        EXECUTE format($sql$
            INSERT INTO %I.notifications (recipient_type, recipient_id, event_name, channel, payload, created_at)
            SELECT 'admin',
                   q.recipient_id,
                   'MerchantFlashOfferPending',
                   'in_app',
                   COALESCE(q.payload, '{}'::jsonb) || jsonb_build_object('offer_id', q.id),
                   q.created_at
              FROM %I.notifications q
             WHERE q.recipient_type = 'admin_queue'
               AND q.event_name = 'MerchantFlashOfferPending'
               AND NOT EXISTS (
                   SELECT 1 FROM %I.notifications b
                    WHERE b.recipient_type = 'admin'
                      AND b.event_name = 'MerchantFlashOfferPending'
                      AND b.payload->>'offer_id' = q.id::text
               );
        $sql$, v_schema, v_schema, v_schema);
    END LOOP;
END $stage28$;
