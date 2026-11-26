// ============================================
// نظام الإشعارات الموحد V3.0 - SAWYAN
// يدعم حقن الحزم عبر RPC + Realtime على المخطط النشط (sawyan / sawyan_demo)
// ============================================

window.SAWYAN = window.SAWYAN || {};

window.SAWYAN.Notifications = {
    userType: null,
    userId: null,
    unreadCount: 0,
    notifications: [],
    subscription: null,

    init: function (userType, userId) {
        this.userType = userType;
        this.userId = userId;
        this.renderBell();
        this.updateBadge();
        this.renderList();
        this.subscribeToRealtime();
    },

    hydrateFromBundle: function (items) {
        if (!Array.isArray(items)) return;
        this.notifications = items;
        this.unreadCount = items.filter(n => !n.is_read).length;
        if (!document.getElementById('notificationBell')) {
            this.renderBell();
        }
        this.updateBadge();
        this.renderList();
    },

    subscribeToRealtime: function () {
        if (!window.SAWYAN.supabase || !this.userId || this.subscription) return;
        const activeSchema = window.SAWYAN.schema || 'sawyan';
        const filterStr = this.userType === 'admin'
            ? 'recipient_type=eq.admin'
            : ('recipient_id=eq.' + this.userId);

        try {
            this.subscription = window.SAWYAN.supabase
                .channel('notifications-' + activeSchema + '-' + this.userType + '-' + this.userId)
                .on('postgres_changes',
                    {
                        event: 'INSERT',
                        schema: activeSchema,
                        table: 'notifications',
                        filter: filterStr
                    },
                    (payload) => {
                        if (this.userType === 'admin' && payload.new && payload.new.recipient_type !== 'admin') return;
                        this.handleNewNotification(payload.new);
                    }
                )
                .subscribe();
        } catch (error) {
            console.warn('Notifications realtime warning:', error.message);
        }
    },

    _formatTitleAndBody: function (n) {
        const p = n.payload || {};
        if (n.title && n.message) {
            return { title: n.title, message: n.message };
        }
        if (p.title && p.message) {
            return { title: p.title, message: p.message };
        }
        const ev = n.event_name || 'Notification';
        const map = {
            NewMerchantRegistered: {
                title: '🏪 تاجر جديد مسجّل بانتظار المراجعة',
                message: `${p.business_name || 'متجر جديد'} (${p.merchant_code || '-'} • ${p.country_code || ''}) — عمولة ${p.deduction_percent ?? 0}%`
            },
            MerchantOnboardingApproved: {
                title: '✅ تم اعتماد متجرك بياناتياً في SAWYAN',
                message: p.needs_topup
                    ? `مبروك! تم قبول متجرك (${p.merchant_code || ''}). اضغط هنا لشحن رصيدك الافتتاحي والظهور فوراً في الدليل.`
                    : `مبروك! تم اعتماد متجرك (${p.merchant_code || ''}) وأصبح جاهزاً للعمل.`
            },
            MerchantOnboardingUpdated: {
                title: '✏️ تحديث حالة تأهيل متجرك',
                message: p.onboarding_notes || p.reason || 'يرجى مراجعة بيانات متجرك من شاشة الإعدادات.'
            },
            MerchantContractUpdated: {
                title: '⚙️ تحديث تعاقد وحالة متجرك',
                message: p.reason || `نسبة العمولة ${p.deduction_percent ?? ''}% • الحد الائتماني ${p.credit_limit ?? 0}`
            },
            MerchantTopupApproved: {
                title: '💳 تم شحن رصيد متجرك بنجاح',
                message: `تمت إضافة ${p.amount_local ?? ''} ${p.currency_code || ''} (مرجع ${p.payment_ref || ''}) لحساب متجرك.`
            },
            MerchantBankTopupProofPending: {
                title: '🏦 إشعار تحويل بنكي لشحن متجر بانتظار المطابقة',
                message: `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — مبلغ ${p.amount_local ?? ''} • مرجع ${p.bank_ref || ''}`
            },
            MerchantBankTopupSubmitted: {
                title: '🏦 إشعار تحويل بنكي لشحن متجر بانتظار المطابقة',
                message: `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — مبلغ ${p.amount_local ?? ''} • مرجع ${p.bank_ref || ''}`
            },
            MerchantBankTopupProofProcessed: {
                title: '🟢 تمت مطابقة وشحن رصيد متجر',
                message: `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — ${p.amount_local ?? ''}`
            },
            MerchantBankTopupUnderReview: {
                title: '🟠 طلب شحن الرصيد قيد المراجعة',
                message: p.admin_note
                    ? `${p.business_name ? p.business_name + ' — ' : ''}ملاحظة الإدارة: ${p.admin_note}`
                    : `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — مبلغ ${p.amount_local ?? ''} • مرجع ${p.bank_ref || ''}`
            },
            MerchantBankTopupRejected: {
                title: '🔴 تم رفض طلب شحن الرصيد',
                message: `مبلغ ${p.amount_local ?? ''} ${p.currency_code || ''} (مرجع ${p.bank_ref || ''}) — السبب: ${p.reason || p.admin_note || 'يرجى مراجعة التفاصيل'}`
            },
            MerchantBankTopupProofRejected: {
                title: '🔴 تم رفض إشعار شحن بنكي',
                message: `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — ${p.rejection_reason || p.admin_note || ''}`
            },
            MerchantFlashOfferPending: {
                title: '🔥 إعلان ترويجي لتاجر بانتظار اعتمادك',
                message: `${p.business_name || 'تاجر معتمد'}: ${p.title || ''}`
            },
            MerchantFlashOfferUnderReview: {
                title: '🟠 إعلان ترويجي قيد المراجعة',
                message: p.admin_note
                    ? `${p.offer_title || p.title || 'إعلان ترويجي'} — ملاحظة الإدارة: ${p.admin_note}`
                    : `${p.business_name || 'تاجر معتمد'}: ${p.title || p.offer_title || ''}`
            },
            MemberWithdrawalRequested: {
                title: '💸 طلب سحب أرباح عضو بانتظار الصرف',
                message: `${p.full_name || 'عضو'} (#${p.member_code || '-'}) — مبلغ ${p.amount_usd ?? ''} USD`
            },
            MemberGdprErasureRequested: {
                title: '🛡️ طلب محو بيانات شخصية (مهلة 72 ساعة)',
                message: `${p.full_name || 'عضو'} (#${p.member_code || '-'}) — يتطلب التحقق من الأرصدة والبت خلال 72 ساعة`
            },
            ZeroDiscrepancyBreachAutoHalt: {
                title: '🚨 إنذار طوارئ: إيقاف تلقائي لحماية المطابقة الصفرية',
                message: `فرق دفتر الأستاذ: ${p.abs_diff_usd ?? 0} USD — تم إيقاف الصرف تلقائياً لحين المراجعة.`
            },
            AdminMerchantIsolatedFifoAlert: {
                title: '🔴 عزل متجر تلقائياً لهبوط الرصيد',
                message: `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — يحتاج متابعة وشحن رصيد.`
            },
            PendingInvoiceApprovedByOwnerOverride: {
                title: '✅ تم اعتماد فاتورتك بواسطة مالك المتجر',
                message: `فاتورة ${p.sw_short_code || ''} لدى ${p.merchant_name || 'المتجر'} أُضيفت لصندوق هدفك الشهري.`
            },
            MerchantFlashOfferLive: {
                title: p.title || `🔥 عرض حصري الآن من ${p.business_name || 'متجر معتمد'}`,
                message: p.message || `${p.offer_title || ''}${p.discount_hint ? ' — ' + p.discount_hint : ''}`
            },
            MerchantFlashOfferApproved: {
                title: p.title || '🔥 تم اعتماد وبث حملتك الترويجية بنجاح!',
                message: p.message || `حملتك «${p.offer_title || ''}» نشطة وظاهرة الآن للأعضاء.`
            },
            MerchantFlashOfferRejected: {
                title: p.title || '❌ تعذر اعتماد الحملة الترويجية',
                message: p.message || `${p.offer_title || ''}: ${p.reason || 'غير مطابق لضوابط النشر'}`
            },
            OnMemberRegistered: {
                title: 'عضو جديد في شجرتك 🌟',
                message: `انضم ${p.full_name || 'عضو جديد'} بكود #${p.new_member_code || '-'}`
            },
            PendingPurchaseRequested: {
                title: 'طلب توثيق شراء معلق ⏳',
                message: `فاتورة ${p.sw_short_code || ''} بقيمة ${p.amount || ''}`
            },
            TransactionCompleted: {
                title: '✅ تم توثيق فاتورتك بنجاح',
                message: `فاتورة ${p.sw_short_code || ''} لدى ${p.merchant_name || ''} — أُضيف ${p.reward_added_local ?? ''} ${p.currency_code || ''} لصندوق الهدف.`
            },
            PendingInvoiceRejected: {
                title: '❌ تم رفض فاتورة معلقة',
                message: `فاتورة ${p.sw_short_code || ''}${p.reason ? ' — ' + p.reason : ''}`
            },
            DisputeTicketOpened: {
                title: 'تذكرة نزاع جديدة ⚠️',
                message: `فاتورة ${p.sw_short_code || ''}`
            },
            CashierSelfPinBlocked: {
                title: 'تنبيه أمان موظف الكاشير 🛡️',
                message: `تم إيقاف محاولة توثيق ذاتي لموظف الكاشير ${p.employee_code || ''}`
            },
            MerchantBalanceWarning30: {
                title: 'تنبيه شحن مبكر للرصيد (30%) 🟡',
                message: `وصل الرصيد الحر لمتجرك إلى ${p.free_pct ?? 30}% — يُنصح بالشحن للحفاظ على العروض الخاطفة والظهور المستمر.`
            },
            MerchantBalanceCritical20: {
                title: 'إنذار حرج لقرب نفاد الرصيد (20%) 🟠',
                message: `انخفض الرصيد الحر لمتجرك إلى ${p.free_pct ?? 20}% — يرجى شحن المحفظة قريباً لتفادي العزل الوقائي.`
            },
            MerchantBalanceIsolated10: {
                title: 'تم عزل المتجر مؤقتاً لنفاد/هبوط الرصيد 🔴',
                message: `الرصيد الحر ${p.free_pct ?? 0}% (${p.financial_status || 'isolated'}) — اشحن محفظة المتجر لإعادة الظهور بالدليل فوراً.`
            },
            MerchantComplianceAutoEscalated: {
                title: 'تحديث رقابي على حالة المتجر ⚖️',
                message: `${p.reason || ('تم تحديث وضع الامتثال إلى: ' + (p.new_governance_status || ''))}`
            },
            MerchantGovernanceUpdated: {
                title: 'قرار إداري لحوكمة المتجر ⚙️',
                message: `${p.reason || ('الحالة الحالية: ' + (p.governance_status || ''))}`
            },
            MerchantComplaintFiled: {
                title: 'شكوى جديدة ضد متجر 📣',
                message: `${p.business_name || 'متجر'}: ${p.subject || ''}`
            },
            MerchantComplaintUpdated: {
                title: 'تحديث مراجعة شكوى متجر ⚖️',
                message: `تم البت في الشكوى (${p.decision || ''})${p.notes ? ': ' + p.notes : ''}`
            }
        };
        return map[ev] || {
            title: ev,
            message: typeof p === 'string' ? p : JSON.stringify(p).slice(0, 110)
        };
    },

    handleNewNotification: function (notification) {
        if (!notification) return;
        if (notification.id && this.notifications.some(n => n.id === notification.id)) return;
        this.notifications.unshift(notification);
        this.unreadCount++;
        this.updateBadge();
        this.renderList();
        const fmt = this._formatTitleAndBody(notification);
        this.showToast(fmt.title, fmt.message);
    },

    showToast: function (title, message) {
        if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
            window.SAWYAN.UI.toast(`${title}: ${message}`, 'info');
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        const safeT = String(title || '').replace(/</g, '&lt;');
        const safeM = String(message || '').replace(/</g, '&lt;');
        toast.innerHTML = `<div class="toast-icon">🔔</div><div class="toast-content"><div class="toast-title">${safeT}</div><div class="toast-message">${safeM}</div></div><button onclick="this.parentElement.remove()">×</button>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    },

    renderBell: function () {
        if (document.getElementById('notificationBell')) return;
        const bellHTML = '<div class="notification-bell" id="notificationBell" onclick="SAWYAN.Notifications.toggleDropdown()"><span class="bell-icon">🔔</span><span class="notification-badge" id="notificationBadge" style="display: none;">0</span></div><div class="notification-dropdown" id="notificationDropdown" style="display: none;"><div class="notification-header"><h4>الإشعارات</h4><button onclick="SAWYAN.Notifications.markAllRead()">تحديد الكل كمقروء</button></div><div class="notification-list" id="notificationList"><p class="empty-notifications">لا توجد إشعارات</p></div></div>';

        const header = document.getElementById('headerNotifAnchor') || document.querySelector('.dashboard-header') || document.querySelector('.sidebar-header');
        if (header) {
            const bellContainer = document.createElement('div');
            bellContainer.className = 'notification-container';
            bellContainer.innerHTML = bellHTML;
            header.appendChild(bellContainer);
            this.updateBadge();
            this.renderList();
        }
    },

    loadNotifications: async function () {
        // يُغذى الجرس عبر حزمة RPC الآمنة أو حالة الذاكرة
        this.updateBadge();
        this.renderList();
    },

    updateBadge: function () {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    renderList: function () {
        const list = document.getElementById('notificationList');
        if (!list) return;

        if (!this.notifications || this.notifications.length === 0) {
            list.innerHTML = '<p class="empty-notifications">لا توجد إشعارات</p>';
            return;
        }

        list.innerHTML = this.notifications.map(n => {
            const readClass = n.is_read ? 'read' : 'unread';
            const fmt = this._formatTitleAndBody(n);
            const safeT = String(fmt.title || '').replace(/</g, '&lt;');
            const safeM = String(fmt.message || '').replace(/</g, '&lt;');
            const evName = String(n.event_name || n.notification_type || '').replace(/'/g, '');
            return `<div class="notification-item ${readClass}" onclick="SAWYAN.Notifications.handleNotificationClick('${n.id}', '${evName}')">
                <div class="notification-icon">${this.getIcon(n.event_name || n.notification_type)}</div>
                <div class="notification-content">
                    <div class="notification-title">${safeT}</div>
                    <div class="notification-message">${safeM}</div>
                    <div class="notification-time">
                        <span>${this.formatTime(n.created_at)}</span>
                        <span class="notification-jump-hint">انتقال للبند ↙</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    _cssAttrEsc: function (val) {
        return String(val === null || val === undefined ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    },

    scrollAndHighlight: function (primarySelectors, fallbackSelectors, opts) {
        const primaries = (Array.isArray(primarySelectors) ? primarySelectors : [primarySelectors]).filter(Boolean);
        let fallbacks = [];
        let options = opts || {};
        if (Array.isArray(fallbackSelectors) || typeof fallbackSelectors === 'string' || typeof fallbackSelectors === 'function') {
            fallbacks = (Array.isArray(fallbackSelectors) ? fallbackSelectors : [fallbackSelectors]).filter(Boolean);
        } else if (fallbackSelectors && typeof fallbackSelectors === 'object') {
            options = fallbackSelectors;
        }
        const maxWaitMs = Number(options.maxWaitMs || 3500);
        const startedAt = Date.now();

        if (this._activeDeepLinkTimer) {
            clearTimeout(this._activeDeepLinkTimer);
            this._activeDeepLinkTimer = null;
        }
        if (this._activeDeepLinkObserver) {
            try { this._activeDeepLinkObserver.disconnect(); } catch (_e) {}
            this._activeDeepLinkObserver = null;
        }

        const queryActive = (list) => {
            for (let i = 0; i < list.length; i++) {
                const sel = list[i];
                let el = null;
                try {
                    el = typeof sel === 'function' ? sel() : document.querySelector(sel);
                } catch (_e) { el = null; }
                if (!el) continue;
                const parentPage = el.closest('.page');
                if (parentPage && !parentPage.classList.contains('active')) continue;
                return el;
            }
            return null;
        };

        const applySpotlight = (el) => {
            const det = el.closest('details');
            if (det && !det.open) det.open = true;
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch (_e) {
                try { el.scrollIntoView(true); } catch (_e2) {}
            }
            el.classList.remove('sw-notif-spotlight');
            void el.offsetWidth;
            el.classList.add('sw-notif-spotlight');
            el.setAttribute('data-notif-focused', '1');
            clearTimeout(el._swNotifSpotTimer);
            el._swNotifSpotTimer = setTimeout(() => {
                el.classList.remove('sw-notif-spotlight');
                el.removeAttribute('data-notif-focused');
            }, 3400);
            if (typeof options.onFound === 'function') {
                try { options.onFound(el); } catch (_e) {}
            }
        };

        // Re-anchor spotlight if async page loader (e.g. loadMerchants) replaces innerHTML shortly after match
        const watchReRender = (listToWatch) => {
            const host = document.getElementById('contentArea') || document.querySelector('.main-content');
            if (!host || typeof MutationObserver !== 'function') return;
            const obs = new MutationObserver(() => {
                const fresh = queryActive(listToWatch);
                if (fresh && fresh.getAttribute('data-notif-focused') !== '1') {
                    requestAnimationFrame(() => applySpotlight(fresh));
                }
            });
            obs.observe(host, { childList: true, subtree: true });
            this._activeDeepLinkObserver = obs;
            setTimeout(() => {
                try { obs.disconnect(); } catch (_e) {}
                if (this._activeDeepLinkObserver === obs) this._activeDeepLinkObserver = null;
            }, 2400);
        };

        const attempt = () => {
            const primaryFound = primaries.length > 0 ? queryActive(primaries) : null;
            if (primaryFound) {
                requestAnimationFrame(() => applySpotlight(primaryFound));
                watchReRender(primaries);
                return;
            }
            const elapsed = Date.now() - startedAt;
            if (primaries.length > 0 && elapsed < maxWaitMs) {
                this._activeDeepLinkTimer = setTimeout(attempt, 120);
                return;
            }
            const fbFound = fallbacks.length > 0 ? queryActive(fallbacks) : null;
            if (fbFound) {
                requestAnimationFrame(() => applySpotlight(fbFound));
                watchReRender(fallbacks);
                return;
            }
            if (elapsed < maxWaitMs) {
                this._activeDeepLinkTimer = setTimeout(attempt, 120);
            } else if (typeof options.onMiss === 'function') {
                try { options.onMiss(); } catch (_e) {}
            }
        };

        this._activeDeepLinkTimer = setTimeout(attempt, 80);
    },

    _navigateAdminPage: function (pageKey) {
        const nav = document.querySelector('.sidebar-nav .nav-item[data-page="' + pageKey + '"]');
        if (nav) {
            nav.click();
            return;
        }
        if (pageKey === 'sovereignLive' && typeof window.openSovereignLivePage === 'function') {
            window.openSovereignLivePage('coa');
        } else if (typeof window.goToPage === 'function') {
            window.goToPage(pageKey);
        } else if (typeof window.showPage === 'function') {
            window.showPage(pageKey);
        }
    },

    handleNotificationClick: function (notificationId, eventName) {
        const notifObj = (this.notifications || []).find(n => n.id === notificationId) || null;
        const p = (notifObj && notifObj.payload) || {};
        this.markAsRead(notificationId);
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) dropdown.style.display = 'none';

        const ev = String(eventName || '');
        const escA = (v) => this._cssAttrEsc(v);

        if (this.userType === 'admin') {
            const merchId = p.merchant_id || (notifObj && notifObj.recipient_id) || '';
            const bankRef = p.bank_ref || p.payment_ref || '';
            const offerId = p.offer_id || notificationId || '';
            const shortCode = p.sw_short_code || '';

            if (ev.startsWith('MerchantBankTopup')) {
                window._pendingMerchantFilter = 'all';
                this._navigateAdminPage('merchants');
                const primaries = [];
                if (notificationId) primaries.push('#bankTopupProofRow_' + escA(notificationId));
                if (bankRef) primaries.push('[data-bank-ref="' + escA(bankRef) + '"]');
                const fallbacks = ['#adminBankTopupProofsBox'];
                if (merchId) fallbacks.push('#admMerchantRow_' + escA(merchId));
                fallbacks.push('#merchantsTable');
                this.scrollAndHighlight(primaries, fallbacks);
            } else if (ev === 'NewMerchantRegistered' || ev === 'MerchantComplianceAutoEscalated' || ev === 'AdminMerchantIsolatedFifoAlert') {
                window._pendingMerchantFilter = 'all';
                this._navigateAdminPage('merchants');
                const primaries = [];
                if (merchId) {
                    primaries.push('#admMerchantRow_' + escA(merchId));
                    primaries.push('tr[data-merchant-id="' + escA(merchId) + '"]');
                }
                this.scrollAndHighlight(primaries, ['#merchantsTable tbody tr:first-child', '#merchantsTable']);
            } else if (ev === 'MerchantFlashOfferPending' || ev === 'MerchantFlashOfferUnderReview') {
                this._navigateAdminPage('home');
                const primaries = [];
                if (offerId) primaries.push('#admFlashOfferCard_' + escA(offerId));
                if (notificationId) primaries.push('#admFlashOfferCard_' + escA(notificationId));
                this.scrollAndHighlight(primaries, ['#adminPromoModerationSection']);
            } else if (ev === 'MemberWithdrawalRequested') {
                this._navigateAdminPage('withdrawals');
                const wId = p.wallet_tx_id || p.withdrawal_id || '';
                const primaries = wId ? ['#admWithdrawalRow_' + escA(wId)] : [];
                this.scrollAndHighlight(primaries, ['#withdrawalsPage tbody tr:first-child', '#withdrawalsPage']);
            } else if (ev === 'MemberGdprErasureRequested') {
                this._navigateAdminPage('support');
                const tId = p.ticket_id || '';
                const primaries = tId ? ['#admTicketRow_' + escA(tId)] : [];
                this.scrollAndHighlight(primaries, ['#supportPage tbody tr:first-child', '#supportPage']);
            } else if (ev === 'ZeroDiscrepancyBreachAutoHalt') {
                if (typeof window.openSovereignLivePage === 'function') {
                    window.openSovereignLivePage('coa');
                } else {
                    this._navigateAdminPage('sovereignLive');
                }
                this.scrollAndHighlight(['#sovereignLivePage']);
            } else if (ev === 'MerchantComplaintFiled' || ev === 'DisputeTicketOpened') {
                this._navigateAdminPage('disputes');
                const dId = p.dispute_id || p.ticket_id || '';
                const cId = p.complaint_id || '';
                const primaries = [];
                if (dId) primaries.push('#admDisputeRow_' + escA(dId));
                if (cId) primaries.push('#admComplaintRow_' + escA(cId));
                if (shortCode) primaries.push('#disputesPage tr[data-short-code="' + escA(shortCode) + '"]');
                this.scrollAndHighlight(primaries, ['#disputesPage tbody tr:first-child', '#disputesPage']);
            } else {
                this._navigateAdminPage('merchants');
                const primaries = merchId ? ['#admMerchantRow_' + escA(merchId)] : [];
                this.scrollAndHighlight(primaries, ['#merchantsTable']);
            }
        } else if (this.userType === 'merchant') {
            const proofId = p.proof_notif_id || '';
            const bankRef = p.bank_ref || p.payment_ref || '';
            const txId = p.transaction_id || '';
            const shortCode = p.sw_short_code || '';

            if (ev === 'MerchantOnboardingApproved') {
                if (p.needs_topup && typeof window.openMerchantTopupModal === 'function') {
                    window.openMerchantTopupModal();
                } else if (typeof window.showPage === 'function') {
                    window.showPage('home');
                }
            } else if (ev === 'MerchantOnboardingUpdated') {
                if (typeof window.showPage === 'function') window.showPage('settings');
                this.scrollAndHighlight(['#settingsPage']);
            } else if (ev === 'PendingPurchaseRequested') {
                if (typeof window.showPage === 'function') window.showPage('pending');
                const primaries = [];
                if (txId) primaries.push('#merPendingTx_' + escA(txId));
                if (shortCode) primaries.push('#pendingList [data-short-code="' + escA(shortCode) + '"]');
                this.scrollAndHighlight(primaries, ['#pendingList > div:first-child', '#pendingList']);
            } else if (ev === 'MerchantTopupApproved' || ev === 'MerchantBankTopupUnderReview' || ev === 'MerchantBankTopupRejected' || ev === 'MerchantContractUpdated' || ev.startsWith('MerchantBalance') || ev.includes('Topup')) {
                if (typeof window.showPage === 'function') window.showPage('financial');
                const isTopupDecision = ev.includes('Topup');
                if (isTopupDecision && typeof window.switchFinancialTab === 'function') {
                    setTimeout(() => { try { window.switchFinancialTab(2); } catch (_e) {} }, 250);
                }
                const primaries = [];
                if (proofId) {
                    primaries.push('#merTopupActive_' + escA(proofId));
                    primaries.push('#merTopupProof_' + escA(proofId));
                }
                if (bankRef) primaries.push('[data-bank-ref="' + escA(bankRef) + '"]');
                this.scrollAndHighlight(primaries, ['#finPendingTopupsHost > div', '#merchantTopupProofStatusBox > div', '#finPrepaidHeroCard']);
            } else if (ev === 'MerchantFlashOfferApproved' || ev === 'MerchantFlashOfferUnderReview' || ev === 'MerchantFlashOfferRejected') {
                if (typeof window.showPage === 'function') window.showPage('home');
                this.scrollAndHighlight(['#promoActionBtn'], ['#homePage']);
            } else if (ev === 'DisputeTicketOpened' || ev.startsWith('MerchantComplaint')) {
                if (typeof window.openMerchantStage7Modal === 'function') window.openMerchantStage7Modal('support');
            }
        } else if (this.userType === 'member') {
            const txId = p.transaction_id || '';
            const shortCode = p.sw_short_code || '';
            const dispId = p.dispute_id || '';

            if (ev === 'PendingPurchaseRequested' || ev === 'PendingInvoiceRejected') {
                if (typeof window.goToPage === 'function') window.goToPage('myPending');
                const primaries = [];
                if (txId) primaries.push('#memPendingTx_' + escA(txId));
                if (shortCode) primaries.push('#myPendingPage [data-short-code="' + escA(shortCode) + '"]');
                this.scrollAndHighlight(primaries, ['[data-spec-id="member-pending-list"]']);
            } else if (ev === 'TransactionCompleted' || ev === 'PendingInvoiceApprovedByOwnerOverride' || ev.includes('Transaction')) {
                if (typeof window.goToPage === 'function') window.goToPage('transactions');
                const primaries = [];
                if (txId) primaries.push('#memTxCard_' + escA(txId));
                if (shortCode) primaries.push('#transactionsPage [data-short-code="' + escA(shortCode) + '"]');
                this.scrollAndHighlight(primaries, ['[data-spec-id="member-tx-list"]']);
            } else if (ev === 'DisputeTicketOpened' || ev.startsWith('Dispute')) {
                if (typeof window.goToPage === 'function') window.goToPage('transactions');
                const primaries = [];
                if (dispId) primaries.push('#memDisputeCard_' + escA(dispId));
                if (shortCode) primaries.push('#transactionsPage [data-short-code="' + escA(shortCode) + '"]');
                this.scrollAndHighlight(primaries, ['[data-spec-id="member-tx-list"]']);
            } else if (ev === 'OnMemberRegistered') {
                if (typeof window.goToPage === 'function') window.goToPage('tree');
                this.scrollAndHighlight(['#treeCanvas'], ['#treePage']);
            } else if (ev === 'MerchantFlashOfferLive') {
                if (typeof window.goToPage === 'function') window.goToPage('merchants');
                this.scrollAndHighlight(['#merchantsPage']);
            }
        }
    },

    getIcon: function (type) {
        const icons = {
            NewMerchantRegistered: '🏪',
            MerchantOnboardingApproved: '🎉',
            MerchantOnboardingUpdated: '✏️',
            MerchantContractUpdated: '⚙️',
            MerchantTopupApproved: '💳',
            MerchantBankTopupProofPending: '🏦',
            MerchantBankTopupSubmitted: '🏦',
            MerchantBankTopupUnderReview: '🟠',
            MerchantBankTopupRejected: '🔴',
            MerchantBankTopupProofRejected: '🔴',
            MerchantBankTopupProofProcessed: '🟢',
            MerchantFlashOfferPending: '🔥',
            MerchantFlashOfferUnderReview: '🟠',
            MerchantFlashOfferApproved: '🟢',
            MerchantFlashOfferRejected: '🔴',
            MemberWithdrawalRequested: '💸',
            MemberGdprErasureRequested: '🛡️',
            ZeroDiscrepancyBreachAutoHalt: '🚨',
            AdminMerchantIsolatedFifoAlert: '🔴',
            PendingInvoiceApprovedByOwnerOverride: '✅',
            OnMemberRegistered: '🌟',
            PendingPurchaseRequested: '⏳',
            TransactionCompleted: '✅',
            PendingInvoiceRejected: '❌',
            DisputeTicketOpened: '⚠️',
            CashierSelfPinBlocked: '🛡️',
            MerchantBalanceWarning30: '🟡',
            MerchantBalanceCritical20: '🟠',
            MerchantBalanceIsolated10: '🔴',
            MerchantComplianceAutoEscalated: '⚖️',
            MerchantGovernanceUpdated: '⚙️',
            MerchantComplaintFiled: '📣',
            MerchantComplaintUpdated: '⚖️',
            transaction_request: '📝',
            transaction_approved: '✅',
            commission: '💰',
            welcome: '👋'
        };
        return icons[type] || '🔔';
    },

    formatTime: function (timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const diff = Date.now() - date.getTime();
        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return 'منذ ' + Math.floor(diff / 60000) + ' دقيقة';
        if (diff < 86400000) return 'منذ ' + Math.floor(diff / 3600000) + ' ساعة';
        return date.toLocaleDateString('ar-EG');
    },

    toggleDropdown: function () {
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) {
            const isOpening = dropdown.style.display === 'none' || !dropdown.style.display;
            dropdown.style.display = isOpening ? 'flex' : 'none';
            if (isOpening) {
                const list = document.getElementById('notificationList');
                if (list) list.scrollTop = 0;
            }
        }
    },

    markAsRead: function (notificationId) {
        this.notifications = this.notifications.map(n => n.id === notificationId ? { ...n, is_read: true } : n);
        this.unreadCount = this.notifications.filter(n => !n.is_read).length;
        this.updateBadge();
        this.renderList();
        const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(notificationId || ''));
        if (isValidUuid && this.userType && this.userId && window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.markActorNotificationsRead === 'function') {
            window.SAWYAN.API.markActorNotificationsRead({
                actorType: this.userType,
                actorId: this.userId,
                notificationId: notificationId
            }).catch(() => {});
        }
    },

    markAllRead: function () {
        this.notifications = this.notifications.map(n => ({ ...n, is_read: true }));
        this.unreadCount = 0;
        this.updateBadge();
        this.renderList();
        if (this.userType && this.userId && window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.markActorNotificationsRead === 'function') {
            window.SAWYAN.API.markActorNotificationsRead({
                actorType: this.userType,
                actorId: this.userId,
                notificationId: null
            }).catch(() => {});
        }
    }
};

document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('notificationDropdown');
    const bell = document.getElementById('notificationBell');
    if (dropdown && bell && !bell.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});
