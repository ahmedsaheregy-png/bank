/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — MEMBER & TREE LEADER STAGE 7 OPERATIONAL TOOLS
 * - Gap 9: Smart Referral Link + QR Code + 10-Generation Follow-Up Radar (50%-99%)
 * - Gap 7: KYC Verification Upload + Next-Month Residency Country Move (D7)
 * - Gap 5: Two-Way Live Support Tickets + Self Password Change
 * ============================================================================
 */
(function () {
    'use strict';

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function curMember() {
        return (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedMember()) || null;
    }

    function baseRootUrl() {
        const href = window.location.href;
        const idx = href.indexOf('/member-dashboard/');
        return idx !== -1 ? href.slice(0, idx) : window.location.origin;
    }

    let ACTIVE_TOOL_TAB = 'referral'; // referral | radar | kyc | support
    let RADAR_FILTER = 'near_target_50_99';

    // Zero-Injection Navigation Gate (D29): Stage 7 tools are folded natively inside Screens 4, 10 & 11.
    function mountMemberToolsButton() {
        // No-op: never inject extra #svMemberStage7Btn / #svMemberStage7Nav into header or sidebar-nav.
    }

    window.openMemberStage7Modal = async function (tab) {
        if (tab) ACTIVE_TOOL_TAB = tab;
        const m = curMember();
        if (!m) return;

        let ov = document.getElementById('svMemberStage7Overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'svMemberStage7Overlay';
            ov.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.68);display:flex;align-items:center;justify-content:center;padding:14px;overflow-y:auto;';
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';

        const tabs = [
            ['referral', '🔗 بطاقة الدعوة + QR'],
            ['radar', '🔥 رادار متابعة الـ 10 أجيال'],
            ['kyc', '🪪 توثيق الهوية ونقل الدولة'],
            ['support', '🎫 الدعم الفني وكلمة المرور']
        ];

        ov.innerHTML =
            '<div style="background:#ffffff;border-radius:16px;max-width:820px;width:100%;max-height:92vh;overflow-y:auto;padding:20px;font-family:Tajawal,sans-serif;direction:rtl;box-shadow:0 25px 50px rgba(0,0,0,0.35);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px;">' +
                    '<h3 style="margin:0;font-size:1.08rem;color:#0f172a;">👑 مركز أدوات القائد والعضو (#' + Number(m.member_code) + ' — ' + esc(m.full_name) + ')</h3>' +
                    '<button type="button" onclick="document.getElementById(\'svMemberStage7Overlay\').style.display=\'none\'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:8px;font-size:1.1rem;cursor:pointer;font-weight:900;">✕</button>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
                    tabs.map(function (t) {
                        const act = ACTIVE_TOOL_TAB === t[0];
                        return '<button type="button" onclick="openMemberStage7Modal(\'' + t[0] + '\')" style="padding:8px 13px;border-radius:9px;border:1.5px solid ' + (act ? '#059669' : '#cbd5e1') + ';background:' + (act ? '#059669' : '#fff') + ';color:' + (act ? '#fff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;font-size:0.84rem;">' + t[1] + '</button>';
                    }).join('') +
                '</div>' +
                '<div id="svMemToolBody"><div style="padding:20px;text-align:center;color:#64748b;">جاري التحميل...</div></div>' +
            '</div>';

        const body = document.getElementById('svMemToolBody');
        if (ACTIVE_TOOL_TAB === 'referral') renderMemberReferralCard(body, m);
        else if (ACTIVE_TOOL_TAB === 'radar') await renderLeaderRadarTab(body, m);
        else if (ACTIVE_TOOL_TAB === 'kyc') await renderMemberKycTab(body, m);
        else await renderMemberSupportAndPwdTab(body, m);
    };

    function memToast(msg, type) {
        if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
            window.SAWYAN.UI.toast(msg, type);
        }
    }

    function renderMemberReferralCard(body, m) {
        const cc = m.country_code || 'EG';
        const refUrl = baseRootUrl() + '/member-dashboard/register.html?ref=' + encodeURIComponent(m.member_code) + '&country=' + encodeURIComponent(cc);
        const waUrl = 'https://wa.me/?text=' + encodeURIComponent('انضم إلى فريقي في منظومة الاستهلاك الاستثماري SAWYAN مجاناً (كود الداعي #' + m.member_code + ' معبأ تلقائياً):\n' + refUrl);

        body.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:center;background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:18px;">' +
                '<div>' +
                    '<div style="font-size:1rem;font-weight:900;color:#065f46;margin-bottom:6px;">🔗 رابط الدعوة الذكي الخاص بك</div>' +
                    '<p style="font-size:0.82rem;color:#334155;line-height:1.6;margin:0 0 10px 0;">عند فتح هذا الرابط أو مسح رمز الـ QR، يتعبأ كود عضويتك (<b>#' + Number(m.member_code) + '</b>) ودولتك تلقائياً بلا أي احتمال لخطأ الإدخال اليدوي.</p>' +
                    '<input type="text" readonly value="' + esc(refUrl) + '" class="form-control" style="margin-bottom:10px;font-size:0.8rem;direction:ltr;">' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<button type="button" id="svCopyRefLinkBtn" class="btn btn-primary">📋 نسخ الرابط</button>' +
                        '<a href="' + esc(waUrl) + '" target="_blank" style="background:#16a34a;color:#fff;padding:9px 15px;border-radius:8px;text-decoration:none;font-weight:800;font-size:0.86rem;">💬 مشاركة عبر واتساب</a>' +
                    '</div>' +
                '</div>' +
                '<div style="text-align:center;background:#fff;padding:14px;border-radius:12px;border:1px solid #cbd5e1;display:flex;flex-direction:column;align-items:center;">' +
                    '<div id="svMemLocalRefQrBox" style="width:165px;height:165px;display:flex;align-items:center;justify-content:center;"></div>' +
                    '<div style="font-size:0.78rem;font-weight:800;color:#0f172a;margin-top:6px;">امسح للانضمام تحت #' + Number(m.member_code) + '</div>' +
                '</div>' +
            '</div>';

        const copyBtn = document.getElementById('svCopyRefLinkBtn');
        if (copyBtn) {
            copyBtn.onclick = function () {
                navigator.clipboard?.writeText(refUrl).catch(() => {});
                memToast('تم نسخ رابط الدعوة الذكي!', 'success');
            };
        }
        const qrBox = document.getElementById('svMemLocalRefQrBox');
        if (qrBox && window.QRCode) {
            qrBox.innerHTML = '';
            new window.QRCode(qrBox, { text: refUrl, width: 160, height: 160, colorDark: '#047857', colorLight: '#ffffff' });
        }
    }

    async function renderLeaderRadarTab(body, m) {
        try {
            const res = await window.SAWYAN.API.getLeader10GenFollowupRadar({ memberId: m.id, filterMode: RADAR_FILTER });
            const list = res.team_members || [];
            const filters = [
                ['near_target_50_99', '🔥 اقتربوا من إغلاق الهدف (50%–99%)'],
                ['zero_activity_new', '🆕 لم يجروا أول شراء بعد'],
                ['qualified', '🟢 مؤهلون للشهر'],
                ['all', '👥 كل الأجيال العشرة (2Me–11Me)']
            ];

            body.innerHTML =
                '<div style="margin-bottom:10px;font-size:0.8rem;color:#475569;">يعرض الأجيال العشرة في شبكتك مع نسبة التقدم نحو الهدف الشهري فقط <b>دون كشف أسماء المتاجر أو تفاصيل الفواتير الخاصة</b> صوناً لخصوصية الأعضاء.</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' +
                    filters.map(function (f) {
                        const on = RADAR_FILTER === f[0];
                        return '<button type="button" onclick="svSetLeaderRadarFilter(\'' + f[0] + '\')" style="padding:6px 11px;border-radius:8px;border:1px solid ' + (on ? '#0f766e' : '#cbd5e1') + ';background:' + (on ? '#0f766e' : '#f8fafc') + ';color:' + (on ? '#fff' : '#334155') + ';font-family:Tajawal,sans-serif;font-weight:800;font-size:0.78rem;cursor:pointer;">' + f[1] + '</button>';
                    }).join('') +
                '</div>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>العضو</th><th>الجيل المكاني</th><th>الدولة</th><th>إنجاز الهدف الشهري</th><th>المتبقي للتأهل</th><th>💎 حصة الفرد (1/11)</th><th>متابعة سريعة</th></tr></thead><tbody>' +
                (list.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">لا يوجد أعضاء ضمن هذا الفلتر حالياً</td></tr>' : list.map(function (r) {
                    const wa = 'https://wa.me/' + String(r.phone || '').replace(/\D/g, '');
                    const tgtU = Number(r.monthly_target_usd || 24.75);
                    const shU = r.unit_share_usd !== undefined ? Number(r.unit_share_usd) : (Math.floor(Math.round(tgtU * 100) / 11) / 100);
                    return '<tr>' +
                        '<td data-label="العضو"><b>' + esc(r.full_name) + '</b> (#' + Number(r.member_code) + ')</td>' +
                        '<td data-label="الجيل المكاني"><b>' + Number(r.spatial_me_label) + 'Me</b></td>' +
                        '<td data-label="الدولة">' + esc(r.country_code) + '</td>' +
                        '<td data-label="إنجاز الهدف الشهري"><div style="font-weight:800;color:#059669;">' + Number(r.progress_pct) + '%</div></td>' +
                        '<td data-label="المتبقي للتأهل">$' + Number(r.remaining_to_qualify_usd || 0).toFixed(2) + '</td>' +
                        '<td data-label="💎 حصة الفرد (1/11)"><b style="color:#047857;">$' + shU.toFixed(2) + '</b></td>' +
                        '<td data-label="متابعة سريعة"><a href="' + esc(wa) + '" target="_blank" style="background:#16a34a;color:#fff;padding:4px 9px;border-radius:6px;text-decoration:none;font-size:0.76rem;font-weight:800;">💬 واتساب</a></td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>';
        } catch (err) {
            body.innerHTML = '<div style="color:#991b1b;font-weight:800;">' + esc(err.message) + '</div>';
        }
    }
    window.svSetLeaderRadarFilter = function (f) { RADAR_FILTER = f; window.openMemberStage7Modal('radar'); };

    async function renderMemberKycTab(body, m) {
        const pub = await window.SAWYAN.API.getPublicActiveCountriesAndCities();
        const countries = pub.countries || [];
        body.innerHTML =
            '<div style="display:grid;gap:14px;">' +
                '<div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:14px;">' +
                    '<h4 style="margin:0 0 8px 0;">🪪 ١. رفع توثيق الهوية والإقامة (شرط أول سحب نقدي — D7)</h4>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px;margin-bottom:10px;">' +
                        '<input id="svMemKycName" type="text" value="' + esc(m.full_name || '') + '" placeholder="الاسم القانوني الرباعي المطابق للبنك" class="form-control">' +
                        '<select id="svMemKycType" class="form-control"><option value="national_id">بطاقة رقم قومي / هوية وطنية</option><option value="passport">جواز سفر ساري</option><option value="residency_permit">بطاقة إقامة رسمية</option></select>' +
                        '<input id="svMemKycNum" type="text" placeholder="رقم البطاقة / الجواز" class="form-control">' +
                        '<div id="svMemKycFileUploader"></div>' +
                    '</div>' +
                    '<button type="button" class="btn btn-primary" onclick="svSubmitMemberKyc(\'kyc_verification\')">📤 إرسال مستند الهوية للمراجعة والتوثيق</button>' +
                '</div>' +

                '<div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:14px;">' +
                    '<h4 style="margin:0 0 6px 0;color:#92400e;">✈️ ٢. طلب نقل دولة الإقامة (يسري مطلع الشهر المحاسبي الجديد دون تقسيم شهرك الحالي)</h4>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px;">' +
                        '<select id="svMemMoveCountry" class="form-control">' +
                            (function () {
                                const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
                                const sorted = countries.slice().sort(function (a, b) {
                                    const na = (a.country_name_i18n && a.country_name_i18n.ar) || a.country_code || '';
                                    const nb = (b.country_name_i18n && b.country_name_i18n.ar) || b.country_code || '';
                                    return ls ? ls.compareStrings(na, nb, ls.getDocLang()) : na.localeCompare(nb, 'ar');
                                });
                                return sorted.map(function (c) {
                                    const m = window.SAWYAN && typeof window.SAWYAN.getCountryByCode === 'function' ? window.SAWYAN.getCountryByCode(c.country_code) : null;
                                    const ar = (c.country_name_i18n && c.country_name_i18n.ar) || (m && m.nameAr) || c.country_code;
                                    const en = (c.country_name_i18n && c.country_name_i18n.en) || (m && m.nameEn) || ar;
                                    return '<option value="' + esc(c.country_code) + '" data-name-ar="' + esc(ar) + '" data-name-en="' + esc(en) + '" data-flag="' + esc((m && m.flag) || '') + '">' + esc(((m && m.flag) ? m.flag + ' ' : '') + ar) + '</option>';
                                }).join('');
                            })() +
                        '</select>' +
                        '<input id="svMemMoveDocNum" type="text" placeholder="رقم تأشيرة العمل / الإقامة الجديدة" class="form-control">' +
                        '<div id="svMemMoveFileUploader"></div>' +
                        '<button type="button" class="btn btn-primary" onclick="svSubmitMemberKyc(\'residency_move\')">تقديم طلب النقل</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        if (window.SAWYAN && window.SAWYAN.SmartSearch) {
            const mvSel = document.getElementById('svMemMoveCountry');
            if (mvSel) {
                window.SAWYAN.SmartSearch.attachToSelect(mvSel, {
                    kind: 'country',
                    compact: true,
                    placeholder: 'ابحث عن دولة الإقامة الجديدة (عربي / English)...',
                    showLetterHeaders: true,
                    skipEmptyPlaceholder: true
                });
            }
        }
        if (window.SAWYAN && window.SAWYAN.ImageUpload) {
            window._svMemKycUploaders = {
                kyc: window.SAWYAN.ImageUpload.mountUploader(document.getElementById('svMemKycFileUploader'), {
                    label: '🪪 رفع صورة وثيقة الهوية *',
                    maxDim: 1200,
                    maxChars: 340000
                }),
                move: window.SAWYAN.ImageUpload.mountUploader(document.getElementById('svMemMoveFileUploader'), {
                    label: '✈️ رفع صورة مستند الإقامة (اختياري)',
                    maxDim: 1200,
                    maxChars: 340000
                })
            };
        }
    }

    function readCompressedImage(fileInput) {
        return new Promise(function (resolve) {
            if (!fileInput || !fileInput.files || !fileInput.files[0]) return resolve(null);
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, 700 / Math.max(img.width, img.height));
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.65));
                };
                img.onerror = function () { resolve(null); };
                img.src = e.target.result;
            };
            reader.readAsDataURL(fileInput.files[0]);
        });
    }

    window.svSubmitMemberKyc = async function (kind) {
        const m = curMember();
        try {
            const u = window._svMemKycUploaders || {};
            const imgData = kind === 'residency_move'
                ? ((u.move && u.move.getValue()) || await readCompressedImage(document.getElementById('svMemMoveFile')) || null)
                : ((u.kyc && u.kyc.getValue()) || await readCompressedImage(document.getElementById('svMemKycFile')) || null);
            const docNum = kind === 'residency_move'
                ? document.getElementById('svMemMoveDocNum').value.trim()
                : document.getElementById('svMemKycNum').value.trim();
            await window.SAWYAN.API.submitMemberKycOrResidencyMove({
                memberId: m.id,
                requestKind: kind,
                legalFullName: (document.getElementById('svMemKycName')?.value || m.full_name).trim(),
                documentType: document.getElementById('svMemKycType')?.value || 'national_id',
                documentNumber: docNum,
                documentImageData: imgData,
                targetCountryCode: kind === 'residency_move' ? document.getElementById('svMemMoveCountry').value : null
            });
            memToast('تم رفع الطلب بنجاح إلى قسم التوثيق والمراجعة!', 'success');
            window.openMemberStage7Modal('kyc');
        } catch (err) { memToast(err.message, 'error'); }
    };

    async function renderMemberSupportAndPwdTab(body, m) {
        const tRes = await window.SAWYAN.API.getMySupportTickets({
            actorType: 'member',
            actorId: m.id,
            sessionToken: window.SAWYAN.API.getMemberSessionToken()
        });
        const tickets = tRes.tickets || [];

        body.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:14px;">' +
                '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:14px;">' +
                    '<h4 style="margin:0 0 8px 0;">🎫 فتح تذكرة دعم فني جديدة</h4>' +
                    '<input id="svMemTktSubj" type="text" placeholder="موضوع التذكرة" class="form-control" style="margin-bottom:8px;">' +
                    '<textarea id="svMemTktBody" rows="2" placeholder="اكتب استفسارك أو طلبك..." class="form-control" style="margin-bottom:8px;"></textarea>' +
                    '<button type="button" class="btn btn-primary" onclick="svSendMemberTicket()">إرسال التذكرة للإدارة</button>' +
                '</div>' +
                '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:14px;">' +
                    '<h4 style="margin:0 0 8px 0;">🔑 تغيير كلمة المرور الخاصة بي</h4>' +
                    '<input id="svMemOldPwd" type="password" placeholder="كلمة المرور الحالية" class="form-control" style="margin-bottom:8px;">' +
                    '<input id="svMemNewPwd" type="password" placeholder="كلمة المرور الجديدة (>=8 أحرف)" class="form-control" style="margin-bottom:8px;">' +
                    '<button type="button" class="btn btn-primary" onclick="svChangeMemberOwnPwd()">حفظ كلمة المرور الجديدة</button>' +
                '</div>' +
            '</div>' +
            '<h4 style="margin:0 0 8px 0;">📬 سجل تذاكري وردود الإدارة (' + tickets.length + ')</h4>' +
            (tickets.length === 0 ? '<div style="color:#64748b;font-size:0.84rem;">لا توجد تذاكر سابقة.</div>' : tickets.map(function (t) {
                return '<div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin-bottom:8px;font-size:0.84rem;">' +
                    '<div><b>' + esc(t.ticket_ref) + ' — ' + esc(t.subject) + '</b> <span class="badge">' + esc(t.status) + '</span></div>' +
                    '<div style="color:#334155;margin-top:4px;">' + esc(t.message_body) + '</div>' +
                    (t.admin_reply ? '<div style="margin-top:6px;background:#ecfdf5;color:#065f46;padding:8px;border-radius:8px;"><b>رد الإدارة:</b> ' + esc(t.admin_reply) + '</div>' : '<div style="margin-top:4px;color:#94a3b8;">⏳ بانتظار رد الدعم الفني</div>') +
                '</div>';
            }).join(''));
    }

    window.svSendMemberTicket = async function () {
        const m = curMember();
        try {
            const res = await window.SAWYAN.API.submitSupportOrRecoveryTicket({
                requesterType: 'member',
                requesterId: m.id,
                category: 'member_support',
                subject: document.getElementById('svMemTktSubj').value.trim(),
                message: document.getElementById('svMemTktBody').value.trim(),
                contactName: m.full_name,
                contactPhone: m.phone,
                sessionToken: window.SAWYAN.API.getMemberSessionToken ? window.SAWYAN.API.getMemberSessionToken() : null
            });
            memToast('تم فتح التذكرة بنجاح برقم: ' + res.ticket_ref, 'success');
            window.openMemberStage7Modal('support');
        } catch (err) { memToast(err.message, 'error'); }
    };

    window.svChangeMemberOwnPwd = async function () {
        const m = curMember();
        try {
            await window.SAWYAN.API.changeOwnPassword({
                actorType: 'member',
                actorId: m.id,
                sessionToken: window.SAWYAN.API.getMemberSessionToken(),
                oldPassword: document.getElementById('svMemOldPwd').value,
                newPassword: document.getElementById('svMemNewPwd').value
            });
            memToast('تم تحديث كلمة المرور بنجاح!', 'success');
        } catch (err) { memToast(err.message, 'error'); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountMemberToolsButton);
    } else {
        mountMemberToolsButton();
    }
})();
