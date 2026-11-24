-- ============================================================================
-- SAWYAN V3.0 — Stage 15: Unified Multi-Channel Push Notifications
-- (Web Push VAPID for Android/iOS PWA & Google Play TWA + FCM/APNs ready)
-- ============================================================================
-- Security & Reliability Guarantees:
--   1. Zero secrets stored in git; push_runtime_config has RLS ON & zero anon/auth access.
--   2. Every table has RLS enabled (Zero-Defect Gate 100%).
--   3. All subscription RPCs authenticate callers via verify_*_session.
--   4. Locking/deactivating/resetting an employee immediately disables their push devices.
--   5. pg_net async dispatch is exception-isolated so push delivery NEVER rolls back a sale.
-- ============================================================================

-- 1. Runtime Config (Internal Only — zero public access)
CREATE TABLE IF NOT EXISTS sawyan.push_runtime_config (
    id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    schema_name       VARCHAR(30) NOT NULL DEFAULT 'sawyan',
    edge_function_url TEXT,
    vapid_public_key  TEXT,
    webhook_secret    TEXT,
    is_enabled        BOOLEAN NOT NULL DEFAULT false,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Unified Multi-Channel Subscriptions (Web Push today + FCM/APNs for Google Play / iOS)
CREATE TABLE IF NOT EXISTS sawyan.push_subscriptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type    VARCHAR(20) NOT NULL CHECK (actor_type IN ('merchant_owner', 'employee', 'member')),
    merchant_id   UUID REFERENCES sawyan.merchants(id) ON DELETE CASCADE,
    branch_id     UUID REFERENCES sawyan.merchant_branches(id) ON DELETE CASCADE,
    employee_id   UUID REFERENCES sawyan.cashier_employees(id) ON DELETE CASCADE,
    member_id     UUID REFERENCES sawyan.members(id) ON DELETE CASCADE,
    channel       VARCHAR(20) NOT NULL DEFAULT 'web_push' CHECK (channel IN ('web_push', 'fcm', 'apns')),
    endpoint      TEXT NOT NULL,
    p256dh        TEXT,
    auth_secret   TEXT,
    device_label  VARCHAR(120),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    failed_count  SMALLINT NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    last_sent_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (actor_type, endpoint)
);

-- 3. Push Outbox & Delivery Audit Trail
CREATE TABLE IF NOT EXISTS sawyan.push_outbox (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name        VARCHAR(60) NOT NULL,
    merchant_id       UUID,
    branch_id         UUID,
    member_id         UUID,
    employee_id       UUID,
    target_roles      TEXT[] NOT NULL,
    title             TEXT NOT NULL,
    body              TEXT NOT NULL,
    click_url         TEXT,
    status            VARCHAR(24) NOT NULL DEFAULT 'queued',
    sent_count        INT NOT NULL DEFAULT 0,
    failed_count      INT NOT NULL DEFAULT 0,
    pg_net_request_id BIGINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at     TIMESTAMPTZ
);

-- Strict RLS on all new tables (no direct anon/authenticated table access)
ALTER TABLE sawyan.push_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.push_outbox         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE sawyan.push_runtime_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE sawyan.push_subscriptions  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE sawyan.push_outbox         FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE sawyan.push_runtime_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sawyan.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sawyan.push_outbox TO service_role;

