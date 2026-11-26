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
        if (m.includes('PENDING_LIMIT_REACHED') || m.includes('MAX_PENDING_LIMIT') || m.includes('MEMBER_PENDING_LIMIT_REACHED')) {
            return 'بلغت الحد الأقصى للطلبات المعلقة لدى هذا المتجر — انتظر اعتماد التاجر أو ألغِ طلباً قديماً أولاً.';
        }
        if (m.includes('SPAM_GUARD_RECEIPT_REQUIRED')) {
            return 'يرجى إرفاق صورة الإيصال أو الفاتورة لهذا الطلب بعد تكرار رفض طلبات سابقة بدون صورة لدى هذا المتجر.';
        }
        if (m.includes('CASHIER_PIN_ONLY_ON_EMPLOYEE_OR_MERCHANT_DEVICE')) {
            return 'توثيق رمز PIN يتم من جهاز التاجر أو الموظف فقط — أرسل طلب التوثيق وسيعتمده المتجر فوراً من موبايله.';
        }
        if (m.includes('SOFT_HOLD_CAP') || m.includes('MERCHANT_SOFT_HOLD_CAP')) {
            return 'قيمة هذه الفاتورة تتجاوز الحد المؤقت المسموح به للطلبات المعلّقة لدى هذا المتجر حالياً (سقف الحجز الوقائي لحماية رصيد التاجر). يُرجى الطلب من الكاشير توثيق الفاتورة مباشرة من شاشة المتجر عبر رمز الـ QR أو رقم عضويتك، أو المحاولة بعد اعتماد الطلبات المعلقة.';
        }
        if (m.includes('RECEIPT_REQUIRED_FOR_REMOTE_PURCHASE')) {
            return 'يرجى تصوير أو رفع صورة الفاتورة / الإيصال لإرسال الطلب للتاجر.';
        }
        if (m.includes('INVALID_PURCHASE_AMOUNT') || m.includes('POSITIVE_INVOICE_AMOUNT_REQUIRED')) {
            return 'يرجى إدخال قيمة فاتورة صحيحة أكبر من صفر.';
        }
        if (m.includes('INVALID_PAYMENT_TYPE')) {
            return 'وسيلة الدفع المختارة غير مدعومة حالياً — اختر وسيلة أخرى من القائمة.';
        }
        if (m.includes('MERCHANT_COMMISSION_NOT_SET_YET')) {
            return 'لم يتم ضبط نسبة عمولة هذا المتجر بعد — لا يمكن تسجيل فواتير عليه حالياً.';
        }
        if (m.includes('MERCHANT_INACTIVE') || m.includes('MERCHANT_NOT_FOUND') || m.includes('MERCHANT_ACCOUNT_INACTIVE')) {
            return 'هذا المتجر غير نشط أو غير متاح حالياً لاستقبال الفواتير.';
        }
        if (m.includes('NO_ACTIVE_MERCHANT_BRANCH') || m.includes('INVALID_MERCHANT_BRANCH')) {
            return 'لا يوجد فرع نشط مفعّل لهذا المتجر حالياً.';
        }
        if (m.includes('DUPLICATE_TOPUP_NOTICE_COOLDOWN')) {
            return 'تم استلام إشعار شحن مماثل بنفس المبلغ للتو — يرجى الانتظار دقيقتين قبل إرسال طلب جديد منعاً للتكرار.';
        }
        if (m.includes('TOPUP_PROOF_OR_REF_REQUIRED')) {
            return 'يرجى إدخال رقم مرجع الحوالة البنكية (3 أحرف على الأقل) أو إرفاق صورة الإيصال حسب سياسة الشحن المفعّلة حالياً.';
        }
        if (m.includes('DUPLICATE_PAYMENT_REF') || m.includes('transactions_unique_payment_ref')) {
            return 'رقم مرجع الدفع المدخل مستخدم من قبل في عملية سابقة.';
        }
        if (m.includes('CASHIER_PIN_LOCKED') || m.includes('CASHIER_LOCKED')) {
            return 'تم قفل التحقق برمز PIN لمدة 15 دقيقة بعد 5 محاولات غير صحيحة.';
        }
        if (m.includes('INVALID_EMPLOYEE_CREDENTIALS') || m.includes('INVALID_CASHIER_CREDENTIALS') || m.includes('INVALID_CASHIER_PIN')) {
            return 'كود المتجر أو كود الموظف أو رمز PIN غير صحيح — تحقق من البيانات وحاول مجدداً.';
        }
        if (m.includes('EMPLOYEE_CREDENTIALS_REQUIRED')) {
            return 'يرجى إدخال كود المتجر وكود الموظف ورمز PIN المكوّن من 4 أرقام.';
        }
        if (m.includes('EMPLOYEE_ACCOUNT_INACTIVE')) {
            return 'تم إيقاف حساب الموظف من قِبل مالك المتجر — يرجى مراجعة إدارة المتجر.';
        }
        if (m.includes('EMPLOYEE_SESSION_EXPIRED') || m.includes('UNAUTHORIZED_EMPLOYEE_SESSION')) {
            return 'انتهت جلسة الوردية — يرجى تسجيل الدخول برمز PIN الخاص بك مجدداً.';
        }
        if (m.includes('EMPLOYEE_SESSION_IDLE_LOCKED')) {
            return 'تم قفل جلسة الموظف تلقائياً لعدم النشاط — أدخل رمز PIN لإعادة الفتح.';
        }
        if (m.includes('EMPLOYEE_PIN_CHANGE_REQUIRED')) {
            return 'يجب تغيير رمز الـ PIN المؤقت واختيار رمزك السري الخاص (4 أرقام) قبل متابعة العمل.';
        }
        if (m.includes('INVALID_CURRENT_PIN')) {
            return 'رمز الـ PIN الحالي/المؤقت غير صحيح.';
        }
        if (m.includes('NEW_PIN_MUST_DIFFER_FROM_TEMP')) {
            return 'يجب أن يكون رمز الـ PIN الجديد مختلفاً عن الرمز المؤقت الذي وضعه المالك.';
        }
        if (m.includes('TX_ALREADY_PROCESSED')) {
            return 'تم البتّ في هذه الفاتورة بالفعل من قِبل المالك أو زميل آخر.';
        }
        if (m.includes('TX_ALREADY_REVERSED')) {
            return 'تم إلغاء أو إرجاع هذه الفاتورة مسبقاً.';
        }
        if (m.includes('TX_NOT_IN_PENDING_STATE') || m.includes('ONLY_PENDING_PURCHASE_CAN_BE_CANCELLED')) {
            return 'هذه الفاتورة لم تعد في حالة الانتظار ولا يمكن تعديلها أو إلغاؤها الآن.';
        }
        if (m.includes('ONLY_COMPLETED_TX_CAN_BE_RETURNED') || m.includes('REVERSAL_REQUIRES_COMPLETED_TX') || m.includes('TX_NOT_REVERSIBLE')) {
            return 'لا يمكن تنفيذ المرتجع إلا على فاتورة مكتملة ضمن نافذة المراجعة المعتمدة.';
        }
        if (m.includes('POST_PAYOUT_RETURN_FORBIDDEN')) {
            return 'انتهت مهلة المرتجعات والاعتراضات لهذا الشهر بعد صرف عمولات يوم 15 نهائياً.';
        }
        if (m.includes('OPEN_DISPUTE_ALREADY_EXISTS')) {
            return 'يوجد نزاع مفتوح بالفعل لهذه الفاتورة وهو قيد مراجعة الإدارة.';
        }
        if (m.includes('DISPUTE_REASON_REQUIRED')) {
            return 'يرجى كتابة سبب الاعتراض أو النزاع بوضوح قبل الإرسال.';
        }
        if (m.includes('RETURN_DISPUTE_EVIDENCE_REQUIRED') || m.includes('RETURN_PROOF_URL_REQUIRED')) {
            return 'يرجى إرفاق صورة إثبات المرتجع أو الفاتورة لاستكمال الطلب.';
        }
        if (m.includes('SHELF_AND_RECEIPT_PHOTOS_REQUIRED')) {
            return 'يرجى إرفاق صورة السعر المعلن وصورة الفاتورة لإثبات بلاغ التلاعب بالأسعار.';
        }
        if (m.includes('MINIMUM_WITHDRAWAL_10_USD')) {
            return 'الحد الأدنى لطلب السحب هو 10 دولار أمريكي (أو ما يعادله بالعملة المحلية).';
        }
        if (m.includes('KYC_VERIFICATION_REQUIRED_BEFORE_WITHDRAWAL')) {
            return 'يرجى توثيق هويتك (KYC) من الإعدادات قبل تقديم أول طلب سحب.';
        }
        if (m.includes('PAYOUT_METHOD_COOLDOWN_72H_ACTIVE')) {
            return 'لأمان حسابك، لا يمكن السحب إلى وسيلة استلام مضافة حديثاً قبل مرور فترة التهدئة الأمنية (72 ساعة).';
        }
        if (m.includes('WITHDRAWAL_DUAL_APPROVAL_REQUIRED_W05')) {
            return 'تجاوز مبلغ السحب حد المراجعة المزدوجة — أُحيل الطلب لاعتماد مديرَين ماليَين.';
        }
        if (m.includes('FLASH_OFFER_WEEKLY_LIMIT_EXCEEDED')) {
            return 'بلغ متجرك الحد الأقصى للإعلانات الترويجية (إعلانان خلال 7 أيام).';
        }
        if (m.includes('FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT')) {
            return 'يُمنع وضع روابط خارجية أو أرقام هاتف/دفع مباشر داخل نص الإعلان الترويجي.';
        }
        if (m.includes('FLASH_OFFER_EMPTY_TITLE_OR_BODY')) {
            return 'يرجى كتابة عنوان واضح وتفاصيل العرض الترويجي قبل الإرسال.';
        }
        if (m.includes('PHONE_ALREADY_REGISTERED') || m.includes('MERCHANT_PHONE_ALREADY_REGISTERED')) {
            return 'رقم الهاتف هذا مسجّل بالفعل في حساب آخر — يمكنك تسجيل الدخول مباشرة.';
        }
        if (m.includes('EMAIL_ALREADY_REGISTERED') || m.includes('MERCHANT_EMAIL_ALREADY_REGISTERED')) {
            return 'البريد الإلكتروني هذا مسجّل بالفعل في حساب آخر.';
        }
        if (m.includes('SPONSOR_NOT_FOUND') || m.includes('SPONSOR_REQUIRED')) {
            return 'كود الراعي المدخل غير صحيح أو غير نشط — تأكد من الرقم وحاول مجدداً.';
        }
        if (m.includes('UNAUTHORIZED_MEMBER_SESSION') || m.includes('MEMBER_SESSION_EXPIRED')) {
            return 'انتهت جلستك الحالية — يرجى تسجيل الدخول مرة أخرى للمتابعة.';
        }
        if (m.includes('UNAUTHORIZED_MERCHANT_SESSION') || m.includes('MERCHANT_SESSION_EXPIRED')) {
            return 'انتهت جلسة المتجر — يرجى تسجيل الدخول مرة أخرى للمتابعة.';
        }
        if (m.includes('POS_LOOKUP_RATE_LIMIT_EXCEEDED')) {
            return 'عدد محاولات البحث سريع جداً — يرجى الانتظار دقيقة ثم المحاولة مجدداً.';
        }
        if (m.includes('PREREQUISITE_LESSON_INCOMPLETE')) {
            return 'يرجى إتمام الدرس السابق أولاً لفتح هذا الدرس في الأكاديمية.';
        }
        if (m.includes('TICKET_MESSAGE_TOO_SHORT')) {
            return 'يرجى كتابة تفاصيل أوضح في الرسالة قبل الإرسال.';
        }
        if (m.includes('REVIEW_NOTE_REQUIRED') || m.includes('REJECTION_REASON_REQUIRED')) {
            return 'يرجى كتابة ملاحظة أو سبب واضح (3 أحرف على الأقل) ليصل للطرف الآخر.';
        }
        if (m.includes('OPTIMISTIC_LOCK_CONFLICT')) {
            return 'تم تحديث هذا السجل للتو من شاشة أخرى — أعد التحميل وحاول مرة أخرى.';
        }
        if (m.includes('MERCHANT_MANUAL_REJECT_REVOKED_D2')) {
            return 'صلاحية الرفض اليدوي مقيّدة حالياً على حساب المتجر — يرجى مراجعة الإدارة.';
        }
        if (m.includes('MERCHANT_PORTAL_RESTRICTED_MODE') || m.includes('MERCHANT_CANNOT_SELF_PAUSE_UNDER_SANCTION')) {
            return 'حساب المتجر في وضع مقيّد حالياً من قِبل الإدارة — تواصل مع الدعم الفني.';
        }
        if (m.includes('RBAC_AUDITOR_READ_ONLY') || m.includes('RBAC_ROLE_FORBIDDEN')) {
            return 'صلاحية هذا الحساب للقراءة فقط أو غير مخوّلة لتنفيذ هذا الإجراء.';
        }
        if (m.includes('MAKER_CANNOT_APPROVE_OWN_REQUEST')) {
            return 'لا يمكن لمُنشئ الطلب اعتماده بنفسه — يلزم اعتماد مدير ثانٍ.';
        }
        if (m.includes('OWNER_OVERRIDE_WINDOW_48H_EXPIRED')) {
            return 'انتهت مهلة الـ 48 ساعة للتراجع المباشر عن رفض الموظف.';
        }
        if (m.includes('CASHIER_TX_LIMIT_EXCEEDED')) {
            return 'قيمة الفاتورة تتجاوز السقف الأقصى المسموح لك كموظف — يرجى تحويل الاعتماد لمالك المتجر.';
        }
        if (m.includes('MERCHANT_OWNER_SELF_PURCHASE_FORBIDDEN')) {
            return 'لا يمكن لمالك المتجر تسجيل مشتريات لنفسه من متجره الشخصي (منع الشراء الذاتي).';
        }
        if (m.includes('SELF_PURCHASE_PIN_FORBIDDEN') || m.includes('CASHIER_COLLUSION') || m.includes('CASHIER_SELF_APPROVAL_FORBIDDEN')) {
            return 'لا يمكن للموظف اعتماد فاتورة لحسابه الشخصي (حظر التواطؤ الذاتي).';
        }
        if (m.includes('POSITIVE_TOPUP_AMOUNT_REQUIRED') || m.includes('INVALID_TOPUP_AMOUNT')) {
            return 'يرجى إدخال مبلغ شحن صحيح أكبر من صفر.';
        }
        if (m.includes('TOPUP_AMOUNT_AND_BANK_REF_REQUIRED') || m.includes('VALID_TOPUP_AMOUNT_AND_BANK_REF_REQUIRED')) {
            return 'يرجى إدخال مبلغ التحويل ورقم مرجع الحوالة البنكية (3 أحرف على الأقل).';
        }
        if (m.includes('CONTACT_NAME_REQUIRED') || m.includes('KYC_FULL_NAME_AND_DOC_NUMBER_REQUIRED') || m.includes('PAYOUT_METHOD_FIELDS_REQUIRED')) {
            return 'يرجى استكمال جميع الحقول المطلوبة قبل الحفظ.';
        }
        if (/Failed to fetch|NetworkError|Load failed|timeout|AbortError/i.test(m)) {
            return 'تعذّر الاتصال بالخادم حالياً — تأكد من اتصال الإنترنت وحاول مرة أخرى.';
        }
        // Never leak raw English `RPC[...] failed: UPPER_SNAKE_CODE` technical errors to Arabic users
        const stripped = m.replace(/^❌\s*/, '').replace(/^RPC\[[^\]]+\]\s*failed:\s*/i, '').trim();
        if (!/[\u0600-\u06FF]/.test(stripped)) {
            return 'تعذّر إتمام هذا الطلب حالياً لسبب تشغيلي أو فني — يرجى التحقق من البيانات أو المحاولة مرة أخرى، أو التواصل مع الدعم الفني.';
        }
        return stripped;
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
        alert: (opts) => alertModal(typeof opts === 'string' ? { message: opts } : opts),
        confirm: (opts) => confirmModal(
            typeof opts === 'string'
                ? { message: opts }
                : { ...(opts || {}), danger: Boolean(opts && (opts.danger || opts.tone === 'danger')) }
        ),
        prompt: (opts) => promptModal(typeof opts === 'string' ? { message: opts } : opts),
        humanizeError
    };
})();
