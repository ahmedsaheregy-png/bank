// ============================================
// SAWYAN BANK - Features Upgrade
// ============================================
// هذا الملف يضيف كل الميزات الجديدة للوحة التحكم:
// 1. زر تسجيل خروج يعمل بشكل صحيح
// 2. صفحة تفاصيل المعاملات + فلترة بالتاريخ
// 3. خاصية البحث في الأعضاء
// 4. تصدير CSV لجدول المعاملات
// 5. تقارير شهرية برسم بياني (Chart.js)
// 6. تحسين صفحة الإعدادات
// 7. توحيد العملة: ج.م
// 8. إصلاح الأخطاء الإملائية
// ============================================

(function () {
    'use strict';

    console.log('🚀 SAWYAN Features Upgrade loaded');

    // ============================================
    // 1. إصلاح زر تسجيل الخروج
    // ============================================
    window.logout = function () {
        if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
            localStorage.removeItem('sawyan_admin');
            localStorage.removeItem('sawyan_user_type');
            localStorage.removeItem('sawyan_login_at');
            // التوجيه الصحيح لصفحة الدخول
            window.location.href = 'login.html';
        }
    };

    // ============================================
    // 2. تصدير CSV (Universal)
    // ============================================
    window.exportToCSV = function (data, filename, columns) {
        if (!data || data.length === 0) {
            alert('لا توجد بيانات للتصدير');
            return;
        }

        // تحديد الأعمدة
        const cols = columns || Object.keys(data[0]);

        // إنشاء صف الـ headers
        const headers = cols.join(',');

        // إنشاء الصفوف
        const rows = data.map(row => {
            return cols.map(col => {
                let value = row[col];
                if (value === null || value === undefined) value = '';
                // تنسيق التواريخ
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                    value = new Date(value).toLocaleString('ar-EG');
                }
                // escape للفواصل وعلامات الاقتباس
                value = String(value).replace(/"/g, '""');
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = `"${value}"`;
                }
                return value;
            }).join(',');
        }).join('\n');

        // إنشاء الملف
        const csv = '\uFEFF' + headers + '\n' + rows;  // BOM لدعم العربية
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'export.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // ============================================
    // 3. تصدير المعاملات كـ CSV
    // ============================================
    window.exportTransactions = async function () {
        try {
            const { data: transactions, error } = await window.SAWYAN.supabase
                .from('transactions')
                .select(`
                    transaction_code,
                    total_amount,
                    commission_amount,
                    status,
                    transaction_date,
                    members(full_name, member_code),
                    merchants(business_name, merchant_code)
                `)
                .order('transaction_date', { ascending: false });

            if (error) throw error;

            const exportData = (transactions || []).map(t => ({
                'كود العملية': t.transaction_code || '',
                'العضو': t.members?.full_name || '-',
                'كود العضو': t.members?.member_code || '-',
                'التاجر': t.merchants?.business_name || '-',
                'كود التاجر': t.merchants?.merchant_code || '-',
                'المبلغ (ج.م)': parseFloat(t.total_amount || 0).toFixed(2),
                'العمولة (ج.م)': parseFloat(t.commission_amount || 0).toFixed(2),
                'الحالة': t.status || '',
                'التاريخ': new Date(t.transaction_date).toLocaleString('ar-EG')
            }));

            window.exportToCSV(exportData, `transactions_${Date.now()}.csv`, Object.keys(exportData[0] || { 'a': 1 }));
            showToast('success', '✅ تم التصدير', `${exportData.length} عملية تم تصديرها بنجاح`);
        } catch (err) {
            console.error(err);
            showToast('error', 'فشل التصدير', err.message);
        }
    };

    // ============================================
    // 4. تصدير الأعضاء كـ CSV
    // ============================================
    window.exportMembers = async function () {
        try {
            const { data: members } = await window.SAWYAN.supabase
                .from('members')
                .select('*')
                .order('created_at', { ascending: false });

            const exportData = (members || []).map(m => ({
                'كود العضوية': m.member_code || '',
                'الاسم': m.full_name || '',
                'البريد': m.email || '',
                'الهاتف': m.phone || '',
                'الحالة': m.is_active ? 'نشط' : 'معطل',
                'تاريخ التسجيل': new Date(m.created_at).toLocaleString('ar-EG')
            }));

            window.exportToCSV(exportData, `members_${Date.now()}.csv`, Object.keys(exportData[0] || { 'a': 1 }));
            showToast('success', '✅ تم التصدير', `${exportData.length} عضو تم تصديرهم`);
        } catch (err) {
            showToast('error', 'فشل التصدير', err.message);
        }
    };

    // ============================================
    // 5. تصدير التجار كـ CSV
    // ============================================
    window.exportMerchants = async function () {
        try {
            const { data: merchants } = await window.SAWYAN.supabase
                .from('merchants')
                .select('*')
                .order('created_at', { ascending: false });

            const exportData = (merchants || []).map(m => ({
                'كود التاجر': m.merchant_code || '',
                'اسم النشاط': m.business_name || '',
                'المالك': m.owner_name || '',
                'البريد': m.email || '',
                'الهاتف': m.phone || '',
                'الحالة': m.is_active ? 'نشط' : 'معطل',
                'تاريخ التسجيل': new Date(m.created_at).toLocaleString('ar-EG')
            }));

            window.exportToCSV(exportData, `merchants_${Date.now()}.csv`, Object.keys(exportData[0] || { 'a': 1 }));
            showToast('success', '✅ تم التصدير', `${exportData.length} تاجر تم تصديرهم`);
        } catch (err) {
            showToast('error', 'فشل التصدير', err.message);
        }
    };

    // ============================================
    // 6. خاصية البحث في الأعضاء
    // ============================================
    window.searchMembers = async function (query) {
        const tbody = document.getElementById('membersTableBody');
        if (!tbody) return;

        if (!query || query.trim() === '') {
            // لو البحث فارغ، حمّل الكل
            if (typeof loadMembers === 'function') loadMembers();
            return;
        }

        try {
            const { data: members } = await window.SAWYAN.supabase
                .from('members')
                .select('*')
                .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,member_code.ilike.%${query}%,phone.ilike.%${query}%`)
                .order('created_at', { ascending: false });

            if (!members || members.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="empty-state">لا نتائج مطابقة لـ "${query}"</td></tr>`;
                return;
            }

            tbody.innerHTML = members.map(m => `
                <tr>
                    <td data-label="كود العضو">${m.member_code}</td>
                    <td data-label="الاسم">${highlightSearch(m.full_name, query)}</td>
                    <td data-label="البريد">${highlightSearch(m.email || '-', query)}</td>
                    <td data-label="الهاتف">${m.phone || '-'}</td>
                    <td data-label="تاريخ التسجيل">${new Date(m.created_at).toLocaleDateString('ar-EG')}</td>
                    <td data-label="الحالة"><span class="badge ${m.is_active ? 'badge-success' : 'badge-danger'}">${m.is_active ? 'نشط' : 'معطل'}</span></td>
                    <td data-label="إجراءات">
                        <button class="btn-sm btn-primary" onclick="viewMember('${m.id}')">عرض</button>
                        <button class="btn-sm btn-warning" onclick="toggleMemberStatus('${m.id}', ${!m.is_active})">${m.is_active ? 'تعطيل' : 'تفعيل'}</button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Search error:', err);
        }
    };

    // إبراز كلمة البحث في النتائج
    function highlightSearch(text, query) {
        if (!text || !query) return text || '-';
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return String(text).replace(regex, '<mark style="background:#fff3cd;padding:0 2px;">$1</mark>');
    }

    // ============================================
    // 7. فلترة المعاملات بالتاريخ
    // ============================================
    let allTransactionsCache = [];

    window.loadTransactionsFiltered = async function (startDate, endDate, statusFilter) {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;

        try {
            let query = window.SAWYAN.supabase
                .from('transactions')
                .select(`
                    *,
                    members(full_name, member_code),
                    merchants(business_name, merchant_code)
                `)
                .order('transaction_date', { ascending: false });

            if (startDate) query = query.gte('transaction_date', startDate);
            if (endDate) query = query.lte('transaction_date', endDate + 'T23:59:59');
            if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);

            const { data: transactions, error } = await query;

            if (error) throw error;

            allTransactionsCache = transactions || [];

            if (allTransactionsCache.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-state">لا توجد عمليات مطابقة</td></tr>';
                return;
            }

            tbody.innerHTML = allTransactionsCache.map(t => `
                <tr>
                    <td data-label="كود العملية">${t.transaction_code || '-'}</td>
                    <td data-label="العضو">${t.members?.full_name || '-'} (${t.members?.member_code || '-'})</td>
                    <td data-label="التاجر">${t.merchants?.business_name || '-'}</td>
                    <td data-label="المبلغ">${parseFloat(t.total_amount || 0).toFixed(2)} ج.م</td>
                    <td data-label="العمولة">${parseFloat(t.commission_amount || 0).toFixed(2)} ج.م</td>
                    <td data-label="التاريخ">${new Date(t.transaction_date).toLocaleString('ar-EG')}</td>
                    <td data-label="الحالة"><span class="badge ${t.status === 'completed' ? 'badge-success' : 'badge-warning'}">${t.status === 'completed' ? 'مكتملة' : t.status || '-'}</span></td>
                </tr>
            `).join('');

            // تحديث عداد النتائج
            const counter = document.getElementById('transactionsCount');
            if (counter) counter.textContent = `${allTransactionsCache.length} عملية`;

        } catch (err) {
            console.error('Filter error:', err);
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">خطأ: ${err.message}</td></tr>`;
        }
    };

    // ============================================
    // 8. التقارير الشهرية برسم بياني
    // ============================================
    window.generateReport = async function () {
        const startDate = document.getElementById('reportStartDate')?.value;
        const endDate = document.getElementById('reportEndDate')?.value;
        const reportType = document.getElementById('reportType')?.value || 'all';
        const resultsDiv = document.getElementById('reportResults');

        if (!resultsDiv) return;

        if (!startDate || !endDate) {
            showToast('warn', 'بيانات ناقصة', 'يرجى اختيار فترة زمنية');
            return;
        }

        resultsDiv.innerHTML = '<div class="empty-state">⏳ جاري إنشاء التقرير...</div>';

        try {
            // جلب المعاملات في الفترة
            const { data: transactions } = await window.SAWYAN.supabase
                .from('transactions')
                .select(`
                    total_amount,
                    commission_amount,
                    status,
                    transaction_date,
                    members(full_name),
                    merchants(business_name)
                `)
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate + 'T23:59:59')
                .order('transaction_date', { ascending: true });

            if (!transactions || transactions.length === 0) {
                resultsDiv.innerHTML = '<p class="empty-state">لا توجد بيانات في هذه الفترة</p>';
                return;
            }

            // حساب الإحصائيات
            const totalAmount = transactions.reduce((s, t) => s + parseFloat(t.total_amount || 0), 0);
            const totalCommission = transactions.reduce((s, t) => s + parseFloat(t.commission_amount || 0), 0);
            const completedCount = transactions.filter(t => t.status === 'completed').length;

            // تجميع حسب الشهر
            const monthlyData = {};
            transactions.forEach(t => {
                const month = t.transaction_date?.substring(0, 7); // YYYY-MM
                if (!monthlyData[month]) monthlyData[month] = { count: 0, amount: 0, commission: 0 };
                monthlyData[month].count++;
                monthlyData[month].amount += parseFloat(t.total_amount || 0);
                monthlyData[month].commission += parseFloat(t.commission_amount || 0);
            });

            const months = Object.keys(monthlyData).sort();
            const counts = months.map(m => monthlyData[m].count);
            const amounts = months.map(m => monthlyData[m].amount);
            const commissions = months.map(m => monthlyData[m].commission);

            // عرض التقرير
            resultsDiv.innerHTML = `
                <div class="report-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem;">
                    <div class="stat-card stat-primary">
                        <div class="stat-icon">📊</div>
                        <div class="stat-info">
                            <div class="stat-label">إجمالي العمليات</div>
                            <div class="stat-value">${transactions.length}</div>
                        </div>
                    </div>
                    <div class="stat-card stat-success">
                        <div class="stat-icon">💰</div>
                        <div class="stat-info">
                            <div class="stat-label">إجمالي المبلغ</div>
                            <div class="stat-value">${totalAmount.toFixed(2)} ج.م</div>
                        </div>
                    </div>
                    <div class="stat-card stat-info">
                        <div class="stat-icon">💎</div>
                        <div class="stat-info">
                            <div class="stat-label">إجمالي العمولات</div>
                            <div class="stat-value">${totalCommission.toFixed(2)} ج.م</div>
                        </div>
                    </div>
                    <div class="stat-card stat-warning">
                        <div class="stat-icon">✅</div>
                        <div class="stat-info">
                            <div class="stat-label">عمليات مكتملة</div>
                            <div class="stat-value">${completedCount}/${transactions.length}</div>
                        </div>
                    </div>
                </div>

                <div class="chart-card" style="background:#fff;padding:1.5rem;border-radius:12px;margin-bottom:1rem;">
                    <h3>📈 المعاملات الشهرية</h3>
                    <canvas id="monthlyChart" height="100"></canvas>
                </div>

                <div class="chart-card" style="background:#fff;padding:1.5rem;border-radius:12px;">
                    <h3>💰 المبالغ والعمولات الشهرية</h3>
                    <canvas id="amountsChart" height="100"></canvas>
                </div>
            `;

            // رسم المخططات بـ Chart.js
            if (window.Chart) {
                new Chart(document.getElementById('monthlyChart'), {
                    type: 'bar',
                    data: {
                        labels: months.map(m => {
                            const [y, mo] = m.split('-');
                            const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
                            return monthNames[parseInt(mo) - 1] + ' ' + y;
                        }),
                        datasets: [{
                            label: 'عدد المعاملات',
                            data: counts,
                            backgroundColor: '#3498db',
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { labels: { font: { family: 'Tajawal' } } } },
                        scales: { y: { beginAtZero: true } }
                    }
                });

                new Chart(document.getElementById('amountsChart'), {
                    type: 'line',
                    data: {
                        labels: months.map(m => {
                            const [y, mo] = m.split('-');
                            const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
                            return monthNames[parseInt(mo) - 1] + ' ' + y;
                        }),
                        datasets: [
                            {
                                label: 'المبلغ (ج.م)',
                                data: amounts,
                                borderColor: '#27ae60',
                                backgroundColor: 'rgba(39, 174, 96, 0.1)',
                                tension: 0.3,
                                fill: true
                            },
                            {
                                label: 'العمولة (ج.م)',
                                data: commissions,
                                borderColor: '#f39c12',
                                backgroundColor: 'rgba(243, 156, 18, 0.1)',
                                tension: 0.3,
                                fill: true
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { labels: { font: { family: 'Tajawal' } } } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }

        } catch (err) {
            resultsDiv.innerHTML = `<p class="empty-state">خطأ: ${err.message}</p>`;
        }
    };

    // ============================================
    // 9. Toast Notifications (مخصص للـ dashboard)
    // ============================================
    function showToast(type, title, detail = '', duration = 4000) {
        let container = document.getElementById('dashboardToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'dashboardToastContainer';
            container.style.cssText = 'position:fixed;top:20px;left:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;max-width:380px;';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding:14px 18px;border-radius:10px;color:#fff;
            font-family:'Tajawal',sans-serif;font-size:14px;
            box-shadow:0 8px 24px rgba(0,0,0,0.15);cursor:pointer;
            animation:slideIn 0.3s ease-out;line-height:1.6;
        `;
        const bgColors = {
            success: 'linear-gradient(135deg,#27ae60,#229954)',
            error:   'linear-gradient(135deg,#e74c3c,#c0392b)',
            warn:    'linear-gradient(135deg,#f39c12,#d68910)',
            info:    'linear-gradient(135deg,#3498db,#2874a6)'
        };
        toast.style.background = bgColors[type] || bgColors.info;
        toast.innerHTML = `
            <span style="font-weight:700;display:block;margin-bottom:4px;">${title}</span>
            ${detail ? `<span style="font-size:13px;opacity:0.95;">${detail}</span>` : ''}
        `;
        toast.addEventListener('click', () => toast.remove());
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ============================================
    // 10. حفظ الإعدادات في localStorage
    // ============================================
    window.saveSettings = function () {
        const settings = {
            platformName: document.getElementById('platformName')?.value || 'SAWYAN BANK',
            platformEmail: document.getElementById('platformEmail')?.value || '',
            platformPhone: document.getElementById('platformPhone')?.value || '',
            companyShare: document.getElementById('companyShare')?.value || 25,
            minWithdraw: document.getElementById('minWithdraw')?.value || 100,
            maxDailyWithdraw: document.getElementById('maxDailyWithdraw')?.value || 10000,
            allowMemberRegistration: document.getElementById('allowMemberRegistration')?.checked ?? true,
            allowMerchantRegistration: document.getElementById('allowMerchantRegistration')?.checked ?? true,
            requireEmailVerification: document.getElementById('requireEmailVerification')?.checked ?? false,
            requirePhoneVerification: document.getElementById('requirePhoneVerification')?.checked ?? false,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem('sawyan_settings', JSON.stringify(settings));
        showToast('success', '✅ تم الحفظ', 'تم حفظ الإعدادات بنجاح');
    };

    window.resetSettings = function () {
        if (confirm('هل تريد إعادة تعيين الإعدادات؟')) {
            localStorage.removeItem('sawyan_settings');
            location.reload();
        }
    };

    window.loadSettingsFromStorage = function () {
        const saved = localStorage.getItem('sawyan_settings');
        if (!saved) return;
        try {
            const s = JSON.parse(saved);
            const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
            const setChk = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = val; };
            set('platformName', s.platformName);
            set('platformEmail', s.platformEmail);
            set('platformPhone', s.platformPhone);
            set('companyShare', s.companyShare);
            set('minWithdraw', s.minWithdraw);
            set('maxDailyWithdraw', s.maxDailyWithdraw);
            setChk('allowMemberRegistration', s.allowMemberRegistration);
            setChk('allowMerchantRegistration', s.allowMerchantRegistration);
            setChk('requireEmailVerification', s.requireEmailVerification);
            setChk('requirePhoneVerification', s.requirePhoneVerification);
        } catch (e) {
            console.error('Settings load error:', e);
        }
    };

    // ============================================
    // 11. التحميل عند جاهزية الصفحة
    // ============================================
    document.addEventListener('DOMContentLoaded', function () {
        // إضافة حقول البحث والفلترة تلقائياً
        setTimeout(() => {
            // إضافة حقل بحث للأعضاء
            const membersHeader = document.querySelector('#membersPage .page-header');
            if (membersHeader && !document.getElementById('membersSearchBox')) {
                const searchBox = document.createElement('div');
                searchBox.id = 'membersSearchBox';
                searchBox.style.cssText = 'margin: 1rem 0; display:flex; gap:0.5rem; flex-wrap:wrap;';
                searchBox.innerHTML = `
                    <input type="text" id="membersSearchInput"
                        placeholder="🔍 ابحث بالاسم، البريد، الكود، أو الهاتف..."
                        class="form-control"
                        style="flex:1; min-width:250px; padding:10px; border:1px solid #ddd; border-radius:6px; font-family:inherit;"
                        oninput="searchMembers(this.value)">
                `;
                membersHeader.after(searchBox);
            }

            // إضافة فلتر للتاريخ في صفحة المعاملات
            const txHeader = document.querySelector('#transactionsPage .page-header');
            if (txHeader && !document.getElementById('txFilterBox')) {
                const filterBox = document.createElement('div');
                filterBox.id = 'txFilterBox';
                filterBox.style.cssText = 'margin: 1rem 0; padding:1rem; background:#f8f9fa; border-radius:8px; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.5rem; align-items:end;';
                filterBox.innerHTML = `
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px;">من تاريخ</label>
                        <input type="date" id="txStartDate" class="form-control" style="padding:8px; border:1px solid #ddd; border-radius:6px; width:100%;">
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px;">إلى تاريخ</label>
                        <input type="date" id="txEndDate" class="form-control" style="padding:8px; border:1px solid #ddd; border-radius:6px; width:100%;">
                    </div>
                    <div>
                        <label style="display:block; font-size:12px; margin-bottom:4px;">الحالة</label>
                        <select id="txStatusFilter" class="form-control" style="padding:8px; border:1px solid #ddd; border-radius:6px; width:100%;">
                            <option value="all">الكل</option>
                            <option value="completed">مكتملة</option>
                            <option value="pending">معلقة</option>
                            <option value="cancelled">ملغاة</option>
                        </select>
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <button onclick="loadTransactionsFiltered(
                            document.getElementById('txStartDate').value,
                            document.getElementById('txEndDate').value,
                            document.getElementById('txStatusFilter').value
                        )" style="padding:8px 16px; background:var(--color-primary); color:#fff; border:none; border-radius:6px; cursor:pointer; font-family:inherit;">
                            🔍 فلترة
                        </button>
                        <button onclick="clearTxFilters()" style="padding:8px 16px; background:#95a5a6; color:#fff; border:none; border-radius:6px; cursor:pointer; font-family:inherit;">
                            ✕ مسح
                        </button>
                    </div>
                    <div id="transactionsCount" style="font-size:13px; color:#666; align-self:center;">0 عملية</div>
                `;
                txHeader.after(filterBox);

                // دالة مسح الفلاتر
                window.clearTxFilters = function () {
                    document.getElementById('txStartDate').value = '';
                    document.getElementById('txEndDate').value = '';
                    document.getElementById('txStatusFilter').value = 'all';
                    if (typeof loadTransactions === 'function') loadTransactions();
                };
            }

            // تحميل الإعدادات المحفوظة
            window.loadSettingsFromStorage?.();
        }, 500);
    });

    // ============================================
    // 12. إصلاح الأخطاء الإملائية (الموزوعات → المدفوعات)
    // ============================================
    document.addEventListener('DOMContentLoaded', function () {
        // البحث عن أي نص فيه "الموزوعات" وإصلاحه
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('الموزوعات')) {
                node.textContent = node.textContent.replace(/الموزوعات/g, 'المدفوعات');
            }
            if (node.textContent.includes('م.ج') && !node.textContent.includes('ج.م')) {
                node.textContent = node.textContent.replace(/م\.ج/g, 'ج.م');
            }
        }
    });

})();