-- Performance partial indexes
CREATE INDEX IF NOT EXISTS idx_push_subs_merchant_branch_active
    ON sawyan.push_subscriptions (merchant_id, branch_id, actor_type)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_subs_member_active
    ON sawyan.push_subscriptions (member_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_subs_employee_active
    ON sawyan.push_subscriptions (employee_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_outbox_created
    ON sawyan.push_outbox (created_at DESC);

-- ============================================================================
-- 4. Internal Non-Blocking Dispatcher (INTERNAL ONLY — never callable by anon)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.enqueue_and_dispatch_push(
    p_event_name   VARCHAR,
    p_target_roles TEXT[],
    p_title        TEXT,
    p_body         TEXT,
    p_merchant_id  UUID DEFAULT NULL,
    p_branch_id    UUID DEFAULT NULL,
    p_member_id    UUID DEFAULT NULL,
    p_employee_id  UUID DEFAULT NULL,
    p_click_url    TEXT DEFAULT NULL,
    p_tag          TEXT DEFAULT NULL,
    p_data         JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_cfg       sawyan.push_runtime_config%ROWTYPE;
    v_has_subs  BOOLEAN := false;
    v_outbox_id UUID;
    v_req_id    BIGINT;
    v_payload   JSONB;
BEGIN
    SELECT * INTO v_cfg FROM sawyan.push_runtime_config WHERE id = 1;
    IF NOT FOUND OR v_cfg.is_enabled IS NOT TRUE
       OR NULLIF(trim(COALESCE(v_cfg.edge_function_url, '')), '') IS NULL
       OR NULLIF(trim(COALESCE(v_cfg.webhook_secret, '')), '') IS NULL
    THEN
        RETURN NULL;
    END IF;

    -- Fast partial-index pre-check so we skip HTTP calls when zero active subscribers exist
    SELECT EXISTS (
        SELECT 1
          FROM sawyan.push_subscriptions ps
         WHERE ps.is_active = true
           AND (
               ('merchant_owner' = ANY(p_target_roles) AND p_merchant_id IS NOT NULL AND ps.actor_type = 'merchant_owner' AND ps.merchant_id = p_merchant_id)
               OR ('employee' = ANY(p_target_roles) AND p_merchant_id IS NOT NULL AND ps.actor_type = 'employee' AND ps.merchant_id = p_merchant_id
                   AND (p_branch_id IS NULL OR ps.branch_id = p_branch_id)
                   AND (p_employee_id IS NULL OR ps.employee_id = p_employee_id))
               OR ('member' = ANY(p_target_roles) AND p_member_id IS NOT NULL AND ps.actor_type = 'member' AND ps.member_id = p_member_id)
           )
    ) INTO v_has_subs;

    IF NOT v_has_subs THEN
        RETURN NULL;
    END IF;

    INSERT INTO sawyan.push_outbox (
        event_name, merchant_id, branch_id, member_id, employee_id,
        target_roles, title, body, click_url, status
    ) VALUES (
        p_event_name, p_merchant_id, p_branch_id, p_member_id, p_employee_id,
        p_target_roles, p_title, p_body, p_click_url, 'queued'
    ) RETURNING id INTO v_outbox_id;

    v_payload := jsonb_build_object(
        'schema', COALESCE(v_cfg.schema_name, 'sawyan'),
        'outbox_id', v_outbox_id,
        'merchant_id', p_merchant_id,
        'branch_id', p_branch_id,
        'member_id', p_member_id,
        'employee_id', p_employee_id,
        'target_roles', to_jsonb(p_target_roles),
        'event_name', p_event_name,
        'title', p_title,
        'body', p_body,
        'url', p_click_url,
        'tag', COALESCE(p_tag, 'sawyan-' || p_event_name || '-' || substr(v_outbox_id::text, 1, 8)),
        'data', COALESCE(p_data, '{}'::jsonb)
    );

    BEGIN
        SELECT net.http_post(
            url     := v_cfg.edge_function_url,
            body    := v_payload,
            params  := '{}'::jsonb,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-push-secret', v_cfg.webhook_secret
            ),
            timeout_milliseconds := 5000
        ) INTO v_req_id;

        UPDATE sawyan.push_outbox
           SET pg_net_request_id = v_req_id
         WHERE id = v_outbox_id;
    EXCEPTION WHEN OTHERS THEN
        -- Never fail or roll back a business transaction if push dispatch encounters a transient error
        UPDATE sawyan.push_outbox
           SET status = 'dispatch_error'
         WHERE id = v_outbox_id;
    END;

    RETURN v_outbox_id;
END;
$$;

-- ============================================================================
-- 5. Automatic Triggers: Notification -> Push & Employee Lock/Deactivate -> Revoke Push
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.trg_fn_notifications_dispatch_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_p         JSONB := COALESCE(NEW.payload, '{}'::jsonb);
    v_code      TEXT  := COALESCE(v_p->>'sw_short_code', '');
    v_amt       TEXT  := COALESCE(v_p->>'amount', '');
    v_curr      TEXT  := COALESCE(v_p->>'currency_code', '');
    v_emp_name  TEXT  := COALESCE(v_p->>'employee_name', v_p->>'employee_code', 'موظف');
    v_merch_nm  TEXT  := COALESCE(v_p->>'merchant_name', 'المتجر');
    v_reason    TEXT  := COALESCE(v_p->>'reason', 'غير مطابق');
    v_branch_id UUID  := NULL;
BEGIN
    IF NULLIF(COALESCE(v_p->>'branch_id', ''), '') ~* '^[0-9a-f-]{36}$' THEN
        v_branch_id := (v_p->>'branch_id')::uuid;
    END IF;

    IF NEW.recipient_type = 'merchant' AND NEW.event_name = 'PendingPurchaseRequested' THEN
        PERFORM sawyan.enqueue_and_dispatch_push(
            NEW.event_name,
            ARRAY['merchant_owner', 'employee']::text[],
            '🧾 طلب توثيق جديد ' || CASE WHEN v_code <> '' THEN '(' || v_code || ')' ELSE '' END,
            'قيمة الفاتورة: ' || v_amt || CASE WHEN v_curr <> '' THEN ' ' || v_curr ELSE '' END || ' — افتح شاشة التوثيق للاعتماد الآن.',
            NEW.recipient_id,
            v_branch_id,
            NULL,
            NULL,
            NULL,
            'sawyan-req-' || COALESCE(NULLIF(v_code, ''), NEW.id::text),
            v_p
        );

    ELSIF NEW.recipient_type = 'merchant' AND NEW.event_name = 'EmployeeRejectedPendingTx' THEN
        PERFORM sawyan.enqueue_and_dispatch_push(
            NEW.event_name,
            ARRAY['merchant_owner']::text[],
            '⚠️ رفض موظف طلب توثيق ' || CASE WHEN v_code <> '' THEN '(' || v_code || ')' ELSE '' END,
            'رفض ' || v_emp_name || ' فاتورة بمبلغ ' || v_amt || ' ' || v_curr || ' — السبب: ' || v_reason || ' (يمكنك التراجع خلال 48 ساعة).',
            NEW.recipient_id,
            NULL, NULL, NULL, NULL,
            'sawyan-emprej-' || COALESCE(NULLIF(v_code, ''), NEW.id::text),
            v_p
        );

    ELSIF NEW.recipient_type = 'merchant' AND NEW.event_name IN ('EmployeeApprovedPendingTx', 'EmployeeCreatedVerificationTx') THEN
        PERFORM sawyan.enqueue_and_dispatch_push(
            NEW.event_name,
            ARRAY['merchant_owner']::text[],
            '✅ اعتماد موظف ' || CASE WHEN v_code <> '' THEN '(' || v_code || ')' ELSE '' END,
            'وثّق ' || v_emp_name || ' فاتورة بمبلغ ' || v_amt || ' ' || v_curr || '.',
            NEW.recipient_id,
            NULL, NULL, NULL, NULL,
            'sawyan-empok-' || COALESCE(NULLIF(v_code, ''), NEW.id::text),
            v_p
        );

    ELSIF NEW.recipient_type = 'merchant' AND NEW.event_name = 'CashierPinLocked5Attempts' THEN
        PERFORM sawyan.enqueue_and_dispatch_push(
            NEW.event_name,
            ARRAY['merchant_owner']::text[],
            '🔒 تنبيه أمني — قفل PIN موظف',
            'تم قفل رمز PIN للموظف ' || v_emp_name || ' لمدة 15 دقيقة بعد 5 محاولات خاطئة.',
            NEW.recipient_id,
            NULL, NULL, NULL, NULL,
            'sawyan-pinlock-' || NEW.id::text,
            v_p
        );

    ELSIF NEW.recipient_type = 'member' AND NEW.event_name IN ('PendingInvoiceApproved', 'PendingInvoiceApprovedByOwnerOverride') THEN
        PERFORM sawyan.enqueue_and_dispatch_push(
            NEW.event_name,
            ARRAY['member']::text[],
            '✅ تم اعتماد فاتورتك ' || CASE WHEN v_code <> '' THEN '(' || v_code || ')' ELSE '' END,
            'اعتمد ' || v_merch_nm || ' فاتورتك وأُضيف العائد لصندوق هدفك الشهري.',
            NULL, NULL,
            NEW.recipient_id,
            NULL, NULL,
            'sawyan-memok-' || COALESCE(NULLIF(v_code, ''), NEW.id::text),
            v_p
        );

    ELSIF NEW.recipient_type = 'member' AND NEW.event_name = 'PendingInvoiceRejected' THEN
        PERFORM sawyan.enqueue_and_dispatch_push(
            NEW.event_name,
            ARRAY['member']::text[],
            '❌ تم رفض طلب التوثيق ' || CASE WHEN v_code <> '' THEN '(' || v_code || ')' ELSE '' END,
            'رفض ' || v_merch_nm || ' الطلب — السبب: ' || v_reason,
            NULL, NULL,
            NEW.recipient_id,
            NULL, NULL,
            'sawyan-memrej-' || COALESCE(NULLIF(v_code, ''), NEW.id::text),
            v_p
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_dispatch_push ON sawyan.notifications;
CREATE TRIGGER trg_notifications_dispatch_push
    AFTER INSERT ON sawyan.notifications
    FOR EACH ROW
    EXECUTE FUNCTION sawyan.trg_fn_notifications_dispatch_push();

-- Automatic push revocation whenever an employee is deactivated, locked out, or PIN-reset
CREATE OR REPLACE FUNCTION sawyan.trg_fn_employee_revoke_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.is_active IS NOT TRUE OR NEW.session_token_hash IS NULL THEN
        UPDATE sawyan.push_subscriptions
           SET is_active  = false,
               updated_at = now()
         WHERE employee_id = NEW.id
           AND actor_type  = 'employee'
           AND is_active   = true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_revoke_push ON sawyan.cashier_employees;
CREATE TRIGGER trg_employee_revoke_push
    AFTER UPDATE OF is_active, session_token_hash ON sawyan.cashier_employees
    FOR EACH ROW
    EXECUTE FUNCTION sawyan.trg_fn_employee_revoke_push();

-- ============================================================================
-- 6. Public Push Registration, Unregistration, VAPID Key & Self-Test RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_push_vapid_public_key()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_cfg sawyan.push_runtime_config%ROWTYPE;
BEGIN
    SELECT * INTO v_cfg FROM sawyan.push_runtime_config WHERE id = 1;
    IF NOT FOUND OR v_cfg.is_enabled IS NOT TRUE OR NULLIF(trim(COALESCE(v_cfg.vapid_public_key, '')), '') IS NULL THEN
        RETURN jsonb_build_object('enabled', false, 'vapid_public_key', NULL);
    END IF;
    RETURN jsonb_build_object(
        'enabled', true,
        'vapid_public_key', v_cfg.vapid_public_key
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.register_push_subscription(
    p_actor_type    VARCHAR(20),
    p_actor_id      UUID,
    p_session_token TEXT,
    p_endpoint      TEXT,
    p_p256dh        TEXT DEFAULT NULL,
    p_auth_secret   TEXT DEFAULT NULL,
    p_channel       VARCHAR(20) DEFAULT 'web_push',
    p_device_label  VARCHAR(120) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_actor    VARCHAR(20);
    v_chan     VARCHAR(20);
    v_ep       TEXT;
    v_merch    sawyan.merchants%ROWTYPE;
    v_emp      sawyan.cashier_employees%ROWTYPE;
    v_mem      sawyan.members%ROWTYPE;
    v_merch_id UUID := NULL;
    v_br_id    UUID := NULL;
    v_emp_id   UUID := NULL;
    v_mem_id   UUID := NULL;
    v_sub_id   UUID;
BEGIN
    v_actor := lower(trim(COALESCE(p_actor_type, '')));
    v_chan  := lower(trim(COALESCE(p_channel, 'web_push')));
    v_ep    := trim(COALESCE(p_endpoint, ''));

    IF v_actor NOT IN ('merchant_owner', 'employee', 'member') THEN
        RAISE EXCEPTION 'INVALID_PUSH_ACTOR_TYPE';
    END IF;
    IF v_chan NOT IN ('web_push', 'fcm', 'apns') THEN
        RAISE EXCEPTION 'INVALID_PUSH_CHANNEL';
    END IF;
    IF v_ep = '' OR length(v_ep) > 2048 THEN
        RAISE EXCEPTION 'INVALID_PUSH_ENDPOINT';
    END IF;
    IF v_chan = 'web_push' AND (NULLIF(trim(COALESCE(p_p256dh, '')), '') IS NULL OR NULLIF(trim(COALESCE(p_auth_secret, '')), '') IS NULL) THEN
        RAISE EXCEPTION 'WEB_PUSH_KEYS_REQUIRED';
    END IF;

    IF v_actor = 'merchant_owner' THEN
        v_merch    := sawyan.verify_merchant_session(p_actor_id, p_session_token);
        v_merch_id := v_merch.id;
    ELSIF v_actor = 'employee' THEN
        v_emp      := sawyan.verify_cashier_session(p_actor_id, p_session_token, false);
        v_merch_id := v_emp.merchant_id;
        v_br_id    := v_emp.branch_id;
        v_emp_id   := v_emp.id;
    ELSE
        v_mem    := sawyan.verify_member_session(p_actor_id, p_session_token);
        v_mem_id := v_mem.id;
    END IF;

    INSERT INTO sawyan.push_subscriptions (
        actor_type, merchant_id, branch_id, employee_id, member_id,
        channel, endpoint, p256dh, auth_secret, device_label, is_active, failed_count, updated_at
    ) VALUES (
        v_actor, v_merch_id, v_br_id, v_emp_id, v_mem_id,
        v_chan, v_ep, NULLIF(trim(COALESCE(p_p256dh, '')), ''), NULLIF(trim(COALESCE(p_auth_secret, '')), ''),
        left(NULLIF(trim(COALESCE(p_device_label, '')), ''), 120), true, 0, now()
    )
    ON CONFLICT (actor_type, endpoint) DO UPDATE
       SET merchant_id  = EXCLUDED.merchant_id,
           branch_id    = EXCLUDED.branch_id,
           employee_id  = EXCLUDED.employee_id,
           member_id    = EXCLUDED.member_id,
           channel      = EXCLUDED.channel,
           p256dh       = EXCLUDED.p256dh,
           auth_secret  = EXCLUDED.auth_secret,
           device_label = COALESCE(EXCLUDED.device_label, sawyan.push_subscriptions.device_label),
           is_active    = true,
           failed_count = 0,
           updated_at   = now()
    RETURNING id INTO v_sub_id;

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub_id,
        'actor_type', v_actor,
        'channel', v_chan
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.unregister_push_subscription(
    p_actor_type    VARCHAR(20),
    p_actor_id      UUID,
    p_session_token TEXT,
    p_endpoint      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_actor VARCHAR(20);
    v_ep    TEXT;
    v_merch sawyan.merchants%ROWTYPE;
    v_emp   sawyan.cashier_employees%ROWTYPE;
    v_mem   sawyan.members%ROWTYPE;
BEGIN
    v_actor := lower(trim(COALESCE(p_actor_type, '')));
    v_ep    := trim(COALESCE(p_endpoint, ''));

    IF v_actor = 'merchant_owner' THEN
        v_merch := sawyan.verify_merchant_session(p_actor_id, p_session_token);
        UPDATE sawyan.push_subscriptions
           SET is_active = false, updated_at = now()
         WHERE actor_type = 'merchant_owner' AND merchant_id = v_merch.id AND endpoint = v_ep;
    ELSIF v_actor = 'employee' THEN
        v_emp := sawyan.verify_cashier_session(p_actor_id, p_session_token, true);
        UPDATE sawyan.push_subscriptions
           SET is_active = false, updated_at = now()
         WHERE actor_type = 'employee' AND employee_id = v_emp.id AND endpoint = v_ep;
    ELSIF v_actor = 'member' THEN
        v_mem := sawyan.verify_member_session(p_actor_id, p_session_token);
        UPDATE sawyan.push_subscriptions
           SET is_active = false, updated_at = now()
         WHERE actor_type = 'member' AND member_id = v_mem.id AND endpoint = v_ep;
    ELSE
        RAISE EXCEPTION 'INVALID_PUSH_ACTOR_TYPE';
    END IF;

    RETURN jsonb_build_object('success', true, 'unregistered', true);
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.send_my_test_push(
    p_actor_type    VARCHAR(20),
    p_actor_id      UUID,
    p_session_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_actor     VARCHAR(20);
    v_merch     sawyan.merchants%ROWTYPE;
    v_emp       sawyan.cashier_employees%ROWTYPE;
    v_mem       sawyan.members%ROWTYPE;
    v_outbox_id UUID;
BEGIN
    v_actor := lower(trim(COALESCE(p_actor_type, '')));

    IF v_actor = 'merchant_owner' THEN
        v_merch := sawyan.verify_merchant_session(p_actor_id, p_session_token);
        v_outbox_id := sawyan.enqueue_and_dispatch_push(
            'SelfTestPush',
            ARRAY['merchant_owner']::text[],
            '🔔 إشعار تجريبي — SAWYAN التاجر',
            'إشعارات شاشة القفل بالصوت مفعّلة وتعمل بنجاح على هاتفك.',
            v_merch.id, NULL, NULL, NULL, NULL, 'sawyan-selftest-owner'
        );
    ELSIF v_actor = 'employee' THEN
        v_emp := sawyan.verify_cashier_session(p_actor_id, p_session_token, false);
        v_outbox_id := sawyan.enqueue_and_dispatch_push(
            'SelfTestPush',
            ARRAY['employee']::text[],
            '🔔 إشعار تجريبي — SAWYAN شاشة التوثيق',
            'إشعارات شاشة القفل بالصوت مفعّلة — ستصلك طلبات فرعك حتى والهاتف مقفل.',
            v_emp.merchant_id, v_emp.branch_id, NULL, v_emp.id, NULL, 'sawyan-selftest-emp'
        );
    ELSIF v_actor = 'member' THEN
        v_mem := sawyan.verify_member_session(p_actor_id, p_session_token);
        v_outbox_id := sawyan.enqueue_and_dispatch_push(
            'SelfTestPush',
            ARRAY['member']::text[],
            '🔔 إشعار تجريبي — SAWYAN',
            'إشعارات اعتماد الفواتير مفعّلة وتعمل بنجاح على هاتفك.',
            NULL, NULL, v_mem.id, NULL, NULL, 'sawyan-selftest-member'
        );
    ELSE
        RAISE EXCEPTION 'INVALID_PUSH_ACTOR_TYPE';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'dispatched', (v_outbox_id IS NOT NULL),
        'outbox_id', v_outbox_id
    );
END;
$$;

-- ============================================================================
-- 7. Strict Least-Privilege Grants
-- ============================================================================
REVOKE ALL ON FUNCTION sawyan.enqueue_and_dispatch_push(VARCHAR, TEXT[], TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.enqueue_and_dispatch_push(VARCHAR, TEXT[], TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION sawyan.trg_fn_notifications_dispatch_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.trg_fn_employee_revoke_push() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION sawyan.get_push_vapid_public_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.get_push_vapid_public_key() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.register_push_subscription(VARCHAR, UUID, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.register_push_subscription(VARCHAR, UUID, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.unregister_push_subscription(VARCHAR, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.unregister_push_subscription(VARCHAR, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.send_my_test_push(VARCHAR, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.send_my_test_push(VARCHAR, UUID, TEXT) TO anon, authenticated, service_role;
