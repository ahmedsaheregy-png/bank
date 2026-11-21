/**
 * ============================================================================
 * SAWYAN V3.0 — Unified Modern UI Feedback Kit (Toast, Alert, Confirm, Prompt)
 * Replaces native browser alert()/confirm()/prompt() across Member/Merchant/Admin
 * ============================================================================
 */
(function () {
    'use strict';

    window.SAWYAN = window.SAWYAN || {};

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureToastStack() {
        let stack = document.getElementById('swToastStack');
        if (!stack && document.body) {
            stack = document.createElement('div');
            stack.id = 'swToastStack';
            stack.className = 'sw-toast-stack';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        return stack;
    }

    function iconFor(type) {
        if (type === 'success') return '✅';
        if (type === 'warning') return '⚠️';
        if (type === 'error') return '❌';
        return 'ℹ️';
    }

    function inferTypeFromText(msg, fallback) {
        if (fallback) return fallback;
        const s = String(msg || '');
        if (s.includes('✅') || s.includes('🎉') || s.includes('بنجاح')) return 'success';
        if (s.includes('❌') || s.includes('⛔') || s.includes('🔴') || s.includes('تعذر') || s.includes('فشل')) return 'error';
        if (s.includes('⚠️') || s.includes('🔒') || s.includes('⏸️')) return 'warning';
        return 'info';
    }

    function humanizeError(errOrMsg) {
        const raw = typeof errOrMsg === 'string'
            ? errOrMsg
            : String(errOrMsg?.error_code || errOrMsg?.message || errOrMsg || '');
        const m = raw.trim();
        if (!m) return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.';
        if (m.includes('AUTH_RATE_LIMITED_15M')) {
            return 'تم تعليق محاولات الدخول مؤقتاً لمدة 15 دقيقة بعد استنفاد 5 محاولات غير صحيحة حفاظاً على أمان الحساب.';
        }
        if (m.includes('INVALID_CREDENTIALS') || m.includes('INVALID_MERCHANT_CREDENTIALS') || m.includes('ADMIN_INVALID_CREDENTIALS')) {
            return 'بيانات الدخول غير صحيحة — تأكد من المعرف وكلمة المرور وحاول مجدداً.';
        }
        if (m.includes('WEAK_OR_DEFAULT_PASSWORD_REJECTED') || m.includes('CONSTITUTIONAL_SECURITY_VIOLATION')) {
            return 'كلمة المرور الافتراضية مرفوضة أمنياً — يرجى استخدام كلمة مرور قوية.';
        }
        if (m.includes('ROOT_PORTAL_ACCESS_FORBIDDEN')) {
            return 'حساب الجذر #0 مخصص للإدارة العليا فقط ولا يُفتح من بوابة الأعضاء.';
        }
        if (m.includes('MEMBER_ACCOUNT_INACTIVE') || m.includes('MERCHANT_ACCOUNT_BANNED') || m.includes('MERCHANT_ACCOUNT_REJECTED') || m.includes('ADMIN_ACCOUNT_DEACTIVATED')) {
            return 'هذا الحساب غير نشط أو موقوف حالياً — يرجى التواصل مع فريق الدعم الفني.';
        }
        if (m.includes('D4_CREDIT_LOCKED') || m.includes('MERCHANT_QUEUE_FULL_BLOCKED') || m.includes('UNSECURED_QUEUE_CAP_EXCEEDED')) {
            return 'وصل المتجر للحد المتاح حالياً أو انتهت مهلة سداد الائتمان — يرجى شحن الرصيد أو تسوية الدورة للمتابعة.';
        }
        if (m.includes('MERCHANT_UNFUNDED_TOPUP_REQUIRED')) {
            return 'المتجر لم يشحن رصيده التشغيلي أو لم يُعتمد له حد ائتماني بعد — اشحن الرصيد أولاً.';
        }
        if (m.includes('MERCHANT_ISOLATED_PENDING_BLOCKED') || m.includes('MERCHANT_ISOLATED')) {
            return 'هذا المتجر في حالة إيقاف مؤقت لانتهاء رصيد الشحن حتى يقوم التاجر بإعادة الشحن.';
        }
        if (m.includes('MERCHANT_TEMPORARILY_PAUSED')) {
            return 'المتجر في وضع إجازة أو إغلاق مؤقت حالياً.';
        }
        if (m.includes('MERCHANT_COMPLIANCE_SUSPENDED')) {
            return 'المتجر موقوف من الإدارة حالياً ولا يستقبل طلبات جديدة.';
        }
        if (m.includes('MERCHANT_ONBOARDING_INCOMPLETE')) {
            return 'المتجر ما زال يستكمل بياناته التعاقدية قبل بدء استقبال الفواتير.';
        }
        if (m.includes('PENDING_LIMIT_REACHED') || m.includes('MAX_PENDING_LIMIT')) {
            return 'لديك طلبان معلقان بالفعل لدى هذا المتجر — انتظر اعتماد التاجر أو ألغِ طلباً قديماً أولاً.';
        }
        if (m.includes('SOFT_HOLD_CAP_EXCEEDED')) {
            return 'تجاوز الطلب السقف المؤقت للعمليات المعلقة لدى هذا المتجر حالياً.';
        }
        if (m.includes('RECEIPT_REQUIRED_FOR_REMOTE_PURCHASE')) {
            return 'يرجى تصوير أو رفع صورة الفاتورة / الإيصال لإرسال الطلب للتاجر.';
        }
        if (m.includes('DUPLICATE_PAYMENT_REF') || m.includes('transactions_unique_payment_ref')) {
            return 'رقم مرجع الدفع المدخل مستخدم من قبل في عملية سابقة.';
        }
        if (m.includes('CASHIER_PIN_LOCKED') || m.includes('CASHIER_LOCKED')) {
            return 'تم قفل التحقق برمز الكاشير لمدة 15 دقيقة بعد 5 محاولات غير صحيحة.';
        }
        if (m.includes('INVALID_CASHIER_CREDENTIALS')) {
            return 'كود موظف الكاشير أو رمز PIN غير صحيح — يمكنك التبديل لوضع إرسال الفاتورة بالصورة للتاجر.';
        }
        if (m.includes('SELF_PURCHASE_PIN_FORBIDDEN') || m.includes('CASHIER_COLLUSION')) {
            return 'لا يمكن لموظف الكاشير اعتماد فاتورة لحسابه الشخصي باستخدام رمز الكاشير.';
        }
        if (m.includes('POSITIVE_TOPUP_AMOUNT_REQUIRED')) {
            return 'يرجى إدخال مبلغ شحن صحيح أكبر من صفر.';
        }
        if (m.includes('TOPUP_AMOUNT_AND_BANK_REF_REQUIRED') || m.includes('VALID_TOPUP_AMOUNT_AND_BANK_REF_REQUIRED')) {
            return 'يرجى إدخال مبلغ التحويل ورقم مرجع الحوالة البنكية (3 أحرف على الأقل).';
        }
        return m.replace(/^❌\s*/, '');
    }

    function toast(message, type = null, durationMs = 4500) {
        const cleanMsg = String(message || '').trim();
        if (!cleanMsg) return;
        const kind = inferTypeFromText(cleanMsg, type);
        const stack = ensureToastStack();
        if (!stack) return;

        const el = document.createElement('div');
        el.className = `sw-toast sw-toast--${kind}`;
        el.innerHTML =
            `<span class="sw-toast-icon">${iconFor(kind)}</span>` +
            `<div class="sw-toast-body">${esc(cleanMsg.replace(/^[✅❌⚠️ℹ️🎉]\s*/, ''))}</div>` +
            `<button type="button" class="sw-toast-close" aria-label="إغلاق">×</button>`;

        const dismiss = () => {
            if (el.parentNode) el.parentNode.removeChild(el);
        };
        el.querySelector('.sw-toast-close')?.addEventListener('click', dismiss);
        stack.appendChild(el);
        if (durationMs > 0) {
            setTimeout(dismiss, durationMs);
        }
    }

    function openDialog({ title, message, type = 'info', actions = [], bodyHtml = '' }) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'sw-dialog-backdrop';
            backdrop.innerHTML =
                `<div class="sw-dialog-card" role="dialog" aria-modal="true">` +
                    `<div class="sw-dialog-head">` +
                        `<div class="sw-dialog-badge sw-dialog-badge--${esc(type)}">${iconFor(type)}</div>` +
                        `<h3 class="sw-dialog-title">${esc(title || 'تنبيه')}</h3>` +
                    `</div>` +
                    (message ? `<p class="sw-dialog-msg">${esc(message)}</p>` : '') +
                    bodyHtml +
                    `<div class="sw-dialog-actions"></div>` +
                `</div>`;

            const close = (val) => {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                resolve(val);
            };

            const actWrap = backdrop.querySelector('.sw-dialog-actions');
            actions.forEach((a) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `sw-btn ${a.className || 'sw-btn-primary'}`;
                b.textContent = a.label;
                b.onclick = () => {
                    if (typeof a.onClick === 'function') {
                        a.onClick(backdrop, close);
                    } else {
                        close(a.value);
                    }
                };
                actWrap.appendChild(b);
            });

            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) close(null);
            });

            document.body.appendChild(backdrop);
        });
    }

    function alertModal({ title = 'إشعار', message = '', type = null, buttonText = 'حسناً', actions = [] } = {}) {
        const kind = inferTypeFromText(message, type);
        const btns = (actions || []).map((a) => ({
            label: a.label,
            className: a.className || 'sw-btn-outline',
            onClick: (bd, close) => {
                close(true);
                if (typeof a.onClick === 'function') a.onClick();
            }
        }));
        btns.push({ label: buttonText, className: 'sw-btn-primary', value: true });
        return openDialog({ title, message, type: kind, actions: btns });
    }

    function confirmModal({ title = 'تأكيد الإجراء', message = '', confirmText = 'نعم، تأكيد', cancelText = 'إلغاء', danger = false } = {}) {
        return openDialog({
            title,
            message,
            type: danger ? 'warning' : 'info',
            actions: [
                { label: cancelText, className: 'sw-btn-ghost', value: false },
                { label: confirmText, className: danger ? 'sw-btn-danger' : 'sw-btn-primary', value: true }
            ]
        }).then((v) => Boolean(v));
    }

    function promptModal({ title = 'أدخل البيانات', message = '', placeholder = '', defaultValue = '', inputType = 'text', required = false, confirmText = 'حفظ ومتابعة', cancelText = 'إلغاء' } = {}) {
        return openDialog({
            title,
            message,
            type: 'info',
            bodyHtml: `<input id="swDialogPromptInput" type="${esc(inputType)}" class="sw-dialog-input" placeholder="${esc(placeholder)}" value="${esc(defaultValue)}">`,
            actions: [
                { label: cancelText, className: 'sw-btn-ghost', value: null },
                {
                    label: confirmText,
                    className: 'sw-btn-primary',
                    onClick: (bd, close) => {
                        const inp = bd.querySelector('#swDialogPromptInput');
                        const val = inp ? inp.value : '';
                        if (required && !val.trim()) {
                            inp?.focus();
                            toast('يرجى ملء هذا الحقل قبل المتابعة.', 'warning');
                            return;
                        }
                        close(val);
                    }
                }
            ]
        });
    }

    window.SAWYAN.UI = {
        toast,
        alertModal,
        confirmModal,
        promptModal,
        humanizeError
    };
})();
