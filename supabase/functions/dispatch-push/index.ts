// SAWYAN V3.0 — Stage 15 Unified Multi-Channel Push Dispatcher
// Supports:
//   1. Web Push (RFC 8291/8292 VAPID) — Android Chrome, iOS 16.4+ PWA, Desktop & Google Play TWA
//   2. FCM HTTP v1 (channel='fcm') — Native Google Play Android App (activates automatically once FCM_SERVICE_ACCOUNT_JSON secret is set)
//   3. APNs slot (channel='apns') — Native iOS App ready hook

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

interface PushRequestPayload {
  schema?: "sawyan" | "sawyan_demo";
  outbox_id?: string;
  merchant_id?: string | null;
  branch_id?: string | null;
  member_id?: string | null;
  employee_id?: string | null;
  target_roles?: Array<"merchant_owner" | "employee" | "member">;
  event_name: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface PushSubRow {
  id: string;
  actor_type: string;
  channel: string;
  endpoint: string;
  p256dh: string | null;
  auth_secret: string | null;
  failed_count: number;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Helper: Generate short-lived Google OAuth2 access token from FCM Service Account JSON (for future native Google Play app)
async function getFcmAccessToken(saJsonRaw: string): Promise<{ token: string; projectId: string } | null> {
  try {
    const sa = JSON.parse(saJsonRaw);
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;

    const enc = (obj: unknown) =>
      btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const now = Math.floor(Date.now() / 1000);
    const header = enc({ alg: "RS256", typ: "JWT" });
    const claim = enc({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3500,
    });
    const unsigned = `${header}.${claim}`;

    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
    const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyBytes.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${sig}`,
      }),
    });
    if (!resp.ok) return null;
    const tokJson = await resp.json();
    return tokJson.access_token ? { token: tokJson.access_token, projectId: sa.project_id } : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
  const suppliedSecret = req.headers.get("x-push-secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return jsonResp({ error: "UNAUTHORIZED_PUSH_DISPATCH" }, 401);
  }

  let payload: PushRequestPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResp({ error: "INVALID_JSON" }, 400);
  }

  const schema: "sawyan" | "sawyan_demo" = payload.schema === "sawyan_demo" ? "sawyan_demo" : "sawyan";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@sawyan.com";
  const fcmSaRaw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") || "";

  if (!supabaseUrl || !serviceKey) {
    return jsonResp({ error: "MISSING_SUPABASE_ENV" }, 500);
  }
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    db: { schema },
    auth: { persistSession: false },
  });

  // Collect matching active subscriptions cleanly by role & scope
  const targetRoles = Array.isArray(payload.target_roles) && payload.target_roles.length > 0
    ? payload.target_roles
    : ["merchant_owner", "employee"];

  const subsMap = new Map<string, PushSubRow>();
  const dbErrors: string[] = [];

  if (payload.merchant_id && targetRoles.includes("merchant_owner")) {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("id, actor_type, channel, endpoint, p256dh, auth_secret, failed_count")
      .eq("merchant_id", payload.merchant_id)
      .eq("actor_type", "merchant_owner")
      .eq("is_active", true);
    if (error) dbErrors.push(`owner:${error.message}`);
    for (const row of (data || []) as PushSubRow[]) subsMap.set(row.id, row);
  }

  if (payload.merchant_id && targetRoles.includes("employee")) {
    let q = sb
      .from("push_subscriptions")
      .select("id, actor_type, channel, endpoint, p256dh, auth_secret, failed_count")
      .eq("merchant_id", payload.merchant_id)
      .eq("actor_type", "employee")
      .eq("is_active", true);
    if (payload.branch_id) q = q.eq("branch_id", payload.branch_id);
    if (payload.employee_id) q = q.eq("employee_id", payload.employee_id);
    const { data, error } = await q;
    if (error) dbErrors.push(`emp:${error.message}`);
    for (const row of (data || []) as PushSubRow[]) subsMap.set(row.id, row);
  }

  if (payload.member_id && targetRoles.includes("member")) {
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("id, actor_type, channel, endpoint, p256dh, auth_secret, failed_count")
      .eq("member_id", payload.member_id)
      .eq("actor_type", "member")
      .eq("is_active", true);
    if (error) dbErrors.push(`member:${error.message}`);
    for (const row of (data || []) as PushSubRow[]) subsMap.set(row.id, row);
  }

  if (dbErrors.length > 0 && subsMap.size === 0) {
    return jsonResp({ ok: false, schema, error: "DB_QUERY_FAILED", details: dbErrors }, 500);
  }

  const subs = Array.from(subsMap.values());
  if (subs.length === 0) {
    if (payload.outbox_id) {
      await sb
        .from("push_outbox")
        .update({ status: "no_subscribers", sent_count: 0, failed_count: 0, dispatched_at: new Date().toISOString() })
        .eq("id", payload.outbox_id);
    }
    return jsonResp({ ok: true, schema, total: 0, sent: 0, failed: 0, status: "no_subscribers" });
  }

  const basePrefix = schema === "sawyan_demo" ? "/bank/preview/" : "/bank/";
  const resolveUrlForRole = (role: string) => {
    if (payload.url) return payload.url;
    if (role === "employee") return `${basePrefix}merchant-dashboard/employee.html`;
    if (role === "merchant_owner") return `${basePrefix}merchant-dashboard/dashboard.html`;
    return `${basePrefix}member-dashboard/dashboard.html`;
  };

  let sentCount = 0;
  let failedCount = 0;
  let fcmAuth: { token: string; projectId: string } | null = null;
  if (fcmSaRaw && subs.some((s) => s.channel === "fcm")) {
    fcmAuth = await getFcmAccessToken(fcmSaRaw);
  }

  for (const sub of subs) {
    const clickUrl = resolveUrlForRole(sub.actor_type);
    const notifPayload = {
      title: payload.title,
      body: payload.body,
      url: clickUrl,
      tag: payload.tag || `sawyan-${payload.event_name}-${Date.now()}`,
      icon: `${basePrefix}shared/assets/icon-192.png`,
      badge: `${basePrefix}shared/assets/icon-192.png`,
      event_name: payload.event_name,
      vibrate: [200, 100, 200],
      renotify: true,
      requireInteraction: sub.actor_type !== "member",
      data: payload.data || {},
    };

    try {
      if (sub.channel === "web_push") {
        if (!vapidPublic || !vapidPrivate || !sub.p256dh || !sub.auth_secret) {
          failedCount++;
          continue;
        }
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
          },
          JSON.stringify(notifPayload),
          { TTL: 300, urgency: "high" },
        );
        sentCount++;
        await sb
          .from("push_subscriptions")
          .update({ last_sent_at: new Date().toISOString(), failed_count: 0 })
          .eq("id", sub.id);
      } else if (sub.channel === "fcm" && fcmAuth) {
        const fcmResp = await fetch(
          `https://fcm.googleapis.com/v1/projects/${fcmAuth.projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${fcmAuth.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: sub.endpoint,
                notification: { title: payload.title, body: payload.body },
                android: {
                  priority: "HIGH",
                  notification: {
                    channel_id: "sawyan_verifications",
                    sound: "default",
                    click_action: "OPEN_SAWYAN_APP",
                  },
                },
                data: {
                  url: clickUrl,
                  event_name: String(payload.event_name || ""),
                  tag: String(notifPayload.tag || ""),
                },
              },
            }),
          },
        );
        if (fcmResp.ok) {
          sentCount++;
          await sb
            .from("push_subscriptions")
            .update({ last_sent_at: new Date().toISOString(), failed_count: 0 })
            .eq("id", sub.id);
        } else {
          failedCount++;
          const txt = await fcmResp.text();
          const dead = fcmResp.status === 404 || txt.includes("UNREGISTERED");
          const nextFail = (sub.failed_count || 0) + 1;
          await sb
            .from("push_subscriptions")
            .update({ failed_count: nextFail, is_active: dead || nextFail >= 5 ? false : true })
            .eq("id", sub.id);
        }
      } else {
        // Channel queued for native rollout without breaking web_push batch
        failedCount++;
      }
    } catch (err: unknown) {
      failedCount++;
      const statusCode = Number((err as { statusCode?: number })?.statusCode || 0);
      const isGone = statusCode === 404 || statusCode === 410;
      const nextFail = (sub.failed_count || 0) + 1;
      await sb
        .from("push_subscriptions")
        .update({
          failed_count: nextFail,
          is_active: isGone || nextFail >= 5 ? false : true,
        })
        .eq("id", sub.id);
    }
  }

  const finalStatus = sentCount > 0 && failedCount === 0
    ? "sent"
    : sentCount > 0
    ? "partial"
    : "failed";

  if (payload.outbox_id) {
    await sb
      .from("push_outbox")
      .update({
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", payload.outbox_id);
  }

  return jsonResp({
    ok: true,
    schema,
    total: subs.length,
    sent: sentCount,
    failed: failedCount,
    status: finalStatus,
  });
});
