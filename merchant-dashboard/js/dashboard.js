// لوحة التاجر - مكتملة بكل الميزات
let currentMerchant = null;
let merchantData = null;

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.icon();
    }

    await checkAuth();
    await loadStats();

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

            showPage(page);
        });
    });

    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransaction);
    }

    const memberCodeInput = document.getElementById('memberCodeInput');
    if (memberCodeInput) {
        memberCodeInput.addEventListener('input', function () {
            if (this.value.length > 0) {
                document.getElementById('transactionForm').style.display = 'block';
            }
        });
    }
});

async function checkAuth() {
    // التحقق من localStorage
    const savedMerchant = localStorage.getItem('sawyan_merchant');
    if (!savedMerchant) {
        window.location.href = 'login.html';
        return;
    }

    try {
        merchantData = JSON.parse(savedMerchant);
        currentMerchant = { id: merchantData.id };

        // تحديث واجهة المستخدم
        document.getElementById('businessName').textContent = merchantData.business_name || 'تاجر';
        document.getElementById('merchantCode').textContent = 'كود التاجر: ' + merchantData.merchant_code;
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('sawyan_merchant');
        window.location.href = 'login.html';
    }
}

async function loadStats() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // عمليات اليوم
        const { data: todayTrans, count: todayCount } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*', { count: 'exact' })
            .eq('merchant_id', currentMerchant.id)
            .gte('transaction_date', today);

        document.getElementById('todayTransactions').textContent = todayCount || 0;

        const todayTotal = todayTrans?.reduce((sum, t) => sum + parseFloat(t.total_amount), 0) || 0;
        document.getElementById('todaySales').textContent = todayTotal.toFixed(2) + ' ج.م';

        // إجمالي العمليات
        const { count: totalCount } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('merchant_id', currentMerchant.id);

        // هنا نستخدم ID الجديد للبطاقة
        if (document.getElementById('totalTransactionsCount')) {
            document.getElementById('totalTransactionsCount').textContent = totalCount || 0;
        }

        // المستحق للشركة (إجمالي العمولات المستقطعة)
        const { data: allTrans } = await window.SAWYAN.supabase
            .from('transactions')
            .select('commission_amount')
            .eq('merchant_id', currentMerchant.id);

        const totalCommissionDue = allTrans?.reduce((sum, t) => sum + parseFloat(t.commission_amount || 0), 0) || 0;

        // عرض الرقم في مكانه الجديد
        if (document.getElementById('totalCommissionsDue')) {
            document.getElementById('totalCommissionsDue').textContent = totalCommissionDue.toFixed(2) + ' ج.م';
        }

        // تحديث القديم من باب الاحتياط (pendingPayment)
        if (document.getElementById('pendingPayment')) {
            document.getElementById('pendingPayment').textContent = (totalCommissionDue * 0.25).toFixed(2) + ' ج.م'; // حصة الشركة فقط
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

async function handleTransaction(e) {
    e.preventDefault();

    const memberCode = document.getElementById('memberCodeInput').value;
    const amount = parseFloat(document.getElementById('amount').value);

    if (!memberCode || !amount) {
        alert('الرجاء إدخال كود العضو والمبلغ');
        return;
    }

    try {
        // البحث عن العضو
        const { data: member, error: memberError } = await window.SAWYAN.supabase
            .from('members')
            .select('id')
            .eq('member_code', memberCode)
            .single();

        if (memberError || !member) {
            alert('كود العضو غير صحيح');
            return;
        }

        // حساب العمولات
        const commissionPercentage = merchantData.commission_percentage;
        const commissionAmount = amount * (commissionPercentage / 100);
        const companyShare = commissionAmount * 0.25;
        const planShare = commissionAmount * 0.75;

        const transactionCode = 'T' + Date.now();

        // تسجيل العملية
        const { error: transError } = await window.SAWYAN.supabase
            .from('transactions')
            .insert([{
                transaction_code: transactionCode,
                member_id: member.id,
                merchant_id: currentMerchant.id,
                total_amount: amount,
                commission_percentage: commissionPercentage,
                commission_amount: commissionAmount,
                company_share: companyShare,
                plan_share: planShare,
                status: 'completed'
            }]);

        if (transError) throw transError;

        // تحديث محفظة العضو
        const { data: wallet } = await window.SAWYAN.supabase
            .from('wallets')
            .select('balance')
            .eq('member_id', member.id)
            .single();

        if (wallet) {
            await window.SAWYAN.supabase
                .from('wallets')
                .update({ balance: wallet.balance + planShare })
                .eq('member_id', member.id);

            // تسجيل في wallet_transactions
            await window.SAWYAN.supabase
                .from('wallet_transactions')
                .insert([{
                    wallet_id: wallet.id,
                    transaction_type: 'credit',
                    amount: planShare,
                    description: 'عمولة من ' + merchantData.business_name
                }]);
        }

        // إرسال إشعار للعضو
        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'member',
                    user_id: member.id,
                    title: '💰 تم إضافة عمولة جديدة!',
                    message: 'تم تسجيل عملية شراء بمبلغ ' + amount.toFixed(2) + ' ج.م لدى ' + merchantData.business_name + ' وإضافة ' + planShare.toFixed(2) + ' ج.م لمحفظتك',
                    notification_type: 'commission'
                }]);
            console.log('Notification sent to member');
        } catch (notifError) {
            console.log('Notifications table may not exist:', notifError);
        }

        alert('✅ تم تسجيل العملية بنجاح!\\n\\nكود العملية: ' + transactionCode + '\\nالعمولة للعضو: ' + planShare.toFixed(2) + ' ج.م');
        document.getElementById('transactionForm').reset();
        document.getElementById('memberCodeInput').value = '';
        document.getElementById('transactionForm').style.display = 'none';
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

