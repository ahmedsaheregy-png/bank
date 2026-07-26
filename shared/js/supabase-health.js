// ============================================
// SAWYAN BANK - Supabase Health Check Utility
// ============================================
// فحوصات سريعة وشاملة لحالة اتصال Supabase
// يستخدم في login.html و health-check.html
// ============================================

(function () {
    'use strict';

    const Health = {
        // ============================================
        // فحص سريع - هل Supabase يستجيب أصلاً؟
        // ============================================
        async quickCheck() {
            try {
                if (!window.SAWYAN || !window.SAWYAN.supabase) {
                    return { ok: false, message: 'Supabase client غير مهيأ. تأكد من تحميل supabase.js' };
                }

                // محاولة قراءة سجل واحد من جدول admins
                const { data, error, count } = await window.SAWYAN.supabase
                    .from('admins')
                    .select('*', { count: 'exact', head: true })
                    .limit(1);

                if (error) {
                    return {
                        ok: false,
                        message: 'جدول admins غير موجود أو لا يمكن الوصول إليه.',
                        hint: 'نفّذ schema.sql في Supabase SQL Editor لإنشاء الجداول.',
                        rawError: error.message
                    };
                }

                return { ok: true, count: count || 0 };
            } catch (e) {
                return {
                    ok: false,
                    message: 'تعذّر الاتصال بـ Supabase: ' + e.message,
                    hint: 'تحقق من اتصال الإنترنت ومن أن مشروع Supabase نشط.'
                };
            }
        },

        // ============================================
        // فحص شامل - كل الجداول + البيانات
        // ============================================
        async fullDiagnostic() {
            const result = {
                ok: false,
                timestamp: new Date().toISOString(),
                config: null,
                adminsCount: 0,
                membersCount: 0,
                merchantsCount: 0,
                transactionsCount: 0,
                tables: {},
                errors: []
            };

            try {
                // 1. التحقق من التهيئة
                if (!window.SAWYAN || !window.SAWYAN.supabase) {
                    result.errors.push('Supabase client غير مهيأ');
                    result.message = 'Supabase client غير مهيأ';
                    return result;
                }

                result.config = {
                    url: window.SAWYAN.config?.url || 'غير معروف',
                    schema: window.SAWYAN.config?.schema || 'غير معروف',
                    environment: window.SAWYAN.config?.ENVIRONMENT || 'غير معروف'
                };

                // 2. فحص كل جدول على حدة
                const tables = ['admins', 'members', 'merchants', 'transactions'];

                for (const table of tables) {
                    try {
                        const { count, error } = await window.SAWYAN.supabase
                            .from(table)
                            .select('*', { count: 'exact', head: true });

                        if (error) {
                            result.tables[table] = { ok: false, error: error.message };
                            result.errors.push(`جدول ${table}: ${error.message}`);
                        } else {
                            result.tables[table] = { ok: true, count: count || 0 };
                            switch (table) {
                                case 'admins':        result.adminsCount = count || 0; break;
                                case 'members':       result.membersCount = count || 0; break;
                                case 'merchants':     result.merchantsCount = count || 0; break;
                                case 'transactions':  result.transactionsCount = count || 0; break;
                            }
                        }
                    } catch (e) {
                        result.tables[table] = { ok: false, error: e.message };
                        result.errors.push(`جدول ${table}: ${e.message}`);
                    }
                }

                // 3. فحص admin@sawyan.com تحديداً
                try {
                    const { data: admin } = await window.SAWYAN.supabase
                        .from('admins')
                        .select('id, email, role, is_active')
                        .eq('email', 'admin@sawyan.com')
                        .maybeSingle();

                    result.defaultAdmin = admin
                        ? { exists: true, active: admin.is_active, role: admin.role }
                        : { exists: false };
                } catch (e) {
                    result.defaultAdmin = { exists: false, error: e.message };
                }

                // 4. تقرير نهائي
                const allTablesOk = Object.values(result.tables).every(t => t.ok);
                result.ok = allTablesOk && result.adminsCount > 0;

                if (!result.ok) {
                    if (result.adminsCount === 0) {
                        result.message = 'جدول admins فارغ - المدير الافتراضي admin@sawyan.com غير موجود.';
                        result.hint = 'نفّذ schema.sql لإضافة المدير الافتراضي والجداول الناقصة.';
                    } else if (!allTablesOk) {
                        result.message = 'بعض الجداول ناقصة في قاعدة البيانات.';
                        result.hint = 'نفّذ schema.sql بالكامل لإنشاء كل الجداول.';
                    }
                }

                return result;
            } catch (e) {
                result.errors.push(e.message);
                result.message = 'خطأ غير متوقع: ' + e.message;
                return result;
            }
        },

        // ============================================
        // فحص شبكي للـ URL فقط (بدون مكتبة Supabase)
        // ============================================
        async pingUrl() {
            const url = window.SAWYAN?.config?.url;
            if (!url) return { ok: false, message: 'URL غير مُعرّف في supabase.js' };

            try {
                const start = performance.now();
                const response = await fetch(`${url}/rest/v1/`, {
                    method: 'HEAD',
                    headers: { 'apikey': window.SAWYAN.config.anonKey }
                });
                const elapsed = Math.round(performance.now() - start);

                return {
                    ok: response.ok || response.status === 404,  // 404 يعني أن الـ URL يرد لكن الـ endpoint غير موجود
                    status: response.status,
                    latencyMs: elapsed,
                    url: url
                };
            } catch (e) {
                return {
                    ok: false,
                    message: 'تعذّر الوصول لـ Supabase URL',
                    hint: 'تحقق من اتصال الإنترنت، أو أن المشروع لم يتم إيقافه على Supabase',
                    error: e.message,
                    url: url
                };
            }
        },

        // ============================================
        // تقرير قابل للعرض في صفحة كاملة
        // ============================================
        async renderReport(targetElementId) {
            const el = document.getElementById(targetElementId);
            if (!el) return;

            el.innerHTML = '<div style="text-align:center;padding:20px;">⏳ جارٍ الفحص...</div>';

            const [diag, ping] = await Promise.all([
                this.fullDiagnostic(),
                this.pingUrl()
            ]);

            const tableRow = (name, info) => `
                <tr>
                    <td><code>${name}</code></td>
                    <td style="text-align:center;">${info.ok
                        ? `<span style="color:#27ae60;">✓ موجود</span>`
                        : `<span style="color:#e74c3c;">✗ مفقود</span>`}</td>
                    <td style="text-align:center;">${info.ok ? (info.count || 0) : '-'}</td>
                    <td style="font-size:12px;color:#666;">${info.ok ? '' : (info.error || '')}</td>
                </tr>`;

            el.innerHTML = `
                <div style="font-family:'Tajawal',sans-serif;direction:rtl;padding:20px;max-width:800px;margin:0 auto;">
                    <h2 style="color:var(--color-primary);border-bottom:2px solid var(--color-primary);padding-bottom:10px;">
                        🔍 تقرير فحص Supabase
                    </h2>

                    <div style="background:#f8f9fa;padding:14px;border-radius:8px;margin:14px 0;font-size:14px;">
                        <strong>التاريخ:</strong> ${new Date(diag.timestamp).toLocaleString('ar-EG')}<br>
                        <strong>URL:</strong> <code>${diag.config?.url || 'غير معروف'}</code><br>
                        <strong>Schema:</strong> <code>${diag.config?.schema || 'غير معروف'}</code><br>
                        <strong>Environment:</strong> <code>${diag.config?.environment || 'غير معروف'}</code>
                    </div>

                    <h3>📡 حالة الشبكة</h3>
                    <div style="background:${ping.ok ? '#d4edda' : '#f8d7da'};padding:14px;border-radius:8px;margin:10px 0;">
                        ${ping.ok
                            ? `✅ URL مستجيب (${ping.latencyMs}ms)`
                            : `❌ ${ping.message}<br><small>${ping.error || ''}</small>`}
                    </div>

                    <h3>📊 حالة الجداول</h3>
                    <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:14px;">
                        <thead>
                            <tr style="background:var(--color-primary);color:#fff;">
                                <th style="padding:10px;text-align:right;">الجدول</th>
                                <th style="padding:10px;">الحالة</th>
                                <th style="padding:10px;">عدد السجلات</th>
                                <th style="padding:10px;text-align:right;">ملاحظات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(diag.tables).map(([name, info]) => tableRow(name, info)).join('')}
                        </tbody>
                    </table>

                    <h3>👤 المدير الافتراضي</h3>
                    <div style="background:${diag.defaultAdmin?.exists ? '#d4edda' : '#f8d7da'};padding:14px;border-radius:8px;margin:10px 0;">
                        ${diag.defaultAdmin?.exists
                            ? `✅ موجود - <code>admin@sawyan.com</code> | الدور: ${diag.defaultAdmin.role} | نشط: ${diag.defaultAdmin.active ? 'نعم' : 'لا'}`
                            : `❌ غير موجود - نفّذ schema.sql لإضافته`}
                    </div>

                    <h3>📋 الملخص</h3>
                    <div style="background:${diag.ok ? '#d4edda' : '#fff3cd'};padding:14px;border-radius:8px;margin:10px 0;">
                        ${diag.ok
                            ? '✅ كل شيء سليم! يمكنك تسجيل الدخول بـ <code>admin@sawyan.com / 123456</code>'
                            : `⚠️ ${diag.message || 'توجد مشاكل تحتاج لإصلاح'}<br>${diag.hint ? '<br><strong>الحل:</strong> ' + diag.hint : ''}`}
                    </div>

                    ${diag.errors.length > 0 ? `
                        <h3>🐛 الأخطاء التفصيلية</h3>
                        <pre style="background:#f8d7da;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;">${diag.errors.join('\n')}</pre>
                    ` : ''}

                    <div style="text-align:center;margin-top:24px;">
                        <a href="login.html" style="display:inline-block;background:var(--color-primary);color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">
                            ← العودة لتسجيل الدخول
                        </a>
                    </div>
                </div>
            `;
        }
    };

    // تصدير
    window.SAWYANHealth = Health;
    console.log('✅ SAWYANHealth utility loaded');
})();
