// دوال إضافية للصفحات الجديدة

// صفحة العمولات
async function loadCommissions() {
    try {
        const { data: transactions } = await window.SAWYAN.supabase
            .from('transactions')
            .select(`
                *,
                merchants(business_name, merchant_code, commission_percentage)
            `)
            .eq('status', 'completed');

        // تجميع البيانات حسب التاجر
        const merchantsMap = {};
        let totalCommissions = 0;
        let monthCommissions = 0;
        const currentMonth = new Date().getMonth();

        transactions?.forEach(t => {
            const merchantId = t.merchant_id;
            if (!merchantsMap[merchantId]) {
                merchantsMap[merchantId] = {
                    name: t.merchants?.business_name || 'غير معروف',
                    code: t.merchants?.merchant_code || '-',
                    percentage: t.merchants?.commission_percentage || 0,
                    totalTransactions: 0,
                    totalSales: 0,
                    totalCommissions: 0
                };
            }

            const commission = parseFloat(t.commission_amount || 0);
            merchantsMap[merchantId].totalTransactions++;
            merchantsMap[merchantId].totalSales += parseFloat(t.total_amount || 0);
            merchantsMap[merchantId].totalCommissions += commission;
            totalCommissions += commission;

            if (new Date(t.transaction_date).getMonth() === currentMonth) {
                monthCommissions += commission;
            }
        });

        // تحديث الإحصائيات
        document.getElementById('totalCommissionsAmount').textContent = totalCommissions.toFixed(2) + ' ج.م';
        document.getElementById('monthCommissions').textContent = monthCommissions.toFixed(2) + ' ج.م';

        // تحديث الجدول
        const tbody = document.getElementById('commissionsTableBody');
        const merchantsArray = Object.values(merchantsMap);

        if (merchantsArray.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد عمولات</td></tr>';
            return;
        }

        tbody.innerHTML = merchantsArray.map(m => `
            <tr>
                <td>${m.name} (${m.code})</td>
                <td>${m.totalTransactions}</td>
                <td>${m.totalSales.toFixed(2)} ج.م</td>
                <td>${m.totalCommissions.toFixed(2)} ج.م</td>
                <td>${m.percentage}%</td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading commissions:', error);
    }
}

// صفحة الشكاوى
async function loadDisputes() {
    try {
        const { data: disputes } = await window.SAWYAN.supabase
            .from('disputes')
            .select(`
                *,
                transactions(transaction_code),
                members(full_name, member_code),
                merchants(business_name, merchant_code)
            `)
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('disputesTableBody');

        if (!disputes || disputes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد شكاوى</td></tr>';
            return;
        }

        tbody.innerHTML = disputes.map(d => `
            <tr>
                <td>${d.id}</td>
                <td>${d.transactions?.transaction_code || '-'}</td>
                <td>${d.members?.full_name || '-'} (${d.members?.member_code || '-'})</td>
                <td>${d.merchants?.business_name || '-'}</td>
                <td>${d.reason || '-'}</td>
                <td>${new Date(d.created_at).toLocaleDateString('ar-EG')}</td>
                <td><span class="badge ${d.status === 'resolved' ? 'badge-success' : d.status === 'pending' ? 'badge-warning' : 'badge-danger'}">${d.status === 'resolved' ? 'محلولة' : d.status === 'pending' ? 'قيد المعالجة' : 'مرفوضة'}</span></td>
                <td>
                    <button class="btn-sm btn-primary" onclick="viewDispute('${d.id}')">عرض</button>
                    ${d.status === 'pending' ? `<button class="btn-sm btn-success" onclick="resolveDispute('${d.id}')">حل</button>` : ''}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading disputes:', error);
    }
}

// صفحة الدعم الفني
async function loadSupport() {
    try {
        const { data: tickets } = await window.SAWYAN.supabase
            .from('support_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('supportTableBody');

        if (!tickets || tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد تذاكر دعم</td></tr>';
            return;
        }

        tbody.innerHTML = tickets.map(t => `
            <tr>
                <td>${t.ticket_code || t.id}</td>
                <td>${t.user_name || '-'}</td>
                <td>${t.user_type === 'member' ? 'عضو' : 'تاجر'}</td>
                <td>${t.subject || '-'}</td>
                <td><span class="badge ${t.priority === 'high' ? 'badge-danger' : t.priority === 'medium' ? 'badge-warning' : 'badge-info'}">${t.priority === 'high' ? 'عالية' : t.priority === 'medium' ? 'متوسطة' : 'منخفضة'}</span></td>
                <td>${new Date(t.created_at).toLocaleDateString('ar-EG')}</td>
                <td><span class="badge ${t.status === 'closed' ? 'badge-success' : t.status === 'in_progress' ? 'badge-warning' : 'badge-info'}">${t.status === 'closed' ? 'مغلقة' : t.status === 'in_progress' ? 'قيد المعالجة' : 'جديدة'}</span></td>
                <td>
                    <button class="btn-sm btn-primary" onclick="viewTicket('${t.id}')">عرض</button>
                    ${t.status !== 'closed' ? `<button class="btn-sm btn-success" onclick="closeTicket('${t.id}')">إغلاق</button>` : ''}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading support tickets:', error);
    }
}

// صفحة الإعدادات
// خريطة المفاتيح في جدول settings (key/value table) <-> عناصر الإدخال
const SETTINGS_MAP = {
    // إعدادات العمولات
    'default_commission_percentage': { key: 'commission_settings', path: 'default_percentage', input: 'defaultCommission', type: 'float' },
    'min_commission_amount':         { key: 'commission_settings', path: 'min_amount',         input: 'minCommission',     type: 'float' },
    // Pool settings
    'company_percent':               { key: 'pool_config', path: 'company_percent',     input: 'companyPercent',     type: 'float' },
    'generations_count':             { key: 'pool_config', path: 'generations_count',   input: 'generationsCount',   type: 'int'   },
    'cap_amount':                     { key: 'pool_config', path: 'cap_amount',           input: 'capAmount',          type: 'float' },
    'cap_auto_calc':                  { key: 'pool_config', path: 'cap_auto_calc',        input: 'capAutoCalc',        type: 'bool'  },
    // System
    'system_name':                    { key: 'system_info', path: 'name',                input: 'systemName',         type: 'str'   },
    'support_email':                  { key: 'system_info', path: 'support_email',       input: 'supportEmail',       type: 'str'   },
    'support_phone':                  { key: 'system_info', path: 'support_phone',       input: 'supportPhone',       type: 'str'   }
};

// القيم الافتراضية
const SETTINGS_DEFAULTS = {
    commission_settings: { default_percentage: 10, min_amount: 5 },
    pool_config: { company_percent: 25, generations_count: 11, cap_amount: 4605, cap_auto_calc: true },
    system_info: { name: 'SAWYAN BANK', support_email: '', support_phone: '' }
};

async function loadSettings() {
    try {
        // اقرا كل صفوف الـ settings (key/value)
        const { data: rows, error } = await window.SAWYAN.supabase
            .from('settings')
            .select('key, value');

        if (error) throw error;

        // امزج القيم الافتراضية مع اللي في الـ DB
        const settingsByKey = { ...SETTINGS_DEFAULTS };
        (rows || []).forEach(row => {
            if (row.key && row.value) {
                settingsByKey[row.key] = { ...(settingsByKey[row.key] || {}), ...row.value };
            }
        });

        // املأ الـ inputs
        Object.entries(SETTINGS_MAP).forEach(([_, spec]) => {
            const input = document.getElementById(spec.input);
            if (!input) return;
            const block = settingsByKey[spec.key] || {};
            const val = block[spec.path];
            if (val === undefined || val === null) return;
            if (spec.type === 'bool') input.checked = !!val;
            else input.value = val;
        });

        // ربط الـ live preview
        ['companyPercent', 'generationsCount', 'capAmount', 'capAutoCalc', 'defaultCommission'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updatePoolPreview);
                el.addEventListener('change', updatePoolPreview);
            }
        });

        // عرض المعاينة المبدئية
        updatePoolPreview();

        await loadAdmins();

    } catch (error) {
        console.error('Error loading settings:', error);
        alert('تعذر تحميل الإعدادات: ' + (error.message || error));
    }
}

// 🌳 معاينة حسابات الـ Pool بشكل حي
function updatePoolPreview() {
    const companyPercent = parseFloat(document.getElementById('companyPercent')?.value) || 25;
    const generationsCount = parseInt(document.getElementById('generationsCount')?.value) || 11;
    const defaultDeduction = parseFloat(document.getElementById('defaultCommission')?.value) || 10;
    const capAutoCalc = document.getElementById('capAutoCalc')?.checked !== false;

    const productPrice = 330; // مثال افتراضي
    const deductedAmount = productPrice * (defaultDeduction / 100);
    const companyShare = deductedAmount * (companyPercent / 100);
    const membersShare = deductedAmount - companyShare;
    const membersPercent = 100 - companyPercent;
    const sharePerMember = membersShare / generationsCount;
    const totalMembers = Math.pow(2, generationsCount) - 1;
    const capValue = capAutoCalc ? Math.floor(totalMembers * sharePerMember) : (parseFloat(document.getElementById('capAmount')?.value) || 0);
    const finalSharePerMember = Math.min(sharePerMember, capValue);

    const content = document.getElementById('poolPreviewContent');
    if (!content) return;

    content.innerHTML = `
        <div>price = 330 · D% = ${defaultDeduction}% · C% = ${companyPercent}% · N = ${generationsCount}</div>
        <div>→ deducted = ${deductedAmount.toFixed(2)} · company = ${companyShare.toFixed(2)} · pool = <strong style="color:#047857;">${membersShare.toFixed(2)}</strong> (${membersPercent}%)</div>
        <div>→ share_per_member = ${finalSharePerMember.toFixed(4)} ${finalSharePerMember >= capValue ? '(cap applied)' : ''}</div>
        <div>→ tree_max = ${totalMembers.toLocaleString()} · cap = ${capValue.toLocaleString()}</div>
        <div>→ لو عضو في الجيل ${generationsCount} اشترى: ${Math.min(generationsCount, generationsCount)} × ${finalSharePerMember.toFixed(4)} = ${(Math.min(generationsCount, generationsCount) * finalSharePerMember).toFixed(2)} (surplus = ${(membersShare - Math.min(generationsCount, generationsCount) * finalSharePerMember).toFixed(2)})</div>
    `;

    // حدّث الـ capAmount تلقائياً لو cap_auto_calc = true
    if (capAutoCalc) {
        const capInput = document.getElementById('capAmount');
        if (capInput) capInput.value = capValue;
    }
}

async function loadAdmins() {
    try {
        const { data: admins } = await window.SAWYAN.supabase
            .from('admins')
            .select('*')
            .order('created_at', { ascending: false });

        const tbody = document.getElementById('adminsTableBody');

        if (!admins || admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد مديرين</td></tr>';
            return;
        }

        tbody.innerHTML = admins.map(a => `
            <tr>
                <td>${a.full_name}</td>
                <td>${a.email}</td>
                <td>${a.role === 'super_admin' ? 'مدير عام' : 'مدير'}</td>
                <td><span class="badge ${a.is_active ? 'badge-success' : 'badge-danger'}">${a.is_active ? 'نشط' : 'معطل'}</span></td>
                <td>
                    ${currentAdmin && currentAdmin.id !== a.id ? `
                        <button class="btn-sm btn-warning" onclick="toggleAdminStatus('${a.id}', ${!a.is_active})">${a.is_active ? 'تعطيل' : 'تفعيل'}</button>
                    ` : '<span class="text-muted">-</span>'}
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading admins:', error);
    }
}

async function saveSettings() {
    try {
        // جمّع القيم من الـ inputs في 3 blocks
        const blocks = {
            commission_settings: {
                default_percentage: parseFloat(document.getElementById('defaultCommission')?.value || '0'),
                min_amount: parseFloat(document.getElementById('minCommission')?.value || '0')
            },
            pool_config: {
                company_percent: parseFloat(document.getElementById('companyPercent')?.value || '25'),
                generations_count: parseInt(document.getElementById('generationsCount')?.value || '11'),
                cap_amount: parseFloat(document.getElementById('capAmount')?.value || '0'),
                cap_auto_calc: document.getElementById('capAutoCalc')?.checked !== false
            },
            system_info: {
                name: document.getElementById('systemName')?.value || 'SAWYAN BANK',
                support_email: document.getElementById('supportEmail')?.value || '',
                support_phone: document.getElementById('supportPhone')?.value || ''
            }
        };

        // upsert كل block على حدة
        // schema الـ settings: (id UUID, key TEXT, value JSONB, description TEXT, created_at, updated_at)
        const upserts = Object.entries(blocks).map(([key, value]) =>
            window.SAWYAN.supabase
                .from('settings')
                .upsert(
                    { key, value, description: descriptionFor(key) },
                    { onConflict: 'key' }
                )
        );
        const results = await Promise.all(upserts);
        const firstError = results.find(r => r.error);
        if (firstError && firstError.error) throw firstError.error;

        alert('✅ تم حفظ الإعدادات بنجاح!\n\n🌳 إعدادات الـ Pool حتأثر على المعاملات الجديدة بس.');
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('حدث خطأ أثناء حفظ الإعدادات: ' + (error.message || error));
    }
}

function descriptionFor(key) {
    return {
        commission_settings: 'إعدادات العمولات (النسبة الافتراضية + الحد الأدنى)',
        pool_config: 'إعدادات نظام الـ Pool (الشركة + الأجيال + الـ Cap)',
        system_info: 'معلومات النظام (الاسم + بيانات الدعم)'
    }[key] || '';
}

function resetSettings() {
    if (confirm('هل أنت متأكد من إعادة تعيين الإعدادات؟')) {
        loadSettings();
    }
}

function addNewAdmin() {
    alert('ميزة إضافة مدير جديد ستكون متاحة قريباً');
}

async function toggleAdminStatus(adminId, newStatus) {
    try {
        const { error } = await window.SAWYAN.supabase
            .from('admins')
            .update({ is_active: newStatus })
            .eq('id', adminId);

        if (error) throw error;

        await loadAdmins();
        alert('تم تحديث حالة المدير بنجاح');
    } catch (error) {
        console.error('Error toggling admin status:', error);
        alert('حدث خطأ أثناء تحديث حالة المدير');
    }
}

// صفحة التقارير
async function generateReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const reportType = document.getElementById('reportType').value;

    if (!startDate || !endDate) {
        alert('يرجى اختيار الفترة الزمنية');
        return;
    }

    const resultsDiv = document.getElementById('reportResults');
    resultsDiv.innerHTML = '<p class="empty-state">جاري إنشاء التقرير...</p>';

    try {
        let reportHTML = '';

        if (reportType === 'all' || reportType === 'transactions') {
            const { data: transactions } = await window.SAWYAN.supabase
                .from('transactions')
                .select('*')
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate);

            const totalAmount = transactions?.reduce((sum, t) => sum + parseFloat(t.total_amount || 0), 0) || 0;
            const totalCommissions = transactions?.reduce((sum, t) => sum + parseFloat(t.commission_amount || 0), 0) || 0;

            reportHTML += `
                <div class="report-section">
                    <h3>تقرير العمليات</h3>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">عدد العمليات</div>
                            <div class="stat-value">${transactions?.length || 0}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">إجمالي المبيعات</div>
                            <div class="stat-value">${totalAmount.toFixed(2)} ج.م</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">إجمالي العمولات</div>
                            <div class="stat-value">${totalCommissions.toFixed(2)} ج.م</div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (reportType === 'all' || reportType === 'members') {
            const { count: membersCount } = await window.SAWYAN.supabase
                .from('members')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startDate)
                .lte('created_at', endDate);

            reportHTML += `
                <div class="report-section">
                    <h3>تقرير الأعضاء</h3>
                    <div class="stat-card">
                        <div class="stat-label">عدد الأعضاء الجدد</div>
                        <div class="stat-value">${membersCount || 0}</div>
                    </div>
                </div>
            `;
        }

        if (reportType === 'all' || reportType === 'merchants') {
            const { count: merchantsCount } = await window.SAWYAN.supabase
                .from('merchants')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startDate)
                .lte('created_at', endDate);

            reportHTML += `
                <div class="report-section">
                    <h3>تقرير التجار</h3>
                    <div class="stat-card">
                        <div class="stat-label">عدد التجار الجدد</div>
                        <div class="stat-value">${merchantsCount || 0}</div>
                    </div>
                </div>
            `;
        }

        resultsDiv.innerHTML = reportHTML || '<p class="empty-state">لا توجد بيانات للفترة المحددة</p>';

    } catch (error) {
        console.error('Error generating report:', error);
        resultsDiv.innerHTML = '<p class="empty-state">حدث خطأ أثناء إنشاء التقرير</p>';
    }
}

function exportCommissions() {
    alert('ميزة التصدير ستكون متاحة قريباً');
}

function exportDisputes() {
    alert('ميزة التصدير ستكون متاحة قريباً');
}

function exportSupport() {
    alert('ميزة التصدير ستكون متاحة قريباً');
}

// دوال مساعدة
async function viewMember(memberId) {
    alert('عرض تفاصيل العضو: ' + memberId);
}

async function toggleMemberStatus(memberId, newStatus) {
    try {
        const { error } = await window.SAWYAN.supabase
            .from('members')
            .update({ is_active: newStatus })
            .eq('id', memberId);

        if (error) throw error;

        await loadMembers();
        alert('تم تحديث حالة العضو بنجاح');
    } catch (error) {
        console.error('Error toggling member status:', error);
        alert('حدث خطأ أثناء تحديث حالة العضو');
    }
}

async function viewMerchant(merchantId) {
    alert('عرض تفاصيل التاجر: ' + merchantId);
}

async function toggleMerchantStatus(merchantId, newStatus) {
    try {
        const { error } = await window.SAWYAN.supabase
            .from('merchants')
            .update({ is_active: newStatus })
            .eq('id', merchantId);

        if (error) throw error;

        await loadMerchants();
        alert('تم تحديث حالة التاجر بنجاح');
    } catch (error) {
        console.error('Error toggling merchant status:', error);
        alert('حدث خطأ أثناء تحديث حالة التاجر');
    }
}

async function viewDispute(disputeId) {
    alert('عرض تفاصيل الشكوى: ' + disputeId);
}

async function resolveDispute(disputeId) {
    if (confirm('هل أنت متأكد من حل هذه الشكوى؟')) {
        try {
            const { error } = await window.SAWYAN.supabase
                .from('disputes')
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq('id', disputeId);

            if (error) throw error;

            await loadDisputes();
            alert('تم حل الشكوى بنجاح');
        } catch (error) {
            console.error('Error resolving dispute:', error);
            alert('حدث خطأ أثناء حل الشكوى');
        }
    }
}

async function viewTicket(ticketId) {
    alert('عرض تفاصيل التذكرة: ' + ticketId);
}

async function closeTicket(ticketId) {
    if (confirm('هل أنت متأكد من إغلاق هذه التذكرة؟')) {
        try {
            const { error } = await window.SAWYAN.supabase
                .from('support_tickets')
                .update({ status: 'closed', closed_at: new Date().toISOString() })
                .eq('id', ticketId);

            if (error) throw error;

            await loadSupport();
            alert('تم إغلاق التذكرة بنجاح');
        } catch (error) {
            console.error('Error closing ticket:', error);
            alert('حدث خطأ أثناء إغلاق التذكرة');
        }
    }
}
