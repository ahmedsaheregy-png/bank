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
        this.subscribeToRealtime();
    },

    hydrateFromBundle: function (items) {
        if (!Array.isArray(items)) return;
        this.notifications = items;
        this.unreadCount = items.filter(n => !n.is_read).length;
        this.updateBadge();
        this.renderList();
    },

    subscribeToRealtime: function () {
        if (!window.SAWYAN.supabase || !this.userId || this.subscription) return;
        const activeSchema = window.SAWYAN.schema || 'sawyan';

        try {
            this.subscription = window.SAWYAN.supabase
                .channel('notifications-' + activeSchema + '-' + this.userId)
                .on('postgres_changes',
                    {
                        event: 'INSERT',
                        schema: activeSchema,
                        table: 'notifications',
                        filter: 'recipient_id=eq.' + this.userId
                    },
                    (payload) => {
                        this.handleNewNotification(payload.new);
                    }
                )
                .subscribe();
        } catch (error) {
            console.warn('Notifications realtime warning:', error.message);
        }
    },

    _formatTitleAndBody: function (n) {
        if (n.title && n.message) {
            return { title: n.title, message: n.message };
        }
        const ev = n.event_name || 'Notification';
        const p = n.payload || {};
        const map = {
            OnMemberRegistered: {
                title: 'عضو جديد في شجرتك 🌟',
                message: `انضم ${p.full_name || 'عضو جديد'} بكود #${p.new_member_code || '-'}`
            },
            PendingPurchaseRequested: {
                title: 'طلب توثيق شراء معلق ⏳',
                message: `فاتورة ${p.sw_short_code || ''} بقيمة ${p.amount || ''}`
            },
            DisputeTicketOpened: {
                title: 'تذكرة نزاع جديدة ⚠️',
                message: `فاتورة ${p.sw_short_code || ''}`
            },
            CashierSelfPinBlocked: {
                title: 'تنبيه أمان الكاشير 🛡️',
                message: `تم إيقاف محاولة توثيق ذاتي للكاشير ${p.employee_code || ''}`
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

        const header = document.querySelector('.dashboard-header') || document.querySelector('.sidebar-header');
        if (header) {
            const bellContainer = document.createElement('div');
            bellContainer.className = 'notification-container';
            bellContainer.innerHTML = bellHTML;
            header.appendChild(bellContainer);
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
            return `<div class="notification-item ${readClass}" onclick="SAWYAN.Notifications.markAsRead('${n.id}')">
                <div class="notification-icon">${this.getIcon(n.event_name || n.notification_type)}</div>
                <div class="notification-content">
                    <div class="notification-title">${safeT}</div>
                    <div class="notification-message">${safeM}</div>
                    <div class="notification-time">${this.formatTime(n.created_at)}</div>
                </div>
            </div>`;
        }).join('');
    },

    getIcon: function (type) {
        const icons = {
            OnMemberRegistered: '🌟',
            PendingPurchaseRequested: '⏳',
            DisputeTicketOpened: '⚠️',
            CashierSelfPinBlocked: '🛡️',
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
    },

    markAllRead: function () {
        this.notifications = this.notifications.map(n => ({ ...n, is_read: true }));
        this.unreadCount = 0;
        this.updateBadge();
        this.renderList();
    }
};

document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('notificationDropdown');
    const bell = document.getElementById('notificationBell');
    if (dropdown && bell && !bell.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});
