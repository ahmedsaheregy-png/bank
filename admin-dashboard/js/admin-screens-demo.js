/* ============================================================
   SAWYAN Admin — Operational Screens (2–9) & Governance Modules
   - بيئة معاينة ومحاكاة تفاعلية متسقة حسابياً مع SAWYAN_ADMIN_DEMO
   - كل عنصر مقترح يحمل شارة: 🧪 مقترح للمعاينة — غير معتمد بعد
   ============================================================ */
(function () {
    if (typeof window !== 'undefined' && window.SAWYAN && !window.SAWYAN.isParallelDemo) {
        console.log('[SAWYAN Admin] Production mode active: skipping operational demo mockups.');
        return;
    }
    var OPS_LS = 'sawyan_admin_ops_v1';
    var returnContext = null;

    /* ---------- أدوات مساعدة عامة ---------- */
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmt(n, d) {
        return Number(n || 0).toLocaleString('en-US', {
            minimumFractionDigits: d === undefined ? 2 : d,
            maximumFractionDigits: d === undefined ? 2 : d
        });
    }
    function fmt0(n) { return Number(n || 0).toLocaleString('en-US'); }
    function nowStr() {
        var d = new Date();
        function z(x) { return (x < 10 ? '0' : '') + x; }
        return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
    }
    function badgeProp(extra) {
        return '<span style="display:inline-flex;align-items:center;gap:4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:3px 10px;border-radius:999px;font-size:0.74rem;font-weight:800;">🧪 مقترح للمعاينة — غير معتمد بعد' + (extra ? ' • ' + esc(extra) : '') + '</span>';
    }
    function downloadCsv(filename, headers, rows) {
        var lines = [headers].concat(rows).map(function (r) {
            return r.map(function (c) { return '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
        });
        var bom = '\uFEFF';
        var blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    }

    /* ---------- الحالة التشغيلية المتماسكة ---------- */
    function initialOpsState() {
        return {
            members: [
                { id: 'MEM-101', code: '#101', name: 'محمد دمير', email: 'm.demir@sawyan.demo', phone: '+20 100 555 0101', country: 'EG', residence: 'EG', nationality: 'مصرية', joined: '2026-08-12', active: true, kyc: 'verified', kycDoc: 'بطاقة قومي + فاتورة كهرباء', treePos: '2Me / 2Com (يمين #0)', sponsor: 'الشركة (#0)', targetUsd: 24.75, carryUsd: 28.40, earnedUsd: 4820.00, financialStopperExcessUsd: 215.00, hold: false, moveReq: 'تركيا (عقد عمل) — قيد المراجعة' },
                { id: 'MEM-124', code: '#124', name: 'أحمد مصطفى', email: 'ahmed.m@sawyan.demo', phone: '+20 101 234 5678', country: 'EG', residence: 'EG', nationality: 'مصرية', joined: '2026-09-03', active: true, kyc: 'pending', kycDoc: 'صورة بطاقة شخصية سارية مرفوعة', treePos: '4Me / 4Com (يمين #101)', sponsor: 'محمد دمير (#101)', targetUsd: 24.75, carryUsd: 19.50, earnedUsd: 310.00, financialStopperExcessUsd: 0, hold: false, moveReq: null },
                { id: 'MEM-125', code: '#125', name: 'خالد حسن', email: 'khaled.h@sawyan.demo', phone: '+20 112 889 4412', country: 'EG', residence: 'EG', nationality: 'مصرية', joined: '2026-09-08', active: true, kyc: 'verified', kycDoc: 'جواز سفر + عقد إيجار موثق', treePos: '4Me / 5Com (يسار #101)', sponsor: 'محمد دمير (#101)', targetUsd: 24.75, carryUsd: 26.20, earnedUsd: 185.00, financialStopperExcessUsd: 0, hold: false, moveReq: null },
                { id: 'MEM-210', code: '#210', name: 'منى علي', email: 'mona.ali@sawyan.demo', phone: '+20 122 440 9921', country: 'EG', residence: 'EG', nationality: 'مصرية', joined: '2026-09-18', active: true, kyc: 'pending', kycDoc: 'مستند إقامة مرفوع بتاريخ اليوم', treePos: '5Me / 6Com (يمين #124)', sponsor: 'أحمد مصطفى (#124)', targetUsd: 24.75, carryUsd: 8.10, earnedUsd: 92.00, financialStopperExcessUsd: 0, hold: false, moveReq: null },
                { id: 'MEM-318', code: '#318', name: 'يوسف كمال', email: 'youssef.k@sawyan.demo', phone: '+90 532 771 2033', country: 'TR', residence: 'TR', nationality: 'تركية', joined: '2026-10-02', active: true, kyc: 'verified', kycDoc: 'Kimlik إقامة تركية سارية', treePos: '6Me / 8Com (يسار #125)', sponsor: 'خالد حسن (#125)', targetUsd: 24.75, carryUsd: 25.00, earnedUsd: 412.50, financialStopperExcessUsd: 0, hold: false, moveReq: null },
                { id: 'MEM-390', code: '#390', name: 'سارة إبراهيم', email: 'sara.ib@sawyan.demo', phone: '+20 155 310 7740', country: 'EG', residence: 'EG', nationality: 'مصرية', joined: '2026-10-14', active: false, kyc: 'rejected', kycDoc: 'صورة غير واضحة للوجه والرقم', treePos: '7Me / 9Com (يمين #210)', sponsor: 'منى علي (#210)', targetUsd: 24.75, carryUsd: 0, earnedUsd: 0, financialStopperExcessUsd: 0, hold: true, moveReq: null }
            ],
            merchants: [
                { id: 'MER-101', code: 'EG-MKT-101', name: 'سوبر ماركت الفارق المركزي', type: 'both', category: 'سوبر ماركت', country: 'EG', commPct: 10, planSharePct: 75, packageLimit: 10000, prepaidBalance: 4850, creditLimit: 0, status: 'active', gmvMtd: 412500, opsMtd: 618, phone: '+20 100 900 1010', ownerIdNum: '28901011234567' },
                { id: 'MER-102', code: 'EG-PHR-102', name: 'صيدلية الشفاء الحديثة', type: 'physical', category: 'صيدليات', country: 'EG', commPct: 12, planSharePct: 75, packageLimit: 8000, prepaidBalance: 3920, creditLimit: 0, status: 'active', gmvMtd: 231000, opsMtd: 412, phone: '+20 102 330 4411', ownerIdNum: '28505021239988' },
                { id: 'MER-103', code: 'EG-RES-103', name: 'مطعم البيت الشامي', type: 'physical', category: 'مطاعم وكافيهات', country: 'EG', commPct: 10, planSharePct: 75, packageLimit: 10000, prepaidBalance: 380, creditLimit: 0, status: 'low_balance', gmvMtd: 198400, opsMtd: 289, phone: '+20 111 778 2200', ownerIdNum: '29103031237711' },
                { id: 'MER-104', code: 'EG-ELC-104', name: 'تك ستور للإلكترونيات', type: 'online', category: 'إلكترونيات', country: 'EG', commPct: 8, planSharePct: 75, packageLimit: 10000, prepaidBalance: 420, creditLimit: 0, status: 'low_balance', gmvMtd: 165000, opsMtd: 115, phone: '+20 120 441 8819', ownerIdNum: '29207091231122' },
                { id: 'MER-105', code: 'EG-PRF-105', name: 'عطور الشرق الملكية', type: 'physical', category: 'كوزماتيكس وعطور', country: 'EG', commPct: 15, planSharePct: 75, packageLimit: 6000, prepaidBalance: 240, creditLimit: 0, status: 'frozen', gmvMtd: 94200, opsMtd: 84, phone: '+20 109 612 3300', ownerIdNum: '28811151236644' },
                { id: 'MER-106', code: 'TR-FSH-201', name: 'أزياء البوسفور (إسطنبول)', type: 'both', category: 'ملابس', country: 'TR', commPct: 10, planSharePct: 75, packageLimit: 15000, prepaidBalance: 9800, creditLimit: 0, status: 'active', gmvMtd: 183500, opsMtd: 240, phone: '+90 533 881 1020', ownerIdNum: 'TR-99812031' },
                { id: 'MER-107', code: 'EG-NEW-107', name: 'متجر النور للأدوات المنزلية', type: 'physical', category: 'أدوات منزلية', country: 'EG', commPct: 10, planSharePct: 75, packageLimit: 5000, prepaidBalance: 0, creditLimit: 0, status: 'pending_approval', gmvMtd: 0, opsMtd: 0, phone: '+20 106 882 9100', ownerIdNum: '29004051235500', docsNote: 'سجل تجاري #88412 + بطاقة ضريبية مرفقة + إحداثيات مدينة نصر' }
            ],
            bankSlips: [
                { id: 'BNK-991', merchantId: 'MER-101', merchantName: 'سوبر ماركت الفارق المركزي', method: 'InstaPay', ref: 'IP-20261114-8821', amount: 5000, at: 'اليوم 04:15 م', status: 'pending' },
                { id: 'BNK-992', merchantId: 'MER-105', merchantName: 'عطور الشرق الملكية (معزول)', method: 'تحويل بنكي CIB', ref: 'CIB-9910442', amount: 3000, at: 'اليوم 05:50 م', status: 'pending' }
            ],
            transactions: [
                { id: 'TXN-9842', memberCode: '#124', memberName: 'أحمد مصطفى', phoneLast4: '5678', merchantCode: 'EG-MKT-101', merchantName: 'سوبر ماركت الفارق المركزي', amount: 500, commPct: 10, commAmt: 50, fx: 50, date: '2026-11-14 18:45', route: 'أ (POS)', status: 'completed', note: 'مشتريات بقالة أسبوعية', payoutMonth: '2026-11 (مفتوح)' },
                { id: 'TXN-9841', memberCode: '#210', memberName: 'منى علي', phoneLast4: '9921', merchantCode: 'EG-PHR-102', merchantName: 'صيدلية الشفاء الحديثة', amount: 340, commPct: 12, commAmt: 40.80, fx: 50, date: '2026-11-14 17:20', route: 'أ (QR)', status: 'completed', note: 'أدوية وعناية', payoutMonth: '2026-11 (مفتوح)' },
                { id: 'TXN-9840', memberCode: '#125', memberName: 'خالد حسن', phoneLast4: '4412', merchantCode: 'EG-MKT-101', merchantName: 'سوبر ماركت الفارق المركزي', amount: 1250, commPct: 10, commAmt: 125, fx: 50, date: '2026-11-14 16:30', route: 'ب (PIN)', status: 'completed', note: 'شراء منزلي', payoutMonth: '2026-11 (مفتوح)' },
                { id: 'TXN-PEND-771', memberCode: '#210', memberName: 'منى علي', phoneLast4: '9921', merchantCode: 'EG-ELC-104', merchantName: 'تك ستور للإلكترونيات', amount: 1800, commPct: 8, commAmt: 144, fx: 50, date: '2026-11-12 11:10', route: 'ب (معلق 55س > 48س)', status: 'escalated', note: 'تجاوز مهلة التاجر 48 ساعة — متصاعد للإدارة (D6)', payoutMonth: '2026-11 (مفتوح)' },
                { id: 'TXN-OCT-410', memberCode: '#125', memberName: 'خالد حسن', phoneLast4: '4412', merchantCode: 'EG-ELC-104', merchantName: 'تك ستور للإلكترونيات', amount: 2200, commPct: 8, commAmt: 176, fx: 50, date: '2026-10-27 14:15', route: 'أ (POS)', status: 'completed', note: 'فاتورة شهر مغلق ومصروف عمولاتها يوم 10 نوفمبر (اختبار Clawback D5)', payoutMonth: '2026-10 (مصروف)' },
                { id: 'TXN-DUP-804', memberCode: '#124', memberName: 'أحمد مصطفى', phoneLast4: '5678', merchantCode: 'EG-MKT-101', merchantName: 'سوبر ماركت الفارق المركزي', amount: 500, commPct: 10, commAmt: 50, fx: 50, date: '2026-11-14 18:49', route: 'ب (اشتباه تكرار)', status: 'flagged_dup', note: 'نفس العضو والمبلغ خلال 4 دقائق — محتجز آلياً للمراجعة (M11)', payoutMonth: '2026-11 (مفتوح)' }
            ],
            disputes: [
                { id: 'DSP-301', txn: 'TXN-9811', member: 'أحمد مصطفى (#124)', merchant: 'مطعم البيت الشامي', reason: 'المبلغ المسجل 650 ج.م والفاتورة الحقيقية 850 ج.م', slaHoursLeft: 4, status: 'pending', resolution: '' },
                { id: 'DSP-302', txn: 'TXN-9795', member: 'منى علي (#210)', merchant: 'تك ستور للإلكترونيات', reason: 'رفض التاجر توثيق طلب المسار (ب) رغم الشراء النقدي', slaHoursLeft: 19, status: 'pending', resolution: '' },
                { id: 'DSP-303', txn: 'TXN-9740', member: 'خالد حسن (#125)', merchant: 'عطور الشرق الملكية', reason: 'تمت عملية شراء قبل علمي بعزل التاجر المؤقت', slaHoursLeft: 28, status: 'pending', resolution: '' }
            ],
            tickets: [
                { id: 'TKT-501', user: 'محمد دمير (#101)', type: 'member', subject: 'طلب تحديث مستند إقامة لفتح دولة تركيا كإقامة', priority: 'high', date: '2026-11-14', status: 'open', reply: '' },
                { id: 'TKT-502', user: 'سوبر ماركت الفارق', type: 'merchant', subject: 'استعلام عن مطابقة إشعار إنستاباي بمبلغ 5,000 ج.م', priority: 'high', date: '2026-11-14', status: 'in_progress', reply: 'قيد المراجعة المالية مع إيصال BNK-991' },
                { id: 'TKT-503', user: 'يوسف كمال (#318)', type: 'member', subject: 'كيف أحسب الهدف التعويضي بين تركيا ومصر؟', priority: 'medium', date: '2026-11-13', status: 'open', reply: '' },
                { id: 'TKT-504', user: 'عطور الشرق الملكية', type: 'merchant', subject: 'طلب فك العزل الوقائي بعد إرسال التحويل البنكي', priority: 'high', date: '2026-11-14', status: 'open', reply: '' },
                { id: 'TKT-505', user: 'منى علي (#210)', type: 'member', subject: 'تأخر مراجعة صورة الهوية KYC', priority: 'medium', date: '2026-11-13', status: 'in_progress', reply: '' },
                { id: 'TKT-506', user: 'تك ستور للإلكترونيات', type: 'merchant', subject: 'إضافة مفتاح Webhook جديد لموقع المتجر', priority: 'low', date: '2026-11-12', status: 'open', reply: '' },
                { id: 'TKT-507', user: 'خالد حسن (#125)', type: 'member', subject: 'الاستعلام عن أثر استرداد فاتورة أكتوبر', priority: 'medium', date: '2026-11-12', status: 'open', reply: '' },
                { id: 'TKT-508', user: 'صيدلية الشفاء', type: 'merchant', subject: 'تغيير رمز PIN الخاص بالكاشير المسائي', priority: 'low', date: '2026-11-11', status: 'in_progress', reply: '' },
                { id: 'TKT-509', user: 'سارة إبراهيم (#390)', type: 'member', subject: 'سبب تجميد السحب وإعادة رفع البطاقة', priority: 'medium', date: '2026-11-11', status: 'open', reply: '' }
            ],
            withdrawals: [
                { id: 'WD-701', memberCode: '#101', memberName: 'محمد دمير', usdAmount: 240.00, fxUsed: 50.00, feePct: 1.5, whtPct: 0, method: 'bank_transfer', account: 'IBAN EG8000020111...4921', date: '2026-11-14', kycOk: true, cooldownHoursLeft: 0, dualRequired: true, checker1Approved: false, status: 'pending', note: 'يتجاوز $200 — يلزم اعتماد ثانٍ مزدوج (W05)' },
                { id: 'WD-702', memberCode: '#125', memberName: 'خالد حسن', usdAmount: 45.00, fxUsed: 50.00, feePct: 1.5, whtPct: 0, method: 'instapay', account: 'khaled@instapay', date: '2026-11-14', kycOk: true, cooldownHoursLeft: 58, dualRequired: false, checker1Approved: false, status: 'pending', note: 'تغيّر الحساب المستلم قبل 14 ساعة — فترة تهدئة 72س سارية (W07)' },
                { id: 'WD-703', memberCode: '#124', memberName: 'أحمد مصطفى', usdAmount: 30.00, fxUsed: 50.00, feePct: 1.5, whtPct: 0, method: 'vodafone_cash', account: '01012345678', date: '2026-11-14', kycOk: false, cooldownHoursLeft: 0, dualRequired: false, checker1Approved: false, status: 'pending', note: 'الـ KYC لم يُعتمد بعد — محجوب لحين مراجعة الهوية (D7)' },
                { id: 'WD-704', memberCode: '#318', memberName: 'يوسف كمال', usdAmount: 82.00, fxUsed: 50.00, feePct: 1.5, whtPct: 0, method: 'bank_transfer', account: 'TR3300061005...1109', date: '2026-11-13', kycOk: true, cooldownHoursLeft: 0, dualRequired: false, checker1Approved: false, status: 'pending', note: 'جاهز للصرف (مصر/تركيا مسجل TR)' },
                { id: 'WD-705', memberCode: '#112', memberName: 'سعيد محمود', usdAmount: 110.00, fxUsed: 50.00, feePct: 1.5, whtPct: 0, method: 'instapay', account: 'saeed@instapay', date: '2026-11-10', kycOk: true, cooldownHoursLeft: 0, dualRequired: false, checker1Approved: true, status: 'approved', note: 'تم التحويل يوم 10 نوفمبر' }
            ],
            fraudQueue: [
                { id: 'FRD-01', severity: 'حرج', title: 'تواتر فواتير مشبوه لثنائي واحد (Member #290 + MER-103)', detail: '6 فواتير في 35 دقيقة بمجموع 8,400 ج.م دون صور إيصال — خرق للمقترح M15/M16', status: 'open', control: 'M15 سقف الثنائي + M16 إلزام الصورة' },
                { id: 'FRD-02', severity: 'عالي', title: 'تضارب مصالح: التاجر EG-PRF-105 = العضو #312', detail: 'تطابق الرقم القومي (28811151236644) بين مالك المتجر وعضو مسجل تحته لشراء فواتير لنفسه', status: 'open', control: 'ربط الهوية الواحدة + حظر الصفقات الذاتية' },
                { id: 'FRD-03', severity: 'عالي', title: 'تجمع أجهزة متكرر لبناء سلسال Roll-up وهمي', detail: '3 حسابات (#402، #403، #404) أُنشئت من نفس بصمة الجهاز خلال 12 دقيقة (خرق W12b)', status: 'open', control: 'W12b تقييد الحسابات لكل جهاز + تحقق OTP' },
                { id: 'FRD-04', severity: 'متوسط', title: 'محاولة إعادة مسح QR أوفلاين مستخدم سابقاً', detail: 'كاشير حاول إعادة إرسال نفس توقيع QR الأوفلاين لـ TXN-9841 — تم الرفض آلياً (Idempotency)', status: 'blocked_auto', control: 'M14 QR وحيد الاستخدام + Nonce' }
            ],
            reconDiffInjected: false,
            closeStep: 1,
            breakGlassOpenUntil: null,
            breakGlassReason: '',
            fxRates: [
                { code: 'EG', country: 'مصر', cur: 'EGP', curRate: 50.00, nextDraft: 50.00, source: 'البنك المركزي المصري (مرجع 2026-10-30)', locked: true, unrealizedPnlUsd: 0 },
                { code: 'TR', country: 'تركيا', cur: 'TRY', curRate: 50.00, nextDraft: 52.00, source: 'TCMB المركزي التركي (تجريبي)', locked: true, unrealizedPnlUsd: 0 },
                { code: 'SA', country: 'السعودية', cur: 'SAR', curRate: 3.75, nextDraft: 3.75, source: 'ساما — ربط ثابت بالدولار', locked: true, unrealizedPnlUsd: 0 }
            ],
            stopperFundDecisions: [
                { id: 'STP-F1', memberCode: '#101', memberName: 'محمد دمير', month: '2026-10', excessUsd: 215.00, sources: 'مصر (135$) + تركيا (80$)', status: 'pending_decision', note: 'في انتظار قرار الإدارة (D14)' }
            ],
            privacyLogs: [
                { at: 'اليوم 06:10 م', actor: 'أدمن: منى (مُعتمِدة)', target: 'محمد دمير (#101)', scope: 'إثبات الإقامة KYC (سحب WD-701)', consent: '✅ موافقة PDPL موثقة' },
                { at: 'اليوم 05:30 م', actor: 'القائد #101 (تصدير فريق)', target: '10 أجيال أسفله', scope: 'رؤية أرقام الهواتف داخل الستوبر (W09b)', consent: '✅ ضمن صلاحية الهيكل' },
                { at: 'اليوم 04:00 م', actor: 'رادار التاجر MER-101', target: 'نطاق 3 كم مدينة نصر', scope: 'كثافة الأعضاء المجهولة (k=450 ≥ 10)', consent: '✅ لا بيانات شخصية مكشوفة (M18)' }
            ]
        };
    }

    var OPS = null;
    function loadOps() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem(OPS_LS) || 'null'); } catch (e) { raw = null; }
        if (raw && raw.members && raw.merchants) OPS = raw;
        else { OPS = initialOpsState(); saveOps(); }
    }
    function saveOps() { localStorage.setItem(OPS_LS, JSON.stringify(OPS)); }
    loadOps();

    /* ---------- شريط السياق والعودة للمختبر ---------- */
    function renderReturnBanner() {
        var area = document.getElementById('contentArea');
        if (!area) return;
        var old = document.getElementById('sawyanReturnBanner');
        if (old) old.remove();
        if (!returnContext) return;

        var bar = document.createElement('div');
        bar.id = 'sawyanReturnBanner';
        bar.style.cssText = 'position:sticky;top:0;z-index:900;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:white;padding:10px 16px;border-radius:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 6px 20px rgba(15,23,42,0.22);border:2px solid #fbbf24;';
        bar.innerHTML =
            '<div style="font-size:0.86rem;line-height:1.5;">' +
                '<span style="background:#fbbf24;color:#0f172a;padding:2px 8px;border-radius:6px;font-weight:900;margin-left:8px;">' + esc(returnContext.decisionId) + '</span>' +
                '<b>معاينة التنفيذ العملي:</b> ' + esc(returnContext.title) +
                (returnContext.note ? '<div style="font-size:0.76rem;color:#cbd5e1;margin-top:2px;">' + esc(returnContext.note) + '</div>' : '') +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
                '<button id="sawyanBackToLabBtn" style="background:#10b981;color:white;border:none;padding:7px 14px;border-radius:8px;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer;font-size:0.84rem;">🔙 العودة لبطاقة القرار ' + esc(returnContext.decisionId) + '</button>' +
                '<button id="sawyanDismissReturnBtn" style="background:rgba(255,255,255,0.15);color:white;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:0.8rem;">✕</button>' +
            '</div>';
        area.insertBefore(bar, area.firstChild);
        document.getElementById('sawyanBackToLabBtn').onclick = function () {
            var targetId = returnContext.decisionId;
            returnContext = null;
            bar.remove();
            if (typeof window.goAdminPage === 'function') window.goAdminPage('decisionsLab');
            setTimeout(function () {
                var card = document.getElementById('decCard_' + targetId);
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
        };
        document.getElementById('sawyanDismissReturnBtn').onclick = function () {
            returnContext = null;
            bar.remove();
        };
    }

    window.SAWYAN_JUMP_TO = function (cfg) {
        returnContext = cfg || null;
        if (typeof window.goAdminPage === 'function') window.goAdminPage(cfg.page || 'home');
        setTimeout(function () {
            if (cfg.page === 'governanceOps' && cfg.tab && typeof window.govTab === 'function') {
                window.govTab(cfg.tab);
            } else if (cfg.page === 'settings' && cfg.tab && typeof window.scTab === 'function') {
                window.scTab(cfg.tab);
            } else if (cfg.page === 'reports' && cfg.reportType) {
                var sel = document.getElementById('reportType');
                if (sel) { sel.value = cfg.reportType; if (typeof window.generateReport === 'function') window.generateReport(); }
            }
            if (typeof cfg.afterOpen === 'function') cfg.afterOpen();
            renderReturnBanner();
        }, 60);
    };

    /* ---------- نافذة منبثقة موحدة ---------- */
    function openModal(title, bodyHtml, widthPx) {
        closeModal();
        var wrap = document.createElement('div');
        wrap.id = 'sawyanOpsModal';
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.58);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
        wrap.innerHTML =
            '<div style="background:white;width:100%;max-width:' + (widthPx || 720) + 'px;max-height:88vh;overflow-y:auto;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.3);font-family:Tajawal,sans-serif;direction:rtl;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#f8fafc;border-radius:16px 16px 0 0;">' +
                    '<div style="font-weight:900;font-size:1.05rem;color:#0f172a;">' + title + '</div>' +
                    '<button id="sawyanModalClose" style="background:#e2e8f0;border:none;width:32px;height:32px;border-radius:8px;font-weight:900;cursor:pointer;font-size:1rem;">✕</button>' +
                '</div>' +
                '<div id="sawyanModalBody" style="padding:18px;">' + bodyHtml + '</div>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeModal(); });
        document.getElementById('sawyanModalClose').onclick = closeModal;
    }
    function closeModal() {
        var m = document.getElementById('sawyanOpsModal');
        if (m) m.remove();
    }
    window.closeSawyanModal = closeModal;

    /* ============================================================
       الشاشة 2: الأعضاء + KYC + قفل دولة الإقامة + Hold
       ============================================================ */
    var memFilter = { q: '', status: 'all', country: 'all' };
    function ensureMembersToolbar() {
        var page = document.getElementById('membersPage');
        if (!page) return;
        var existing = document.getElementById('memDemoToolbar');
        if (existing) return;
        var div = document.createElement('div');
        div.id = 'memDemoToolbar';
        div.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                badgeProp('KYC (D7) • قفل دولة الإقامة (D9) • تعليق الصرف وتعديل المحفظة (P1-17)') +
                '<div style="font-size:0.78rem;color:#475569;font-weight:700;">الإجمالي الكلي بالمنصة: <b>4,860</b> عضو (4,780 نشط • 23 بانتظار KYC • 57 موقوف — عينة تفاعلية بالأسفل)</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
                '<input id="memSearchInput" type="text" placeholder="🔍 بحث بالاسم، الكود (#124)، الهاتف..." style="flex:2;min-width:210px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif;">' +
                '<select id="memStatusSel" style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif;">' +
                    '<option value="all">كل الحالات</option><option value="pending_kyc">بانتظار KYC</option><option value="hold">محجوب الصرف (Hold)</option><option value="inactive">معطّل</option>' +
                '</select>' +
                '<select id="memCountrySel" style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif;">' +
                    '<option value="all">كل الدول</option><option value="EG">🇪🇬 مصر</option><option value="TR">🇹🇷 تركيا</option>' +
                '</select>' +
            '</div>';
        var tbl = page.querySelector('.table-container');
        page.insertBefore(div, tbl);
        document.getElementById('memSearchInput').oninput = function () { memFilter.q = this.value; renderMembersTable(); };
        document.getElementById('memStatusSel').onchange = function () { memFilter.status = this.value; renderMembersTable(); };
        document.getElementById('memCountrySel').onchange = function () { memFilter.country = this.value; renderMembersTable(); };
    }
    function renderMembersTable() {
        ensureMembersToolbar();
        var tbody = document.getElementById('membersTableBody');
        if (!tbody) return;
        var q = (memFilter.q || '').trim().toLowerCase();
        var list = OPS.members.filter(function (m) {
            if (memFilter.country !== 'all' && m.country !== memFilter.country) return false;
            if (memFilter.status === 'pending_kyc' && m.kyc !== 'pending') return false;
            if (memFilter.status === 'hold' && !m.hold) return false;
            if (memFilter.status === 'inactive' && m.active) return false;
            if (q && (m.name + ' ' + m.code + ' ' + m.phone + ' ' + m.email).toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
        tbody.innerHTML = list.length ? list.map(function (m) {
            var kycLbl = m.kyc === 'verified' ? '<span class="badge badge-success">✅ موثّق</span>' :
                         m.kyc === 'pending' ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:700;">⏳ بانتظار KYC</span>' :
                         '<span class="badge badge-danger">❌ مرفوض</span>';
            var holdBadge = m.hold ? ' <span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:6px;font-size:0.7rem;font-weight:800;">🔒 Hold</span>' : '';
            var moveBadge = m.moveReq ? ' <span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:6px;font-size:0.7rem;font-weight:700;">🌍 طلب نقل إقامة</span>' : '';
            return '<tr>' +
                '<td data-label="كود العضوية"><b>' + esc(m.code) + '</b><div style="font-size:0.72rem;color:#64748b;">' + esc(m.country) + ' • ' + esc(m.treePos.split('(')[0]) + '</div></td>' +
                '<td data-label="الاسم"><b>' + esc(m.name) + '</b>' + holdBadge + moveBadge + '</td>' +
                '<td data-label="البريد الإلكتروني">' + esc(m.email) + '</td>' +
                '<td data-label="الموبايل" style="direction:ltr;text-align:right;">' + esc(m.phone) + '</td>' +
                '<td data-label="تاريخ التسجيل">' + esc(m.joined) + '<div style="margin-top:2px;">' + kycLbl + '</div></td>' +
                '<td data-label="الحالة"><span class="badge ' + (m.active ? 'badge-success' : 'badge-danger') + '">' + (m.active ? 'نشط' : 'معطل') + '</span></td>' +
                '<td data-label="إجراءات" style="display:flex;gap:5px;flex-wrap:wrap;">' +
                    '<button class="btn-sm btn-primary" onclick="opsMemberModal(\'' + m.id + '\')">🪪 ملف / KYC / محفظة</button>' +
                    '<button class="btn-sm btn-warning" onclick="toggleMemberStatus(\'' + m.id + '\',' + (!m.active) + ')">' + (m.active ? 'تعطيل' : 'تفعيل') + '</button>' +
                '</td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="7" class="empty-state">لا يوجد أعضاء مطابقون للفلتر</td></tr>';
    }
    window.loadMembers = async function () { renderMembersTable(); };
    window.toggleMemberStatus = async function (id, newState) {
        var m = OPS.members.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        m.active = !!newState;
        saveOps();
        renderMembersTable();
    };
    window.opsMemberModal = function (id) {
        var m = OPS.members.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        var html =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;">' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:10px;"><div style="font-size:0.75rem;color:#64748b;">الاسم والكود</div><b>' + esc(m.name) + ' (' + esc(m.code) + ')</b></div>' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:10px;"><div style="font-size:0.75rem;color:#64748b;">الموقع والراعي</div><b>' + esc(m.treePos) + '</b><div style="font-size:0.72rem;color:#475569;">الراعي: ' + esc(m.sponsor) + '</div></div>' +
                '<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:10px;border-radius:10px;"><div style="font-size:0.75rem;color:#065f46;">صندوق الهدف (Carry On)</div><b>' + fmt(m.carryUsd) + ' $ / ' + fmt(m.targetUsd) + ' $</b></div>' +
                '<div style="background:#eff6ff;border:1px solid #bfdbfe;padding:10px;border-radius:10px;"><div style="font-size:0.75rem;color:#1e40af;">دولة التسجيل ≠ الجنسية (D9)</div><b>تسجيل: ' + esc(m.country) + ' | جنسية: ' + esc(m.nationality) + '</b></div>' +
            '</div>' +
            '<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:12px;padding:12px;margin-bottom:12px;">' +
                '<div style="font-weight:800;color:#92400e;margin-bottom:6px;">🪪 بوابة مراجعة الهوية والإقامة (KYC — قرار D7 • P1-12)</div>' +
                '<div style="font-size:0.84rem;margin-bottom:8px;">المستند المرفوع: <b>' + esc(m.kycDoc) + '</b> • الحالة: <b>' + esc(m.kyc) + '</b></div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                    '<button onclick="opsMemberKyc(\'' + m.id + '\',\'verified\')" style="background:#059669;color:white;border:none;padding:7px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">✅ اعتماد مستند الإقامة</button>' +
                    '<button onclick="opsMemberKyc(\'' + m.id + '\',\'rejected\')" style="background:#dc2626;color:white;border:none;padding:7px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">❌ رفض مع طلب إعادة الرفع</button>' +
                '</div>' +
            '</div>' +
            (m.moveReq ? '<div style="background:#eff6ff;border:1.5px solid #93c5fd;border-radius:12px;padding:12px;margin-bottom:12px;">' +
                '<div style="font-weight:800;color:#1e40af;margin-bottom:6px;">🌍 طلب تغيير دولة التسجيل/الإقامة (قرار D9)</div>' +
                '<div style="font-size:0.84rem;margin-bottom:8px;">التفاصيل: <b>' + esc(m.moveReq) + '</b></div>' +
                '<button onclick="opsApproveCountryMove(\'' + m.id + '\')" style="background:#1d4ed8;color:white;border:none;padding:7px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">✅ اعتماد نقل عملة القبض لتركيا (TRY)</button>' +
            '</div>' : '') +
            '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;">' +
                '<div style="font-weight:800;color:#0f172a;margin-bottom:6px;">🔒 تعليق الصرف (Hold) والتعديل اليدوي الموثّق (P1-17)</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
                    '<button onclick="opsMemberHold(\'' + m.id + '\')" style="background:' + (m.hold ? '#059669' : '#f59e0b') + ';color:white;border:none;padding:7px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">' + (m.hold ? '🔓 رفع تعليق الصرف' : '⛔ تعليق الصرف مؤقتاً أثناء التحقيق') + '</button>' +
                    '<input id="adjAmt" type="number" step="0.5" placeholder="تعديل يدوي ($)" style="width:130px;padding:7px;border:1px solid #cbd5e1;border-radius:8px;">' +
                    '<input id="adjWhy" type="text" placeholder="السبب الإلزامي (يذهب للاعتماد المزدوج)" style="flex:1;min-width:180px;padding:7px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif;">' +
                    '<button onclick="opsMemberAdjust(\'' + m.id + '\')" style="background:#0f172a;color:white;border:none;padding:7px 12px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">قيد تسوية</button>' +
                '</div>' +
            '</div>';
        openModal('🪪 ملف العضو والرقابة: ' + esc(m.name), html);
    };
    window.opsMemberKyc = function (id, status) {
        var m = OPS.members.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        m.kyc = status;
        if (status === 'verified') {
            OPS.withdrawals.forEach(function (w) { if (w.memberCode === m.code) w.kycOk = true; });
        }
        saveOps(); renderMembersTable(); opsMemberModal(id);
    };
    window.opsApproveCountryMove = function (id) {
        var m = OPS.members.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        m.country = 'TR'; m.residence = 'TR'; m.moveReq = null;
        saveOps(); renderMembersTable(); opsMemberModal(id);
    };
    window.opsMemberHold = function (id) {
        var m = OPS.members.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        m.hold = !m.hold; saveOps(); renderMembersTable(); opsMemberModal(id);
    };
    window.opsMemberAdjust = function (id) {
        var amt = parseFloat((document.getElementById('adjAmt') || {}).value || '0');
        var why = ((document.getElementById('adjWhy') || {}).value || '').trim();
        if (!amt || why.length < 3) { alert('أدخل مبلغ التسوية وسبباً واضحاً (3 أحرف على الأقل).'); return; }
        var m = OPS.members.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        m.earnedUsd = Number((m.earnedUsd + amt).toFixed(2));
        saveOps();
        alert('✅ سُجل قيد تسوية عكسي بمبلغ ' + amt + '$ مع ربطه بسجل التدقيق (السبب: ' + why + ').');
        opsMemberModal(id);
    };
    window.exportMembers = function () {
        downloadCsv('sawyan_members.csv', ['الكود', 'الاسم', 'الدولة', 'KYC', 'CarryOn USD', 'Hold'],
            OPS.members.map(function (m) { return [m.code, m.name, m.country, m.kyc, m.carryUsd, m.hold ? 'نعم' : 'لا']; }));
    };

    /* ============================================================
       الشاشة 3: التجار + مطابقة إشعارات الشحن البنكية (P1-11) + D4/D15
       ============================================================ */
    var merFilter = 'all';
    function ensureMerchantsExtras() {
        var page = document.getElementById('merchantsPage');
        if (!page || document.getElementById('merDemoToolbar')) return;
        var tbl = page.querySelector('.table-container');
        var top = document.createElement('div');
        top.id = 'merDemoToolbar';
        top.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                badgeProp('مطابقة الإشعار البنكي P1-11 • حاسبة 5 خانات • مقارنة 25/10/5% مقابل 500 (D4/D15)') +
                '<div style="font-size:0.78rem;color:#047857;font-weight:800;">إجمالي أرصدة الشحن المسبق بالمنصة: 186,300.00 ج.م (38 تاجراً)</div>' +
            '</div>' +
            '<div id="merFilterBar" class="filter-bar" style="margin-bottom:12px;">' +
                '<button class="filter-btn active" onclick="opsMerFilter(\'all\',this)">الكل</button>' +
                '<button class="filter-btn" onclick="opsMerFilter(\'low_balance\',this)">🔋 رصيد تحت 500 ج.م</button>' +
                '<button class="filter-btn" onclick="opsMerFilter(\'frozen\',this)">⛔ معزول وقائياً (&lt;5%)</button>' +
                '<button class="filter-btn" onclick="opsMerFilter(\'pending_approval\',this)">🏪 طلبات انضمام جديدة</button>' +
            '</div>';
        page.insertBefore(top, tbl);

        var bankBox = document.createElement('div');
        bankBox.id = 'merBankSlipsBox';
        bankBox.style.marginTop = '18px';
        page.appendChild(bankBox);
    }
    window.opsMerFilter = function (f, btn) {
        merFilter = f;
        document.querySelectorAll('#merFilterBar .filter-btn').forEach(function (b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        renderMerchantsPage();
    };
    function renderMerchantsPage() {
        ensureMerchantsExtras();
        var tbody = document.getElementById('merchantsTableBody');
        if (!tbody) return;
        var list = OPS.merchants.filter(function (m) { return merFilter === 'all' || m.status === merFilter; });
        tbody.innerHTML = list.map(function (m) {
            var stBadge = m.status === 'active' ? '<span class="badge badge-success">🟢 نشط بالرادار</span>' :
                          m.status === 'low_balance' ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:800;">🔋 رصيد منخفض (&lt;500)</span>' :
                          m.status === 'frozen' ? '<span class="badge badge-danger">⛔ معزول وقائياً</span>' :
                          '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:800;">⏳ بانتظار الاعتماد</span>';
            var pctLeft = m.packageLimit ? Math.round((m.prepaidBalance / m.packageLimit) * 100) : 0;
            var cur = m.country === 'TR' ? 'ليرة' : 'ج.م';
            var salesCap = m.commPct ? m.prepaidBalance / (m.commPct / 100) : 0;
            return '<tr>' +
                '<td data-label="كود التاجر"><b>' + esc(m.code) + '</b><div style="font-size:0.7rem;color:#64748b;">' + esc(m.country) + '</div></td>' +
                '<td data-label="اسم النشاط"><b>' + esc(m.name) + '</b><div style="font-size:0.72rem;color:#64748b;">مبيعات الشهر: ' + fmt(m.gmvMtd) + ' ' + cur + ' (' + m.opsMtd + ' عملية)</div></td>' +
                '<td data-label="النوع">' + (m.type === 'physical' ? 'محل فعلي' : m.type === 'online' ? 'أونلاين' : 'كلاهما') + '</td>' +
                '<td data-label="الفئة">' + esc(m.category) + '</td>' +
                '<td data-label="النسبة %"><b>' + m.commPct + '%</b> <span style="font-size:0.72rem;color:#059669;">(أعضاء ' + (m.commPct * m.planSharePct / 100).toFixed(1) + '%)</span></td>' +
                '<td data-label="المستحقات"><b style="color:' + (m.prepaidBalance < 500 ? '#dc2626' : '#059669') + ';">' + fmt(m.prepaidBalance) + ' ' + cur + '</b><div style="font-size:0.7rem;color:#64748b;">متبقي ' + pctLeft + '% • سعة ' + fmt0(Math.round(salesCap)) + '</div></td>' +
                '<td data-label="الحالة">' + stBadge + '</td>' +
                '<td data-label="إجراءات" style="display:flex;gap:5px;flex-wrap:wrap;">' +
                    '<button class="btn-sm btn-primary" onclick="opsMerchantModal(\'' + m.id + '\')">' + (m.status === 'pending_approval' ? '📋 مراجعة واعتماد' : '🧮 الحاسبة / الشحن') + '</button>' +
                '</td>' +
            '</tr>';
        }).join('');

        var box = document.getElementById('merBankSlipsBox');
        if (box) {
            var pendingSlips = OPS.bankSlips.filter(function (s) { return s.status === 'pending'; }).length;
            box.innerHTML =
                '<div style="background:white;border:2px solid #3b82f6;border-radius:14px;padding:16px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                        '<div><h3 style="margin:0;color:#1e3a8a;font-size:1.02rem;">🏦 طابور مطابقة إشعارات التحويل البنكي لشحن التجار (P1-11)</h3><div style="font-size:0.76rem;color:#64748b;">لا يُضاف الرصيد تلقائياً عند رفع الإيصال حتى يطابقه المالي بالبنك</div></div>' +
                        badgeProp('بانتظار المطابقة: ' + pendingSlips) +
                    '</div>' +
                    OPS.bankSlips.map(function (s) {
                        var done = s.status !== 'pending';
                        return '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;border:1px solid ' + (done ? '#d1fae5' : '#bfdbfe') + ';background:' + (done ? '#f0fdf4' : '#f8fafc') + ';border-radius:10px;margin-bottom:8px;">' +
                            '<div><b>' + esc(s.merchantName) + '</b> • مبلغ: <b style="color:#059669;">' + fmt(s.amount) + ' ج.م</b><div style="font-size:0.76rem;color:#475569;">المرجع: <code>' + esc(s.ref) + '</code> • الوسيلة: ' + esc(s.method) + ' • ' + esc(s.at) + '</div></div>' +
                            (s.status === 'pending'
                                ? '<div style="display:flex;gap:6px;"><button class="btn-sm btn-primary" onclick="opsBankSlip(\'' + s.id + '\',\'approved\')">✅ مطابقة واعتماد الشحن</button><button class="btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="opsBankSlip(\'' + s.id + '\',\'rejected\')">❌ رفض</button></div>'
                                : '<span class="badge ' + (s.status === 'approved' ? 'badge-success' : 'badge-danger') + '">' + (s.status === 'approved' ? '✅ تم التحصيل وإضافة الرصيد' : '❌ مرفوض') + '</span>') +
                        '</div>';
                    }).join('') +
                '</div>';
        }
    }
    window.loadMerchants = async function () { renderMerchantsPage(); };
    window.opsBankSlip = function (slipId, act) {
        var s = OPS.bankSlips.filter(function (x) { return x.id === slipId; })[0];
        if (!s || s.status !== 'pending') return;
        s.status = act;
        if (act === 'approved') {
            var m = OPS.merchants.filter(function (x) { return x.id === s.merchantId; })[0];
            if (m) {
                m.prepaidBalance += s.amount;
                if (m.prepaidBalance >= 500 && m.prepaidBalance > m.packageLimit * 0.05) m.status = 'active';
            }
        }
        saveOps(); renderMerchantsPage();
    };
    window.opsMerchantModal = function (id) {
        var m = OPS.merchants.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        var memPct = (m.commPct * m.planSharePct / 100).toFixed(2);
        var trPct = (m.commPct * (100 - m.planSharePct) / 100).toFixed(2);
        var html =
            '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin-bottom:12px;">' +
                '<div style="font-weight:800;margin-bottom:8px;">🧮 بطاقة حاسبة النسب ذات الـ 5 خانات (الوركفلو 2)</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:0.84rem;">' +
                    '<div style="background:white;padding:8px;border-radius:8px;border:1px solid #e2e8f0;"><div style="font-size:0.72rem;color:#64748b;">1. العمولة العامة (مدخل)</div><b>' + m.commPct + '%</b></div>' +
                    '<div style="background:white;padding:8px;border-radius:8px;border:1px solid #e2e8f0;"><div style="font-size:0.72rem;color:#64748b;">2. خطة الدخل من العمولة</div><b>' + m.planSharePct + '%</b></div>' +
                    '<div style="background:#f1f5f9;padding:8px;border-radius:8px;"><div style="font-size:0.72rem;color:#64748b;">3. الخزانة من العمولة (مشتق)</div><b>' + (100 - m.planSharePct) + '%</b></div>' +
                    '<div style="background:#ecfdf5;padding:8px;border-radius:8px;border:1px solid #6ee7b7;"><div style="font-size:0.72rem;color:#065f46;">4. المعلن للأعضاء</div><b>' + memPct + '%</b></div>' +
                    '<div style="background:#eff6ff;padding:8px;border-radius:8px;"><div style="font-size:0.72rem;color:#1e40af;">5. نصيب الخزانة الصافي</div><b>' + trPct + '%</b></div>' +
                '</div>' +
            '</div>' +
            (m.docsNote ? '<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:10px;margin-bottom:12px;font-size:0.84rem;"><b>📄 المستندات المرفقة:</b> ' + esc(m.docsNote) + '</div>' : '') +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
                (m.status === 'pending_approval'
                    ? '<button onclick="opsMerAction(\'' + m.id + '\',\'approve_new\')" style="background:#059669;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">✅ اعتماد التاجر وتفعيل ظهوره بالرادار</button>'
                    : '<button onclick="opsMerAction(\'' + m.id + '\',\'toggle_freeze\')" style="background:' + (m.status === 'frozen' ? '#059669' : '#dc2626') + ';color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">' + (m.status === 'frozen' ? '🔓 فك العزل وتنشيط المتجر' : '⛔ عزل وقائي من الرادار') + '</button>') +
                '<button onclick="opsMerAction(\'' + m.id + '\',\'topup1000\')" style="background:#1d4ed8;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">➕ شحن تجريبي +1,000</button>' +
            '</div>';
        openModal('🏪 ملف التاجر: ' + esc(m.name), html);
    };
    window.opsMerAction = function (id, act) {
        var m = OPS.merchants.filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        if (act === 'approve_new') { m.status = 'active'; m.prepaidBalance = m.packageLimit || 5000; }
        if (act === 'toggle_freeze') { m.status = (m.status === 'frozen' ? 'active' : 'frozen'); }
        if (act === 'topup1000') { m.prepaidBalance += 1000; if (m.prepaidBalance >= 500) m.status = 'active'; }
        saveOps(); renderMerchantsPage(); opsMerchantModal(id);
    };
    window.exportMerchants = function () {
        downloadCsv('sawyan_merchants.csv', ['الكود', 'الاسم', 'الدولة', 'النسبة%', 'رصيد الشحن', 'الحالة'],
            OPS.merchants.map(function (m) { return [m.code, m.name, m.country, m.commPct, m.prepaidBalance, m.status]; }));
    };

    /* ============================================================
       الشاشة 4: العمليات + حسم المعلق (D6) + استرداد عكسي (Clawback D5)
       ============================================================ */
    var txnFilter = 'all';
    function ensureTxnToolbar() {
        var page = document.getElementById('transactionsPage');
        if (!page || document.getElementById('txnDemoToolbar')) return;
        var tbl = page.querySelector('.table-container');
        var hdr = page.querySelector('thead tr');
        if (hdr && hdr.children.length === 7) {
            var th = document.createElement('th'); th.textContent = 'إجراءات رقابية'; hdr.appendChild(th);
        }
        var d = document.createElement('div');
        d.id = 'txnDemoToolbar';
        d.innerHTML =
            '<div style="margin-bottom:8px;">' + badgeProp('حسم المعلق بعد 48س (D6) • محاكي الاسترداد العكسي بعد الصرف (D5) • كشف التكرار (M11)') + '</div>' +
            '<div id="txnFilterBar" class="filter-bar" style="margin-bottom:12px;">' +
                '<button class="filter-btn active" onclick="opsTxnFilter(\'all\',this)">الكل</button>' +
                '<button class="filter-btn" onclick="opsTxnFilter(\'escalated\',this)">⏰ معلقة &gt;48س (D6)</button>' +
                '<button class="filter-btn" onclick="opsTxnFilter(\'flagged_dup\',this)">⚠️ اشتباه تكرار</button>' +
                '<button class="filter-btn" onclick="opsTxnFilter(\'refunded\',this)">↩️ مستردة عكسياً</button>' +
            '</div>';
        page.insertBefore(d, tbl);
    }
    window.opsTxnFilter = function (f, btn) {
        txnFilter = f;
        document.querySelectorAll('#txnFilterBar .filter-btn').forEach(function (b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');
        renderTxnTable();
    };
    function renderTxnTable() {
        ensureTxnToolbar();
        var tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;
        var list = OPS.transactions.filter(function (t) { return txnFilter === 'all' || t.status === txnFilter; });
        tbody.innerHTML = list.map(function (t) {
            var st = t.status === 'completed' ? '<span class="badge badge-success">مكتملة</span>' :
                     t.status === 'escalated' ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:800;">⏰ متصاعدة (&gt;48س)</span>' :
                     t.status === 'flagged_dup' ? '<span class="badge badge-danger">🚨 اشتباه تكرار</span>' :
                     '<span style="background:#e2e8f0;color:#334155;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:800;">↩️ مستردة عكسياً</span>';
            var actBtn = t.status === 'completed'
                ? '<button class="btn-sm btn-warning" onclick="opsClawbackModal(\'' + t.id + '\')">↩️ محاكاة/تنفيذ استرداد (D5)</button>'
                : (t.status === 'escalated' || t.status === 'flagged_dup')
                ? '<button class="btn-sm btn-primary" onclick="opsEscalatedModal(\'' + t.id + '\')">⚖️ حسم إداري (D6)</button>'
                : '<span style="font-size:0.74rem;color:#64748b;">تم القيد العكسي</span>';
            return '<tr>' +
                '<td data-label="كود العملية"><b>' + esc(t.id) + '</b><div style="font-size:0.7rem;color:#64748b;">' + esc(t.route) + '</div></td>' +
                '<td data-label="العضو">' + esc(t.memberName) + ' (' + esc(t.memberCode) + ')</td>' +
                '<td data-label="التاجر">' + esc(t.merchantName) + '</td>' +
                '<td data-label="المبلغ">' + fmt(t.amount) + ' ج.م</td>' +
                '<td data-label="العمولة">' + fmt(t.commAmt) + ' ج.م (' + t.commPct + '%)</td>' +
                '<td data-label="التاريخ">' + esc(t.date) + '<div style="font-size:0.7rem;color:#64748b;">' + esc(t.payoutMonth) + '</div></td>' +
                '<td data-label="الحالة">' + st + '</td>' +
                '<td data-label="إجراءات">' + actBtn + '</td>' +
            '</tr>';
        }).join('');
    }
    window.loadTransactions = async function () { renderTxnTable(); };
    window.opsEscalatedModal = function (id) {
        var t = OPS.transactions.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        openModal('⚖️ حسم عملية معلقة/مشبوهة: ' + esc(t.id),
            '<p style="font-size:0.88rem;line-height:1.7;"><b>السبب:</b> ' + esc(t.note) + '<br><b>القيمة:</b> ' + fmt(t.amount) + ' ج.م • <b>العمولة:</b> ' + fmt(t.commAmt) + ' ج.م</p>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button onclick="opsTxnResolve(\'' + t.id + '\',\'completed\')" style="background:#059669;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">✅ اعتماد الفاتورة وقيد العمولة</button>' +
                '<button onclick="opsTxnResolve(\'' + t.id + '\',\'refunded\')" style="background:#dc2626;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">❌ رفض/إلغاء مع إشعار العضو</button>' +
            '</div>');
    };
    window.opsTxnResolve = function (id, st) {
        var t = OPS.transactions.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        t.status = st; saveOps(); closeModal(); renderTxnTable();
    };
    window.opsClawbackModal = function (id) {
        var t = OPS.transactions.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        var planAmt = t.commAmt * 0.75;
        var postPayout = t.payoutMonth.indexOf('مصروف') !== -1;
        openModal('↩️ محاكي وتنفيذ الاسترداد العكسي (Clawback — قرار D5)',
            '<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:12px;margin-bottom:12px;font-size:0.86rem;line-height:1.75;">' +
                '<b>الفاتورة:</b> ' + esc(t.id) + ' (' + fmt(t.amount) + ' ج.م • حصة خطة الدخل: ' + fmt(planAmt) + ' ج.م)<br>' +
                '<b>حالة الشهر:</b> ' + esc(t.payoutMonth) + '<br>' +
                (postPayout
                    ? '<b>⚠️ تنبيه حرج (بعد صرف يوم 10):</b> هذه الفاتورة ضمن شهر تم إغلاقه وصرف عمولاته للأبلاينز!<br>• الخيار أ: يُقيّد رصيد سالب على المستفيدين + سحب من حساب الاحتياطي (Reserve) + رد العمولة (' + fmt(t.commAmt) + ' ج.م) لرصيد التاجر.<br>• الخيار ب: إغلاق الاسترداد الآلي بعد يوم 10 والتسوية خارج المنصة.'
                    : '<b>✅ داخل الشهر المفتوح:</b> يُعكس القيد فوراً، وتعود العمولة (' + fmt(t.commAmt) + ' ج.م) للتاجر، ويُنقص صندوق الهدف للعضو بمقدار ' + fmt(planAmt) + ' ج.م مع إرسال تنبيه تلقائي بالمتبقي.') +
            '</div>' +
            '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin-bottom:12px;font-size:0.82rem;">' +
                '<b>📩 مسودة إشعار العضو:</b> "تم إلغاء الفاتورة ' + esc(t.id) + ' بمبلغ ' + fmt(t.amount) + ' ج.م، وانخفض صندوق هدفك بمقدار ' + fmt(planAmt) + ' ج.م (' + fmt(planAmt / t.fx) + '$)."' +
            '</div>' +
            '<button onclick="opsTxnResolve(\'' + t.id + '\',\'refunded\')" style="background:#dc2626;color:white;border:none;padding:9px 18px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">↩️ تنفيذ القيد العكسي الموثق</button>');
    };
    window.exportTransactions = function () {
        downloadCsv('sawyan_transactions.csv', ['الكود', 'العضو', 'التاجر', 'المبلغ', 'العمولة', 'التاريخ', 'الحالة'],
            OPS.transactions.map(function (t) { return [t.id, t.memberName, t.merchantName, t.amount, t.commAmt, t.date, t.status]; }));
    };

    /* ============================================================
       الشاشة 5: العمولات + صندوق الستوبر المالي المعلّق (D14)
       ============================================================ */
    window.loadCommissions = async function () {
        var c1 = document.getElementById('totalCommissionsAmount');
        var c2 = document.getElementById('monthCommissions');
        if (c1) c1.textContent = '128,460.00 ج.م';
        if (c2) c2.textContent = '128,460.00 ج.م';
        var tbody = document.getElementById('commissionsTableBody');
        if (tbody) {
            tbody.innerHTML = OPS.merchants.filter(function (m) { return m.gmvMtd > 0; }).map(function (m) {
                var comm = m.gmvMtd * (m.commPct / 100);
                var tr = comm * 0.25, pl = comm * 0.75;
                var cur = m.country === 'TR' ? 'ليرة' : 'ج.م';
                return '<tr>' +
                    '<td data-label="التاجر"><b>' + esc(m.name) + '</b> (' + esc(m.code) + ')</td>' +
                    '<td data-label="إجمالي العمليات">' + m.opsMtd + '</td>' +
                    '<td data-label="إجمالي المبيعات">' + fmt(m.gmvMtd) + ' ' + cur + '</td>' +
                    '<td data-label="إجمالي العمولات"><b>' + fmt(comm) + ' ' + cur + '</b><div style="font-size:0.72rem;color:#64748b;">خزانة: ' + fmt(tr) + ' • خطة: ' + fmt(pl) + '</div></td>' +
                    '<td data-label="النسبة %">' + m.commPct + '%</td>' +
                '</tr>';
            }).join('');
        }
        var page = document.getElementById('commissionsPage');
        if (page && !document.getElementById('commStopperFundSlot')) {
            var slot = document.createElement('div');
            slot.id = 'commStopperFundSlot';
            slot.style.marginTop = '18px';
            page.appendChild(slot);
        }
        var slotEl = document.getElementById('commStopperFundSlot');
        if (slotEl) {
            slotEl.innerHTML =
                '<div style="background:white;border:2px solid #f59e0b;border-radius:14px;padding:16px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                        '<div><h3 style="margin:0;color:#92400e;">🪙 صندوق عمولات الستوبر المالي المعلّق وسجل الـ Roll-up (D14 • P1-14)</h3><div style="font-size:0.78rem;color:#64748b;">المبالغ المتجاوزة للحد الشهري لا تُصرف ولا تُعاد توزيعها إلا بقرار مزدوج موثق</div></div>' +
                        badgeProp('قرار D14') +
                    '</div>' +
                    OPS.stopperFundDecisions.map(function (f) {
                        return '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px;">' +
                            '<div><b>' + esc(f.memberName) + ' (' + esc(f.memberCode) + ')</b> — شهر ' + esc(f.month) + ' • الفائض المحتجز: <b style="color:#b45309;">' + fmt(f.excessUsd) + ' $</b><div style="font-size:0.76rem;color:#475569;">المصدر: ' + esc(f.sources) + ' • الحالة: ' + esc(f.note) + '</div></div>' +
                            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                                '<button class="btn-sm btn-primary" onclick="opsStopperDecide(\'' + f.id + '\',\'اعتماد ترحيل لاحتياطي التوازن\')">⚖️ قرار إداري (ترحيل/صرف)</button>' +
                                '<button class="btn-sm btn-warning" onclick="opsRollupTraceModal()">📜 سجل تتبع Roll-up</button>' +
                            '</div>' +
                        '</div>';
                    }).join('') +
                '</div>';
        }
    };
    window.opsStopperDecide = function (id, choice) {
        var f = OPS.stopperFundDecisions.filter(function (x) { return x.id === id; })[0];
        if (!f) return;
        f.status = 'decided'; f.note = 'تم القرار: ' + choice + ' (' + nowStr() + ')';
        saveOps(); loadCommissions();
    };
    window.opsRollupTraceModal = function () {
        openModal('📜 سجل تتبع الـ Roll-up وإعادة توزيع المتبقي',
            '<table class="data-table"><thead><tr><th>العملية</th><th>صانع التوزيع</th><th>المستفيد المتجاوَز</th><th>السبب</th><th>المستفيد البديل</th><th>الحصة ($)</th></tr></thead><tbody>' +
            '<tr><td>POOL-812</td><td>خالد حسن (#125)</td><td>منى علي (#210)</td><td>غير مؤهلة في مصر (8.10$/24.75$)</td><td>أحمد مصطفى (#124)</td><td>2.25 $</td></tr>' +
            '<tr><td>POOL-813</td><td>يوسف كمال (#318)</td><td>خالد حسن (#125) في تركيا</td><td>غير مؤهل في تركيا (لا شراء/لا تعويض)</td><td>محمد دمير (#101)</td><td>2.25 $ + 1.125 $ متبقي</td></tr>' +
            '</tbody></table>');
    };
    window.exportCommissions = function () {
        downloadCsv('sawyan_commissions.csv', ['التاجر', 'العمليات', 'المبيعات', 'العمولات', 'خزانة25%', 'خطة75%'],
            OPS.merchants.filter(function (m) { return m.gmvMtd > 0; }).map(function (m) {
                var c = m.gmvMtd * m.commPct / 100; return [m.name, m.opsMtd, m.gmvMtd, c, c * 0.25, c * 0.75];
            }));
    };

    /* ============================================================
       الشاشة 6: الشكاوى والنزاعات مع مهل SLA (P1-16)
       ============================================================ */
    window.loadDisputes = async function () {
        var tbody = document.getElementById('disputesTableBody');
        if (!tbody) return;
        tbody.innerHTML = OPS.disputes.map(function (d) {
            var sla = d.status === 'pending'
                ? '<span style="background:' + (d.slaHoursLeft <= 6 ? '#fee2e2;color:#991b1b' : '#fef3c7;color:#92400e') + ';padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;">⏱ متبقي ' + d.slaHoursLeft + 'س (SLA)</span>'
                : '<span class="badge badge-success">محلولة</span>';
            return '<tr>' +
                '<td data-label="كود الشكوى"><b>' + esc(d.id) + '</b></td>' +
                '<td data-label="العملية">' + esc(d.txn) + '</td>' +
                '<td data-label="العضو">' + esc(d.member) + '</td>' +
                '<td data-label="التاجر">' + esc(d.merchant) + '</td>' +
                '<td data-label="السبب">' + esc(d.reason) + (d.resolution ? '<div style="font-size:0.74rem;color:#059669;">القرار: ' + esc(d.resolution) + '</div>' : '') + '</td>' +
                '<td data-label="التاريخ">' + sla + '</td>' +
                '<td data-label="الحالة"><span class="badge ' + (d.status === 'resolved' ? 'badge-success' : 'badge-warning') + '">' + (d.status === 'resolved' ? 'محلولة' : 'قيد المعالجة') + '</span></td>' +
                '<td data-label="إجراءات"><button class="btn-sm btn-primary" onclick="opsDisputeModal(\'' + d.id + '\')">' + (d.status === 'pending' ? '⚖️ تحكيم النزاع' : 'عرض') + '</button></td>' +
            '</tr>';
        }).join('');
    };
    window.opsDisputeModal = function (id) {
        var d = OPS.disputes.filter(function (x) { return x.id === id; })[0];
        if (!d) return;
        openModal('⚖️ تحكيم النزاع: ' + esc(d.id),
            '<p style="font-size:0.88rem;line-height:1.7;"><b>العملية:</b> ' + esc(d.txn) + ' • <b>العضو:</b> ' + esc(d.member) + ' • <b>التاجر:</b> ' + esc(d.merchant) + '<br><b>السبب:</b> ' + esc(d.reason) + '</p>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button onclick="opsDisputeResolve(\'' + d.id + '\',\'اعتماد الفارق لصالح العضو وتعديل الفاتورة\')" style="background:#059669;color:white;border:none;padding:8px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">✅ لصالح العضو</button>' +
                '<button onclick="opsDisputeResolve(\'' + d.id + '\',\'تأييد سجل التاجر وحفظ الشكوى\')" style="background:#1d4ed8;color:white;border:none;padding:8px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">🏪 لصالح التاجر</button>' +
            '</div>');
    };
    window.opsDisputeResolve = function (id, res) {
        var d = OPS.disputes.filter(function (x) { return x.id === id; })[0];
        if (!d) return;
        d.status = 'resolved'; d.resolution = res; saveOps(); closeModal(); loadDisputes();
    };
    window.exportDisputes = function () {
        downloadCsv('sawyan_disputes.csv', ['الكود', 'العملية', 'العضو', 'التاجر', 'السبب', 'الحالة'],
            OPS.disputes.map(function (d) { return [d.id, d.txn, d.member, d.merchant, d.reason, d.status]; }));
    };

    /* ============================================================
       الشاشة 7: الدعم الفني (9 تذاكر حية مطابقة للرئيسية)
       ============================================================ */
    window.loadSupport = async function () {
        var page = document.getElementById('supportPage');
        if (!page) return;
        var openCount = OPS.tickets.filter(function (t) { return t.status !== 'closed'; }).length;
        var progCount = OPS.tickets.filter(function (t) { return t.status === 'in_progress'; }).length;
        var closedCount = OPS.tickets.filter(function (t) { return t.status === 'closed'; }).length;
        page.innerHTML =
            '<div class="page-header"><h2>🎫 طلبات الدعم الفني</h2><button class="btn btn-primary" onclick="exportSupport()">📥 تصدير CSV</button></div>' +
            '<div class="support-stats-grid" style="margin-bottom:16px;">' +
                '<div class="support-stat-card"><span class="stat-value" id="openTickets">' + openCount + '</span><span class="stat-label">تذاكر مفتوحة (تطابق الرئيسية)</span></div>' +
                '<div class="support-stat-card"><span class="stat-value" id="pendingTickets">' + progCount + '</span><span class="stat-label">قيد المعالجة</span></div>' +
                '<div class="support-stat-card"><span class="stat-value" id="closedTickets">' + closedCount + '</span><span class="stat-label">مغلقة في الجلسة</span></div>' +
            '</div>' +
            '<div class="table-container"><table class="data-table"><thead><tr><th>التذكرة</th><th>المستخدم</th><th>النوع</th><th>الموضوع</th><th>الأولوية</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>' +
            OPS.tickets.map(function (t) {
                return '<tr>' +
                    '<td data-label="التذكرة"><b>' + esc(t.id) + '</b></td>' +
                    '<td data-label="المستخدم">' + esc(t.user) + '</td>' +
                    '<td data-label="النوع">' + (t.type === 'member' ? 'عضو' : 'تاجر') + '</td>' +
                    '<td data-label="الموضوع">' + esc(t.subject) + (t.reply ? '<div style="font-size:0.74rem;color:#059669;">💬 الرد: ' + esc(t.reply) + '</div>' : '') + '</td>' +
                    '<td data-label="الأولوية">' + (t.priority === 'high' ? '🔴 عالية' : t.priority === 'medium' ? '🟡 متوسطة' : '🟢 منخفضة') + '</td>' +
                    '<td data-label="الحالة"><span class="badge ' + (t.status === 'closed' ? 'badge-success' : 'badge-danger') + '">' + (t.status === 'closed' ? 'مغلقة' : t.status === 'in_progress' ? 'قيد المعالجة' : 'مفتوحة') + '</span></td>' +
                    '<td data-label="إجراء"><button class="btn-sm btn-primary" onclick="opsTicketReply(\'' + t.id + '\')">💬 رد / إغلاق</button></td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>';
    };
    window.opsTicketReply = function (id) {
        var t = OPS.tickets.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        openModal('🎫 التذكرة ' + esc(t.id),
            '<p style="font-size:0.86rem;"><b>من:</b> ' + esc(t.user) + '<br><b>الموضوع:</b> ' + esc(t.subject) + '</p>' +
            '<textarea id="tktReplyBox" rows="3" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif;margin-bottom:10px;" placeholder="اكتب رد فريق الدعم...">' + esc(t.reply) + '</textarea>' +
            '<div style="display:flex;gap:8px;"><button onclick="opsTicketSave(\'' + t.id + '\',\'closed\')" style="background:#059669;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">✅ إرسال الرد وإغلاق</button>' +
            '<button onclick="opsTicketSave(\'' + t.id + '\',\'in_progress\')" style="background:#1d4ed8;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">💾 حفظ قيد المتابعة</button></div>');
    };
    window.opsTicketSave = function (id, st) {
        var t = OPS.tickets.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        t.reply = (document.getElementById('tktReplyBox') || {}).value || 'تمت المعالجة';
        t.status = st; saveOps(); closeModal(); loadSupport();
    };
    window.exportSupport = function () {
        downloadCsv('sawyan_support_tickets.csv', ['التذكرة', 'المستخدم', 'النوع', 'الموضوع', 'الحالة'],
            OPS.tickets.map(function (t) { return [t.id, t.user, t.type, t.subject, t.status]; }));
    };

    /* ============================================================
       الشاشة 8: طلبات السحب (KYC + تهدئة 72س + رسوم W06 + اعتماد مزدوج W05)
       ============================================================ */
    var wdFilter = 'all';
    window.filterWithdrawals = function (status, btn) {
        wdFilter = status || 'all';
        renderWithdrawals();
    };
    function renderWithdrawals() {
        var page = document.getElementById('withdrawalsContent');
        if (!page) return;
        var list = OPS.withdrawals.filter(function (w) { return wdFilter === 'all' || w.status === wdFilter; });
        page.innerHTML =
            '<div class="withdrawals-admin-page">' +
                '<div style="margin-bottom:10px;">' + badgeProp('بوابة KYC (D7) • تهدئة تغيير الحساب 72س (W07) • تفصيل الرسوم والضرائب (D17/D19) • اعتماد مزدوج >200$ (W05)') + '</div>' +
                '<div class="filter-bar">' +
                    ['all', 'pending', 'approved', 'rejected'].map(function (k) {
                        var lbl = k === 'all' ? 'الكل (' + OPS.withdrawals.length + ')' : k === 'pending' ? 'معلقة' : k === 'approved' ? 'مقبولة' : 'مرفوضة';
                        return '<button class="filter-btn' + (wdFilter === k ? ' active' : '') + '" onclick="filterWithdrawals(\'' + k + '\',this)">' + lbl + '</button>';
                    }).join('') +
                '</div>' +
                '<div class="withdrawals-list">' +
                list.map(function (w) {
                    var grossLocal = w.usdAmount * w.fxUsed;
                    var feeLocal = grossLocal * (w.feePct / 100);
                    var netLocal = grossLocal - feeLocal;
                    var blocked = !w.kycOk || w.cooldownHoursLeft > 0;
                    var stLbl = w.status === 'pending' ? 'قيد المراجعة' : w.status === 'approved' ? 'تم القبول والتحويل' : 'مرفوضة (أُعيدت للمحفظة)';
                    var guards =
                        '<span style="font-size:0.74rem;padding:2px 8px;border-radius:6px;font-weight:700;background:' + (w.kycOk ? '#dcfce7;color:#166534' : '#fee2e2;color:#991b1b') + ';">' + (w.kycOk ? '✅ KYC معتمد' : '⛔ بانتظار KYC (D7)') + '</span> ' +
                        (w.cooldownHoursLeft > 0 ? '<span style="font-size:0.74rem;padding:2px 8px;border-radius:6px;font-weight:700;background:#fee2e2;color:#991b1b;">⏳ تهدئة تغيير حساب: متبقي ' + w.cooldownHoursLeft + 'س (W07)</span> ' : '') +
                        (w.dualRequired ? '<span style="font-size:0.74rem;padding:2px 8px;border-radius:6px;font-weight:700;background:#dbeafe;color:#1e40af;">🔐 يتطلب اعتماداً مزدوجاً (&gt;200$ W05)</span>' : '');
                    return '<div class="withdrawal-card status-' + esc(w.status) + '">' +
                        '<div class="withdrawal-header">' +
                            '<span class="withdrawal-amount">' + fmt(w.usdAmount) + ' $ ⬅️ صافي ' + fmt(netLocal) + ' ج.م</span>' +
                            '<span class="withdrawal-status status-' + esc(w.status) + '">' + stLbl + '</span>' +
                        '</div>' +
                        '<div class="withdrawal-details">' +
                            '<p><strong>العضو:</strong> ' + esc(w.memberName) + ' (' + esc(w.memberCode) + ') • <strong>الوسيلة:</strong> ' + esc(w.method) + ' • <code>' + esc(w.account) + '</code></p>' +
                            '<p><strong>تفكيك التحويل (D8/D17):</strong> ' + fmt(w.usdAmount) + '$ × سعر شهر الاستحقاق <b>' + w.fxUsed + '</b> = ' + fmt(grossLocal) + ' ج.م − رسوم تحويل (' + w.feePct + '%): <b>' + fmt(feeLocal) + ' ج.م</b> = <b>' + fmt(netLocal) + ' ج.م</b></p>' +
                            '<p style="margin-top:6px;">' + guards + '</p>' +
                            '<p style="font-size:0.78rem;color:#64748b;">' + esc(w.note) + '</p>' +
                        '</div>' +
                        (w.status === 'pending'
                            ? '<div class="withdrawal-actions">' +
                                '<button class="btn-approve" ' + (blocked ? 'disabled style="opacity:0.45;cursor:not-allowed;" title="محجوب بالضوابط"' : '') + ' onclick="opsWdApprove(\'' + w.id + '\')">' + (w.dualRequired && !w.checker1Approved ? '1️⃣ اعتماد أول (ينتظر الثانٍ)' : '✅ قبول وتنفيذ التحويل') + '</button>' +
                                '<button class="btn-reject" onclick="opsWdReject(\'' + w.id + '\')">❌ رفض وإرجاع للمحفظة</button>' +
                              '</div>'
                            : '') +
                    '</div>';
                }).join('') +
                '</div>' +
            '</div>';
    }
    window.loadWithdrawals = async function () { renderWithdrawals(); };
    window.opsWdApprove = function (id) {
        var w = OPS.withdrawals.filter(function (x) { return x.id === id; })[0];
        if (!w || !w.kycOk || w.cooldownHoursLeft > 0) return;
        if (w.dualRequired && !w.checker1Approved) {
            w.checker1Approved = true;
            w.note = 'تم الاعتماد الأول — بانتظار المعتمد الثاني (Maker-Checker W05)';
            saveOps(); renderWithdrawals(); return;
        }
        w.status = 'approved'; w.note = 'تم التحويل والمصادقة (' + nowStr() + ')';
        saveOps(); renderWithdrawals();
    };
    window.opsWdReject = function (id) {
        var w = OPS.withdrawals.filter(function (x) { return x.id === id; })[0];
        if (!w) return;
        w.status = 'rejected'; w.note = 'مرفوض — أُعيد الرصيد كاملاً للمحفظة المتاحة';
        saveOps(); renderWithdrawals();
    };

    /* ============================================================
       الشاشة 9: منظومة التقارير الرسمية الستة (Reports)
       ============================================================ */
    var OFFICIAL_REPORTS = {
        tree: {
            title: '1. تقرير الشجرة الشامل (الراعي، الأب، الذراع، والجيل المزدوج)',
            headers: ['الكود', 'العضو', 'الدولة', 'الراعي الحقيقي (Sponsor)', 'الأب بالتسكين (Parent)', 'الذراع', 'الجيل المزدوج (Me/Com)'],
            rows: [
                ['#101', 'محمد دمير', 'EG', '#0 (الشركة)', '#0 (الشركة)', 'يمين', '1Me / 2Com'],
                ['#124', 'أحمد مصطفى', 'EG', '#101 (محمد دمير)', '#101', 'يمين', '2Me / 3Com'],
                ['#125', 'خالد حسن', 'EG', '#101 (محمد دمير)', '#101', 'يسار', '2Me / 3Com'],
                ['#210', 'منى علي', 'EG', '#124 (أحمد مصطفى)', '#124', 'يمين', '3Me / 4Com'],
                ['#318', 'يوسف كمال', 'TR', '#125 (خالد حسن)', '#125', 'يسار', '3Me / 4Com']
            ]
        },
        carryon: {
            title: '2. تقرير التأهل الشهري وصناديق الـ Carry On لكل دولة',
            headers: ['العضو', 'الدولة', 'الهدف ($)', 'المرحل السابق ($)', 'مشتريات الشهر ($)', 'الإجمالي ($)', 'المستهلك ($)', 'الفائض المرحّل ($)', 'الحالة'],
            rows: [
                ['محمد دمير (#101)', 'EG', '24.75', '3.65', '24.75', '28.40', '24.75', '3.65', '🟢 مؤهل بالمشتريات'],
                ['أحمد مصطفى (#124)', 'EG', '24.75', '12.00', '7.50', '19.50', '0.00', '19.50 (جاري)', '🟠 قيد التجميع'],
                ['خالد حسن (#125)', 'EG', '24.75', '1.45', '24.75', '26.20', '24.75', '1.45', '🟢 مؤهل بالمشتريات'],
                ['يوسف كمال (#318)', 'TR', '24.75', '0.25', '24.75', '25.00', '24.75', '0.25', '🟢 مؤهل بالمشتريات'],
                ['محمد دمير (#101)', 'TR', '33.00 (تعويضي)', '0.00', '0.00 (تعويض)', 'أرباح TR 80.00', '33.00', 'صافي 47.00', '🟢 مؤهل تعويضياً']
            ]
        },
        commissions: {
            title: '3. تقرير العمولات الفردية وسجل الـ Roll-up وإعادة توزيع الفائض',
            headers: ['رقم التوزيع', 'صانع التوزيع', 'مبلغ التوزيع ($)', 'الحصة الأصلية ($)', 'مستفيدون داخل السقف', 'تجاوز (Roll-up)', 'المتبقي المعاد توزيعه ($)'],
            rows: [
                ['POOL-812', 'خالد حسن (#125)', '24.75', '2.25', '8 مؤهلين', 'تجاوز #210 (غير مؤهلة) ← #124', '6.75 (0.84375$/فرد)'],
                ['POOL-813', 'يوسف كمال (#318)', '24.75', '2.25', '6 مؤهلين', 'تجاوز #125 في TR ← #101', '11.25 (1.875$/فرد)']
            ]
        },
        international: {
            title: '4. تقرير الأداء الدولي المتوازي (استقلال الدول وعدم الدمج)',
            headers: ['الدولة', 'التجار النشطون', 'مبيعات الأعضاء (محلي)', 'عمولات سويا (محلي)', 'سعر الصرف الإداري', 'المكافئ المركزي ($)', 'وضع التفعيل'],
            rows: [
                ['🇪🇬 مصر (EG)', '31', '1,101,100.00 ج.م', '110,110.00 ج.م', '50.00 ج.م / $', '2,202.20 $', '🟢 نشطة ومفعلة'],
                ['🇹🇷 تركيا (TR)', '7', '183,500.00 ليرة', '18,350.00 ليرة', '50.00 ليرة / $', '367.00 $', '🟢 نشطة ومفعلة'],
                ['🇸🇦 السعودية (SA)', '0', '0.00 ر.س', '0.00 ر.س', '3.75 ر.س / $', '0.00 $', '⚪ غير نشطة (بانتظار T06+D18)']
            ]
        },
        reconciliation: {
            title: '5. تقرير الخزانة وخطة الدخل والمطابقة المالية الصفرية',
            headers: ['البند المحاسبي', 'الدائن / المصدر', 'المدين / الوجهة', 'الفرق', 'الحكم الرقابي'],
            rows: [
                ['تفكيك عمولات سويا (10%)', '128,460.00 ج.م (مجموع التجار)', '32,115.00 خزانة (25%) + 96,345.00 خطة (75%)', '0.00 ج.م', '✅ مطابق 100%'],
                ['التزامات الشحن المسبق للتجار', '252,645.00 إيداعات معتمدة', '66,345.00 عمولات مستهلكة + 186,300.00 رصيد باقٍ', '0.00 ج.م', '✅ مطابق 100%'],
                ['الشجرة الدولية مقابل بطاقات الدول', '2,569.20 $ إجمالي الشجرة', '2,202.20 $ (EG) + 367.00 $ (TR)', '0.00 $', '✅ مطابق 100%']
            ]
        },
        audit: {
            title: '6. تقرير المراجعة والاستثناءات الرقابية والفوترة الضريبية (Audit & Tax)',
            headers: ['الفئة', 'العدد / القيمة', 'التفصيل التشغيلي', 'المعيار المرتبط'],
            rows: [
                ['فواتير مكررة محجوزة', '1 عملية (500 ج.م)', 'TXN-DUP-804 محجوزة بفارق 4 دقائق — M11', 'حماية الازدواج'],
                ['عمليات معلقة متصاعدة >48س', '1 عملية (1,800 ج.م)', 'TXN-PEND-771 تنتظر الحسم — D6', 'SLA التجار'],
                ['فروق التقريب العشرية', '0.0000 $', 'تدوير Decimal دقيق لحساب فروق التقريب بالخزانة', 'D11'],
                ['وعاء ضريبة القيمة المضافة / WHT', '128,460 ج.م عمولات بانتظار نسبة Y07', 'يلزم اعتماد نسبة الضريبة لكل دولة مع المحاسب القانوني', 'D19 (معلق)']
            ]
        }
    };
    function upgradeReportsSelect() {
        var sel = document.getElementById('reportType');
        if (!sel || sel.dataset.upgraded) return;
        sel.dataset.upgraded = '1';
        sel.innerHTML =
            '<option value="all">📋 جميع التقارير الرسمية الستة (عرض مجمع)</option>' +
            '<option value="tree">1. تقرير الشجرة الشامل (الجيل المزدوج)</option>' +
            '<option value="carryon">2. تقرير التأهل الشهري والـ Carry On</option>' +
            '<option value="commissions">3. تقرير العمولات الفردية وسجل الـ Roll-up</option>' +
            '<option value="international">4. تقرير الأداء الدولي المتوازي</option>' +
            '<option value="reconciliation">5. تقرير الخزانة والمطابقة المالية</option>' +
            '<option value="audit">6. تقرير المراجعة والاستثناءات والضرائب</option>';
        var sD = document.getElementById('reportStartDate');
        var eD = document.getElementById('reportEndDate');
        if (sD && !sD.value) sD.value = '2026-11-01';
        if (eD && !eD.value) eD.value = '2026-11-14';
    }
    window.generateReport = async function () {
        upgradeReportsSelect();
        var sD = document.getElementById('reportStartDate').value || '2026-11-01';
        var eD = document.getElementById('reportEndDate').value || '2026-11-14';
        var typ = document.getElementById('reportType').value || 'all';
        var resDiv = document.getElementById('reportResults');
        if (!resDiv) return;
        var keys = typ === 'all' ? Object.keys(OFFICIAL_REPORTS) : [typ];
        resDiv.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                '<div style="font-size:0.84rem;color:#475569;">الفترة: <b>' + esc(sD) + '</b> إلى <b>' + esc(eD) + '</b> • مطابقة لبيانات المحاكاة الرئيسية</div>' +
                '<button class="btn btn-primary" onclick="opsExportReport(\'' + esc(typ) + '\')">📥 تصدير التقرير CSV</button>' +
            '</div>' +
            keys.map(function (k) {
                var r = OFFICIAL_REPORTS[k];
                if (!r) return '';
                return '<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;"><h3 style="margin:0;color:#0f172a;font-size:1.02rem;">' + r.title + '</h3>' + badgeProp() + '</div>' +
                    '<div style="overflow-x:auto;"><table class="data-table"><thead><tr>' + r.headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
                    r.rows.map(function (row) { return '<tr>' + row.map(function (c, idx) { return '<td data-label="' + esc(r.headers[idx]) + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
                    '</tbody></table></div></div>';
            }).join('');
    };
    window.opsExportReport = function (typ) {
        var r = OFFICIAL_REPORTS[typ === 'all' ? 'reconciliation' : typ] || OFFICIAL_REPORTS.reconciliation;
        downloadCsv('sawyan_report_' + typ + '.csv', r.headers, r.rows);
    };

    /* ============================================================
       الشاشة الجديدة المقترحة: وحدات الرقابة والإقفال (governanceOpsPage)
       5 تبويبات: close | recon | fraud | fx | compliance
       ============================================================ */
    var GOV_TAB = 'close';
    var CLOSE_STEPS = [
        { s: 1, title: 'فحص المطابقة الصفرية التلقائية (P0-7)', desc: 'التحقق من تطابق الخزانة (25%) + الخطة (75%) = العمولات، وأرصدة الشحن، والشجرة الدولية (فرق = 0.00).' },
        { s: 2, title: 'قفل إدخال مبيعات الفترة (Odoo Sales Lock Date — D3)', desc: 'إغلاق شهر نوفمبر عند 23:59:59 حسب توقيت كل دولة ومنع تسجيل فواتير بأثر رجعي.' },
        { s: 3, title: 'حسم نافذة التصحيح والطلبات المعلقة (D3 & D6)', desc: 'إغلاق كافة العمليات المتصاعدة بعد 48 ساعة وحسم أي استثناء إداري موثق قبل التوزيع.' },
        { s: 4, title: 'حساب مسودة التوزيع والتأهل التعويضي ولقطة المعاملات (Hash)', desc: 'تثبيت parameters_snapshot وتطبيق الستوبر العددي ⬅️ السقف والـ Roll-up ⬅️ الستوبر المالي ⬅️ التعويضي دون سالب.' },
        { s: 5, title: 'الاعتماد المزدوج للإقفال الشامل (Odoo Total Lock)', desc: 'مراجعة المحاسب والمراقب وإقفال القيود المحاسبية نهائياً للشهر.' },
        { s: 6, title: 'إصدار دفعة صرف العمولات — يوم 10 من الشهر التالي', desc: 'ترحيل الأرباح المؤكدة إلى الأرصدة المتاحة للسحب وفق fx_rate_used لشهر الاستحقاق.' }
    ];

    function govNavHtml() {
        var tabs = [
            ['close', '📅 معالج الإقفال الشهري (Odoo)'],
            ['recon', '⚖️ محرك المطابقة الصفرية الحية'],
            ['fraud', '🚨 طابور الاشتباه وفحص المرتجع'],
            ['fx', '💱 غرفة أسعار الصرف الشهرية'],
            ['compliance', '🌍 بوابة الدول وإشعارات الأثر وPDPL']
        ];
        return '<div class="sc-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
            tabs.map(function (t) {
                var on = t[0] === GOV_TAB;
                return '<button data-govtab="' + t[0] + '" onclick="govTab(\'' + t[0] + '\')" style="background:' + (on ? '#0f172a' : 'white') + ';color:' + (on ? 'white' : '#334155') + ';border:1px solid ' + (on ? '#0f172a' : '#cbd5e1') + ';border-radius:10px;padding:8px 14px;font-family:Tajawal,sans-serif;font-weight:800;font-size:0.86rem;cursor:pointer;">' + t[1] + '</button>';
            }).join('') +
        '</div>';
    }

    function renderCloseTab() {
        var blockedByDiff = OPS.reconDiffInjected;
        return '<div style="background:white;border:1.5px solid #cbd5e1;border-radius:14px;padding:18px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                '<div><h3 style="margin:0;">📅 معالج الإقفال الشهري وأقفال الفترات (مبدأ Odoo Accounting — P0-6 • D3)</h3><div style="font-size:0.8rem;color:#64748b;">الشهر المحاسبي: نوفمبر 2026 • المرحلة الحالية: <b>' + OPS.closeStep + ' / 6</b></div></div>' +
                badgeProp('قرار D3 + P0-6') +
            '</div>' +
            (blockedByDiff ? '<div style="background:#fee2e2;border:2px solid #dc2626;color:#991b1b;padding:12px;border-radius:10px;margin-bottom:12px;font-weight:800;">⛔ الإقفال محظور تلقائياً! يوجد فرق مطابقة محاسبي (+12.50 ج.م). انتقل لتبويب «المطابقة الصفرية الحية» لإصلاح القيد قبل المتابعة.</div>' : '') +
            (OPS.breakGlassOpenUntil ? '<div style="background:#fef3c7;border:2px solid #f59e0b;color:#92400e;padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:0.84rem;"><b>🔓 استثناء فتح مؤقت نشط (Break-Glass):</b> حتى ' + esc(OPS.breakGlassOpenUntil) + ' • السبب المسجّل: ' + esc(OPS.breakGlassReason) + '</div>' : '') +
            '<div style="display:grid;gap:10px;margin-bottom:14px;">' +
            CLOSE_STEPS.map(function (st) {
                var done = st.s < OPS.closeStep;
                var cur = st.s === OPS.closeStep;
                return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:1.5px solid ' + (done ? '#6ee7b7' : cur ? '#3b82f6' : '#e2e8f0') + ';background:' + (done ? '#f0fdf4' : cur ? '#eff6ff' : '#f8fafc') + ';">' +
                    '<div><div style="font-weight:800;color:#0f172a;">' + (done ? '✅' : cur ? '🔵' : '⚪') + ' الخطوة ' + st.s + ': ' + st.title + '</div><div style="font-size:0.78rem;color:#475569;margin-top:2px;">' + st.desc + '</div></div>' +
                    (cur ? '<button id="govAdvanceCloseBtn" ' + (blockedByDiff ? 'disabled style="opacity:0.45;cursor:not-allowed;background:#64748b;color:white;border:none;padding:8px 14px;border-radius:8px;font-weight:800;"' : 'style="background:#059669;color:white;border:none;padding:8px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;"') + ' onclick="govAdvanceClose()">اعتماد الخطوة التالية ⬅️</button>' : '') +
                '</div>';
            }).join('') +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button onclick="govBreakGlassReopen()" style="background:#fff7ed;color:#c2410c;border:1.5px solid #fb923c;padding:8px 14px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">🔓 فتح استثنائي مؤقت بسبب ومدة (Break-Glass)</button>' +
                '<button onclick="govResetClose()" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-family:Tajawal,sans-serif;">🔄 إعادة ضبط معالج الإقفال للخطوة 1</button>' +
            '</div>' +
        '</div>';
    }

    function renderReconTab() {
        var diff = OPS.reconDiffInjected;
        var rows = [
            ['1. تفكيك العمولة العامة (10%)', '128,460.00 ج.م (إجمالي التجار)', diff ? '32,115.00 + 96,332.50 = 128,447.50' : '32,115.00 خزانة + 96,345.00 خطة', diff ? '+12.50 ج.م' : '0.00 ج.م', !diff],
            ['2. حصة خطة الدخل مقابل الصناديق والتوزيعات', '96,345.00 ج.م', diff ? '96,332.50 (قيد JRN-ERR-404 مفقود)' : '61,200 توزيعات + 35,145 Carry On', diff ? '+12.50 ج.م' : '0.00 ج.م', !diff],
            ['3. صندوق هدف العضو مقابل مجموع الفواتير (SUM)', '28.40 $ (محمد دمير #101)', '28.40 $ (مجموع فواتير نوفمبر الموثقة)', '0.00 $', true],
            ['4. الشجرة الدولية مقابل مجموع بطاقات الدول', '2,569.20 $', '2,202.20 $ (EG) + 367.00 $ (TR)', '0.00 $', true],
            ['5. التزامات الشحن المسبق للتجار (Liability)', '186,300.00 ج.م', '252,645 إيداعات − 66,345 عمولات مقتطعة', '0.00 ج.م', true],
            ['6. دفتر فروق التقريب العشري (Decimal Ledger)', '0.0000 $', 'جميع المبالغ بأصغر وحدة نقدية (D11)', '0.0000 $', true]
        ];
        return '<div style="background:white;border:1.5px solid ' + (diff ? '#dc2626' : '#10b981') + ';border-radius:14px;padding:18px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                '<div><h3 style="margin:0;">⚖️ محرك المطابقة الصفرية الحية (Live Zero-Discrepancy Engine — P0-7)</h3><div style="font-size:0.8rem;color:#64748b;">أي فارق محاسبي يوقف الإقفال الشهري وصرف العمولات فوراً ويكشف القيد المتسبب</div></div>' +
                badgeProp('P0-7') +
            '</div>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
                (!diff
                    ? '<button id="govInjectDiffBtn" onclick="govToggleDiff(true)" style="background:#dc2626;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">🧪 حقن فرق اختباري (+12.50 ج.م) لاختبار قفل الأمان</button>'
                    : '<button id="govFixDiffBtn" onclick="govToggleDiff(false)" style="background:#059669;color:white;border:none;padding:9px 16px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">🔧 إصلاح القيد الشاذ (JRN-ERR-404) وإعادة المطابقة الصفرية</button>') +
                '<div style="display:flex;align-items:center;padding:6px 14px;border-radius:8px;font-weight:900;background:' + (diff ? '#fee2e2;color:#991b1b' : '#dcfce7;color:#166534') + ';">' +
                    (diff ? '🔴 الحالة: خلل مطابقة (+12.50 ج.م) — الإقفال الشهري مقفول!' : '🟢 الحالة: جميع المعادلات متطابقة صفرياً (0.00 فرق)') +
                '</div>' +
            '</div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>معادلة المطابقة</th><th>الطرف الأول</th><th>الطرف الثاني</th><th>الفرق</th><th>الحكم</th></tr></thead><tbody>' +
            rows.map(function (r) {
                return '<tr style="' + (!r[4] ? 'background:#fef2f2;' : '') + '">' +
                    '<td data-label="المعادلة"><b>' + r[0] + '</b></td>' +
                    '<td data-label="الأول">' + r[1] + '</td>' +
                    '<td data-label="الثاني">' + r[2] + '</td>' +
                    '<td data-label="الفرق"><b style="color:' + (r[4] ? '#059669' : '#dc2626') + ';">' + r[3] + '</b></td>' +
                    '<td data-label="الحكم">' + (r[4] ? '<span class="badge badge-success">✅ متطابق</span>' : '<span class="badge badge-danger">⛔ خلل + منع الإقفال</span>') + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>' +
        '</div>';
    }

    function renderFraudTab() {
        return '<div style="display:grid;gap:16px;">' +
            '<div style="background:white;border:1.5px solid #cbd5e1;border-radius:14px;padding:18px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                    '<div><h3 style="margin:0;">🚨 طابور الاشتباه وكشف التواطؤ (Red Team Controls — P1-13)</h3><div style="font-size:0.8rem;color:#64748b;">يرصد الفواتير الوهمية الدوارة، تضارب المالك والعضو، تكرار الأجهزة، وصد QR الأوفلاين</div></div>' +
                    badgeProp('P1-13 + Red Team') +
                '</div>' +
                OPS.fraudQueue.map(function (f) {
                    var res = f.status === 'cleared' ? '🟢 تم التحقق والتبرئة' : f.status === 'frozen' ? '⛔ حساب مجمّد للتحقيق' : f.status === 'blocked_auto' ? '🛡️ تم الصد تلقائياً' : '🔴 بانتظار قرار الرقابة';
                    return '<div style="border:1.5px solid ' + (f.status === 'open' ? '#fca5a5' : '#cbd5e1') + ';background:' + (f.status === 'open' ? '#fff1f2' : '#f8fafc') + ';border-radius:12px;padding:12px 14px;margin-bottom:10px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
                            '<div><span style="background:#0f172a;color:white;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:800;margin-left:6px;">' + esc(f.severity) + '</span><b>' + esc(f.title) + '</b><div style="font-size:0.82rem;color:#334155;margin-top:4px;">' + esc(f.detail) + '</div><div style="font-size:0.74rem;color:#047857;margin-top:3px;">الضابط المقترح: ' + esc(f.control) + ' • الحالة: <b>' + res + '</b></div></div>' +
                            (f.status === 'open' ? '<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn-sm" style="background:#dc2626;color:white;" onclick="govFraudAct(\'' + f.id + '\',\'frozen\')">⛔ تجميد مؤقت</button><button class="btn-sm btn-primary" onclick="govFraudAct(\'' + f.id + '\',\'cleared\')">✅ تبرئة مع التوثيق</button></div>' : '') +
                        '</div>' +
                    '</div>';
                }).join('') +
            '</div>' +
            '<div style="background:white;border:1.5px solid #3b82f6;border-radius:14px;padding:18px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                    '<div><h3 style="margin:0;color:#1e3a8a;">🔍 محاكي أداة الفحص السريع للمرتجع عند التاجر (Quick Return Lookup — باب 6 بند 3)</h3><div style="font-size:0.78rem;color:#64748b;">إذا جاء زبون لإرجاع بضاعة نقداً وأنكر أنه عضو بسويا، يكتب التاجر المبلغ ليكتشف خلال اليومين هل عليه عمولة موثقة أم لا</div></div>' +
                    badgeProp('بند 6.3 غير المحسوم') +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' +
                    '<input id="qrlAmt" type="number" value="500" placeholder="مبلغ المرتجع (مثلاً 500 أو 1250 أو 340)" style="flex:1;min-width:190px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;">' +
                    '<button id="qrlBtn" onclick="govQuickReturnSearch()" style="background:#1d4ed8;color:white;border:none;padding:8px 18px;border-radius:8px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">🔎 فحص فواتير آخر يومين</button>' +
                '</div>' +
                '<div id="qrlResult" style="font-size:0.84rem;color:#334155;">جرّب إدخال <b>500</b> أو <b>1250</b> أو <b>340</b> واضغط فحص.</div>' +
            '</div>' +
        '</div>';
    }

    function renderFxTab() {
        return '<div style="background:white;border:1.5px solid #cbd5e1;border-radius:14px;padding:18px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                '<div><h3 style="margin:0;">💱 غرفة أسعار الصرف الشهرية وإعادة التقييم (P0-5 • D8 • X01–X04)</h3><div style="font-size:0.8rem;color:#64748b;">تُعتمد الأسعار قبل بداية الشهر، وأي انحراف &gt;10% عن الشهر السابق يطلق تحذير اعتماد أعلى</div></div>' +
                badgeProp('P0-5 + D8') +
            '</div>' +
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الدولة</th><th>السعر المعتمد (نوفمبر)</th><th>مقترح الشهر القادم (ديسمبر)</th><th>نسبة الانحراف (X02)</th><th>المصدر المرجعي (X03)</th><th>إجراء</th></tr></thead><tbody>' +
            OPS.fxRates.map(function (r, idx) {
                var dev = r.curRate ? (((r.nextDraft - r.curRate) / r.curRate) * 100) : 0;
                var warn = Math.abs(dev) > 10;
                return '<tr>' +
                    '<td data-label="الدولة"><b>' + esc(r.country) + ' (' + esc(r.cur) + ')</b><div>' + (r.locked ? '🔒 مقفول لشهر نوفمبر' : '🔓 مفتوح') + '</div></td>' +
                    '<td data-label="السعر المعتمد"><b>1$ = ' + fmt(r.curRate) + ' ' + esc(r.cur) + '</b></td>' +
                    '<td data-label="مقترح الشهر القادم"><input type="number" step="0.05" value="' + r.nextDraft + '" onchange="govFxDraft(' + idx + ',this.value)" style="width:110px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;"></td>' +
                    '<td data-label="الانحراف"><span style="font-weight:800;color:' + (warn ? '#dc2626' : '#059669') + ';">' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + '% ' + (warn ? '⚠️ يتجاوز 10% — اعتماد أعلى!' : '✅ طبيعي') + '</span></td>' +
                    '<td data-label="المصدر">' + esc(r.source) + '</td>' +
                    '<td data-label="إجراء"><button class="btn-sm btn-primary" onclick="govFxLock(' + idx + ')">✅ اعتماد وقفل</button></td>' +
                '</tr>';
            }).join('') +
            '</tbody></table></div>' +
        '</div>';
    }

    function renderComplianceTab() {
        return '<div style="display:grid;gap:16px;">' +
            '<div style="background:white;border:1.5px solid #cbd5e1;border-radius:14px;padding:18px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                    '<div><h3 style="margin:0;">🌍 بوابة جاهزية الدول والامتثال القانوني والضريبي (P0-4 • D13 • D18 • D19)</h3><div style="font-size:0.8rem;color:#64748b;">لا يجوز فتح دولة للتأهل أو الهدف التعويضي قبل استيفاء التجار (T06) والرأي القانوني (D18) والفاتورة الضريبية (D19)</div></div>' +
                    badgeProp('D13 + D18 + D19') +
                '</div>' +
                '<table class="data-table"><thead><tr><th>الدولة</th><th>التجار والعمليات (T06: ≥5 تجار و50 عملية)</th><th>الرأي القانوني المكتوب (D18)</th><th>الضرائب VAT/WHT وETA (D19)</th><th>الحكم التلقائي للبوابة</th></tr></thead><tbody>' +
                '<tr><td data-label="الدولة">🇪🇬 مصر (EG)</td><td data-label="T06">31 تاجراً • 1,738 عملية ✅</td><td data-label="D18">⏳ قيد المراجعة مع محامٍ مرخص</td><td data-label="D19">⏳ يلزم ضريبية 14% VAT وإيصال إلكتروني ETA</td><td data-label="الحكم"><span style="color:#b45309;font-weight:800;">⚠️ مُفعّلة تجريبياً — يلزم D18/D19</span></td></tr>' +
                '<tr><td data-label="الدولة">🇹🇷 تركيا (TR)</td><td data-label="T06">7 تجار • 240 عملية ✅</td><td data-label="D18">⏳ قيد المراجعة القانونية</td><td data-label="D19">⏳ لم تُحدد نسب الضرائب التركية Y07</td><td data-label="الحكم"><span style="color:#b45309;font-weight:800;">⚠️ مُفعّلة تجريبياً — يلزم D18/D19</span></td></tr>' +
                '<tr><td data-label="الدولة">🇸🇦 السعودية (SA)</td><td data-label="T06">0 تجار • 0 عملية ❌ (تحت الحد)</td><td data-label="D18">❌ غير مستوفى</td><td data-label="D19">❌ غير مستوفى</td><td data-label="الحكم"><span class="badge badge-danger">⛔ محجوبة عن التفعيل</span></td></tr>' +
                '</tbody></table>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">' +
                '<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">' +
                    '<h3 style="margin:0 0 8px 0;font-size:0.98rem;">📢 معاينة إشعار التأثير المسبق (P1-20 — مهلة T07: 30 يوماً)</h3>' +
                    '<p style="font-size:0.82rem;color:#475569;margin-bottom:8px;">عند اعتماد أي تغيير على النسب أو الهدف التعويضي للشهر القادم، يُبث هذا الإعلان التلقائي:</p>' +
                    '<div style="background:#eff6ff;border:1px dashed #3b82f6;border-radius:10px;padding:10px;font-size:0.82rem;">"إشعار رسمي: سيسري بتاريخ <b>2026-12-01</b> تعديل معامل الهدف التعويضي لدولة تركيا ليصبح 33.00$. يمكنك مراجعة الأثر قبل انتهاء المهلة."</div>' +
                '</div>' +
                '<div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">' +
                    '<h3 style="margin:0 0 8px 0;font-size:0.98rem;">🔐 سجل خصوصية PDPL والاطلاع على الهواتف والرادار (Y08 • W09 • M18)</h3>' +
                    OPS.privacyLogs.map(function (p) {
                        return '<div style="padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:0.78rem;"><b>' + esc(p.actor) + '</b> ⬅️ ' + esc(p.target) + '<div style="color:#64748b;">' + esc(p.scope) + ' • ' + esc(p.consent) + ' (' + esc(p.at) + ')</div></div>';
                    }).join('') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function renderGovernanceOps() {
        var page = document.getElementById('governanceOpsPage');
        if (!page) return;
        var body = GOV_TAB === 'close' ? renderCloseTab() :
                   GOV_TAB === 'recon' ? renderReconTab() :
                   GOV_TAB === 'fraud' ? renderFraudTab() :
                   GOV_TAB === 'fx' ? renderFxTab() : renderComplianceTab();
        page.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                '<div><div style="font-size:1.15rem;font-weight:900;color:#0f172a;">🛡️ وحدات الرقابة والإقفال والامتثال المقترحة</div><div style="font-size:0.8rem;color:#64748b;">معاينة عملية تفاعلية لجميع الوحدات الهندسية والرقابية التي أوصت بها اللجنة قبل اعتمادها النهائي</div></div>' +
                badgeProp('محاكاة محلية') +
            '</div>' + govNavHtml() + body;
    }

    window.govTab = function (t) { GOV_TAB = t; renderGovernanceOps(); };
    window.govAdvanceClose = function () {
        if (OPS.reconDiffInjected) { alert('الإقفال محظور لوجود فرق محاسبي!'); return; }
        if (OPS.closeStep < 6) { OPS.closeStep++; saveOps(); renderGovernanceOps(); }
        else { alert('✅ اكتملت مراحل الإقفال الشهري الست حتى أمر صرف يوم 10.'); }
    };
    window.govResetClose = function () { OPS.closeStep = 1; OPS.breakGlassOpenUntil = null; OPS.breakGlassReason = ''; saveOps(); renderGovernanceOps(); };
    window.govBreakGlassReopen = function () {
        var why = prompt('سبب الفتح الاستثنائي لقفل الشهر (إلزامي للتدقيق):', 'تصحيح فاتورة مستعجل لمرتجع تاجر');
        if (!why || why.trim().length < 3) return;
        OPS.closeStep = Math.max(1, OPS.closeStep - 1);
        OPS.breakGlassOpenUntil = '4 ساعات من ' + nowStr();
        OPS.breakGlassReason = why;
        saveOps(); renderGovernanceOps();
    };
    window.govToggleDiff = function (flag) { OPS.reconDiffInjected = !!flag; saveOps(); renderGovernanceOps(); };
    window.govFraudAct = function (id, status) {
        var f = OPS.fraudQueue.filter(function (x) { return x.id === id; })[0];
        if (!f) return;
        f.status = status; saveOps(); renderGovernanceOps();
    };
    window.govQuickReturnSearch = function () {
        var amt = parseFloat((document.getElementById('qrlAmt') || {}).value || '0');
        var box = document.getElementById('qrlResult');
        if (!box) return;
        var hits = OPS.transactions.filter(function (t) { return Math.abs(t.amount - amt) < 0.01 && t.status === 'completed'; });
        box.innerHTML = hits.length
            ? '<div style="background:#fef3c7;border:1.5px solid #f59e0b;border-radius:10px;padding:10px;"><b>⚠️ تنبيه للتاجر — وُجدت ' + hits.length + ' عملية بسويا بنفس المبلغ خلال آخر يومين:</b>' +
              hits.map(function (h) { return '<div style="margin-top:4px;">• كود: <b>' + esc(h.id) + '</b> • العميل: <b>' + esc(h.memberName[0]) + '***</b> (آخر 4 أرقام: <b>' + esc(h.phoneLast4) + '</b>) • المتجر: ' + esc(h.merchantName) + ' • ' + esc(h.date) + '</div>'; }).join('') +
              '</div>'
            : '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px;">✅ لا توجد فواتير مكتملة لسويا بهذا المبلغ خلال آخر يومين — العميل غير مسجل أو الفاتورة خارج المنصة.</div>';
    };
    window.govFxDraft = function (idx, val) {
        var n = parseFloat(val);
        if (!isNaN(n) && n > 0) { OPS.fxRates[idx].nextDraft = n; saveOps(); renderGovernanceOps(); }
    };
    window.govFxLock = function (idx) {
        OPS.fxRates[idx].curRate = OPS.fxRates[idx].nextDraft;
        OPS.fxRates[idx].locked = true;
        saveOps(); renderGovernanceOps();
        alert('✅ تم اعتماد السعر الجديد وقفل إصدار الصرف للدولة: ' + OPS.fxRates[idx].country);
    };

    /* ---------- ربط الملاحة الإضافية مع لوحة الإدارة دون كسر السكربتات السابقة ---------- */
    var EXTRA_TITLES = {
        decisionsLab: 'مختبر القرارات والمقترحات التفاعلي',
        governanceOps: 'وحدات الرقابة والإقفال المقترحة'
    };

    function hookNavigation() {
        document.querySelectorAll('.nav-item').forEach(function (item) {
            if (item.dataset.sawyanHooked) return;
            item.dataset.sawyanHooked = '1';
            item.addEventListener('click', function () {
                var page = this.dataset.page;
                if (EXTRA_TITLES[page]) {
                    var t = document.getElementById('pageTitle');
                    if (t) t.textContent = EXTRA_TITLES[page];
                }
                if (page === 'governanceOps') renderGovernanceOps();
                if (page === 'decisionsLab' && typeof window.renderDecisionsLab === 'function') window.renderDecisionsLab();
                if (page === 'reports') setTimeout(window.generateReport, 20);
                if (returnContext && page !== returnContext.page && page !== 'decisionsLab') {
                    returnContext = null;
                    var b = document.getElementById('sawyanReturnBanner'); if (b) b.remove();
                }
            });
        });
        var origGoToPage = window.goToPage;
        window.goToPage = function (pageName) {
            if (typeof origGoToPage === 'function') origGoToPage(pageName);
            if (EXTRA_TITLES[pageName]) {
                var t = document.getElementById('pageTitle');
                if (t) t.textContent = EXTRA_TITLES[pageName];
            }
            if (pageName === 'governanceOps') renderGovernanceOps();
            if (pageName === 'decisionsLab' && typeof window.renderDecisionsLab === 'function') window.renderDecisionsLab();
            if (pageName === 'reports') setTimeout(window.generateReport, 20);
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookNavigation);
    else hookNavigation();

    window.SAWYAN_ADMIN_OPS = {
        get: function () { return OPS; },
        reset: function () { OPS = initialOpsState(); saveOps(); },
        renderGovernance: renderGovernanceOps
    };
})();

