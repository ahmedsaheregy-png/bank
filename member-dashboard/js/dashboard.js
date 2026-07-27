// لوحة العضو - مكتملة بكل الميزات
let currentUser = null;
let memberData = null;

// ===== شجرة SVG — متغيرات globals للـ zoom + popup =====
let _treePopupEl = null; // عنصر الـ popup الواحد
let _lastTreeId = null;  // آخر treeId اتعمل

function treeZoom(delta) {
    const svg = document.querySelector('#' + _lastTreeId + '_svg');
    const container = document.getElementById(_lastTreeId);
    if (!svg || !container) return;
    container._treeScale = Math.max(0.3, Math.min(2.5, (container._treeScale || 1) + delta));
    svg.style.transform = 'scale(' + container._treeScale + ')';
    svg.style.transformOrigin = 'top center';
}
function treeZoomReset() {
    const svg = document.querySelector('#' + _lastTreeId + '_svg');
    const container = document.getElementById(_lastTreeId);
    if (!svg || !container) return;
    container._treeScale = 1;
    svg.style.transform = 'scale(1)';
}

function initTreeInteractions(treeId, membersData) {
    const container = document.getElementById(treeId);
    const svg = document.querySelector('#' + treeId + '_svg');
    if (!container || !svg) return;
    _lastTreeId = treeId;

    // إنشاء popup لو مش موجود
    if (!_treePopupEl) {
        _treePopupEl = document.createElement('div');
        _treePopupEl.className = 'tree-popup';
        _treePopupEl.innerHTML = '';
        document.body.appendChild(_treePopupEl);
    }

    // Wheel zoom
    container.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        treeZoom(delta);
    }, { passive: false });

    // Hover popup على كل النودات
    const allNodes = container.querySelectorAll('.tree-node-g[data-member-id]');
    allNodes.forEach(function(nodeG) {
        nodeG.addEventListener('mouseenter', function(e) {
            const mid = this.getAttribute('data-member-id');
            const member = membersData.find(function(m) { return String(m.id) === mid; });
            if (!member) return;
            _treePopupEl.innerHTML =
                '<h4>' + member.name + '</h4>' +
                '<div class="row"><span class="label">الكود</span><span class="value">#' + member.code + '</span></div>' +
                '<div class="row"><span class="label">الجيل</span><span class="value">' + member.level + '</span></div>' +
                '<div class="row"><span class="label">العمق</span><span class="value">' + member.depth + '</span></div>' +
                '<div class="row"><span class="label">الجهة</span><span class="value">' + (member.pos === 'left' ? 'يسار ⬅️' : member.pos === 'right' ? 'يمين ➡️' : '—') + '</span></div>';
            _treePopupEl.classList.add('show');
        });
        nodeG.addEventListener('mousemove', function(e) {
            _treePopupEl.style.left = (e.clientX + 16) + 'px';
            _treePopupEl.style.top = (e.clientY - 10) + 'px';
        });
        nodeG.addEventListener('mouseleave', function() {
            _treePopupEl.classList.remove('show');
        });
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.icon();
    }

    await checkAuth();
    await loadStats();
    await generateQRCode();
    await loadRecentTransactions();

    // تفعيل القائمة الجانبية
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });

    // تفعيل Bottom Navigation للموبايل
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', handleBottomNav);
    });
});

async function checkAuth() {
    // التحقق من localStorage
    const savedMember = localStorage.getItem('sawyan_member');
    if (!savedMember) {
        window.location.href = 'login.html';
        return;
    }

    try {
        memberData = JSON.parse(savedMember);
        currentUser = { id: memberData.id };

        // تحديث واجهة المستخدم
        document.getElementById('userName').textContent = memberData.full_name || 'عضو';
        document.getElementById('memberCode').textContent = 'كود العضوية: ' + memberData.member_code;
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('sawyan_member');
        window.location.href = 'login.html';
    }
}

async function loadStats() {
    try {
        // رصيد المحفظة
        const { data: wallet } = await window.SAWYAN.supabase
            .from('wallets')
            .select('balance, pending_balance')
            .eq('member_id', currentUser.id)
            .single();

        if (wallet) {
            document.getElementById('walletBalance').textContent = wallet.balance.toFixed(2) + ' ج.م';
        }

        // إجمالي العمليات
        const { count: transCount } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('member_id', currentUser.id);

        document.getElementById('totalTransactions').textContent = transCount || 0;

        // حجم الفريق (الشجرة الثنائية الكاملة — مش بس المباشرين)
        try {
            const teamSizeValue = await window.SAWYAN_TREE.getTeamSize(currentUser.id, 20);
            document.getElementById('teamSize').textContent = teamSizeValue || 1;
        } catch (teamErr) {
            console.warn('getTeamSize RPC failed, fallback to sponsor_id count:', teamErr);
            const { count: teamCount } = await window.SAWYAN.supabase
                .from('members')
                .select('*', { count: 'exact', head: true })
                .eq('sponsor_id', currentUser.id);
            document.getElementById('teamSize').textContent = (teamCount || 0) + 1;
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadRecentTransactions() {
    try {
        const { data: transactions } = await window.SAWYAN.supabase
            .from('transactions')
            .select(`
                *,
                merchants(business_name)
            `)
            .eq('member_id', currentUser.id)
            .order('transaction_date', { ascending: false })
            .limit(5);

        const container = document.getElementById('recentTransactionsList');

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<p class="empty-state">لا توجد عمليات بعد</p>';
            return;
        }

        container.innerHTML = transactions.map(t => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-merchant">${t.merchants?.business_name || 'تاجر'}</div>
                    <div class="transaction-date">${new Date(t.transaction_date).toLocaleDateString('ar-EG')}</div>
                </div>
                <div class="transaction-amount">${parseFloat(t.total_amount).toFixed(2)} ج.م</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error:', error);
    }
}

async function generateQRCode() {
    try {
        if (memberData && window.QRCode) {
            const qrContainer = document.getElementById('qrCode');
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: memberData.member_code,
                width: 200,
                height: 200,
                colorDark: '#10B981',
                colorLight: '#ffffff'
            });
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

function handleNavigation(e) {
    e.preventDefault();
    const page = this.dataset.page;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    this.classList.add('active');

    // إغلاق الـ Sidebar على الموبايل بعد الضغط
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
    }

    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
    }

    document.getElementById('pageTitle').textContent = this.querySelector('span:last-child').textContent;

    // تحميل محتوى الصفحة
    if (page === 'myPending') loadMyPendingRequests();
    if (page === 'transactions') loadAllTransactions();
    if (page === 'tree') loadTree();
    if (page === 'wallet') loadWalletDetails();
    if (page === 'commissionReports') loadCommissionReports();
    if (page === 'academy') loadAcademy();
    if (page === 'merchants') loadNearbyMerchants();
    if (page === 'favorites') loadFavorites();
    if (page === 'crm') loadCRM();
    if (page === 'referrals') loadReferrals();
    if (page === 'settings') loadSettings();
}

// دالة التنقل عبر Bottom Navigation
function handleBottomNav(e) {
    e.preventDefault();
    const page = this.dataset.page;

    // تحديث الأيقونة النشطة في Bottom Nav
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    this.classList.add('active');

    // تحديث القائمة الجانبية أيضاً (للتزامن)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // تغيير الصفحة
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
    }

    // تحديث العنوان
    const pageNames = {
        'home': 'لوحة التحكم',
        'merchants': 'التجار',
        'wallet': 'المحفظة',
        'settings': 'الإعدادات'
    };
    document.getElementById('pageTitle').textContent = pageNames[page] || 'لوحة التحكم';

    // تحميل محتوى الصفحة
    if (page === 'wallet') loadWalletDetails();
    if (page === 'merchants') loadNearbyMerchants();
    if (page === 'settings') loadSettings();
}

// ===== قائمة المزيد (More Menu) =====
function toggleMoreMenu(e) {
    e.preventDefault();
    const menu = document.getElementById('moreMenu');
    menu.classList.toggle('open');

    // إظهار/إخفاء التراكب
    let overlay = document.querySelector('.more-menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'more-menu-overlay';
        overlay.onclick = closeMoreMenu;
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('open');
}

function closeMoreMenu() {
    document.getElementById('moreMenu').classList.remove('open');
    const overlay = document.querySelector('.more-menu-overlay');
    if (overlay) overlay.classList.remove('open');
}

function goToPage(pageName) {
    closeMoreMenu();

    // تحديث الصفحة
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageElement = document.getElementById(pageName + 'Page');
    if (pageElement) pageElement.classList.add('active');

    // تحديث الأيقونات
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) item.classList.add('active');
    });
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // تحديث العنوان
    const titles = {
        'myPending': 'طلباتي المعلقة',
        'transactions': 'العمليات المكتملة',
        'tree': 'شجرتي',
        'favorites': 'المفضلة',
        'academy': 'الأكاديمية',
        'crm': 'قائمة المعارف',
        'referrals': 'رابط الإحالة',
        'settings': 'الإعدادات'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || 'لوحة التحكم';

    // تحميل المحتوى
    if (pageName === 'myPending') loadMyPendingRequests();
    if (pageName === 'transactions') loadAllTransactions();
    if (pageName === 'tree') loadTree();
    if (pageName === 'favorites') loadFavorites();
    if (pageName === 'academy') loadAcademy();
    if (pageName === 'crm') loadCRM();
    if (pageName === 'referrals') loadReferrals();
    if (pageName === 'settings') loadSettings();
}

// ===== صفحة طلباتي المعلقة =====
async function loadMyPendingRequests() {
    const page = document.getElementById('myPendingPage');
    page.innerHTML = '<h2>طلباتي المعلقة</h2><p class="page-description">متابعة حالة طلبات التوثيق الخاصة بك</p><div id="myPendingList"><p>جاري التحميل...</p></div>';

    try {
        const { data: requests, error } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*, merchants(business_name)')
            .eq('member_id', currentUser.id)
            .in('status', ['pending', 'rejected'])
            .order('created_at', { ascending: false });

        console.log('My pending requests:', requests);

        const list = document.getElementById('myPendingList');

        if (error) {
            list.innerHTML = '<p class="empty-state">حدث خطأ في جلب البيانات</p>';
            return;
        }

        if (!requests || requests.length === 0) {
            list.innerHTML = '<p class="empty-state">لا توجد طلبات معلقة 🎉<br><small>جميع طلباتك تمت معالجتها</small></p>';
            return;
        }

        var html = '';
        for (var i = 0; i < requests.length; i++) {
            var r = requests[i];
            var statusClass = r.status === 'pending' ? 'status-pending' : 'status-rejected';
            var statusText = r.status === 'pending' ? '⏳ في انتظار موافقة التاجر' : '❌ تم الرفض';
            var statusIcon = r.status === 'pending' ? '🟡' : '🔴';

            html += '<div class="pending-request-card ' + statusClass + '">';
            html += '<div class="request-status">' + statusIcon + ' ' + statusText + '</div>';
            html += '<div class="request-details">';
            html += '<p><strong>التاجر:</strong> ' + (r.merchants ? r.merchants.business_name : '-') + '</p>';
            html += '<p><strong>المبلغ:</strong> ' + parseFloat(r.total_amount).toFixed(2) + ' ج.م</p>';
            html += '<p><strong>العمولة المتوقعة:</strong> ' + parseFloat(r.commission_amount).toFixed(2) + ' ج.م</p>';
            html += '<p><strong>التاريخ:</strong> ' + new Date(r.created_at).toLocaleString('ar-EG') + '</p>';
            html += '<p><strong>كود العملية:</strong> ' + r.transaction_code + '</p>';
            html += '</div></div>';
        }
        list.innerHTML = html;

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('myPendingList').innerHTML = '<p class="empty-state">حدث خطأ</p>';
    }
}

