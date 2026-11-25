/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — MERCHANT PORTAL STAGE 7 OPERATIONAL TOOLS
 * - Gap 8: Multi-Branch Management & Bank Transfer Top-Up Proof Upload
 * - Gap 10: Voluntary In-Month Invoice Refund (`voluntary_tx_refund`)
 * - Gap 5: Two-Way Support Tickets + Self Password Change
 * ============================================================================
 */
(function () {
    'use strict';

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function curMerchant() {
        return (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedMerchant()) || null;
    }

    let ACTIVE_MER_TAB = 'branches'; // branches | topup | refund | support

    function mountMerchantToolsButton() {
        // Phase 2: Tools are now cleanly integrated inside Settings Tab 5 (`الفروع والمرتجع والدعم`)
        // to eliminate header button bloat and mobile header overflow.
    }

    window.openMerchantStage7Modal = async function (tab) {
        if (tab) ACTIVE_MER_TAB = tab;
        const m = curMerchant();
        if (!m) return;

        let ov = document.getElementById('svMerchantStage7Overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'svMerchantStage7Overlay';
            ov.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.68);display:flex;align-items:center;justify-content:center;padding:14px;overflow-y:auto;';
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';

        const tabs = [
            ['branches', '🏢 إدارة الفروع'],
            ['topup', '🏦 إشعار شحن بنكي'],
            ['refund', '↩️ مرتجع فاتورة للعميل'],
            ['support', '🎫 الدعم الفني وكلمة المرور']
        ];

        ov.innerHTML =
            '<div style="background:#ffffff;border-radius:16px;max-width:780px;width:100%;max-height:92vh;overflow-y:auto;padding:20px;font-family:Tajawal,sans-serif;direction:rtl;box-shadow:0 25px 50px rgba(0,0,0,0.35);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px;">' +
                    '<h3 style="margin:0;font-size:1.05rem;color:#0f172a;">🏪 العمليات المتقدمة للمتجر (' + esc(m.business_name) + ' — ' + esc(m.merchant_code) + ')</h3>' +
                    '<button type="button" onclick="document.getElementById(\'svMerchantStage7Overlay\').style.display=\'none\'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:8px;font-size:1.1rem;cursor:pointer;font-weight:900;">✕</button>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
                    tabs.map(function (t) {
                        const act = ACTIVE_MER_TAB === t[0];
                        return '<button type="button" onclick="openMerchantStage7Modal(\'' + t[0] + '\')" style="padding:8px 13px;border-radius:9px;border:1.5px solid ' + (act ? '#059669' : '#cbd5e1') + ';background:' + (act ? '#059669' : '#fff') + ';color:' + (act ? '#fff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;font-size:0.84rem;">' + t[1] + '</button>';
                    }).join('') +
                '</div>' +
                '<div id="svMerToolBody"><div style="padding:20px;text-align:center;color:#64748b;">جاري التحميل...</div></div>' +
            '</div>';

        const body = document.getElementById('svMerToolBody');
        if (ACTIVE_MER_TAB === 'branches') await renderMerchantBranches(body, m);
        else if (ACTIVE_MER_TAB === 'topup') renderMerchantBankTopup(body, m);
        else if (ACTIVE_MER_TAB === 'refund') renderMerchantVoluntaryRefund(body, m);
        else await renderMerchantSupportAndPwd(body, m);
    };

    async function renderMerchantBranches(body, m) {
        const res = await window.SAWYAN.API.merchantManageBranchesAndRefunds({ merchantId: m.id, action: 'list_branches' });
        const branches = res.branches || [];

        body.innerHTML =
            '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:14px;margin-bottom:14px;">' +
                '<h4 style="margin:0 0 8px 0;">➕ إضافة فرع جديد للمنشأة</h4>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:8px;">' +
                    '<input id="svBrName" type="text" placeholder="اسم الفرع (مثلاً: فرع المعادي)" class="form-control">' +
                    '<input id="svBrAddr" type="text" placeholder="العنوان التفصيلي" class="form-control">' +
                    '<input id="svBrPhone" type="text" placeholder="هاتف الفرع" class="form-control">' +
                    '<input id="svBrMgr" type="text" placeholder="اسم مدير الفرع" class="form-control">' +
                '</div>' +
                '<button type="button" class="btn btn-primary" onclick="svAddMerchantBranch()">إضافة الفرع الآن</button>' +
            '</div>' +
            '<table class="data-table"><thead><tr><th>كود الفرع</th><th>الفرع</th><th>العنوان</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>' +
            (branches.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:16px;">الفرع الرئيسي فقط مسجل حالياً</td></tr>' : branches.map(function (b) {
                return '<tr><td><code>' + esc(b.branch_code) + '</code></td><td><b>' + esc(b.branch_name) + '</b></td><td>' + esc(b.address) + '</td><td>' + (b.is_branch_active ? '🟢 نشط' : '⚪ متوقف') + '</td><td><button type="button" class="btn-sm btn-outline" onclick="svToggleMerchantBranch(\'' + b.id + '\')">تبديل</button></td></tr>';
            }).join('')) +
            '</tbody></table>';
    }

    function merToast(msg, type) {
        if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
            window.SAWYAN.UI.toast(msg, type);
        }
    }

    window.svAddMerchantBranch = async function () {
        const m = curMerchant();
        try {
            await window.SAWYAN.API.merchantManageBranchesAndRefunds({
                merchantId: m.id,
                action: 'add_branch',
                payload: {
                    branch_name: document.getElementById('svBrName').value.trim(),
                    address: document.getElementById('svBrAddr').value.trim(),
                    branch_phone: document.getElementById('svBrPhone').value.trim(),
                    branch_manager_name: document.getElementById('svBrMgr').value.trim()
                }
            });
            merToast('تمت إضافة الفرع بنجاح!', 'success');
            window.openMerchantStage7Modal('branches');
        } catch (err) { merToast(err.message, 'error'); }
    };

    window.svToggleMerchantBranch = async function (bid) {
        const m = curMerchant();
        await window.SAWYAN.API.merchantManageBranchesAndRefunds({ merchantId: m.id, action: 'toggle_branch', payload: { branch_id: bid } });
        window.openMerchantStage7Modal('branches');
    };

    function renderMerchantBankTopup(body, m) {
        if (typeof window.openMerchantTopupModal === 'function') {
            const ov = document.getElementById('svMerchantStage7Overlay');
            if (ov) ov.style.display = 'none';
            window.openMerchantTopupModal();
            return;
        }
        window._svMerBankProofUrl = null;
        const curr = m?.currency_code || '';
        const cc = m?.country_code || '';
        const waText = encodeURIComponent('مرحباً فريق مالية SAWYAN، أحتاج بيانات الحساب البنكي لشحن رصيد متجر: ' + (m?.business_name || '') + ' (' + (m?.merchant_code || '') + ') ' + curr);
        body.innerHTML =
            '<div style="background:#ecfdf5;border:1.5px solid #6ee7b7;border-radius:12px;padding:16px;">' +
                '<h4 style="margin:0 0 8px 0;color:#065f46;">🏦 إرسال إشعار تحويل بنكي لشحن رصيد المتجر</h4>' +
                '<p style="font-size:0.82rem;color:#334155;margin:0 0 10px 0;">بعد تحويل مبلغ الشحن لحساب الشركة البنكي الرسمي (' + esc(cc) + ' ' + esc(curr) + ')، أدخل المبلغ ورقم مرجع الإيصال وأرفق صورة الإيصال ليقوم المحاسب بمطابقته وشحن رصيدك.</p>' +
                '<div style="margin-bottom:10px;"><a href="https://wa.me/905376744337?text=' + waText + '" target="_blank" rel="noopener" style="display:inline-block;background:#16a34a;color:#fff;padding:7px 13px;border-radius:8px;text-decoration:none;font-weight:800;font-size:0.82rem;">💬 اطلب بيانات الحساب البنكي عبر واتساب (905376744337+)</a></div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:8px;margin-bottom:10px;">' +
                    '<input id="svMerProofAmt" type="number" step="any" min="0.01" inputmode="decimal" placeholder="المبلغ المحوّل بالعملة المحلية" class="form-control" dir="ltr">' +
                    '<input id="svMerProofRef" type="text" value="" placeholder="رقم مرجع الحوالة البنكية" class="form-control" dir="ltr">' +
                '</div>' +
                '<input id="svMerProofNote" type="text" placeholder="اسم البنك المحوّل منه / ملاحظات إضافية" class="form-control" style="margin-bottom:10px;">' +
                '<div id="svMerBankProofUploader" style="margin-bottom:10px;"></div>' +
                '<button type="button" class="btn btn-primary" onclick="svSubmitMerchantBankProof()">📤 إرسال إشعار التحويل للإدارة المالية</button>' +
            '</div>';
        if (window.SAWYAN && window.SAWYAN.ImageUpload) {
            window.SAWYAN.ImageUpload.mountUploader(document.getElementById('svMerBankProofUploader'), {
                label: '🧾 رفع صورة إيصال التحويل البنكي (اختياري وموصى به)',
                maxDim: 1280,
                maxChars: 360000,
                onChange: function (v) { window._svMerBankProofUrl = v || null; }
            });
        }
    }

    window.svSubmitMerchantBankProof = async function () {
        const m = curMerchant();
        try {
            await window.SAWYAN.API.merchantInitiateTopup({
                merchantId: m.id,
                amount: Number(document.getElementById('svMerProofAmt').value),
                provider: 'bank_transfer',
                paymentRef: document.getElementById('svMerProofRef').value.trim() || null,
                receiptImageData: window._svMerBankProofUrl || null,
                receiptNote: document.getElementById('svMerProofNote').value.trim() || null
            });
            window._svMerBankProofUrl = null;
            merToast('تم إرسال طلب الشحن وإشعار التحويل للإدارة المالية بنجاح!', 'success');
            window.openMerchantStage7Modal('topup');
        } catch (err) { merToast(err.message, 'error'); }
    };

    function renderMerchantVoluntaryRefund(body) {
        const recentCompleted = ((window.__merchantBundleCache && window.__merchantBundleCache.completed_transactions) || [])
            .filter(function (t) { return t && t.status === 'completed'; })
            .slice(0, 30);
        const optionsHtml = recentCompleted.length > 0
            ? '<option value="">-- اختر الفاتورة من عملياتك المكتملة --</option>' + recentCompleted.map(function (t) {
                return '<option value="' + esc(t.id) + '">' + esc(t.sw_short_code) + ' — ' + esc(t.member_masked_name || 'عميل') + ' (' + Number(t.total_amount || 0).toFixed(2) + ' ' + esc(t.currency_code || '') + ')</option>';
            }).join('')
            : '<option value="">لا توجد فواتير مكتملة قابلة للمرتجع حالياً</option>';

        body.innerHTML =
            '<div style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:12px;padding:16px;">' +
                '<h4 style="margin:0 0 8px 0;color:#9a3412;">↩️ مصافحة مرتجع الفاتورة بـ OTP (قبل يوم الصرف 15)</h4>' +
                '<p style="font-size:0.82rem;color:#334155;margin:0 0 10px 0;">⚠️ لا تُسلِّم النقد للعميل قبل تأكيد رمز التحقق (OTP) أو موافقته في التطبيق؛ وبعد الصرف في يوم 15 يتحمل التاجر وحده المرتجع خارج المنصة.</p>' +
                '<label style="display:block;font-weight:800;font-size:0.82rem;margin-bottom:4px;">اختر الفاتورة المطلوب استرجاعها:</label>' +
                '<select id="svRefTxSelect" class="form-control" style="margin-bottom:8px;" onchange="var v=this.value;var inp=document.getElementById(\'svRefTxId\');if(inp&&v)inp.value=v;">' + optionsHtml + '</select>' +
                '<input id="svRefTxId" type="hidden" value="' + (recentCompleted[0] ? '' : '') + '">' +
                '<input id="svRefReason" type="text" value="مرتجع بضاعة طوعي بطلب العميل" class="form-control" style="margin-bottom:8px;">' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
                    '<button type="button" class="btn btn-primary" onclick="svExecMerchantVoluntaryRefund(\'request_otp\')">١. إرسال OTP للعميل</button>' +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px dashed #fdba74;padding-top:10px;">' +
                    '<input id="svRefOtpCode" type="text" maxlength="6" placeholder="رمز OTP من العميل (6 أرقام)" class="form-control" style="max-width:220px;">' +
                    '<button type="button" class="btn btn-outline" onclick="svExecMerchantVoluntaryRefund(\'confirm_otp\')">٢. تأكيد OTP وإلغاء الفاتورة</button>' +
                '</div>' +
            '</div>';
    }

    window.svExecMerchantVoluntaryRefund = async function (mode) {
        const m = curMerchant();
        const mMode = mode || 'request_otp';
        try {
            const res = await window.SAWYAN.API.merchantManageBranchesAndRefunds({
                merchantId: m.id,
                action: 'voluntary_tx_refund',
                payload: {
                    transaction_id: document.getElementById('svRefTxId').value.trim(),
                    reason: document.getElementById('svRefReason').value.trim(),
                    mode: mMode,
                    otp_code: mMode === 'confirm_otp' ? (document.getElementById('svRefOtpCode')?.value || '').trim() : null
                }
            });
            const flow = res && res.return_flow ? res.return_flow : res;
            if (flow && flow.ok === false) {
                merToast(flow.status === 'locked'
                    ? 'تم قفل رمز التحقق OTP بعد استنفاد 5 محاولات خاطئة.'
                    : `رمز التحقق غير صحيح — المحاولات المتبقية: ${flow.attempts_remaining ?? 0}`, 'error');
                return;
            }
            merToast(mMode === 'request_otp'
                ? 'تم إرسال رمز التحقق للعميل بنجاح؛ أدخل الرمز عند استلامه.'
                : 'تم تأكيد المرتجع وعكس الفاتورة واسترداد العمولة لرصيد المتجر بنجاح!', 'success');
        } catch (err) { merToast(err.message, 'error'); }
    };

    async function renderMerchantSupportAndPwd(body, m) {
        const tRes = await window.SAWYAN.API.getMySupportTickets({
            actorType: 'merchant',
            actorId: m.id,
            sessionToken: window.SAWYAN.API.getMerchantSessionToken()
        });
        const tickets = tRes.tickets || [];

        body.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:14px;">' +
                '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:14px;">' +
                    '<h4 style="margin:0 0 8px 0;">🎫 فتح تذكرة دعم لعلاقات التجار</h4>' +
                    '<input id="svMerTktSubj" type="text" placeholder="موضوع الطلب" class="form-control" style="margin-bottom:8px;">' +
                    '<textarea id="svMerTktBody" rows="2" placeholder="تفاصيل الطلب..." class="form-control" style="margin-bottom:8px;"></textarea>' +
                    '<button type="button" class="btn btn-primary" onclick="svSendMerchantTicket()">إرسال التذكرة</button>' +
                '</div>' +
                '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:14px;">' +
                    '<h4 style="margin:0 0 8px 0;">🔑 تغيير كلمة مرور المنشأة</h4>' +
                    '<input id="svMerOldPwd" type="password" placeholder="كلمة المرور الحالية" class="form-control" style="margin-bottom:8px;">' +
                    '<input id="svMerNewPwd" type="password" placeholder="كلمة المرور الجديدة (>=8 أحرف)" class="form-control" style="margin-bottom:8px;">' +
                    '<button type="button" class="btn btn-primary" onclick="svChangeMerchantOwnPwd()">حفظ كلمة المرور</button>' +
                '</div>' +
            '</div>' +
            '<h4 style="margin:0 0 8px 0;">📬 تذاكر المنشأة وردود الإدارة (' + tickets.length + ')</h4>' +
            (tickets.length === 0 ? '<div style="color:#64748b;font-size:0.84rem;">لا توجد تذاكر مسجلة.</div>' : tickets.map(function (t) {
                return '<div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin-bottom:8px;font-size:0.84rem;">' +
                    '<div><b>' + esc(t.ticket_ref) + ' — ' + esc(t.subject) + '</b> <span class="badge">' + esc(t.status) + '</span></div>' +
                    '<div style="margin-top:4px;">' + esc(t.message_body) + '</div>' +
                    (t.admin_reply ? '<div style="margin-top:6px;background:#ecfdf5;color:#065f46;padding:8px;border-radius:8px;"><b>رد الإدارة:</b> ' + esc(t.admin_reply) + '</div>' : '') +
                '</div>';
            }).join(''));
    }

    window.svSendMerchantTicket = async function () {
        const m = curMerchant();
        try {
            const res = await window.SAWYAN.API.submitSupportOrRecoveryTicket({
                requesterType: 'merchant',
                requesterId: m.id,
                category: 'merchant_support',
                subject: document.getElementById('svMerTktSubj').value.trim(),
                message: document.getElementById('svMerTktBody').value.trim(),
                contactName: m.business_name,
                contactPhone: m.phone,
                sessionToken: window.SAWYAN.API.getMerchantSessionToken ? window.SAWYAN.API.getMerchantSessionToken() : null
            });
            merToast('تم فتح التذكرة بنجاح برقم: ' + res.ticket_ref, 'success');
            window.openMerchantStage7Modal('support');
        } catch (err) { merToast(err.message, 'error'); }
    };

    window.svChangeMerchantOwnPwd = async function () {
        const m = curMerchant();
        try {
            await window.SAWYAN.API.changeOwnPassword({
                actorType: 'merchant',
                actorId: m.id,
                sessionToken: window.SAWYAN.API.getMerchantSessionToken(),
                oldPassword: document.getElementById('svMerOldPwd').value,
                newPassword: document.getElementById('svMerNewPwd').value
            });
            merToast('تم تحديث كلمة مرور المنشأة بنجاح!', 'success');
        } catch (err) { merToast(err.message, 'error'); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountMerchantToolsButton);
    } else {
        mountMerchantToolsButton();
    }
})();
