-- ============================================================================
-- SAWYAN ECOSYSTEM â€” V3.0 MIGRATION 28: LIVE FLASH OFFERS BROADCAST & SHOWCASE
-- ============================================================================
-- Closes the end-to-end loop when an Admin approves a Merchant's promotional
-- campaign (`MerchantFlashOfferPending` -> `MerchantFlashOfferApproved`):
--   1. Upgrades `sawyan.admin_operational_decision(...)` (`flash_offer` branch):
--      - Computes explicit `expires_at` from `discount_hint` (24h/48h/72h/7d/14d;
--        default 72h) and stamps merchant metadata (`country_code`, `merchant_code`,
--        `merchant_type`, `category`) onto the approved `admin_queue` record.
--      - Sends an instant in-app notification (`MerchantFlashOfferApproved` /
--        `MerchantFlashOfferRejected`) back to the Merchant's bell.
--      - Broadcasts an instant in-app notification (`MerchantFlashOfferLive`)
--        to active, non-banned Members in the merchant's country (or globally
--        for `online`/`both` merchants), with idempotent `NOT EXISTS` protection.
--   2. Adds public RPC `sawyan.get_public_active_flash_offers(p_country_code, p_limit)`
--      returning all currently active, approved, non-expired promotional offers
--      for active non-isolated merchants to power Homepage, Public Directory,
--      and Member Portal banners, store badges, and one-time spotlight popups.
--   3. Idempotently backfills `expires_at` + member/merchant notifications for
--      any already-approved active campaign (e.g., Sakan Turkey `M-TR-101`).
--
-- Strictly Idempotent (CREATE OR REPLACE, zero DROP). ZERO bare lowercase
-- `sawyan` inside string literals for clean `sawyan` -> `sawyan_demo` cloning.
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.admin_operational_decision(
    p_admin_id       UUID,
    p_session_token  TEXT,
    p_domain         VARCHAR,
    p_record_id      TEXT,
    p_decision       VARCHAR,
    p_notes          TEXT DEFAULT NULL,
    p_reversal_phase VARCHAR DEFAULT 'in_month'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_admin_info    JSONB;
    v_dom           VARCHAR(40);
    v_dec           VARCHAR(40);
    v_notif         sawyan.notifications%ROWTYPE;
    v_merch         sawyan.merchants%ROWTYPE;
    v_merch_cc      CHAR(2);
    v_hint          TEXT;
    v_ttl           INTERVAL;
    v_approved_at   TIMESTAMPTZ;
    v_expires_at    TIMESTAMPTZ;
    v_offer_title   TEXT;
    v_offer_body    TEXT;
    v_broadcast_cnt INT := 0;
    v_dispute       sawyan.dispute_tickets%ROWTYPE;
    v_comp          sawyan.complaints%ROWTYPE;
    v_tx            sawyan.transactions%ROWTYPE;
    v_wtx           sawyan.wallet_transactions%ROWTYPE;
    v_settings      sawyan.settings%ROWTYPE;
    v_claw_res      JSONB := NULL;
BEGIN
    v_admin_info := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, true);
    v_dom := lower(trim(COALESCE(p_domain, '')));
    v_dec := lower(trim(COALESCE(p_decision, '')));

    IF v_dom = 'flash_offer' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        SELECT * INTO v_notif FROM sawyan.notifications WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'FLASH_OFFER_NOT_FOUND'; END IF;

        SELECT * INTO v_merch
          FROM sawyan.merchants
         WHERE id = COALESCE((v_notif.payload->>'merchant_id')::uuid, v_notif.recipient_id);

        IF FOUND THEN
            SELECT country_code INTO v_merch_cc
              FROM sawyan.countries
             WHERE id = v_merch.country_id;
        END IF;

        v_offer_title := COALESCE(NULLIF(trim(v_notif.payload->>'title'), ''), 'Ø¹Ø±Ø¶ ØªØ±ÙˆÙŠØ¬ÙŠ Ø­ØµØ±ÙŠ');
        v_offer_body  := COALESCE(NULLIF(trim(v_notif.payload->>'body'), ''), v_offer_title);
        v_hint        := COALESCE(NULLIF(trim(v_notif.payload->>'discount_hint'), ''), '');

        IF v_dec = 'approved' THEN
            v_approved_at := now();
            v_ttl := CASE
                WHEN v_hint LIKE '%24%' OR v_hint LIKE '%Ù¢Ù¤%' THEN interval '24 hours'
                WHEN v_hint LIKE '%48%' OR v_hint LIKE '%Ù¤Ù¨%' THEN interval '48 hours'
                WHEN v_hint LIKE '%72%' OR v_hint LIKE '%Ù§Ù¢%' OR v_hint LIKE '%3 Ø£ÙŠØ§Ù…%' OR v_hint LIKE '%Ù£ Ø£ÙŠØ§Ù…%' THEN interval '72 hours'
                WHEN v_hint LIKE '%14%' OR v_hint LIKE '%Ù¡Ù¤%' THEN interval '14 days'
                WHEN v_hint LIKE '%7%'  OR v_hint LIKE '%Ù§%'  OR v_hint LIKE '%Ø£Ø³Ø¨ÙˆØ¹%' THEN interval '7 days'
                ELSE interval '72 hours'
            END;
            v_expires_at := v_approved_at + v_ttl;

            UPDATE sawyan.notifications
               SET event_name    = 'MerchantFlashOfferApproved',
                   dispatched_at = v_approved_at,
                   payload       = v_notif.payload || jsonb_build_object(
                       'status', 'approved',
                       'approved_by', p_admin_id,
                       'approved_at', v_approved_at,
                       'expires_at', v_expires_at,
                       'country_code', v_merch_cc,
                       'merchant_code', v_merch.merchant_code,
                       'merchant_type', v_merch.merchant_type,
                       'category', v_merch.category
                   )
             WHERE id = v_notif.id;

            IF v_merch.id IS NOT NULL THEN
                -- Broadcast in-app notification to active members in merchant's country (or globally for online/both)
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                SELECT 'member',
                       m.id,
                       'MerchantFlashOfferLive',
                       'in_app',
                       jsonb_build_object(
                           'offer_id', v_notif.id,
                           'merchant_id', v_merch.id,
                           'merchant_code', v_merch.merchant_code,
                           'business_name', v_merch.business_name,
                           'country_code', v_merch_cc,
                           'offer_title', v_offer_title,
                           'offer_body', v_offer_body,
                           'discount_hint', v_hint,
                           'approved_at', v_approved_at,
                           'expires_at', v_expires_at,
                           'title', 'ðŸ”¥ Ø¹Ø±Ø¶ Ø­ØµØ±ÙŠ Ø§Ù„Ø¢Ù† Ù…Ù† ' || v_merch.business_name,
                           'message', v_offer_title || CASE WHEN v_hint <> '' THEN ' â€” ' || v_hint ELSE '' END
                       ),
                       v_approved_at
                  FROM sawyan.members m
                 WHERE m.member_code > 0
                   AND m.is_active_in_tree = true
                   AND m.is_tombstone_banned = false
                   AND (
                       v_merch.merchant_type IN ('online', 'both')
                       OR m.residency_country_id = v_merch.country_id
                       OR m.nationality_country_id = v_merch.country_id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM sawyan.notifications ex
                        WHERE ex.recipient_type = 'member'
                          AND ex.recipient_id = m.id
                          AND ex.event_name = 'MerchantFlashOfferLive'
                          AND ex.payload->>'offer_id' = v_notif.id::text
                   );
                GET DIAGNOSTICS v_broadcast_cnt = ROW_COUNT;

                -- Notify the merchant that their campaign is live
                IF NOT EXISTS (
                    SELECT 1 FROM sawyan.notifications ex
                     WHERE ex.recipient_type = 'merchant'
                       AND ex.recipient_id = v_merch.id
                       AND ex.event_name = 'MerchantFlashOfferApproved'
                       AND ex.payload->>'offer_id' = v_notif.id::text
                ) THEN
                    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                    VALUES (
                        'merchant',
                        v_merch.id,
                        'MerchantFlashOfferApproved',
                        'in_app',
                        jsonb_build_object(
                            'offer_id', v_notif.id,
                            'merchant_id', v_merch.id,
                            'business_name', v_merch.business_name,
                            'offer_title', v_offer_title,
                            'expires_at', v_expires_at,
                            'broadcast_members_count', v_broadcast_cnt,
                            'title', 'ðŸ”¥ ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØ¨Ø« Ø­Ù…Ù„ØªÙƒ Ø§Ù„ØªØ±ÙˆÙŠØ¬ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­!',
                            'message', 'Ø­Ù…Ù„ØªÙƒ Â«' || v_offer_title || 'Â» Ø¸Ø§Ù‡Ø±Ø© Ø§Ù„Ø¢Ù† ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© ÙˆØ§Ù„Ø¯Ù„ÙŠÙ„ ÙˆØªÙ… Ø¥Ø´Ø¹Ø§Ø± ' || v_broadcast_cnt || ' Ø¹Ø¶ÙˆØ§Ù‹ Ù†Ø´Ø·Ø§Ù‹.'
                        ),
                        v_approved_at
                    );
                END IF;
            END IF;

        ELSIF v_dec = 'rejected' THEN
            UPDATE sawyan.notifications
               SET event_name = 'MerchantFlashOfferRejected',
                   payload    = v_notif.payload || jsonb_build_object(
                       'status', 'rejected',
                       'rejected_by', p_admin_id,
                       'rejection_reason', COALESCE(p_notes, 'ØºÙŠØ± Ù…Ø·Ø§Ø¨Ù‚ Ù„Ø¶ÙˆØ§Ø¨Ø· Ø§Ù„Ù†Ø´Ø±')
                   )
             WHERE id = v_notif.id;

            IF v_merch.id IS NOT NULL THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'merchant',
                    v_merch.id,
                    'MerchantFlashOfferRejected',
                    'in_app',
                    jsonb_build_object(
                        'offer_id', v_notif.id,
                        'merchant_id', v_merch.id,
                        'offer_title', v_offer_title,
                        'reason', COALESCE(p_notes, 'ØºÙŠØ± Ù…Ø·Ø§Ø¨Ù‚ Ù„Ø¶ÙˆØ§Ø¨Ø· Ø§Ù„Ù†Ø´Ø±'),
                        'title', 'âŒ ØªØ¹Ø°Ø± Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø­Ù…Ù„Ø© Ø§Ù„ØªØ±ÙˆÙŠØ¬ÙŠØ©',
                        'message', 'Ø­Ù…Ù„ØªÙƒ Â«' || v_offer_title || 'Â»: ' || COALESCE(p_notes, 'ØºÙŠØ± Ù…Ø·Ø§Ø¨Ù‚ Ù„Ø¶ÙˆØ§Ø¨Ø· Ø§Ù„Ù†Ø´Ø±')
                    ),
                    now()
                );
            END IF;
        ELSE
            RAISE EXCEPTION 'INVALID_FLASH_OFFER_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'flash_offer_' || v_dec, 'notifications', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'broadcast_members_count', v_broadcast_cnt));
        RETURN jsonb_build_object(
            'domain', v_dom,
            'record_id', p_record_id,
            'status', v_dec,
            'expires_at', v_expires_at,
            'broadcast_members_count', v_broadcast_cnt
        );

    ELSIF v_dom = 'merchant_complaint' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        IF v_dec NOT IN ('verified', 'dismissed') THEN
            RAISE EXCEPTION 'INVALID_COMPLAINT_DECISION: %', p_decision;
        END IF;
        SELECT * INTO v_comp FROM sawyan.complaints WHERE id = p_record_id::uuid AND target_type = 'merchant' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_COMPLAINT_NOT_FOUND'; END IF;

        UPDATE sawyan.complaints
           SET status               = v_dec,
               admin_notes          = COALESCE(NULLIF(trim(p_notes), ''), admin_notes),
               reviewed_by_admin_id = p_admin_id,
               reviewed_at          = now()
         WHERE id = v_comp.id;

        IF v_dec = 'verified' THEN
            PERFORM sawyan.sync_merchant_status_flags(v_comp.target_id);
        END IF;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES
            ('member', v_comp.complainant_id, 'MerchantComplaintUpdated', 'in_app',
             jsonb_build_object('complaint_id', v_comp.id, 'decision', v_dec, 'notes', p_notes), now()),
            ('merchant', v_comp.target_id, 'MerchantComplaintUpdated', 'in_app',
             jsonb_build_object('complaint_id', v_comp.id, 'decision', v_dec, 'notes', p_notes), now());

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_complaint_' || v_dec, 'complaints', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'merchant_id', v_comp.target_id));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'merchant_id', v_comp.target_id);

    ELSIF v_dom = 'dispute_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'reviewer', 'approver', 'finance'], true);
        SELECT * INTO v_dispute FROM sawyan.dispute_tickets WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'DISPUTE_TICKET_NOT_FOUND'; END IF;

        SELECT * INTO v_tx FROM sawyan.transactions WHERE id = v_dispute.transaction_id FOR UPDATE;

        IF v_dec = 'resolved_member' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_member',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            IF v_tx.status = 'pending' THEN
                v_claw_res := sawyan.feed_monthly_target_box(v_tx.id, v_tx.member_id);
            END IF;
            PERFORM sawyan.sync_merchant_status_flags(v_dispute.merchant_id);

        ELSIF v_dec = 'resolved_member_clawback' THEN
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'CLAWBACK_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_member',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            v_claw_res := sawyan.process_transaction_reversal_clawback(v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin dispute reversal before payout'));
            PERFORM sawyan.sync_merchant_status_flags(v_dispute.merchant_id);

        ELSIF v_dec = 'resolved_merchant_force_return' THEN
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'FORCE_RETURN_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            UPDATE sawyan.return_requests
               SET status      = 'approved_in_app',
                   resolved_at = sawyan.now_utc()
             WHERE transaction_id = v_tx.id
               AND status IN ('pending_otp', 'escalated_to_admin');
            v_claw_res := sawyan.process_transaction_reversal_clawback(
                v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin forced return after runaway customer proof')
            );
            UPDATE sawyan.members
               SET payout_cooldown_until = GREATEST(COALESCE(payout_cooldown_until, sawyan.now_utc()), sawyan.now_utc() + interval '30 days')
             WHERE id = v_tx.member_id;

        ELSIF v_dec = 'resolved_merchant_malicious_claim' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            UPDATE sawyan.return_requests
               SET status      = 'rejected_member',
                   resolved_at = sawyan.now_utc()
             WHERE transaction_id = v_tx.id
               AND status IN ('pending_otp', 'escalated_to_admin');
            UPDATE sawyan.members
               SET payout_cooldown_until = GREATEST(COALESCE(payout_cooldown_until, sawyan.now_utc()), sawyan.now_utc() + interval '30 days')
             WHERE id = v_tx.member_id;

        ELSIF v_dec = 'resolved_merchant' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
        ELSE
            RAISE EXCEPTION 'INVALID_DISPUTE_DECISION: %', p_decision;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'dispute_' || v_dec, 'dispute_tickets', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'effect', v_claw_res));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'ledger_effect', v_claw_res);

    ELSIF v_dom = 'price_gouging' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        IF v_dec NOT IN ('verified_violation', 'dismissed') THEN
            RAISE EXCEPTION 'INVALID_PRICE_GOUGING_DECISION';
        END IF;
        UPDATE sawyan.price_gouging_reports SET verification_status = v_dec WHERE id = p_record_id::uuid;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'price_gouging_' || v_dec, 'price_gouging_reports', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'fraud_signal' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'finance'], true);
        IF v_dec NOT IN ('payout_held', 'cleared', 'confirmed_fraud') THEN
            RAISE EXCEPTION 'INVALID_FRAUD_DECISION';
        END IF;
        UPDATE sawyan.fraud_graph_signals SET status = v_dec WHERE id = p_record_id::uuid;
        IF v_dec = 'confirmed_fraud' THEN
            UPDATE sawyan.members
               SET is_tombstone_banned = true
             WHERE id = ANY((SELECT involved_member_ids FROM sawyan.fraud_graph_signals WHERE id = p_record_id::uuid))
               AND member_code > 0;
        END IF;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'fraud_signal_' || v_dec, 'fraud_graph_signals', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'member_kyc' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['kyc_officer', 'approver', 'reviewer'], true);
        IF v_dec NOT IN ('verified', 'rejected') THEN
            RAISE EXCEPTION 'INVALID_KYC_DECISION';
        END IF;
        UPDATE sawyan.members SET kyc_status = v_dec WHERE id = p_record_id::uuid AND member_code > 0;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_kyc_' || v_dec, 'members', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'member_tombstone' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver'], true);
        UPDATE sawyan.members SET is_tombstone_banned = (v_dec = 'ban') WHERE id = p_record_id::uuid AND member_code > 0;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_tombstone_' || v_dec, 'members', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'is_tombstone_banned', (v_dec = 'ban'));

    ELSIF v_dom = 'merchant_status' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'finance'], true);
        IF v_dec = 'activate' THEN
            UPDATE sawyan.merchants
               SET governance_status           = CASE WHEN governance_status IN ('paused_by_admin', 'paused_by_merchant')
                                                      THEN COALESCE(pre_pause_governance_status, 'good_standing')
                                                      ELSE 'good_standing' END,
                   pre_pause_governance_status = NULL,
                   governance_reason           = COALESCE(NULLIF(trim(p_notes), ''), 'ØªÙØ¹ÙŠÙ„ Ø§Ù„Ù…ØªØ¬Ø± Ø¥Ø¯Ø§Ø±ÙŠØ§Ù‹'),
                   governance_updated_at       = now()
             WHERE id = p_record_id::uuid;
        ELSIF v_dec = 'deactivate' THEN
            UPDATE sawyan.merchants
               SET pre_pause_governance_status = CASE WHEN governance_status IN ('good_standing', 'probation_warning') THEN governance_status ELSE pre_pause_governance_status END,
                   governance_status           = 'paused_by_admin',
                   governance_reason           = COALESCE(NULLIF(trim(p_notes), ''), 'Ø¥ÙŠÙ‚Ø§Ù Ù…Ø¤Ù‚Øª Ø¥Ø¯Ø§Ø±ÙŠØ§Ù‹'),
                   governance_updated_at       = now()
             WHERE id = p_record_id::uuid;
        ELSIF v_dec = 'isolate' THEN
            UPDATE sawyan.merchants
               SET pre_pause_governance_status = CASE WHEN governance_status IN ('good_standing', 'probation_warning') THEN governance_status ELSE pre_pause_governance_status END,
                   governance_status           = 'restricted_no_reject',
                   governance_reason           = COALESCE(NULLIF(trim(p_notes), ''), 'Ø¹Ø²Ù„ ÙˆØªÙ‚ÙŠÙŠØ¯ Ø§Ù„Ù…ØªØ¬Ø± Ø¥Ø¯Ø§Ø±ÙŠØ§Ù‹'),
                   governance_updated_at       = now()
             WHERE id = p_record_id::uuid;
        ELSE
            RAISE EXCEPTION 'INVALID_MERCHANT_STATUS_DECISION';
        END IF;

        PERFORM sawyan.sync_merchant_status_flags(p_record_id::uuid);
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_' || v_dec, 'merchants', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'transaction' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'finance', 'support'], true);
        SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;

        IF v_dec = 'approve_escalated' THEN
            IF v_tx.status <> 'pending' THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            UPDATE sawyan.transactions
               SET commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb)
                   || jsonb_build_object('admin_escalated_resolved', true, 'escalated_resolved_by', p_admin_id)
             WHERE id = v_tx.id;
            v_claw_res := sawyan.feed_monthly_target_box(v_tx.id, p_admin_id);
        ELSIF v_dec = 'reject_escalated' THEN
            IF v_tx.status <> 'pending' THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            IF COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount) > 0 THEN
                UPDATE sawyan.merchants
                   SET soft_hold_balance = GREATEST(0, soft_hold_balance - COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount))
                 WHERE id = v_tx.merchant_id;
            END IF;
            UPDATE sawyan.transactions
               SET status = 'rejected',
                   commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object('rejected_by_admin', p_admin_id, 'rejection_reason', COALESCE(p_notes, 'Ø±ÙØ¶ Ø¥Ø¯Ø§Ø±ÙŠ'))
             WHERE id = v_tx.id;
            PERFORM sawyan.sync_merchant_status_flags(v_tx.merchant_id);
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
            VALUES
                ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                 jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_notes, 'Ù‚Ø±Ø§Ø± Ø¥Ø¯Ø§Ø±ÙŠ'))),
                ('merchant', v_tx.merchant_id, 'PendingInvoiceRejectedByAdmin', 'in_app',
                 jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_notes, 'Ù‚Ø±Ø§Ø± Ø¥Ø¯Ø§Ø±ÙŠ')));
        ELSIF v_dec = 'reverse_pre_payout' THEN
            PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance'], true);
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'REVERSAL_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            v_claw_res := sawyan.process_transaction_reversal_clawback(v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin pre-payout reversal'));
            PERFORM sawyan.sync_merchant_status_flags(v_tx.merchant_id);
        ELSE
            RAISE EXCEPTION 'INVALID_TRANSACTION_DECISION: %', p_decision;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'transaction_' || v_dec, 'transactions', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'effect', v_claw_res));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'ledger_effect', v_claw_res);

    ELSIF v_dom = 'withdrawal_payout' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['finance', 'approver'], true);
        SELECT * INTO v_wtx FROM sawyan.wallet_transactions WHERE id = p_record_id::uuid AND transaction_type = 'withdrawal' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_TX_NOT_FOUND'; END IF;

        SELECT * INTO v_settings FROM sawyan.settings
         WHERE country_id IS NULL AND effective_from <= now()
         ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;
        IF NOT FOUND THEN
            SELECT * INTO v_settings FROM sawyan.settings WHERE country_id IS NULL ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;
        END IF;

        IF v_dec = 'completed' THEN
            IF v_wtx.amount_usd >= COALESCE(v_settings.wht_threshold_usd, 200.00) THEN
                RAISE EXCEPTION 'WITHDRAWAL_DUAL_APPROVAL_REQUIRED_W05: Withdrawals >= % USD require Maker-Checker request [WITHDRAWAL_DUAL_APPROVAL_W05].', COALESCE(v_settings.wht_threshold_usd, 200.00);
            END IF;
            UPDATE sawyan.wallet_transactions SET status = 'completed' WHERE id = v_wtx.id;
        ELSE
            RAISE EXCEPTION 'INVALID_WITHDRAWAL_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'withdrawal_completed', 'wallet_transactions', p_record_id, NULL, jsonb_build_object('amount_usd', v_wtx.amount_usd));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', 'completed');

    ELSIF v_dom = 'support_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'reviewer', 'approver'], true);
        UPDATE sawyan.support_tickets
           SET status            = CASE WHEN v_dec IN ('closed', 'resolved') THEN 'closed' ELSE 'in_progress' END,
               assigned_admin_id = p_admin_id
         WHERE id = p_record_id::uuid;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'support_ticket_' || v_dec, 'support_tickets', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);
    ELSE
        RAISE EXCEPTION 'UNKNOWN_OPERATIONAL_DOMAIN: %', p_domain;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION sawyan.admin_operational_decision(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;

-- Public Active Flash Offers RPC (Homepage, Directory & Member Portal)
CREATE OR REPLACE FUNCTION sawyan.get_public_active_flash_offers(
    p_country_code CHAR(2) DEFAULT NULL,
    p_limit        INT     DEFAULT 20
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
    SELECT COALESCE(jsonb_agg(row_obj), '[]'::jsonb)
      FROM (
          SELECT jsonb_build_object(
              'offer_id', n.id,
              'merchant_id', m.id,
              'branch_id', mb.id,
              'merchant_code', m.merchant_code,
              'business_name', m.business_name,
              'branch_name', COALESCE(mb.branch_name, ''),
              'address', COALESCE(mb.address, ''),
              'category', COALESCE(m.category, 'services'),
              'merchant_type', COALESCE(m.merchant_type, 'physical'),
              'country_code', c.country_code,
              'currency_code', c.currency_code,
              'plan_cashback_pct', ROUND((m.deduction_percent * ((100.0 - COALESCE(s.company_percent, 25.0)) / 100.0))::numeric, 2),
              'logo_url', NULLIF(m.metadata->>'logo_url', ''),
              'cover_image_url', NULLIF(m.metadata->>'cover_image_url', ''),
              'title', COALESCE(NULLIF(trim(n.payload->>'title'), ''), 'Ø¹Ø±Ø¶ ØªØ±ÙˆÙŠØ¬ÙŠ Ø­ØµØ±ÙŠ'),
              'body', COALESCE(NULLIF(trim(n.payload->>'body'), ''), COALESCE(n.payload->>'title', '')),
              'discount_hint', COALESCE(NULLIF(trim(n.payload->>'discount_hint'), ''), ''),
              'approved_at', COALESCE((n.payload->>'approved_at')::timestamptz, n.dispatched_at, n.created_at),
              'expires_at', COALESCE((n.payload->>'expires_at')::timestamptz, COALESCE((n.payload->>'approved_at')::timestamptz, n.dispatched_at, n.created_at) + interval '72 hours'),
              'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (
                  COALESCE((n.payload->>'expires_at')::timestamptz, COALESCE((n.payload->>'approved_at')::timestamptz, n.dispatched_at, n.created_at) + interval '72 hours') - now()
              ))::bigint)
          ) AS row_obj
            FROM sawyan.notifications n
            JOIN sawyan.merchants m
              ON m.id = COALESCE((n.payload->>'merchant_id')::uuid, n.recipient_id)
            JOIN sawyan.countries c
              ON c.id = m.country_id
            LEFT JOIN LATERAL (
                SELECT id, branch_name, address
                  FROM sawyan.merchant_branches
                 WHERE merchant_id = m.id AND is_branch_active = true
                 ORDER BY is_main_branch DESC, created_at ASC
                 LIMIT 1
            ) mb ON true
            LEFT JOIN LATERAL (
                SELECT company_percent, merchant_isolate_pct
                  FROM sawyan.settings
                 WHERE (country_id = m.country_id OR country_id IS NULL) AND effective_from <= now()
                 ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
                 LIMIT 1
            ) s ON true
           WHERE n.recipient_type = 'admin_queue'
             AND n.event_name = 'MerchantFlashOfferApproved'
             AND COALESCE((n.payload->>'expires_at')::timestamptz, COALESCE((n.payload->>'approved_at')::timestamptz, n.dispatched_at, n.created_at) + interval '72 hours') > now()
             AND m.onboarding_status = 'approved'
             AND m.governance_status IN ('good_standing', 'probation_warning')
             AND m.is_active = true
             AND m.is_isolated = false
             AND (
                 p_country_code IS NULL
                 OR upper(trim(p_country_code)) IN ('', 'ALL')
                 OR c.country_code = upper(trim(p_country_code))
                 OR m.merchant_type IN ('online', 'both')
             )
           ORDER BY COALESCE((n.payload->>'approved_at')::timestamptz, n.dispatched_at, n.created_at) DESC
           LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      ) sub;