// ===== صفحة العمليات المكتملة =====
async function loadAllTransactions() {
    const page = document.getElementById('transactionsPage');
    page.innerHTML = '<h2>العمليات المكتملة</h2><p class="page-description">العمليات التي تمت الموافقة عليها وأُضيفت عمولتها لمحفظتك</p><div id="allTransactionsList"></div>';

    const { data: transactions } = await window.SAWYAN.supabase
        .from('transactions')
        .select('*, merchants(business_name)')
        .eq('member_id', currentUser.id)
        .eq('status', 'completed')
        .order('transaction_date', { ascending: false });

    const list = document.getElementById('allTransactionsList');
    if (!transactions || transactions.length === 0) {
        list.innerHTML = '<p class="empty-state">لا توجد عمليات مكتملة بعد</p>';
        return;
    }

    var html = '';
    for (var i = 0; i < transactions.length; i++) {
        var t = transactions[i];
        html += '<div class="transaction-card completed">';
        html += '<div class="transaction-status">✅ مكتملة</div>';
        html += '<div><strong>التاجر:</strong> ' + (t.merchants ? t.merchants.business_name : '-') + '</div>';
        html += '<div><strong>المبلغ:</strong> ' + parseFloat(t.total_amount).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>العمولة:</strong> ' + parseFloat(t.commission_amount).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>التاريخ:</strong> ' + new Date(t.transaction_date).toLocaleDateString('ar-EG') + '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
}

async function loadTree() {
    const page = document.getElementById('treePage');
    page.innerHTML = `
        <h2 class="page-title-mobile">🌳 شجرتي في الشبكة</h2>
        <div id="treeContent"><p style="text-align:center; padding:40px; color:#9ca3af;">⏳ بتحميل الشجرة...</p></div>
    `;

    const content = document.getElementById('treeContent');

    try {
        // جلب بياناتي الكاملة (مع parent + children)
        const me = await window.SAWYAN_TREE.getMemberWithSlots(currentUser.id);

        if (!me) {
            content.innerHTML = '<p class="empty-state">❌ ما ينفعش نحمّل بياناتك. حاول تاني.</p>';
            return;
        }

        // جلب downline كامل (لحد 20 جيل)
        const downline = await window.SAWYAN_TREE.getDownline(currentUser.id, 20);

        // جلب uplines (للعرض)
        const uplines = await window.SAWYAN_TREE.getUplines(currentUser.id, 11);

        // جلب اللي جبتهم أنا (real downline = sponsor_id = me)
        const { data: myReferrals } = await window.SAWYAN.supabase
            .from('members')
            .select('id, member_code, full_name')
            .eq('sponsor_id', currentUser.id);

        // إحصائيات
        const teamSize = downline.length; // get_downline بيشمل العضو نفسه (depth: 0)
        const directReferrals = myReferrals?.length || 0;

        // أحجام الفروع (pos مش position — RPC بيرجع pos)
        const leftCount = downline.filter(d => d.pos === 'left').length;
        const rightCount = downline.filter(d => d.pos === 'right').length;

        content.innerHTML = `
            <!-- إحصائيات سريعة -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
                <div style="background:linear-gradient(135deg, #10b981, #059669); color:white; padding:16px; border-radius:12px;">
                    <div style="font-size:13px; opacity:0.9;">موقعك في الشبكة</div>
                    <div style="font-size:20px; font-weight:bold; margin-top:4px;">الجيل ${me.tree_level}</div>
                    <div style="font-size:11px; opacity:0.8; margin-top:4px;">${me.parent_id ? 'محطوط ' + (me.position === 'left' ? 'يسار' : 'يمين') : '🏆 الجذر'}</div>
                </div>
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                    <div style="font-size:13px; color:#6b7280;">حجم فريقك</div>
                    <div style="font-size:24px; font-weight:bold; color:#047857; margin-top:4px;">${teamSize}</div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:4px;">(شاملك)</div>
                </div>
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                    <div style="font-size:13px; color:#6b7280;">اللي جبتهم بنفسك</div>
                    <div style="font-size:24px; font-weight:bold; color:#7c3aed; margin-top:4px;">${directReferrals}</div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:4px;">Real Downline</div>
                </div>
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                    <div style="font-size:13px; color:#6b7280;">أبلاينز فوقك</div>
                    <div style="font-size:24px; font-weight:bold; color:#0891b2; margin-top:4px;">${uplines.length}</div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:4px;">في نطاق الستوبر</div>
                </div>
            </div>

            <!-- أحجام الفروع -->
            <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:20px;">
                <h3 style="font-size:15px; margin-bottom:12px;">⚖️ توزيع الفروع</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div style="text-align:center; padding:16px; background:#eff6ff; border-radius:10px; border:1px solid #bfdbfe;">
                        <div style="font-size:28px;">⬅️</div>
                        <div style="font-size:24px; font-weight:bold; color:#1e40af; margin-top:4px;">${leftCount}</div>
                        <div style="font-size:12px; color:#1e3a8a;">الفرع الأيسر</div>
                    </div>
                    <div style="text-align:center; padding:16px; background:#fef3c7; border-radius:10px; border:1px solid #fde68a;">
                        <div style="font-size:28px;">➡️</div>
                        <div style="font-size:24px; font-weight:bold; color:#92400e; margin-top:4px;">${rightCount}</div>
                        <div style="font-size:12px; color:#78350f;">الفرع الأيمن</div>
                    </div>
                </div>
            </div>

            <!-- الأبلاينز (مين فوقك) -->
            ${uplines.length > 0 ? `
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:20px;">
                    <h3 style="font-size:15px; margin-bottom:12px;">⬆️ الأبلاينز (مين فوقك)</h3>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f0fdf4; border-radius:8px; font-size:13px;">
                            <span style="background:#10b981; color:white; padding:2px 8px; border-radius:6px; font-weight:bold;">أنت</span>
                            <strong>${me.full_name}</strong>
                            <span style="color:#6b7280;">#${me.member_code}</span>
                        </div>
                        ${uplines.map((u, idx) => `
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="color:#9ca3af;">↑</span>
                                <div style="padding:8px 12px; background:#f9fafb; border-radius:8px; font-size:13px; border:1px solid #e5e7eb;">
                                    <strong>${u.full_name}</strong>
                                    <span style="color:#6b7280;">#${u.member_code}</span>
                                    <span style="color:#9ca3af; font-size:11px; margin-right:4px;">(جيل ${u.generation})</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- الشجرة المرئية -->
            <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:20px;">
                <h3 style="font-size:15px; margin-bottom:12px;">🌳 الشجرة (مع نتائجك)</h3>
                ${renderTreeView(me, downline)}
            </div>

            <!-- قائمة كل الفريق -->
            <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                <h3 style="font-size:15px; margin-bottom:12px;">👥 كل أعضاء فريقك (${downline.length})</h3>
                ${downline.length === 0 ? `
                    <div style="text-align:center; padding:30px; color:#9ca3af;">
                        <div style="font-size:48px; margin-bottom:10px;">🌱</div>
                        <p>لسه مفيش أعضاء في فريقك. ابدأ بإضافة عضو جديد من صفحة الإحالات.</p>
                    </div>
                ` : `
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f9fafb; text-align:right;">
                                    <th style="padding:8px; border-bottom:2px solid #e5e7eb;">الكود</th>
                                    <th style="padding:8px; border-bottom:2px solid #e5e7eb;">الاسم</th>
                                    <th style="padding:8px; border-bottom:2px solid #e5e7eb;">الجيل</th>
                                    <th style="padding:8px; border-bottom:2px solid #e5e7eb;">العمق</th>
                                    <th style="padding:8px; border-bottom:2px solid #e5e7eb;">الجهة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${downline.map(d => `
                                    <tr style="border-bottom:1px solid #f3f4f6;">
                                        <td style="padding:8px; font-weight:bold;">#${d.member_code}</td>
                                        <td style="padding:8px;">${d.full_name}</td>
                                        <td style="padding:8px; text-align:center;">${d.tree_level}</td>
                                        <td style="padding:8px; text-align:center;">${d.depth}</td>
                                        <td style="padding:8px; text-align:center;">${d.pos === 'left' ? '⬅️ يسار' : d.pos === 'right' ? '➡️ يمين' : '—'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;

        // تنشيط Zoom + Popup بعد الـ innerHTML (scripts جوة innerHTML مااتنفّذش)
        if (window._treeRenderData) {
            initTreeInteractions(window._treeRenderData.treeId, window._treeRenderData.membersData);
        }

    } catch (err) {
        console.error('loadTree error:', err);
        content.innerHTML = `<p class="empty-state">❌ حصل خطأ: ${err.message}</p>`;
    }
}

// Helper: شجرة SVG بدوائر + خطوط + popup + zoom — مثل السيميوليشن
function renderTreeView(me, downline) {
    const allMembers = downline;

    // حساب أقصى عمق فعلي
    let actualMaxDepth = 0;
    allMembers.forEach(m => {
        if (m.depth !== undefined && m.depth > actualMaxDepth) actualMaxDepth = m.depth;
    });

    // بناء خريطة parent → children
    const childrenMap = {};
    allMembers.forEach(m => {
        const pid = String(m.parent_id);
        if (!childrenMap[pid]) childrenMap[pid] = { left: null, right: null };
        const side = m.pos || m.position || 'left';
        if (!childrenMap[pid][side]) childrenMap[pid][side] = m;
    });

    function countDescendants(memberId) {
        const ch = childrenMap[String(memberId)];
        let count = 0;
        if (ch) {
            if (ch.left) count += 1 + countDescendants(ch.left.id);
            if (ch.right) count += 1 + countDescendants(ch.right.id);
        }
        return count;
    }

    // ===== حساب الـ positions لكل نود =====
    const nodeRadius = 38;
    const levelGap = 110;
    const baseSpacing = 120;
    const positions = {}; // id → { x, y }
    const nodesData = []; // for SVG rendering

    // أول حساب العرض المطلوب لكل subtree
    function subtreeWidth(memberId, depth) {
        const ch = childrenMap[String(memberId)];
        if (!ch || (!ch.left && !ch.right)) return baseSpacing;
        const lw = ch.left ? subtreeWidth(ch.left.id, depth + 1) : baseSpacing;
        const rw = ch.right ? subtreeWidth(ch.right.id, depth + 1) : baseSpacing;
        return lw + rw;
    }

    function assignPositions(member, x, y, depth, side) {
        const id = member ? String(member.id) : 'empty_' + x + '_' + y;
        positions[id] = { x, y };

        if (member) {
            nodesData.push({
                id: member.id, x, y, member, depth, side,
                isMe: member.id === me.id,
                name: member.full_name || 'بدون اسم',
                code: member.member_code || '?',
                treeLevel: member.tree_level || '-',
                pos: member.pos || member.position || '-',
                descCount: countDescendants(member.id)
            });
        } else {
            nodesData.push({ id, x, y, member: null, depth, side, isEmpty: true });
        }

        if (!member) return;
        const ch = childrenMap[String(member.id)];
        if (!ch) return;

        const totalW = subtreeWidth(member.id, depth);
        const lw = ch.left ? subtreeWidth(ch.left.id, depth + 1) : baseSpacing;
        const rw = ch.right ? subtreeWidth(ch.right.id, depth + 1) : baseSpacing;
        const startX = x - totalW / 2;

        if (ch.left) {
            assignPositions(ch.left, startX + lw / 2, y + levelGap, depth + 1, 'left');
        } else {
            const emptyX = startX + baseSpacing / 2;
            nodesData.push({ id: 'empty_L_' + member.id, x: emptyX, y: y + levelGap, member: null, depth: depth + 1, side: 'left', isEmpty: true });
        }
        if (ch.right) {
            assignPositions(ch.right, startX + lw + rw / 2, y + levelGap, depth + 1, 'right');
        } else {
            const emptyX = startX + lw + baseSpacing / 2;
            nodesData.push({ id: 'empty_R_' + member.id, x: emptyX, y: y + levelGap, member: null, depth: depth + 1, side: 'right', isEmpty: true });
        }
    }

    const treeWidth = subtreeWidth(me.id, 0);
    assignPositions(me, treeWidth / 2, 60, 0, null);

    const svgWidth = treeWidth + 100;
    const svgHeight = (actualMaxDepth + 1) * levelGap + 120;

    // ===== بناء SVG =====
    let svgLines = '';
    let svgNodes = '';

    // الخطوط بين الأب والأبناء
    allMembers.forEach(m => {
        const ch = childrenMap[String(m.id)];
        if (!ch) return;
        const parentPos = positions[String(m.id)];
        if (!parentPos) return;
        [ch.left, ch.right].forEach(child => {
            if (!child) return;
            const childPos = positions[String(child.id)];
            if (!childPos) return;
            // خط من أسفل الدائرة للأب لفوق الدائرة للابن
            const x1 = parentPos.x, y1 = parentPos.y + nodeRadius;
            const x2 = childPos.x, y2 = childPos.y - nodeRadius;
            const sideColor = (ch.left && ch.left.id === child.id) ? '#3b82f6' : '#f59e0b';
            svgLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sideColor}" stroke-width="2.5" stroke-opacity="0.5"/>`;
        });
    });

    // النودات
    nodesData.forEach(nd => {
        if (nd.isEmpty) {
            // دائرة فاضية
            svgNodes += `
                <g>
                    <circle cx="${nd.x}" cy="${nd.y}" r="${nodeRadius - 6}" fill="#f9fafb" stroke="#d1d5db" stroke-width="2" stroke-dasharray="6,4"/>
                    <text x="${nd.x}" y="${nd.y - 4}" text-anchor="middle" fill="#9ca3af" font-size="11" font-family="Tajawal, sans-serif">+</text>
                    <text x="${nd.x}" y="${nd.y + 12}" text-anchor="middle" fill="#9ca3af" font-size="10" font-family="Tajawal, sans-serif">${nd.side === 'left' ? 'يسار' : 'يمين'}</text>
                </g>`;
        } else {
            const fillColor = nd.isMe ? '#10b981' : (nd.side === 'left' ? '#3b82f6' : nd.side === 'right' ? '#f59e0b' : '#6b7280');
            const strokeColor = nd.isMe ? '#059669' : fillColor;
            const textColor = nd.isMe ? '#fff' : '#fff';
            const nameShort = nd.name.length > 14 ? nd.name.substring(0, 14) + '..' : nd.name;

            svgNodes += `
                <g class="tree-node-g" data-member-id="${nd.id}" style="cursor:pointer;">
                    <!-- ظل -->
                    <circle cx="${nd.x}" cy="${nd.y}" r="${nodeRadius + 2}" fill="${fillColor}" fill-opacity="0.15"/>
                    <!-- الدائرة -->
                    <circle cx="${nd.x}" cy="${nd.y}" r="${nodeRadius}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${nd.isMe ? 3 : 2}" class="tree-circle"/>
                    <!-- الاسم -->
                    <text x="${nd.x}" y="${nd.y - 6}" text-anchor="middle" fill="${textColor}" font-size="13" font-weight="bold" font-family="Tajawal, sans-serif">${nameShort}</text>
                    <!-- الكود -->
                    <text x="${nd.x}" y="${nd.y + 10}" text-anchor="middle" fill="${textColor}" fill-opacity="0.85" font-size="11" font-family="Tajawal, sans-serif">#${nd.code}</text>
                    ${nd.descCount > 0 ? `<text x="${nd.x}" y="${nd.y + 24}" text-anchor="middle" fill="${textColor}" fill-opacity="0.7" font-size="10" font-family="Tajawal, sans-serif">+${nd.descCount}</text>` : ''}
                    ${nd.isMe ? `<text x="${nd.x}" y="${nd.y - 22}" text-anchor="middle" fill="#10b981" font-size="12" font-weight="bold" font-family="Tajawal, sans-serif">⭐</text>` : ''}
                </g>`;
        }
    });

    // CSS للشجرة — direction:ltr عشان اليسار يكون فعلاً على الشمال
    const treeId = 'svgTree_' + Date.now();
    const treeCSS = `
    <style>
        .tree-svg-container {
            direction: ltr;
            overflow: auto;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            background: #fafbfc;
            position: relative;
        }
        .tree-svg-container svg { display: block; margin: 0 auto; }
        .tree-node-g:hover .tree-circle {
            filter: drop-shadow(0 0 8px rgba(16,185,129,0.5));
            stroke-width: 3.5;
            transition: all 0.2s;
        }
        .tree-node-g:hover { cursor: pointer; }
        .tree-popup {
            position: fixed;
            z-index: 10000;
            background: #1e293b;
            color: #e2e8f0;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            font-family: Tajawal, sans-serif;
            font-size: 14px;
            direction: rtl;
            min-width: 200px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            border: 1px solid rgba(148,163,184,0.2);
        }
        .tree-popup.show { opacity: 1; }
        .tree-popup h4 { color: #10b981; margin-bottom: 8px; font-size: 16px; }
        .tree-popup .row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; border-bottom: 1px solid rgba(148,163,184,0.1); }
        .tree-popup .row:last-child { border-bottom: none; }
        .tree-popup .label { color: #94a3b8; }
        .tree-popup .value { color: #f1f5f9; font-weight: bold; }
        .tree-zoom-controls {
            position: absolute; top: 12px; left: 12px; z-index: 100;
            display: flex; flex-direction: column; gap: 4px;
        }
        .tree-zoom-btn {
            width: 36px; height: 36px; border-radius: 8px; border: 1px solid #d1d5db;
            background: #fff; color: #374151; font-size: 20px; font-weight: bold;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.15s;
        }
        .tree-zoom-btn:hover { background: #f3f4f6; border-color: #9ca3af; }
        .tree-legend {
            display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;
            padding: 10px 0; font-size: 13px; color: #6b7280;
        }
        .tree-legend-item { display: flex; align-items: center; gap: 6px; }
        .tree-legend-dot { width: 14px; height: 14px; border-radius: 50%; }
    </style>`;

    // حفظ treeId + membersData في global عشان initTreeInteractions ياخدهم
    window._treeRenderData = {
        treeId: treeId,
        membersData: allMembers.filter(m => m.id).map(m => ({
            id: String(m.id), name: m.full_name, code: m.member_code,
            level: m.tree_level, depth: m.depth, pos: m.pos || m.position
        }))
    };

    return `
    ${treeCSS}
    <div class="tree-legend">
        <div class="tree-legend-item"><div class="tree-legend-dot" style="background:#10b981;"></div> أنت</div>
        <div class="tree-legend-item"><div class="tree-legend-dot" style="background:#3b82f6;"></div> فرع يسار</div>
        <div class="tree-legend-item"><div class="tree-legend-dot" style="background:#f59e0b;"></div> فرع يمين</div>
        <div class="tree-legend-item"><div class="tree-legend-dot" style="background:#f9fafb; border:2px dashed #d1d5db;"></div> مكان فاضي</div>
    </div>
    <div class="tree-svg-container" id="${treeId}" style="max-height:600px;">
        <div class="tree-zoom-controls">
            <button class="tree-zoom-btn" onclick="treeZoom(0.15)">+</button>
            <button class="tree-zoom-btn" onclick="treeZoom(-0.15)">−</button>
            <button class="tree-zoom-btn" style="font-size:14px;" onclick="treeZoomReset()">↺</button>
        </div>
        <svg id="${treeId}_svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
                </filter>
            </defs>
            ${svgLines}
            ${svgNodes}
        </svg>
    </div>
    <p style="text-align:center; color:#9ca3af; font-size:12px; margin-top:8px;">
        📊 ${actualMaxDepth + 1} مستوى — وقف على أي دائرة عشان تشوف بيانات العضو — scroll + zoom للتصفح
    </p>`;
}

// ============================================================================
// 📊 تقارير عمولاتي (Commission Reports)
// ============================================================================

async function loadCommissionReports() {
    const page = document.getElementById('commissionReportsPage');
    page.innerHTML = `
        <h2 class="page-title-mobile">📊 تقارير عمولاتي</h2>
        <div id="commissionReportsContent">
            <p style="text-align:center; padding:40px; color:#9ca3af;">⏳ بتحميل التقارير...</p>
        </div>
    `;

    const content = document.getElementById('commissionReportsContent');

    try {
        // جلب كل توزيعات العمولات اللي أنا مستفيد فيها
        const { data: commissions, error } = await window.SAWYAN.supabase
            .from('commission_distributions')
            .select(`
                id, amount, level, percentage, is_stopper,
                created_at,
                pool_transactions!inner(
                    id, member_id, amount, pool_amount,
                    created_at,
                    members!inner(member_code, full_name)
                )
            `)
            .eq('beneficiary_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        // إحصائيات
        const totalCommissions = commissions?.length || 0;
        const totalAmount = commissions?.reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;
        const asBuyer = commissions?.filter(c => c.level === 0).length || 0;
        const asUpline = commissions?.filter(c => c.level > 0).length || 0;

        // عمولات آخر 7 أيام
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const last7days = commissions?.filter(c => c.created_at >= sevenDaysAgo) || [];
        const last7daysAmount = last7days.reduce((sum, c) => sum + parseFloat(c.amount), 0);

        // إجمالي الفائض اللي ساهمت فيه (عبر كل المعاملات اللي اشتريتها أو في فريقك)
        let totalSurplusContributed = 0;
        const processedPoolTxIds = new Set();
        if (commissions) {
            for (const c of commissions) {
                if (!processedPoolTxIds.has(c.pool_transactions.id)) {
                    // surplus stored separately in surplus_distributions table
                    processedPoolTxIds.add(c.pool_transactions.id);
                }
            }
        }

        content.innerHTML = `
            <!-- بطاقات الإحصائيات -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
                <div style="background:linear-gradient(135deg, #10b981, #059669); color:white; padding:16px; border-radius:12px;">
                    <div style="font-size:13px; opacity:0.9;">إجمالي العمولات</div>
                    <div style="font-size:24px; font-weight:bold; margin-top:4px;">${totalAmount.toFixed(2)}</div>
                    <div style="font-size:11px; opacity:0.8; margin-top:4px;">ج.م (${totalCommissions} عملية توزيع)</div>
                </div>
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                    <div style="font-size:13px; color:#6b7280;">آخر 7 أيام</div>
                    <div style="font-size:24px; font-weight:bold; color:#047857; margin-top:4px;">${last7daysAmount.toFixed(2)}</div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:4px;">ج.م (${last7days.length} عملية)</div>
                </div>
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                    <div style="font-size:13px; color:#6b7280;">كمشتري</div>
                    <div style="font-size:24px; font-weight:bold; color:#0891b2; margin-top:4px;">${asBuyer}</div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:4px;">عملية شراء</div>
                </div>
                <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                    <div style="font-size:13px; color:#6b7280;">كأبلاين</div>
                    <div style="font-size:24px; font-weight:bold; color:#7c3aed; margin-top:4px;">${asUpline}</div>
                    <div style="font-size:11px; color:#9ca3af; margin-top:4px;">من فريقي</div>
                </div>
            </div>

            <!-- فائض ساهمت فيه -->
            <div style="background:#fef3c7; padding:16px; border-radius:12px; border:1px solid #fde68a; margin-bottom:20px;">
                <h3 style="font-size:15px; margin-bottom:8px; color:#92400e;">💡 الفائض اللي ساهمت فيه</h3>
                <p style="font-size:13px; color:#78350f; margin-bottom:8px; line-height:1.6;">
                    لما بتشتري أو حد في فريقك يشتري، العمولة بتدخل البول وبيتوزّع جزء منها على المستفيدين.
                    باقي المبلغ = <strong>فائض</strong> بيتم تجميعه، وحيتوزّع على الأعضاء لاحقاً (الآلية قيد التحديد).
                </p>
                <div style="font-size:20px; font-weight:bold; color:#92400e;">
                    ${totalSurplusContributed.toFixed(2)} ج.م
                </div>
                <div style="font-size:11px; color:#a16207; margin-top:4px;">
                    من ${processedPoolTxIds.size} معاملة مختلفة
                </div>
            </div>

            <!-- جدول العمولات التفصيلي -->
            <div style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
                <h3 style="font-size:15px; margin-bottom:12px;">📋 سجل العمولات التفصيلي</h3>
                ${(!commissions || commissions.length === 0) ? `
                    <div style="text-align:center; padding:40px; color:#9ca3af;">
                        <div style="font-size:48px; margin-bottom:10px;">📭</div>
                        <p>مفيش عمولات لحد دلوقتي. لما تشتري أو حد في فريقك يشتري، حتظهر العمولات هنا.</p>
                    </div>
                ` : `
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f9fafb; text-align:right;">
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">التاريخ</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">المشتري</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">دورك</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">حصتك</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">إجمالي البول</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">عدد المستفيدين</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الفائض</th>
                                    <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الحالة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${commissions.map(c => {
                                    const pt = c.pool_transactions;
                                    const buyer = pt.members;
                                    const isMe = c.level === 0;
                                    return `
                                        <tr style="border-bottom:1px solid #f3f4f6;">
                                            <td style="padding:10px; font-size:12px; color:#6b7280;">
                                                ${new Date(c.created_at).toLocaleDateString('ar-EG')}
                                                <div style="font-size:11px;">${new Date(c.created_at).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})}</div>
                                            </td>
                                            <td style="padding:10px;">
                                                ${isMe ? '<span style="color:#0891b2; font-weight:bold;">أنت</span>' : `#${buyer.member_code} - ${buyer.full_name}`}
                                            </td>
                                            <td style="padding:10px; text-align:center;">
                                                ${isMe
                                                    ? '<span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:6px; font-size:11px;">🛒 مشتري</span>'
                                                    : `<span style="background:#f3e8ff; color:#6b21a8; padding:2px 8px; border-radius:6px; font-size:11px;">⭐ أبلاين #${c.level}</span>`
                                                }
                                            </td>
                                            <td style="padding:10px; text-align:center; font-weight:bold; color:#047857;">
                                                ${parseFloat(c.amount).toFixed(2)}
                                            </td>
                                            <td style="padding:10px; text-align:center; color:#6b7280;">
                                                ${parseFloat(pt.pool_amount).toFixed(2)}
                                            </td>
                                            <td style="padding:10px; text-align:center;">
                                                ${c.level + 1}
                                            </td>
                                            <td style="padding:10px; text-align:center; color:#92400e;">
                                                ${"—".toFixed(2)}
                                            </td>
                                            <td style="padding:10px; text-align:center;">
                                                ${true
                                                    ? '<span style="background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:6px; font-size:11px;">✓ في المحفظة</span>'
                                                    : '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:6px; font-size:11px;">⏳ معلّق</span>'
                                                }
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="background:#f0fdf4; font-weight:bold;">
                                    <td colspan="3" style="padding:12px; text-align:right;">الإجمالي:</td>
                                    <td style="padding:12px; text-align:center; color:#047857;">${totalAmount.toFixed(2)}</td>
                                    <td colspan="4"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    ${commissions.length === 200 ? '<p style="text-align:center; color:#9ca3af; font-size:12px; margin-top:12px;">📊 بتعرض آخر 200 عملية. للقائمة الكاملة استعلم من قاعدة البيانات مباشرة.</p>' : ''}
                `}
            </div>
        `;

    } catch (err) {
        console.error('loadCommissionReports error:', err);
        content.innerHTML = `<p class="empty-state">❌ حصل خطأ: ${err.message}</p>`;
    }
}

async function loadWalletDetails() {
    const page = document.getElementById('walletPage');

    // جلب بيانات المحفظة
    const { data: wallet } = await window.SAWYAN.supabase
        .from('wallets')
        .select('*')
        .eq('member_id', currentUser.id)
        .single();

    // جلب آخر العمليات
    const { data: transactions } = await window.SAWYAN.supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', wallet?.id)
        .order('created_at', { ascending: false })
        .limit(10);

    // جلب طلبات السحب المعلقة
    const { data: pendingWithdrawals } = await window.SAWYAN.supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', wallet?.id)
        .eq('transaction_type', 'withdrawal')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    const balance = wallet?.balance || 0;
    const pendingBalance = wallet?.pending_balance || 0;
    const totalEarned = wallet?.total_earned || 0;
    const totalWithdrawn = wallet?.total_withdrawn || 0;

    page.innerHTML = `
        <div class="wallet-page">
            <h2 class="page-title-mobile">💰 محفظتي</h2>
            
            <!-- بطاقة الرصيد الرئيسية -->
            <div class="wallet-main-card">
                <div class="balance-info">
                    <span class="balance-label">الرصيد المتاح</span>
                    <span class="balance-amount">${balance.toFixed(2)} <small>ج.م</small></span>
                </div>
                <button onclick="openWithdrawModal()" class="btn btn-withdraw" ${balance < 100 ? 'disabled' : ''}>
                    💸 طلب سحب
                </button>
                ${balance < 100 ? '<p class="min-withdraw-note">الحد الأدنى للسحب: 100 ج.م</p>' : ''}
            </div>

            <!-- إحصائيات سريعة -->
            <div class="wallet-stats-grid">
                <div class="wallet-stat-card">
                    <span class="stat-icon">⏳</span>
                    <span class="stat-value">${pendingBalance.toFixed(2)}</span>
                    <span class="stat-label">رصيد معلق</span>
                </div>
                <div class="wallet-stat-card">
                    <span class="stat-icon">📈</span>
                    <span class="stat-value">${totalEarned.toFixed(2)}</span>
                    <span class="stat-label">إجمالي الأرباح</span>
                </div>
                <div class="wallet-stat-card">
                    <span class="stat-icon">💵</span>
                    <span class="stat-value">${totalWithdrawn.toFixed(2)}</span>
                    <span class="stat-label">إجمالي السحوبات</span>
                </div>
            </div>

            <!-- طلبات السحب المعلقة -->
            ${pendingWithdrawals && pendingWithdrawals.length > 0 ? `
                <div class="pending-withdrawals-section">
                    <h3>⏳ طلبات سحب قيد المعالجة</h3>
                    ${pendingWithdrawals.map(w => `
                        <div class="pending-withdrawal-item">
                            <span>${parseFloat(w.amount).toFixed(2)} ج.م</span>
                            <span class="pending-badge">قيد المراجعة</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            <!-- سجل العمليات -->
            <div class="transactions-section">
                <h3>📋 آخر العمليات</h3>
                <div class="transactions-list">
                    ${transactions && transactions.length > 0 ? transactions.map(t => `
                        <div class="transaction-item ${t.transaction_type}">
                            <div class="transaction-icon">
                                ${getTransactionIcon(t.transaction_type)}
                            </div>
                            <div class="transaction-info">
                                <span class="transaction-desc">${t.description || getTransactionTypeLabel(t.transaction_type)}</span>
                                <span class="transaction-date">${formatDate(t.created_at)}</span>
                            </div>
                            <div class="transaction-amount ${t.transaction_type === 'credit' || t.transaction_type === 'commission' ? 'positive' : 'negative'}">
                                ${t.transaction_type === 'credit' || t.transaction_type === 'commission' ? '+' : '-'}${parseFloat(t.amount).toFixed(2)} ج.م
                            </div>
                        </div>
                    `).join('') : '<p class="empty-state">لا توجد عمليات حتى الآن</p>'}
                </div>
            </div>
        </div>

        <!-- Modal طلب السحب -->
        <div class="modal" id="withdrawModal">
            <div class="modal-content withdraw-modal">
                <button onclick="closeWithdrawModal()" class="close-btn">&times;</button>
                <h3>💸 طلب سحب أموال</h3>
                
                <div class="withdraw-balance-info">
                    الرصيد المتاح: <strong>${balance.toFixed(2)} ج.م</strong>
                </div>

                <form id="withdrawForm" onsubmit="submitWithdrawRequest(event)">
                    <div class="form-group">
                        <label>المبلغ المراد سحبه</label>
                        <input type="number" id="withdrawAmount" class="form-control" 
                            min="100" max="${balance}" step="0.01" required
                            placeholder="أدخل المبلغ (الحد الأدنى 100 ج.م)">
                    </div>

                    <div class="form-group">
                        <label>طريقة السحب</label>
                        <select id="withdrawMethod" class="form-control" required>
                            <option value="">اختر طريقة السحب...</option>
                            <option value="vodafone_cash">فودافون كاش</option>
                            <option value="instapay">انستاباي</option>
                            <option value="bank_transfer">تحويل بنكي</option>
                            <option value="mobile_wallet">محفظة إلكترونية أخرى</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>رقم الحساب / المحفظة</label>
                        <input type="text" id="withdrawAccount" class="form-control" required
                            placeholder="أدخل رقم الهاتف أو رقم الحساب">
                    </div>

                    <div class="form-group">
                        <label>ملاحظات (اختياري)</label>
                        <textarea id="withdrawNotes" class="form-control" rows="2"
                            placeholder="أي ملاحظات إضافية..."></textarea>
                    </div>

                    <button type="submit" class="btn btn-primary btn-block" id="submitWithdrawBtn">
                        تأكيد طلب السحب
                    </button>
                </form>
            </div>
        </div>
    `;
}

// فتح modal السحب
function openWithdrawModal() {
    document.getElementById('withdrawModal').classList.add('open');
}

// إغلاق modal السحب
function closeWithdrawModal() {
    document.getElementById('withdrawModal').classList.remove('open');
}

// إرسال طلب السحب - نسخة آمنة
async function submitWithdrawRequest(e) {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const method = document.getElementById('withdrawMethod').value;
    const account = document.getElementById('withdrawAccount').value;
    const notes = document.getElementById('withdrawNotes').value;

    if (amount < 100) {
        alert('الحد الأدنى للسحب هو 100 ج.م');
        return;
    }

    if (!method) {
        alert('الرجاء اختيار طريقة السحب');
        return;
    }

    if (!account) {
        alert('الرجاء إدخال رقم الحساب/المحفظة');
        return;
    }

    const btn = document.getElementById('submitWithdrawBtn');
    btn.innerHTML = '⏳ جاري الإرسال...';
    btn.disabled = true;

    try {
        // استخدام RPC function للسحب الآمن (إذا كانت متاحة)
        const { data: rpcResult, error: rpcError } = await window.SAWYAN.supabase
            .rpc('deduct_wallet_balance', {
                p_member_id: currentUser.id,
                p_amount: amount,
                p_description: `طلب سحب - ${getMethodLabel(method)} - ${account}`,
                p_metadata: {
                    method: method,
                    account: account,
                    notes: notes
                }
            });

        // إذا كانت الـ RPC function موجودة وعملت
        if (!rpcError && rpcResult && rpcResult.success) {
            alert('✅ تم إرسال طلب السحب بنجاح!\nسيتم مراجعته خلال 24-48 ساعة');
            closeWithdrawModal();
            loadWalletDetails();
            return;
        }

        // الطريقة البديلة (fallback) إذا لم تكن RPC موجودة
        console.log('RPC not available, using fallback method');

        // جلب المحفظة
        const { data: wallet } = await window.SAWYAN.supabase
            .from('wallets')
            .select('id, balance, pending_balance')
            .eq('member_id', currentUser.id)
            .single();

        if (!wallet) {
            throw new Error('لم يتم العثور على المحفظة');
        }

        if (wallet.balance < amount) {
            throw new Error('الرصيد غير كافي');
        }

        // إنشاء طلب السحب
        const { data: transaction, error: insertError } = await window.SAWYAN.supabase
            .from('wallet_transactions')
            .insert([{
                wallet_id: wallet.id,
                transaction_type: 'withdrawal',
                amount: amount,
                status: 'pending',
                description: `طلب سحب - ${getMethodLabel(method)} - ${account}${notes ? ' | ' + notes : ''}`,
                reference_id: null
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        // خصم المبلغ من الرصيد المتاح وإضافته للرصيد المعلق
        const { error: updateError } = await window.SAWYAN.supabase
            .from('wallets')
            .update({
                balance: wallet.balance - amount,
                pending_balance: (wallet.pending_balance || 0) + amount,
                updated_at: new Date().toISOString()
            })
            .eq('id', wallet.id);

        if (updateError) throw updateError;

        alert('✅ تم إرسال طلب السحب بنجاح!\nسيتم مراجعته خلال 24-48 ساعة');
        closeWithdrawModal();
        loadWalletDetails();

    } catch (error) {
        console.error('Withdraw error:', error);
        alert('❌ حدث خطأ: ' + error.message);
    } finally {
        btn.innerHTML = 'تأكيد طلب السحب';
        btn.disabled = false;
    }
}

// دوال مساعدة
function getTransactionIcon(type) {
    const icons = {
        'credit': '➕',
        'commission': '💰',
        'withdrawal': '💸',
        'transfer': '↔️',
        'refund': '↩️',
        'deposit': '💵'
    };
    return icons[type] || '📋';
}

function getTransactionTypeLabel(type) {
    const labels = {
        'credit': 'إيداع',
        'commission': 'عمولة',
        'withdrawal': 'سحب',
        'transfer': 'تحويل',
        'refund': 'استرداد',
        'deposit': 'إيداع'
    };
    return labels[type] || type;
}

function getMethodLabel(method) {
    const labels = {
        'vodafone_cash': 'فودافون كاش',
        'instapay': 'انستاباي',
        'bank_transfer': 'تحويل بنكي',
        'mobile_wallet': 'محفظة إلكترونية'
    };
    return labels[method] || method;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function loadAcademy() {
    const page = document.getElementById('academyPage');
    page.innerHTML = `
        <h2>الأكاديمية</h2>
        <p class="empty-state">الدورات التدريبية قريباً...</p>
    `;
}

// متغيرات البحث
let allMerchants = [];
let filteredMerchants = [];
let searchFilters = {
    query: '',
    category: 'all',
    country: 'all',
    city: 'all',
    type: 'all',
    sortBy: 'name'
};

async function loadNearbyMerchants() {
    const page = document.getElementById('merchantsPage');
    page.innerHTML = `
        <h2>التجار المتاحين</h2>
        <p class="page-description">ابحث واختر تاجر لإنشاء عملية توثيق شراء</p>
        
        <!-- شريط البحث المتقدم -->
        <div class="search-advanced-container">
            <div class="search-row">
                <div class="search-input-wrapper">
                    <input type="text" id="merchantSearchInput" class="form-control search-input" 
                        placeholder="🔍 ابحث بالاسم أو الوصف..." autocomplete="off">
                    <div id="searchSuggestions" class="search-suggestions"></div>
                </div>
            </div>
            
            <div class="filters-row">
                <select id="filterCategory" class="form-control filter-select">
                    <option value="all">📁 كل المجالات</option>
                </select>
                
                <select id="filterCountry" class="form-control filter-select">
                    <option value="all">🌍 كل الدول</option>
                </select>
                
                <select id="filterCity" class="form-control filter-select">
                    <option value="all">🏙️ كل المدن</option>
                </select>
                
                <select id="filterType" class="form-control filter-select">
                    <option value="all">🏪 كل الأنواع</option>
                    <option value="physical">🏪 محل</option>
                    <option value="online">🌐 أونلاين</option>
                    <option value="both">🏪🌐 كلاهما</option>
                </select>
                
                <select id="sortMerchants" class="form-control filter-select">
                    <option value="name">🔤 الاسم</option>
                    <option value="cashback">💰 أعلى كاشباك</option>
                    <option value="rating">⭐ الأعلى تقييماً</option>
                    <option value="newest">🆕 الأحدث</option>
                </select>
            </div>
            
            <div class="search-stats" id="searchStats">
                <span id="merchantCount">0</span> تاجر
                <button class="location-sort-btn" onclick="sortMerchantsByDistance()">📍 القريبين مني</button>
                <button class="btn-reset-filters" onclick="resetFilters()">🔄 إعادة تعيين</button>
            </div>
        </div>
        
        <div id="merchantsList" class="merchants-grid"></div>
        
        <!-- Modal لإنشاء العملية -->
        <div id="transactionModal" class="modal" style="display: none;">
            <div class="modal-content">
                <span class="close-btn" onclick="closeTransactionModal()">&times;</span>
                <h3>إنشاء عملية دفع</h3>
                
                <div id="selectedMerchantInfo" class="merchant-info-box"></div>
                
                <form id="createTransactionForm">
                    <!-- طريقة الدفع - 3 خيارات -->
                    <div class="form-group">
                        <label>🏷️ طريقة الدفع</label>
                        <div class="payment-method-options">
                            <label class="payment-option" onclick="selectPaymentMethod('outside')">
                                <input type="radio" name="paymentMethod" value="outside" checked>
                                <div class="payment-option-content">
                                    <span class="payment-icon">🔶</span>
                                    <div class="payment-details">
                                        <span class="payment-title">الدفع خارج التطبيق</span>
                                        <span class="payment-desc">توثيق فقط - الدفع يتم بينك وبين التاجر مباشرة</span>
                                    </div>
                                </div>
                            </label>
                            
                            <label class="payment-option" onclick="selectPaymentMethod('provider')">
                                <input type="radio" name="paymentMethod" value="provider">
                                <div class="payment-option-content">
                                    <span class="payment-icon">🟢</span>
                                    <div class="payment-details">
                                        <span class="payment-title">الدفع عبر التطبيق</span>
                                        <span class="payment-desc">دفع آمن عبر مزودي خدمات الدفع (فوري، إيزيكو...)</span>
                                    </div>
                                </div>
                            </label>
                            
                            <label class="payment-option disabled-option">
                                <input type="radio" name="paymentMethod" value="wallet" disabled>
                                <div class="payment-option-content">
                                    <span class="payment-icon">💰</span>
                                    <div class="payment-details">
                                        <span class="payment-title">الدفع من المحفظة</span>
                                        <span class="payment-desc">دفع فوري من رصيد محفظتك</span>
                                    </div>
                                    <span class="coming-soon-badge">قريباً</span>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- قسم مزودي خدمات الدفع - يظهر فقط عند اختيار "الدفع عبر التطبيق" -->
                    <div id="paymentProviderSection" class="form-group" style="display: none;">
                        <label>🌍 اختر الدولة</label>
                        <select id="providerCountry" class="form-control" onchange="loadPaymentProviders()">
                            <option value="">اختر الدولة...</option>
                            <option value="EG">🇪🇬 مصر</option>
                            <option value="TR">🇹🇷 تركيا</option>
                            <option value="SA">🇸🇦 السعودية</option>
                            <option value="AE">🇦🇪 الإمارات</option>
                        </select>
                        
                        <div id="paymentProvidersList" class="payment-providers-list" style="display: none;">
                            <!-- سيتم تحميل مزودي الخدمة هنا -->
                        </div>
                        
                        <!-- حاوية الحقول الديناميكية -->
                        <div id="paymentDetailsInputs" class="payment-details-box" style="display: none; margin-top: 15px;">
                            <!-- سيتم حقن الحقول هنا حسب الاختيار -->
                        </div>

                        <!-- قوالب الحقول المخفية -->
                        <div id="tpl-card-inputs" style="display:none;">
                            <div class="dynamic-form fade-in">
                                <div class="form-group">
                                    <label>اسم صاحب البطاقة</label>
                                    <input type="text" class="form-control" placeholder="كما يظهر على البطاقة">
                                </div>
                                <div class="form-group">
                                    <label>رقم البطاقة</label>
                                    <div style="position: relative;">
                                        <input type="text" class="form-control" placeholder="0000 0000 0000 0000" maxlength="19">
                                        <span style="position: absolute; left: 10px; top: 10px;">💳</span>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-6">
                                        <div class="form-group">
                                            <label>تاريخ الانتهاء</label>
                                            <input type="text" class="form-control" placeholder="MM/YY" maxlength="5">
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="form-group">
                                            <label>CVC</label>
                                            <div style="position: relative;">
                                                <input type="text" class="form-control" placeholder="123" maxlength="3">
                                                <span style="position: absolute; left: 10px; top: 10px;">🔒</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="tpl-wallet-inputs" style="display:none;">
                            <div class="dynamic-form fade-in">
                                <div class="form-group">
                                    <label>رقم الموبايل للمحفظة</label>
                                    <div style="position: relative;">
                                        <input type="tel" class="form-control" placeholder="أدخل رقم المحفظة">
                                        <span style="position: absolute; left: 10px; top: 10px;">📱</span>
                                    </div>
                                    <small class="text-muted">سيصلك إشعار للدفع على هذا الرقم</small>
                                </div>
                            </div>
                        </div>

                        <div id="tpl-offline-inputs" style="display:none;">
                            <div class="dynamic-form fade-in text-center">
                                <div class="alert alert-info">
                                    <strong>تعليمات الدفع:</strong><br>
                                    سيتم إصدار "كود مرجعي" فوراً بعد الضغط على زر "تابع للدفع الآمن".<br>
                                    استخدم الكود للدفع في أقرب منفذ.
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>💵 المبلغ (ج.م) *</label>
                        <input type="number" id="transAmount" required class="form-control" 
                            step="0.01" min="1" placeholder="أدخل مبلغ الشراء" oninput="calculateCommission()">
                    </div>
                    
                    <div id="commissionPreview" class="commission-preview" style="display: none;">
                        <div class="preview-row">
                            <span>التوقيت:</span>
                            <span id="previewTime"></span>
                        </div>
                        <div class="preview-row">
                            <span>نسبة العمولة:</span>
                            <span id="previewPercentage"></span>
                        </div>
                        <div class="preview-row highlight">
                            <span>مبلغ العمولة:</span>
                            <span id="previewCommission"></span>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>📝 ملاحظات (اختياري)</label>
                        <textarea id="transNotes" class="form-control" rows="2" 
                            placeholder="وصف المشتريات..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>📷 صورة الفاتورة (اختياري)</label>
                        <div class="invoice-upload-wrapper">
                            <input type="file" id="transInvoiceFile" accept="image/*" 
                                class="form-control" onchange="previewInvoiceImage(this)">
                            <div id="invoicePreview" class="invoice-preview" style="display: none;">
                                <img id="invoicePreviewImg" src="" alt="معاينة الفاتورة">
                                <button type="button" class="btn-remove-image" onclick="removeInvoicePreview()">✕</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- تنبيه ديناميكي -->
                    <div id="paymentAlert" class="form-note">
                        <p id="paymentAlertText">⏳ العملية ستكون <strong>معلقة</strong> حتى يوافق عليها التاجر</p>
                    </div>
                    
                    <button type="submit" class="btn btn-primary btn-block" id="submitTransactionBtn">إرسال طلب التوثيق</button>
                </form>
            </div>
        </div>
    `;

    // تحميل بيانات التجار
    await loadMerchantsData();

    // تهيئة الفلاتر
    initSearchFilters();

    // إضافة event listener للفورم
    document.getElementById('createTransactionForm').addEventListener('submit', submitMemberTransaction);
}

async function loadMerchantsData() {
    try {
        const { data: merchants, error } = await window.SAWYAN.supabase
            .from('merchants')
            .select('*')
            .eq('is_active', true)
            .order('business_name');

        if (error) throw error;

        allMerchants = merchants || [];
        filteredMerchants = [...allMerchants];

        // تحميل قوائم الفلاتر
        populateFilterOptions();

        // عرض التجار
        renderMerchants();

    } catch (err) {
        console.error('Error loading merchants:', err);
        document.getElementById('merchantsList').innerHTML = '<p class="empty-state">حدث خطأ في تحميل التجار</p>';
    }
}

function populateFilterOptions() {
    // استخراج المجالات الفريدة
    const categories = [...new Set(allMerchants.map(m => m.business_category).filter(Boolean))];
    const categorySelect = document.getElementById('filterCategory');
    categories.forEach(cat => {
        categorySelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });

    // استخراج الدول الفريدة
    const countries = [...new Set(allMerchants.map(m => m.country || 'مصر').filter(Boolean))];
    const countrySelect = document.getElementById('filterCountry');
    countries.forEach(country => {
        countrySelect.innerHTML += `<option value="${country}">${country}</option>`;
    });

    // استخراج المدن الفريدة
    const cities = [...new Set(allMerchants.map(m => m.city).filter(Boolean))];
    const citySelect = document.getElementById('filterCity');
    cities.forEach(city => {
        citySelect.innerHTML += `<option value="${city}">${city}</option>`;
    });
}

function initSearchFilters() {
    // البحث بالنص مع Autocomplete
    const searchInput = document.getElementById('merchantSearchInput');
    let searchTimeout;

    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        const query = this.value.trim();

        // عرض اقتراحات البحث
        if (query.length >= 2) {
            showSearchSuggestions(query);
        } else {
            hideSearchSuggestions();
        }

        // تطبيق الفلتر بعد توقف الكتابة
        searchTimeout = setTimeout(() => {
            searchFilters.query = query;
            applyFilters();
        }, 300);
    });

    // إخفاء الاقتراحات عند النقر خارجها
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.search-input-wrapper')) {
            hideSearchSuggestions();
        }
    });

    // فلتر المجال
    document.getElementById('filterCategory').addEventListener('change', function () {
        searchFilters.category = this.value;
        applyFilters();
    });

    // فلتر الدولة
    document.getElementById('filterCountry').addEventListener('change', function () {
        searchFilters.country = this.value;
        // تحديث المدن بناءً على الدولة
        updateCitiesFilter(this.value);
        applyFilters();
    });

    // فلتر المدينة
    document.getElementById('filterCity').addEventListener('change', function () {
        searchFilters.city = this.value;
        applyFilters();
    });

    // فلتر النوع
    document.getElementById('filterType').addEventListener('change', function () {
        searchFilters.type = this.value;
        applyFilters();
    });

    // الترتيب
    document.getElementById('sortMerchants').addEventListener('change', function () {
        searchFilters.sortBy = this.value;
        applyFilters();
    });
}

function showSearchSuggestions(query) {
    const suggestions = allMerchants.filter(m =>
        m.business_name.toLowerCase().includes(query.toLowerCase()) ||
        (m.business_description && m.business_description.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 5);

    const container = document.getElementById('searchSuggestions');

    if (suggestions.length === 0) {
        container.innerHTML = '<div class="suggestion-item no-results">لا توجد نتائج</div>';
    } else {
        container.innerHTML = suggestions.map(m => `
            <div class="suggestion-item" onclick="selectSuggestion('${m.business_name}')">
                <span class="suggestion-name">${m.business_name}</span>
                <span class="suggestion-category">${m.business_category || ''}</span>
            </div>
        `).join('');
    }

    container.style.display = 'block';
}

function hideSearchSuggestions() {
    document.getElementById('searchSuggestions').style.display = 'none';
}

function selectSuggestion(name) {
    document.getElementById('merchantSearchInput').value = name;
    searchFilters.query = name;
    hideSearchSuggestions();
    applyFilters();
}

function updateCitiesFilter(country) {
    const citySelect = document.getElementById('filterCity');
    citySelect.innerHTML = '<option value="all">🏙️ كل المدن</option>';

    if (country === 'all') {
        const cities = [...new Set(allMerchants.map(m => m.city).filter(Boolean))];
        cities.forEach(city => {
            citySelect.innerHTML += `<option value="${city}">${city}</option>`;
        });
    } else {
        const cities = [...new Set(
            allMerchants
                .filter(m => (m.country || 'مصر') === country)
                .map(m => m.city)
                .filter(Boolean)
        )];
        cities.forEach(city => {
            citySelect.innerHTML += `<option value="${city}">${city}</option>`;
        });
    }

    searchFilters.city = 'all';
}

function applyFilters() {
    filteredMerchants = allMerchants.filter(m => {
        // فلتر البحث النصي
        if (searchFilters.query) {
            const query = searchFilters.query.toLowerCase();
            const matchName = m.business_name.toLowerCase().includes(query);
            const matchDesc = m.business_description && m.business_description.toLowerCase().includes(query);
            if (!matchName && !matchDesc) return false;
        }

        // فلتر المجال
        if (searchFilters.category !== 'all' && m.business_category !== searchFilters.category) {
            return false;
        }

        // فلتر الدولة
        if (searchFilters.country !== 'all' && (m.country || 'مصر') !== searchFilters.country) {
            return false;
        }

        // فلتر المدينة
        if (searchFilters.city !== 'all' && m.city !== searchFilters.city) {
            return false;
        }

        // فلتر النوع
        if (searchFilters.type !== 'all' && m.merchant_type !== searchFilters.type) {
            return false;
        }

        return true;
    });

    // الترتيب
    sortMerchants();

    // عرض النتائج
    renderMerchants();
}

function sortMerchants() {
    switch (searchFilters.sortBy) {
        case 'name':
            filteredMerchants.sort((a, b) => a.business_name.localeCompare(b.business_name, 'ar'));
            break;
        case 'cashback':
            filteredMerchants.sort((a, b) => (b.commission_percentage || 0) - (a.commission_percentage || 0));
            break;
        case 'rating':
            filteredMerchants.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
            break;
        case 'newest':
            filteredMerchants.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
    }
}

function renderMerchants() {
    const merchantsList = document.getElementById('merchantsList');
    const countElement = document.getElementById('merchantCount');

    countElement.textContent = filteredMerchants.length;

    if (filteredMerchants.length === 0) {
        merchantsList.innerHTML = `
            <div class="empty-state">
                <span style="font-size: 3rem;">🔍</span>
                <p>لا توجد نتائج مطابقة</p>
                <button class="btn btn-secondary" onclick="resetFilters()">إعادة تعيين البحث</button>
            </div>
        `;
        return;
    }

    merchantsList.innerHTML = filteredMerchants.map(m => `
        <div class="merchant-card clickable" onclick="openTransactionModal('${m.id}', '${escapeHtml(m.business_name)}', ${m.commission_percentage || 0}, '${escapeHtml(m.business_category || '')}')">
            <div class="merchant-header">
                ${m.logo_url ? `<img src="${m.logo_url}" alt="${m.business_name}" class="merchant-logo">` : ''}
                <div class="merchant-title">
                    <h4>${m.business_name}</h4>
                    ${m.is_verified ? '<span class="verified-badge" title="تاجر موثق">✓</span>' : ''}
                </div>
                <span class="commission-badge">${m.commission_percentage || 0}%</span>
            </div>
            <p class="merchant-category">📁 ${m.business_category || 'غير محدد'}</p>
            ${m.city ? `<p class="merchant-location">📍 ${m.city}${m.country && m.country !== 'مصر' ? ', ' + m.country : ''}</p>` : ''}
            <p class="merchant-type">${getMerchantTypeIcon(m.merchant_type)}</p>
            ${m.avg_rating ? `<div class="merchant-rating">⭐ ${m.avg_rating} (${m.total_reviews || 0})</div>` : ''}
            <button class="btn btn-primary btn-sm">توثيق عملية</button>
        </div>
    `).join('');
}

function getMerchantTypeIcon(type) {
    switch (type) {
        case 'physical': return '🏪 محل';
        case 'online': return '🌐 أونلاين';
        case 'both': return '🏪🌐 كلاهما';
        default: return '🏪 محل';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function resetFilters() {
    searchFilters = {
        query: '',
        category: 'all',
        country: 'all',
        city: 'all',
        type: 'all',
        sortBy: 'name'
    };

    document.getElementById('merchantSearchInput').value = '';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterCountry').value = 'all';
    document.getElementById('filterCity').value = 'all';
    document.getElementById('filterType').value = 'all';
    document.getElementById('sortMerchants').value = 'name';

    filteredMerchants = [...allMerchants];
    renderMerchants();
}

// معاينة صورة الفاتورة
function previewInvoiceImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('invoicePreviewImg').src = e.target.result;
            document.getElementById('invoicePreview').style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function removeInvoicePreview() {
    document.getElementById('transInvoiceFile').value = '';
    document.getElementById('invoicePreview').style.display = 'none';
}

// متغيرات للـ Modal
let selectedMerchantId = null;
let selectedMerchantName = '';
let selectedCommissionPercentage = 0;

function openTransactionModal(merchantId, merchantName, commissionPercentage, category) {
    selectedMerchantId = merchantId;
    selectedMerchantName = merchantName;
    selectedCommissionPercentage = commissionPercentage;

    document.getElementById('selectedMerchantInfo').innerHTML = `
        <h4>${merchantName}</h4>
        <p>📁 ${category} | نسبة العمولة: <strong>${commissionPercentage}%</strong></p>
    `;

    // إعادة تعيين الفورم
    document.getElementById('createTransactionForm').reset();
    document.getElementById('commissionPreview').style.display = 'none';

    // الافتراضي: الدفع خارج التطبيق
    selectPaymentMethod('outside');

    document.getElementById('transactionModal').style.display = 'block';
}

function closeTransactionModal() {
    document.getElementById('transactionModal').style.display = 'none';
}

// دالة اختيار طريقة الدفع
window.selectPaymentMethod = function (method) {
    // محاولة العثور على العناصر بأمان
    const invoiceInput = document.getElementById('transInvoiceFile');
    const invoiceGroup = invoiceInput ? invoiceInput.closest('.form-group') : null;
    const providerSection = document.getElementById('paymentProviderSection');
    const alertText = document.getElementById('paymentAlertText');
    const submitBtn = document.getElementById('submitTransactionBtn');

    // إزالة التحديد السابق
    document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));

    const selectedInput = document.querySelector(`input[name="paymentMethod"][value="${method}"]`);
    if (selectedInput) {
        selectedInput.closest('.payment-option').classList.add('selected');
        selectedInput.checked = true;
    } else {
        console.warn('⚠️ Could not find radio input for:', method);
    }

    if (method === 'outside') {
        console.log('👉 Applying OUTSIDE changes');
        // دفع خارج التطبيق
        if (invoiceGroup) invoiceGroup.style.display = 'block';
        if (providerSection) providerSection.style.display = 'none';

        if (alertText) alertText.innerHTML = '⏳ العملية ستكون <strong>معلقة</strong> حتى يوافق عليها التاجر بعد مراجعة الفاتورة.';

        if (submitBtn) {
            submitBtn.textContent = 'طلب موافقة من التاجر';
            submitBtn.classList.remove('btn-success');
            submitBtn.classList.add('btn-primary');
        }
    }
    else if (method === 'provider') {
        console.log('👉 Applying PROVIDER changes');
        // دفع عبر التطبيق
        if (invoiceGroup) invoiceGroup.style.display = 'none';
        if (providerSection) providerSection.style.display = 'block';

        if (alertText) alertText.innerHTML = '🔒 الدفع يتم عبر مزود خدمة آمن. سيتم توثيق العملية تلقائياً بعد الدفع.';

        if (submitBtn) {
            submitBtn.textContent = 'تابع للدفع الآمن';
            submitBtn.classList.remove('btn-primary');
            submitBtn.classList.add('btn-success');
        }
    }
}

// تحديث التنبيه حسب طريقة الدفع
function updatePaymentAlert(method) {
    const alertText = document.getElementById('paymentAlertText');
    if (!alertText) return;

    if (method === 'outside') {
        alertText.innerHTML = '⏳ العملية ستكون <strong>معلقة</strong> حتى يوافق عليها التاجر';
    } else if (method === 'provider') {
        alertText.innerHTML = '✅ سيتم معالجة الدفع <strong>فوراً</strong> عبر مزود الخدمة المختار';
    }
}

// بيانات مزودي خدمات الدفع
const paymentProviders = {
    'EG': [
        { id: 'card', name: 'بطاقة بنكية', icon: '💳', description: 'فيزا / ماستركارد', type: 'card' },
        { id: 'fawry', name: 'فوري', icon: '📱', description: 'ادفع عبر أي منفذ فوري', type: 'offline' },
        { id: 'vodafone_cash', name: 'فودافون كاش', icon: '📲', description: 'ادفع من محفظتك', type: 'wallet' },
        { id: 'instapay', name: 'انستاباي', icon: '🏦', description: 'تحويل بنكي فوري', type: 'wallet' }
    ],
    'TR': [
        { id: 'card', name: 'بطاقة بنكية', icon: '💳', description: 'زراعات، كويت ترك، وغيرها...', type: 'card' },
        { id: 'papara', name: 'بابارا', icon: '👛', description: 'محفظة إلكترونية تركية', type: 'wallet' }
    ],
    'SA': [
        { id: 'mada', name: 'مدى (Mada)', icon: '💳', description: 'بطاقة بنكية / مدى', type: 'card' },
        { id: 'stc_pay', name: 'STC Pay', icon: '📱', description: 'محفظة STC الرقمية', type: 'wallet' }
    ],
    'AE': [
        { id: 'card', name: 'بطاقة بنكية', icon: '💳', description: 'Visa / Mastercard', type: 'card' },
        { id: 'apple_pay', name: 'Apple Pay', icon: '🍎', description: 'الدفع عبر Apple', type: 'wallet' }
    ]
};

// تحميل مزودي الخدمة حسب الدولة
function loadPaymentProviders() {
    const country = document.getElementById('providerCountry').value;
    const providersList = document.getElementById('paymentProvidersList');
    const detailsContainer = document.getElementById('paymentDetailsInputs');

    if (!country) {
        providersList.style.display = 'none';
        detailsContainer.style.display = 'none';
        return;
    }

    const providers = paymentProviders[country] || [];

    if (providers.length === 0) {
        providersList.innerHTML = '<p class="empty-state">لا توجد مزودي خدمة متاحين لهذه الدولة حالياً</p>';
        providersList.style.display = 'block';
        return;
    }

    providersList.innerHTML = providers.map(p => `
        <label class="provider-option" onclick="renderPaymentInputs('${p.type}')">
            <input type="radio" name="selectedProvider" value="${p.id}" data-type="${p.type}">
            <div class="provider-content">
                <span class="provider-icon">${p.icon}</span>
                <div class="provider-info">
                    <span class="provider-name">${p.name}</span>
                    <span class="provider-desc">${p.description}</span>
                </div>
            </div>
        </label>
    `).join('');

    providersList.style.display = 'block';
    detailsContainer.innerHTML = ''; // Reset details
    detailsContainer.style.display = 'none';
}

// دالة عرض حقول الإدخال حسب النوع
window.renderPaymentInputs = function (type) {
    const container = document.getElementById('paymentDetailsInputs');
    let templateId = '';

    if (type === 'card') templateId = 'tpl-card-inputs';
    else if (type === 'wallet') templateId = 'tpl-wallet-inputs';
    else if (type === 'offline') templateId = 'tpl-offline-inputs';

    const template = document.getElementById(templateId);
    if (template) {
        container.innerHTML = template.innerHTML;
        container.style.display = 'block';

        // Scroll to inputs smoothly
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function closeTransactionModal() {
    document.getElementById('transactionModal').style.display = 'none';
    selectedMerchantId = null;
}

function calculateCommission() {
    const amount = parseFloat(document.getElementById('transAmount').value) || 0;

    if (amount > 0) {
        const commissionAmount = amount * (selectedCommissionPercentage / 100);
        const now = new Date();

        document.getElementById('previewTime').textContent = now.toLocaleString('ar-EG');
        document.getElementById('previewPercentage').textContent = selectedCommissionPercentage + '%';
        document.getElementById('previewCommission').textContent = commissionAmount.toFixed(2) + ' ج.م';

        document.getElementById('commissionPreview').style.display = 'block';
    } else {
        document.getElementById('commissionPreview').style.display = 'none';
    }
}

async function submitMemberTransaction(e) {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('transAmount').value);
    const notes = document.getElementById('transNotes')?.value || '';

    // الحصول على طريقة الدفع المختارة
    const paymentMethodRadio = document.querySelector('input[name="paymentMethod"]:checked');
    const selectedPaymentMethod = paymentMethodRadio ? paymentMethodRadio.value : 'outside';

    if (!amount || amount <= 0) {
        alert('الرجاء إدخال مبلغ صحيح');
        return;
    }

    // التحقق من المدخلات بناءً على طريقة الدفع
    let transactionStatus = 'pending';
    let providerData = null;

    if (selectedPaymentMethod === 'provider') {
        const selectedProviderRadio = document.querySelector('input[name="selectedProvider"]:checked');
        const country = document.getElementById('providerCountry').value;

        if (!selectedProviderRadio) {
            alert('الرجاء اختيار مزود خدمة الدفع (فوري، كاش، إلخ)');
            return;
        }

        const type = selectedProviderRadio.getAttribute('data-type');

        // التحقق من الحقول الديناميكية
        const container = document.getElementById('paymentDetailsInputs');
        if (type === 'card') {
            const cardNum = container.querySelector('input[placeholder*="0000"]')?.value;
            if (!cardNum || cardNum.length < 10) {
                alert('الرجاء إدخال رقم البطاقة بشكل صحيح');
                return;
            }
        } else if (type === 'wallet') {
            const phone = container.querySelector('input[type="tel"]')?.value;
            if (!phone || phone.length < 10) {
                alert('الرجاء إدخال رقم المحفظة بشكل صحيح');
                return;
            }
        }

        providerData = {
            provider_id: selectedProviderRadio.value,
            country: country,
            type: type
        };

        // في السيناريو الحقيقي، هنا يتم توجيه المستخدم لصفحة الدفع
        // للمحاكاة، سنعتبرها "قيد المعالجة" أو "تمت"
        transactionStatus = 'completed'; // أو 'processing'
    }

    const btn = document.getElementById('submitTransactionBtn');
    const originalBtnText = btn.textContent;
    btn.innerHTML = '⏳ جاري المعالجة...';
    btn.disabled = true;

    try {
        // حساب العمولات
        const commissionAmount = amount * (selectedCommissionPercentage / 100);
        const companyShare = commissionAmount * 0.25;
        const planShare = commissionAmount * 0.75;

        const transactionCode = 'TM' + Date.now(); // TM = Transaction by Member

        const insertData = {
            transaction_code: transactionCode,
            member_id: memberData.id,
            merchant_id: selectedMerchantId,
            total_amount: amount,
            commission_percentage: selectedCommissionPercentage,
            commission_amount: commissionAmount,
            company_share: companyShare,
            plan_share: planShare,
            payment_method: selectedPaymentMethod,
            status: transactionStatus,
            metadata: {
                notes: notes,
                provider_info: providerData
            }
        };

        // رفع صورة الفاتورة إذا وجدت (فقط في حالة الدفع الخارجي عادة، لكن ممكن في الحالتين)
        const invoiceInput = document.getElementById('transInvoiceFile');
        if (selectedPaymentMethod === 'outside' && invoiceInput && invoiceInput.files[0]) {
            // منطق رفع الفاتورة يمكن إضافته هنا أو تخطيها للمحاكاة
            // سنفترض الرفع أو نضيف رابط الصورة للبيانات
        }

        console.log('Creating transaction:', insertData);

        // إنشاء العملية
        const { data: newTransaction, error } = await window.SAWYAN.supabase
            .from('transactions')
            .insert([insertData])
            .select()
            .single();

        if (error) throw error;

        // إشعار للتاجر
        // ... (يمكن استدعاؤه دالة منفصلة أو تركه كما هو)

        closeTransactionModal();

        if (selectedPaymentMethod === 'provider') {
            alert(`✅ تم الدفع وتوثيق العملية بنجاح!\n\nكود العملية: ${transactionCode}\nالمبلغ: ${amount.toFixed(2)} ج.م`);
        } else {
            alert(`✅ تم إرسال طلب الموافقة بنجاح!\n\nكود العملية: ${transactionCode}\nالمبلغ: ${amount.toFixed(2)} ج.م\n\n⏳ في انتظار مراجعة التاجر`);
        }

        // تحديث القوائم
        // loadTransactions(); // إذا كانت الدالة موجودة

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    } finally {
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
}

async function loadCRM() {
    const page = document.getElementById('crmPage');
    page.innerHTML = `
        <h2>قائمة المعارف</h2>
        <p class="empty-state">إدارة جهات الاتصال قريباً...</p>
    `;
}

async function loadReferrals() {
    const page = document.getElementById('referralsPage');
    const myCode = memberData?.member_code || '—';
    const myName = memberData?.full_name || '—';
    const myGeneration = memberData?.tree_level || 1;

    page.innerHTML = `
        <h2 class="page-title-mobile">🌟 الإحالات وإضافة أعضاء</h2>

        <!-- بطاقة معلوماتي -->
        <div class="referral-info-card" style="background:linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(168, 85, 247, 0.08)); border:1px solid rgba(16, 185, 129, 0.2); padding:16px 20px; border-radius:12px; margin-bottom:20px;">
            <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
                <div style="flex:1; min-width:200px;">
                    <div style="font-size:13px; color:#6b7280;">أنت (الأبلاين الحقيقي)</div>
                    <div style="font-size:18px; font-weight:bold; color:#047857;">${myName}</div>
                    <div style="font-size:13px; color:#6b7280;">كود: <strong>${myCode}</strong> · جيل ${myGeneration}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-primary" onclick="openAddMemberModal()">➕ أضف عضو جديد</button>
                    <button class="btn btn-outline" onclick="copyReferralLink()">📋 نسخ رابط الإحالة</button>
                </div>
            </div>
        </div>

        <!-- رابط الإحالة -->
        <div class="referral-link-card" style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:20px;">
            <h3 style="font-size:16px; margin-bottom:10px;">🔗 رابط الإحالة (للشارين على بره)</h3>
            <p style="font-size:13px; color:#6b7280; margin-bottom:10px;">
                شارك الرابط ده مع حد عايز يدعوه للشبكة. لما يدخل ويسجل، حيختار فين يحط نفسه في شجرتك.
            </p>
            <div class="referral-link" style="display:flex; gap:8px;">
                <input type="text" value="${window.location.origin}/member-dashboard/register.html?ref=${myCode}" readonly
                       style="flex:1; padding:10px 12px; border:1px solid #e5e7eb; border-radius:8px; font-family:monospace; font-size:13px; background:#f9fafb;">
                <button onclick="copyReferralLink()" class="btn btn-primary">📋 نسخ</button>
            </div>
        </div>

        <!-- قائمة الأعضاء اللي جبتهم -->
        <div class="my-referrals-card" style="background:#fff; padding:16px; border-radius:12px; border:1px solid #e5e7eb;">
            <h3 style="font-size:16px; margin-bottom:10px;">👥 الأعضاء اللي جبتهم (Real Downline)</h3>
            <div id="myReferralsList" style="margin-top:12px;">
                <div style="text-align:center; padding:30px; color:#9ca3af;">⏳ بتحميل...</div>
            </div>
        </div>
    `;

    // حمّل قائمة الأعضاء اللي جبتهم (sponsor_id = me)
    await loadMyReferrals();
}

async function loadMyReferrals() {
    const container = document.getElementById('myReferralsList');
    if (!container) return;

    try {
        const { data: referrals, error } = await window.SAWYAN.supabase
            .from('members')
            .select('id, member_code, full_name, tree_level, parent_id, position, is_active, created_at')
            .eq('sponsor_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!referrals || referrals.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:30px; color:#9ca3af;">
                    <div style="font-size:48px; margin-bottom:10px;">🌱</div>
                    <p>لسه ما جبتش أي أعضاء. ابدأ بدعوة حد للشبكة!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="background:#f9fafb; text-align:right;">
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الكود</th>
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الاسم</th>
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الجيل</th>
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">محطوط تحت</th>
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الجهة</th>
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">الحالة</th>
                            <th style="padding:10px; border-bottom:2px solid #e5e7eb;">تاريخ التسجيل</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${referrals.map(r => `
                            <tr style="border-bottom:1px solid #f3f4f6;">
                                <td style="padding:10px; font-weight:bold;">#${r.member_code}</td>
                                <td style="padding:10px;">${r.full_name}</td>
                                <td style="padding:10px; text-align:center;">${r.tree_level || '-'}</td>
                                <td style="padding:10px; text-align:center; font-size:12px;">
                                    ${r.parent_id === currentUser.id
                                        ? '<span style="color:#10b981; font-weight:bold;">⭐ تحتك مباشرة</span>'
                                        : '<span style="color:#6b7280;">تحت عضو تاني</span>'}
                                </td>
                                <td style="padding:10px; text-align:center;">
                                    ${r.position === 'left' ? '⬅️ يسار' :
                                      r.position === 'right' ? '➡️ يمين' : '-'}
                                </td>
                                <td style="padding:10px; text-align:center;">
                                    <span style="padding:2px 8px; border-radius:8px; font-size:11px;
                                        background:${r.is_active ? '#d1fae5' : '#fee2e2'};
                                        color:${r.is_active ? '#065f46' : '#991b1b'};">
                                        ${r.is_active ? '✓ نشط' : '✗ متوقف'}
                                    </span>
                                </td>
                                <td style="padding:10px; font-size:12px; color:#6b7280;">
                                    ${new Date(r.created_at).toLocaleDateString('ar-EG')}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:12px; padding:10px; background:#f0fdf4; border-radius:8px; font-size:12px; color:#166534;">
                💡 إجمالي اللي جبتهم: <strong>${referrals.length}</strong> عضو
            </div>
        `;
    } catch (err) {
        console.error('loadMyReferrals error:', err);
        container.innerHTML = `<div style="padding:20px; color:#dc2626; text-align:center;">❌ حصل خطأ في تحميل القائمة</div>`;
    }
}

// ============================================================================
// 🌳 Modal: إضافة عضو جديد (Add Member)
// ============================================================================

function openAddMemberModal() {
    // إنشاء الـ modal
    let modal = document.getElementById('addMemberModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'addMemberModal';
    modal.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999;
        display:flex; align-items:center; justify-content:center; padding:20px;
        backdrop-filter:blur(4px);
    `;

    modal.innerHTML = `
        <div style="background:#fff; border-radius:16px; max-width:600px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <!-- Header -->
            <div style="padding:20px 24px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #10b981, #059669); color:white; border-radius:16px 16px 0 0;">
                <h3 style="margin:0; font-size:18px;">➕ إضافة عضو جديد لشبكتك</h3>
                <button onclick="closeAddMemberModal()" style="background:rgba(255,255,255,0.2); border:none; color:white; width:32px; height:32px; border-radius:50%; cursor:pointer; font-size:18px;">×</button>
            </div>

            <!-- Body -->
            <div style="padding:24px;">
                <!-- بطاقة أنت الراعي -->
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:12px 16px; border-radius:10px; margin-bottom:20px; font-size:13px; color:#166534;">
                    ✅ <strong>أنت الراعي (الأبلاين الحقيقي):</strong> ${memberData?.full_name} · كود ${memberData?.member_code}
                    <br>
                    <small>العضو الجديد حيتسجل إنك إنت اللي جبته، وبتختار فين يحطه في شجرتك.</small>
                </div>

                <!-- بيانات العضو الجديد -->
                <h4 style="font-size:15px; margin-bottom:12px; color:#374151;">📋 بيانات العضو الجديد</h4>
                <div style="display:grid; gap:12px; margin-bottom:24px;">
                    <div>
                        <label style="display:block; font-size:13px; margin-bottom:4px; font-weight:600;">الاسم الكامل *</label>
                        <input type="text" id="newMemberName" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px;" placeholder="اسم العضو الجديد">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label style="display:block; font-size:13px; margin-bottom:4px; font-weight:600;">الهاتف</label>
                            <input type="text" id="newMemberPhone" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px;" placeholder="+20...">
                        </div>
                        <div>
                            <label style="display:block; font-size:13px; margin-bottom:4px; font-weight:600;">البريد (اختياري)</label>
                            <input type="email" id="newMemberEmail" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px;" placeholder="email@example.com">
                        </div>
                    </div>
                </div>

                <!-- 🌳 قسم الـ Placement -->
                <h4 style="font-size:15px; margin-bottom:8px; color:#10b981;">🌳 فين تحطه في شجرتك؟</h4>
                <p style="font-size:12px; color:#6b7280; margin-bottom:12px;">
                    اختار العضو اللي تحط العضو الجديد تحته مباشرة، وبعدين اختار يمين ولا شمال.
                </p>

                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:13px; margin-bottom:4px; font-weight:600;">1) تحته مباشر لمين؟ *</label>
                    <select id="addMemberPlacementParent" style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px;" disabled>
                        <option value="">⏳ بتحميل قائمة فريقك...</option>
                    </select>
                    <input type="hidden" id="addMemberPlacementParentId" value="">
                </div>

                <div style="margin-bottom:16px;">
                    <label style="display:block; font-size:13px; margin-bottom:8px; font-weight:600;">2) يمين ولا شمال؟ *</label>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <label style="cursor:pointer; display:block;">
                            <input type="radio" name="addMemberSide" value="left" style="display:none;">
                            <div class="add-member-side-btn" data-side="left" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:14px; border:2px solid #e5e7eb; border-radius:10px; background:#fff; font-weight:600; color:#6b7280; transition:all 0.2s;">
                                <span style="font-size:22px;">⬅️</span>
                                <span>يسار</span>
                                <small class="side-status" style="font-size:11px; color:#9ca3af;">—</small>
                            </div>
                        </label>
                        <label style="cursor:pointer; display:block;">
                            <input type="radio" name="addMemberSide" value="right" style="display:none;">
                            <div class="add-member-side-btn" data-side="right" style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:14px; border:2px solid #e5e7eb; border-radius:10px; background:#fff; font-weight:600; color:#6b7280; transition:all 0.2s;">
                                <span style="font-size:22px;">➡️</span>
                                <span>يمين</span>
                                <small class="side-status" style="font-size:11px; color:#9ca3af;">—</small>
                            </div>
                        </label>
                    </div>
                </div>

                <div id="addMemberError" style="display:none; background:#fef2f2; color:#991b1b; padding:10px 14px; border-radius:8px; font-size:13px; border:1px solid #fecaca; margin-bottom:16px;"></div>
                <div id="addMemberSuccess" style="display:none;"></div>

                <!-- Footer -->
                <div style="display:flex; gap:8px; justify-content:flex-end; padding-top:16px; border-top:1px solid #e5e7eb;">
                    <button onclick="closeAddMemberModal()" style="padding:10px 20px; border:1px solid #d1d5db; background:#fff; border-radius:8px; cursor:pointer; font-weight:600;">إلغاء</button>
                    <button id="submitAddMemberBtn" onclick="submitAddMember()" style="padding:10px 24px; background:#10b981; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">➕ أضف العضو</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // إغلاق عند الضغط خارج الـ modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAddMemberModal();
    });

    // حمّل الـ placement options (sponsor = المستخدم الحالي)
    loadAddMemberPlacementOptions(currentUser.id);

    // ربط الـ side buttons
    document.querySelectorAll('.add-member-side-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.dataset.side;
            document.querySelector(`input[name="addMemberSide"][value="${side}"]`).checked = true;
            document.querySelectorAll('.add-member-side-btn').forEach(b => {
                b.style.borderColor = '#e5e7eb';
                b.style.background = '#fff';
                b.style.color = '#6b7280';
            });
            btn.style.borderColor = '#10b981';
            btn.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.05))';
            btn.style.color = '#047857';
        });
    });
}

function closeAddMemberModal() {
    const modal = document.getElementById('addMemberModal');
    if (modal) modal.remove();
}

async function loadAddMemberPlacementOptions(sponsorId) {
    const select = document.getElementById('addMemberPlacementParent');
    if (!select) return;

    try {
        const options = await window.SAWYAN_TREE.getPlacementOptions(sponsorId, 20);

        if (options.length === 0) {
            select.innerHTML = '<option value="">— مفيش أماكن فاضية في شجرتك —</option>';
            const errDiv = document.getElementById('addMemberError');
            if (errDiv) {
                errDiv.style.display = 'block';
                errDiv.textContent = '⚠️ شجرتك ممتلية! مفيش أماكن فاضية. حاول تكبر الشجرة بإضافة أعضاء في أماكن تانية.';
            }
            return;
        }

        select.innerHTML = '<option value="">— اختار فين تحط العضو —</option>';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.member_id;
            const slots = [];
            if (opt.left_available) slots.push('يسار ✓');
            if (opt.right_available) slots.push('يمين ✓');
            const sponsorMark = opt.is_sponsor ? '⭐ ' : '';
            o.textContent = `${sponsorMark}#${opt.member_code} — ${opt.full_name} (جيل ${opt.generation}) — ${slots.join(' + ')}`;
            select.appendChild(o);
        });
        select.disabled = false;

        select.onchange = () => {
            const parentId = select.value;
            document.getElementById('addMemberPlacementParentId').value = parentId;

            // reset side selection
            document.querySelectorAll('input[name="addMemberSide"]').forEach(r => r.checked = false);
            document.querySelectorAll('.add-member-side-btn').forEach(b => {
                b.style.borderColor = '#e5e7eb';
                b.style.background = '#fff';
                b.style.color = '#6b7280';
                b.classList.remove('unavailable');
                b.querySelector('.side-status').textContent = '—';
            });

            if (!parentId) return;

            const selectedOpt = options.find(o => o.member_id === parentId);
            if (!selectedOpt) return;

            // حدّث الـ side buttons status
            ['left', 'right'].forEach(side => {
                const btn = document.querySelector(`.add-member-side-btn[data-side="${side}"]`);
                if (!btn) return;
                const available = side === 'left' ? selectedOpt.left_available : selectedOpt.right_available;
                const status = btn.querySelector('.side-status');
                if (available) {
                    btn.classList.remove('unavailable');
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    status.textContent = '✓ متاح';
                    status.style.color = '#10b981';
                } else {
                    btn.classList.add('unavailable');
                    btn.style.opacity = '0.4';
                    btn.style.cursor = 'not-allowed';
                    status.textContent = '✗ مأخوذ';
                    status.style.color = '#dc2626';
                }
            });
        };
    } catch (err) {
        console.error('loadAddMemberPlacementOptions error:', err);
        select.innerHTML = '<option value="">— حصل خطأ —</option>';
    }
}

async function submitAddMember() {
    const name = document.getElementById('newMemberName').value.trim();
    const phone = document.getElementById('newMemberPhone').value.trim();
    const email = document.getElementById('newMemberEmail').value.trim();
    const parentId = document.getElementById('addMemberPlacementParentId').value;
    const sideInput = document.querySelector('input[name="addMemberSide"]:checked');
    const side = sideInput ? sideInput.value : null;

    const errorDiv = document.getElementById('addMemberError');
    const successDiv = document.getElementById('addMemberSuccess');
    const submitBtn = document.getElementById('submitAddMemberBtn');

    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    // validation
    if (!name) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'لازم تدخل اسم العضو الجديد';
        return;
    }
    if (!parentId) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'لازم تختار فين تحط العضو في شجرتك';
        return;
    }
    if (!side) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'لازم تختار الجهة: يمين ولا شمال';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ جاري الإضافة...';

    try {
        const memberData = {
            full_name: name,
            email: email || undefined,
            phone: phone || undefined,
            password_hash: '123456',
            is_active: true
        };

        const newMember = await window.SAWYAN_TREE.createMemberWithPlacement(
            memberData,
            currentUser.id,    // sponsor_id (الأبلاين الحقيقي = العضو الحالي)
            parentId,          // parent_id (الأبلاين المحظوط)
            side               // position
        );

        // إنشاء محفظة للعضو الجديد
        try {
            await window.SAWYAN.supabase
                .from('wallets')
                .insert([{ member_id: newMember.id, balance: 0 }]);
        } catch (e) {
            console.log('Wallet creation skipped:', e);
        }

        // عرض رسالة نجاح
        successDiv.style.display = 'block';
        successDiv.style.cssText = 'background:#f0fdf4; color:#166534; padding:16px; border-radius:10px; border:1px solid #bbf7d0; font-size:14px;';
        successDiv.innerHTML = `
            <div style="font-size:18px; margin-bottom:8px;">🎉 تم إضافة العضو بنجاح!</div>
            <div style="margin-bottom:6px;">الاسم: <strong>${newMember.full_name}</strong></div>
            <div style="margin-bottom:6px;">كود العضوية: <strong style="color:#047857;">${newMember.member_code}</strong></div>
            <div style="margin-bottom:6px;">كلمة المرور الافتراضية: <strong>123456</strong></div>
            <div style="margin-bottom:10px; font-size:12px; color:#6b7280;">
                محطوط: ${side === 'left' ? 'يسار' : 'يمين'} · الجيل ${newMember.tree_level}
            </div>
            <button onclick="closeAddMemberModal(); loadReferrals();" style="padding:8px 16px; background:#10b981; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                ✓ تمام
            </button>
        `;

        // أخفِ زر الإضافة
        submitBtn.style.display = 'none';

    } catch (err) {
        console.error('submitAddMember error:', err);
        errorDiv.style.display = 'block';
        errorDiv.textContent = '❌ ' + (err.message || 'حصل خطأ في الإضافة');
        submitBtn.disabled = false;
        submitBtn.textContent = '➕ أضف العضو';
    }
}

function copyReferralLink() {
    const input = document.querySelector('.referral-link input');
    if (!input) return;
    input.select();
    document.execCommand('copy');
    alert('✅ تم نسخ رابط الإحالة!');
}

async function loadSettings() {
    const page = document.getElementById('settingsPage');

    // تحميل أحدث بيانات العضو
    try {
        const { data: freshData } = await window.SAWYAN.supabase
            .from('members')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (freshData) memberData = freshData;
    } catch (e) {
        console.log('Using cached data');
    }

    const m = memberData || {};

    page.innerHTML = `
        <div class="profile-page">
            <h2 class="page-title-mobile">الملف الشخصي</h2>
            
            <!-- البروفايل الحالي -->
            <div class="profile-header-card member-profile">
                <div class="profile-avatar-container">
                    <div class="profile-avatar" id="profileAvatarPreview">
                        ${m.profile_image_url ? `<img src="${m.profile_image_url}" alt="Profile">` : `<span class="avatar-placeholder">👤</span>`}
                    </div>
                    <button class="btn-change-avatar" onclick="document.getElementById('avatarInput').click()">
                        📷 تغيير الصورة
                    </button>
                    <input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="previewAvatar(this)">
                </div>
                <div class="profile-info-brief">
                    <h3>${m.full_name || 'اسم العضو'}</h3>
                    <p class="member-code-badge">كود العضوية: ${m.member_code || '-'}</p>
                    <p class="subscription-badge">${getSubscriptionBadge(m.subscription_plan)}</p>
                </div>
            </div>

            <!-- أقسام الإعدادات -->
            <div class="settings-sections">
                
                <!-- المعلومات الشخصية -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('personalInfo')">
                        <span>👤 المعلومات الشخصية</span>
                        <span class="toggle-icon" id="personalInfoIcon">▼</span>
                    </div>
                    <div class="section-content" id="personalInfo">
                        <div class="form-group">
                            <label>الاسم الكامل</label>
                            <input type="text" id="settingsFullName" class="form-control" value="${m.full_name || ''}" placeholder="أدخل اسمك الكامل">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>تاريخ الميلاد</label>
                                <input type="date" id="settingsBirthDate" class="form-control" value="${m.date_of_birth || ''}">
                            </div>
                            <div class="form-group">
                                <label>الجنس</label>
                                <select id="settingsGender" class="form-control">
                                    <option value="">اختر...</option>
                                    <option value="male" ${m.gender === 'male' ? 'selected' : ''}>ذكر</option>
                                    <option value="female" ${m.gender === 'female' ? 'selected' : ''}>أنثى</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>الحالة الاجتماعية</label>
                            <select id="settingsMaritalStatus" class="form-control">
                                <option value="">اختر...</option>
                                <option value="single" ${m.marital_status === 'single' ? 'selected' : ''}>أعزب</option>
                                <option value="married" ${m.marital_status === 'married' ? 'selected' : ''}>متزوج</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>رقم الهوية</label>
                            <input type="text" id="settingsNationalId" class="form-control" value="${m.national_id || ''}" placeholder="رقم الهوية الوطنية">
                        </div>
                    </div>
                </div>

                <!-- معلومات التواصل -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('contactInfo')">
                        <span>📞 معلومات التواصل</span>
                        <span class="toggle-icon" id="contactInfoIcon">▼</span>
                    </div>
                    <div class="section-content" id="contactInfo">
                        <div class="form-group">
                            <label>📧 البريد الإلكتروني</label>
                            <input type="email" id="settingsEmail" class="form-control" value="${m.email || ''}" placeholder="email@example.com">
                        </div>
                        <div class="form-group">
                            <label>📱 رقم الهاتف</label>
                            <input type="tel" id="settingsPhone" class="form-control" value="${m.phone || ''}" placeholder="+20 123 456 7890">
                        </div>
                    </div>
                </div>

                <!-- العنوان -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('addressInfo')">
                        <span>📍 العنوان</span>
                        <span class="toggle-icon" id="addressInfoIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="addressInfo">
                        <div class="form-group">
                            <label>الجنسية</label>
                            <input type="text" id="settingsNationality" class="form-control" value="${m.nationality || ''}" placeholder="مثال: مصري">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>الدولة</label>
                                <input type="text" id="settingsCountry" class="form-control" value="${m.country || ''}" placeholder="مثال: مصر">
                            </div>
                            <div class="form-group">
                                <label>المدينة</label>
                                <input type="text" id="settingsCity" class="form-control" value="${m.city || ''}" placeholder="مثال: القاهرة">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>العنوان التفصيلي</label>
                            <textarea id="settingsAddress" class="form-control" rows="2" placeholder="الشارع، الحي، المنطقة...">${m.address || ''}</textarea>
                        </div>
                    </div>
                </div>

                <!-- رابط الإحالة -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('referralInfo')">
                        <span>🔗 رابط الإحالة</span>
                        <span class="toggle-icon" id="referralInfoIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="referralInfo">
                        <div class="referral-link-box">
                            <p>رابط الإحالة الخاص بك:</p>
                            <div class="referral-link-input">
                                <input type="text" readonly value="${window.location.origin}/member-dashboard/register.html?ref=${m.member_code}" id="referralLinkInput" class="form-control">
                                <button onclick="copyReferralLinkFromSettings()" class="btn btn-secondary">📋 نسخ</button>
                            </div>
                            <p class="form-text">شارك هذا الرابط مع أصدقائك لدعوتهم للانضمام</p>
                        </div>
                    </div>
                </div>

                <!-- تغيير كلمة المرور -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('passwordSection')">
                        <span>🔐 تغيير كلمة المرور</span>
                        <span class="toggle-icon" id="passwordSectionIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="passwordSection">
                        <div class="form-group">
                            <label>كلمة المرور الحالية</label>
                            <input type="password" id="settingsCurrentPassword" class="form-control" placeholder="أدخل كلمة المرور الحالية">
                        </div>
                        <div class="form-group">
                            <label>كلمة المرور الجديدة</label>
                            <input type="password" id="settingsNewPassword" class="form-control" placeholder="أدخل كلمة المرور الجديدة">
                        </div>
                        <div class="form-group">
                            <label>تأكيد كلمة المرور</label>
                            <input type="password" id="settingsConfirmPassword" class="form-control" placeholder="أعد إدخال كلمة المرور الجديدة">
                        </div>
                    </div>
                </div>

            </div>

            <!-- أزرار الحفظ -->
            <div class="settings-actions-fixed">
                <button onclick="saveSettings()" class="btn btn-primary btn-block btn-save-profile">
                    💾 حفظ جميع التغييرات
                </button>
            </div>
        </div>
    `;
}

// الحصول على شارة الاشتراك
function getSubscriptionBadge(plan) {
    const badges = {
        'free': '🆓 مجاني',
        'bronze': '🥉 برونزي',
        'silver': '🥈 فضي',
        'gold': '🥇 ذهبي'
    };
    return badges[plan] || '🆓 مجاني';
}

// تبديل إظهار/إخفاء قسم
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(sectionId + 'Icon');

    if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
        if (icon) icon.textContent = '▼';
    } else {
        section.classList.add('collapsed');
        if (icon) icon.textContent = '▶';
    }
}

