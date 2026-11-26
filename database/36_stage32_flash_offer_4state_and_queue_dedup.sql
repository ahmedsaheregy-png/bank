-- ============================================================================
-- SAWYAN V3.0 — Stage 32: 4-State Flash Offer Review Workflow + Queue Dedup
-- Applies symmetrically & idempotently to BOTH `sawyan` and `sawyan_demo`
-- ============================================================================
-- 1) Adds `under_review` (🟠 قيد المراجعة + mandatory written note) to
--    `admin_operational_decision('flash_offer', ...)` with live merchant bell
--    notification + Web Push, alongside `approved` (🟢) and `rejected` (🔴).
-- 2) Fixes `v_flash_queue` in `get_admin_sovereign_bundle` and `flash_offers`
--    in `get_merchant_dashboard_bundle` to filter strictly on
--    `recipient_type = 'admin_queue'` (preventing duplicate cards from the
--    `admin` bell mirror row) and include `MerchantFlashOfferUnderReview`.
-- 3) Keeps `MerchantFlashOfferUnderReview` counted in weekly quota (2/7 days)
--    while freeing the slot immediately upon `MerchantFlashOfferRejected`.
-- ============================================================================

DO $stage32$
DECLARE
    v_schema TEXT;
    v_def    TEXT;
    v_new    TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo']
    LOOP
        -- --------------------------------------------------------------------
        -- 1. Patch `admin_operational_decision` (`flash_offer` branch)
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.admin_operational_decision(uuid,text,varchar,text,varchar,text,varchar)', v_schema)::regprocedure);
        IF position('MerchantFlashOfferUnderReview' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$        ELSIF v_dec = 'rejected' THEN
            UPDATE $a$ || v_schema || $a$.notifications
               SET event_name = 'MerchantFlashOfferRejected',
                   payload    = v_notif.payload || jsonb_build_object(
                       'status', 'rejected',
                       'rejected_by', p_admin_id,
                       'rejection_reason', COALESCE(p_notes, 'غير مطابق لضوابط النشر')
                   )
             WHERE id = v_notif.id;

            IF v_merch.id IS NOT NULL THEN
                INSERT INTO $a$ || v_schema || $a$.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'merchant',
                    v_merch.id,
                    'MerchantFlashOfferRejected',
                    'in_app',
                    jsonb_build_object(
                        'offer_id', v_notif.id,
                        'merchant_id', v_merch.id,
                        'offer_title', v_offer_title,
                        'reason', COALESCE(p_notes, 'غير مطابق لضوابط النشر'),
                        'title', '❌ تعذر اعتماد الحملة الترويجية',
                        'message', 'حملتك «' || v_offer_title || '»: ' || COALESCE(p_notes, 'غير مطابق لضوابط النشر')
                    ),
                    now()
                );
            END IF;
        ELSE
            RAISE EXCEPTION 'INVALID_FLASH_OFFER_DECISION';
        END IF;

        /*STAGE28_AUTO_CLEAR_BELL*/
        UPDATE $a$ || v_schema || $a$.notifications
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
           );$a$,
                $b$        ELSIF v_dec = 'under_review' THEN
            IF length(trim(COALESCE(p_notes, ''))) < 3 THEN
                RAISE EXCEPTION 'REVIEW_NOTE_REQUIRED';
            END IF;

            UPDATE $b$ || v_schema || $b$.notifications
               SET event_name = 'MerchantFlashOfferUnderReview',
                   payload    = v_notif.payload || jsonb_build_object(
                       'status', 'under_review',
                       'admin_note', trim(p_notes),
                       'reviewed_by', p_admin_id,
                       'reviewed_at', now()
                   )
             WHERE id = v_notif.id;

            IF v_merch.id IS NOT NULL THEN
                INSERT INTO $b$ || v_schema || $b$.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'merchant',
                    v_merch.id,
                    'MerchantFlashOfferUnderReview',
                    'in_app',
                    jsonb_build_object(
                        'offer_id', v_notif.id,
                        'merchant_id', v_merch.id,
                        'offer_title', v_offer_title,
                        'admin_note', trim(p_notes),
                        'reason', trim(p_notes),
                        'title', '🟠 إعلانك الترويجي قيد المراجعة — ملاحظة من الإدارة',
                        'message', 'حملتك «' || v_offer_title || '»: ' || trim(p_notes)
                    ),
                    now()
                );

                BEGIN
                    PERFORM $b$ || v_schema || $b$.enqueue_and_dispatch_push(
                        'MerchantFlashOfferUnderReview',
                        ARRAY['merchant_owner'],
                        '🟠 إعلانك الترويجي قيد المراجعة',
                        'حملتك «' || v_offer_title || '»: ' || trim(p_notes),
                        v_merch.id,
                        NULL, NULL, NULL,
                        'merchant-dashboard/dashboard.html#home',
                        'merchant-flash-offer-' || v_notif.id::text,
                        jsonb_build_object('offer_id', v_notif.id, 'review_status', 'under_review')
                    );
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;
            END IF;

        ELSIF v_dec = 'rejected' THEN
            UPDATE $b$ || v_schema || $b$.notifications
               SET event_name = 'MerchantFlashOfferRejected',
                   payload    = v_notif.payload || jsonb_build_object(
                       'status', 'rejected',
                       'rejected_by', p_admin_id,
                       'admin_note', COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'غير مطابق لضوابط النشر'),
                       'rejection_reason', COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'غير مطابق لضوابط النشر')
                   )
             WHERE id = v_notif.id;

            IF v_merch.id IS NOT NULL THEN
                INSERT INTO $b$ || v_schema || $b$.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES (
                    'merchant',
                    v_merch.id,
                    'MerchantFlashOfferRejected',
                    'in_app',
                    jsonb_build_object(
                        'offer_id', v_notif.id,
                        'merchant_id', v_merch.id,
                        'offer_title', v_offer_title,
                        'reason', COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'غير مطابق لضوابط النشر'),
                        'admin_note', COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'غير مطابق لضوابط النشر'),
                        'title', '🔴 تعذر اعتماد الحملة الترويجية',
                        'message', 'حملتك «' || v_offer_title || '»: ' || COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'غير مطابق لضوابط النشر')
                    ),
                    now()
                );

                BEGIN
                    PERFORM $b$ || v_schema || $b$.enqueue_and_dispatch_push(
                        'MerchantFlashOfferRejected',
                        ARRAY['merchant_owner'],
                        '🔴 تعذر اعتماد الحملة الترويجية',
                        'حملتك «' || v_offer_title || '»: ' || COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'غير مطابق لضوابط النشر'),
                        v_merch.id,
                        NULL, NULL, NULL,
                        'merchant-dashboard/dashboard.html#home',
                        'merchant-flash-offer-' || v_notif.id::text,
                        jsonb_build_object('offer_id', v_notif.id, 'review_status', 'rejected')
                    );
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;
            END IF;
        ELSE
            RAISE EXCEPTION 'INVALID_FLASH_OFFER_DECISION';
        END IF;

        /*STAGE28_AUTO_CLEAR_BELL*/
        UPDATE $b$ || v_schema || $b$.notifications
           SET is_read    = CASE WHEN v_dec = 'under_review' THEN false ELSE true END,
               event_name = CASE
                   WHEN v_dec = 'approved'     THEN 'MerchantFlashOfferApproved'
                   WHEN v_dec = 'under_review' THEN 'MerchantFlashOfferUnderReview'
                   ELSE 'MerchantFlashOfferRejected'
               END,
               payload    = CASE
                   WHEN v_dec = 'under_review' THEN COALESCE(payload, '{}'::jsonb) || jsonb_build_object('admin_note', trim(p_notes), 'review_status', 'under_review')
                   ELSE payload
               END
         WHERE recipient_type = 'admin'
           AND event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferUnderReview')
           AND (
               payload->>'offer_id' = v_notif.id::text
               OR (
                   recipient_id = COALESCE((v_notif.payload->>'merchant_id')::uuid, v_notif.recipient_id)
                   AND lower(trim(COALESCE(payload->>'title', ''))) = lower(trim(COALESCE(v_notif.payload->>'title', '')))
                   AND is_read = false
               )
           );$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE32_PATCH_MISS: admin_operational_decision on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 2. Patch `get_admin_sovereign_bundle` (`v_flash_queue`):
        --    Restrict to `admin_queue` (zero duplicate rows!) + include UnderReview.
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.get_admin_sovereign_bundle(uuid,text,bpchar)', v_schema)::regprocedure);
        IF position('MerchantFlashOfferUnderReview' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
           ORDER BY CASE WHEN n.event_name = 'MerchantFlashOfferPending' THEN 0 ELSE 1 END, n.created_at DESC$a$,
                $b$WHERE n.recipient_type = 'admin_queue'
             AND n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferUnderReview', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
           ORDER BY CASE WHEN n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferUnderReview') THEN 0 ELSE 1 END, n.created_at DESC$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE32_PATCH_MISS: get_admin_sovereign_bundle on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 3. Patch `get_merchant_dashboard_bundle` (`flash_offers`):
        --    Restrict to `admin_queue` + map UnderReview status cleanly.
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.get_merchant_dashboard_bundle(uuid,text,varchar,uuid)', v_schema)::regprocedure);
        IF position('MerchantFlashOfferUnderReview' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$WHEN 'MerchantFlashOfferApproved' THEN 'approved'
                    WHEN 'MerchantFlashOfferRejected' THEN 'rejected'
                    ELSE 'pending'
                END,
                'payload', n.payload,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC)
            FROM $a$ || v_schema || $a$.notifications n
            WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')$a$,
                $b$WHEN 'MerchantFlashOfferApproved' THEN 'approved'
                    WHEN 'MerchantFlashOfferRejected' THEN 'rejected'
                    WHEN 'MerchantFlashOfferUnderReview' THEN 'under_review'
                    ELSE 'pending'
                END,
                'payload', n.payload,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC)
            FROM $b$ || v_schema || $b$.notifications n
            WHERE n.recipient_type = 'admin_queue'
              AND n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferUnderReview', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE32_PATCH_MISS: get_merchant_dashboard_bundle on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 4. Patch `submit_merchant_flash_offer` weekly quota count:
        --    Include `MerchantFlashOfferUnderReview` in active weekly quota
        --    while keeping `MerchantFlashOfferRejected` excluded (frees slot).
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.submit_merchant_flash_offer(uuid,text,text,varchar,uuid)', v_schema)::regprocedure);
        IF position('MerchantFlashOfferUnderReview' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$AND event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved')$a$,
                $b$AND event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferUnderReview', 'MerchantFlashOfferApproved')$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE32_PATCH_MISS: submit_merchant_flash_offer on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;

        -- --------------------------------------------------------------------
        -- 5. Patch `verify_merchant_session`: complete 3-portal parity with
        --    bounded multi-device hashed `session_tokens` (instant kill-switch
        --    preserved when `session_token_sha256` is cleared).
        -- --------------------------------------------------------------------
        v_def := pg_get_functiondef(format('%I.verify_merchant_session(uuid,text)', v_schema)::regprocedure);
        IF position('session_tokens' IN v_def) = 0 THEN
            v_new := replace(
                v_def,
                $a$IF v_saved_hash = '' OR v_saved_hash <> encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
    END IF;

    IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
        RAISE EXCEPTION 'MERCHANT_SESSION_EXPIRED';
    END IF;$a$,
                $b$IF v_saved_hash = '' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
    END IF;

    IF v_saved_hash = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
            RAISE EXCEPTION 'MERCHANT_SESSION_EXPIRED';
        END IF;
    ELSIF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_merch.metadata->'session_tokens', '[]'::jsonb)) s
         WHERE s->>'h' = encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex')
           AND (s->>'exp')::timestamptz > now()
    ) THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
    END IF;$b$
            );
            IF v_new = v_def THEN
                RAISE EXCEPTION 'STAGE32_PATCH_MISS: verify_merchant_session on %', v_schema;
            END IF;
            EXECUTE v_new;
        END IF;
    END LOOP;
END $stage32$;
