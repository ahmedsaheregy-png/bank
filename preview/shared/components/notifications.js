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
                title: '✅ تمت مطابقة وشحن رصيد متجر',
                message: `${p.business_name || 'متجر'} (${p.merchant_code || ''}) — ${p.amount_local ?? ''}`
            },
            MerchantFlashOfferPending: {
                title: '🔥 عرض ترويجي خاطف بانتظار الاعتماد',
                message: `${p.business_name || ''}: ${p.title || ''}`
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
                    <div class="notification-time">${this.formatTime(n.created_at)}</div>
                </div>
            </div>`;
        }).join('');
    },

    handleNotificationClick: function (notificationId, eventName) {
        const notifObj = (this.notifications || []).find(n => n.id === notificationId) || null;
        this.markAsRead(notificationId);
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) dropdown.style.display = 'none';
        const ev = String(eventName || '');
        if (this.userType === 'admin') {
            if (ev === 'NewMerchantRegistered' || ev.startsWith('MerchantBankTopup') || ev === 'MerchantComplianceAutoEscalated') {
                const nav = document.querySelector('.sidebar-nav .nav-item[data-page="merchants"]');
                if (nav) nav.click();
                else if (typeof window.showPage === 'function') window.showPage('merchants');
            } else if (ev === 'MerchantFlashOfferPending') {
                const nav = document.querySelector('.sidebar-nav .nav-item[data-page="sovereignLive"]');
                if (nav) nav.click();
                else if (typeof window.showPage === 'function') window.showPage('sovereignLive');
            } else if (ev === 'MerchantComplaintFiled' || ev === 'DisputeTicketOpened') {
                const nav = document.querySelector('.sidebar-nav .nav-item[data-page="disputes"]');
                if (nav) nav.click();
                else if (typeof window.showPage === 'function') window.showPage('disputes');
            } else {
                const nav = document.querySelector('.sidebar-nav .nav-item[data-page="merchants"]');
                if (nav) nav.click();
            }
        } else if (this.userType === 'merchant') {
            if (ev === 'MerchantOnboardingApproved') {
                if (notifObj && notifObj.payload && notifObj.payload.needs_topup && typeof window.openMerchantTopupModal === 'function') {
                    window.openMerchantTopupModal();
                } else if (typeof window.showPage === 'function') {
                    window.showPage('home');
                }
            } else if (ev === 'MerchantOnboardingUpdated') {
                if (typeof window.showPage === 'function') window.showPage('settings');
            } else if (ev === 'PendingPurchaseRequested') {
                if (typeof window.showPage === 'function') window.showPage('pending');
            } else if (ev === 'MerchantTopupApproved' || ev === 'MerchantContractUpdated' || ev.startsWith('MerchantBalance') || ev.includes('Topup')) {
                if (typeof window.showPage === 'function') window.showPage('financial');
            } else if (ev === 'DisputeTicketOpened' || ev.startsWith('MerchantComplaint')) {
                if (typeof window.openMerchantStage7Modal === 'function') window.openMerchantStage7Modal('support');
            }
        } else if (this.userType === 'member') {
            if (ev === 'PendingPurchaseRequested' || ev.includes('Transaction') || ev === 'PendingInvoiceRejected') {
                if (typeof window.goToPage === 'function') window.goToPage('myPending');
            } else if (ev === 'OnMemberRegistered') {
                if (typeof window.goToPage === 'function') window.goToPage('tree');
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
            MerchantBankTopupProofProcessed: '✅',
            MerchantFlashOfferPending: '🔥',
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
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    markAsRead: function (notificationId) {
        this.notifications = this.notifications.map(n => n.id === notificationId ? { ...n, is_read: true } : n);
        this.unreadCount = this.notifications.filter(n => !n.is_read).length;
        this.updateBadge();
        this.renderList();
        if (this.userType && this.userId && window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.markActorNotificationsRead === 'function') {
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
