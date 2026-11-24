/**
 * ============================================================================
 * SAWYAN V3.0 — Isolated Employee Personal-Phone Verification Screen (Stage 14)
 * - Zero owner financials / balances / commissions / settings exposure
 * - Forced first-login & post-reset private PIN change (owner never knows final PIN)
 * - Branch-scoped live incoming queue + chime & Web Notifications
 * - Create Verification flow (for customer without internet/battery)
 * - Smart shift session (admin-configurable hours & idle lock) + 1-tap Quick Lock
 * ============================================================================
 */
(function () {
    'use strict';

    let empState = null;
    let empBundle = null;
    let activeTab = 'pending';
    let pollTimer = null;
    let knownPendingIds = new Set();
    let initialLoadDone = false;
    let alertsEnabled = false;
    let resolvedMember = null;
    let lookupDebounce = null;
    let empReceiptUploader = null;
    let empPendingSearchQuery = '';
    const empBusyTxIds = new Set();
    let empQrScannerInstance = null;

    const PAY_TYPE_LABELS = {
        cash: '💵 نقدي (كاش)',
        pos_card: '💳 بطاقة بنكية',
        instant_transfer: '⚡ تحويل لحظي (إنستاباي/سريع)',
        iban_swift_sepa: '🏦 تحويل بنكي',
        digital_wallet: '📱 محفظة رقمية',
        payment_gateway: '🌐 بوابة دفع إلكترونية',
        bnpl: '📆 تقسيط (BNPL)',
        cheque: '📝 شيك بنكي',
        cod: '🚚 دفع عند الاستلام (دليفري)',
        marketplace_escrow: '🛒 متجر إلكتروني'
    };

    function esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeDigits(str) {
        return String(str || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
    }

    function fmtMoney(val, curr) {
        const n = Number(val || 0);
        return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(curr || 'EGP')}`;
    }

    function notify(msg, type = 'info') {
        if (window.SAWYAN?.UI?.toast) {
            window.SAWYAN.UI.toast(msg, type);
        }
    }

    function humanErr(err) {
        if (window.SAWYAN?.UI?.humanizeError) return window.SAWYAN.UI.humanizeError(err);
        return String(err?.message || err || 'حدث خطأ غير متوقع');
    }

    function playChime() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const now = ctx.currentTime;
            [880, 1174.66].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.14);
                gain.gain.setValueAtTime(0.18, now + idx * 0.14);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.25);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.14);
                osc.stop(now + idx * 0.14 + 0.26);
            });
        } catch (_e) {}
    }

    function sendBrowserNotification(tx) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            const n = new Notification(`🧾 طلب توثيق جديد — ${tx.sw_short_code}`, {
                body: `${tx.member_masked_name} • ${fmtMoney(tx.total_amount, tx.currency_code)}`,
                icon: '../shared/assets/sawyan-icon.svg',
                tag: 'sawyan-tx-' + tx.id
            });
            n.onclick = () => {
                window.focus();
                switchEmpTab('pending');
                n.close();
            };
        } catch (_e) {}
    }

    function handleSessionTermination(err) {
        const msg = String(err?.message || err || '');
        let reason = null;
        if (msg.includes('EMPLOYEE_SESSION_IDLE_LOCKED')) reason = 'idle';
        else if (msg.includes('EMPLOYEE_SESSION_EXPIRED')) reason = 'expired';
        else if (msg.includes('EMPLOYEE_ACCOUNT_INACTIVE') || msg.includes('UNAUTHORIZED_EMPLOYEE_SESSION')) reason = 'revoked';
        else if (msg.includes('EMPLOYEE_PIN_CHANGE_REQUIRED')) {
            showForcePinGate();
            return true;
        }
        if (reason) {
            if (pollTimer) clearInterval(pollTimer);
            const storeCode = empState?.merchant_code || '';
            window.SAWYAN?.API?.clearEmployeeSession();
            window.location.href = `login.html?tab=employee&reason=${reason}${storeCode ? '&store=' + encodeURIComponent(storeCode) : ''}`;
            return true;
        }
        return false;
    }

    function updateHeader() {
        const info = empBundle?.employee || empState || {};
        const nameEl = document.getElementById('empStoreName');
        const metaEl = document.getElementById('empMetaLine');
        if (nameEl) nameEl.textContent = info.business_name || 'شاشة التوثيق';
        if (metaEl) {
            metaEl.textContent = `👨‍💼 ${info.full_name || ''} (${info.employee_code || ''}) • 📍 ${info.branch_name || 'الفرع الرئيسي'}`;
        }
        const meta = empBundle?.session_meta;
        const timerEl = document.getElementById('empSessionTimerInfo');
        if (timerEl && meta) {
            const pollS = meta.live_poll_interval_secs || 8;
            const idleM = meta.idle_timeout_mins || 60;
            const shiftH = meta.shift_hours || 8;
            timerEl.textContent = `⏱️ وردية ${shiftH}س • قفل خمول ${idleM}د • تحديث كل ${pollS}ث`;
        }
    }

    function showForcePinGate() {
        if (pollTimer) clearInterval(pollTimer);
        document.getElementById('empWorkspace').style.display = 'none';
        document.getElementById('empForcePinGate').style.display = 'block';
    }

    function showWorkspace() {
        document.getElementById('empForcePinGate').style.display = 'none';
        document.getElementById('empWorkspace').style.display = 'block';
    }

    async function refreshEmployeePushButtonState() {
        const btn = document.getElementById('empAlertToggleBtn');
        const instBtn = document.getElementById('empInstallAppBtn');
        if (instBtn && window.SAWYAN?.Push) {
            instBtn.style.display = window.SAWYAN.Push.canInstallApp() ? 'inline-block' : 'none';
        }
        if (!btn || !window.SAWYAN?.Push) return;
        const st = await window.SAWYAN.Push.getStatus();
        if (st.subscribed) {
            alertsEnabled = true;
            btn.classList.add('active-sound');
            btn.textContent = '🔊 إشعارات القفل مفعّلة';
        } else {
            btn.classList.remove('active-sound');
            btn.textContent = '🔔 تفعيل إشعارات شاشة القفل';
        }
    }

    window.installEmployeePwaApp = async function () {
        if (!window.SAWYAN?.Push) return;
        const res = await window.SAWYAN.Push.promptInstallApp();
        if (res && res.installed) {
            notify('🎉 تم تثبيت تطبيق SAWYAN على الشاشة الرئيسية بنجاح!', 'success');
        }
        refreshEmployeePushButtonState();
    };

    window.toggleEmployeeAlerts = async function () {
        const btn = document.getElementById('empAlertToggleBtn');
        if (!window.SAWYAN?.Push || !empState?.id) {
            alertsEnabled = !alertsEnabled;
            if (alertsEnabled) playChime();
            notify(alertsEnabled ? 'تم تفعيل الصوت داخل الصفحة.' : 'تم كتم الصوت.', 'info');
            return;
        }
        const st = await window.SAWYAN.Push.getStatus();
        if (st.subscribed) {
            await window.SAWYAN.Push.disablePush({ actorType: 'employee', actorId: empState.id });
            alertsEnabled = false;
            await refreshEmployeePushButtonState();
            notify('تم إيقاف إشعارات شاشة القفل لهذا الهاتف.', 'info');
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التفعيل...'; }
        try {
            playChime();
            await window.SAWYAN.Push.enablePush({
                actorType: 'employee',
                actorId: empState.id,
                sendWelcomeTest: true
            });
            alertsEnabled = true;
            notify('✅ تم تفعيل إشعارات شاشة القفل بالصوت! أرسلنا لك إشعاراً تجريبياً الآن.', 'success');
        } catch (err) {
            notify(humanErr(err), 'warning');
        } finally {
            if (btn) btn.disabled = false;
            await refreshEmployeePushButtonState();
        }
    };

    window.openEmpTempScreenLock = function () {
        const ov = document.getElementById('empTempLockOverlay');
        if (ov) ov.style.display = 'flex';
    };

    window.unlockEmpTempScreen = function () {
        const ov = document.getElementById('empTempLockOverlay');
        if (ov) ov.style.display = 'none';
    };

    window.endEmployeeShiftWithConfirm = async function () {
        const ok = (window.SAWYAN?.UI?.confirm)
            ? await window.SAWYAN.UI.confirm({
                title: '🚪 تأكيد إنهاء الوردية والخروج',
                message: 'هل تريد إنهاء ورديتك الآن وإيقاف إشعارات هذا الجهاز حتى دخولك القادم؟ (للقفل السريع المؤقت دون إنهاء الوردية استخدم «قفل مؤقت»).',
                confirmText: 'نعم، أنهِ الوردية',
                cancelText: 'تراجع',
                tone: 'danger'
            })
            : true;
        if (!ok) return;
        await window.quickLockEmployeeSession();
    };

    window.quickLockEmployeeSession = async function () {
        if (pollTimer) clearInterval(pollTimer);
        const storeCode = empState?.merchant_code || '';
        try {
            if (empState?.id && window.SAWYAN?.Push) {
                await window.SAWYAN.Push.disablePush({ actorType: 'employee', actorId: empState.id });
            }
        } catch (_e) {}
        try {
            if (empState?.id) {
                await window.SAWYAN.API.employeeLockSession({ employeeId: empState.id });
            }
        } catch (_e) {}
        window.SAWYAN.API.clearEmployeeSession();
        window.location.href = `login.html?tab=employee&reason=locked${storeCode ? '&store=' + encodeURIComponent(storeCode) : ''}`;
    };

    window.openChangeMyPinModal = async function () {
        const cur = await window.SAWYAN.UI.prompt({
            title: '🔑 تغيير رمز PIN الخاص بك',
            message: 'أدخل رمز PIN الحالي (4 أرقام):',
            placeholder: '••••',
            inputType: 'password'
        });
        if (cur === null) return;
        const nxt = await window.SAWYAN.UI.prompt({
            title: '🔑 رمز PIN الجديد',
            message: 'اختر رمز PIN جديداً من 4 أرقام (مختلف عن الحالي):',
            placeholder: '••••',
            inputType: 'password'
        });
        if (nxt === null) return;
        const cClean = normalizeDigits(cur);
        const nClean = normalizeDigits(nxt);
        if (!/^\d{4}$/.test(cClean) || !/^\d{4}$/.test(nClean)) {
            notify('يجب أن يتكون رمز PIN من 4 أرقام فقط.', 'error');
            return;
        }
        try {
            await window.SAWYAN.API.employeeChangePin({
                employeeId: empState.id,
                currentPin: cClean,
                newPin: nClean
            });
            notify('تم تحديث رمز PIN السري الخاص بك بنجاح.', 'success');
        } catch (err) {
            if (!handleSessionTermination(err)) notify(humanErr(err), 'error');
        }
    };

    window.switchEmpTab = function (tab) {
        activeTab = tab;
        ['pending', 'create', 'today'].forEach(t => {
            const btn = document.getElementById('empTab' + t.charAt(0).toUpperCase() + t.slice(1));
            const panel = document.getElementById('emp' + t.charAt(0).toUpperCase() + t.slice(1) + 'Panel');
            if (btn) btn.classList.toggle('active', t === tab);
            if (panel) panel.style.display = t === tab ? 'block' : 'none';
        });
        if (tab === 'create') renderCreatePanel();
        if (tab === 'pending') renderPendingPanel();
        if (tab === 'today') renderTodayPanel();
    };

    function renderPendingPanel() {
        const panel = document.getElementById('empPendingPanel');
        if (!panel) return;
        const list = empBundle?.pending_transactions || [];
        const info = empBundle?.employee || empState || {};
        const canReject = info.can_reject_pending_manually !== false;
        const badge = document.getElementById('empPendingCountBadge');
        if (badge) {
            badge.textContent = String(list.length);
            badge.style.display = list.length > 0 ? 'inline-block' : 'none';
        }

        if (!document.getElementById('empPendingSearchBar')) {
            panel.innerHTML = `
                <div id="empPendingSearchBar" style="margin-bottom:12px;">
                    <input type="search" id="empPendingSearchInput" class="emp-input" style="padding:9px 12px;font-size:0.88rem;" placeholder="🔍 ابحث برقم الفاتورة (SW-XXXX) أو اسم العميل أو المبلغ..." value="${esc(empPendingSearchQuery)}">
                </div>
                <div id="empPendingListSlot"></div>
            `;
            document.getElementById('empPendingSearchInput')?.addEventListener('input', (e) => {
                empPendingSearchQuery = String(e.target.value || '').trim().toLowerCase();
                renderPendingCardsOnly();
            });
        }
        renderPendingCardsOnly();
    }

    function renderPendingCardsOnly() {
        const slot = document.getElementById('empPendingListSlot');
        if (!slot) return;
        const rawList = empBundle?.pending_transactions || [];
        const info = empBundle?.employee || empState || {};
        const canReject = info.can_reject_pending_manually !== false;
        const list = !empPendingSearchQuery ? rawList : rawList.filter(tx =>
            `${tx.sw_short_code || ''} ${tx.member_masked_name || ''} ${tx.total_amount || ''}`.toLowerCase().includes(empPendingSearchQuery)
        );

        if (rawList.length === 0) {
            slot.innerHTML = `
                <div class="emp-empty">
                    <div style="font-size:2.6rem;margin-bottom:8px;">✅</div>
                    <div style="font-weight:900;font-size:1.02rem;color:#0f172a;">لا توجد طلبات توثيق معلّقة لفرعك حالياً</div>
                    <div style="font-size:0.82rem;margin-top:6px;">سيظهر أي طلب جديد هنا تلقائياً فور إرساله من العميل.</div>
                    <button type="button" onclick="refreshEmployeeBundle(false)" class="emp-btn-approve" style="margin-top:14px;max-width:220px;">🔄 تحديث الآن</button>
                </div>
            `;
            return;
        }
        if (list.length === 0) {
            slot.innerHTML = '<div class="emp-empty">🔍 لا توجد فواتير معلّقة مطابقة للبحث.</div>';
            return;
        }

        slot.innerHTML = list.map(tx => {
            const payLbl = PAY_TYPE_LABELS[tx.payment_type] || tx.payment_type;
            const hasThumb = tx.receipt_media_url && window.SAWYAN?.ImageUpload?.renderThumbHtml;
            const busy = empBusyTxIds.has(tx.id);
            return `
                <div class="emp-card">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                        <div>
                            <div style="font-weight:900;font-size:1rem;color:#0f172a;">👤 ${esc(tx.member_masked_name)}</div>
                            <div style="font-size:0.76rem;color:#64748b;margin-top:2px;">⏱️ ${new Date(tx.created_at).toLocaleString('ar-EG')}</div>
                        </div>
                        <span class="emp-short-code" dir="ltr">${esc(tx.sw_short_code)}</span>
                    </div>

                    <div class="emp-amount-box">
                        <div>
                            <div style="font-size:0.74rem;color:#64748b;font-weight:700;">قيمة الفاتورة</div>
                            <div class="emp-amount-val">${fmtMoney(tx.total_amount, tx.currency_code)}</div>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                            <span style="background:#e2e8f0;color:#1e293b;padding:3px 9px;border-radius:7px;font-size:0.76rem;font-weight:800;">${esc(payLbl)}</span>
                            ${tx.zero_hold_in_isolation ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;">🟠 طلب فوري بدون حجز مؤقت</span>' : ''}
                            ${tx.unique_payment_ref ? `<span style="font-size:0.72rem;color:#475569;">مرجع: <code dir="ltr">${esc(tx.unique_payment_ref)}</code></span>` : ''}
                        </div>
                    </div>

                    ${hasThumb ? `<div style="margin-bottom:12px;">${window.SAWYAN.ImageUpload.renderThumbHtml(tx.receipt_media_url, '🧾 إيصال ' + esc(tx.sw_short_code))}</div>` : ''}

                    <div class="emp-actions-row">
                        <button type="button" class="emp-btn-approve" ${busy ? 'disabled' : ''} onclick="empDecideTx('${esc(tx.id)}', 'approve', ${Number(tx.total_amount || 0)})">${busy ? '⏳ جاري التنفيذ...' : '✅ اعتماد التوثيق'}</button>
                        ${canReject
                            ? `<button type="button" class="emp-btn-reject" ${busy ? 'disabled' : ''} onclick="empDecideTx('${esc(tx.id)}', 'reject', ${Number(tx.total_amount || 0)})">❌ رفض</button>`
                            : `<span style="background:#fff7ed;color:#9a3412;border:1px solid #fdba74;padding:8px 10px;border-radius:8px;font-size:0.75rem;font-weight:800;">🔒 الرفض اليدوي موقوف</span>`}
                    </div>
                </div>
            `;
        }).join('');
    }

    window.empDecideTx = async function (txId, decision, amount) {
        if (empBusyTxIds.has(txId)) return;
        let reason = null;
        if (decision === 'reject') {
            reason = await window.SAWYAN.UI.prompt({
                title: '❌ سبب رفض التوثيق',
                message: 'اذكر سبب الرفض بوضوح (سيصل إشعار للمالك أيضاً لمراجعة الرفض):',
                defaultValue: 'المبلغ أو البيانات غير مطابقة',
                placeholder: 'مثال: العميل لم يشترِ بهذا المبلغ'
            });
            if (reason === null) return;
        }

        let reconfirmPin = null;
        const threshold = Number(empBundle?.session_meta?.pin_reconfirm_threshold_local || 0);
        if (decision === 'approve' && threshold > 0 && Number(amount || 0) >= threshold) {
            const p = await window.SAWYAN.UI.prompt({
                title: '🔐 تأكيد PIN لفاتورة كبيرة',
                message: `أدخل رمز PIN الخاص بك (4 أرقام) لتأكيد اعتماد هذه الفاتورة:`,
                placeholder: '••••',
                inputType: 'password'
            });
            if (p === null) return;
            reconfirmPin = normalizeDigits(p);
        }

        empBusyTxIds.add(txId);
        renderPendingCardsOnly();
        try {
            const res = await window.SAWYAN.API.employeeDecidePendingTx({
                employeeId: empState.id,
                transactionId: txId,
                decision,
                rejectionReason: reason,
                reconfirmPin
            });
            if (res && res.success === false && res.error_code === 'EMPLOYEE_PIN_RECONFIRM_REQUIRED') {
                const p2 = await window.SAWYAN.UI.prompt({
                    title: '🔐 تأكيد PIN مطلوب',
                    message: 'أدخل رمز PIN الخاص بك (4 أرقام) لتأكيد هذه الفاتورة:',
                    placeholder: '••••',
                    inputType: 'password'
                });
                if (p2 === null) return;
                const retry = await window.SAWYAN.API.employeeDecidePendingTx({
                    employeeId: empState.id,
                    transactionId: txId,
                    decision,
                    rejectionReason: reason,
                    reconfirmPin: normalizeDigits(p2)
                });
                if (!retry || retry.success === false) {
                    notify(humanErr(retry?.error_code || 'تعذر الاعتماد'), 'error');
                    return;
                }
                notify('✅ تم اعتماد التوثيق بنجاح!', 'success');
                await refreshEmployeeBundle(true);
                return;
            }
            if (res && res.success === false) {
                notify(humanErr(res.error_code), 'error');
                return;
            }
            if (decision === 'approve') {
                notify(res?.status === 'awaiting_merchant_topup'
                    ? 'تم حفظ التوثيق وبانتظار استكمال رصيد المتجر.'
                    : `✅ تم اعتماد الفاتورة (${res?.sw_short_code || ''}) بنجاح!`, 'success');
            } else {
                notify('تم رفض الطلب وإخطار العميل وإدارة المتجر.', 'info');
            }
            await refreshEmployeeBundle(true);
        } catch (err) {
            if (!handleSessionTermination(err)) {
                notify(humanErr(err), 'error');
                await refreshEmployeeBundle(true);
            }
        } finally {
            empBusyTxIds.delete(txId);
            renderPendingCardsOnly();
        }
    };

    window.openEmpCameraQrScanner = async function () {
        const modal = document.getElementById('empQrScannerModal');
        const statusEl = document.getElementById('empQrReaderStatus');
        if (!modal) return;
        modal.style.display = 'flex';
        if (typeof Html5Qrcode === 'undefined') {
            if (statusEl) statusEl.textContent = '⚠️ مكتبة الكاميرا غير متاحة — أدخل كود العضو يدوياً.';
            return;
        }
        try {
            if (empQrScannerInstance) {
                try { await empQrScannerInstance.stop(); } catch (_e) {}
            }
            empQrScannerInstance = new Html5Qrcode('empQrReaderHost');
            await empQrScannerInstance.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                (decodedText) => {
                    closeEmpCameraQrScanner();
                    const inp = document.getElementById('empCreateMemberInput');
                    if (inp) {
                        inp.value = String(decodedText || '').trim();
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    notify('📷 تم مسح كود العضو بنجاح!', 'success');
                },
                () => {}
            );
        } catch (_err) {
            if (statusEl) statusEl.textContent = '⚠️ تعذر فتح الكاميرا — تأكد من منح صلاحية الكاميرا أو أدخل كود العضو يدوياً.';
        }
    };

    window.closeEmpCameraQrScanner = async function () {
        const modal = document.getElementById('empQrScannerModal');
        if (modal) modal.style.display = 'none';
        if (empQrScannerInstance) {
            try { await empQrScannerInstance.stop(); } catch (_e) {}
            try { empQrScannerInstance.clear(); } catch (_e) {}
            empQrScannerInstance = null;
        }
    };

    function renderCreatePanel() {
        const panel = document.getElementById('empCreatePanel');
        if (!panel) return;
        const info = empBundle?.employee || empState || {};
        const curr = info.currency_code || 'EGP';
        const locked = info.can_accept_pos === false;

        panel.innerHTML = `
            <div class="emp-card">
                <h2 style="margin:0 0 6px;font-size:1.1rem;font-weight:900;color:#0f172a;">➕ إنشاء عملية توثيق جديدة</h2>
                <p style="margin:0 0 14px;font-size:0.8rem;color:#64748b;">استخدم هذه الشاشة لتوثيق فاتورة عميل يقف أمامك (مثلاً إذا كان هاتفه بدون إنترنت أو بطارية).</p>

                ${locked ? `<div style="background:#fef2f2;border:1.5px solid #ef4444;color:#991b1b;padding:10px 12px;border-radius:10px;font-size:0.84rem;font-weight:800;margin-bottom:12px;">🔒 ${esc(info.pos_lock_reason_ar || 'التوثيق موقوف مؤقتاً من إدارة المتجر.')}</div>` : ''}

                <form id="empCreateTxForm">
                    <div class="emp-form-group">
                        <label>👤 كود العضو أو رقم هاتفه (أو امسح QR) *</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" id="empCreateMemberInput" required class="emp-input" style="flex:1;" placeholder="مثال: 1001 أو رقم الهاتف">
                            <button type="button" onclick="openEmpCameraQrScanner()" style="border:1.5px solid #059669;background:#ecfdf5;color:#065f46;border-radius:10px;padding:0 12px;font-family:'Tajawal',sans-serif;font-weight:800;font-size:0.84rem;cursor:pointer;white-space:nowrap;">📷 مسح QR</button>
                        </div>
                        <div id="empMemberLookupStatus" style="margin-top:6px;font-size:0.8rem;font-weight:700;color:#64748b;">أدخل كود العضو أو امسح بطاقته للتحقق من هويته المقنّعة.</div>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;">
                        <div class="emp-form-group">
                            <label>💰 قيمة الفاتورة (${esc(curr)}) *</label>
                            <input type="number" id="empCreateAmountInput" required min="1" step="0.01" dir="ltr" class="emp-input" placeholder="500.00">
                        </div>
                        <div class="emp-form-group">
                            <label>💳 وسيلة الدفع *</label>
                            <select id="empCreatePayType" class="emp-input">
                                <option value="cash">💵 نقدي (كاش)</option>
                                <option value="pos_card">💳 بطاقة بنكية</option>
                                <option value="instant_transfer">⚡ تحويل لحظي (إنستاباي/سريع)</option>
                                <option value="digital_wallet">📱 محفظة رقمية</option>
                                <option value="iban_swift_sepa">🏦 تحويل بنكي</option>
                                <option value="payment_gateway">🌐 بوابة دفع إلكترونية</option>
                                <option value="bnpl">📆 تقسيط (BNPL)</option>
                                <option value="cheque">📝 شيك بنكي</option>
                                <option value="cod">🚚 دفع عند الاستلام (دليفري)</option>
                                <option value="marketplace_escrow">🛒 متجر إلكتروني</option>
                            </select>
                        </div>
                    </div>

                    <div class="emp-form-group">
                        <label>🔢 مرجع العملية / التحويل (اختياري)</label>
                        <input type="text" id="empCreateRefInput" class="emp-input" placeholder="اختياري">
                    </div>

                    <div class="emp-form-group">
                        <label>📷 صورة الإيصال أو السلعة (اختياري)</label>
                        <div id="empCreateReceiptHost"></div>
                    </div>

                    <button type="submit" id="empCreateSubmitBtn" class="emp-btn-approve" style="width:100%;" ${locked ? 'disabled' : ''}>✅ توثيق الفاتورة الآن</button>
                </form>
            </div>
        `;

        if (window.SAWYAN?.ImageUpload) {
            empReceiptUploader = window.SAWYAN.ImageUpload.mountUploader(document.getElementById('empCreateReceiptHost'), {
                label: '📷 التقط صورة الإيصال / السلعة (اختياري)',
                maxDim: 1280,
                maxChars: 360000
            });
        }

        resolvedMember = null;
        const memIn = document.getElementById('empCreateMemberInput');
        const memStatus = document.getElementById('empMemberLookupStatus');
        memIn?.addEventListener('input', () => {
            resolvedMember = null;
            const raw = normalizeDigits(memIn.value);
            if (!raw) {
                if (memStatus) { memStatus.style.color = '#64748b'; memStatus.textContent = 'أدخل كود العضو للتحقق من هويته المقنّعة.'; }
                return;
            }
            if (lookupDebounce) clearTimeout(lookupDebounce);
            lookupDebounce = setTimeout(async () => {
                if (memStatus) { memStatus.style.color = '#475569'; memStatus.textContent = '⏳ جاري التحقق من العضو...'; }
                try {
                    const r = await window.SAWYAN.API.employeeLookupMember({ employeeId: empState.id, memberIdentifier: raw });
                    if (r && r.found) {
                        resolvedMember = r;
                        if (memStatus) {
                            memStatus.style.color = '#059669';
                            memStatus.textContent = `✅ عضو موثّق: ${r.masked_name} (#${r.member_code})`;
                        }
                    } else {
                        resolvedMember = null;
                        if (memStatus) {
                            memStatus.style.color = '#dc2626';
                            memStatus.textContent = '❌ لم يُعثر على عضو نشط بهذا الكود أو الرقم.';
                        }
                    }
                } catch (err) {
                    if (!handleSessionTermination(err) && memStatus) {
                        memStatus.style.color = '#dc2626';
                        memStatus.textContent = '❌ ' + humanErr(err);
                    }
                }
            }, 350);
        });

        document.getElementById('empCreateTxForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('empCreateSubmitBtn');
            const rawMem = normalizeDigits(memIn?.value || '');
            const amt = Number(document.getElementById('empCreateAmountInput')?.value || 0);
            const pt = document.getElementById('empCreatePayType')?.value || 'cash';
            const ref = (document.getElementById('empCreateRefInput')?.value || '').trim() || null;
            const rec = (empReceiptUploader && empReceiptUploader.getValue()) || null;

            if (!amt || amt <= 0) {
                notify('أدخل قيمة فاتورة صحيحة أكبر من صفر.', 'error');
                return;
            }

            if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التوثيق...'; }
            try {
                if (!resolvedMember && rawMem) {
                    const r = await window.SAWYAN.API.employeeLookupMember({ employeeId: empState.id, memberIdentifier: rawMem });
                    if (r && r.found) resolvedMember = r;
                }
                if (!resolvedMember || !resolvedMember.member_code) {
                    throw new Error('يرجى إدخال كود أو هاتف عضو نشط وصحيح أولاً.');
                }

                const res = await window.SAWYAN.API.employeeCreateVerificationTx({
                    employeeId: empState.id,
                    memberCode: resolvedMember.member_code,
                    amount: amt,
                    paymentType: pt,
                    uniquePaymentRef: ref,
                    receiptMediaUrl: rec
                });
                if (res && res.success === false && res.error_code === 'EMPLOYEE_PIN_RECONFIRM_REQUIRED') {
                    const p = await window.SAWYAN.UI.prompt({
                        title: '🔐 تأكيد PIN لفاتورة كبيرة',
                        message: 'أدخل رمز PIN الخاص بك (4 أرقام) لتأكيد العملية:',
                        placeholder: '••••',
                        inputType: 'password'
                    });
                    if (p === null) return;
                    const retry = await window.SAWYAN.API.employeeCreateVerificationTx({
                        employeeId: empState.id,
                        memberCode: resolvedMember.member_code,
                        amount: amt,
                        paymentType: pt,
                        uniquePaymentRef: ref,
                        receiptMediaUrl: rec,
                        reconfirmPin: normalizeDigits(p)
                    });
                    if (!retry || retry.success === false) throw new Error(humanErr(retry?.error_code || 'تعذر التوثيق'));
                    await window.SAWYAN.UI.alert({
                        title: '✅ تم توثيق الفاتورة بنجاح',
                        message: `🧾 كود التوثيق: ${retry.sw_short_code}\n👤 العضو: ${retry.member_masked_name}\n💰 المبلغ: ${fmtMoney(retry.total_amount, retry.currency_code)}`,
                        type: 'success'
                    });
                } else if (res && res.success === false) {
                    throw new Error(humanErr(res.error_code));
                } else {
                    await window.SAWYAN.UI.alert({
                        title: '✅ تم توثيق الفاتورة بنجاح',
                        message: `🧾 كود التوثيق: ${res.sw_short_code}\n👤 العضو: ${res.member_masked_name}\n💰 المبلغ: ${fmtMoney(res.total_amount, res.currency_code)}`,
                        type: 'success'
                    });
                }
                await refreshEmployeeBundle(true);
                renderCreatePanel();
            } catch (err) {
                if (!handleSessionTermination(err)) notify(humanErr(err), 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '✅ توثيق الفاتورة الآن'; }
            }
        });
    }

    function renderTodayPanel() {
        const panel = document.getElementById('empTodayPanel');
        if (!panel) return;
        const rows = empBundle?.today_transactions || [];
        const info = empBundle?.employee || empState || {};
        const curr = info.currency_code || (rows[0] && rows[0].currency_code) || 'EGP';
        const completedRows = rows.filter(tx => tx.status === 'completed');
        const completedSum = completedRows.reduce((acc, tx) => acc + Number(tx.total_amount || 0), 0);
        const queuedCount = rows.filter(tx => tx.status === 'awaiting_merchant_topup').length;

        const summaryBar = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:14px;">
                <div style="background:#ecfdf5;border:1.5px solid #86efac;border-radius:12px;padding:12px;text-align:center;">
                    <div style="font-size:0.74rem;font-weight:800;color:#065f46;">✅ عملياتك المعتمدة اليوم</div>
                    <strong style="font-size:1.25rem;color:#047857;">${completedRows.length}</strong>
                </div>
                <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:12px;text-align:center;">
                    <div style="font-size:0.74rem;font-weight:800;color:#1e40af;">💰 إجمالي فواتير ورديتك</div>
                    <strong style="font-size:1.15rem;color:#1d4ed8;" dir="ltr">${fmtMoney(completedSum, curr)}</strong>
                </div>
                ${queuedCount > 0 ? `
                <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:12px;text-align:center;">
                    <div style="font-size:0.74rem;font-weight:800;color:#92400e;">⏸️ بانتظار الشحن</div>
                    <strong style="font-size:1.25rem;color:#b45309;">${queuedCount}</strong>
                </div>` : ''}
            </div>
        `;

        if (rows.length === 0) {
            panel.innerHTML = summaryBar + `
                <div class="emp-empty">
                    <div style="font-size:2.4rem;margin-bottom:8px;">📋</div>
                    <div style="font-weight:900;color:#0f172a;">لا توجد عمليات مسجلة باسمك اليوم بعد</div>
                </div>
            `;
            return;
        }
        panel.innerHTML = summaryBar + rows.map(tx => {
            const stMap = {
                completed: { lbl: '✅ معتمدة', bg: '#dcfce7', col: '#166534' },
                awaiting_merchant_topup: { lbl: '⏸️ بانتظار الشحن', bg: '#fef3c7', col: '#92400e' },
                rejected: { lbl: '❌ مرفوضة', bg: '#fee2e2', col: '#991b1b' }
            };
            const st = stMap[tx.status] || { lbl: tx.status, bg: '#f1f5f9', col: '#334155' };
            return `
                <div class="emp-card" style="padding:13px 15px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <div>
                            <strong style="color:#0f172a;">${esc(tx.member_masked_name)}</strong>
                            <span class="emp-short-code" style="font-size:0.82rem;margin-right:6px;" dir="ltr">${esc(tx.sw_short_code)}</span>
                        </div>
                        <span class="emp-status-pill" style="background:${st.bg};color:${st.col};">${st.lbl}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:0.86rem;">
                        <strong style="color:#059669;">${fmtMoney(tx.total_amount, tx.currency_code)}</strong>
                        <span style="color:#64748b;font-size:0.76rem;">⏱️ ${new Date(tx.completed_at || tx.created_at).toLocaleTimeString('ar-EG')}</span>
                    </div>
                    ${tx.rejection_reason ? `<div style="margin-top:6px;font-size:0.76rem;color:#991b1b;">السبب: ${esc(tx.rejection_reason)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    window.refreshEmployeeBundle = async function (silent) {
        if (!empState?.id) return;
        try {
            const b = await window.SAWYAN.API.getEmployeeVerificationBundle({ employeeId: empState.id });
            const prevIds = new Set(knownPendingIds);
            const nextPending = Array.isArray(b?.pending_transactions) ? b.pending_transactions : [];
            const nextIds = new Set(nextPending.map(t => t.id));
            if (initialLoadDone) {
                const newlyArrived = nextPending.filter(t => !prevIds.has(t.id));
                if (newlyArrived.length > 0) {
                    if (alertsEnabled) {
                        playChime();
                        sendBrowserNotification(newlyArrived[0]);
                    }
                    notify(`🔔 وصل طلب توثيق جديد (${newlyArrived[0].sw_short_code}) بمبلغ ${fmtMoney(newlyArrived[0].total_amount, newlyArrived[0].currency_code)}`, 'info');
                }
            }
            knownPendingIds = nextIds;
            initialLoadDone = true;
            empBundle = b;
            updateHeader();
            renderPendingPanel();
            if (activeTab === 'today') renderTodayPanel();
            schedulePoll(b?.session_meta?.live_poll_interval_secs || 8);
        } catch (err) {
            if (!handleSessionTermination(err) && !silent) {
                notify(humanErr(err), 'error');
            }
        }
    };

    function schedulePoll(intervalSecs) {
        const ms = Math.max(3, Math.min(120, Number(intervalSecs || 8))) * 1000;
        if (pollTimer && pollTimer._ms === ms) return;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (!document.hidden) refreshEmployeeBundle(true);
        }, ms);
        pollTimer._ms = ms;
    }

    async function initEmployeePortal() {
        for (let i = 0; i < 30 && (!window.SAWYAN || !window.SAWYAN.supabase); i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        empState = window.SAWYAN?.API?.getSavedEmployee();
        const tok = window.SAWYAN?.API?.getEmployeeSessionToken();
        if (!empState || !empState.id || !tok) {
            window.location.href = 'login.html?tab=employee';
            return;
        }
        updateHeader();

        document.getElementById('forceChangePinForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errBox = document.getElementById('fcErrorBox');
            const btn = document.getElementById('fcSubmitBtn');
            if (errBox) errBox.style.display = 'none';
            const cur = normalizeDigits(document.getElementById('fcCurrentPin')?.value || '');
            const nxt = normalizeDigits(document.getElementById('fcNewPin')?.value || '');
            const cnf = normalizeDigits(document.getElementById('fcConfirmPin')?.value || '');
            if (!/^\d{4}$/.test(cur) || !/^\d{4}$/.test(nxt)) {
                if (errBox) { errBox.textContent = '❌ يجب أن يكون رمز الـ PIN مكوناً من 4 أرقام فقط.'; errBox.style.display = 'block'; }
                return;
            }
            if (nxt !== cnf) {
                if (errBox) { errBox.textContent = '❌ رمزا الـ PIN الجديد غير متطابقين.'; errBox.style.display = 'block'; }
                return;
            }
            if (nxt === cur) {
                if (errBox) { errBox.textContent = '❌ يجب اختيار رمز PIN جديد مختلف عن الرمز المؤقت.'; errBox.style.display = 'block'; }
                return;
            }
            if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التشفير والحفظ...'; }
            try {
                await window.SAWYAN.API.employeeChangePin({
                    employeeId: empState.id,
                    currentPin: cur,
                    newPin: nxt
                });
                empState.must_change_pin = false;
                window.SAWYAN.API.saveEmployeeSession(empState, tok);
                notify('✅ تم حفظ رمزك السري بنجاح!', 'success');
                showWorkspace();
                await refreshEmployeeBundle(false);
            } catch (err) {
                if (!handleSessionTermination(err) && errBox) {
                    errBox.textContent = '❌ ' + humanErr(err);
                    errBox.style.display = 'block';
                }
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '✅ حفظ رمزي السري وفتح شاشة التوثيق'; }
            }
        });

        if (empState.must_change_pin) {
            showForcePinGate();
        } else {
            showWorkspace();
            await refreshEmployeeBundle(false);
            if (window.SAWYAN?.Push) {
                window.SAWYAN.Push.syncIfAlreadyGranted({ actorType: 'employee', actorId: empState.id }).then(() => refreshEmployeePushButtonState());
                refreshEmployeePushButtonState();
                window.addEventListener('sawyan:pwa-install-ready', refreshEmployeePushButtonState);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', initEmployeePortal);
})();
