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
        const hdr = document.querySelector('.dashboard-header') || document.querySelector('header') || document.body;
        if (!document.getElementById('svMerchantStage7Btn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'svMerchantStage7Btn';
            btn.style.cssText = 'background:linear-gradient(135deg,#0f172a,#047857);color:#fff;border:none;padding:7px 13px;border-radius:10px;font-family:Tajawal,sans-serif;font-weight:900;font-size:0.82rem;cursor:pointer;margin:4px 8px;';
            btn.innerHTML = '🏢 الفروع والشحن البنكي والمرتجع والدعم';
            btn.onclick = function () { window.openMerchantStage7Modal('branches'); };
            hdr.appendChild(btn);
        }
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
            alert('✅ تمت إضافة الفرع بنجاح!');
            window.openMerchantStage7Modal('branches');
        } catch (err) { alert('❌ ' + err.message); }
    };

    window.svToggleMerchantBranch = async function (bid) {
        const m = curMerchant();
        await window.SAWYAN.API.merchantManageBranchesAndRefunds({ merchantId: m.id, action: 'toggle_branch', payload: { branch_id: bid } });
        window.openMerchantStage7Modal('branches');
    };

    function renderMerchantBankTopup(body) {
        body.innerHTML =
            '<div style="background:#ecfdf5;border:1.5px solid #6ee7b7;border-radius:12px;padding:16px;">' +
                '<h4 style="margin:0 0 8px 0;color:#065f46;">🏦 إرسال إشعار تحويل بنكي لشحن رصيد الشحن المسبق (2101)</h4>' +
                '<p style="font-size:0.82rem;color:#334155;margin:0 0 10px 0;">بعد تحويل مبلغ الشحن لحساب الشركة البنكي الرسمي، أدخل المبلغ ورقم مرجع الإيصال ليقوم المحاسب بمطابقته وشحن رصيدك مع إصدار فاتورة ضريبية B2B تلقائياً.</p>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
                    '<input id="svMerProofAmt" type="number" step="50" placeholder="المبلغ المحوّل بالعملة المحلية" class="form-control">' +
                    '<input id="svMerProofRef" type="text" placeholder="رقم مرجع الحوالة البنكية / InstaPay" class="form-control">' +
                '</div>' +
                '<input id="svMerProofNote" type="text" placeholder="اسم البنك المحوّل منه / ملاحظات إضافية" class="form-control" style="margin-bottom:10px;">' +
                '<button type="button" class="btn btn-primary" onclick="svSubmitMerchantBankProof()">📤 إرسال إشعار التحويل للإدارة المالية</button>' +
            '</div>';
    }

    window.svSubmitMerchantBankProof = async function () {
        const m = curMerchant();
        try {
            await window.SAWYAN.API.merchantManageBranchesAndRefunds({
                merchantId: m.id,
                action: 'submit_bank_topup_proof',
                payload: {
                    amount_local: Number(document.getElementById('svMerProofAmt').value),
                    bank_ref: document.getElementById('svMerProofRef').value.trim(),
                    receipt_note: document.getElementById('svMerProofNote').value.trim()
                }
            });
            alert('✅ تم إرسال إشعار التحويل البنكي للإدارة المالية للمطابقة الفورية!');
        } catch (err) { alert('❌ ' + err.message); }
    };

    function renderMerchantVoluntaryRefund(body) {
        body.innerHTML =
            '<div style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:12px;padding:16px;">' +
                '<h4 style="margin:0 0 8px 0;color:#9a3412;">↩️ مصافحة مرتجع الفاتورة بـ OTP (خلال نافذة الـ 14 يوماً قبل الصرف)</h4>' +
                '<p style="font-size:0.82rem;color:#334155;margin:0 0 10px 0;">⚠️ لا تُسلِّم النقد للعميل قبل تأكيد رمز التحقق (OTP) أو موافقته في التطبيق؛ وبعد الصرف في يوم 15 يتحمل التاجر وحده المرتجع خارج المنصة.</p>' +
                '<input id="svRefTxId" type="text" placeholder="معرّف الفاتورة (Transaction UUID)" class="form-control" style="margin-bottom:8px;">' +
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
                alert(flow.status === 'locked'
                    ? '🔒 تم قفل رمز OTP بعد استنفاد 5 محاولات خاطئة.'
                    : `⚠️ رمز OTP غير صحيح — المحاولات المتبقية: ${flow.attempts_remaining ?? 0}`);
                return;
            }
            alert(mMode === 'request_otp'
                ? '✅ تم إرسال رمز OTP وطلب الموافقة لتطبيق العميل (لا يظهر للتاجر). أدخل الرمز عند تسلمك إياه من العميل.'
                : '✅ تم تأكيد OTP وعكس الفاتورة واسترداد العمولة لرصيد المتجر بنجاح!');
        } catch (err) { alert('❌ ' + err.message); }
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
                contactPhone: m.phone
            });
            alert('✅ تم فتح التذكرة برقم: ' + res.ticket_ref);
            window.openMerchantStage7Modal('support');
        } catch (err) { alert('❌ ' + err.message); }
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
            alert('✅ تم تحديث كلمة مرور المنشأة بنجاح!');
        } catch (err) { alert('❌ ' + err.message); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountMerchantToolsButton);
    } else {
        mountMerchantToolsButton();
    }
})();