// معاينة الصورة الشخصية
let pendingAvatarFile = null;

async function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // التحقق من حجم الملف (5 ميجابايت كحد أقصى)
        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة يتجاوز 5 ميجابايت');
            input.value = '';
            return;
        }

        // التحقق من نوع الملف
        if (!file.type.startsWith('image/')) {
            alert('الرجاء اختيار ملف صورة');
            input.value = '';
            return;
        }

        // حفظ الملف للرفع لاحقاً
        pendingAvatarFile = file;

        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('profileAvatarPreview').innerHTML =
                `<img src="${e.target.result}" alt="Avatar Preview">`;
        };
        reader.readAsDataURL(file);
    }
}

// رفع صورة البروفايل إلى Supabase Storage
async function uploadAvatar() {
    if (!pendingAvatarFile) return null;

    try {
        // استخدام مكون رفع الصور إذا كان متاحاً
        if (window.SAWYAN && window.SAWYAN.ImageUpload) {
            const result = await window.SAWYAN.ImageUpload.uploadImage(
                pendingAvatarFile,
                'avatars',
                `members/${currentUser.id}`
            );

            if (result.success) {
                pendingAvatarFile = null;
                return result.url;
            } else {
                console.error('Upload error:', result.error);
                // fallback: إذا فشل الرفع، نستمر بدون صورة
                return null;
            }
        }
        return null;
    } catch (err) {
        console.error('Avatar upload error:', err);
        return null;
    }
}

