-- ============================================================================
-- SAWYAN V3.0 — Stage 27: GDPR/KVKK Art.17 Pseudonymization & S10 Device Fraud Signals
-- Applies symmetrically to BOTH `sawyan` (Production) and `sawyan_demo` (Preview)
-- Preserves statutory 7–10 year financial ledger/tax rows & binary tree integrity.
-- ============================================================================

DO $outer$
DECLARE
    v_schema TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo']
    LOOP
        -- 1. Non-PII Device Fingerprint Table (Zero raw IP/PII stored; SHA-256 hash only)
        EXECUTE format($sql$
            CREATE TABLE IF NOT EXISTS %I.device_fraud_fingerprints (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                actor_type VARCHAR(24) NOT NULL CHECK (actor_type IN ('member', 'merchant')),
                actor_id UUID NOT NULL,
                device_hash VARCHAR(128) NOT NULL,
                timezone_name VARCHAR(64),
                ua_short VARCHAR(120),
                first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                hit_count INTEGER NOT NULL DEFAULT 1,
                CONSTRAINT uq_device_fp_actor UNIQUE (actor_type, actor_id, device_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_device_fp_hash_type
                ON %I.device_fraud_fingerprints (device_hash, actor_type);
            CREATE INDEX IF NOT EXISTS idx_device_fp_actor
                ON %I.device_fraud_fingerprints (actor_type, actor_id);
            ALTER TABLE %I.device_fraud_fingerprints ENABLE ROW LEVEL SECURITY;
            REVOKE ALL ON TABLE %I.device_fraud_fingerprints FROM PUBLIC, anon, authenticated;
        $sql$, v_schema, v_schema, v_schema, v_schema, v_schema);

        -- 2. Admin-Guarded GDPR / KVKK Art.17 Pseudonymization RPC
        -- Erases PII while strictly preserving immutable financial ledger/transactions & binary tree slots.
        EXECUTE format($sql$
            CREATE OR REPLACE FUNCTION %I.gdpr_pseudonymize_member_data(
                p_admin_id UUID,
                p_session_token TEXT,
                p_member_id UUID,
                p_reason TEXT DEFAULT 'GDPR/KVKK Art.17 Erasure Request'
            ) RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = pg_catalog, pg_temp
            AS $fn$
            DECLARE
                v_admin  %I.admins%%ROWTYPE;
                v_member %I.members%%ROWTYPE;
                v_reason TEXT := left(COALESCE(NULLIF(trim(p_reason), ''), 'GDPR/KVKK Art.17 Erasure Request'), 400);
                v_pseudo_name  TEXT;
                v_pseudo_email TEXT;
                v_pseudo_phone TEXT;
                v_new_meta     JSONB;
            BEGIN
                v_admin := %I.verify_admin_session(
                    p_admin_id,
                    p_session_token,
                    ARRAY['founder', 'super_admin', 'compliance', 'approver'],
                    true
                );

                SELECT * INTO v_member
                  FROM %I.members
                 WHERE id = p_member_id
                   FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'MEMBER_NOT_FOUND';
                END IF;

                IF v_member.member_code = 0 THEN
                    RAISE EXCEPTION 'ROOT_CANNOT_BE_ERASED';
                END IF;

                IF COALESCE((v_member.metadata->>'gdpr_pseudonymized')::boolean, false) THEN
                    RETURN jsonb_build_object(
                        'success', true,
                        'already_pseudonymized', true,
                        'member_id', v_member.id,
                        'member_code', v_member.member_code
                    );
                END IF;

                v_pseudo_name  := 'عضو محذوف #' || v_member.member_code::text;
                v_pseudo_email := 'erased_' || v_member.member_code::text || '_' || substr(md5(v_member.id::text), 1, 8) || '@pseudonymized.sawyan.local';
                v_pseudo_phone := '+000' || lpad(v_member.member_code::text, 10, '0');

                -- Scrub all personal PII keys from metadata while keeping statutory audit trace
                v_new_meta := (COALESCE(v_member.metadata, '{}'::jsonb)
                    - 'avatar_url'
                    - 'home_gps'
                    - 'session_token_sha256'
                    - 'session_expires_at'
                    - 'phone'
                    - 'email'
                    - 'password_hash'
                    - 'temp_password_hash'
                    - 'favorite_merchant_ids'
                ) || jsonb_build_object(
                    'gdpr_pseudonymized', true,
                    'gdpr_pseudonymized_at', now(),
                    'gdpr_reason', v_reason,
                    'gdpr_erased_by_admin_id', v_admin.id
                );

                UPDATE %I.members
                   SET full_name = v_pseudo_name,
                       email = v_pseudo_email,
                       phone = v_pseudo_phone,
                       manual_district_fallback = NULL,
                       kyc_docs_enc_ref = NULL,
                       is_tombstone_banned = true,
                       status = 'erased_gdpr',
                       metadata = v_new_meta
                 WHERE id = p_member_id;

                -- Pseudonymize any device fingerprint rows linked to this erased member
                UPDATE %I.device_fraud_fingerprints
                   SET device_hash = 'erased_' || md5(id::text),
                       timezone_name = NULL,
                       ua_short = NULL
                 WHERE actor_type = 'member' AND actor_id = p_member_id;

                PERFORM %I.append_audit_log(
                    'admin',
                    v_admin.id,
                    'GDPR_PSEUDONYMIZE_MEMBER',
                    'members',
                    p_member_id::text,
                    jsonb_build_object('member_code', v_member.member_code, 'prev_status', v_member.status),
                    jsonb_build_object(
                        'member_code', v_member.member_code,
                        'new_status', 'erased_gdpr',
                        'reason', v_reason,
                        'financial_ledger_preserved', true
                    )
                );

                RETURN jsonb_build_object(
                    'success', true,
                    'member_id', v_member.id,
                    'member_code', v_member.member_code,
                    'pseudonymized_name', v_pseudo_name,
                    'financial_ledger_preserved', true,
                    'erased_at', now()
                );
            END;
            $fn$;
            REVOKE ALL ON FUNCTION %I.gdpr_pseudonymize_member_data(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION %I.gdpr_pseudonymize_member_data(UUID, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
        $sql$, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema);

        -- 3. Member Self-Service GDPR/KVKK Erasure Request RPC
        -- Logs a verified high-priority compliance ticket for statutory payout verification before erasure.
        EXECUTE format($sql$
            CREATE OR REPLACE FUNCTION %I.member_request_gdpr_erasure(
                p_member_id UUID,
                p_session_token TEXT,
                p_reason TEXT DEFAULT 'طلب محو وإخفاء البيانات الشخصية (GDPR/KVKK)'
            ) RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = pg_catalog, pg_temp
            AS $fn$
            DECLARE
                v_member    %I.members%%ROWTYPE;
                v_ticket_id UUID;
                v_reason    TEXT := left(COALESCE(NULLIF(trim(p_reason), ''), 'طلب محو وإخفاء البيانات الشخصية (GDPR/KVKK)'), 500);
            BEGIN
                v_member := %I.verify_member_session(p_member_id, p_session_token);

                INSERT INTO %I.support_tickets (
                    requester_type,
                    requester_id,
                    category,
                    priority,
                    status,
                    sla_due_at,
                    subject,
                    message_body,
                    metadata
                ) VALUES (
                    'member',
                    v_member.id,
                    'gdpr_erasure_request',
                    'high',
                    'open',
                    now() + interval '72 hours',
                    'طلب خصوصية ومحو بيانات شخصية (GDPR / KVKK) — عضو #' || v_member.member_code::text,
                    v_reason,
                    jsonb_build_object(
                        'member_code', v_member.member_code,
                        'requested_at', now(),
                        'compliance_framework', 'GDPR_ART17_KVKK_ART7'
                    )
                )
                RETURNING id INTO v_ticket_id;

                PERFORM %I.append_audit_log(
                    'member',
                    v_member.id,
                    'MEMBER_REQUEST_GDPR_ERASURE',
                    'support_tickets',
                    v_ticket_id::text,
                    NULL,
                    jsonb_build_object('member_code', v_member.member_code, 'reason', v_reason)
                );

                RETURN jsonb_build_object(
                    'success', true,
                    'ticket_id', v_ticket_id,
                    'sla_hours', 72,
                    'message_ar', 'تم تسجيل طلب محو البيانات الشخصية رسمياً لدى فريق الامتثال وسيتم التنفيذ خلال 72 ساعة بعد التحقق من أي أرصدة مستحقة.'
                );
            END;
            $fn$;
            REVOKE ALL ON FUNCTION %I.member_request_gdpr_erasure(UUID, TEXT, TEXT) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION %I.member_request_gdpr_erasure(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
        $sql$, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema);

        -- 4. S10 Non-PII Device Fraud Fingerprint Ingestion & Collusion Graph Trigger RPC
        EXECUTE format($sql$
            CREATE OR REPLACE FUNCTION %I.record_device_fraud_fingerprint(
                p_actor_type TEXT,
                p_actor_id UUID,
                p_session_token TEXT,
                p_device_hash TEXT,
                p_tz TEXT DEFAULT NULL,
                p_ua_short TEXT DEFAULT NULL
            ) RETURNS JSONB
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = pg_catalog, pg_temp
            AS $fn$
            DECLARE
                v_type TEXT := lower(trim(COALESCE(p_actor_type, '')));
                v_hash TEXT := lower(trim(COALESCE(p_device_hash, '')));
                v_member_ids UUID[];
                v_merchant_id UUID;
                v_member_cnt INTEGER := 0;
                v_merchant_cnt INTEGER := 0;
                v_signal_created BOOLEAN := false;
                v_existing_sig UUID;
            BEGIN
                IF v_type = 'member' THEN
                    PERFORM %I.verify_member_session(p_actor_id, p_session_token);
                ELSIF v_type = 'merchant' THEN
                    PERFORM %I.verify_merchant_session(p_actor_id, p_session_token);
                ELSE
                    RAISE EXCEPTION 'INVALID_ACTOR_TYPE';
                END IF;

                IF length(v_hash) < 16 OR length(v_hash) > 128 OR v_hash !~ '^[a-z0-9_-]+$' THEN
                    RAISE EXCEPTION 'INVALID_DEVICE_HASH';
                END IF;

                INSERT INTO %I.device_fraud_fingerprints (
                    actor_type, actor_id, device_hash, timezone_name, ua_short
                ) VALUES (
                    v_type, p_actor_id, v_hash, left(COALESCE(p_tz, ''), 64), left(COALESCE(p_ua_short, ''), 120)
                )
                ON CONFLICT (actor_type, actor_id, device_hash)
                DO UPDATE SET
                    last_seen_at = now(),
                    hit_count = %I.device_fraud_fingerprints.hit_count + 1,
                    timezone_name = COALESCE(NULLIF(EXCLUDED.timezone_name, ''), %I.device_fraud_fingerprints.timezone_name),
                    ua_short = COALESCE(NULLIF(EXCLUDED.ua_short, ''), %I.device_fraud_fingerprints.ua_short);

                -- Evaluate S10 cross-account shared device collusion graph
                SELECT array_agg(DISTINCT actor_id), count(DISTINCT actor_id)
                  INTO v_member_ids, v_member_cnt
                  FROM %I.device_fraud_fingerprints
                 WHERE device_hash = v_hash AND actor_type = 'member';

                SELECT max(actor_id::text)::uuid, count(DISTINCT actor_id)
                  INTO v_merchant_id, v_merchant_cnt
                  FROM %I.device_fraud_fingerprints
                 WHERE device_hash = v_hash AND actor_type = 'merchant';

                IF (v_merchant_cnt >= 1 AND v_member_cnt >= 1) OR v_member_cnt >= 3 THEN
                    SELECT id INTO v_existing_sig
                      FROM %I.fraud_graph_signals
                     WHERE signal_type = 'shared_device_fingerprint'
                       AND status = 'open'
                       AND evidence_payload->>'device_hash_prefix' = left(v_hash, 12)
                       AND created_at > now() - interval '24 hours'
                     LIMIT 1;

                    IF v_existing_sig IS NULL THEN
                        INSERT INTO %I.fraud_graph_signals (
                            signal_type,
                            severity,
                            involved_member_ids,
                            involved_merchant_id,
                            evidence_payload,
                            status
                        ) VALUES (
                            'shared_device_fingerprint',
                            CASE WHEN v_merchant_cnt >= 1 AND v_member_cnt >= 1 THEN 'high' ELSE 'medium' END,
                            COALESCE(v_member_ids, ARRAY[]::uuid[]),
                            v_merchant_id,
                            jsonb_build_object(
                                'device_hash_prefix', left(v_hash, 12),
                                'shared_members_count', v_member_cnt,
                                'shared_merchants_count', v_merchant_cnt,
                                'detected_via', v_type,
                                'tz', left(COALESCE(p_tz, ''), 64)
                            ),
                            'open'
                        );
                        v_signal_created := true;
                    END IF;
                END IF;

                RETURN jsonb_build_object(
                    'success', true,
                    'signal_raised', v_signal_created,
                    'shared_members_count', COALESCE(v_member_cnt, 0),
                    'shared_merchants_count', COALESCE(v_merchant_cnt, 0)
                );
            END;
            $fn$;
            REVOKE ALL ON FUNCTION %I.record_device_fraud_fingerprint(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
            GRANT EXECUTE ON FUNCTION %I.record_device_fraud_fingerprint(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
        $sql$, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema);
    END LOOP;
END $outer$;
