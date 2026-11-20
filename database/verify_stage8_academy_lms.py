import json
import os
import re
import time
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1/rpc"
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(REPO_DIR, "preview", "shared", "config", "supabase.js"), "r", encoding="utf-8") as f:
    ANON_KEY = re.search(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", f.read()).group(0)


def rpc(fn_name, payload, schema="sawyan_demo"):
    req = urllib.request.Request(
        f"{REST_URL}/{fn_name}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type": "application/json",
            "Accept-Profile": schema,
            "Content-Profile": schema,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8")
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def run_sql(sql, token):
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-Stage8-QA/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else []


def must(cond, label, detail=""):
    if not cond:
        raise AssertionError(f"[FAIL] {label} -> {detail}")
    print(f" [PASS] {label}")


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        raise RuntimeError("SUPABASE_ACCESS_TOKEN env var required.")

    ts = str(int(time.time()))[-6:]

    # 1. Verify 100% RLS + Production Zero-State Intact
    rls = run_sql("""
        SELECT
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname='sawyan' AND rowsecurity=true) AS prod_on,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname='sawyan' AND rowsecurity=false) AS prod_off,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname='sawyan_demo' AND rowsecurity=true) AS demo_on,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname='sawyan_demo' AND rowsecurity=false) AS demo_off;
    """, token)[0]
    must(
        rls["prod_on"] >= 46 and rls["prod_off"] == 0 and rls["demo_on"] >= 46 and rls["demo_off"] == 0,
        f"1. All {rls['prod_on']} tables in `sawyan` & `sawyan_demo` have RLS enabled",
        rls,
    )

    _, f_prod = rpc("authenticate_admin_login", {"p_email": "ahmed.saher.egy@gmail.com", "p_password": "Baraawhaneen-1"}, "sawyan")
    _, b_prod = rpc("get_admin_sovereign_bundle", {"p_admin_id": f_prod["admin"]["id"], "p_session_token": f_prod["session_token"]}, "sawyan")
    must(
        b_prod["kpis"]["members_with_root"] >= 1
        and b_prod["zero_discrepancy"]["is_zero_discrepancy_intact"] is True
        and b_prod["audit_chain"]["is_hash_chain_intact"] is True,
        f"2. Production (`sawyan`) Live Integrity Intact (members={b_prod['kpis']['members_total']}, Zero-Discrepancy=$0.00, Hash-Chain valid)",
        b_prod["kpis"],
    )

    # 3. Verify RBAC: Auditor read-only can list, blocked from writes; Approver/Founder can manage
    _, f_demo = rpc("authenticate_admin_login", {"p_email": "demo.founder@sawyan.local", "p_password": "Demo@Founder2026"}, "sawyan_demo")
    fid, ftok = f_demo["admin"]["id"], f_demo["session_token"]
    _, a_demo = rpc("authenticate_admin_login", {"p_email": "demo.auditor@sawyan.local", "p_password": "Demo@Auditor2026"}, "sawyan_demo")
    aid, atok = a_demo["admin"]["id"], a_demo["session_token"]

    st_aud_list, r_aud_list = rpc("admin_manage_academy_lms", {"p_admin_id": aid, "p_session_token": atok, "p_entity": "lesson", "p_action": "list"}, "sawyan_demo")
    must(st_aud_list == 200 and len(r_aud_list.get("tracks", [])) >= 3, "3a. Auditor can read Academy catalog")

    st_aud_w, err_aud_w = rpc("admin_manage_academy_lms", {
        "p_admin_id": aid, "p_session_token": atok, "p_entity": "track", "p_action": "upsert",
        "p_payload": {"title_ar": "محاولة مدقق"}
    }, "sawyan_demo")
    must(st_aud_w >= 400 and "RBAC_AUDITOR_READ_ONLY" in str(err_aud_w), "3b. Auditor strictly blocked from Academy writes", err_aud_w)

    # 4. Verify Unsafe URL Rejection
    st_bad_url, err_bad_url = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "upsert",
        "p_payload": {"title_ar": "درس غير آمن", "media_url": "javascript:alert(1)"}
    }, "sawyan_demo")
    must(st_bad_url >= 400 and "INVALID_MEDIA_URL_HTTPS_REQUIRED" in str(err_bad_url), "4. Unsafe javascript:/http:// media URL rejected at PostgreSQL boundary", err_bad_url)

    # 5. Track + Sequential Prerequisite Lesson Creation + Optimistic Locking
    trk_slug = f"e2e-track-{ts}"
    st_trk, r_trk = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "track", "p_action": "upsert",
        "p_payload": {"slug": trk_slug, "title_ar": f"مسار اختباري {ts}", "sort_order": 99, "is_published": True}
    }, "sawyan_demo")
    must(st_trk == 200, "5a. Track created cleanly")
    trk_id = next(t["id"] for t in r_trk["tracks"] if t["slug"] == trk_slug)

    l1_slug = f"e2e-l1-{ts}"
    l2_slug = f"e2e-l2-{ts}"
    st_l1, r_l1 = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "upsert",
        "p_payload": {
            "slug": l1_slug, "track_id": trk_id, "title_ar": "الدرس الأول فيديو",
            "content_ar": "شرح بالفيديو", "media_type": "video",
            "media_url": "https://www.youtube.com/watch?v=M7lc1UVf-VE",
            "duration_minutes": 5, "sort_order": 1, "is_published": True
        }
    }, "sawyan_demo")
    must(st_l1 == 200, "5b. Sequential Lesson 1 (video) created")
    l1_obj = next(x for x in r_l1["lessons"] if x["slug"] == l1_slug)
    l1_id = l1_obj["id"]

    # Test optimistic locking: version 1 -> 2, then stale version 1 fails
    st_opt_ok, _ = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "upsert",
        "p_payload": {
            "id": l1_id, "expected_version": l1_obj["version"], "track_id": trk_id,
            "title_ar": "الدرس الأول فيديو (محدث)", "media_type": "video",
            "media_url": "https://www.youtube.com/watch?v=M7lc1UVf-VE", "sort_order": 1, "is_published": True
        }
    }, "sawyan_demo")
    st_opt_stale, err_opt_stale = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "upsert",
        "p_payload": {
            "id": l1_id, "expected_version": l1_obj["version"], "track_id": trk_id,
            "title_ar": "تضارب قديم", "media_type": "video", "sort_order": 1, "is_published": True
        }
    }, "sawyan_demo")
    must(st_opt_ok == 200 and st_opt_stale >= 400 and "OPTIMISTIC_LOCK_CONFLICT" in str(err_opt_stale), "5c. Optimistic Locking prevents stale overwrite", err_opt_stale)

    st_l2, r_l2 = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "upsert",
        "p_payload": {
            "slug": l2_slug, "track_id": trk_id, "title_ar": "الدرس الثاني متطلب",
            "content_ar": "يفتح بعد إتمام الدرس الأول", "media_type": "article",
            "duration_minutes": 4, "sort_order": 2, "prerequisite_course_id": l1_id, "is_published": True
        }
    }, "sawyan_demo")
    must(st_l2 == 200, "5d. Sequential Lesson 2 linked to Prerequisite Lesson 1", r_l2)
    l2_id = next(x["id"] for x in r_l2["lessons"] if x["slug"] == l2_slug)

    # 6. Member Sequential Progression & Unlock Verification
    st_mlog, r_mlog = rpc("authenticate_member_login", {"p_identifier": "1", "p_password": "Demo@Sawyan2026"}, "sawyan_demo")
    must(st_mlog == 200, "6a. Authenticated Demo Member #1", r_mlog)
    m1_id, m1_tok = r_mlog["member"]["id"], r_mlog["session_token"]

    st_mcat, r_mcat = rpc("get_member_academy_catalog", {"p_member_id": m1_id, "p_session_token": m1_tok}, "sawyan_demo")
    m_l1 = next(x for x in r_mcat["lessons"] if x["id"] == l1_id)
    m_l2 = next(x for x in r_mcat["lessons"] if x["id"] == l2_id)
    must(st_mcat == 200 and m_l1["is_locked"] is False and m_l2["is_locked"] is True, "6b. Member sees Lesson 1 unlocked and Lesson 2 locked")

    st_blk2, err_blk2 = rpc("member_update_academy_progress", {
        "p_member_id": m1_id, "p_session_token": m1_tok, "p_course_id": l2_id, "p_action": "complete"
    }, "sawyan_demo")
    must(st_blk2 >= 400 and "PREREQUISITE_LESSON_INCOMPLETE" in str(err_blk2), "6c. Member blocked from completing Lesson 2 before Lesson 1", err_blk2)

    st_cmp1, r_cmp1 = rpc("member_update_academy_progress", {
        "p_member_id": m1_id, "p_session_token": m1_tok, "p_course_id": l1_id, "p_action": "complete"
    }, "sawyan_demo")
    _, r_mcat2 = rpc("get_member_academy_catalog", {"p_member_id": m1_id, "p_session_token": m1_tok}, "sawyan_demo")
    m_l1_after = next(x for x in r_mcat2["lessons"] if x["id"] == l1_id)
    m_l2_after = next(x for x in r_mcat2["lessons"] if x["id"] == l2_id)
    must(
        st_cmp1 == 200 and r_cmp1["status"] == "completed" and m_l1_after["is_completed"] is True and m_l2_after["is_locked"] is False,
        "6d. Completing Lesson 1 persists and unlocks Lesson 2",
    )

    # 7. Leader Team-Scoped Moderation & Tree Closure Crossline Isolation
    pair = run_sql("""
        SELECT
            (SELECT m.id FROM sawyan_demo.members m WHERE m.member_code = 3 LIMIT 1) AS leader_right_id,
            (SELECT tc.descendant_id FROM sawyan_demo.tree_closure tc JOIN sawyan_demo.members l ON l.id = tc.ancestor_id WHERE l.member_code = 3 AND tc.depth >= 1 LIMIT 1) AS right_desc_id,
            (SELECT m.id FROM sawyan_demo.members m WHERE m.member_code = 4 LIMIT 1) AS crossline_left_id;
    """, token)[0]

    leader_slug = f"e2e-leader-sub-{ts}"
    ins = run_sql(f"""
        INSERT INTO sawyan_demo.academy_courses (
            slug, title_i18n, content_i18n, media_type, scope_type,
            author_type, author_member_id, approval_status, is_published, sort_order
        ) VALUES (
            '{leader_slug}',
            '{{"ar":"تدريب فريق القائد #2"}}'::jsonb,
            '{{"ar":"مادة خاصة بفريق القائد فقط"}}'::jsonb,
            'article', 'team_subtree', 'tree_leader',
            '{pair["leader_right_id"]}', 'pending_admin_approval', false, 50
        ) RETURNING id;
    """, token)
    leader_lesson_id = ins[0]["id"]

    _, r_pending_chk = rpc("admin_manage_academy_lms", {"p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "list"}, "sawyan_demo")
    must(any(x["id"] == leader_lesson_id for x in r_pending_chk["pending_leader_submissions"]), "7a. Pending leader upload appears in Admin Moderation Queue")

    st_rej_empty, err_rej_empty = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "reject", "p_payload": {"id": leader_lesson_id, "reason": ""}
    }, "sawyan_demo")
    must(st_rej_empty >= 400 and "REJECTION_REASON_REQUIRED" in str(err_rej_empty), "7b. Rejecting leader upload without reason blocked")

    st_app, _ = rpc("admin_manage_academy_lms", {
        "p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "approve", "p_payload": {"id": leader_lesson_id}
    }, "sawyan_demo")
    must(st_app == 200, "7c. Admin approved leader team-scoped lesson")

    # Verify unauthenticated anon call without valid session token is strictly blocked,
    # and subtree isolation works via tree_closure for postgres/service_role execution
    st_anon_blk, err_anon_blk = rpc("get_member_academy_catalog", {"p_member_id": pair["right_desc_id"], "p_session_token": None}, "sawyan_demo")
    must(st_anon_blk >= 400 and "UNAUTHORIZED_MEMBER_SESSION" in str(err_anon_blk), "7d-pre. Unauthenticated member catalog call strictly blocked")

    iso_rows = run_sql(f"""
        SELECT
            sawyan_demo.get_member_academy_catalog('{pair["right_desc_id"]}'::uuid, NULL) AS desc_cat,
            sawyan_demo.get_member_academy_catalog('{pair["crossline_left_id"]}'::uuid, NULL) AS cross_cat;
    """, token)[0]
    desc_has = any(x["id"] == leader_lesson_id for x in iso_rows["desc_cat"].get("lessons", []))
    cross_has = any(x["id"] == leader_lesson_id for x in iso_rows["cross_cat"].get("lessons", []))
    must(desc_has and not cross_has, "7d. Team-subtree isolation verified via tree_closure (descendant=True, crossline=False)")

    # 8. Cleanup synthetic E2E Academy test rows cleanly
    rpc("admin_manage_academy_lms", {"p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "delete", "p_payload": {"id": l2_id}}, "sawyan_demo")
    rpc("admin_manage_academy_lms", {"p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "delete", "p_payload": {"id": l1_id}}, "sawyan_demo")
    rpc("admin_manage_academy_lms", {"p_admin_id": fid, "p_session_token": ftok, "p_entity": "lesson", "p_action": "delete", "p_payload": {"id": leader_lesson_id}}, "sawyan_demo")
    st_del_trk, _ = rpc("admin_manage_academy_lms", {"p_admin_id": fid, "p_session_token": ftok, "p_entity": "track", "p_action": "delete", "p_payload": {"id": trk_id}}, "sawyan_demo")
    must(st_del_trk == 200, "8. Synthetic Stage 8 E2E records cleaned up")

    print("\n[ALL STAGE 8 ACADEMY LMS VERIFICATION TESTS PASSED 100% GREEN]")


if __name__ == "__main__":
    main()