// نسخ رابط الإحالة
function copyReferralLinkFromSettings() {
    const input = document.getElementById('referralLinkInput');
    input.select();
    document.execCommand('copy');
    alert('✅ تم نسخ الرابط!');
}

async function saveSettings() {
    // جمع البيانات
    const fullName = document.getElementById('settingsFullName')?.value;
    const birthDate = document.getElementById('settingsBirthDate')?.value;
    const gender = document.getElementById('settingsGender')?.value;
    const maritalStatus = document.getElementById('settingsMaritalStatus')?.value;
    const nationalId = document.getElementById('settingsNationalId')?.value;

    const email = document.getElementById('settingsEmail')?.value;
    const phone = document.getElementById('settingsPhone')?.value;

    const nationality = document.getElementById('settingsNationality')?.value;
    const country = document.getElementById('settingsCountry')?.value;
    const city = document.getElementById('settingsCity')?.value;
    const address = document.getElementById('settingsAddress')?.value;

    const currentPassword = document.getElementById('settingsCurrentPassword')?.value;
    const newPassword = document.getElementById('settingsNewPassword')?.value;
    const confirmPassword = document.getElementById('settingsConfirmPassword')?.value;

    // التحقق من كلمة المرور
    if (newPassword) {
        if (newPassword !== confirmPassword) {
            alert('كلمة المرور الجديدة غير متطابقة!');
            return;
        }
        if (newPassword.length < 6) {
            alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }
    }

    // إظهار رسالة تحميل
    const saveBtn = document.querySelector('.btn-save-profile');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '⏳ جاري الحفظ...';
    saveBtn.disabled = true;

    try {
        // رفع الصورة إذا تم اختيار صورة جديدة
        let profileImageUrl = memberData.profile_image_url;
        if (pendingAvatarFile) {
            saveBtn.innerHTML = '⏳ جاري رفع الصورة...';
            const uploadedUrl = await uploadAvatar();
            if (uploadedUrl) {
                profileImageUrl = uploadedUrl;
            }
        }

        // تحديث البيانات
        const updateData = {
            full_name: fullName,
            date_of_birth: birthDate || null,
            gender: gender || null,
            marital_status: maritalStatus || null,
            national_id: nationalId,
            email: email,
            phone: phone,
            nationality: nationality,
            country: country,
            city: city,
            address: address,
            profile_image_url: profileImageUrl,
            updated_at: new Date().toISOString()
        };

        saveBtn.innerHTML = '⏳ جاري الحفظ...';

        const { error } = await window.SAWYAN.supabase
            .from('members')
            .update(updateData)
            .eq('id', currentUser.id);

        if (error) throw error;

        // تحديث كلمة المرور إذا تم إدخالها
        if (newPassword && currentPassword) {
            // التحقق من كلمة المرور الحالية
            if (memberData.password_hash !== currentPassword) {
                throw new Error('كلمة المرور الحالية غير صحيحة');
            }

            await window.SAWYAN.supabase
                .from('members')
                .update({ password_hash: newPassword })
                .eq('id', currentUser.id);
        }

        // تحديث البيانات المحلية
        memberData = { ...memberData, ...updateData };
        localStorage.setItem('sawyan_member', JSON.stringify(memberData));

        // تحديث الواجهة
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = fullName || 'عضو';

        alert('✅ تم حفظ التغييرات بنجاح!');

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ حدث خطأ: ' + error.message);
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

async function logout() {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
    localStorage.removeItem('sawyan_member');
    localStorage.removeItem('sawyan_member_id');
    localStorage.removeItem('sawyan_user_type');
    localStorage.removeItem('sawyan_login_at');
    window.location.href = '../index.html';
}

// ===== نظام المفضلة =====

// تحميل صفحة المفضلة
async function loadFavorites() {
    const page = document.getElementById('favoritesPage');
    page.innerHTML = `
        <h2>❤️ التجار المفضلين</h2>
        <p class="page-description">التجار الذين أضفتهم للمفضلة</p>
        <div id="favoritesList" class="merchants-grid"></div>
    `;

    try {
        const { data: favorites, error } = await window.SAWYAN.supabase
            .from('member_favorites')
            .select(`
                id,
                created_at,
                merchants (
                    id,
                    business_name,
                    business_category,
                    commission_percentage,
                    merchant_type,
                    logo_url,
                    city,
                    country,
                    is_verified,
                    avg_rating,
                    total_reviews
                )
            `)
            .eq('member_id', currentUser.id)
            .order('created_at', { ascending: false });

        const list = document.getElementById('favoritesList');

        if (error) {
            console.log('Favorites table may not exist:', error);
            list.innerHTML = '<p class="empty-state">جدول المفضلة غير متاح حالياً. سيتم تفعيله قريباً.</p>';
            return;
        }

        if (!favorites || favorites.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <span style="font-size: 4rem;">❤️</span>
                    <h3>لا يوجد تجار في المفضلة</h3>
                    <p>اضغط على ❤️ في صفحة التجار لإضافتهم للمفضلة</p>
                    <button class="btn btn-primary" onclick="navigateToPage('merchants')">استعرض التجار</button>
                </div>
            `;
            return;
        }

        list.innerHTML = favorites.map(fav => {
            const m = fav.merchants;
            if (!m) return '';
            return `
            <div class="merchant-card">
                <button class="favorite-btn active" onclick="removeFromFavorites('${fav.id}')" title="إزالة من المفضلة">
                    ❤️
                </button>
                <div class="merchant-header">
                    ${m.logo_url ? `<img src="${m.logo_url}" alt="${m.business_name}" class="merchant-logo">` : ''}
                    <div class="merchant-title">
                        <h4>${m.business_name}</h4>
                        ${m.is_verified ? '<span class="verified-badge" title="تاجر موثق">✓</span>' : ''}
                    </div>
                    <span class="commission-badge">${m.commission_percentage || 0}%</span>
                </div>
                <p class="merchant-category">📁 ${m.business_category || 'غير محدد'}</p>
                ${m.city ? `<p class="merchant-location">📍 ${m.city}</p>` : ''}
                ${m.avg_rating ? `<div class="merchant-rating">⭐ ${m.avg_rating} (${m.total_reviews || 0})</div>` : ''}
                <button class="btn btn-primary btn-sm" onclick="openTransactionModal('${m.id}', '${escapeHtml(m.business_name)}', ${m.commission_percentage || 0}, '${escapeHtml(m.business_category || '')}')">توثيق عملية</button>
            </div>
        `}).join('');

    } catch (err) {
        console.error('Error loading favorites:', err);
        document.getElementById('favoritesList').innerHTML = '<p class="empty-state">حدث خطأ في تحميل المفضلة</p>';
    }
}

// إضافة للمفضلة
async function addToFavorites(merchantId) {
    try {
        const { data, error } = await window.SAWYAN.supabase
            .from('member_favorites')
            .insert([{
                member_id: currentUser.id,
                merchant_id: merchantId
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Duplicate
                alert('هذا التاجر موجود بالفعل في المفضلة');
            } else {
                throw error;
            }
            return false;
        }

        return true;
    } catch (err) {
        console.error('Error adding to favorites:', err);
        alert('حدث خطأ في إضافة التاجر للمفضلة');
        return false;
    }
}

// إزالة من المفضلة
async function removeFromFavorites(favoriteId) {
    if (!confirm('هل تريد إزالة هذا التاجر من المفضلة؟')) return;

    try {
        const { error } = await window.SAWYAN.supabase
            .from('member_favorites')
            .delete()
            .eq('id', favoriteId);

        if (error) throw error;

        // إعادة تحميل الصفحة
        loadFavorites();
    } catch (err) {
        console.error('Error removing from favorites:', err);
        alert('حدث خطأ في إزالة التاجر من المفضلة');
    }
}

// Toggle favorite من صفحة التجار
async function toggleFavorite(merchantId, button) {
    const isActive = button.classList.contains('active');

    if (isActive) {
        // إزالة من المفضلة
        try {
            const { error } = await window.SAWYAN.supabase
                .from('member_favorites')
                .delete()
                .eq('member_id', currentUser.id)
                .eq('merchant_id', merchantId);

            if (!error) {
                button.classList.remove('active');
                button.textContent = '🤍';
            }
        } catch (err) {
            console.error('Error:', err);
        }
    } else {
        // إضافة للمفضلة
        const success = await addToFavorites(merchantId);
        if (success) {
            button.classList.add('active');
            button.textContent = '❤️';
        }
    }
}

// التنقل لصفحة معينة
function navigateToPage(pageName) {
    const navItem = document.querySelector(`[data-page="${pageName}"]`);
    if (navItem) {
        navItem.click();
    }
}

// ===== نظام التقييمات =====

// إضافة تقييم لتاجر
async function addReview(merchantId, transactionId, rating, comment) {
    try {
        const { data, error } = await window.SAWYAN.supabase
            .from('merchant_reviews')
            .insert([{
                merchant_id: merchantId,
                member_id: currentUser.id,
                transaction_id: transactionId,
                rating: rating,
                comment: comment,
                is_verified_purchase: transactionId ? true : false
            }])
            .select()
            .single();

        if (error) throw error;

        alert('تم إضافة تقييمك بنجاح! شكراً لمشاركتك.');
        return data;
    } catch (err) {
        console.error('Error adding review:', err);
        if (err.message.includes('duplicate')) {
            alert('لقد قمت بتقييم هذا التاجر من قبل');
        } else {
            alert('حدث خطأ في إضافة التقييم');
        }
        return null;
    }
}

// تحميل تقييمات تاجر
async function loadMerchantReviews(merchantId) {
    try {
        const { data: reviews, error } = await window.SAWYAN.supabase
            .from('merchant_reviews')
            .select(`
                *,
                members (full_name, member_code)
            `)
            .eq('merchant_id', merchantId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        return reviews || [];
    } catch (err) {
        console.error('Error loading reviews:', err);
        return [];
    }
}

// عرض نموذج التقييم
function showReviewForm(merchantId, merchantName, transactionId = null) {
    const formHTML = `
        <div class="review-form-modal" id="reviewFormModal">
            <div class="review-form-content">
                <button class="close-btn" onclick="closeReviewForm()">&times;</button>
                <h3>⭐ تقييم ${merchantName}</h3>
                
                <div class="form-group">
                    <label>تقييمك بالنجوم</label>
                    <div class="star-rating" id="starRating">
                        <span class="star" data-rating="1" onclick="setRating(1)">☆</span>
                        <span class="star" data-rating="2" onclick="setRating(2)">☆</span>
                        <span class="star" data-rating="3" onclick="setRating(3)">☆</span>
                        <span class="star" data-rating="4" onclick="setRating(4)">☆</span>
                        <span class="star" data-rating="5" onclick="setRating(5)">☆</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>تعليقك</label>
                    <textarea id="reviewComment" class="form-control" rows="3" 
                        placeholder="شاركنا تجربتك مع هذا التاجر..."></textarea>
                </div>
                
                <button class="btn btn-primary btn-block" onclick="submitReview('${merchantId}', '${transactionId || ''}')">
                    إرسال التقييم
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', formHTML);
}

let currentRating = 0;

function setRating(rating) {
    currentRating = rating;
    const stars = document.querySelectorAll('#starRating .star');
    stars.forEach((star, index) => {
        star.textContent = index < rating ? '★' : '☆';
        star.classList.toggle('active', index < rating);
    });
}

async function submitReview(merchantId, transactionId) {
    if (currentRating === 0) {
        alert('الرجاء اختيار تقييم بالنجوم');
        return;
    }

    const comment = document.getElementById('reviewComment').value;
    if (!comment.trim()) {
        alert('الرجاء كتابة تعليق');
        return;
    }

    const result = await addReview(merchantId, transactionId || null, currentRating, comment);
    if (result) {
        closeReviewForm();
        currentRating = 0;
    }
}

function closeReviewForm() {
    const modal = document.getElementById('reviewFormModal');
    if (modal) modal.remove();
}

// ===== نظام الموقع الجغرافي =====

let userLocation = null;

// الحصول على موقع المستخدم
async function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('المتصفح لا يدعم تحديد الموقع'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                resolve(userLocation);
            },
            error => {
                let message = 'فشل في تحديد الموقع';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message = 'تم رفض إذن الموقع. الرجاء السماح بتحديد الموقع من إعدادات المتصفح.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = 'معلومات الموقع غير متاحة';
                        break;
                    case error.TIMEOUT:
                        message = 'انتهى وقت طلب الموقع';
                        break;
                }
                reject(new Error(message));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 دقائق
            }
        );
    });
}

