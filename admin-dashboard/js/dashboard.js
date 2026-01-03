// لوحة تحكم الأدمن
let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.icon();
    }

    await checkAuth();
    await loadStats();
    await loadRecentActivity();

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });

    // تفعيل Bottom Navigation
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const page = this.dataset.page;

            document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            // تحديث الصفحة
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const pageElement = document.getElementById(page + 'Page');
            if (pageElement) pageElement.classList.add('active');

            // تحميل المحتوى
            if (page === 'members') loadMembers();
            if (page === 'merchants') loadMerchants();
        });
    });
});

async function checkAuth() {
    // التحقق من localStorage
    const savedAdmin = localStorage.getItem('sawyan_admin');
    if (!savedAdmin) {
        window.location.href = 'login.html';
        return;
    }

    try {
        currentAdmin = JSON.parse(savedAdmin);
        document.getElementById('adminName').textContent = currentAdmin.full_name || 'مدير النظام';
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('sawyan_admin');
        window.location.href = 'login.html';
    }
}

async function loadStats() {
    try {
        const { count: membersCount } = await window.SAWYAN.supabase
            .from('members')
            .select('*', { count: 'exact', head: true });

        const { count: merchantsCount } = await window.SAWYAN.supabase
            .from('merchants')
            .select('*', { count: 'exact', head: true });

        const { count: transactionsCount } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true });

        const { data: commissions } = await window.SAWYAN.supabase
            .from('transactions')
            .select('commission_amount');

        const totalCommissions = commissions?.reduce((sum, t) => sum + parseFloat(t.commission_amount || 0), 0) || 0;

        document.getElementById('totalMembers').textContent = membersCount || 0;
        document.getElementById('totalMerchants').textContent = merchantsCount || 0;
        document.getElementById('totalTransactions').textContent = transactionsCount || 0;
        document.getElementById('totalCommissions').textContent = totalCommissions.toFixed(2) + ' ج.م';

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadRecentActivity() {
    try {
        const { data: transactions } = await window.SAWYAN.supabase
            .from('transactions')
            .select(`
                *,
                members(full_name, member_code),
                merchants(business_name, merchant_code)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        const activityList = document.getElementById('activityList');

        if (!transactions || transactions.length === 0) {
            activityList.innerHTML = '<p class="empty-state">لا توجد أنشطة حديثة</p>';
            return;
        }

        activityList.innerHTML = transactions.map(t => `
            <div class="activity-item">
                <div class="activity-icon">💳</div>
                <div class="activity-details">
                    <div class="activity-title">عملية جديدة</div>
                    <div class="activity-description">
                        ${t.members?.full_name || 'عضو'} (${t.members?.member_code || '-'}) 
                        اشترى من ${t.merchants?.business_name || 'تاجر'} 
                        بمبلغ ${parseFloat(t.total_amount).toFixed(2)} ج.م
                    </div>
                </div>
                <div class="activity-time">${new Date(t.created_at).toLocaleDateString('ar-EG')}</div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

async function loadMembers() {
    try {
        const { data: members } = await window.SAWYAN.supabase
            .from('members')
            .select('*')
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('membersTableBody');

        if (!members || members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد أعضاء</td></tr>';
            return;
        }

        tbody.innerHTML = members.map(m => `
            <tr>
                <td data-label="كود العضو">${m.member_code}</td>
                <td data-label="الاسم">${m.full_name}</td>
                <td data-label="البريد">${m.email}</td>
                <td data-label="الهاتف">${m.phone}</td>
                <td data-label="تاريخ التسجيل">${new Date(m.created_at).toLocaleDateString('ar-EG')}</td>
                <td data-label="الحالة"><span class="badge ${m.is_active ? 'badge-success' : 'badge-danger'}">${m.is_active ? 'نشط' : 'معطل'}</span></td>
                <td data-label="إجراءات">
                    <button class="btn-sm btn-primary" onclick="viewMember('${m.id}')">عرض</button>
                    <button class="btn-sm btn-warning" onclick="toggleMemberStatus('${m.id}', ${!m.is_active})">${m.is_active ? 'تعطيل' : 'تفعيل'}</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading members:', error);
    }
}

async function loadMerchants() {
    try {
        const { data: merchants } = await window.SAWYAN.supabase
            .from('merchants')
            .select('*')
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('merchantsTableBody');

        if (!merchants || merchants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">لا يوجد تجار</td></tr>';
            return;
        }

        tbody.innerHTML = merchants.map(m => `
            <tr>
                <td data-label="كود التاجر">${m.merchant_code}</td>
                <td data-label="اسم النشاط">${m.business_name}</td>
                <td data-label="النوع">${m.merchant_type === 'physical' ? 'فيزيائي' : m.merchant_type === 'online' ? 'أونلاين' : 'كلاهما'}</td>
                <td data-label="الفئة">${m.business_category}</td>
                <td data-label="النسبة %">${m.commission_percentage}%</td>
                <td data-label="المستحقات" style="font-weight: bold; color: #d32f2f;">${parseFloat(m.total_commission_due || 0).toFixed(2)} ج.م</td>
                <td data-label="الحالة"><span class="badge ${m.is_active ? 'badge-success' : 'badge-danger'}">${m.is_active ? 'نشط' : 'معطل'}</span></td>
                <td data-label="إجراءات">
                    <button class="btn-sm btn-primary" onclick="viewMerchant('${m.id}')">عرض</button>
                    <button class="btn-sm btn-warning" onclick="toggleMerchantStatus('${m.id}', ${!m.is_active})">${m.is_active ? 'تعطيل' : 'تفعيل'}</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading merchants:', error);
    }
}

async function loadTransactions() {
    try {
        const { data: transactions } = await window.SAWYAN.supabase
            .from('transactions')
            .select(`
                *,
                members(full_name, member_code),
                merchants(business_name, merchant_code)
            `)
            .order('transaction_date', { ascending: false });

        const tbody = document.getElementById('transactionsTableBody');

        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">لا توجد عمليات</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(t => `
            <tr>
                <td data-label="كود العملية">${t.transaction_code}</td>
                <td data-label="العضو">${t.members?.full_name || '-'} (${t.members?.member_code || '-'})</td>
                <td data-label="التاجر">${t.merchants?.business_name || '-'}</td>
                <td data-label="المبلغ">${parseFloat(t.total_amount).toFixed(2)} ج.م</td>
                <td data-label="العمولة">${parseFloat(t.commission_amount).toFixed(2)} ج.م</td>
                <td data-label="التاريخ">${new Date(t.transaction_date).toLocaleDateString('ar-EG')}</td>
                <td data-label="الحالة"><span class="badge badge-success">${t.status === 'completed' ? 'مكتملة' : t.status}</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

function handleNavigation(e) {
    e.preventDefault();
    const page = this.dataset.page;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    this.classList.add('active');

    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
    }

    document.getElementById('pageTitle').textContent = this.querySelector('span:last-child').textContent;

    if (page === 'members') loadMembers();
    if (page === 'merchants') loadMerchants();
    if (page === 'transactions') loadTransactions();
}

function exportMembers() {
    alert('ميزة التصدير ستكون متاحة قريباً');
}

function exportMerchants() {
    alert('ميزة التصدير ستكون متاحة قريباً');
}

function exportTransactions() {
    alert('ميزة التصدير ستكون متاحة قريباً');
}

async function logout() {
    localStorage.removeItem('sawyan_admin');
    localStorage.removeItem('sawyan_user_type');
    window.location.href = '../landing-page/index.html';
}


// تحديث handleNavigation لدعم الصفحات الجديدة
const originalHandleNavigation = handleNavigation;
handleNavigation = function (e) {
    originalHandleNavigation.call(this, e);
    const page = this.dataset.page;
    if (page === 'commissions' && typeof loadCommissions === 'function') loadCommissions();
    if (page === 'disputes' && typeof loadDisputes === 'function') loadDisputes();
    if (page === 'support' && typeof loadSupport === 'function') loadSupport();
    if (page === 'settings' && typeof loadSettings === 'function') loadSettings();
    if (page === 'withdrawals' && typeof loadWithdrawals === 'function') loadWithdrawals();
};

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
        'transactions': 'العمليات',
        'commissions': 'العمولات',
        'disputes': 'الشكاوى',
        'support': 'الدعم الفني',
        'reports': 'التقارير',
        'settings': 'الإعدادات',
        'withdrawals': 'طلبات السحب'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || 'لوحة تحكم الأدمن';

    // تحميل المحتوى
    if (pageName === 'transactions') loadTransactions();
    if (pageName === 'commissions' && typeof loadCommissions === 'function') loadCommissions();
    if (pageName === 'disputes' && typeof loadDisputes === 'function') loadDisputes();
    if (pageName === 'support') loadSupport();
    if (pageName === 'settings') loadSettings();
    if (pageName === 'withdrawals') loadWithdrawals();
}

// ===== إعدادات النظام =====
async function loadSettings() {
    const page = document.getElementById('settingsPage');
    if (!page) return;

    page.innerHTML = `
        <div class="settings-admin-page">
            <h2 class="page-title-mobile">⚙️ إعدادات النظام</h2>
            
            <!-- إعدادات عامة -->
            <div class="settings-section-card">
                <div class="section-header" onclick="toggleAdminSection('generalSettings')">
                    <span>🏢 إعدادات عامة</span>
                    <span class="toggle-icon" id="generalSettingsIcon">▼</span>
                </div>
                <div class="section-content" id="generalSettings">
                    <div class="form-group">
                        <label>اسم المنصة</label>
                        <input type="text" id="platformName" class="form-control" value="SAWYAN BANK" placeholder="اسم المنصة">
                    </div>
                    <div class="form-group">
                        <label>البريد الرسمي</label>
                        <input type="email" id="platformEmail" class="form-control" value="support@sawyan.com" placeholder="البريد الرسمي">
                    </div>
                    <div class="form-group">
                        <label>رقم الهاتف</label>
                        <input type="tel" id="platformPhone" class="form-control" value="+20 123 456 7890" placeholder="رقم الهاتف">
                    </div>
                </div>
            </div>

            <!-- إعدادات العمولات -->
            <div class="settings-section-card">
                <div class="section-header" onclick="toggleAdminSection('commissionSettings')">
                    <span>💰 إعدادات العمولات</span>
                    <span class="toggle-icon" id="commissionSettingsIcon">▼</span>
                </div>
                <div class="section-content" id="commissionSettings">
                    <div class="form-group">
                        <label>نسبة حصة الشركة من العمولة</label>
                        <input type="number" id="companyShare" class="form-control" value="25" min="0" max="100" step="1">
                        <small class="form-text">النسبة التي تحصل عليها الشركة من كل عمولة</small>
                    </div>
                    <div class="form-group">
                        <label>الحد الأدنى للسحب (ج.م)</label>
                        <input type="number" id="minWithdraw" class="form-control" value="100" min="0">
                    </div>
                    <div class="form-group">
                        <label>الحد الأقصى للسحب اليومي (ج.م)</label>
                        <input type="number" id="maxDailyWithdraw" class="form-control" value="10000" min="0">
                    </div>
                </div>
            </div>

            <!-- إعدادات التسجيل -->
            <div class="settings-section-card">
                <div class="section-header" onclick="toggleAdminSection('registrationSettings')">
                    <span>📝 إعدادات التسجيل</span>
                    <span class="toggle-icon" id="registrationSettingsIcon">▼</span>
                </div>
                <div class="section-content collapsed" id="registrationSettings">
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="allowMemberRegistration" checked>
                            السماح بتسجيل أعضاء جدد
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="allowMerchantRegistration" checked>
                            السماح بتسجيل تجار جدد
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="requireEmailVerification">
                            تفعيل التحقق من البريد الإلكتروني
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="requirePhoneVerification">
                            تفعيل التحقق من رقم الهاتف
                        </label>
                    </div>
                </div>
            </div>

            <!-- إعدادات الإشعارات -->
            <div class="settings-section-card">
                <div class="section-header" onclick="toggleAdminSection('notificationSettings')">
                    <span>🔔 إعدادات الإشعارات</span>
                    <span class="toggle-icon" id="notificationSettingsIcon">▼</span>
                </div>
                <div class="section-content collapsed" id="notificationSettings">
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="enableEmailNotifications" checked>
                            تفعيل إشعارات البريد
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="enableSmsNotifications">
                            تفعيل إشعارات SMS
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="enablePushNotifications">
                            تفعيل إشعارات Push
                        </label>
                    </div>
                </div>
            </div>

            <div class="settings-actions-fixed">
                <button onclick="saveSystemSettings()" class="btn btn-primary btn-block btn-save-profile">
                    💾 حفظ الإعدادات
                </button>
            </div>
        </div>
    `;
}

function toggleAdminSection(sectionId) {
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

async function saveSystemSettings() {
    alert('✅ تم حفظ إعدادات النظام بنجاح!\n\n(هذه ميزة تجريبية - سيتم ربطها بقاعدة البيانات لاحقاً)');
}

// ===== إدارة طلبات السحب =====
async function loadWithdrawals() {
    const page = document.getElementById('withdrawalsContent');
    if (!page) return;

    try {
        // جلب طلبات السحب المعلقة
        const { data: withdrawals } = await window.SAWYAN.supabase
            .from('wallet_transactions')
            .select(`
                *,
                wallets!inner(member_id, members!inner(full_name, member_code, phone))
            `)
            .eq('transaction_type', 'withdrawal')
            .order('created_at', { ascending: false });

        page.innerHTML = `
            <div class="withdrawals-admin-page">
                
                <!-- الفلاتر -->
                <div class="filter-bar">
                    <button class="filter-btn active" onclick="filterWithdrawals('all')">الكل</button>
                    <button class="filter-btn" onclick="filterWithdrawals('pending')">معلقة</button>
                    <button class="filter-btn" onclick="filterWithdrawals('approved')">مقبولة</button>
                    <button class="filter-btn" onclick="filterWithdrawals('rejected')">مرفوضة</button>
                </div>

                <div class="withdrawals-list" id="withdrawalsList">
                    ${withdrawals && withdrawals.length > 0 ? withdrawals.map(w => {
            let metadata = {};
            try { metadata = JSON.parse(w.metadata || '{}'); } catch (e) { }
            const member = w.wallets?.members || {};

            return `
                            <div class="withdrawal-card status-${w.status || 'pending'}">
                                <div class="withdrawal-header">
                                    <span class="withdrawal-amount">${parseFloat(w.amount).toFixed(2)} ج.م</span>
                                    <span class="withdrawal-status status-${w.status || 'pending'}">${getWithdrawalStatus(w.status)}</span>
                                </div>
                                <div class="withdrawal-details">
                                    <p><strong>العضو:</strong> ${member.full_name || '-'} (${member.member_code || '-'})</p>
                                    <p><strong>الهاتف:</strong> ${member.phone || '-'}</p>
                                    <p><strong>طريقة السحب:</strong> ${getMethodLabel(metadata.method)}</p>
                                    <p><strong>الحساب:</strong> ${metadata.account || '-'}</p>
                                    <p><strong>التاريخ:</strong> ${new Date(w.created_at).toLocaleDateString('ar-EG')}</p>
                                    ${metadata.notes ? `<p><strong>ملاحظات:</strong> ${metadata.notes}</p>` : ''}
                                </div>
                                ${w.status === 'pending' ? `
                                    <div class="withdrawal-actions">
                                        <button class="btn btn-approve" onclick="approveWithdrawal('${w.id}')">✅ قبول</button>
                                        <button class="btn btn-reject" onclick="rejectWithdrawal('${w.id}')">❌ رفض</button>
                                    </div>
                                ` : ''}
                            </div>
                        `;
        }).join('') : '<p class="empty-state">لا توجد طلبات سحب</p>'}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        page.innerHTML = '<p class="empty-state">خطأ في تحميل طلبات السحب</p>';
    }
}

function getWithdrawalStatus(status) {
    const statuses = {
        'pending': 'قيد المراجعة',
        'approved': 'تم القبول',
        'completed': 'مكتملة',
        'rejected': 'مرفوضة'
    };
    return statuses[status] || status;
}

function getMethodLabel(method) {
    const labels = {
        'vodafone_cash': 'فودافون كاش',
        'instapay': 'انستاباي',
        'bank_transfer': 'تحويل بنكي',
        'mobile_wallet': 'محفظة إلكترونية'
    };
    return labels[method] || method || '-';
}

async function approveWithdrawal(transactionId) {
    if (!confirm('هل تريد قبول طلب السحب هذا؟')) return;

    try {
        // محاولة استخدام RPC function الآمنة
        const { data: rpcResult, error: rpcError } = await window.SAWYAN.supabase
            .rpc('approve_withdrawal', {
                p_transaction_id: transactionId
            });

        if (!rpcError && rpcResult && rpcResult.success) {
            alert('✅ تم قبول طلب السحب');
            loadWithdrawals();
            return;
        }

        // Fallback إذا لم تكن RPC موجودة
        console.log('RPC not available, using fallback');

        // جلب بيانات العملية
        const { data: transaction } = await window.SAWYAN.supabase
            .from('wallet_transactions')
            .select('wallet_id, amount, status')
            .eq('id', transactionId)
            .single();

        if (!transaction || transaction.status !== 'pending') {
            throw new Error('العملية غير متاحة للموافقة');
        }

        // تحديث حالة الطلب
        await window.SAWYAN.supabase
            .from('wallet_transactions')
            .update({ status: 'approved' })
            .eq('id', transactionId);

        // تحديث المحفظة
        const { data: wallet } = await window.SAWYAN.supabase
            .from('wallets')
            .select('pending_balance, total_withdrawn')
            .eq('id', transaction.wallet_id)
            .single();

        if (wallet) {
            await window.SAWYAN.supabase
                .from('wallets')
                .update({
                    pending_balance: wallet.pending_balance - parseFloat(transaction.amount),
                    total_withdrawn: (wallet.total_withdrawn || 0) + parseFloat(transaction.amount),
                    updated_at: new Date().toISOString()
                })
                .eq('id', transaction.wallet_id);
        }

        alert('✅ تم قبول طلب السحب');
        loadWithdrawals();
    } catch (error) {
        console.error('Approve error:', error);
        alert('❌ حدث خطأ: ' + error.message);
    }
}

async function rejectWithdrawal(transactionId) {
    const reason = prompt('سبب الرفض (اختياري):');

    // إذا ضغط المستخدم Cancel
    if (reason === null) return;

    try {
        // محاولة استخدام RPC function الآمنة
        const { data: rpcResult, error: rpcError } = await window.SAWYAN.supabase
            .rpc('reject_withdrawal', {
                p_transaction_id: transactionId,
                p_reason: reason || null
            });

        if (!rpcError && rpcResult && rpcResult.success) {
            alert('تم رفض طلب السحب وإرجاع المبلغ للمحفظة');
            loadWithdrawals();
            return;
        }

        // Fallback إذا لم تكن RPC موجودة
        console.log('RPC not available, using fallback');

        // جلب بيانات العملية
        const { data: transaction } = await window.SAWYAN.supabase
            .from('wallet_transactions')
            .select('wallet_id, amount, description, status')
            .eq('id', transactionId)
            .single();

        if (!transaction || transaction.status !== 'pending') {
            throw new Error('العملية غير متاحة للرفض');
        }

        // تحديث حالة الطلب
        await window.SAWYAN.supabase
            .from('wallet_transactions')
            .update({
                status: 'rejected',
                description: (transaction.description || '') + (reason ? ` - سبب الرفض: ${reason}` : '')
            })
            .eq('id', transactionId);

        // إرجاع المبلغ للمحفظة
        const { data: wallet } = await window.SAWYAN.supabase
            .from('wallets')
            .select('balance, pending_balance')
            .eq('id', transaction.wallet_id)
            .single();

        if (wallet) {
            await window.SAWYAN.supabase
                .from('wallets')
                .update({
                    balance: wallet.balance + parseFloat(transaction.amount),
                    pending_balance: wallet.pending_balance - parseFloat(transaction.amount),
                    updated_at: new Date().toISOString()
                })
                .eq('id', transaction.wallet_id);
        }

        alert('تم رفض طلب السحب وإرجاع المبلغ للمحفظة');
        loadWithdrawals();
    } catch (error) {
        console.error('Reject error:', error);
        alert('❌ حدث خطأ: ' + error.message);
    }
}

function filterWithdrawals(status) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    document.querySelectorAll('.withdrawal-card').forEach(card => {
        if (status === 'all' || card.classList.contains('status-' + status)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// ===== صفحة الدعم الفني =====
async function loadSupport() {
    const page = document.getElementById('supportPage');
    if (!page) return;

    page.innerHTML = `
        <div class="support-admin-page">
            <h2 class="page-title-mobile">🛠️ الدعم الفني</h2>
            
            <div class="support-stats-grid">
                <div class="support-stat-card">
                    <span class="stat-value" id="openTickets">0</span>
                    <span class="stat-label">تذاكر مفتوحة</span>
                </div>
                <div class="support-stat-card">
                    <span class="stat-value" id="pendingTickets">0</span>
                    <span class="stat-label">بانتظار الرد</span>
                </div>
                <div class="support-stat-card">
                    <span class="stat-value" id="closedTickets">0</span>
                    <span class="stat-label">مغلقة</span>
                </div>
            </div>

            <div class="tickets-section">
                <h3>📋 التذاكر الأخيرة</h3>
                <div id="ticketsList">
                    <p class="empty-state">لا توجد تذاكر دعم حالياً</p>
                </div>
            </div>
        </div>
    `;
}