function handleNavigation(e) {
    e.preventDefault();
    const page = this.dataset.page;
    showPage(page);
}

function showPage(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
    }

    // تحميل محتوى الصفحة
    if (page === 'pending') loadPendingTransactions();
    if (page === 'transactions') loadAllTransactions();
    if (page === 'financial') loadFinancialReport();
    if (page === 'settings') loadSettings();
}

// ===== العمليات المعلقة (طلبات من الأعضاء) =====
async function loadPendingTransactions() {
    const page = document.getElementById('pendingPage');
    page.innerHTML = `
        <h2>طلبات التوثيق المعلقة</h2>
        <p class="page-description">طلبات توثيق عمليات من الأعضاء تحتاج موافقتك</p>
        <div id="pendingList"><p>جاري التحميل...</p></div>
    `;

    try {
        console.log('Loading pending transactions for merchant:', currentMerchant.id);

        const { data: transactions, error } = await window.SAWYAN.supabase
            .from('transactions')
            .select(`*, members(member_code, full_name)`)
            .eq('merchant_id', currentMerchant.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        console.log('Pending transactions result:', transactions, 'Error:', error);

        const list = document.getElementById('pendingList');

        if (error) {
            list.innerHTML = `<p class="empty-state">خطأ في جلب البيانات: ${error.message}</p>`;
            return;
        }

        if (!transactions || transactions.length === 0) {
            list.innerHTML = '<p class="empty-state">لا توجد طلبات معلقة 🎉</p>';
            return;
        }

        list.innerHTML = transactions.map(t => `
        <div class="pending-transaction-card">
            <div class="transaction-header">
                <strong>كود العملية:</strong> ${t.transaction_code}
            </div>
            <div class="transaction-details">
                <p><strong>العضو:</strong> ${t.members?.full_name || '-'} (${t.members?.member_code})</p>
                <p><strong>المبلغ:</strong> ${parseFloat(t.total_amount).toFixed(2)} ج.م</p>
                <p><strong>نسبة العمولة:</strong> ${t.commission_percentage}%</p>
                <p><strong>مبلغ العمولة:</strong> ${parseFloat(t.commission_amount).toFixed(2)} ج.م</p>
                <p><strong>التوقيت:</strong> ${new Date(t.created_at).toLocaleString('ar-EG')}</p>
                ${t.notes ? `<p><strong>ملاحظات:</strong> ${t.notes}</p>` : ''}
                ${t.invoice_image_url ? `<p><a href="${t.invoice_image_url}" target="_blank">📄 عرض الفاتورة</a></p>` : ''}
            </div>
            <div class="pending-actions">
                <button class="btn btn-approve" onclick="approveTransaction('${t.id}')">✅ موافقة</button>
                <button class="btn btn-reject" onclick="rejectTransaction('${t.id}')">❌ رفض</button>
            </div>
        </div>
    `).join('');
    } catch (error) {
        console.error('Error loading pending transactions:', error);
        document.getElementById('pendingList').innerHTML = `<p class="empty-state">خطأ: ${error.message}</p>`;
    }
}
async function approveTransaction(transactionId) {
    if (!confirm('هل تريد الموافقة على هذه العملية؟')) return;

    try {
        // تحديث حالة العملية
        const { data: transaction, error } = await window.SAWYAN.supabase
            .from('transactions')
            .update({
                status: 'completed'
            })
            .eq('id', transactionId)
            .select(`*, members(id, full_name)`)
            .single();

        if (error) throw error;

        // تحديث محفظة العضو بطريقة آمنة
        const planShareAmount = parseFloat(transaction.plan_share);

        // محاولة استخدام RPC function الآمنة
        const { data: rpcResult, error: rpcError } = await window.SAWYAN.supabase
            .rpc('add_wallet_balance', {
                p_member_id: transaction.member_id,
                p_amount: planShareAmount,
                p_description: 'عمولة من ' + merchantData.business_name,
                p_transaction_type: 'commission',
                p_reference_id: transactionId
            });

        if (!rpcError && rpcResult && rpcResult.success) {
            console.log('Wallet updated via RPC:', rpcResult);
        } else {
            // Fallback إذا لم تكن RPC موجودة
            console.log('RPC not available, using fallback');

            const { data: wallet } = await window.SAWYAN.supabase
                .from('wallets')
                .select('id, balance, total_earned')
                .eq('member_id', transaction.member_id)
                .single();

            if (wallet) {
                await window.SAWYAN.supabase
                    .from('wallets')
                    .update({
                        balance: wallet.balance + planShareAmount,
                        total_earned: (wallet.total_earned || 0) + planShareAmount,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', wallet.id);

                // تسجيل في wallet_transactions
                await window.SAWYAN.supabase
                    .from('wallet_transactions')
                    .insert([{
                        wallet_id: wallet.id,
                        transaction_type: 'commission',
                        amount: planShareAmount,
                        description: 'عمولة من ' + merchantData.business_name,
                        reference_id: transactionId,
                        status: 'completed'
                    }]);
            }
        }

        // إرسال إشعار للعضو
        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'member',
                    user_id: transaction.member_id,
                    title: 'تم توثيق عمليتك ✅',
                    message: 'تمت الموافقة على عمليتك مع ' + merchantData.business_name + ' بقيمة ' + parseFloat(transaction.total_amount).toFixed(2) + ' ج.م وإضافة العمولة لمحفظتك',
                    notification_type: 'transaction_approved'
                }]);
            console.log('Notification sent to member');
        } catch (notifError) {
            console.log('Notifications table may not exist:', notifError);
        }

        alert('✅ تمت الموافقة على العملية بنجاح!');
        loadPendingTransactions();

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

async function rejectTransaction(transactionId) {
    const reason = prompt('سبب الرفض (اختياري):');

    try {
        // جلب بيانات العملية أولاً
        const { data: transaction } = await window.SAWYAN.supabase
            .from('transactions')
            .select('member_id, total_amount')
            .eq('id', transactionId)
            .single();

        const { error } = await window.SAWYAN.supabase
            .from('transactions')
            .update({
                status: 'rejected'
            })
            .eq('id', transactionId);

        if (error) throw error;

        // إرسال إشعار للعضو
        if (transaction) {
            try {
                var rejectMessage = 'تم رفض عمليتك مع ' + merchantData.business_name + ' بقيمة ' + parseFloat(transaction.total_amount).toFixed(2) + ' ج.م';
                if (reason) {
                    rejectMessage += '. السبب: ' + reason;
                }

                await window.SAWYAN.supabase
                    .from('notifications')
                    .insert([{
                        user_type: 'member',
                        user_id: transaction.member_id,
                        title: 'تم رفض عمليتك ❌',
                        message: rejectMessage,
                        notification_type: 'transaction_rejected'
                    }]);
                console.log('Rejection notification sent to member');
            } catch (notifError) {
                console.log('Notifications table may not exist:', notifError);
            }
        }

        alert('تم رفض العملية');
        loadPendingTransactions();

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

async function loadAllTransactions() {
    const page = document.getElementById('transactionsPage');
    page.innerHTML = '<h2>العمليات المكتملة</h2><p class="page-description">العمليات التي تمت الموافقة عليها</p><div id="allTransactionsList"></div>';

    const { data: transactions } = await window.SAWYAN.supabase
        .from('transactions')
        .select('*, members(member_code, full_name)')
        .eq('merchant_id', currentMerchant.id)
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
        html += '<div><strong>العضو:</strong> ' + (t.members ? t.members.full_name : '-') + ' (' + (t.members ? t.members.member_code : '-') + ')</div>';
        html += '<div><strong>المبلغ:</strong> ' + parseFloat(t.total_amount).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>العمولة:</strong> ' + parseFloat(t.commission_amount).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>حصة الشركة:</strong> ' + parseFloat(t.company_share).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>التاريخ:</strong> ' + new Date(t.transaction_date).toLocaleDateString('ar-EG') + '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
}

async function loadFinancialReport() {
    const page = document.getElementById('financialPage');
    page.innerHTML = '<h2>الموقف المالي</h2><div id="financialReport"></div>';

    const { data: transactions } = await window.SAWYAN.supabase
        .from('transactions')
        .select('total_amount, commission_amount, company_share')
        .eq('merchant_id', currentMerchant.id);

    const totalSales = transactions?.reduce((sum, t) => sum + parseFloat(t.total_amount), 0) || 0;
    const totalCommissions = transactions?.reduce((sum, t) => sum + parseFloat(t.commission_amount), 0) || 0;
    const totalDue = transactions?.reduce((sum, t) => sum + parseFloat(t.company_share), 0) || 0;

    document.getElementById('financialReport').innerHTML = `
        <div class="financial-stats">
            <div class="stat-box">
                <h3>إجمالي المبيعات</h3>
                <p class="stat-value">${totalSales.toFixed(2)} ج.م</p>
            </div>
            <div class="stat-box">
                <h3>إجمالي العمولات</h3>
                <p class="stat-value">${totalCommissions.toFixed(2)} ج.م</p>
            </div>
            <div class="stat-box">
                <h3>المستحق للشركة</h3>
                <p class="stat-value">${totalDue.toFixed(2)} ج.م</p>
            </div>
        </div>
    `;
}

async function loadProducts() {
    const page = document.getElementById('productsPage');
    page.innerHTML = `
        <h2>المنتجات</h2>
        <p class="empty-state">إدارة المنتجات قريباً...</p>
    `;
}

async function loadReviews() {
    const page = document.getElementById('reviewsPage');
    page.innerHTML = `
        <h2>التقييمات</h2>
        <p class="empty-state">التقييمات قريباً...</p>
    `;
}

async function loadSettings() {
    const page = document.getElementById('settingsPage');

    // تحميل أحدث بيانات التاجر
    try {
        const { data: freshData } = await window.SAWYAN.supabase
            .from('merchants')
            .select('*')
            .eq('id', currentMerchant.id)
            .single();

        if (freshData) merchantData = freshData;
    } catch (e) {
        console.log('Using cached data');
    }

    const m = merchantData || {};

    page.innerHTML = `
        <div class="profile-page">
            <h2 class="page-title-mobile">الملف الشخصي</h2>
            
            <!-- البروفايل الحالي -->
            <div class="profile-header-card">
                <div class="profile-avatar-container">
                    <div class="profile-avatar" id="profileAvatarPreview">
                        ${m.logo_url ? `<img src="${m.logo_url}" alt="Logo">` : `<span class="avatar-placeholder">🏪</span>`}
                    </div>
                    <button class="btn-change-avatar" onclick="document.getElementById('logoInput').click()">
                        📷 تغيير الصورة
                    </button>
                    <input type="file" id="logoInput" accept="image/*" style="display:none" onchange="previewLogo(this)">
                </div>
                <div class="profile-info-brief">
                    <h3>${m.business_name || 'اسم النشاط'}</h3>
                    <p class="member-code-badge">كود التاجر: ${m.merchant_code || '-'}</p>
                </div>
            </div>

            <!-- أقسام الإعدادات -->
            <div class="settings-sections">
                
                <!-- المعلومات الأساسية -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('basicInfo')">
                        <span>📋 المعلومات الأساسية</span>
                        <span class="toggle-icon" id="basicInfoIcon">▼</span>
                    </div>
                    <div class="section-content" id="basicInfo">
                        <div class="form-group">
                            <label>اسم النشاط التجاري</label>
                            <input type="text" id="settingsBusinessName" class="form-control" value="${m.business_name || ''}" placeholder="مثال: سوبر ماركت الأمل">
                        </div>
                        <div class="form-group">
                            <label>اسم المالك</label>
                            <input type="text" id="settingsOwnerName" class="form-control" value="${m.owner_name || ''}" placeholder="الاسم الكامل">
                        </div>
                        <div class="form-group">
                            <label>وصف النشاط</label>
                            <textarea id="settingsDescription" class="form-control" rows="3" placeholder="وصف مختصر عن نشاطك...">${m.business_description || ''}</textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>نوع التاجر</label>
                                <select id="settingsMerchantType" class="form-control">
                                    <option value="physical" ${m.merchant_type === 'physical' ? 'selected' : ''}>محل فيزيائي</option>
                                    <option value="online" ${m.merchant_type === 'online' ? 'selected' : ''}>متجر إلكتروني</option>
                                    <option value="both" ${m.merchant_type === 'both' ? 'selected' : ''}>كلاهما</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>فئة النشاط</label>
                                <select id="settingsCategory" class="form-control">
                                    <option value="أخرى" ${m.business_category === 'أخرى' ? 'selected' : ''}>📦 أخرى</option>
                                    <option value="سوبر ماركت" ${m.business_category === 'سوبر ماركت' ? 'selected' : ''}>🛒 سوبر ماركت</option>
                                    <option value="ملابس" ${m.business_category === 'ملابس' ? 'selected' : ''}>👕 ملابس</option>
                                    <option value="صيدلية" ${m.business_category === 'صيدلية' ? 'selected' : ''}>💊 صيدلية</option>
                                    <option value="مطعم" ${m.business_category === 'مطعم' ? 'selected' : ''}>🍽️ مطعم</option>
                                    <option value="كافيه" ${m.business_category === 'كافيه' ? 'selected' : ''}>☕ كافيه</option>
                                    <option value="كهربائيات" ${m.business_category === 'كهربائيات' ? 'selected' : ''}>📱 كهربائيات</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>نسبة العمولة (%)</label>
                            <input type="number" id="settingsCommission" class="form-control" step="0.01" min="0" max="100" value="${m.commission_percentage || 10}">
                            <small class="form-text">النسبة التي تمنحها للأعضاء من كل عملية</small>
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
                            <input type="email" id="settingsEmail" class="form-control" value="${m.email || ''}" placeholder="merchant@example.com">
                        </div>
                        <div class="form-group">
                            <label>📱 رقم الهاتف</label>
                            <input type="tel" id="settingsPhone" class="form-control" value="${m.phone || ''}" placeholder="+20 123 456 7890">
                        </div>
                        <div class="form-group">
                            <label>💬 واتساب</label>
                            <input type="tel" id="settingsWhatsapp" class="form-control" value="${m.whatsapp || m.phone || ''}" placeholder="+20 123 456 7890">
                        </div>
                        <div class="form-group">
                            <label>🌐 الموقع الإلكتروني</label>
                            <input type="url" id="settingsWebsite" class="form-control" value="${m.website_url || ''}" placeholder="https://example.com">
                        </div>
                    </div>
                </div>

                <!-- روابط التواصل الاجتماعي -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('socialMedia')">
                        <span>🔗 روابط التواصل الاجتماعي</span>
                        <span class="toggle-icon" id="socialMediaIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="socialMedia">
                        <div class="form-group">
                            <label>📘 فيسبوك</label>
                            <input type="url" id="settingsFacebook" class="form-control" value="${m.facebook_url || ''}" placeholder="https://facebook.com/page">
                        </div>
                        <div class="form-group">
                            <label>📸 انستغرام</label>
                            <input type="url" id="settingsInstagram" class="form-control" value="${m.instagram_url || ''}" placeholder="https://instagram.com/profile">
                        </div>
                        <div class="form-group">
                            <label>🐦 تويتر / X</label>
                            <input type="url" id="settingsTwitter" class="form-control" value="${m.twitter_url || ''}" placeholder="https://x.com/profile">
                        </div>
                        <div class="form-group">
                            <label>🎥 تيك توك</label>
                            <input type="url" id="settingsTiktok" class="form-control" value="${m.tiktok_url || ''}" placeholder="https://tiktok.com/@profile">
                        </div>
                    </div>
                </div>

                <!-- الموقع الجغرافي -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('locationInfo')">
                        <span>📍 الموقع والعنوان</span>
                        <span class="toggle-icon" id="locationInfoIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="locationInfo">
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
                        <div class="form-group">
                            <label>🗺️ رابط خرائط جوجل</label>
                            <input type="url" id="settingsGoogleMaps" class="form-control" value="${m.google_maps_url || ''}" placeholder="https://maps.google.com/...">
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

// معاينة اللوجو
let pendingLogoFile = null;

async function previewLogo(input) {
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
        pendingLogoFile = file;

        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('profileAvatarPreview').innerHTML =
                `<img src="${e.target.result}" alt="Logo Preview">`;
        };
        reader.readAsDataURL(file);
    }
}

// رفع لوجو التاجر إلى Supabase Storage
async function uploadLogo() {
    if (!pendingLogoFile) return null;

    try {
        // استخدام مكون رفع الصور إذا كان متاحاً
        if (window.SAWYAN && window.SAWYAN.ImageUpload) {
            const result = await window.SAWYAN.ImageUpload.uploadImage(
                pendingLogoFile,
                'logos',
                `merchants/${currentMerchant.id}`
            );

            if (result.success) {
                pendingLogoFile = null;
                return result.url;
            } else {
                console.error('Upload error:', result.error);
                return null;
            }
        }
        return null;
    } catch (err) {
        console.error('Logo upload error:', err);
        return null;
    }
}

async function saveSettings() {
    // جمع البيانات
    const businessName = document.getElementById('settingsBusinessName')?.value;
    const ownerName = document.getElementById('settingsOwnerName')?.value;
    const description = document.getElementById('settingsDescription')?.value;
    const merchantType = document.getElementById('settingsMerchantType')?.value;
    const category = document.getElementById('settingsCategory')?.value;
    const commission = parseFloat(document.getElementById('settingsCommission')?.value) || 10;

    const email = document.getElementById('settingsEmail')?.value;
    const phone = document.getElementById('settingsPhone')?.value;
    const whatsapp = document.getElementById('settingsWhatsapp')?.value;
    const website = document.getElementById('settingsWebsite')?.value;

    const facebook = document.getElementById('settingsFacebook')?.value;
    const instagram = document.getElementById('settingsInstagram')?.value;
    const twitter = document.getElementById('settingsTwitter')?.value;
    const tiktok = document.getElementById('settingsTiktok')?.value;

    const country = document.getElementById('settingsCountry')?.value;
    const city = document.getElementById('settingsCity')?.value;
    const address = document.getElementById('settingsAddress')?.value;
    const googleMaps = document.getElementById('settingsGoogleMaps')?.value;

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
        // رفع اللوجو إذا تم اختيار صورة جديدة
        let logoUrl = merchantData.logo_url;
        if (pendingLogoFile) {
            saveBtn.innerHTML = '⏳ جاري رفع اللوجو...';
            const uploadedUrl = await uploadLogo();
            if (uploadedUrl) {
                logoUrl = uploadedUrl;
            }
        }

        // تحديث البيانات
        const updateData = {
            business_name: businessName,
            owner_name: ownerName,
            business_description: description,
            merchant_type: merchantType,
            business_category: category,
            commission_percentage: commission,
            email: email,
            phone: phone,
            whatsapp: whatsapp,
            website_url: website,
            facebook_url: facebook,
            instagram_url: instagram,
            twitter_url: twitter,
            tiktok_url: tiktok,
            country: country,
            city: city,
            address: address,
            google_maps_url: googleMaps,
            logo_url: logoUrl,
            updated_at: new Date().toISOString()
        };

        saveBtn.innerHTML = '⏳ جاري الحفظ...';

        const { error } = await window.SAWYAN.supabase
            .from('merchants')
            .update(updateData)
            .eq('id', currentMerchant.id);

        if (error) throw error;

        // تحديث كلمة المرور إذا تم إدخالها
        if (newPassword && currentPassword) {
            // التحقق من كلمة المرور الحالية
            if (merchantData.password_hash !== currentPassword) {
                throw new Error('كلمة المرور الحالية غير صحيحة');
            }

            await window.SAWYAN.supabase
                .from('merchants')
                .update({ password_hash: newPassword })
                .eq('id', currentMerchant.id);
        }

        // تحديث البيانات المحلية
        merchantData = { ...merchantData, ...updateData };
        localStorage.setItem('sawyan_merchant', JSON.stringify(merchantData));

        // تحديث الواجهة
        const businessNameEl = document.getElementById('businessName');
        if (businessNameEl) businessNameEl.textContent = businessName || 'تاجر';

        alert('✅ تم حفظ التغييرات بنجاح!');

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ حدث خطأ: ' + error.message);
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function openScanner() {
    alert('ميزة مسح QR Code ستكون متاحة قريباً. استخدم الإدخال اليدوي حالياً.');
}

async function logout() {
    localStorage.removeItem('sawyan_merchant');
    localStorage.removeItem('sawyan_merchant_id');
    window.location.href = '../landing-page/index.html';
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
        'transactions': 'العمليات المكتملة',
        'financial': 'الموقف المالي',
        'settings': 'الإعدادات'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || 'لوحة التحكم';

    // تحميل المحتوى
    if (pageName === 'transactions') loadAllTransactions();
    if (pageName === 'financial') loadFinancialReport();
    if (pageName === 'settings') loadSettings();
}