// حساب المسافة بين نقطتين (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ترتيب التجار حسب القرب
async function sortMerchantsByDistance() {
    try {
        if (!userLocation) {
            await getUserLocation();
        }

        if (!userLocation) {
            alert('لم يتم تحديد موقعك. الرجاء السماح بتحديد الموقع.');
            return;
        }

        // حساب المسافة لكل تاجر
        filteredMerchants = filteredMerchants.map(m => {
            if (m.latitude && m.longitude) {
                m.distance = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    parseFloat(m.latitude),
                    parseFloat(m.longitude)
                );
            } else {
                m.distance = 999999; // بعيد جداً إذا لا يوجد موقع
            }
            return m;
        });

        // ترتيب حسب المسافة
        filteredMerchants.sort((a, b) => a.distance - b.distance);

        // عرض النتائج مع المسافة
        renderMerchantsWithDistance();

    } catch (err) {
        console.error('Location error:', err);
        alert(err.message);
    }
}

// عرض التجار مع المسافة
function renderMerchantsWithDistance() {
    const merchantsList = document.getElementById('merchantsList');
    const countElement = document.getElementById('merchantCount');

    countElement.textContent = filteredMerchants.length;

    if (filteredMerchants.length === 0) {
        merchantsList.innerHTML = `
            <div class="empty-state">
                <span style="font-size: 3rem;">🔍</span>
                <p>لا توجد نتائج مطابقة</p>
            </div>
        `;
        return;
    }

    merchantsList.innerHTML = filteredMerchants.map(m => `
        <div class="merchant-card clickable" onclick="openTransactionModal('${m.id}', '${escapeHtml(m.business_name)}', ${m.commission_percentage || 0}, '${escapeHtml(m.business_category || '')}')">
            <div class="merchant-header">
                ${m.logo_url ? `<img src="${m.logo_url}" alt="${m.business_name}" class="merchant-logo">` : ''}
                <div class="merchant-title">
                    <h4>${m.business_name}</h4>
                    ${m.is_verified ? '<span class="verified-badge" title="تاجر موثق">✓</span>' : ''}
                </div>
                <span class="commission-badge">${m.commission_percentage || 0}%</span>
            </div>
            <p class="merchant-category">📁 ${m.business_category || 'غير محدد'}</p>
            ${m.distance && m.distance < 999999 ? `
                <p class="merchant-distance">📍 ${m.distance < 1 ? Math.round(m.distance * 1000) + ' متر' : m.distance.toFixed(1) + ' كم'}</p>
            ` : m.city ? `<p class="merchant-location">📍 ${m.city}</p>` : ''}
            ${m.avg_rating ? `<div class="merchant-rating">⭐ ${m.avg_rating} (${m.total_reviews || 0})</div>` : ''}
            ${m.latitude && m.longitude ? `
                <a href="https://www.google.com/maps?q=${m.latitude},${m.longitude}" target="_blank" class="btn btn-secondary btn-xs" onclick="event.stopPropagation()">
                    🗺️ عرض على الخريطة
                </a>
            ` : ''}
            <button class="btn btn-primary btn-sm">توثيق عملية</button>
        </div>
    `).join('');
}

