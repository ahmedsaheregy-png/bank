-- ============================================================================
-- SAWYAN V3.0 — Stage 31: 4-State Bank Top-Up Review Workflow & Merchant Feedback
-- Applies symmetrically & idempotently to BOTH `sawyan` and `sawyan_demo`
-- ============================================================================
-- States:
--   1) White  (`MerchantBankTopupProofPending` / `MerchantBankTopupSubmitted`): بانتظار الإدارة
--   2) Orange (`MerchantBankTopupUnderReview`): قيد المراجعة (مناقشة تفاصيل مع التاجر + ملاحظة مكتوبة)
--   3) Green  (`MerchantBankTopupProofProcessed`): تم (مطابقة + شحن + فاتورة ضريبية + إشعار للتاجر)
--   4) Red    (`MerchantBankTopupProofRejected`): مرفوض (مع سبب الرفض مكتوباً + إشعار فوري للتاجر)
-- Every Admin decision sends a live in-app bell notification (+ Web Push if subscribed)
-- back to the Merchant with the exact status and written note/reason.
-- ============================================================================

DO $stage31$
DECLARE
    v_schema TEXT;
    v_def    TEXT;
    v_new    TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo']
    LOOP
        -- --------------------------------------------------------------------
        -- 1. New guarded RPC: `admin_review_bank_topup_proof`
        --    Handles `approved`, `under_review`, and `rejected` with mandatory
        --    merchant notification & written reason/note feedback.
        -- --------------------------------------------------------------------
        EXECUTE format($sql$
            CREATE OR REPLACE FUNCTION %1$I.admin_review_bank_topup_proof(
                p_admin_id       UUID,
                p_session_token  TEXT,
                p_proof_notif_id UUID,
                p_decision       VARCHAR,
                p_admin_note     TEXT DEFAULT NULL
            ) RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path TO 'pg_catalog', 'pg_temp'
            AS $fn$
            DECLARE
                v_adm         JSONB;
                v_notif       %1$I.notifications%%ROWTYPE;
                v_mer         %1$I.merchants%%ROWTYPE;
                v_dec         VARCHAR(30);
                v_note        TEXT;
                v_mer_id      UUID;
                v_amt         NUMERIC(18,2);
                v_ref         TEXT;
                v_curr        VARCHAR(10);
                v_mc_id       UUID := NULL;
                v_approve_res JSONB := NULL;
                v_push_title  TEXT;
                v_push_body   TEXT;
                v_mer_ev      VARCHAR(60);
            BEGIN
                v_adm := %1$I.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance', 'reviewer'], true);
                v_dec := lower(trim(COALESCE(p_decision, '')));
                v_note := trim(COALESCE(p_admin_note, ''));

                IF v_dec NOT IN ('approved', 'under_review', 'rejected') THEN
                    RAISE EXCEPTION 'INVALID_BANK_TOPUP_DECISION: %%', p_decision;
                END IF;

                SELECT * INTO v_notif
                  FROM %1$I.notifications
                 WHERE id = p_proof_notif_id
                 FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'BANK_TOPUP_PROOF_NOT_FOUND';
                END IF;

                IF v_notif.event_name IN ('MerchantBankTopupProofProcessed', 'MerchantBankTopupProofRejected') THEN
                    RAISE EXCEPTION 'BANK_TOPUP_PROOF_ALREADY_FINALIZED: %%', v_notif.event_name;
                END IF;

                v_mer_id := COALESCE(
                    CASE WHEN NULLIF(COALESCE(v_notif.payload->>'merchant_id', ''), '') ~* '^[0-9a-f-]{36}$'
                         THEN (v_notif.payload->>'merchant_id')::uuid ELSE NULL END,
                    v_notif.recipient_id
                );
                SELECT * INTO v_mer FROM %1$I.merchants WHERE id = v_mer_id;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
                END IF;

                SELECT COALESCE(c.currency_code, 'EGP') INTO v_curr
                  FROM %1$I.countries c WHERE c.id = v_mer.country_id;

                v_amt := COALESCE((v_notif.payload->>'amount_local')::numeric, 0.00);
                v_ref := COALESCE(NULLIF(trim(COALESCE(v_notif.payload->>'bank_ref', '')), ''), 'BANK-REF');

                IF NULLIF(COALESCE(v_notif.payload->>'verification_request_id', ''), '') ~* '^[0-9a-f-]{36}$' THEN
                    v_mc_id := (v_notif.payload->>'verification_request_id')::uuid;
                END IF;

                IF v_dec = 'approved' THEN
                    v_approve_res := %1$I.admin_manage_merchant_contract(
                        p_admin_id             => p_admin_id,
                        p_session_token        => p_session_token,
                        p_merchant_id          => v_mer.id,
                        p_action               => 'approve_bank_topup',
                        p_topup_amount_local   => v_amt,
                        p_topup_bank_ref       => v_ref,
                        p_topup_proof_notif_id => v_notif.id,
                        p_reason               => COALESCE(NULLIF(v_note, ''), 'تمت مطابقة التحويل البنكي وشحن الرصيد — مرجع ' || v_ref)
                    );

                    IF v_mc_id IS NOT NULL THEN
                        UPDATE %1$I.maker_checker_requests
                           SET status           = 'approved',
                               checker_admin_id = p_admin_id,
                               decided_at       = now()
                         WHERE id = v_mc_id
                           AND status = 'pending';
                    END IF;

                    UPDATE %1$I.notifications
                       SET event_name = 'MerchantBankTopupProofProcessed',
                           is_read    = true,
                           payload    = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
                               'review_status', 'approved',
                               'admin_note', NULLIF(v_note, ''),
                               'reviewed_by', p_admin_id,
                               'reviewed_at', now()
                           )
                     WHERE id = v_notif.id;

                    -- Enrich the MerchantTopupApproved notification generated by process_merchant_topup_fifo
                    -- with proof_notif_id + optional Admin note (avoiding duplicate merchant notifications)
                    UPDATE %1$I.notifications
                       SET payload = COALESCE(payload, '{}'::jsonb)
                           || jsonb_build_object('proof_notif_id', v_notif.id, 'review_status', 'approved')
                           || CASE WHEN v_note <> '' THEN jsonb_build_object(
                                  'admin_note', v_note,
                                  'message', COALESCE(payload->>'message', '') || ' — ملاحظة الإدارة: ' || v_note
                              ) ELSE '{}'::jsonb END
                     WHERE id = (
                         SELECT n2.id
                           FROM %1$I.notifications n2
                          WHERE n2.recipient_type = 'merchant'
                            AND n2.recipient_id = v_mer.id
                            AND n2.event_name = 'MerchantTopupApproved'
                            AND n2.created_at >= now() - interval '15 seconds'
                          ORDER BY n2.created_at DESC
                          LIMIT 1
                     );

                    RETURN jsonb_build_object(
                        'success', true,
                        'decision', 'approved',
                        'proof_notif_id', v_notif.id,
                        'merchant_id', v_mer.id,
                        'admin_note', NULLIF(v_note, ''),
                        'approve_result', v_approve_res
                    );
                END IF;

                -- Both `under_review` and `rejected` require a written note/reason for the merchant
                IF length(v_note) < 3 THEN
                    IF v_dec = 'rejected' THEN
                        RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
                    ELSE
                        RAISE EXCEPTION 'REVIEW_NOTE_REQUIRED';
                    END IF;
                END IF;

                IF v_dec = 'under_review' THEN
                    UPDATE %1$I.notifications
                       SET event_name = 'MerchantBankTopupUnderReview',
                           is_read    = false,
                           payload    = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
                               'review_status', 'under_review',
                               'admin_note', v_note,
                               'reviewed_by', p_admin_id,
                               'reviewed_at', now()
                           )
                     WHERE id = v_notif.id;

                    v_mer_ev     := 'MerchantBankTopupUnderReview';
                    v_push_title := '🟠 طلب الشحن قيد المراجعة — ملاحظة من الإدارة';
                    v_push_body  := 'بخصوص تحويلك بمبلغ ' || v_amt || ' ' || v_curr || ' (مرجع ' || v_ref || '): ' || v_note;

                    PERFORM %1$I.append_audit_log(
                        'admin', p_admin_id, 'merchant_bank_topup_under_review', 'notifications', v_notif.id::text, NULL,
                        jsonb_build_object('merchant_id', v_mer.id, 'amount_local', v_amt, 'bank_ref', v_ref, 'admin_note', v_note)
                    );
                ELSE
                    -- rejected
                    UPDATE %1$I.notifications
                       SET event_name = 'MerchantBankTopupProofRejected',
                           is_read    = true,
                           payload    = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
                               'review_status', 'rejected',
                               'rejection_reason', v_note,
                               'admin_note', v_note,
                               'reviewed_by', p_admin_id,
                               'reviewed_at', now()
                           )
                     WHERE id = v_notif.id;

                    IF v_mc_id IS NOT NULL THEN
                        UPDATE %1$I.maker_checker_requests
                           SET status           = 'rejected',
                               checker_admin_id = p_admin_id,
                               reason           = v_note,
                               payload_after    = COALESCE(payload_after, '{}'::jsonb) || jsonb_build_object('rejection_reason', v_note),
                               decided_at       = now()
                         WHERE id = v_mc_id
                           AND status = 'pending';
                    END IF;

                    v_mer_ev     := 'MerchantBankTopupRejected';
                    v_push_title := '🔴 تم رفض طلب شحن الرصيد';
                    v_push_body  := 'تعذّر اعتماد تحويلك بمبلغ ' || v_amt || ' ' || v_curr || ' (مرجع ' || v_ref || ') — السبب: ' || v_note;

                    PERFORM %1$I.append_audit_log(
                        'admin', p_admin_id, 'merchant_bank_topup_rejected', 'notifications', v_notif.id::text, NULL,
                        jsonb_build_object('merchant_id', v_mer.id, 'amount_local', v_amt, 'bank_ref', v_ref, 'rejection_reason', v_note)
                    );
                END IF;

                -- Always echo written reply back to the Merchant's bell (+ Web Push if subscribed)
                INSERT INTO %1$I.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'merchant',
                    v_mer.id,
                    v_mer_ev,
                    'in_app',
                    jsonb_build_object(
                        'proof_notif_id', v_notif.id,
                        'amount_local', v_amt,
                        'currency_code', v_curr,
                        'bank_ref', v_ref,
                        'review_status', v_dec,
                        'admin_note', v_note,
                        'reason', v_note,
                        'title', v_push_title,
                        'message', v_push_body
                    ),
                    now()
                );

                BEGIN
                    PERFORM %1$I.enqueue_and_dispatch_push(
                        v_mer_ev,
                        ARRAY['merchant_owner'],
                        v_push_title,
                        v_push_body,
                        v_mer.id,
                        NULL, NULL, NULL,
                        'merchant-dashboard/dashboard.html#financial',
                        'merchant-topup-' || v_notif.id::text,
                        jsonb_build_object('review_status', v_dec, 'bank_ref', v_ref)
                    );
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;

                RETURN jsonb_build_object(
                    'success', true,
                    'decision', v_dec,
                    'proof_notif_id', v_notif.id,
                    'merchant_id', v_mer.id,
                    'admin_note', v_note
                );
            END;
            $fn$;
            REVOKE ALL ON FUNCTION %1$I.admin_review_bank_topup_proof(UUID, TEXT, UUID, VARCHAR, TEXT) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION %1$I.admin_review_bank_topup_proof(UUID, TEXT, UUID, VARCHAR, TEXT) TO anon, authenticated, service_role;
        $sql$, v_schema);

        -- --------------------------------------------------------------------
        -- 2. Patch `admin_search_and_reply_ops` (`bank_topup_proofs` branch):
        --    Include UnderReview & Rejected statuses cleanly ordered.
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.admin_search_and_reply_ops(uuid,text,varchar,varchar,text,uuid,text,varchar)', v_schema)::regprocedure);
        IF position('MerchantBankTopupUnderReview' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$WHERE n.event_name IN ('MerchantBankTopupProofPending', 'MerchantBankTopupSubmitted', 'MerchantBankTopupProofProcessed')
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
               ORDER BY CASE WHEN n.event_name = 'MerchantBankTopupProofProcessed' THEN 1 ELSE 0 END, n.created_at DESC$a$,
                $b$WHERE n.event_name IN ('MerchantBankTopupProofPending', 'MerchantBankTopupSubmitted', 'MerchantBankTopupUnderReview', 'MerchantBankTopupProofProcessed', 'MerchantBankTopupProofRejected')
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
               ORDER BY CASE WHEN n.event_name IN ('MerchantBankTopupProofProcessed', 'MerchantBankTopupProofRejected') THEN 1 ELSE 0 END, n.created_at DESC$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: admin_search_and_reply_ops on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 3. Patch `get_admin_sovereign_bundle`: exclude finalized rejected
        --    top-up proofs from Admin Bell (Actionable + Critical ONLY).
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.get_admin_sovereign_bundle(uuid,text,bpchar)', v_schema)::regprocedure);
        IF position('MerchantBankTopupProofRejected' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$AND n.event_name NOT IN ('MerchantFlashOfferApproved', 'MerchantFlashOfferRejected', 'MerchantBankTopupProofProcessed')$a$,
                $b$AND n.event_name NOT IN ('MerchantFlashOfferApproved', 'MerchantFlashOfferRejected', 'MerchantBankTopupProofProcessed', 'MerchantBankTopupProofRejected')$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: get_admin_sovereign_bundle on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 4. Patch `get_merchant_dashboard_bundle`: expose `topup_proof_statuses`
        --    so Merchant Financial tab shows live 4-color badges + Admin replies.
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.get_merchant_dashboard_bundle(uuid,text,varchar,uuid)', v_schema)::regprocedure);
        IF position('topup_proof_statuses' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$'shift_closing', v_shift,$a$,
                format($b$'topup_proof_statuses', COALESCE((
            SELECT jsonb_agg(row_to_json(tps)) FROM (
                SELECT n.id,
                       n.event_name,
                       CASE n.event_name
                           WHEN 'MerchantBankTopupProofProcessed' THEN 'approved'
                           WHEN 'MerchantBankTopupProofRejected'  THEN 'rejected'
                           WHEN 'MerchantBankTopupUnderReview'    THEN 'under_review'
                           ELSE 'pending'
                       END AS review_status,
                       COALESCE((n.payload->>'amount_local')::numeric, 0.00) AS amount_local,
                       COALESCE(n.payload->>'bank_ref', '') AS bank_ref,
                       COALESCE(n.payload->>'provider', 'bank_transfer') AS provider,
                       COALESCE(n.payload->>'receipt_note', '') AS receipt_note,
                       COALESCE(n.payload->>'admin_note', n.payload->>'rejection_reason', '') AS admin_note,
                       n.payload->>'reviewed_at' AS reviewed_at,
                       n.created_at
                  FROM %I.notifications n
                 WHERE n.recipient_type = 'admin'
                   AND (n.recipient_id = v_merch.id OR n.payload->>'merchant_id' = v_merch.id::text)
                   AND n.event_name IN ('MerchantBankTopupProofPending', 'MerchantBankTopupSubmitted', 'MerchantBankTopupUnderReview', 'MerchantBankTopupProofProcessed', 'MerchantBankTopupProofRejected')
                 ORDER BY n.created_at DESC LIMIT 20
            ) tps
        ), '[]'::jsonb),
        'shift_closing', v_shift,$b$, v_schema)
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: get_merchant_dashboard_bundle on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 5. Bounded Multi-Device Hashed Sessions (`sawyan`: 3 devices,
        --    `sawyan_demo`: 12 concurrent sandbox tabs) with instant global
        --    kill-switch revocation whenever `session_token_sha256` is cleared.
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.authenticate_admin_login(text,text,varchar)', v_schema)::regprocedure);
        IF position('session_tokens' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$'session_token_sha256', v_token_hash,
               'session_expires_at', v_expires_at,$a$,
                format($b$'session_token_sha256', v_token_hash,
               'session_expires_at', v_expires_at,
               'session_tokens', COALESCE((
                   SELECT jsonb_agg(e) FROM (
                       SELECT e FROM (
                           SELECT jsonb_build_object('h', v_token_hash, 'exp', v_expires_at::text) AS e, 0 AS ord
                           UNION ALL
                           SELECT elem AS e, idx AS ord
                             FROM jsonb_array_elements(COALESCE(metadata->'session_tokens', '[]'::jsonb)) WITH ORDINALITY AS t(elem, idx)
                            WHERE (elem->>'exp')::timestamptz > now()
                              AND elem->>'h' <> v_token_hash
                       ) s ORDER BY ord ASC LIMIT %s
                   ) lim
               ), jsonb_build_array(jsonb_build_object('h', v_token_hash, 'exp', v_expires_at::text))),$b$,
                    CASE WHEN v_schema = 'sawyan_demo' THEN 12 ELSE 3 END
                )
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: authenticate_admin_login on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        v_def := pg_get_functiondef(format('%I.verify_admin_session(uuid,text,text[],boolean)', v_schema)::regprocedure);
        IF position('session_tokens' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$IF v_saved_hash = '' OR v_saved_hash <> encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'ADMIN_SESSION_INVALID: Session token mismatch.';
    END IF;

    IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
        RAISE EXCEPTION 'ADMIN_SESSION_EXPIRED: Please sign in again.';
    END IF;$a$,
                $b$IF v_saved_hash = '' THEN
        RAISE EXCEPTION 'ADMIN_SESSION_INVALID: Session token mismatch.';
    END IF;

    IF v_saved_hash = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
            RAISE EXCEPTION 'ADMIN_SESSION_EXPIRED: Please sign in again.';
        END IF;
    ELSIF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_admin.metadata->'session_tokens', '[]'::jsonb)) s
         WHERE s->>'h' = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex')
           AND (s->>'exp')::timestamptz > now()
    ) THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'ADMIN_SESSION_INVALID: Session token mismatch.';
    END IF;$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: verify_admin_session on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        v_def := pg_get_functiondef(format('%I.trg_hash_session_token_on_write()', v_schema)::regprocedure);
        IF position('session_tokens' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$NEW.metadata := NEW.metadata || jsonb_build_object(
                'session_token_sha256', encode(extensions.digest(v_raw_tok, 'sha256'), 'hex'),
                'session_expires_at', (now() + interval '7 days')::text
            );$a$,
                format($b$NEW.metadata := NEW.metadata || jsonb_build_object(
                'session_token_sha256', encode(extensions.digest(v_raw_tok, 'sha256'), 'hex'),
                'session_expires_at', (now() + interval '7 days')::text,
                'session_tokens', COALESCE((
                    SELECT jsonb_agg(e) FROM (
                        SELECT e FROM (
                            SELECT jsonb_build_object('h', encode(extensions.digest(v_raw_tok, 'sha256'), 'hex'), 'exp', (now() + interval '7 days')::text) AS e, 0 AS ord
                            UNION ALL
                            SELECT elem AS e, idx AS ord
                              FROM jsonb_array_elements(COALESCE(NEW.metadata->'session_tokens', '[]'::jsonb)) WITH ORDINALITY AS t(elem, idx)
                             WHERE (elem->>'exp')::timestamptz > now()
                               AND elem->>'h' <> encode(extensions.digest(v_raw_tok, 'sha256'), 'hex')
                        ) s ORDER BY ord ASC LIMIT %s
                    ) lim
                ), jsonb_build_array(jsonb_build_object('h', encode(extensions.digest(v_raw_tok, 'sha256'), 'hex'), 'exp', (now() + interval '7 days')::text)))
            );$b$,
                    CASE WHEN v_schema = 'sawyan_demo' THEN 12 ELSE 3 END
                )
            );
            v_new := replace(
                v_new,
                $a$NEW.metadata := NEW.metadata - 'session_token_sha256' - 'session_expires_at';$a$,
                $b$NEW.metadata := NEW.metadata - 'session_token_sha256' - 'session_expires_at' - 'session_tokens';$b$
            );
            v_new := replace(
                v_new,
                $a$NEW.metadata := NEW.metadata - 'session_token_sha256' - 'session_expires_at' - 'active_session_token';$a$,
                $b$NEW.metadata := NEW.metadata - 'session_token_sha256' - 'session_expires_at' - 'active_session_token' - 'session_tokens';$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: trg_hash_session_token_on_write on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        v_def := pg_get_functiondef(format('%I.verify_member_session(uuid,text)', v_schema)::regprocedure);
        IF position('session_tokens' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$IF v_saved_hash = '' OR v_saved_hash <> encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
    END IF;

    IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
        RAISE EXCEPTION 'MEMBER_SESSION_EXPIRED';
    END IF;$a$,
                $b$IF v_saved_hash = '' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
    END IF;

    IF v_saved_hash = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
            RAISE EXCEPTION 'MEMBER_SESSION_EXPIRED';
        END IF;
    ELSIF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_member.metadata->'session_tokens', '[]'::jsonb)) s
         WHERE s->>'h' = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex')
           AND (s->>'exp')::timestamptz > now()
    ) THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
    END IF;$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE31_PATCH_MISS: verify_member_session on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;
    END LOOP;
END $stage31$;
