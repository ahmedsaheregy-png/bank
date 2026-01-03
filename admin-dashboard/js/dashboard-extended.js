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
async function loadSettings() {
    try {
        const { data: settings } = await window.SAWYAN.supabase
            .from('settings')
            .select('*')
            .single();

        if (settings) {
            document.getElementById('defaultCommission').value = settings.default_commission_percentage || 0;
            document.getElementById('minCommission').value = settings.min_commission_amount || 0;
            document.getElementById('systemName').value = settings.system_name || 'SAWYAN BANK';
            document.getElementById('supportEmail').value = settings.support_email || '';
            document.getElementById('supportPhone').value = settings.support_phone || '';
        }

        await loadAdmins();

    } catch (error) {
        console.error('Error loading settings:', error);
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
        const settings = {
            default_commission_percentage: parseFloat(document.getElementById('defaultCommission').value),
            min_commission_amount: parseFloat(document.getElementById('minCommission').value),
            system_name: document.getElementById('systemName').value,
            support_email: document.getElementById('supportEmail').value,
            support_phone: document.getElementById('supportPhone').value
        };

        const { error } = await window.SAWYAN.supabase
            .from('settings')
            .upsert(settings);

        if (error) throw error;

        alert('تم حفظ الإعدادات بنجاح');
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('حدث خطأ أثناء حفظ الإعدادات');
    }
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