// فتح الموقع على Google Maps
function openInGoogleMaps(lat, lng) {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
}

// ===== نظام النزاعات =====

// فتح نزاع على عملية
async function openDispute(transactionId, merchantId, merchantName) {
    const formHTML = `
        <div class="dispute-modal" id="disputeModal">
            <div class="dispute-content">
                <button class="close-btn" onclick="closeDisputeModal()">&times;</button>
                <h3>⚠️ فتح نزاع</h3>
                <p class="dispute-warning">سيتم إرسال هذا النزاع للتاجر والإدارة للمراجعة</p>
                
                <div class="dispute-transaction-info">
                    <p><strong>التاجر:</strong> ${merchantName}</p>
                    <p><strong>كود العملية:</strong> ${transactionId}</p>
                </div>
                
                <form id="disputeForm">
                    <div class="form-group">
                        <label>نوع المشكلة *</label>
                        <select id="disputeType" class="form-control" required>
                            <option value="">اختر نوع المشكلة</option>
                            <option value="transaction_not_received">لم أستلم المنتج/الخدمة</option>
                            <option value="wrong_amount">المبلغ خاطئ</option>
                            <option value="service_issue">مشكلة في الخدمة</option>
                            <option value="wrong_cashback">العمولة خاطئة</option>
                            <option value="other">أخرى</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>تفاصيل المشكلة *</label>
                        <textarea id="disputeReason" class="form-control" rows="4" required
                            placeholder="اشرح المشكلة بالتفصيل..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>رابط دليل (صورة/فيديو) - اختياري</label>
                        <input type="url" id="disputeEvidence" class="form-control" 
                            placeholder="https://example.com/evidence.jpg">
                    </div>
                    
                    <button type="submit" class="btn btn-warning btn-block">📤 إرسال النزاع</button>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', formHTML);

    document.getElementById('disputeForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        await submitDispute(transactionId, merchantId);
    });
}

// إرسال النزاع
async function submitDispute(transactionId, merchantId) {
    const disputeType = document.getElementById('disputeType').value;
    const reason = document.getElementById('disputeReason').value;
    const evidence = document.getElementById('disputeEvidence').value;

    if (!disputeType || !reason) {
        alert('الرجاء ملء جميع الحقول المطلوبة');
        return;
    }

    try {
        const disputeCode = 'D' + Date.now();
        const evidenceUrls = evidence ? [evidence] : [];

        const { data, error } = await window.SAWYAN.supabase
            .from('disputes')
            .insert([{
                dispute_code: disputeCode,
                transaction_id: transactionId,
                member_id: currentUser.id,
                merchant_id: merchantId,
                dispute_type: disputeType,
                reason: reason,
                evidence_urls: evidenceUrls,
                status: 'open'
            }])
            .select()
            .single();

        if (error) throw error;

        // إرسال إشعار للتاجر
        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'merchant',
                    user_id: merchantId,
                    title: '⚠️ نزاع جديد',
                    message: `تم فتح نزاع على عملية. كود النزاع: ${disputeCode}`,
                    notification_type: 'dispute'
                }]);
        } catch (notifErr) {
            console.log('Notification error:', notifErr);
        }

        closeDisputeModal();
        alert(`✅ تم إرسال النزاع بنجاح!\n\nكود النزاع: ${disputeCode}\n\nسيتم مراجعته من قبل التاجر والإدارة.`);

    } catch (err) {
        console.error('Dispute error:', err);
        if (err.message.includes('disputes')) {
            alert('جدول النزاعات غير متاح. الرجاء تشغيل SQL أولاً.');
        } else {
            alert('حدث خطأ: ' + err.message);
        }
    }
}

function closeDisputeModal() {
    const modal = document.getElementById('disputeModal');
    if (modal) modal.remove();
}

// عرض نزاعاتي
async function loadMyDisputes() {
    try {
        const { data: disputes, error } = await window.SAWYAN.supabase
            .from('disputes')
            .select(`
                *,
                merchants (business_name),
                transactions (transaction_code, total_amount)
            `)
            .eq('member_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.log('Disputes table may not exist');
            return [];
        }

        return disputes || [];
    } catch (err) {
        console.error('Error loading disputes:', err);
        return [];
    }
}

// عرض زر النزاع في العمليات المكتملة
function getDisputeButton(transaction) {
    // يمكن فتح نزاع على العمليات المكتملة فقط خلال 30 يوم
    const transactionDate = new Date(transaction.transaction_date);
    const daysSince = (new Date() - transactionDate) / (1000 * 60 * 60 * 24);

    if (daysSince > 30) {
        return '<span class="dispute-expired">انتهت مدة النزاع</span>';
    }

    return `<button class="btn btn-warning btn-xs" onclick="openDispute('${transaction.id}', '${transaction.merchant_id}', '${escapeHtml(transaction.merchants?.business_name || 'تاجر')}')">⚠️ فتح نزاع</button>`;
}

// ===== تحسينات الإشعارات =====
// ⚠️ الإشعارات بتتحمل من shared/components/notifications.js
// فيه Real-time + polling fallback — مش محتاج polling تاني هنا

// ============================================
// دوال نظام الدفع الجديد (Scenario C)
// ============================================

/**
 * تبديل عرض قسم الدفع عبر التطبيق
 */
function toggleInAppPaymentSection(paymentMethod) {
    const section = document.getElementById('inAppPaymentSection');
    if (section) {
        section.style.display = paymentMethod === 'in_app' ? 'block' : 'none';
    }
}

/**
 * اختيار طريقة الدفع (للـ onclick)
 */
function selectPaymentMethod(method) {
    const radio = document.querySelector(`input[name="paymentMethod"][value="${method}"]`);
    if (radio) {
        radio.checked = true;
        toggleInAppPaymentSection(method);
    }
}

/**
 * تنسيق رقم البطاقة (إضافة مسافات كل 4 أرقام)
 */
function formatCardNumber(input) {
    let value = input.value.replace(/\s/g, '').replace(/\D/g, '');
    value = value.substring(0, 16);
    const parts = [];
    for (let i = 0; i < value.length; i += 4) {
        parts.push(value.substring(i, i + 4));
    }
    input.value = parts.join(' ');
}

/**
 * تنسيق تاريخ الانتهاء (MM/YY)
 */
function formatExpiry(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    input.value = value;
}

/**
 * معالجة الدفع عبر التطبيق (Scenario C)
 */
async function processInAppMemberPayment(amount, notes) {
    // التحقق من بيانات البطاقة
    const cardNumber = document.getElementById('cardNumber')?.value.replace(/\s/g, '');
    const cardExpiry = document.getElementById('cardExpiry')?.value;
    const cardCVV = document.getElementById('cardCVV')?.value;
    const cardHolder = document.getElementById('cardHolder')?.value;

    if (!cardNumber || cardNumber.length < 13) {
        alert('الرجاء إدخال رقم بطاقة صحيح');
        return;
    }

    if (!cardExpiry || !cardExpiry.includes('/')) {
        alert('الرجاء إدخال تاريخ انتهاء صحيح (MM/YY)');
        return;
    }

    if (!cardCVV || cardCVV.length < 3) {
        alert('الرجاء إدخال رمز CVV صحيح');
        return;
    }

    // عرض رسالة الانتظار
    const submitBtn = document.querySelector('#createTransactionForm button[type="submit"]');
    const originalBtnText = submitBtn?.innerHTML;
    if (submitBtn) {
        submitBtn.innerHTML = '⏳ جاري معالجة الدفع...';
        submitBtn.disabled = true;
    }

    try {
        // التحقق من جاهزية نظام الدفع
        if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
            throw new Error('نظام الدفع غير جاهز، الرجاء تحديث الصفحة');
        }

        // توكين البطاقة أولاً
        const [expMonth, expYear] = cardExpiry.split('/');
        const provider = window.SAWYAN.PaymentService.getProvider();

        console.log('💳 [Member] Tokenizing card...');
        const tokenResult = await provider.tokenizeCard({
            number: cardNumber,
            expMonth: expMonth,
            expYear: '20' + expYear,
            cvv: cardCVV,
            holderName: cardHolder || 'Card Holder'
        });

        if (!tokenResult.success) {
            throw new Error(tokenResult.error || 'فشل في توكين البطاقة');
        }

        console.log('✅ [Member] Card tokenized:', tokenResult.cardBrand, '****' + tokenResult.lastFour);

        // معالجة الدفع
        console.log('💰 [Member] Processing payment...');
        const paymentResult = await window.SAWYAN.PaymentService.processMemberPayment({
            memberId: memberData.id,
            merchantId: selectedMerchantId,
            amount: amount,
            currency: 'EGP', // يمكن تغييرها حسب الدولة
            paymentToken: tokenResult.token,
            commissionPercentage: selectedCommissionPercentage
        });

        if (!paymentResult.success) {
            throw new Error(paymentResult.error || 'فشل في معالجة الدفع');
        }

        console.log('✅ [Member] Payment successful:', paymentResult);

        // حفظ في قاعدة البيانات
        const transactionCode = 'TMP' + Date.now(); // TMP = Transaction Member Payment

        const { data: newTransaction, error } = await window.SAWYAN.supabase
            .from('transactions')
            .insert([{
                transaction_code: transactionCode,
                member_id: memberData.id,
                merchant_id: selectedMerchantId,
                total_amount: amount,
                commission_percentage: selectedCommissionPercentage,
                commission_amount: paymentResult.split.commissionAmount,
                company_share: paymentResult.split.platformShare,
                plan_share: paymentResult.split.memberShare,
                payment_method: 'in_app',
                payment_provider: paymentResult.paymentProvider,
                payment_reference: paymentResult.transactionId,
                status: 'completed', // مكتملة فوراً لأن الدفع تم
                metadata: notes ? { notes } : {}
            }])
            .select()
            .single();

        if (error) {
            console.error('DB Error:', error);
            // الدفع تم ولكن الحفظ فشل - نعرض التفاصيل للمستخدم
            alert(`⚠️ تم الدفع بنجاح ولكن حدث خطأ في الحفظ.\n\nرقم العملية: ${paymentResult.transactionId}\nالرجاء التواصل مع الدعم`);
        } else {
            // تحديث محفظة العضو مباشرة
            try {
                const { data: wallet } = await window.SAWYAN.supabase
                    .from('wallets')
                    .select('id, balance, total_earned')
                    .eq('member_id', memberData.id)
                    .single();

                if (wallet) {
                    await window.SAWYAN.supabase
                        .from('wallets')
                        .update({
                            balance: wallet.balance + paymentResult.split.memberShare,
                            total_earned: (wallet.total_earned || 0) + paymentResult.split.memberShare,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', wallet.id);

                    await window.SAWYAN.supabase
                        .from('wallet_transactions')
                        .insert([{
                            wallet_id: wallet.id,
                            transaction_type: 'commission',
                            amount: paymentResult.split.memberShare,
                            description: 'عمولة من عملية دفع أونلاين لدى ' + selectedMerchantName,
                            reference_id: newTransaction.id,
                            status: 'completed'
                        }]);
                }
            } catch (walletError) {
                console.error('Wallet update error:', walletError);
            }

            closeTransactionModal();

            alert(`✅ تم الدفع بنجاح!\n\n💳 المبلغ: ${amount.toFixed(2)} ج.م\n💰 العمولة: ${paymentResult.split.commissionAmount.toFixed(2)} ج.م\n🎁 تمت إضافة ${paymentResult.split.memberShare.toFixed(2)} ج.م لمحفظتك\n\nكود العملية: ${transactionCode}`);
        }

    } catch (error) {
        console.error('❌ Payment error:', error);
        alert('❌ فشل في الدفع: ' + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText || 'إرسال طلب التوثيق';
            submitBtn.disabled = false;
        }
    }
}

/**
 * عرض QR كود الدفع بدون اتصال في الصفحة الرئيسية
 */
async function displayOfflinePaymentQR() {
    try {
        if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
            console.log('Payment service not ready for QR generation');
            return;
        }

        const qrContainer = document.getElementById('offlinePaymentQR');
        if (!qrContainer) return;

        // توليد QR للدفع بدون اتصال
        const qrData = window.SAWYAN.PaymentService.generateOfflineQR(
            memberData.id,
            memberData.member_code
        );

        // عرض QR
        if (window.QRCode) {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, {
                text: qrData,
                width: 180,
                height: 180,
                colorDark: '#764ba2',
                colorLight: '#ffffff'
            });
        }

        // عرض معلومات الصلاحية
        const expiryInfo = document.getElementById('qrExpiryInfo');
        if (expiryInfo) {
            const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
            expiryInfo.textContent = 'صالح حتى: ' + expiryDate.toLocaleString('ar-EG');
        }

    } catch (error) {
        console.error('QR generation error:', error);
    }
}

/**
 * تحديث QR الدفع بدون اتصال
 */
function refreshOfflineQR() {
    displayOfflinePaymentQR();
    alert('✅ تم تحديث QR Code بنجاح');
}

// تفعيل عند جاهزية نظام الدفع
window.addEventListener('sawyan:payment:ready', () => {
    console.log('🎉 Payment system ready in member dashboard');
    // يمكن تفعيل ميزات إضافية هنا
});


