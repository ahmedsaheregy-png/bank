// لوحة العضو - مكتملة بكل الميزات
let currentUser = null;
let memberData = null;

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

        // حجم الفريق
        const { count: teamCount } = await window.SAWYAN.supabase
            .from('members')
            .select('*', { count: 'exact', head: true })
            .eq('sponsor_id', currentUser.id);

        document.getElementById('teamSize').textContent = teamCount || 0;

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
    page.innerHTML = '<h2>شجرتي</h2><div id="treeView"><p>جاري تحميل الشجرة...</p></div>';

    const { data: team } = await window.SAWYAN.supabase
        .from('members')
        .select('member_code, full_name, created_at')
        .eq('sponsor_id', currentUser.id);

    const treeView = document.getElementById('treeView');
    if (!team || team.length === 0) {
        treeView.innerHTML = '<p class="empty-state">لا يوجد أعضاء في فريقك بعد</p>';
        return;
    }

    treeView.innerHTML = `
        <div class="tree-stats">
            <p><strong>إجمالي الفريق:</strong> ${team.length} عضو</p>
        </div>
        <div class="team-list">
            ${team.map(m => `
                <div class="team-member">
                    <div><strong>الكود:</strong> ${m.member_code}</div>
                    <div><strong>الاسم:</strong> ${m.full_name || '-'}</div>
                    <div><strong>تاريخ الانضمام:</strong> ${new Date(m.created_at).toLocaleDateString('ar-EG')}</div>
                </div>
            `).join('')}
        </div>
    `;
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
                description: `طلب سحب - ${getMethodLabel(method)} - ${account}`,
                metadata: {
                    method: method,
                    account: account,
                    notes: notes
                }
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
                <h3>إنشاء عملية توثيق</h3>
                
                <div id="selectedMerchantInfo" class="merchant-info-box"></div>
                
                <form id="createTransactionForm">
                    <div class="form-group">
                        <label>المبلغ (ج.م) *</label>
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
                        <label>صورة الفاتورة (اختياري)</label>
                        <div class="invoice-upload-wrapper">
                            <input type="file" id="transInvoiceFile" accept="image/*" 
                                class="form-control" onchange="previewInvoiceImage(this)">
                            <div id="invoicePreview" class="invoice-preview" style="display: none;">
                                <img id="invoicePreviewImg" src="" alt="معاينة الفاتورة">
                                <button type="button" class="btn-remove-image" onclick="removeInvoicePreview()">✕</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>ملاحظات (اختياري)</label>
                        <textarea id="transNotes" class="form-control" rows="2" 
                            placeholder="وصف المشتريات..."></textarea>
                    </div>
                    
                    <div class="form-note">
                        <p>⏳ العملية ستكون <strong>معلقة</strong> حتى يوافق عليها التاجر</p>
                    </div>
                    
                    <!-- نوع العملية -->
                    <div class="form-group">
                        <label>نوع العملية</label>
                        <div class="transaction-type-options">
                            <label class="radio-option">
                                <input type="radio" name="memberTransactionType" value="documentation" checked>
                                <span class="radio-label">توثيق فقط</span>
                            </label>
                            <label class="radio-option disabled-option">
                                <input type="radio" name="memberTransactionType" value="wallet_payment" disabled>
                                <span class="radio-label">توثيق + دفع من المحفظة</span>
                                <span class="coming-soon-badge">قريباً بإذن الله</span>
                            </label>
                        </div>
                    </div>
                    
                    <button type="submit" class="btn btn-primary btn-block">إرسال طلب التوثيق</button>
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

    document.getElementById('transactionModal').style.display = 'flex';
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
    const invoiceUrl = document.getElementById('transInvoiceUrl').value;
    const notes = document.getElementById('transNotes').value;

    if (!amount || amount <= 0) {
        alert('الرجاء إدخال مبلغ صحيح');
        return;
    }

    try {
        // حساب العمولات
        const commissionAmount = amount * (selectedCommissionPercentage / 100);
        const companyShare = commissionAmount * 0.25;
        const planShare = commissionAmount * 0.75;

        const transactionCode = 'TM' + Date.now(); // TM = Transaction by Member

        console.log('Creating transaction with data:', {
            member_id: memberData.id,
            merchant_id: selectedMerchantId,
            amount: amount,
            status: 'pending'
        });

        // إنشاء العملية بحالة pending
        const { data: newTransaction, error } = await window.SAWYAN.supabase
            .from('transactions')
            .insert([{
                transaction_code: transactionCode,
                member_id: memberData.id,
                merchant_id: selectedMerchantId,
                total_amount: amount,
                commission_percentage: selectedCommissionPercentage,
                commission_amount: commissionAmount,
                company_share: companyShare,
                plan_share: planShare,
                status: 'pending' // معلقة حتى يوافق التاجر
            }])
            .select()
            .single();

        console.log('Transaction result:', newTransaction, 'Error:', error);

        if (error) throw error;

        // إنشاء إشعار للتاجر (اختياري - إذا كان جدول الإشعارات موجود)
        try {
            console.log('Creating notification for merchant:', selectedMerchantId);
            const { data: notifData, error: notifError } = await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'merchant',
                    user_id: selectedMerchantId,
                    title: 'طلب توثيق عملية جديد 📝',
                    message: memberData.full_name + ' طلب توثيق عملية بمبلغ ' + amount.toFixed(2) + ' ج.م',
                    notification_type: 'transaction_request'
                }])
                .select();

            if (notifError) {
                console.error('Notification error:', notifError);
            } else {
                console.log('Notification created:', notifData);
            }
        } catch (notifErr) {
            console.error('Notification exception:', notifErr);
        }

        closeTransactionModal();

        alert(`✅ تم إرسال طلب التوثيق بنجاح!\n\nكود العملية: ${transactionCode}\nالمبلغ: ${amount.toFixed(2)} ج.م\nالعمولة المتوقعة: ${commissionAmount.toFixed(2)} ج.م\n\n⏳ في انتظار موافقة التاجر`);

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
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
    page.innerHTML = `
        <h2>رابط الإحالة الخاص بك</h2>
        <div class="referral-link">
            <input type="text" value="${window.location.origin}/member-dashboard/register.html?ref=${memberData?.member_code}" readonly>
            <button onclick="copyReferralLink()">نسخ</button>
        </div>
    `;
}