$function$;

GRANT EXECUTE ON FUNCTION sawyan.get_public_active_flash_offers(CHAR, INT) TO anon, authenticated, service_role;

-- One-time Idempotent Backfill for already-approved active flash offers (e.g., Sakan Turkey M-TR-101)
DO $$
DECLARE
    v_rec         RECORD;
    v_merch       sawyan.merchants%ROWTYPE;
    v_cc          CHAR(2);
    v_hint        TEXT;
    v_ttl         INTERVAL;
    v_app_at      TIMESTAMPTZ;
    v_exp_at      TIMESTAMPTZ;
    v_title       TEXT;
    v_body        TEXT;
    v_cnt         INT;
BEGIN
    FOR v_rec IN
        SELECT *
          FROM sawyan.notifications
         WHERE recipient_type = 'admin_queue'
           AND event_name = 'MerchantFlashOfferApproved'
           AND COALESCE((payload->>'approved_at')::timestamptz, dispatched_at, created_at) >= now() - interval '72 hours'
    LOOP
        SELECT * INTO v_merch
          FROM sawyan.merchants
         WHERE id = COALESCE((v_rec.payload->>'merchant_id')::uuid, v_rec.recipient_id);
        IF NOT FOUND THEN CONTINUE; END IF;

        SELECT country_code INTO v_cc FROM sawyan.countries WHERE id = v_merch.country_id;
        v_title  := COALESCE(NULLIF(trim(v_rec.payload->>'title'), ''), 'Ø¹Ø±Ø¶ ØªØ±ÙˆÙŠØ¬ÙŠ Ø­ØµØ±ÙŠ');
        v_body   := COALESCE(NULLIF(trim(v_rec.payload->>'body'), ''), v_title);
        v_hint   := COALESCE(NULLIF(trim(v_rec.payload->>'discount_hint'), ''), '');
        v_app_at := COALESCE((v_rec.payload->>'approved_at')::timestamptz, v_rec.dispatched_at, v_rec.created_at);
        v_ttl    := CASE
            WHEN v_hint LIKE '%24%' OR v_hint LIKE '%Ù¢Ù¤%' THEN interval '24 hours'
            WHEN v_hint LIKE '%48%' OR v_hint LIKE '%Ù¤Ù¨%' THEN interval '48 hours'
            WHEN v_hint LIKE '%72%' OR v_hint LIKE '%Ù§Ù¢%' OR v_hint LIKE '%3 Ø£ÙŠØ§Ù…%' THEN interval '72 hours'
            WHEN v_hint LIKE '%14%' OR v_hint LIKE '%Ù¡Ù¤%' THEN interval '14 days'
            WHEN v_hint LIKE '%7%'  OR v_hint LIKE '%Ù§%'  OR v_hint LIKE '%Ø£Ø³Ø¨ÙˆØ¹%' THEN interval '7 days'
            ELSE interval '72 hours'
        END;
        v_exp_at := COALESCE((v_rec.payload->>'expires_at')::timestamptz, v_app_at + v_ttl);

        IF v_exp_at <= now() THEN CONTINUE; END IF;

        UPDATE sawyan.notifications
           SET payload = v_rec.payload || jsonb_build_object(
               'expires_at', v_exp_at,
               'country_code', v_cc,
               'merchant_code', v_merch.merchant_code,
               'merchant_type', v_merch.merchant_type,
               'category', v_merch.category
           )
         WHERE id = v_rec.id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        SELECT 'member',
               m.id,
               'MerchantFlashOfferLive',
               'in_app',
               jsonb_build_object(
                   'offer_id', v_rec.id,
                   'merchant_id', v_merch.id,
                   'merchant_code', v_merch.merchant_code,
                   'business_name', v_merch.business_name,
                   'country_code', v_cc,
                   'offer_title', v_title,
                   'offer_body', v_body,
                   'discount_hint', v_hint,
                   'approved_at', v_app_at,
                   'expires_at', v_exp_at,
                   'title', 'ðŸ”¥ Ø¹Ø±Ø¶ Ø­ØµØ±ÙŠ Ø§Ù„Ø¢Ù† Ù…Ù† ' || v_merch.business_name,
                   'message', v_title || CASE WHEN v_hint <> '' THEN ' â€” ' || v_hint ELSE '' END
               ),
               now()
          FROM sawyan.members m
         WHERE m.member_code > 0
           AND m.is_active_in_tree = true
           AND m.is_tombstone_banned = false
           AND (
               v_merch.merchant_type IN ('online', 'both')
               OR m.residency_country_id = v_merch.country_id
               OR m.nationality_country_id = v_merch.country_id
           )
           AND NOT EXISTS (
               SELECT 1 FROM sawyan.notifications ex
                WHERE ex.recipient_type = 'member'
                  AND ex.recipient_id = m.id
                  AND ex.event_name = 'MerchantFlashOfferLive'
                  AND ex.payload->>'offer_id' = v_rec.id::text
           );
        GET DIAGNOSTICS v_cnt = ROW_COUNT;

        IF NOT EXISTS (
            SELECT 1 FROM sawyan.notifications ex
             WHERE ex.recipient_type = 'merchant'
               AND ex.recipient_id = v_merch.id
               AND ex.event_name = 'MerchantFlashOfferApproved'
               AND ex.payload->>'offer_id' = v_rec.id::text
        ) THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
            VALUES (
                'merchant',
                v_merch.id,
                'MerchantFlashOfferApproved',
                'in_app',
                jsonb_build_object(
                    'offer_id', v_rec.id,
                    'merchant_id', v_merch.id,
                    'business_name', v_merch.business_name,
                    'offer_title', v_title,
                    'expires_at', v_exp_at,
                    'broadcast_members_count', v_cnt,
                    'title', 'ðŸ”¥ ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØ¨Ø« Ø­Ù…Ù„ØªÙƒ Ø§Ù„ØªØ±ÙˆÙŠØ¬ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­!',
                    'message', 'Ø­Ù…Ù„ØªÙƒ Â«' || v_title || 'Â» Ø¸Ø§Ù‡Ø±Ø© Ø§Ù„Ø¢Ù† ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© ÙˆØ§Ù„Ø¯Ù„ÙŠÙ„ ÙˆØªÙ… Ø¥Ø´Ø¹Ø§Ø± ' || v_cnt || ' Ø¹Ø¶ÙˆØ§Ù‹ Ù†Ø´Ø·Ø§Ù‹.'
                ),
                now()
            );
        END IF;
    END LOOP;
END $$;
