// ============================================
// نظام الإشعارات - SAWYAN BANK
// مع دعم Real-time
// ============================================

window.SAWYAN = window.SAWYAN || {};

window.SAWYAN.Notifications = {
    // إعدادات
    userType: null,
    userId: null,
    unreadCount: 0,
    notifications: [],
    subscription: null,

    // تهيئة النظام
    init: function (userType, userId) {
        this.userType = userType;
        this.userId = userId;
        this.renderBell();
        this.loadNotifications();
        this.subscribeToRealtime();

        // تحديث كل 30 ثانية كـ fallback
        setInterval(() => this.loadNotifications(), 30000);
    },

    // الاشتراك في Real-time
    subscribeToRealtime: function () {
        if (!window.SAWYAN.supabase || !this.userId) return;

        try {
            this.subscription = window.SAWYAN.supabase
                .channel('notifications-' + this.userId)
                .on('postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'sawyan',
                        table: 'notifications',
                        filter: 'user_id=eq.' + this.userId
                    },
                    (payload) => {
                        console.log('🔔 New notification received:', payload);
                        this.handleNewNotification(payload.new);
                    }
                )
                .subscribe((status) => {
                    console.log('Real-time subscription status:', status);
                });
        } catch (error) {
            console.log('Real-time not available:', error);
        }
    },

    // معالجة إشعار جديد
    handleNewNotification: function (notification) {
        this.notifications.unshift(notification);
        this.unreadCount++;
        this.updateBadge();
        this.renderList();
        this.showToast(notification.title, notification.message);

        const bell = document.getElementById('notificationBell');
        if (bell) {
            bell.classList.add('has-notifications');
            setTimeout(() => bell.classList.remove('has-notifications'), 1000);
        }
    },

    // إظهار Toast notification
    showToast: function (title, message) {
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerHTML = '<div class="toast-icon">🔔</div><div class="toast-content"><div class="toast-title">' + title + '</div><div class="toast-message">' + message + '</div></div><button onclick="this.parentElement.remove()">×</button>';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    },

    // عرض جرس الإشعارات
    renderBell: function () {
        const bellHTML = '<div class="notification-bell" id="notificationBell" onclick="SAWYAN.Notifications.toggleDropdown()"><span class="bell-icon">🔔</span><span class="notification-badge" id="notificationBadge" style="display: none;">0</span></div><div class="notification-dropdown" id="notificationDropdown" style="display: none;"><div class="notification-header"><h4>الإشعارات</h4><button onclick="SAWYAN.Notifications.markAllRead()">تحديد الكل كمقروء</button></div><div class="notification-list" id="notificationList"><p class="empty-notifications">لا توجد إشعارات</p></div></div>';

        const header = document.querySelector('.dashboard-header') || document.querySelector('.sidebar-header');
        if (header) {
            const bellContainer = document.createElement('div');
            bellContainer.className = 'notification-container';
            bellContainer.innerHTML = bellHTML;
            header.appendChild(bellContainer);
        }
    },

    // تحميل الإشعارات
    loadNotifications: async function () {
        if (!this.userId || !window.SAWYAN.supabase) return;

        try {
            const { data, error } = await window.SAWYAN.supabase
                .from('notifications')
                .select('*')
                .eq('user_type', this.userType)
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) {
                console.log('Notifications table may not exist:', error.message);
                return;
            }

            this.notifications = data || [];
            this.unreadCount = this.notifications.filter(n => !n.is_read).length;
            this.updateBadge();
            this.renderList();

        } catch (error) {
            console.log('Error loading notifications:', error);
        }
    },

    // تحديث العداد
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

    // عرض قائمة الإشعارات
    renderList: function () {
        const list = document.getElementById('notificationList');
        if (!list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = '<p class="empty-notifications">لا توجد إشعارات</p>';
            return;
        }

        var html = '';
        for (var i = 0; i < this.notifications.length; i++) {
            var n = this.notifications[i];
            var readClass = n.is_read ? 'read' : 'unread';
            html += '<div class="notification-item ' + readClass + '" onclick="SAWYAN.Notifications.markAsRead(\'' + n.id + '\')">';
            html += '<div class="notification-icon">' + this.getIcon(n.notification_type) + '</div>';
            html += '<div class="notification-content">';
            html += '<div class="notification-title">' + n.title + '</div>';
            html += '<div class="notification-message">' + n.message + '</div>';
            html += '<div class="notification-time">' + this.formatTime(n.created_at) + '</div>';
            html += '</div></div>';
        }
        list.innerHTML = html;
    },

    // أيقونة حسب النوع
    getIcon: function (type) {
        var icons = {
            'transaction_request': '📝',
            'transaction_approved': '✅',
            'transaction_rejected': '❌',
            'commission': '💰',
            'welcome': '👋',
            'default': '🔔'
        };
        return icons[type] || icons['default'];
    },

    // تنسيق الوقت
    formatTime: function (timestamp) {
        var date = new Date(timestamp);
        var now = new Date();
        var diff = now - date;

        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return 'منذ ' + Math.floor(diff / 60000) + ' دقيقة';
        if (diff < 86400000) return 'منذ ' + Math.floor(diff / 3600000) + ' ساعة';
        return date.toLocaleDateString('ar-EG');
    },

    // فتح/إغلاق القائمة
    toggleDropdown: function () {
        var dropdown = document.getElementById('notificationDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    },

    // تحديد إشعار كمقروء
    markAsRead: async function (notificationId) {
        if (!window.SAWYAN.supabase) return;

        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            this.loadNotifications();
        } catch (error) {
            console.log('Error marking as read:', error);
        }
    },

    // تحديد الكل كمقروء
    markAllRead: async function () {
        if (!window.SAWYAN.supabase) return;

        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_type', this.userType)
                .eq('user_id', this.userId)
                .eq('is_read', false);

            this.loadNotifications();
        } catch (error) {
            console.log('Error marking all as read:', error);
        }
    },

    // إنشاء إشعار جديد
    create: async function (userType, userId, title, message, notificationType, referenceType, referenceId) {
        if (!window.SAWYAN.supabase) return;

        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: userType,
                    user_id: userId,
                    title: title,
                    message: message,
                    notification_type: notificationType,
                    reference_type: referenceType || null,
                    reference_id: referenceId || null
                }]);

            console.log('Notification created successfully');
        } catch (error) {
            console.log('Error creating notification:', error);
        }
    }
};

// إغلاق القائمة عند النقر خارجها
document.addEventListener('click', function (e) {
    var dropdown = document.getElementById('notificationDropdown');
    var bell = document.getElementById('notificationBell');
    if (dropdown && bell && !bell.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});