function copyReferralLink() {
    const input = document.querySelector('.referral-link input');
    input.select();
    document.execCommand('copy');
    alert('تم نسخ الرابط!');
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
    localStorage.removeItem('sawyan_member');
    localStorage.removeItem('sawyan_member_id');
    window.location.href = '../landing-page/index.html';
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

// طلب إذن الإشعارات
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    return false;
}

// إرسال إشعار محلي
function sendLocalNotification(title, body, icon = '🔔') {
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: icon,
            badge: '/shared/icons/badge.png',
            tag: 'sawyan-notification',
            renotify: true
        });
    }
}

// التحقق من إشعارات جديدة كل 30 ثانية
let notificationCheckInterval = null;

function startNotificationPolling() {
    if (!currentUser) return;

    // طلب إذن الإشعارات
    requestNotificationPermission();

    // التحقق كل 30 ثانية
    notificationCheckInterval = setInterval(checkNewNotifications, 30000);
}

async function checkNewNotifications() {
    try {
        const { data: notifications, error } = await window.SAWYAN.supabase
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('user_type', 'member')
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!error && notifications && notifications.length > 0) {
            // إظهار إشعار للإشعار الأخير
            const latest = notifications[0];
            sendLocalNotification(latest.title, latest.message);

            // تحديث العداد
            updateNotificationBadge(notifications.length);
        }
    } catch (err) {
        console.log('Notification check error:', err);
    }
}

function updateNotificationBadge(count) {
    let badge = document.getElementById('notificationBadge');
    if (!badge) {
        // إنشاء العداد إذا لم يكن موجوداً
        const bellIcon = document.querySelector('.notification-bell');
        if (bellIcon) {
            badge = document.createElement('span');
            badge.id = 'notificationBadge';
            badge.className = 'notification-badge';
            bellIcon.appendChild(badge);
        }
    }

    if (badge) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// إيقاف التحقق عند مغادرة الصفحة
window.addEventListener('beforeunload', () => {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
    }
});

// بدء التحقق من الإشعارات بعد الدخول
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(startNotificationPolling, 5000);
});
