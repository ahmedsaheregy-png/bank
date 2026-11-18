/* ============================================================
   SAWYAN Admin — مركز معاملات النظام (System Parameters Control Center)
   نموذج تشغيلي (محاكاة) يثبت المفهوم:
   إدخال ← مشتقات تتغير فوراً ← قيود اتساق ← طلب اعتماد (Maker) ←
   اعتماد مدير ثانٍ (Checker) ← تاريخ سريان ← إصدار جديد ← سجل تدقيق لا يُحذف
   ============================================================ */
(function () {
    function isFounderSession() {
        try {
            var a = JSON.parse(localStorage.getItem('sawyan_admin') || 'null');
            return Boolean(a && (a.is_sovereign_founder || String(a.email || '').toLowerCase() === 'ahmed.saher.egy@gmail.com'));
        } catch (e) { return false; }
    }
    var LS = 'sawyan_admin_params_v1';
    var USER_LS = 'sawyan_admin_params_user';
    var COUNTRIES = [
        { c: 'EG', n: 'مصر', cur: 'EGP', tz: 'Africa/Cairo' },
        { c: 'TR', n: 'تركيا', cur: 'TRY', tz: 'Europe/Istanbul' },
        { c: 'SA', n: 'السعودية', cur: 'SAR', tz: 'Asia/Riyadh' }
    ];
    var USERS = [
        { id: 'u1', n: 'أحمد (مُنشئ طلبات)', role: 'maker' },
        { id: 'u2', n: 'منى (مُعتمِدة)', role: 'checker' },
        { id: 'u3', n: 'خالد (مدقّق — قراءة فقط)', role: 'auditor' }
    ];
    var TABS = [
        ['fin', '💰 المعادلة المالية'], ['stp', '🎯 الستوبر والأهداف'], ['cty', '🌍 الدول والصرف'],
        ['mer', '🏪 التجار والرقابة'], ['mem', '👥 الأعضاء والسحب والهوية'], ['sys', '🛡️ الشجرة والنظام والإيقاف'],
        ['apr', '✅ طلبات الاعتماد'], ['ver', '🗂️ الإصدارات'], ['aud', '📜 سجل التدقيق'], ['adm', '🔐 المديرون والأدوار']
    ];

    /* ---------- تعريف المعاملات العامة ----------
       src: doc = قيمة من الوثائق | prop = اقتراح اللجنة (لم يُعتمد) | none = بلا قيمة (قرار معلّق) */
    var G = [];
    function P(k, g, label, o) { var x = { k: k, g: g, label: label }; for (var i in o) x[i] = o[i]; G.push(x); }

    // المعادلة المالية
    P('F01', 'fin', 'نسبة العمولة الافتراضية للتاجر', { t: 'num', u: '%', v: 10, src: 'doc', min: 0.5, max: 100, step: 0.5, s: 'عام + استثناء لكل تاجر', h: 'يمكن للإدارة تخصيصها لتاجر بعينه، وتُثبَّت على كل فاتورة وقت إنشائها.' });
    P('F02a', 'fin', 'الحد الأدنى المسموح لنسبة عمولة أي تاجر', { t: 'num', u: '%', v: 1, src: 'prop', min: 0, max: 100, step: 0.5, s: 'عام', h: 'اقتراح اللجنة: يمنع إدخال نسبة خاطئة.' });
    P('F02b', 'fin', 'الحد الأقصى المسموح لنسبة عمولة أي تاجر', { t: 'num', u: '%', v: 40, src: 'prop', min: 0, max: 100, step: 0.5, s: 'عام', h: 'اقتراح اللجنة: يمنع إدخال 200% بالخطأ.' });
    P('F03', 'fin', 'نسبة الخزانة من العمولة العامة', { t: 'num', u: '%', v: 25, src: 'doc', min: 0, max: 100, step: 0.5, s: 'عام (والأفضل لكل دولة/تاجر)', h: 'نسبة خطة الدخل تُحسب تلقائياً = 100 − هذه النسبة ولا تُدخل يدوياً.' });
    P('F06', 'fin', 'عدد الخانات العشرية للمبالغ', { t: 'int', u: 'خانة', v: 2, src: 'doc', min: 0, max: 4, step: 1, s: 'عام (لكل عملة)', h: 'معتمد (D11): حسابات NUMERIC/Decimal داخلية بأصغر وحدة نقدية (قرش/سنت/هللة).' });
    P('F07', 'fin', 'وجهة بواقي التقريب', { t: 'select', v: 'treasury', src: 'doc', opts: [['treasury', 'حساب «فروق التقريب» في الخزانة'], ['plan', 'صندوق خطة الدخل'], ['first', 'أول مستفيد']], s: 'عام', h: 'معتمد (D11): تُوجّه بواقي كسور التقريب تلقائياً لحساب «فروق التقريب» بالخزانة (مع بقائها معاملاً إدارياً متغيراً).' });
    P('F08', 'fin', 'العملة المحاسبية المركزية', { t: 'text', v: 'USD', src: 'doc', lock: true, s: 'عام', h: 'مقفلة: كل التقارير الدولية بالدولار.' });

    // الستوبر والأهداف
    P('S01', 'stp', 'الستوبر العددي (عدد الأجيال المؤهلة نزولاً)', { t: 'int', u: 'جيل', v: 11, src: 'doc', min: 2, max: 30, step: 1, s: 'عام (والأفضل لكل دولة)', h: 'يحدد حد فريق العمولات وبداية الفريق الرديف ومقعد 1/11.' });
    P('S02', 'stp', 'عدد الـ Uplines في السقف (صعوداً)', { t: 'int', u: 'أبلاين', v: 10, src: 'doc', min: 1, max: 29, step: 1, s: 'عام', h: 'إجمالي الحصص = هذا الرقم + 1 (صانع التوزيع). مستقل عن الستوبر العددي حسب الوثيقة (قرار D2).' });
    P('S04', 'stp', 'قاعدة توزيع المتبقي من حصص غير المؤهلين', { t: 'select', v: 'equal', src: 'doc', opts: [['equal', 'بالتساوي على من نال حصة أصلية'], ['nearest', 'لأقرب مؤهل أعلى']], s: 'عام', h: 'القاعدة المعتمدة بالوثيقة (D27): التساوي كإعداد افتراضي قابل للتعديل الإداري.' });
    P('S05', 'stp', 'المقعد 1/11 المحجوز لصاحب الشجرة', { t: 'select', v: 'display', src: 'doc', opts: [['display', 'معاينة بصرية تحفيزية معزولة فقط (معتمد D12)'], ['hide', 'إخفاء المقعد عن غير المؤهل']], s: 'عام', h: 'تم الحسم (D12): عرض تحفيزي معزول رصيده الفعلي 0$ حتى إتمام 100/100 ولا صرف لغير المؤهل.' });
    P('S06', 'stp', 'أقصى عمق لبحث الرول أب', { t: 'int', u: 'جيل', v: 50, src: 'prop', min: 11, max: 500, step: 1, s: 'عام', h: 'يحمي الأداء عند وجود تجاوز غير محدود.' });
    P('S07', 'stp', 'عدد الأهداف المخصومة لكل تحقق', { t: 'int', u: 'هدف', v: 1, src: 'doc', min: 1, max: 3, step: 1, s: 'عام', h: 'القاعدة الحالية: خصم هدف شهر واحد فقط.' });
    P('T04', 'stp', 'مدة صلاحية الكاري أون (0 = بلا حد)', { t: 'int', u: 'شهر', v: 0, src: 'doc', min: 0, max: 120, step: 1, s: 'عام', h: 'معتمد (D16): بلا حد = مفتوح المدة لا يسقط أبداً للعضو النشط.' });
    P('T05', 'stp', 'فترة التقييم', { t: 'text', v: 'شهر ميلادي', src: 'doc', lock: true, s: 'عام', h: 'مقفلة.' });
    P('T06a', 'stp', 'معيار «الدولة النشطة»: أقل عدد تجار', { t: 'int', u: 'تاجر', v: 5, src: 'doc', min: 0, max: 1000, step: 1, s: 'عام', h: 'معتمد (D13): يُفحص قبل التفعيل عبر «بوابة تفعيل الدولة» باعتماد مزدوج، والقيمة قابلة للتعديل.' });
    P('T06b', 'stp', 'معيار «الدولة النشطة»: أقل عمليات شهرياً', { t: 'int', u: 'عملية', v: 50, src: 'doc', min: 0, max: 100000, step: 10, s: 'عام', h: 'معتمد (D13): شرط تشغيلي مرن داخل بوابة تفعيل الدولة.' });
    P('T07', 'stp', 'مهلة إشعار الأعضاء قبل تفعيل دولة', { t: 'int', u: 'يوم', v: 30, src: 'doc', min: 0, max: 365, step: 1, s: 'عام', h: 'معتمد (D13): إشعار مسبق (مثل 15 أو 30 يوماً قابلة للتعديل)؛ ويسري التفعيل من أول الشهر الميلادي التالي حصراً.' });

    // التجار
    P('M01', 'mer', 'السقف الائتماني الافتراضي للتاجر (دولار مكافئ)', { t: 'num', u: '$', v: null, src: 'none', min: 0, max: 1000000, step: 10, s: 'لكل تاجر', h: 'معتمد (D4): الأصل 0 (شحن مسبق)، ويجوز للإدارة باعتماد مزدوج استثناء أي تاجر بضابط توقيت و/أو سقف مبلغ (أيهما أسبق يحظر).' });
    P('M02', 'mer', 'الحد الأدنى للإيداع الأولي (الباقة)', { t: 'num', u: '$', v: null, src: 'none', min: 0, max: 1000000, step: 10, s: 'لكل تاجر', h: 'أساس نسب التنبيه.' });
    P('M03', 'mer', 'عتبة التنبيه الأول للرصيد', { t: 'num', u: '% من الباقة', v: 25, src: 'doc', min: 1, max: 99, step: 1, s: 'عام + استثناء لكل تاجر', h: 'يجب: الأول > الأخير > العزل. (قرار المؤسس D15: النسب فقط بلا حد مقطوع — السلم المعتمد بالوثائق 30% / 20% / 10%).' });
    P('M04', 'mer', 'عتبة الإنذار الأخير', { t: 'num', u: '% من الباقة', v: 10, src: 'doc', min: 1, max: 99, step: 1, s: 'عام + استثناء لكل تاجر', h: 'قرار المؤسس (D15): الافتراضي المعتمد بالوثائق 20% (القيم هنا محفوظة لاستقرار اختبارات المعاينة حتى الإطلاق).' });
    P('M05', 'mer', 'عتبة العزل الوقائي', { t: 'num', u: '% من الباقة', v: 5, src: 'doc', min: 0.5, max: 99, step: 0.5, s: 'عام + استثناء لكل تاجر', h: 'معتمد (D15/M5): عند 10% يُخفى من الخريطة وتبقى الـ 10% لعملاء المحل حتى 0%، ثم طابور 3 فواتير فقفل تام.' });
    P('M07', 'mer', 'ساعة الإغلاق اليومي للتسوية (0–23)', { t: 'int', u: 'ساعة', v: 0, src: 'doc', min: 0, max: 23, step: 1, s: 'لكل دولة (بتوقيتها)', h: '0 = منتصف الليل (أو أي ساعة مثل 23:58 يحددها الاستثناء الإداري D4 لكل تاجر).' });
    P('M08', 'mer', 'فارق التذكير المسائي قبل الإغلاق', { t: 'int', u: 'ساعة', v: 1, src: 'doc', min: 1, max: 12, step: 1, s: 'عام', h: 'ساعة التذكير تُشتق = الإغلاق − الفارق.' });
    P('M09', 'mer', 'مهلة رد التاجر على الطلب المعلق', { t: 'int', u: 'ساعة', v: 48, src: 'prop', min: 1, max: 720, step: 1, s: 'عام', h: 'معتمد في الوثيقة (قرار D6): 48 ساعة مع تذكيرين عند 24س و44س.' });
    P('M10', 'mer', 'الإجراء عند انتهاء المهلة', { t: 'select', v: 'escalate', src: 'prop', opts: [['escalate', 'تصعيد للأدمن'], ['auto_approve', 'اعتماد تلقائي + قيد دين'], ['auto_reject', 'رفض تلقائي']], s: 'عام', h: 'معتمد (D6): التصعيد الإلزامي للإدارة؛ وعند الرفض خيارا قبول/اعتراض وتذكرة نزاع ثلاثية.' });
    P('M11a', 'mer', 'نافذة كشف تكرار الفاتورة: فارق الوقت', { t: 'int', u: 'دقيقة', v: 10, src: 'prop', min: 1, max: 1440, step: 1, s: 'عام', h: 'الوثيقة: «توقيت مقارب» + قفل المرجع الفريد وكود SW-XXXX.' });
    P('M12', 'mer', 'نافذة فحص المرتجع', { t: 'int', u: 'يوم', v: 2, src: 'doc', min: 0, max: 30, step: 1, s: 'عام', h: 'معتمد (D5): رادار فحص مرتجع سريع + طلب عكسي يقبله العميل (OTP) قبل تسليم النقد، ممتد لمهلة الرد القانونية.' });
    P('M13a', 'mer', 'طول PIN الكاشير', { t: 'int', u: 'أرقام', v: 4, src: 'doc', min: 4, max: 8, step: 1, s: 'عام', h: 'معتمد (D25): PIN مستقل لكل موظف كاشير يحدده التاجر + منع توثيق الموظف لنفسه + كاشف شجرة الموظف.' });
    P('M13b', 'mer', 'أقصى محاولات خاطئة للـ PIN', { t: 'int', u: 'محاولة', v: 5, src: 'doc', min: 3, max: 10, step: 1, s: 'عام', h: '' });
    P('M13c', 'mer', 'مدة قفل الـ PIN بعد تجاوز المحاولات', { t: 'int', u: 'دقيقة', v: 15, src: 'prop', min: 1, max: 1440, step: 1, s: 'عام', h: 'حماية من التخمين على أكواد الموظفين.' });
    P('M14', 'mer', 'صلاحية QR الدفع الأوفلاين', { t: 'int', u: 'ساعة', v: 24, src: 'doc', min: 1, max: 168, step: 1, s: 'عام', h: 'معتمد (D25): كل عملية بـ QR لمرة واحدة فقط (Single-Use).' });
    P('M15', 'mer', 'سقف يومي لفواتير الثنائي (عضو + تاجر)', { t: 'int', u: 'فاتورة', v: 3, src: 'prop', min: 1, max: 100, step: 1, s: 'عام', h: 'حد أقصى طلبين معلقين للعضو قبل رد التاجر (M2) وسقف 3 فواتير لطابور نفاد الرصيد (M5).' });
    P('M16', 'mer', 'سقف الفاتورة بلا صورة/إيصال', { t: 'num', u: '$', v: 20, src: 'prop', min: 0, max: 100000, step: 5, s: 'عام', h: 'معتمد (D5/M2): صورة المستند إلزامية للطلبات المعلقة وصورة السلعة للتاجر اليدوي.' });
    P('M17a', 'mer', 'حد الإعلانات الترويجية اليومي لكل تاجر', { t: 'int', u: 'إعلان', v: 1, src: 'prop', min: 0, max: 20, step: 1, s: 'عام', h: '' });
    P('M17b', 'mer', 'مهلة مراجعة الإعلان من الإدارة', { t: 'int', u: 'دقيقة', v: 60, src: 'prop', min: 5, max: 1440, step: 5, s: 'عام', h: 'تظهر للتاجر في نافذة الطلب.' });
    P('M18', 'mer', 'أقل عدد أعضاء يُعرض في إحصائية الرادار', { t: 'int', u: 'عضو', v: 10, src: 'prop', min: 1, max: 1000, step: 1, s: 'عام', h: 'k-anonymity: يمنع كشف أعضاء بعينهم في المناطق الضيقة.' });
    P('M19a', 'mer', 'نصف قطر رادار التاجر', { t: 'num', u: 'كم', v: 3, src: 'doc', min: 0.5, max: 50, step: 0.5, s: 'عام', h: '' });
    P('M19b', 'mer', 'نصف قطر رادار تجار العضو', { t: 'num', u: 'كم', v: 10, src: 'doc', min: 1, max: 100, step: 1, s: 'عام', h: '' });
    P('M20', 'mer', 'تقييم شارة «التاجر المميز»', { t: 'num', u: 'نجمة', v: 4.5, src: 'doc', min: 1, max: 5, step: 0.1, s: 'عام', h: '' });

    // الأعضاء والسحب والهوية
    P('W01', 'mem', 'يوم صرف العمولات من الشهر التالي', { t: 'int', u: 'يوم', v: 15, src: 'doc', min: 2, max: 28, step: 1, s: 'عام (ولكل دولة)', h: 'معتمد (D5): يوم 15 افتراضياً لتغطية مهلة الرد 14 يوماً؛ وبعد الصرف يُغلق الشهر نهائياً ويُحظر أي مرتجع نظامي.' });
    P('W02', 'mem', 'آخر يوم لقبول المرتجعات قبل الصرف', { t: 'int', u: 'يوم', v: 14, src: 'doc', min: 1, max: 27, step: 1, s: 'عام (ولكل دولة)', h: 'معتمد (D5): يجب أن يسبق يوم الصرف (14 يوماً قبل صرف يوم 15 مع درع حماية الكاري أون؛ وبعد الصرف يتحمله البائع 100%).' });
    P('W03', 'mem', 'لحظة إقفال الشهر', { t: 'text', v: '23:59:59', src: 'doc', lock: true, s: 'لكل دولة (بتوقيتها المحلي)', h: 'مقفلة هنا؛ المنطقة الزمنية في تبويب الدول.' });
    P('W05', 'mem', 'عتبة الاعتماد المزدوج للسحب', { t: 'num', u: '$', v: 200, src: 'doc', min: 1, max: 100000, step: 10, s: 'عام', h: 'معتمد (D17): السحوبات التي تتجاوز هذا السقف (مثلاً 200$ قابلة للتعديل) تخضع لموافقة مديرين اثنين Maker–Checker.' });
    P('W07', 'mem', 'فترة التهدئة بعد تغيير بيانات الدفع', { t: 'int', u: 'ساعة', v: 72, src: 'doc', min: 0, max: 720, step: 1, s: 'عام', h: 'معتمد (D17): تهدئة أمان 72 ساعة (قابلة للتعديل) للسحب إلى حساب الاستلام الجديد مع إشعار أمني فوري، بينما السحب للحساب السابق يعمل فوراً.' });
    P('W08a', 'mem', 'توقيت طلب مستند الإقامة (KYC)', { t: 'select', v: 'either', src: 'doc', opts: [['first_withdrawal', 'عند أول سحب'], ['threshold', 'عند بلوغ أرباح محددة'], ['either', 'أيهما أسبق (أو نقل الإقامة)']], s: 'لكل دولة', h: 'معتمد (D7): التسجيل بالاسم والموبايل فقط، والـ KYC عند أول سحب أو سقف X$ أو نقل الإقامة (أيهما أسبق) مع تشفير المستندات وتطابق الاسم.' });
    P('W08b', 'mem', 'أرباح تستدعي KYC مبكراً', { t: 'num', u: '$', v: 100, src: 'doc', min: 0, max: 100000, step: 10, s: 'عام', h: 'معتمد (D7): السقف الاختياري للأرباح التراكمية X$ قبل أول سحب (قابل للتعديل الإداري).' });
    P('W08c', 'mem', 'مهلة KYC الإضافية', { t: 'int', u: 'يوم', v: 30, src: 'doc', min: 0, max: 365, step: 1, s: 'عام', h: 'ملاحظة: راجع الباب السادس بند 5 بشأن مراجعة إلزام كتابة رقم الهوية أرقاماً عند التسجيل لاحقاً.' });
    P('W09a', 'mem', 'رؤية هاتف الأعلى (Uplines)', { t: 'int', u: 'أشخاص', v: 10, src: 'doc', min: 0, max: 30, step: 1, s: 'عام', h: 'معتمد بقرار المؤسس (D26): يظهر فقط لأعلى 10 أشخاص فوق العضو حرفياً في خط الشجرة دون اشتراط تأهلهم.' });
    P('W09b', 'mem', 'رؤية هواتف الأجيال تحت القائد', { t: 'int', u: 'جيل', v: 10, src: 'doc', min: 0, max: 30, step: 1, s: 'عام', h: 'معتمد (D2 + D26): الـ 10 أجيال المكانية تحت القائد حرفياً (2Me–11Me) دون اشتراط التأهل ودون Roll-up.' });
    P('W10', 'mem', 'وضع التجربة السريعة (كلمة المرور 123456)', { t: 'toggle', v: true, src: 'doc', s: 'عام', h: 'معتمد (D10): محظور كلياً في الإنتاج الفعلي وSoft Launch المالي؛ وتعمل بيئتا الإنتاج والتدريب من Single Codebase بقاعدتي بيانات معزولتين وArgon2id.' });
    P('W11', 'mem', 'مدة خمول الرصيد قبل المراجعة (0 = بلا حد)', { t: 'int', u: 'شهر', v: null, src: 'none', min: 0, max: 240, step: 1, s: 'عام', h: 'معتمد (D16): مفتوح المدة للنشط؛ واختياري هنا (0 = بلا حد افتراضياً) لنقل الحسابات المهجورة بعد 3 تنبيهات (60/30/7 أيام) لحساب Dormant مع زر استعادة إداري.' });
    P('W12a', 'mem', 'إلزام رمز التحقق OTP عند التسجيل', { t: 'toggle', v: true, src: 'doc', s: 'عام', h: 'معتمد (D7): تأكيد مجاني بـ Reverse WhatsApp OTP (+ QR من جهاز آخر + «تأكيد لاحقاً»)، مع خيار التبديل لـ SMS المدفوع.' });
    P('W12b', 'mem', 'أقصى عدد حسابات لكل جهاز', { t: 'int', u: 'حساب', v: 1, src: 'prop', min: 1, max: 10, step: 1, s: 'عام', h: 'مؤشر رقابي ضد الحسابات الوهمية، بالإضافة لاحتمال مراجعة رقم الهوية عند التسجيل لاحقاً.' });

    // الشجرة والنظام
    P('G01', 'sys', 'ترتيب قواعد التسكين', { t: 'text', v: 'أقرب جيل ← الذراع الأضعف ← فرع بلا أبناء ← الأقدمية', src: 'doc', lock: true, s: 'عام', h: 'معتمد (D22): تسكين ذري تلقائي مع حفظ sponsor_id الدائم لـ My Contact Member (عدد لا نهائي)، ولا تُغيَّر بأثر رجعي.' });
    P('G02', 'sys', 'كسر التعادل في التسكين', { t: 'select', v: 'right', src: 'doc', opts: [['right', 'يمين أولاً'], ['left', 'يسار أولاً']], s: 'عام', h: 'معتمد (D22): يمين أولاً ثم يتولى التوازن الذاتي للذراع الأضعف توزيع العضو التالي.' });
    P('G03', 'sys', 'السماح بتغيير مكان العضو', { t: 'toggle', v: false, src: 'doc', s: 'عام', h: 'معتمد (D22): مغلق افتراضياً، وإن فُتح فللـ Upline الحقيقي فقط؛ بينما جذر الشركة #0 يخضع لـ Maker–Checker.' });
    P('G05', 'sys', 'عدد أذرع الشجرة', { t: 'int', u: 'ذراع', v: 2, src: 'doc', lock: true, s: 'ثابت هيكلي', h: 'مقفل (D22): مقعدان بالجيل الثاني لكل عضو، وجذر الشركة #0 هو المكان الوحيد لعدد لا نهائي بقرار مزدوج.' });
    P('Y02', 'sys', 'مهلة جلسة المدير والأثر ثنائي الزمن (Bitemporal)', { t: 'int', u: 'دقيقة', v: 30, src: 'prop', min: 5, max: 480, step: 5, s: 'عام', h: 'معتمد (D28): تعديلات المعاملات تحفظ زمن الإدخال وزمن السريان (أول الشهر التالي للهيكلية وفوري لـ Kill Switch واعتماد التجار).' });
    P('Y03', 'sys', 'إلزام المصادقة الثنائية 2FA والأدوار الـ 7 (RBAC) للمديرين', { t: 'toggle', v: true, src: 'prop', s: 'عام', h: 'معتمد (D10): إلزامي مع Argon2id والأدوار السبعة (مُدخِل، مراجِع، معتمِد، مدقِّق، مالي، دعم، KYC).' });
    P('Y05', 'sys', 'مدة الاحتفاظ بسجل التدقيق', { t: 'int', u: 'سنة', v: 7, src: 'prop', min: 1, max: 30, step: 1, s: 'عام', h: 'يؤكدها المحاسب القانوني (مع فحص المطابقة الصفرية وتقييم IAS 21 قبل القفل الصلب Hard Lock — معتمد D28).' });

    // مفاتيح الإيقاف الطارئ (فورية + سبب إلزامي)
    var KILL = [
        ['K_REG', 'إيقاف التسجيل الجديد'], ['K_TX', 'إيقاف توثيق العمليات'], ['K_WD', 'إيقاف طلبات السحب'],
        ['K_PAY', 'إيقاف الصرف الشهري'], ['K_CLOSE', 'إيقاف الإقفال الشهري']
    ];

    /* ---------- معاملات لكل دولة ---------- */
    var CP = [
        { k: 'active', label: 'الدولة مفعّلة', t: 'toggle', v: { EG: true, TR: true, SA: false }, src: 'doc' },
        { k: 'rate', label: 'سعر الصرف الشهري (عملة محلية لكل 1$)', t: 'num', step: 0.01, min: 0.0001, v: { EG: 50, TR: 50, SA: 3.75 }, src: 'doc', tip: 'مؤقت حسب الوثيقة' },
        { k: 'tgt', label: 'الهدف الشهري — حصة خطة الدخل ($)', t: 'num', step: 0.25, min: 0.25, v: { EG: 24.75, TR: 24.75, SA: 24.75 }, src: 'doc' },
        { k: 'comp', label: 'الهدف التعويضي ($)', t: 'num', step: 0.25, min: 0, v: { EG: 33, TR: 33, SA: 33 }, src: 'doc', tip: 'معتمد (D1): الشهري + حصة الخزانة المقابلة + إيرادات إدارية من الأهداف التعويضية (≥ 0)' },
        { k: 'fstop', label: 'الستوبر المالي الشهري S03 ($)', t: 'num', step: 0.25, min: 1, v: { EG: 4605.75, TR: 4605.75, SA: 4605.75 }, src: 'doc', tip: 'الديفولت التلقائي لكل دولة = حصة الفرد المؤهل × إجمالي الشجرة المثالية المكتملة (2047)؛ مع جواز التعديل اليدوي (D14 / D27)' },
        { k: 'floor', label: 'حد أدنى مطلق لرصيد التاجر (عملة محلية)', t: 'num', step: 10, min: 0, v: { EG: 500, TR: null, SA: null }, src: 'doc', tip: 'معتمد (D15): ألغى المؤسس الحد المقطوع لصالح النسب المئوية فقط (30% / 20% / 10%) بدون قيود.' },
        { k: 'wmin', label: 'أدنى مبلغ للسحب ($)', t: 'num', step: 1, min: 0, v: { EG: null, TR: null, SA: null }, src: 'none', tip: 'معتمد (D17 / W04): تحدده الإدارة لكل دولة ولكل وسيلة استلام (تحويل لحظي / SEPA / ACH / محفظة رقمية / IBAN).' },
        { k: 'wmax', label: 'أقصى سحب للعملية ($)', t: 'num', step: 1, min: 0, v: { EG: null, TR: null, SA: null }, src: 'none', tip: 'معتمد (D17 / W04): تحدده الإدارة لكل دولة ولكل وسيلة استلام.' },
        { k: 'wday', label: 'أقصى سحب يومي ($)', t: 'num', step: 1, min: 0, v: { EG: null, TR: null, SA: null }, src: 'none', tip: 'معتمد (D17 / W04): سقف السحب اليومي بكل دولة.' },
        { k: 'wfee', label: 'رسوم التحويل (%)', t: 'num', step: 0.1, min: 0, v: { EG: null, TR: null, SA: null }, src: 'none', tip: 'معتمد (D17 / W06): يتحملها العضو افتراضياً وتظهر كبند مستقل صريح قبل التأكيد (مع حق الإدارة في تعديل جهة التحمل).' },
        { k: 'vat', label: 'ضريبة القيمة المضافة على العمولة (%)', t: 'num', step: 0.5, min: 0, v: { EG: null, TR: null, SA: null }, src: 'none', tip: 'معتمد (D19 / Y07): عمولة صافية Tax-Exclusive (0.00% افتراضياً وتُضبط لكل دولة عبر محاسب مرخص).' },
        { k: 'wht', label: 'الاستقطاع الضريبي على عمولات الأعضاء (%)', t: 'num', step: 0.5, min: 0, v: { EG: null, TR: null, SA: null }, src: 'none', tip: 'معتمد (D19 / Y07): يُستقطع كبند مستقل عند الصرف وفق قانون الدولة عبر محاسب مرخص (0.00% افتراضياً).' },
        { k: 'legal', label: 'اعتماد قانوني موثق للدولة', t: 'toggle', v: { EG: false, TR: false, SA: false }, src: 'none', tip: 'معتمد (D18): رأي قانوني مكتوب + استيفاء الأركان القانونية الـ 4 في «🌍 بوابة تفعيل الدولة» قبل التفعيل.' }
    ];
    var FX_GLOBAL = [
        { k: 'X02', label: 'أقصى انحراف لسعر الصرف عن الإصدار السابق', u: '%', v: 10, src: 'prop', min: 0, max: 100, step: 1, t: 'num', h: 'تجاوزه يستلزم اعتماداً أعلى.' },
        { k: 'X04', label: 'قفل السعر بعد الاعتماد', t: 'toggle', v: true, src: 'doc', h: 'التعديل الاستثنائي رجعياً = اعتماد مزدوج + تقرير أثر.' }
    ];

    /* ---------- حالة النظام ---------- */
    var ACTIVE = {}, DRAFT = {}, ST = null, TAB = 'fin';

    function defaults() {
        var o = {};
        G.concat(FX_GLOBAL).forEach(function (p) { o[p.k] = p.v; });
        CP.forEach(function (p) { COUNTRIES.forEach(function (c) { o[p.k + '.' + c.c] = p.v[c.c]; }); });
        KILL.forEach(function (k) { o[k[0]] = false; });
        return o;
    }
    function meta(k) {
        var i, p;
        for (i = 0; i < G.length; i++) if (G[i].k === k) return G[i];
        for (i = 0; i < FX_GLOBAL.length; i++) if (FX_GLOBAL[i].k === k) return FX_GLOBAL[i];
        var base = k.split('.')[0];
        for (i = 0; i < CP.length; i++) if (CP[i].k === base) { p = CP[i]; return { k: k, label: p.label + ' — ' + k.split('.')[1], t: p.t, src: p.src, per: true, cp: p }; }
        for (i = 0; i < KILL.length; i++) if (KILL[i][0] === k) return { k: k, label: KILL[i][1], t: 'toggle', src: 'doc' };
        return { k: k, label: k, t: 'text', src: 'doc' };
    }
    function load() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { raw = null; }
        if (raw && raw.active) { ST = raw; ACTIVE = raw.active; }
        else {
            ACTIVE = defaults();
            ST = { active: ACTIVE, version: 0, approved: {}, history: [{ ver: 0, at: now(), by: 'النظام', approvedBy: '—', reason: 'القيم الأولية المستخرجة من الوثائق الثلاث (بعضها اقتراح لجنة بانتظار الاعتماد)', effective: now().slice(0, 10), changes: [] }], pending: [], audit: [{ t: now(), a: 'النظام', act: 'INIT', d: 'تهيئة سجل المعاملات من الوثائق' }], seq: 0 };
            save();
        }
        // دمج أي معاملات جديدة لم تكن في نسخة محفوظة + تعبئة ديفولت الستوبر المالي لو كان فارغاً قديماً
        var d0 = defaults();
        for (var k in d0) {
            if (!(k in ACTIVE) || (k.indexOf('fstop.') === 0 && (ACTIVE[k] === null || ACTIVE[k] === ''))) {
                ACTIVE[k] = d0[k];
            }
        }
        DRAFT = JSON.parse(JSON.stringify(ACTIVE));
    }
    function save() { ST.active = ACTIVE; localStorage.setItem(LS, JSON.stringify(ST)); }
    function now() { var d = new Date(); function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); }
    function log(act, d) { ST.audit.unshift({ t: now(), a: curUser().n, act: act, d: d }); save(); }
    function curUser() { var id = localStorage.getItem(USER_LS) || 'u1'; return USERS.filter(function (u) { return u.id === id; })[0] || USERS[0]; }
    function nextMonthFirst(add) { var d = new Date(); var x = new Date(d.getFullYear(), d.getMonth() + 1 + (add || 0), 1); function z(n) { return (n < 10 ? '0' : '') + n; } return x.getFullYear() + '-' + z(x.getMonth() + 1) + '-' + z(x.getDate()); }

    function V(k) { return DRAFT[k]; }
    function num(x) { return (x === null || x === undefined || x === '' || isNaN(Number(x))) ? null : Number(x); }
    function fmt(n, dec) { if (n === null || n === undefined || isNaN(n)) return '—'; return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec }); }
    function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    function srcState(k) {
        var m = meta(k); var val = ACTIVE[k];
        if (ST.approved[k]) return 'set';
        if (val === null || val === undefined || val === '') return 'none';
        return m.src === 'prop' ? 'prop' : (m.src === 'none' ? 'none' : 'doc');
    }
    function changes() {
        var out = [];
        for (var k in DRAFT) {
            var a = ACTIVE[k], b = DRAFT[k];
            if (String(a === null ? '' : a) !== String(b === null ? '' : b)) out.push({ k: k, label: meta(k).label, old: a, nw: b });
        }
        return out;
    }
    function showVal(k, v) {
        var m = meta(k);
        if (v === null || v === undefined || v === '') return '(بلا قيمة)';
        if (m.t === 'toggle') return v ? 'مفعّل' : 'معطّل';
        if (m.t === 'select' && m.opts) { var o = m.opts.filter(function (x) { return x[0] === v; })[0]; return o ? o[1] : v; }
        return String(v) + (m.u ? ' ' + m.u : '');
    }

    function calcCtyUnitShare(tgtUsd, sharesCount) {
        if (tgtUsd === null || !sharesCount || sharesCount < 1) return null;
        return Math.floor(Math.round(Number(tgtUsd) * 100) / sharesCount) / 100;
    }
    function calcCtyDefaultStopper(tgtUsd, stGens, sharesCount) {
        var sh = calcCtyUnitShare(tgtUsd, sharesCount);
        if (sh === null || stGens === null || stGens < 1) return null;
        var nodes = Math.pow(2, Math.min(stGens, 40)) - 1;
        return Math.round(sh * 100 * nodes) / 100;
    }

    /* ---------- المشتقات والقيود ---------- */
    function derived() {
        var out = [];
        var tr = num(V('F03')), plan = tr === null ? null : 100 - tr;
        var com = num(V('F01')), dec = num(V('F06')); dec = dec === null ? 2 : dec;
        var tg = num(V('tgt.EG')), ups = num(V('S02')), st = num(V('S01'));
        var shares = ups === null ? null : ups + 1;
        var share = calcCtyUnitShare(tg, shares);
        var idealNodes = st !== null ? (Math.pow(2, st) - 1) : null;
        out.push(['نسبة خطة الدخل', fmt(plan, 1) + '%', '100 − نسبة الخزانة']);
        var equiv = (tg !== null && com && plan !== null) ? tg / ((com / 100) * (plan / 100)) : null;
        out.push(['المشتريات المكافئة للهدف الشهري', fmt(equiv, 2) + ' $', 'الهدف ÷ (عمولة التاجر × نسبة الخطة)']);
        out.push(['إجمالي حصص التوزيع (السقف)', shares === null ? '—' : String(shares), 'عدد الـ Uplines + 1 (صانع التوزيع)']);
        out.push(['حصة الفرد المؤهل (مصر مرجعياً)', fmt(share, 2) + ' $', 'حصة خطة الدخل ÷ عدد حصص السقف']);
        var cap = calcCtyDefaultStopper(tg, st, shares);
        out.push(['ديفولت الستوبر المالي (×' + (idealNodes === null ? '2047' : fmt(idealNodes, 0)) + ')', cap === null ? '—' : fmt(cap, 2) + ' $', 'حصة الفرد المؤهل × إجمالي الشجرة المثالية المكتملة']);
        COUNTRIES.forEach(function (c) {
            var act = V('active.' + c.c), r = num(V('rate.' + c.c)), t = num(V('tgt.' + c.c)), cp = num(V('comp.' + c.c));
            var cSh = calcCtyUnitShare(t, shares);
            if (!act) return;
            var loc = (r !== null && t !== null) ? t * r : null;
            var locSh = (r !== null && cSh !== null) ? cSh * r : null;
            out.push(['الهدف المحلي — ' + c.n, fmt(loc, dec) + ' ' + c.cur, 'الهدف بالدولار × سعر الشهر']);
            out.push(['💎 حصة الفرد المؤهل — ' + c.n, (cSh === null ? '—' : ('$' + fmt(cSh, 2) + ' (' + fmt(locSh, dec) + ' ' + c.cur + ')')), 'الهدف الشهري ÷ ' + (shares || 11)]);
            if (cp !== null && t !== null && tr !== null && plan) {
                var uplift = cp - t - t * (tr / plan);
                out.push(['إيرادات إدارية من الأهداف التعويضية — ' + c.n, fmt(uplift, 2) + ' $', 'التعويضي − الشهري − حصة الخزانة المقابلة']);
            }
        });
        var bal = 4850; out.push(['سعة مبيعات تاجر مثال برصيد 4,850', com ? fmt(bal / (com / 100), 0) + ' ج.م' : '—', 'الرصيد ÷ نسبة العمولة']);
        var base = 10000, w1 = num(V('M03')), w2 = num(V('M04')), w3 = num(V('M05'));
        out.push(['مبالغ التنبيه لباقة مثال 10,000', [w1, w2, w3].map(function (x) { return x === null ? '—' : fmt(base * x / 100, 0); }).join(' / '), 'الباقة × (التنبيه الأول / الأخير / العزل)']);
        var close = num(V('M07')), off = num(V('M08'));
        if (close !== null && off !== null) { var rh = ((close - off) % 24 + 24) % 24; out.push(['ساعة التذكير المسائي', (rh < 10 ? '0' : '') + rh + ':00', 'ساعة الإغلاق − فارق التذكير']); }
        out.push(['أول يوم سريان مسموح', nextMonthFirst(0), 'أول الشهر التالي (بلا أثر رجعي)']);
        // فرق شهري تقديري
        var D = window.SAWYAN_ADMIN_DEMO || { gmv_mtd: 1284600 };
        if (com !== null && tr !== null) {
            var c = D.gmv_mtd * com / 100;
            out.push(['عمولات الشهر التقديرية (من الرئيسية)', fmt(c, 0) + ' ج.م', 'GMV × نسبة العمولة']);
            out.push(['  ↳ خزانة الشركة', fmt(c * tr / 100, 0) + ' ج.م', 'العمولات × نسبة الخزانة']);
            out.push(['  ↳ خطة الدخل والأعضاء', fmt(c * (100 - tr) / 100, 0) + ' ج.م', 'العمولات × نسبة الخطة']);
        }
        return out;
    }
    function completeness() {
        var all = G.concat(FX_GLOBAL).map(function (p) { return p.k; });
        CP.forEach(function (p) { COUNTRIES.forEach(function (c) { all.push(p.k + '.' + c.c); }); });
        var cnt = { doc: 0, set: 0, prop: 0, none: 0 };
        all.forEach(function (k) { cnt[srcState(k)]++; });
        return { cnt: cnt, total: all.length };
    }
    function validate() {
        var errs = [], warns = [], keyErr = {};
        function E(k, m) { errs.push(m); if (k) keyErr[k] = m; }
        function W(m) { warns.push(m); }
        var tr = num(V('F03')); if (tr === null || tr < 0 || tr > 100) E('F03', 'نسبة الخزانة يجب أن تكون بين 0 و100.');
        var c = num(V('F01')), cmn = num(V('F02a')), cmx = num(V('F02b'));
        if (cmn !== null && cmx !== null && cmn > cmx) E('F02a', 'الحد الأدنى لعمولة التاجر أكبر من الحد الأقصى.');
        if (c !== null && cmn !== null && c < cmn) E('F01', 'العمولة الافتراضية أقل من الحد الأدنى المسموح.');
        if (c !== null && cmx !== null && c > cmx) E('F01', 'العمولة الافتراضية أكبر من الحد الأقصى المسموح.');
        var w1 = num(V('M03')), w2 = num(V('M04')), w3 = num(V('M05'));
        if (w1 !== null && w2 !== null && w3 !== null && !(w1 > w2 && w2 > w3 && w3 > 0)) E('M03', 'يجب أن يكون: التنبيه الأول > الإنذار الأخير > العزل > 0.');
        var d7 = num(V('W02')), d10 = num(V('W01')); if (d7 !== null && d10 !== null && d7 >= d10) E('W02', 'آخر يوم للتصحيح يجب أن يسبق يوم الصرف.');
        var st = num(V('S01')), up = num(V('S02'));
        if (st !== null && st < 2) E('S01', 'الستوبر العددي لا يقل عن 2.');
        if (up !== null && up < 1) E('S02', 'عدد الـ Uplines لا يقل عن 1.');
        if (st !== null && up !== null && up !== st - 1) W('الستوبر العددي (' + st + ') والسقف (' + (up + 1) + ' حصة) غير متطابقين — تأكد أنه مقصود (قرار D2).');
        var pl = num(V('M13a')); if (pl !== null && (pl < 4 || pl > 8)) E('M13a', 'طول PIN بين 4 و8.');
        COUNTRIES.forEach(function (ct) {
            var r = num(V('rate.' + ct.c)); if (r === null || r <= 0) E('rate.' + ct.c, 'سعر الصرف لـ ' + ct.n + ' يجب أن يكون أكبر من صفر.');
            var oldR = num(ACTIVE['rate.' + ct.c]), dev = num(V('X02'));
            if (r !== null && oldR && dev !== null) { var pct = Math.abs(r - oldR) / oldR * 100; if (pct > dev) W('سعر صرف ' + ct.n + ' يتغير ' + fmt(pct, 1) + '% (أكثر من ' + dev + '%) — يحتاج اعتماداً أعلى.'); }
            var t = num(V('tgt.' + ct.c)); if (t !== null && t <= 0) E('tgt.' + ct.c, 'الهدف الشهري لـ ' + ct.n + ' يجب أن يكون موجباً.');
            var cp = num(V('comp.' + ct.c));
            if (cp !== null && t !== null && tr !== null && tr < 100) { var need = t + t * (tr / (100 - tr)); if (cp + 1e-9 < need) W('الهدف التعويضي لـ ' + ct.n + ' (' + fmt(cp) + ') أقل من الشهري + حصة الخزانة (' + fmt(need) + ').'); }
            var a = num(V('wmin.' + ct.c)), b = num(V('wmax.' + ct.c)), dd = num(V('wday.' + ct.c));
            if (a !== null && b !== null && a > b) E('wmin.' + ct.c, 'أدنى السحب أكبر من أقصاه في ' + ct.n + '.');
            if (b !== null && dd !== null && dd < b) E('wday.' + ct.c, 'السقف اليومي أقل من سقف العملية في ' + ct.n + '.');
            if (V('active.' + ct.c) && !V('legal.' + ct.c)) W(ct.n + ': دولة مفعّلة دون اعتماد قانوني موثق (قرار D18).');
        });
        if (V('W10')) W('وضع التجربة (123456) مفعّل — يجب إغلاقه قبل الإنتاج (قرار D10).');
        return { errs: errs, warns: warns, keyErr: keyErr };
    }
    function impact(chs) {
        var out = [], D = window.SAWYAN_ADMIN_DEMO || { members: { active: 4780 }, merchants: { active: 36 }, gmv_mtd: 1284600 };
        var keys = chs.map(function (c) { return c.k; });
        var fin = keys.filter(function (k) { return k === 'F01' || k === 'F03'; }).length;
        if (fin) {
            var c0 = D.gmv_mtd * num(ACTIVE.F01) / 100, c1 = D.gmv_mtd * num(DRAFT.F01) / 100;
            var t0 = c0 * num(ACTIVE.F03) / 100, t1 = c1 * num(DRAFT.F03) / 100;
            out.push('💰 بنفس حجم مبيعات الشهر: العمولات ' + fmt(c0, 0) + ' ← ' + fmt(c1, 0) + ' • الخزانة ' + fmt(t0, 0) + ' ← ' + fmt(t1, 0) + ' • خطة الدخل ' + fmt(c0 - t0, 0) + ' ← ' + fmt(c1 - t1, 0) + ' ج.م (تقدير، يسري على الفواتير الجديدة فقط).');
        }
        if (keys.some(function (k) { return /^(tgt|comp|rate|S0[1-7]|T0)/.test(k); })) out.push('👥 يمس تأهل ' + fmt(D.members.active, 0) + ' عضواً نشطاً — لا يسري على الشهر الجاري، ويلزم إشعار مسبق.');
        if (keys.some(function (k) { return /^M/.test(k); })) out.push('🏪 يمس ' + D.merchants.active + ' تاجراً نشطاً (ما لم يوجد استثناء خاص بتاجر).');
        if (keys.some(function (k) { return /^(W|wmin|wmax|wday|wfee)/.test(k); })) out.push('💸 يمس السحوبات القادمة وجدول الصرف.');
        return out;
    }

    /* ---------- الرسم ---------- */
    var CSS = '<style>' +
        '.sc{direction:rtl;font-family:Tajawal,sans-serif;color:#0f172a}' +
        '.sc *{box-sizing:border-box}' +
        '.sc-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin-bottom:12px}' +
        '.sc-chip{display:inline-block;font-size:.7rem;font-weight:800;padding:2px 8px;border-radius:6px;margin-inline-start:6px}' +
        '.sc-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
        '.sc-tab{background:white;border:1.5px solid #e2e8f0;border-radius:10px;padding:8px 12px;font-weight:800;font-size:.82rem;cursor:pointer;font-family:Tajawal,sans-serif;color:#475569}' +
        '.sc-tab.on{background:#059669;color:white;border-color:#059669}' +
        '.sc-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);gap:14px;align-items:start}' +
        '@media(max-width:1000px){.sc-grid{grid-template-columns:1fr}}' +
        '.sc-card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:12px}' +
        '.sc-row{padding:10px 0;border-bottom:1px solid #f1f5f9}' +
        '.sc-row:last-child{border-bottom:none}' +
        '.sc-row.chg{background:#fffbeb;border-radius:8px;padding-inline:8px}' +
        '.sc-lab{font-weight:800;font-size:.9rem}' +
        '.sc-help{font-size:.76rem;color:#64748b;margin-top:2px}' +
        '.sc-in{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}' +
        '.sc-in input[type=number],.sc-in input[type=text],.sc-in select{padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font-family:Poppins,Tajawal,sans-serif;font-weight:700;font-size:.9rem;min-width:130px}' +
        '.sc-in input:disabled,.sc-in select:disabled{background:#f1f5f9;color:#64748b}' +
        '.sc-err{color:#b91c1c;font-size:.76rem;font-weight:800;margin-top:4px}' +
        '.sc-btn{border:none;border-radius:9px;padding:9px 16px;font-weight:800;font-size:.84rem;cursor:pointer;font-family:Tajawal,sans-serif}' +
        '.sc-btn.p{background:#059669;color:white}.sc-btn.d{background:#fee2e2;color:#b91c1c}.sc-btn.g{background:#f1f5f9;color:#334155}.sc-btn.b{background:#1d4ed8;color:white}' +
        '.sc-btn:disabled{opacity:.45;cursor:not-allowed}' +
        '.sc-dv{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px dashed #e2e8f0;font-size:.84rem}' +
        '.sc-dv small{display:block;color:#94a3b8;font-size:.68rem}' +
        '.sc-dv b{font-family:Poppins,Tajawal,sans-serif;color:#047857;white-space:nowrap}' +
        '.sc-tbl{width:100%;border-collapse:collapse;font-size:.82rem}' +
        '.sc-tbl th{background:#f1f5f9;padding:8px;text-align:right;font-weight:800}' +
        '.sc-tbl td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:top}' +
        '</style>';

    function chip(state) {
        var m = { doc: ['#dbeafe', '#1e40af', 'من الوثائق'], set: ['#d1fae5', '#065f46', 'معتمد إدارياً'], prop: ['#fef3c7', '#92400e', 'اقتراح اللجنة'], none: ['#fee2e2', '#991b1b', 'بلا قيمة — قرار معلّق'] }[state];
        return '<span class="sc-chip" style="background:' + m[0] + ';color:' + m[1] + '">' + m[2] + '</span>';
    }
    function inputHtml(k, m, readonly) {
        var v = DRAFT[k], dis = (readonly || m.lock) ? ' disabled' : '';
        var idk = 'sc_' + k.replace('.', '_');
        if (m.t === 'toggle') return '<label style="display:flex;align-items:center;gap:8px;font-weight:800"><input type="checkbox" id="' + idk + '" data-k="' + k + '"' + (v ? ' checked' : '') + dis + ' onchange="scSet(\'' + k + '\',this.checked)" style="width:20px;height:20px"> ' + (v ? 'مفعّل' : 'معطّل') + '</label>';
        if (m.t === 'select') return '<select id="' + idk + '" data-k="' + k + '"' + dis + ' onchange="scSet(\'' + k + '\',this.value)">' + m.opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
        if (m.t === 'text') return '<input type="text" id="' + idk + '" data-k="' + k + '" value="' + esc(v) + '" disabled style="min-width:260px">';
        return '<input type="number" id="' + idk + '" data-k="' + k + '" value="' + (v === null || v === undefined ? '' : v) + '" step="' + (m.step || 1) + '"' + (m.min !== undefined ? ' min="' + m.min + '"' : '') + (m.max !== undefined ? ' max="' + m.max + '"' : '') + dis + ' oninput="scSet(\'' + k + '\',this.value)">' + (m.u ? '<span style="font-weight:800;color:#64748b">' + m.u + '</span>' : '');
    }
    function rowHtml(p, readonly) {
        var k = p.k, st = srcState(k);
        return '<div class="sc-row" id="row_' + k.replace('.', '_') + '" data-k="' + k + '">' +
            '<div class="sc-lab">' + esc(p.label) + chip(st) + (p.s ? '<span class="sc-chip" style="background:#f1f5f9;color:#475569">' + esc(p.s) + '</span>' : '') + (p.lock ? '<span class="sc-chip" style="background:#e2e8f0;color:#334155">🔒 مقفل</span>' : '') + '</div>' +
            (p.h ? '<div class="sc-help">' + esc(p.h) + '</div>' : '') +
            '<div class="sc-in">' + inputHtml(k, p, readonly) + '</div><div class="sc-err" id="err_' + k.replace('.', '_') + '"></div></div>';
    }
    function groupHtml(g, readonly) { return '<div class="sc-card">' + G.filter(function (p) { return p.g === g; }).map(function (p) { return rowHtml(p, readonly); }).join('') + '</div>'; }

    function countryHtml(readonly) {
        var ups = num(V('S02')), st = num(V('S01')), shares = ups === null ? 11 : (ups + 1), nodes = st === null ? 2047 : (Math.pow(2, st) - 1);
        var h = '<div class="sc-card"><div style="font-weight:900;margin-bottom:8px">🌍 إدارة الدول والأهداف وحصة الفرد وأسعار الصرف</div><div style="overflow:auto"><table class="sc-tbl"><thead><tr><th>المعامل</th>' + COUNTRIES.map(function (c) { return '<th>' + c.n + '<br><small style="color:#64748b">' + c.cur + ' • ' + c.tz + '</small></th>'; }).join('') + '</tr></thead><tbody>';
        CP.forEach(function (p) {
            h += '<tr><td><b>' + esc(p.label) + '</b>' + (p.tip ? '<div class="sc-help">' + esc(p.tip) + '</div>' : '') + '</td>';
            COUNTRIES.forEach(function (c) {
                var k = p.k + '.' + c.c, m = meta(k);
                m.step = p.step; m.min = p.min;
                h += '<td id="row_' + k.replace('.', '_') + '" data-k="' + k + '">' + chip(srcState(k)) + '<div class="sc-in">' + inputHtml(k, m, readonly) + '</div><div class="sc-err" id="err_' + k.replace('.', '_') + '"></div></td>';
            });
            h += '</tr>';
            if (p.k === 'tgt') {
                h += '<tr style="background:#ecfdf5;"><td><b style="color:#065f46;">💎 حصة الفرد المؤهل من الهدف الشهري ($)</b><div class="sc-help" style="color:#047857;">معادلة تلقائية دائمة = حصة خطة الدخل ÷ عدد أجيال السقف (' + shares + ') • ومنها ديفولت S03 = الحصة × ' + fmt(nodes, 0) + '</div></td>';
                COUNTRIES.forEach(function (c) {
                    var tVal = num(V('tgt.' + c.c)), rVal = num(V('rate.' + c.c));
                    var shUsd = calcCtyUnitShare(tVal, shares);
                    var shLoc = (shUsd !== null && rVal !== null) ? (shUsd * rVal) : null;
                    h += '<td id="derived_share_' + c.c + '"><span class="sc-chip" style="background:#d1fae5;color:#065f46;">محسوب تلقائياً (🔒)</span><div class="sc-in"><input type="text" readonly disabled value="' + (shUsd === null ? '—' : ('$' + fmt(shUsd, 2))) + '" style="background:#ffffff;border-color:#10b981;color:#065f46;font-weight:900;min-width:130px;"></div><div class="sc-help" style="color:#047857;font-weight:700;">' + (shLoc === null ? '' : ('= ' + fmt(shLoc, 2) + ' ' + c.cur)) + '</div></td>';
                });
                h += '</tr>';
            }
        });
        h += '</tbody></table></div></div>';
        h += '<div class="sc-card"><div style="font-weight:900;margin-bottom:6px">إعدادات أسعار الصرف العامة</div>' + FX_GLOBAL.map(function (p) { return rowHtml(p, readonly); }).join('') + '</div>';
        return h;
    }
    function killHtml(readonly) {
        var any = KILL.some(function (k) { return ACTIVE[k[0]]; });
        return '<div class="sc-card" style="border:2px solid ' + (any ? '#dc2626' : '#e2e8f0') + '"><div style="font-weight:900;color:#b91c1c;margin-bottom:4px">🚨 مفاتيح الإيقاف الطارئ (Break-Glass)</div><div class="sc-help" style="margin-bottom:8px">تسري فوراً بلا اعتماد ثانٍ، لكن بسبب إلزامي وتنبيه وتسجيل في سجل التدقيق ومراجعة لاحقة خلال 24 ساعة.</div>' +
            KILL.map(function (k) { var on = !!ACTIVE[k[0]]; return '<div class="sc-row" style="display:flex;justify-content:space-between;align-items:center"><div class="sc-lab">' + k[1] + (on ? '<span class="sc-chip" style="background:#fee2e2;color:#b91c1c">⛔ موقوف الآن</span>' : '<span class="sc-chip" style="background:#d1fae5;color:#065f46">يعمل</span>') + '</div><button class="sc-btn ' + (on ? 'p' : 'd') + '" id="kill_' + k[0] + '" ' + (readonly ? 'disabled' : '') + ' onclick="scKill(\'' + k[0] + '\')">' + (on ? 'استئناف' : 'إيقاف فوراً') + '</button></div>'; }).join('') + '</div>';
    }
    function asideHtml() {
        var d = derived(), v = validate(), chs = changes(), cmp = completeness(), imp = impact(chs), u = curUser();
        var canEdit = u.role !== 'auditor';
        var h = '<div class="sc-card" style="border:2px solid #10b981"><div style="font-weight:900;margin-bottom:6px">🧮 المربعات المشتقة (تتغير تلقائياً)</div>' +
            d.map(function (x) { return '<div class="sc-dv"><div>' + esc(x[0]) + '<small>' + esc(x[2]) + '</small></div><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>';
        h += '<div class="sc-card"><div style="font-weight:900;margin-bottom:6px">🧭 اكتمال القرارات</div><div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:#f1f5f9;margin-bottom:6px">' +
            ['doc', 'set', 'prop', 'none'].map(function (s) { var col = { doc: '#3b82f6', set: '#10b981', prop: '#f59e0b', none: '#ef4444' }[s]; return '<div style="width:' + (cmp.cnt[s] / cmp.total * 100) + '%;background:' + col + '"></div>'; }).join('') + '</div>' +
            '<div style="font-size:.78rem;line-height:1.8">من الوثائق: <b>' + cmp.cnt.doc + '</b> • معتمد إدارياً: <b>' + cmp.cnt.set + '</b><br>اقتراح لجنة: <b style="color:#b45309">' + cmp.cnt.prop + '</b> • بلا قيمة: <b style="color:#b91c1c" id="cntNone">' + cmp.cnt.none + '</b> من <b>' + cmp.total + '</b></div></div>';
        h += '<div class="sc-card"><div style="font-weight:900;margin-bottom:6px">🔎 فحص الاتساق</div>' +
            (v.errs.length ? v.errs.map(function (e) { return '<div class="sc-err">⛔ ' + esc(e) + '</div>'; }).join('') : '<div style="color:#047857;font-weight:800;font-size:.84rem">✅ لا أخطاء تمنع الحفظ</div>') +
            v.warns.map(function (w) { return '<div style="color:#b45309;font-size:.78rem;font-weight:700;margin-top:4px">⚠ ' + esc(w) + '</div>'; }).join('') + '</div>';
        h += '<div class="sc-card" style="border:2px solid ' + (chs.length ? '#f59e0b' : '#e2e8f0') + '"><div style="font-weight:900;margin-bottom:6px">📝 التغييرات غير المرسلة (' + chs.length + ')</div>';
        if (!chs.length) h += '<div class="sc-help">لا توجد تغييرات.</div>';
        else {
            h += chs.map(function (c) { return '<div style="font-size:.8rem;padding:4px 0;border-bottom:1px dashed #e2e8f0"><b>' + esc(c.label) + '</b><br><span style="color:#b91c1c">' + esc(showVal(c.k, c.old)) + '</span> ← <span style="color:#047857;font-weight:800">' + esc(showVal(c.k, c.nw)) + '</span></div>'; }).join('');
            if (imp.length) h += '<div style="margin-top:8px;background:#eff6ff;border-radius:8px;padding:8px;font-size:.76rem;line-height:1.7"><b>محاكاة الأثر قبل الاعتماد:</b><br>' + imp.map(esc).join('<br>') + '</div>';
            h += '<div style="margin-top:8px"><label class="sc-help">سبب التغيير (إلزامي)</label><textarea id="scReason" rows="2" style="width:100%;padding:8px;border:1.5px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif" placeholder="مثال: قرار المؤسس بتاريخ ..."></textarea>' +
                '<label class="sc-help" style="margin-top:6px;display:block">تاريخ السريان (بلا أثر رجعي)</label><select id="scEff" style="width:100%;padding:8px;border:1.5px solid #cbd5e1;border-radius:8px"><option value="' + nextMonthFirst(0) + '">' + nextMonthFirst(0) + ' (أول الشهر القادم)</option><option value="' + nextMonthFirst(1) + '">' + nextMonthFirst(1) + '</option><option value="' + nextMonthFirst(2) + '">' + nextMonthFirst(2) + '</option></select>' +
                '<div style="display:flex;gap:8px;margin-top:8px"><button class="sc-btn p" id="scSubmit" ' + ((v.errs.length || !canEdit) ? 'disabled' : '') + ' onclick="scSubmit()">إرسال للاعتماد</button><button class="sc-btn g" id="scDiscard" onclick="scDiscard()">تجاهل التغييرات</button></div>' +
                (v.errs.length ? '<div class="sc-err">أصلح الأخطاء أولاً.</div>' : '') + (!canEdit ? '<div class="sc-err">دور «مدقّق» للقراءة فقط.</div>' : '') + '</div>';
        }
        return h + '</div>';
    }
    function msgPreview() {
        var tg = num(V('tgt.EG')), r = num(V('rate.EG')), dec = num(V('F06')); dec = dec === null ? 2 : dec;
        var w1 = num(V('M03')), w2 = num(V('M04')), pd = num(V('W01'));
        return '<div class="sc-card"><div style="font-weight:900;margin-bottom:6px">✉️ قوالب الرسائل (أرقامها متغيرات لا نصوص)</div>' +
            '<div class="sc-help" style="line-height:1.9;background:#f8fafc;padding:8px;border-radius:8px">«هدفك الشهري <b>' + fmt(tg !== null && r !== null ? tg * r : null, dec) + ' ج.م</b> (' + fmt(tg, 2) + '$) — تأكيد صرف أرباحك يوم <b>' + (pd === null ? '—' : pd) + '</b> من الشهر القادم (تقديري وغير مضمون).»<br>«تنبيه لصاحب المتجر: رصيد شحنك وصل إلى <b>' + (w1 === null ? '—' : w1) + '%</b>، والإنذار الأخير عند <b>' + (w2 === null ? '—' : w2) + '%</b>.»</div></div>';
    }

    function aprHtml() {
        var u = curUser(), h = '<div class="sc-card"><div style="font-weight:900;margin-bottom:8px">✅ طلبات تغيير المعاملات (Maker–Checker)</div><div class="sc-help" style="margin-bottom:8px">قاعدة الأربع عيون: مُنشئ الطلب لا يعتمده. المستخدم الحالي: <b>' + esc(u.n) + '</b></div>';
        if (!ST.pending.length) h += '<div class="sc-help" id="noPending">لا توجد طلبات بعد. غيّر قيمة في أي تبويب ثم اضغط «إرسال للاعتماد».</div>';
        ST.pending.slice().reverse().forEach(function (r) {
            var colr = { PENDING: '#f59e0b', APPROVED: '#3b82f6', ACTIVE: '#10b981', REJECTED: '#ef4444' }[r.status];
            var lab = { PENDING: 'بانتظار الاعتماد', APPROVED: 'معتمد — بانتظار تاريخ السريان', ACTIVE: 'سارٍ', REJECTED: 'مرفوض' }[r.status];
            h += '<div class="sc-card" style="border-right:5px solid ' + colr + '" id="cr_' + r.id + '"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px"><b>' + r.id + '</b><span class="sc-chip" style="background:#f1f5f9">' + lab + '</span></div>' +
                '<div class="sc-help">قدّمه: ' + esc(r.by) + ' • ' + r.at + ' • سريان: ' + r.effective + '</div><div style="font-size:.84rem;margin:6px 0"><b>السبب:</b> ' + esc(r.reason) + '</div>' +
                r.changes.map(function (c) { return '<div style="font-size:.8rem;padding:3px 0;border-bottom:1px dashed #e2e8f0">' + esc(c.label) + ': <span style="color:#b91c1c">' + esc(showVal(c.k, c.old)) + '</span> ← <span style="color:#047857;font-weight:800">' + esc(showVal(c.k, c.nw)) + '</span></div>'; }).join('') +
                (r.note ? '<div class="sc-help" style="margin-top:6px">ملاحظة المراجع (' + esc(r.checker) + '): ' + esc(r.note) + '</div>' : '');
            if (r.status === 'PENDING') {
                var founder = isFounderSession(), self = (r.byId === u.id) && !founder, can = founder || (u.role === 'checker' && !self);
                h += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="sc-btn p" id="ap_' + r.id + '" ' + (can ? '' : 'disabled') + ' onclick="scApprove(\'' + r.id + '\')">اعتماد</button><button class="sc-btn d" id="rj_' + r.id + '" ' + (can ? '' : 'disabled') + ' onclick="scReject(\'' + r.id + '\')">رفض</button>' +
                    (!can ? '<span class="sc-err">' + (self ? 'لا يمكنك اعتماد طلبك (فصل المهام).' : 'يلزم مستخدم بدور «مُعتمِد».') + '</span>' : '') + '</div>';
            }
            if (r.status === 'APPROVED') h += '<div style="margin-top:8px"><button class="sc-btn b" id="ac_' + r.id + '" onclick="scActivate(\'' + r.id + '\')">⏩ محاكاة وصول تاريخ السريان وتفعيل الإصدار</button></div>';
            h += '</div>';
        });
        return h + '</div>';
    }
    function verHtml() {
        return '<div class="sc-card"><div style="font-weight:900;margin-bottom:8px">🗂️ الإصدارات (القيمة السارية وقت أي عملية تُقرأ من إصدارها)</div><table class="sc-tbl"><thead><tr><th>الإصدار</th><th>السريان</th><th>أقرّه</th><th>السبب</th><th>التغييرات</th></tr></thead><tbody>' +
            ST.history.slice().reverse().map(function (x) { return '<tr><td><b>v' + x.ver + '</b>' + (x.ver === ST.version ? ' <span class="sc-chip" style="background:#d1fae5;color:#065f46">الساري</span>' : '') + '</td><td>' + x.effective + '</td><td>' + esc(x.by) + ' ← ' + esc(x.approvedBy) + '</td><td>' + esc(x.reason) + '</td><td>' + (x.changes.length ? x.changes.map(function (c) { return esc(c.label) + ': ' + esc(showVal(c.k, c.old)) + ' ← ' + esc(showVal(c.k, c.nw)); }).join('<br>') : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function audHtml() {
        return '<div class="sc-card"><div style="font-weight:900;margin-bottom:4px">📜 سجل التدقيق (إضافة فقط — لا تعديل ولا حذف)</div><div class="sc-help" style="margin-bottom:8px">عدد السجلات: <b id="audCount">' + ST.audit.length + '</b> • في الإنتاج: Hash لكل سجل + عنوان IP + مدة احتفاظ ' + (V('Y05') || '—') + ' سنوات.</div><table class="sc-tbl"><thead><tr><th>الوقت</th><th>المنفّذ</th><th>الحدث</th><th>التفاصيل</th></tr></thead><tbody>' +
            ST.audit.map(function (a) { return '<tr><td style="white-space:nowrap">' + a.t + '</td><td>' + esc(a.a) + '</td><td><b>' + esc(a.act) + '</b></td><td>' + esc(a.d) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function admHtml() {
        var perms = [['تعديل المعاملات (إنشاء طلب)', 1, 0, 0], ['اعتماد/رفض طلب تغيير', 0, 1, 0], ['اعتماد طلبك أنت', 0, 0, 0], ['تفعيل مفاتيح الإيقاف الطارئ', 1, 1, 0], ['عرض سجل التدقيق والإصدارات', 1, 1, 1], ['تصدير البيانات', 0, 1, 1]];
        return '<div class="sc-card"><div style="font-weight:900;margin-bottom:8px">🔐 الأدوار والصلاحيات (فصل المهام)</div><table class="sc-tbl"><thead><tr><th>الصلاحية</th><th>مُنشئ</th><th>مُعتمِد</th><th>مدقّق</th></tr></thead><tbody>' +
            perms.map(function (p) { return '<tr><td>' + p[0] + '</td>' + [1, 2, 3].map(function (i) { return '<td>' + (p[i] ? '✅' : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
            '<div class="sc-help" style="margin-top:8px">مطلوب بالإنتاج: مصادقة ثنائية، جلسات محدودة، سجل وصول، ومنع أي مدير من اعتماد عمليات حسابه أو أقاربه.</div>' +
            '<div style="margin-top:10px"><button class="sc-btn g" id="scReset" onclick="scReset()">🔄 إعادة تعيين التجربة</button></div></div>';
    }

    function bodyFor(tab, ro) {
        if (tab === 'fin') return groupHtml('fin', ro);
        if (tab === 'stp') return groupHtml('stp', ro);
        if (tab === 'cty') return countryHtml(ro);
        if (tab === 'mer') return groupHtml('mer', ro);
        if (tab === 'mem') return groupHtml('mem', ro);
        if (tab === 'sys') return groupHtml('sys', ro) + killHtml(ro);
        if (tab === 'apr') return aprHtml();
        if (tab === 'ver') return verHtml();
        if (tab === 'aud') return audHtml();
        return admHtml();
    }
    function render() {
        var page = document.getElementById('settingsPage'); if (!page) return;
        var u = curUser(), ro = (u.role === 'auditor');
        var pend = ST.pending.filter(function (r) { return r.status === 'PENDING'; }).length;
        var anyKill = KILL.filter(function (k) { return ACTIVE[k[0]]; });
        var isEditTab = ['fin', 'stp', 'cty', 'mer', 'mem', 'sys'].indexOf(TAB) !== -1;
        page.innerHTML = CSS + '<div class="sc">' +
            '<div class="sc-top"><div><div style="font-size:1.1rem;font-weight:900">⚙️ مركز معاملات النظام</div><div class="sc-help">كل رقم حاكم هنا — لا يُكتب في الكود ولا في نص رسالة. <span class="sc-chip" style="background:#fef3c7;color:#92400e">🧪 نموذج تشغيلي — يحفظ في المتصفح فقط</span></div></div>' +
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="sc-chip" style="background:#d1fae5;color:#065f46;font-size:.8rem" id="scVer">الإصدار الساري: v' + ST.version + '</span>' +
            '<label class="sc-help">المستخدم الحالي:</label><select id="scUser" onchange="scUser(this.value)" style="padding:7px;border:1.5px solid #cbd5e1;border-radius:8px;font-family:Tajawal,sans-serif;font-weight:700">' + USERS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === u.id ? ' selected' : '') + '>' + x.n + '</option>'; }).join('') + '</select></div></div>' +
            (anyKill.length ? '<div id="killBanner" style="background:#fee2e2;border:2px solid #dc2626;color:#991b1b;border-radius:12px;padding:10px 14px;margin-bottom:12px;font-weight:900">🚨 إيقاف طارئ مفعّل: ' + anyKill.map(function (k) { return k[1]; }).join(' • ') + '</div>' : '') +
            '<div class="sc-tabs">' + TABS.map(function (t) { return '<button class="sc-tab' + (t[0] === TAB ? ' on' : '') + '" data-tab="' + t[0] + '" onclick="scTab(\'' + t[0] + '\')">' + t[1] + (t[0] === 'apr' && pend ? ' (' + pend + ')' : '') + '</button>'; }).join('') + '</div>' +
            (isEditTab ? '<div class="sc-grid"><div id="scBody">' + bodyFor(TAB, ro) + (TAB === 'fin' ? msgPreview() : '') + '</div><div id="scAside">' + asideHtml() + '</div></div>' : '<div id="scBody">' + bodyFor(TAB, ro) + '</div>') + '</div>';
        refreshDynamic();
    }
    function refreshDynamic() {
        var v = validate(), chs = changes();
        var chk = {}; chs.forEach(function (c) { chk[c.k] = 1; });
        document.querySelectorAll('#scBody [data-k]').forEach(function (el) {
            var k = el.getAttribute('data-k'); var rowEl = document.getElementById('row_' + k.replace('.', '_')) || el;
            if (rowEl && rowEl.classList) rowEl.classList.toggle('chg', !!chk[k]);
            var er = document.getElementById('err_' + k.replace('.', '_')); if (er) er.textContent = v.keyErr[k] ? '⛔ ' + v.keyErr[k] : '';
        });
    }
    function refreshAside() {
        var rEl = document.getElementById('scReason'), eEl = document.getElementById('scEff');
        var keepReason = rEl ? rEl.value : '', keepEff = eEl ? eEl.value : '';
        var a = document.getElementById('scAside'); if (a) a.innerHTML = asideHtml();
        var r2 = document.getElementById('scReason'), e2 = document.getElementById('scEff');
        if (r2 && keepReason) r2.value = keepReason;
        if (e2 && keepEff) e2.value = keepEff;
        var mp = document.getElementById('scBody'); // رسائل القوالب تتحدث مع الإدخال
        if (TAB === 'fin' && mp) { var cards = mp.querySelectorAll('.sc-card'); var last = cards[cards.length - 1]; if (last) last.outerHTML = msgPreview(); }
        refreshDynamic();
    }

    /* ---------- الأفعال ---------- */
    window.scSet = function (k, val) {
        var oldUps = num(V('S02')), oldSt = num(V('S01'));
        var oldShares = oldUps === null ? 11 : (oldUps + 1);
        var prevDefs = {};
        COUNTRIES.forEach(function (c) {
            prevDefs[c.c] = calcCtyDefaultStopper(num(V('tgt.' + c.c)), oldSt === null ? 11 : oldSt, oldShares);
        });

        var m = meta(k);
        if (m.t === 'toggle') DRAFT[k] = !!val;
        else if (m.t === 'select' || m.t === 'text') DRAFT[k] = val;
        else DRAFT[k] = (val === '' || val === null) ? null : Number(val);

        // تحديث ديفولت الستوبر المالي وحصة الفرد تلقائياً عند تغيير الهدف الشهري أو S01 أو S02
        if (k.indexOf('tgt.') === 0 || k.indexOf('rate.') === 0 || k === 'S01' || k === 'S02') {
            var newUps = num(V('S02')), newSt = num(V('S01'));
            var newShares = newUps === null ? 11 : (newUps + 1);
            COUNTRIES.forEach(function (c) {
                var curFstop = num(DRAFT['fstop.' + c.c]);
                var newDef = calcCtyDefaultStopper(num(V('tgt.' + c.c)), newSt === null ? 11 : newSt, newShares);
                if (newDef !== null && (curFstop === null || (prevDefs[c.c] !== null && Math.abs(curFstop - prevDefs[c.c]) < 0.01))) {
                    DRAFT['fstop.' + c.c] = newDef;
                    var fIn = document.getElementById('sc_fstop_' + c.c);
                    if (fIn) fIn.value = newDef;
                }
                var shCell = document.getElementById('derived_share_' + c.c);
                if (shCell) {
                    var shU = calcCtyUnitShare(num(V('tgt.' + c.c)), newShares);
                    var rU = num(V('rate.' + c.c));
                    var shInp = shCell.querySelector('input');
                    var shHlp = shCell.querySelectorAll('.sc-help');
                    if (shInp) shInp.value = shU === null ? '—' : ('$' + fmt(shU, 2));
                    if (shHlp && shHlp.length) shHlp[shHlp.length - 1].textContent = (shU !== null && rU !== null) ? ('= ' + fmt(shU * rU, 2) + ' ' + c.cur) : '';
                }
            });
        }
        refreshAside();
    };
    window.scTab = function (t) { TAB = t; render(); };
    window.scUser = function (id) { localStorage.setItem(USER_LS, id); render(); };
    window.scDiscard = function () { DRAFT = JSON.parse(JSON.stringify(ACTIVE)); render(); };
    window.scSubmit = function () {
        var v = validate(), chs = changes(), u = curUser();
        if (u.role === 'auditor') { alert('دور «مدقّق» للقراءة فقط.'); return; }
        if (!chs.length) return;
        if (v.errs.length) { alert('أصلح الأخطاء أولاً:\n' + v.errs.join('\n')); return; }
        var reason = (document.getElementById('scReason').value || '').trim();
        if (reason.length < 5) { alert('سبب التغيير إلزامي (5 أحرف على الأقل).'); return; }
        var eff = document.getElementById('scEff').value;
        ST.seq++; var id = 'CR-' + (ST.seq < 10 ? '00' : ST.seq < 100 ? '0' : '') + ST.seq;
        if (isFounderSession()) {
            chs.forEach(function (c) { ACTIVE[c.k] = c.nw; });
            ST.version++;
            ST.pending.push({ id: id, at: now(), by: 'ahmed (المؤسس السيادي)', byId: u.id, checker: 'ahmed (أمر سيادي فوري)', checkerId: u.id, reason: reason, effective: eff, status: 'ACTIVE', changes: chs });
            ST.history.push({ ver: ST.version, at: now(), by: 'ahmed (المؤسس)', approvedBy: 'صلاحية المؤسس المطلقة', reason: reason, effective: eff, changes: chs });
            log('SOVEREIGN_FOUNDER_APPLIED', id + ' — اعتماد وتفعيل سيادي فوري بصلاحية المؤسس المطلقة (v' + ST.version + ')');
            save();
            DRAFT = JSON.parse(JSON.stringify(ACTIVE)); render();
            alert('👑 تم تطبيق وتفعيل التعديلات فوراً (الإصدار v' + ST.version + ') بصلاحية المؤسس السيادية المطلقة!');
            return;
        }
        ST.pending.push({ id: id, at: now(), by: u.n, byId: u.id, reason: reason, effective: eff, status: 'PENDING', changes: chs });
        log('CHANGE_REQUEST_SUBMITTED', id + ' — ' + chs.length + ' تغيير — سريان ' + eff + ' — السبب: ' + reason);
        DRAFT = JSON.parse(JSON.stringify(ACTIVE)); TAB = 'apr'; render();
        alert('✅ أُرسل الطلب ' + id + ' للاعتماد. القيم السارية لم تتغير بعد.');
    };
    function findReq(id) { return ST.pending.filter(function (r) { return r.id === id; })[0]; }
    window.scApprove = function (id) {
        var r = findReq(id), u = curUser();
        if (!r || r.status !== 'PENDING') return;
        if (!isFounderSession() && u.role !== 'checker') { alert('يلزم دور «مُعتمِد».'); return; }
        if (!isFounderSession() && r.byId === u.id) { alert('لا يمكنك اعتماد طلبك (فصل المهام).'); return; }
        // فحص تعارض: القيمة القديمة لم تعد مطابقة للسارية
        var stale = r.changes.filter(function (c) { return String(ACTIVE[c.k] === null ? '' : ACTIVE[c.k]) !== String(c.old === null ? '' : c.old); });
        if (stale.length) { alert('⛔ تعارض: تغيّرت القيمة السارية منذ إنشاء الطلب لـ: ' + stale.map(function (s) { return s.label; }).join('، ') + '\nيلزم إنشاء طلب جديد.'); return; }
        r.status = 'APPROVED'; r.checker = u.n; r.checkerId = u.id;
        log('CHANGE_REQUEST_APPROVED', id + ' بواسطة ' + u.n + ' — بانتظار تاريخ السريان ' + r.effective);
        render();
    };
    window.scReject = function (id) {
        var r = findReq(id), u = curUser();
        if (!r || r.status !== 'PENDING' || u.role !== 'checker' || r.byId === u.id) return;
        var why = prompt('سبب الرفض (إلزامي):', 'غير مبرَّر كفاية');
        if (!why) return;
        r.status = 'REJECTED'; r.checker = u.n; r.note = why;
        log('CHANGE_REQUEST_REJECTED', id + ' — ' + why);
        render();
    };
    window.scActivate = function (id) {
        var r = findReq(id); if (!r || r.status !== 'APPROVED') return;
        r.changes.forEach(function (c) { ACTIVE[c.k] = c.nw; ST.approved[c.k] = true; });
        ST.version++; r.status = 'ACTIVE';
        ST.history.push({ ver: ST.version, at: now(), by: r.by, approvedBy: r.checker, reason: r.reason, effective: r.effective, changes: r.changes });
        log('VERSION_ACTIVATED', 'v' + ST.version + ' من الطلب ' + id + ' — سريان ' + r.effective);
        DRAFT = JSON.parse(JSON.stringify(ACTIVE)); save(); render();
    };
    window.scKill = function (k) {
        var u = curUser(); if (u.role === 'auditor') { alert('دور «مدقّق» للقراءة فقط.'); return; }
        var on = !ACTIVE[k], name = KILL.filter(function (x) { return x[0] === k; })[0][1];
        var why = prompt((on ? 'سبب ' : 'سبب استئناف ') + name + ' (إلزامي):', '');
        if (!why || why.trim().length < 3) return;
        ACTIVE[k] = on; DRAFT[k] = on;
        log(on ? 'BREAK_GLASS_ON' : 'BREAK_GLASS_OFF', name + ' — السبب: ' + why + ' — مراجعة لاحقة خلال 24 ساعة');
        save(); render();
    };
    window.scReset = function () {
        if (!confirm('إعادة تعيين التجربة: يمحو الإصدارات والطلبات والسجل. متابعة؟')) return;
        localStorage.removeItem(LS); load(); ST.audit.unshift({ t: now(), a: curUser().n, act: 'DEMO_RESET', d: 'أُعيد ضبط المحاكاة' }); save(); TAB = 'fin'; render();
    };

    // التوصيل مع شاشة الإعدادات
    load();
    window.loadSettings = function () { DRAFT = JSON.parse(JSON.stringify(ACTIVE)); render(); };
    window.SAWYAN_PARAMS = { get: function (k) { return ACTIVE[k]; }, all: function () { return JSON.parse(JSON.stringify(ACTIVE)); }, count: function () { return completeness(); } };
})();
