/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — STAGE 8: STANDALONE ACADEMY LMS ADMINISTRATION MODULE
 * Clean Bounded Context decoupled from Sovereign Root #0 / Staff Operations.
 * Supports:
 *   MVP Today  : Sequential Tracks -> Ordered Lessons (Video/Article/Audio/PDF)
 *                Live YouTube/Vimeo/MP4/Audio Preview, Reordering, Prerequisite Gating
 *   Scale Next : Quiz Schema & Passing Thresholds, Leader Team-Scoped Moderation Queue,
 *                Threaded Comments Moderation (DB & RLS foundation already live).
 * ============================================================================
 */
(function () {
    'use strict';

    let LMS_STATE = { tracks: [], lessons: [], pending_leader_submissions: [], stats: {} };
    let ACTIVE_TAB = 'lessons'; // lessons | tracks | leader_queue
    let FILTER_TRACK_ID = 'ALL';
    let FILTER_MEDIA_TYPE = 'ALL';

    function esc(v) {
        if (typeof window.svEsc === 'function') return window.svEsc(v);
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(msg, isErr) {
        if (typeof window.svAdminToast === 'function') {
            window.svAdminToast(msg, isErr);
            return;
        }
        alert((isErr ? '⛔ ' : '✅ ') + msg);
    }

    function openModal(title, html, width) {
        if (typeof window.svOpenAdminModal === 'function') {
            window.svOpenAdminModal(title, html, width);
            return;
        }
        toast('نافذة الحوار غير مهيأة بعد.', true);
    }

    function closeModal() {
        if (typeof window.closeStage7Modal === 'function') window.closeStage7Modal();
    }

    function canEditAcademy() {
        const adm = (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedAdmin()) || window.currentAdmin || null;
        if (!adm) return false;
        if (adm.is_sovereign_founder) return true;
        return ['approver', 'reviewer', 'data_entry', 'support'].includes(String(adm.role || '').toLowerCase());
    }

    function mediaBadge(mediaType) {
        const m = {
            video: ['🎬 فيديو', '#eff6ff', '#1d4ed8'],
            audio: ['🎧 صوتي', '#faf5ff', '#7e22ce'],
            article: ['📖 مقالة تدريبية', '#ecfdf5', '#065f46'],
            pdf: ['📄 ملف PDF', '#fff7ed', '#c2410c'],
            mixed: ['🧩 متعدد الوسائط', '#f1f5f9', '#334155']
        }[mediaType || 'article'] || ['📚 مادة', '#f1f5f9', '#334155'];
        return '<span class="acad-media-badge" style="background:' + m[1] + ';color:' + m[2] + ';">' + m[0] + '</span>';
    }

    function mountSidebarLink() {
        const nav = document.querySelector('.sidebar-nav');
        const contentArea = document.getElementById('contentArea');
        if (!nav || !contentArea) return;

        let link = document.getElementById('svAcademyAdminNavItem');
        if (!link) {
            link = document.createElement('a');
            link.href = '#';
            link.id = 'svAcademyAdminNavItem';
            link.className = 'nav-item';
            link.dataset.page = 'academyAdmin';
            link.innerHTML = '<span class="icon">🎓</span><span>الأكاديمية التدريبية</span>';
            const opsLink = document.getElementById('svStage7HubNavItem');
            if (opsLink && opsLink.nextSibling) nav.insertBefore(link, opsLink.nextSibling);
            else nav.appendChild(link);
        }

        if (!link.dataset.acadBound) {
            link.dataset.acadBound = '1';
            link.addEventListener('click', function (e) {
                e.preventDefault();
                window.openAcademyAdminPage('lessons');
            });
        }

        if (!document.getElementById('academyAdminPage')) {
            const p = document.createElement('div');
            p.id = 'academyAdminPage';
            p.className = 'page';
            contentArea.appendChild(p);
        }
    }

    window.openAcademyAdminPage = async function (tab) {
        if (tab) ACTIVE_TAB = tab;
        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        const navItem = document.getElementById('svAcademyAdminNavItem');
        if (navItem) navItem.classList.add('active');

        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = '🎓 الأكاديمية التدريبية';

        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        const pg = document.getElementById('academyAdminPage');
        if (pg) {
            pg.classList.add('active');
            await refreshAndRenderAcademyAdmin();
        }
    };

    async function refreshAndRenderAcademyAdmin() {
        const pg = document.getElementById('academyAdminPage');
        if (!pg) return;

        pg.innerHTML = '<div class="acad-card" style="text-align:center;color:#64748b;padding:30px;">جاري تحميل بيانات الأكاديمية التدريبية من قاعدة البيانات...</div>';

        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'list' });
            renderAcademyAdminShell(pg);
        } catch (err) {
            pg.innerHTML = '<div class="acad-card" style="background:#fef2f2;border-color:#fca5a5;color:#991b1b;font-weight:800;">⛔ تعذر تحميل الأكاديمية: ' + esc(err.message) + '</div>';
        }
    }

    function renderAcademyAdminShell(pg) {
        const st = LMS_STATE.stats || {};
        const editable = canEditAcademy();
        const schema = (window.SAWYAN && window.SAWYAN.API) ? window.SAWYAN.API.getActiveSchema() : 'sawyan';
        const pendingCount = Number(st.pending_leader_reviews || 0);

        const tabs = [
            ['lessons', '📚 المواد التدريبية المتسلسلة (' + Number(st.lessons_total || 0) + ')'],
            ['tracks', '🗂️ المسارات التدريبية (' + Number(st.tracks_total || 0) + ')'],
            ['leader_queue', '📥 اعتماد مواد القادة وجاهزية التوسع' + (pendingCount > 0 ? ' (' + pendingCount + ')' : '')]
        ];

        pg.innerHTML =
            '<div class="acad-hero">' +
                '<div>' +
                    '<div style="font-size:1.15rem;font-weight:900;">🎓 الأكاديمية التدريبية المستقلة (SAWYAN Academy LMS)</div>' +
                    '<div style="font-size:0.82rem;color:#a7f3d0;margin-top:4px;">منظومة التعليم والتدريب المتسلسل للأعضاء والقادة — فيديو / مقالات / صوت / PDF (' + esc(schema) + ')</div>' +
                '</div>' +
                (editable
                    ? '<button type="button" class="btn" style="background:#fbbf24;color:#0f172a;font-weight:900;border:none;padding:9px 16px;border-radius:10px;cursor:pointer;" onclick="svOpenAcademyLessonModal(null)">➕ إضافة مادة تدريبية</button>'
                    : '<span style="background:rgba(255,255,255,0.18);padding:6px 12px;border-radius:999px;font-size:0.78rem;font-weight:700;">وضع العرض فقط لهذا الدور</span>') +
            '</div>' +

            '<div class="acad-kpi-grid">' +
                '<div class="acad-kpi-card"><div class="acad-kpi-label">المسارات التدريبية</div><div class="acad-kpi-val">' + Number(st.tracks_total || 0) + '</div></div>' +
                '<div class="acad-kpi-card"><div class="acad-kpi-label">إجمالي المواد</div><div class="acad-kpi-val">' + Number(st.lessons_total || 0) + '</div></div>' +
                '<div class="acad-kpi-card"><div class="acad-kpi-label">المنشور حالياً</div><div class="acad-kpi-val" style="color:#059669;">' + Number(st.lessons_published || 0) + '</div></div>' +
                '<div class="acad-kpi-card"><div class="acad-kpi-label">إنجازات الأعضاء المسجلة</div><div class="acad-kpi-val" style="color:#1d4ed8;">' + Number(st.total_completions || 0) + '</div></div>' +
            '</div>' +

            '<div class="acad-tabs">' +
                tabs.map(function (t) {
                    return '<button type="button" class="acad-tab-btn ' + (ACTIVE_TAB === t[0] ? 'active' : '') + '" onclick="svSwitchAcademyAdminTab(\'' + t[0] + '\')">' + t[1] + '</button>';
                }).join('') +
            '</div>' +

            '<div id="svAcademyTabBody"></div>';

        const body = document.getElementById('svAcademyTabBody');
        if (ACTIVE_TAB === 'lessons') renderLessonsTab(body, editable);
        else if (ACTIVE_TAB === 'tracks') renderTracksTab(body, editable);
        else renderLeaderQueueAndRoadmapTab(body, editable);
    }

    window.svSwitchAcademyAdminTab = function (tab) {
        ACTIVE_TAB = tab;
        const pg = document.getElementById('academyAdminPage');
        if (pg) renderAcademyAdminShell(pg);
    };

    window.svFilterAcademyAdmin = function (trackId, mediaType) {
        if (trackId !== null && trackId !== undefined) FILTER_TRACK_ID = trackId;
        if (mediaType !== null && mediaType !== undefined) FILTER_MEDIA_TYPE = mediaType;
        const body = document.getElementById('svAcademyTabBody');
        if (body) renderLessonsTab(body, canEditAcademy());
    };

    function renderLessonsTab(body, editable) {
        const tracks = LMS_STATE.tracks || [];
        const allLessons = LMS_STATE.lessons || [];
        const filtered = allLessons.filter(function (l) {
            if (FILTER_TRACK_ID !== 'ALL' && String(l.track_id || '') !== FILTER_TRACK_ID) return false;
            if (FILTER_MEDIA_TYPE !== 'ALL' && String(l.media_type || '') !== FILTER_MEDIA_TYPE) return false;
            return true;
        });

        const lessonMap = new Map(allLessons.map(function (x) { return [String(x.id), x]; }));

        body.innerHTML =
            '<div class="acad-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
                    '<select id="svAcadFilterTrack" class="form-control" style="width:auto;min-width:220px;" onchange="svFilterAcademyAdmin(this.value, null)">' +
                        '<option value="ALL" ' + (FILTER_TRACK_ID === 'ALL' ? 'selected' : '') + '>🗂️ جميع المسارات التدريبية</option>' +
                        tracks.map(function (t) {
                            return '<option value="' + esc(t.id) + '" ' + (FILTER_TRACK_ID === String(t.id) ? 'selected' : '') + '>' + esc(t.icon + ' ' + ((t.title_i18n && t.title_i18n.ar) || t.slug)) + '</option>';
                        }).join('') +
                    '</select>' +
                    '<select id="svAcadFilterMedia" class="form-control" style="width:auto;" onchange="svFilterAcademyAdmin(null, this.value)">' +
                        '<option value="ALL" ' + (FILTER_MEDIA_TYPE === 'ALL' ? 'selected' : '') + '>كل الأنواع</option>' +
                        '<option value="video" ' + (FILTER_MEDIA_TYPE === 'video' ? 'selected' : '') + '>🎬 فيديو</option>' +
                        '<option value="article" ' + (FILTER_MEDIA_TYPE === 'article' ? 'selected' : '') + '>📖 مقالة</option>' +
                        '<option value="audio" ' + (FILTER_MEDIA_TYPE === 'audio' ? 'selected' : '') + '>🎧 صوتي</option>' +
                        '<option value="pdf" ' + (FILTER_MEDIA_TYPE === 'pdf' ? 'selected' : '') + '>📄 PDF</option>' +
                    '</select>' +
                '</div>' +
                '<div style="font-size:0.82rem;color:#475569;font-weight:700;">عرض ' + filtered.length + ' من أصل ' + allLessons.length + ' مادة</div>' +
            '</div>' +

            (filtered.length === 0
                ? '<div class="acad-card"><p class="empty-state">لا توجد مواد تدريبية مطابقة للفلتر الحالي.</p></div>'
                : filtered.map(function (l, idx) {
                    const titleAr = (l.title_i18n && l.title_i18n.ar) || l.slug;
                    const summaryAr = (l.content_i18n && l.content_i18n.ar) || '';
                    const prereq = l.prerequisite_course_id ? lessonMap.get(String(l.prerequisite_course_id)) : null;
                    const prereqTitle = prereq ? ((prereq.title_i18n && prereq.title_i18n.ar) || prereq.slug) : '';
                    return '<div class="acad-lesson-row">' +
                        '<div style="flex:1;min-width:250px;">' +
                            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">' +
                                '<span style="background:#0f172a;color:#ffffff;padding:2px 8px;border-radius:6px;font-size:0.74rem;font-weight:900;">#' + Number(l.sort_order || (idx + 1)) + '</span>' +
                                (l.track_title_ar ? '<span style="background:#f1f5f9;color:#334155;padding:2px 9px;border-radius:999px;font-size:0.74rem;font-weight:800;">' + esc((l.track_icon || '🎓') + ' ' + l.track_title_ar) + '</span>' : '') +
                                mediaBadge(l.media_type) +
                                (l.duration_minutes ? '<span style="font-size:0.75rem;color:#64748b;font-weight:700;">⏱ ' + Number(l.duration_minutes) + ' د</span>' : '') +
                                (l.media_url ? '<span class="badge badge-success">🔗 رابط مرفق</span>' : '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;">بدون رابط فيديو بعد</span>') +
                                (l.is_published ? '<span class="badge badge-success">منشور</span>' : '<span class="badge badge-danger">مخفي</span>') +
                            '</div>' +
                            '<div style="font-size:0.98rem;font-weight:900;color:#0f172a;">' + esc(titleAr) + '</div>' +
                            '<div style="font-size:0.82rem;color:#475569;margin-top:4px;line-height:1.55;">' + esc(summaryAr.slice(0, 180)) + (summaryAr.length > 180 ? '...' : '') + '</div>' +
                            '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.74rem;color:#64748b;margin-top:6px;">' +
                                '<span>✅ أتمّها: <b>' + Number(l.completions_count || 0) + '</b> عضو</span>' +
                                (prereqTitle ? '<span>🔒 متطلب سابق: <b>' + esc(prereqTitle) + '</b></span>' : '') +
                            '</div>' +
                        '</div>' +
                        '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                            '<button type="button" class="btn-sm btn-outline" onclick="svPreviewAcademyLesson(\'' + esc(l.id) + '\')">👁️ معاينة</button>' +
                            (editable
                                ? '<button type="button" class="btn-sm btn-outline" title="تحريك لأعلى" onclick="svReorderAcademyLesson(\'' + esc(l.id) + '\',\'up\')">▲</button>' +
                                  '<button type="button" class="btn-sm btn-outline" title="تحريك لأسفل" onclick="svReorderAcademyLesson(\'' + esc(l.id) + '\',\'down\')">▼</button>' +
                                  '<button type="button" class="btn-sm btn-primary" onclick="svOpenAcademyLessonModal(\'' + esc(l.id) + '\')">✏️ تعديل</button>' +
                                  '<button type="button" class="btn-sm btn-warning" onclick="svToggleAcademyLessonPublish(\'' + esc(l.id) + '\')">' + (l.is_published ? 'إخفاء' : 'نشر') + '</button>' +
                                  '<button type="button" class="btn-sm btn-danger" onclick="svDeleteAcademyLesson(\'' + esc(l.id) + '\')">حذف</button>'
                                : '') +
                        '</div>' +
                    '</div>';
                }).join(''));
    }

    function renderTracksTab(body, editable) {
        const tracks = LMS_STATE.tracks || [];
        body.innerHTML =
            '<div class="acad-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
                '<div><h3 style="margin:0;font-size:1rem;">🗂️ المسارات التدريبية المنظّمة</h3><div style="font-size:0.78rem;color:#64748b;">المسارات ترتب الدروس بطريقة متسلسلة من التأسيس حتى القيادة</div></div>' +
                (editable ? '<button type="button" class="btn btn-primary" onclick="svOpenAcademyTrackModal(null)">➕ إضافة مسار جديد</button>' : '') +
            '</div>' +
            tracks.map(function (t) {
                return '<div class="acad-lesson-row">' +
                    '<div style="flex:1;min-width:240px;">' +
                        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">' +
                            '<span style="font-size:1.25rem;">' + esc(t.icon || '🎓') + '</span>' +
                            '<b style="font-size:0.98rem;color:#0f172a;">' + esc((t.title_i18n && t.title_i18n.ar) || t.slug) + '</b>' +
                            '<span class="badge ' + (t.is_published ? 'badge-success' : 'badge-danger') + '">' + (t.is_published ? 'منشور' : 'مخفي') + '</span>' +
                            '<span style="font-size:0.74rem;color:#64748b;">ترتيب: ' + Number(t.sort_order || 0) + ' • مواد: <b>' + Number(t.lessons_count || 0) + '</b></span>' +
                        '</div>' +
                        '<div style="font-size:0.82rem;color:#475569;">' + esc((t.description_i18n && t.description_i18n.ar) || '') + '</div>' +
                    '</div>' +
                    (editable
                        ? '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                            '<button type="button" class="btn-sm btn-primary" onclick="svOpenAcademyTrackModal(\'' + esc(t.id) + '\')">✏️ تعديل</button>' +
                            '<button type="button" class="btn-sm btn-warning" onclick="svToggleAcademyTrackPublish(\'' + esc(t.id) + '\')">' + (t.is_published ? 'إخفاء' : 'نشر') + '</button>' +
                            (Number(t.lessons_count || 0) === 0 ? '<button type="button" class="btn-sm btn-danger" onclick="svDeleteAcademyTrack(\'' + esc(t.id) + '\')">حذف</button>' : '') +
                          '</div>'
                        : '') +
                '</div>';
            }).join('');
    }

    function renderLeaderQueueAndRoadmapTab(body, editable) {
        const pending = LMS_STATE.pending_leader_submissions || [];
        body.innerHTML =
            '<div class="acad-card">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;">📥 طابور موافقات مواد قادة الفرق (' + pending.length + ')</h3>' +
                '<p style="margin:0 0 12px 0;font-size:0.82rem;color:#475569;">عندما يرفع قائد شجرة مادة تدريبية خاصة بفريقه (<code>scope_type = team_subtree</code>)، تدخل هنا لموافقة الإدارة قبل ظهورها لأفراد شجرته.</p>' +
                (pending.length === 0
                    ? '<div style="background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:10px;padding:18px;text-align:center;color:#64748b;font-weight:700;">✅ لا توجد مواد معلقة من قادة الفرق حالياً.</div>'
                    : pending.map(function (p) {
                        return '<div class="acad-lesson-row">' +
                            '<div style="flex:1;">' +
                                '<div><b>' + esc((p.title_i18n && p.title_i18n.ar) || p.slug) + '</b> • من القائد: <b>' + esc(p.author_name || '') + '</b></div>' +
                                '<div style="font-size:0.82rem;color:#475569;margin-top:4px;">' + esc((p.content_i18n && p.content_i18n.ar) || '') + '</div>' +
                            '</div>' +
                            (editable
                                ? '<div style="display:flex;gap:6px;">' +
                                    '<button type="button" class="btn-sm btn-primary" onclick="svApproveLeaderLesson(\'' + esc(p.id) + '\')">✅ اعتماد ونشر</button>' +
                                    '<button type="button" class="btn-sm btn-danger" onclick="svRejectLeaderLesson(\'' + esc(p.id) + '\')">❌ رفض</button>' +
                                  '</div>'
                                : '') +
                        '</div>';
                    }).join('')) +
            '</div>' +

            '<div class="acad-card" style="background:#f8fafc;">' +
                '<h3 style="margin:0 0 10px 0;font-size:0.98rem;color:#0f172a;">🏗️ البنية التأسيسية الجاهزة للتوسع المستقبلي (مفعّلة في قاعدة البيانات)</h3>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;font-size:0.82rem;">' +
                    '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:12px;">' +
                        '<b>1. الامتحانات والاجتيازات</b><div style="color:#475569;margin-top:4px;">حقول <code>quiz_schema</code> و<code>pass_score_pct</code> وجدول <code>academy_member_progress</code> برقم الشهادة جاهزة في PostgreSQL.</div>' +
                    '</div>' +
                    '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:12px;">' +
                        '<b>2. التعليقات والنقاش التفاعلي</b><div style="color:#475569;margin-top:4px;">جدول <code>academy_lesson_comments</code> محمي بـ RLS وجاهز لاستقبال تعليقات الأعضاء والردود المثبتة.</div>' +
                    '</div>' +
                    '<div style="background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:12px;">' +
                        '<b>3. مواد القائد لفريقه فقط</b><div style="color:#475569;margin-top:4px;">عزل <code>team_subtree</code> عبر <code>tree_closure</code> يضمن ظهور مادة القائد لأعضاء شجرته فقط بعد موافقة الإدارة.</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    window.svOpenAcademyLessonModal = function (lessonId) {
        const allLessons = LMS_STATE.lessons || [];
        const tracks = LMS_STATE.tracks || [];
        const l = lessonId ? allLessons.find(function (x) { return String(x.id) === String(lessonId); }) : null;
        const isEdit = Boolean(l);

        const titleAr = l && l.title_i18n ? (l.title_i18n.ar || '') : '';
        const titleEn = l && l.title_i18n ? (l.title_i18n.en || '') : '';
        const contentAr = l && l.content_i18n ? (l.content_i18n.ar || '') : '';
        const mediaType = l ? (l.media_type || 'video') : 'video';
        const mediaUrl = l ? (l.media_url || '') : '';
        const dur = l && l.duration_minutes ? l.duration_minutes : '';
        const order = l && l.sort_order ? l.sort_order : (allLessons.length + 1);
        const curTrack = l ? String(l.track_id || '') : (tracks[0] ? String(tracks[0].id) : '');
        const curPrereq = l ? String(l.prerequisite_course_id || '') : '';
        const isPub = l ? Boolean(l.is_published) : true;
        const isMand = l ? Boolean(l.is_mandatory) : false;
        const allowCom = l ? Boolean(l.allow_comments) : true;

        openModal(
            isEdit ? '✏️ تعديل المادة التدريبية' : '➕ إضافة مادة تدريبية جديدة',
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
                '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;">' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">المسار التدريبي</label>' +
                        '<select id="svAcadEdTrack" class="form-control">' +
                            '<option value="">— بدون مسار —</option>' +
                            tracks.map(function (t) {
                                return '<option value="' + esc(t.id) + '" ' + (curTrack === String(t.id) ? 'selected' : '') + '>' + esc((t.icon || '') + ' ' + ((t.title_i18n && t.title_i18n.ar) || t.slug)) + '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">النوع</label>' +
                        '<select id="svAcadEdType" class="form-control" onchange="svUpdateAcademyUrlPreview()">' +
                            '<option value="video" ' + (mediaType === 'video' ? 'selected' : '') + '>🎬 فيديو</option>' +
                            '<option value="article" ' + (mediaType === 'article' ? 'selected' : '') + '>📖 مقالة</option>' +
                            '<option value="audio" ' + (mediaType === 'audio' ? 'selected' : '') + '>🎧 صوتي</option>' +
                            '<option value="pdf" ' + (mediaType === 'pdf' ? 'selected' : '') + '>📄 ملف PDF</option>' +
                            '<option value="mixed" ' + (mediaType === 'mixed' ? 'selected' : '') + '>🧩 مختلط</option>' +
                        '</select>' +
                    '</div>' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">الترتيب</label>' +
                        '<input id="svAcadEdOrder" type="number" min="1" value="' + esc(order) + '" class="form-control">' +
                    '</div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;">' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">عنوان المادة بالعربية *</label><input id="svAcadEdTitleAr" type="text" value="' + esc(titleAr) + '" class="form-control" placeholder="مثلاً: شرح المشروع للمبتدئين"></div>' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">المدة (دقائق)</label><input id="svAcadEdDur" type="number" min="1" max="600" value="' + esc(dur) + '" class="form-control" placeholder="5"></div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">العنوان الإنجليزي (اختياري)</label><input id="svAcadEdTitleEn" type="text" value="' + esc(titleEn) + '" class="form-control"></div>' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">يتطلب إتمام درس سابق (اختياري)</label>' +
                        '<select id="svAcadEdPrereq" class="form-control">' +
                            '<option value="">— مفتوح مباشرة بلا قيد —</option>' +
                            allLessons.filter(function (x) { return !l || String(x.id) !== String(l.id); }).map(function (x) {
                                return '<option value="' + esc(x.id) + '" ' + (curPrereq === String(x.id) ? 'selected' : '') + '>' + esc((x.title_i18n && x.title_i18n.ar) || x.slug) + '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">رابط الوسائط الآمن HTTPS (YouTube / Vimeo / MP4 / MP3 / PDF)</label>' +
                    '<input id="svAcadEdUrl" type="url" value="' + esc(mediaUrl) + '" class="form-control" dir="ltr" placeholder="https://www.youtube.com/watch?v=..." oninput="svUpdateAcademyUrlPreview()">' +
                '</div>' +
                '<div id="svAcadModalLivePreview" style="display:block;width:100%;margin-top:4px;"></div>' +
                '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">النص والشرح التدريبي</label>' +
                    '<textarea id="svAcadEdContentAr" rows="4" class="form-control" placeholder="اكتب شرح المادة التدريبية أو نقاط الفيديو...">' + esc(contentAr) + '</textarea>' +
                '</div>' +
                '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:0.84rem;">' +
                    '<label><input id="svAcadEdPub" type="checkbox" ' + (isPub ? 'checked' : '') + '> منشور للأعضاء</label>' +
                    '<label><input id="svAcadEdMand" type="checkbox" ' + (isMand ? 'checked' : '') + '> تدريب أساسي إلزامي</label>' +
                    '<label><input id="svAcadEdCom" type="checkbox" ' + (allowCom ? 'checked' : '') + '> السماح بالتعليقات مستقبلاً</label>' +
                '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                    '<button type="button" class="btn btn-outline" onclick="closeStage7Modal()">إلغاء</button>' +
                    '<button type="button" class="btn btn-primary" onclick="svSaveAcademyLesson(\'' + esc(l ? l.id : '') + '\',' + (l ? Number(l.version || 1) : 'null') + ')">💾 حفظ المادة التدريبية</button>' +
                '</div>' +
            '</div>',
            '740px'
        );
        window.svUpdateAcademyUrlPreview();
    };

    window.svUpdateAcademyUrlPreview = function () {
        const box = document.getElementById('svAcadModalLivePreview');
        if (!box || !window.SAWYAN || !window.SAWYAN.API) return;
        const url = (document.getElementById('svAcadEdUrl') || {}).value || '';
        const mType = (document.getElementById('svAcadEdType') || {}).value || 'video';
        box.innerHTML = url.trim() ? window.SAWYAN.API.buildAcademyMediaPlayerHtml(url, mType) : '';
    };

    window.svSaveAcademyLesson = async function (lessonId, expectedVer) {
        try {
            const payload = {
                id: lessonId || null,
                expected_version: expectedVer,
                track_id: document.getElementById('svAcadEdTrack').value || null,
                media_type: document.getElementById('svAcadEdType').value,
                sort_order: Number(document.getElementById('svAcadEdOrder').value || 1),
                title_ar: document.getElementById('svAcadEdTitleAr').value.trim(),
                title_en: document.getElementById('svAcadEdTitleEn').value.trim(),
                duration_minutes: document.getElementById('svAcadEdDur').value ? Number(document.getElementById('svAcadEdDur').value) : null,
                prerequisite_course_id: document.getElementById('svAcadEdPrereq').value || null,
                media_url: document.getElementById('svAcadEdUrl').value.trim(),
                content_ar: document.getElementById('svAcadEdContentAr').value.trim(),
                is_published: document.getElementById('svAcadEdPub').checked,
                is_mandatory: document.getElementById('svAcadEdMand').checked,
                allow_comments: document.getElementById('svAcadEdCom').checked
            };
            await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'upsert', payload: payload });
            closeModal();
            toast('🎓 تم حفظ المادة التدريبية وتحديث الأكاديمية فوراً!', false);
            await refreshAndRenderAcademyAdmin();
        } catch (err) { toast(err.message, true); }
    };

    window.svPreviewAcademyLesson = function (lessonId) {
        const l = (LMS_STATE.lessons || []).find(function (x) { return String(x.id) === String(lessonId); });
        if (!l) return;
        const player = window.SAWYAN.API.buildAcademyMediaPlayerHtml(l.media_url, l.media_type);
        openModal(
            '👁️ معاينة: ' + esc((l.title_i18n && l.title_i18n.ar) || l.slug),
            player + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;line-height:1.75;color:#1e293b;white-space:pre-line;">' + esc((l.content_i18n && l.content_i18n.ar) || '') + '</div>',
            '700px'
        );
    };

    window.svReorderAcademyLesson = async function (id, dir) {
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'reorder', payload: { id: id, direction: dir } });
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svToggleAcademyLessonPublish = async function (id) {
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'toggle_publish', payload: { id: id } });
            toast('تم تحديث حالة النشر.', false);
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svDeleteAcademyLesson = async function (id) {
        if (!confirm('حذف هذه المادة التدريبية نهائياً؟')) return;
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'delete', payload: { id: id } });
            toast('تم حذف المادة التدريبية.', false);
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svOpenAcademyTrackModal = function (trackId) {
        const t = trackId ? (LMS_STATE.tracks || []).find(function (x) { return String(x.id) === String(trackId); }) : null;
        openModal(
            t ? '✏️ تعديل المسار التدريبي' : '➕ إضافة مسار تدريبي جديد',
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
                '<div style="display:grid;grid-template-columns:80px 1fr 90px;gap:8px;">' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">الأيقونة</label><input id="svTrkIcon" type="text" value="' + esc((t && t.icon) || '🎓') + '" class="form-control"></div>' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">عنوان المسار بالعربية *</label><input id="svTrkTitleAr" type="text" value="' + esc((t && t.title_i18n && t.title_i18n.ar) || '') + '" class="form-control"></div>' +
                    '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">الترتيب</label><input id="svTrkOrder" type="number" min="1" value="' + esc((t && t.sort_order) || ((LMS_STATE.tracks || []).length + 1)) + '" class="form-control"></div>' +
                '</div>' +
                '<div><label style="display:block;margin-bottom:4px;font-size:0.78rem;font-weight:800;">وصف المسار</label><textarea id="svTrkDescAr" rows="2" class="form-control">' + esc((t && t.description_i18n && t.description_i18n.ar) || '') + '</textarea></div>' +
                '<div style="display:flex;gap:14px;font-size:0.84rem;">' +
                    '<label><input id="svTrkSeq" type="checkbox" ' + (!t || t.is_sequential ? 'checked' : '') + '> تسلسل تدريجي</label>' +
                    '<label><input id="svTrkPub" type="checkbox" ' + (!t || t.is_published ? 'checked' : '') + '> منشور الآن</label>' +
                '</div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
                    '<button type="button" class="btn btn-outline" onclick="closeStage7Modal()">إلغاء</button>' +
                    '<button type="button" class="btn btn-primary" onclick="svSaveAcademyTrack(\'' + esc(t ? t.id : '') + '\',' + (t ? Number(t.version || 1) : 'null') + ')">💾 حفظ المسار</button>' +
                '</div>' +
            '</div>',
            '560px'
        );
    };

    window.svSaveAcademyTrack = async function (trackId, expectedVer) {
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({
                entity: 'track',
                action: 'upsert',
                payload: {
                    id: trackId || null,
                    expected_version: expectedVer,
                    icon: document.getElementById('svTrkIcon').value.trim() || '🎓',
                    title_ar: document.getElementById('svTrkTitleAr').value.trim(),
                    sort_order: Number(document.getElementById('svTrkOrder').value || 1),
                    description_ar: document.getElementById('svTrkDescAr').value.trim(),
                    is_sequential: document.getElementById('svTrkSeq').checked,
                    is_published: document.getElementById('svTrkPub').checked
                }
            });
            closeModal();
            toast('تم حفظ المسار التدريبي بنجاح.', false);
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svToggleAcademyTrackPublish = async function (id) {
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'track', action: 'toggle_publish', payload: { id: id } });
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svDeleteAcademyTrack = async function (id) {
        if (!confirm('حذف هذا المسار الفارغ؟')) return;
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'track', action: 'delete', payload: { id: id } });
            toast('تم حذف المسار.', false);
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svApproveLeaderLesson = async function (id) {
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'approve', payload: { id: id } });
            toast('✅ تم اعتماد ونشر مادة القائد لفريقه!', false);
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    window.svRejectLeaderLesson = async function (id) {
        const reason = prompt('سبب رفض المادة (سيصل للقائد):', 'يرجى مراجعة صياغة العمولات والالتزام بقواعد المنصة');
        if (!reason) return;
        try {
            LMS_STATE = await window.SAWYAN.API.adminManageAcademyLms({ entity: 'lesson', action: 'reject', payload: { id: id, reason: reason } });
            toast('تم رفض المادة وتوثيق السبب.', false);
            renderAcademyAdminShell(document.getElementById('academyAdminPage'));
        } catch (err) { toast(err.message, true); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountSidebarLink);
    } else {
        mountSidebarLink();
    }
})();
