/**
 * ============================================================================
 * SAWYAN V3.0 — Unified Responsive App Shell Controller (D30)
 * - Compact Rail Drawer Toggle for 600px–1023px half-screen mode
 * - Automatic `data-label` injection + `.table-responsive-wrap` guard
 * - Single Navigation Schema sync between `.sidebar-nav` & `#moreMenu`
 * ============================================================================
 */
(function () {
    'use strict';

    function setupRailToggle() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        if (!document.getElementById('appShellBackdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'appShellBackdrop';
            backdrop.className = 'app-shell-backdrop';
            backdrop.addEventListener('click', function () {
                sidebar.classList.remove('rail-expanded');
                backdrop.classList.remove('open');
            });
            document.body.appendChild(backdrop);
        }

        if (!document.getElementById('appShellRailToggle')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'appShellRailToggle';
            btn.className = 'app-shell-rail-toggle';
            btn.setAttribute('aria-label', 'توسيع أو طي القائمة الجانبية');
            btn.title = 'توسيع / طي القائمة';
            btn.textContent = '☰';
            btn.addEventListener('click', function () {
                const expanded = sidebar.classList.toggle('rail-expanded');
                const bd = document.getElementById('appShellBackdrop');
                if (bd) bd.classList.toggle('open', expanded);
            });
            sidebar.insertBefore(btn, sidebar.firstChild);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('rail-expanded')) {
                sidebar.classList.remove('rail-expanded');
                const bd = document.getElementById('appShellBackdrop');
                if (bd) bd.classList.remove('open');
            }
        });

        sidebar.querySelectorAll('.nav-item').forEach(function (item) {
            const labelSpan = item.querySelector('span:not(.icon):not(.nav-icon)');
            const txt = labelSpan ? labelSpan.textContent.trim() : item.textContent.trim();
            if (txt && !item.getAttribute('title')) {
                item.setAttribute('title', txt);
            }
            item.addEventListener('click', function () {
                if (sidebar.classList.contains('rail-expanded')) {
                    sidebar.classList.remove('rail-expanded');
                    const bd = document.getElementById('appShellBackdrop');
                    if (bd) bd.classList.remove('open');
                }
            });
        });
    }

    function syncMobileMoreMenuFromSidebar() {
        const moreItems = document.querySelector('#moreMenu .more-menu-items');
        const sidebarItems = document.querySelectorAll('.sidebar-nav .nav-item');
        if (!moreItems || !sidebarItems.length) return;

        const bottomPages = new Set();
        document.querySelectorAll('.bottom-nav .bottom-nav-item[data-page]').forEach(function (el) {
            const p = el.getAttribute('data-page');
            if (p && p !== 'more') bottomPages.add(p);
        });

        const existingMorePages = new Set();
        moreItems.querySelectorAll('.more-menu-item[data-page]').forEach(function (el) {
            const p = el.getAttribute('data-page');
            if (p) existingMorePages.add(p);
        });

        const logoutItem = moreItems.querySelector('.more-menu-item.logout');

        sidebarItems.forEach(function (nav) {
            const page = nav.getAttribute('data-page');
            if (!page || bottomPages.has(page) || existingMorePages.has(page)) return;

            const iconEl = nav.querySelector('.icon, .nav-icon');
            const labelEl = nav.querySelector('span:not(.icon):not(.nav-icon)');
            const iconText = iconEl ? iconEl.textContent.trim() : '•';
            const labelText = labelEl ? labelEl.textContent.trim() : page;

            const a = document.createElement('a');
            a.href = '#';
            a.className = 'more-menu-item';
            a.setAttribute('data-page', page);
            a.innerHTML = '<span>' + iconText + '</span> ' + labelText;
            a.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof window.closeMoreMenu === 'function') window.closeMoreMenu();
                nav.click();
            });

            if (logoutItem) {
                moreItems.insertBefore(a, logoutItem);
            } else {
                moreItems.appendChild(a);
            }
            existingMorePages.add(page);
        });
    }

    function enhanceTablesAndLabels() {
        const tables = document.querySelectorAll('.main-content table, .modal table');
        tables.forEach(function (tbl) {
            if (tbl.closest('.tree-canvas, .tree-viewport, [data-no-responsive-table="1"]')) return;

            if (!tbl.closest('.table-responsive-wrap, .table-container')) {
                const parent = tbl.parentElement;
                if (parent) {
                    const wrap = document.createElement('div');
                    wrap.className = 'table-responsive-wrap';
                    parent.insertBefore(wrap, tbl);
                    wrap.appendChild(tbl);
                }
            }

            const ths = Array.from(tbl.querySelectorAll('thead th')).map(function (th) {
                return th.textContent.trim();
            });
            if (!ths.length) return;

            tbl.setAttribute('data-has-labels', '1');
            tbl.querySelectorAll('tbody tr').forEach(function (tr) {
                const cells = tr.querySelectorAll('td');
                if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                    cells[0].setAttribute('data-label', '');
                    return;
                }
                cells.forEach(function (td, idx) {
                    if (!td.getAttribute('data-label') && ths[idx]) {
                        td.setAttribute('data-label', ths[idx]);
                    }
                });
            });
        });
    }

    let rafPending = false;
    function scheduleEnhance() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(function () {
            rafPending = false;
            enhanceTablesAndLabels();
            syncMobileMoreMenuFromSidebar();
        });
    }

    function ensureDashboardBrandBar() {
        const mainContent = document.querySelector('.main-content');
        const homeHref = (window.SAWYAN && window.SAWYAN.Logo && typeof window.SAWYAN.Logo.homeHref === 'function')
            ? window.SAWYAN.Logo.homeHref()
            : '../index.html';

        if (mainContent && !document.getElementById('appShellMobileBrandBar')) {
            const bar = document.createElement('div');
            bar.id = 'appShellMobileBrandBar';
            bar.className = 'app-shell-mobile-brand-bar';
            bar.setAttribute('role', 'banner');

            const logoMarkup = (window.SAWYAN && window.SAWYAN.Logo && typeof window.SAWYAN.Logo.svg === 'function')
                ? window.SAWYAN.Logo.svg('default', { compact: true })
                : '<strong style="font-family:Poppins,sans-serif;font-weight:800;color:#0f2744;font-size:1.12rem;">SAWYAN</strong>';

            bar.innerHTML = `<a href="${homeHref}" class="logo-link sawyan-home-logo" data-sawyan-logo="default" data-sawyan-compact="1" aria-label="SAWYAN — العودة للصفحة الرئيسية" title="العودة للصفحة الرئيسية">${logoMarkup}</a><a href="${homeHref}" class="app-shell-home-btn">🌐 الموقع</a>`;
            mainContent.insertBefore(bar, mainContent.firstChild);
        }

        const sidebarLogoBox = document.querySelector('.sidebar #logoContainer');
        if (sidebarLogoBox && !sidebarLogoBox.querySelector('.sawyan-brand-mark') && window.SAWYAN && window.SAWYAN.Logo && typeof window.SAWYAN.Logo.link === 'function') {
            sidebarLogoBox.innerHTML = window.SAWYAN.Logo.link('light-on-dark', { href: homeHref });
        }
    }

    // ========================================================================
    // 4. Universal Contextual [؟] Help Popover System (`SAWYAN.Help` / `svHelpBtn`)
    // ========================================================================
    const HELP_TOPICS = {
        prepaid_balance: {
            title: '💵 رصيد التاجر المشحون (الرصيد المسبق)',
            what: 'هو المبلغ النقدي الذي حوّله التاجر مسبقاً لتغطية عمولات مبيعاته لأعضاء سويا. كلما اشترى عضو من المتجر، تُخصم عمولة العملية تلقائياً من هذا الرصيد.',
            example: 'إذا شحن التاجر 2,000 ج.م وكانت نسبة عمولته 10%، فهذا الرصيد يغطي مبيعات للأعضاء حتى 20,000 ج.م.',
            ifBlank: 'إذا وصل الرصيد إلى صفر ولم يكن للتاجر سقف ائتماني، يتوقف المتجر مؤقتاً عن الظهور في الرادار حتى يعيد الشحن.'
        },
        credit_limit: {
            title: '💳 السقف الائتماني المسموح للتاجر (البيع الآجل)',
            what: 'مبلغ استثنائي تمنحه الإدارة للتاجر الموثوق ليتمكن من توثيق فواتير الأعضاء حتى لو كان رصيده المشحون صفراً (يعمل بالآجل ثم يسدد لاحقاً).',
            example: 'إذا كان رصيد التاجر 0 ومنحته سقفاً ائتمانياً 1,000 ليرة، يمكنه توثيق فواتير حتى تُستهلك الـ 1,000 ليرة كعمولات (يظهر رصيده بالسالب حتى يسدد).',
            ifBlank: 'القيمة الافتراضية هي 0 (أي أن التاجر يعمل بالشحن المسبق فقط بدون مديونية).'
        },
        free_net_balance: {
            title: '🛡️ الصافي الحر المتاح للتغطية',
            what: 'هو القدرة المالية الفعلية المتاحة للتاجر الآن لقبول فواتير جديدة، ويُحسب تلقائياً بالمعادلة: (الرصيد المشحون − المبالغ المحجوزة لفواتير معلقة + السقف الائتماني).',
            example: 'تاجر رصيده المشحون 500 وعليه فواتير معلقة بـ 100 ولديه سقف ائتماني 1,000 → الصافي الحر المتاح له = 1,400.',
            ifBlank: 'حقل يُحسب آلياً لحظة بلحظة من دفتر الأستاذ.'
        },
        credit_cycle_days: {
            title: '🗓️ مدة دورة تسوية الائتمان (بالأيام)',
            what: 'عدد الأيام المسموح للتاجر أن يعمل خلالها بالسقف الائتماني (الرصيد السالب) قبل أن يطالبه النظام بتسديد المديونية المستحقة.',
            example: 'إذا وُضعت 7 أيام، تُغلق فاتورة مديونية التاجر كل 7 أيام من أول عملية بيع بالآجل ويُمنح مهلة السماح لسدادها.',
            ifBlank: 'إذا تركته فارغاً، يطبق النظام الإعداد العام الافتراضي للمنصة تلقائياً.'
        },
        credit_cutoff_time: {
            title: '🕒 ساعة إغلاق دورة الائتمان اليومية',
            what: 'الساعة المحددة في نهاية يوم استحقاق دورة الائتمان التي يتم عندها إغلاق الحساب المطالب بسداده.',
            example: 'عند ضبطها على 23:59، ينتهي يوم الدورة في تمام الساعة 11:59 مساءً وتبدأ بعدها ساعات مهلة السماح.',
            ifBlank: 'إذا تركته فارغاً، يطبق النظام الساعة الافتراضية العامة (23:59).'
        },
        credit_grace_hours: {
            title: '⏳ مهلة السماح بالساعات لسداد الائتمان',
            what: 'عدد الساعات الإضافية التي يمنحها النظام للتاجر بعد انتهاء دورة الائتمان ليقوم بتحويل المبلغ المستحق قبل أن يتم إخفاء متجره مؤقتاً.',
            example: 'إذا كانت المهلة 24 ساعة، يظل المتجر ظاهراً ويعمل لمدة 24 ساعة بعد إغلاق الدورة ليتمكن من التحويل البنكي دون انقطاع.',
            ifBlank: 'إذا تركته فارغاً، يطبق النظام مهلة السماح العامة المعتمدة في الإعدادات.'
        },
        unsecured_queue_cap: {
            title: '⏸️ الحد الأقصى للفواتير المنتظرة بعد نفاد الرصيد',
            what: 'عدد فواتير الأعضاء التي يقبل النظام حفظها في «طابور الانتظار» إذا نفد رصيد التاجر فجأة أثناء وجود زبون في المحل، بحيث تُعتمد تلقائياً فور شحن التاجر لرصيده.',
            example: 'إذا كانت القيمة 3، ونفد رصيد التاجر، يمكن لـ 3 أعضاء تسجيل فواتيرهم وتُحفظ بالترتيب؛ وبمجرد أن يشحن التاجر رصيده تُصرف نقاطهم تلقائياً.',
            ifBlank: 'إذا تركته فارغاً، يطبق النظام العدد العام الافتراضي (3 فواتير).'
        },
        isolate_pct_override: {
            title: '📉 نسبة الرصيد المتبقي للعزل الوقائي (%)',
            what: 'النسبة المئوية من باقة التاجر التي إذا هبط الرصيد المتاح إليها، يقوم النظام بإخفاء المتجر وقائياً من خريطة الزوار الجدد حتى لا يتدفق عليه عشرات العملاء ورصيده يوشك على النفاد.',
            example: 'إذا كانت النسبة 10% وشحن التاجر 1,000 ج.م، فعندما يتبقى في رصيده 100 ج.م يُخفى من الرادار الوقائي مع بقاء الكاشير مفتوحاً لعملائه الحاليين.',
            ifBlank: 'إذا تركته فارغاً، تطبق نسبة العزل الوقائي العامة للمنصة (10%).'
        },
        disable_credit_timer: {
            title: '🔓 إلغاء المهلة الزمنية للائتمان (العمل بسقف المبلغ فقط)',
            what: 'خيار خاص للتجار الموثوقين يوقف إغلاق الدورة بالأيام أو الساعات، فيظل التاجر يعمل بحرية طالما لم يتجاوز «مبلغ السقف الائتماني» المحدد له.',
            example: 'إذا منحت تاجراً سقفاً ائتمانياً 5,000 ليرة وفعّلت هذا الخيار، فلن يُقفل حسابه بعد يوم أو يومين، بل يظل مفتوحاً طالما مديونيته أقل من 5,000 ليرة.',
            ifBlank: 'عند عدم التفعيل، يلتزم التاجر بمدة الدورة الزمنية ومهلة السداد المعتادة.'
        },
        onboarding_axis: {
            title: '📋 المحور الأول — حالة التأهيل والبيانات',
            what: 'يحدد ما إذا كانت بيانات المتجر وأوراقه الأساسية مكتملة ومقبولة إدارياً.',
            example: '«مؤهل ومعتمد بياناتياً» تعني أن المتجر استوفى البيانات؛ «مطلوب استيفاء/تصحيح» ترسل للتاجر ملاحظتك ليكمل النواقص.',
            ifBlank: 'لا يظهر المتجر للأعضاء إلا إذا كانت حالته «مؤهل ومعتمد بياناتياً».'
        },
        governance_axis: {
            title: '⚖️ المحور الثالث — حالة الانضباط والالتزام',
            what: 'أداة الإدارة لضبط سلوك التاجر: إبقاء المتجر سليماً، أو وضعه تحت الإنذار، أو إيقافه مؤقتاً، أو حظره نهائياً عند المخالفات الجسيمة.',
            example: 'إذا طلب التاجر إجازة تختار «إجازة بطلب التاجر»، وإذا تلاعب بالأسعار يمكنك تقييده أو تعليقه، ولإعادته للعمل فوراً تختار «سليم ممتثل».',
            ifBlank: 'الحالة الطبيعية لكل تاجر ملتزم هي «🟢 سليم ممتثل».'
        },
        topup_proof_status: {
            title: '🏦 حالات مراجعة شحن رصيد التاجر (4 حالات)',
            what: '⚪ بانتظار الإدارة: إشعار تحويل بنكي وصل من التاجر ولم يُراجع بعد. 🟠 قيد المراجعة: الإدارة تراجع التفاصيل أو تناقش التاجر وتبعث له ملاحظة مكتوبة. 🟢 تم: تمت المطابقة وشحن الرصيد وإصدار الفاتورة الضريبية. 🔴 مرفوض: تعذّر اعتماد التحويل ويصل سبب الرفض مكتوباً للتاجر فوراً.',
            example: 'إذا لم يظهر التحويل في كشف البنك بعد أو كانت البيانات ناقصة، اختر «🟠 قيد المراجعة» واكتب ملاحظة قصيرة تصل للتاجر في جرسه فوراً.',
            ifBlank: 'كل قرار تختاره الإدارة يرسل رداً وإشعاراً فورياً لحساب التاجر تلقائياً.'
        },
        dual_approval: {
            title: '🔐 نظام المراجعة المزدوجة للقرارات الحساسة',
            what: 'ضابط أمان يمنع أي موظف منفرد من تمرير قرار مالي حساس (مثل منح سقف ائتماني كبير أو حظر متجر) إلا بعد مراجعة واعتماد مدير ثانٍ، بينما تنفذ قرارات المؤسس السيادي فوراً.',
            example: 'إذا عدّل موظف مالي سقف تاجر، يدخل الطلب طابور المراجعة ليراه المراجع ويقبله؛ أما إذا عدّله المؤسس فينفذ في نفس اللحظة.',
            ifBlank: 'يعمل تلقائياً حسب صلاحية الحساب المسجل دخوله.'
        },
        numerical_stopper: {
            title: '🌳 عدد الأجيال المؤهلة في الشجرة (الستوبر العددي)',
            what: 'يحدد عدد الأجيال المؤهلة التي تحصل منها على عمولات داخل فريقك النشط. أي عضو يتجاوز هذا العدد من المؤهلين المتسلسلين يظهر في «الفريق الرديف».',
            example: 'إذا كانت القيمة 11، فإن أول 11 مؤهلاً في كل فرع ضمن فريق العمولات؛ ومن بعدهم يدخل الفريق الرديف لحماية استدامة خطة الدخل.',
            ifBlank: 'الافتراضي المعتمد هو 11 جيلاً مؤهلاً.'
        },
        upline_ceiling: {
            title: '⬆️ إجمالي حصص توزيع الفاتورة صعوداً',
            what: 'عدد الحصص المتساوية التي يُقسم عليها مبلغ خطة الدخل (صانع التوزيع + الأعضاء المؤهلون فوقه في الشجرة).',
            example: 'إذا كان الهدف 24.75$ وإجمالي الحصص 11، تكون حصة كل فرد مؤهل = 2.25$ (صانع التوزيع + 10 أعلى منه).',
            ifBlank: 'الافتراضي المعتمد هو 11 حصة.'
        },
        financial_stopper: {
            title: '🛑 السقف الشهري الأقصى لأرباح العضو بالدولة',
            what: 'الحد الأقصى للعمولات الشهرية القابلة للصرف للعضو في دولة معينة لحماية الملاءة المالية، ويُحفظ أي فائض فوقه في صندوق مخصص للمراجعة.',
            example: 'إذا كان السقف 4,605.75$ وحقق العضو 5,000$ في شهر واحد، يُصرف له 4,605.75$ ويُرحّل الفائض 394.25$ لحساب الفائض المعلق.',
            ifBlank: 'يُحسب تلقائياً من (حصة الفرد المؤهل × حجم الشجرة المكتملة) ما لم تُحدّد قيمة مخصصة.'
        },
        soft_hold_cap: {
            title: '⏳ سقف الحجز المؤقت للفواتير المعلقة (%)',
            what: 'أقصى نسبة من رصيد التاجر يمكن حجزها مؤقتاً لصالح فواتير أرسلها أعضاء ولم يعتمدها التاجر بعد، منعاً لتجميد رصيد التاجر بفواتير وهمية.',
            example: 'تاجر رصيده 1,000 ج.م وسقف الحجز المؤقت 20% ← لا يُحجز للفواتير المعلقة أكثر من 200 ج.م في نفس اللحظة.',
            ifBlank: 'الافتراضي المعتمد هو 20%.'
        },
        pending_sla: {
            title: '⏱️ مهلة رد التاجر على الفواتير المعلقة (بالساعات)',
            what: 'عدد الساعات المتاحة للتاجر لاعتماد أو رفض الفاتورة التي أرسلها العضو قبل أن تتصعّد تلقائياً لفريق الإدارة للتحكيم.',
            example: 'عند ضبطها على 48 ساعة، يتلقى التاجر تذكيرات تلقائية؛ وإذا لم يرد خلال 48 ساعة تنتقل الفاتورة للإدارة لحسمها.',
            ifBlank: 'الافتراضي المعتمد هو 48 ساعة.'
        },
        withdrawal_dual_threshold: {
            title: '💸 حد المراجعة المزدوجة لطلبات السحب ($)',
            what: 'المبلغ الذي إذا تجاوزه طلب سحب عضو، يتطلب موافقة مديرَين اثنين متعاقبَين قبل تحويل المال لضمان أمان الخزينة.',
            example: 'إذا كان الحد 200$ وطلب عضو سحب 350$، يراجعه المالي الأول ثم يعتمده المعتمد الثاني قبل الصرف.',
            ifBlank: 'الافتراضي المعتمد هو 200$.'
        },
        withdrawal_cooldown: {
            title: '🔒 فترة الأمان بعد تغيير حساب استلام السحب (بالساعات)',
            what: 'فترة تهدئة أمنية تمنع السحب إلى حساب بنكي أو محفظة مضافة حديثاً لفترة مؤقتة لحماية العضو في حال اختراق هاتفه.',
            example: 'عند ضبطها على 72 ساعة، إذا غيّر العضو رقم حسابه البنكي لا يمكن السحب للحساب الجديد قبل مرور 72 ساعة، بينما الحساب القديم يعمل فوراً.',
            ifBlank: 'الافتراضي المعتمد هو 72 ساعة.'
        },
        zero_discrepancy: {
            title: '⚖️ محرك المطابقة المحاسبية الصفرية',
            what: 'يتحقق آلياً لحظة بلحظة أن مجموع المدين يساوي مجموع الدائن في دفتر الأستاذ، وأن توزيع العمولات بين الخزانة وخطة الدخل مطابق بدقة 0.00.',
            example: 'إذا ظهر فارق حتى بقيمة 0.01$، يوقف النظام خطوة الإقفال الشهري والصرف تلقائياً لحين مراجعة القيد.',
            ifBlank: 'فحص تلقائي إلزامي يعمل في كل إقفال شهري وكل ليلة.'
        },
        monthly_close: {
            title: '📅 معالج الإقفال الشهري وصرف العمولات',
            what: 'سلسلة من 6 خطوات محكمة تغلق الشهر المحاسبي بعد انتهاء مهلة المرتجعات (14 يوماً) وتصدر دفعة الأرباح لأرصدة الأعضاء في يوم الصرف المحدد.',
            example: 'الخطوات 1–4 تجهز التسوية وتفحص المطابقة الصفرية؛ والخطوتان 5–6 تعتمدان الإقفال النهائي وتودعان العمولات للمستحقين.',
            ifBlank: 'لا يمكن تخطي أي خطوة قبل نجاح الخطوة السابقة لها.'
        },
        country_gate: {
            title: '🌍 بوابة تفعيل الدول واختبار الملاءة المالية',
            what: 'تتحكم في أسعار الصرف الشهرية والهدف الشهري والضرائب لكل دولة، مع اختبار أكتواري يحاكي أقصى ضغط توزيع قبل فتح أي دولة جديدة.',
            example: 'قبل تفعيل دولة جديدة، يُراجع الرأي القانوني وضريبة القيمة المضافة والهدف الشهري وسعر الصرف وتُختبر الملاءة المالية.',
            ifBlank: 'تبقى الدولة غير نشطة حتى تفعيلها رسمياً من الإدارة العليا.'
        },
        spam_guard: {
            title: '🛡️ حماية التوثيق من الطلبات المرفوضة المتكررة',
            what: 'إذا رُفضت لعضو عدة طلبات توثيق بلا صورة إيصال خلال فترة قصيرة، يُلزمه النظام مؤقتاً بإرفاق صورة الفاتورة لحماية التجار من الإزعاج.',
            example: 'إذا كانت القيمة 2 خلال 24 ساعة، فعند رفض طلبين بلا صورة يُطلب من العضو تصوير الفاتورة لمدة 24 ساعة ثم تعود طبيعية.',
            ifBlank: 'ضبطها على 0 يعطّل الإلزام المؤقت بالصورة.'
        }
    };

    function openHelpTopic(key, customTitle, customWhat, customExample, customBlank) {
        const t = HELP_TOPICS[key] || {
            title: customTitle || 'ℹ️ شرح الوظيفة',
            what: customWhat || 'يضبط هذا الحقل سلوك النظام التشغيلي والمحاسبي المرتبط به مباشرةً في قاعدة البيانات.',
            example: customExample || 'يمكنك تعديل القيمة وحفظها لتنعكس فوراً على الحساب.',
            ifBlank: customBlank || 'عند تركه فارغاً يعتمد النظام الإعداد العام الافتراضي.'
        };
        let ov = document.getElementById('sawyanHelpPopoverModal');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'sawyanHelpPopoverModal';
            ov.style.cssText = 'position:fixed;inset:0;z-index:10095;background:rgba(15,23,42,0.62);display:flex;align-items:center;justify-content:center;padding:16px;';
            ov.addEventListener('click', function (e) {
                if (e.target === ov) ov.style.display = 'none';
            });
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';
        ov.innerHTML =
            '<div role="dialog" aria-modal="true" style="background:#ffffff;border-radius:16px;max-width:500px;width:100%;padding:20px 22px;box-shadow:0 24px 48px rgba(15,23,42,0.35);font-family:Tajawal,sans-serif;direction:rtl;border:2px solid #0f766e;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px;">' +
                    '<h3 style="margin:0;font-size:1.05rem;color:#0f172a;font-weight:900;">' + t.title + '</h3>' +
                    '<button type="button" id="sawyanHelpCloseBtn" onclick="document.getElementById(\'sawyanHelpPopoverModal\').style.display=\'none\'" style="background:#f1f5f9;border:none;width:32px;height:32px;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:900;">✕</button>' +
                '</div>' +
                '<div style="display:grid;gap:10px;font-size:0.88rem;line-height:1.7;color:#1e293b;">' +
                    '<div style="background:#f0fdf4;border-right:4px solid #10b981;padding:10px 12px;border-radius:8px;">' +
                        '<div style="font-weight:900;color:#065f46;margin-bottom:2px;">📌 ما وظيفة هذا البند؟</div>' +
                        '<div>' + t.what + '</div>' +
                    '</div>' +
                    '<div style="background:#eff6ff;border-right:4px solid #3b82f6;padding:10px 12px;border-radius:8px;">' +
                        '<div style="font-weight:900;color:#1e40af;margin-bottom:2px;">💡 مثال عملي بالأرقام:</div>' +
                        '<div>' + t.example + '</div>' +
                    '</div>' +
                    '<div style="background:#fffbeb;border-right:4px solid #f59e0b;padding:10px 12px;border-radius:8px;">' +
                        '<div style="font-weight:900;color:#92400e;margin-bottom:2px;">⚙️ ماذا يحدث إذا تركته فارغاً أو على الوضع الافتراضي؟</div>' +
                        '<div>' + t.ifBlank + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-top:14px;text-align:left;">' +
                    '<button type="button" onclick="document.getElementById(\'sawyanHelpPopoverModal\').style.display=\'none\'" style="background:#0f766e;color:#ffffff;border:none;padding:8px 20px;border-radius:10px;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;">فهمت ✓</button>' +
                '</div>' +
            '</div>';
    }

    function renderHelpBtn(key, labelText) {
        const safeKey = String(key || '').replace(/[^a-zA-Z0-9_]/g, '');
        const lbl = labelText ? (' ' + labelText) : '';
        return '<button type="button" class="sawyan-help-trigger" data-help-key="' + safeKey + '" onclick="event.preventDefault();event.stopPropagation();window.SAWYAN.Help.open(\'' + safeKey + '\')" title="اضغط لشرح الوظيفة بمثال عملي" style="display:inline-flex;align-items:center;justify-content:center;gap:3px;min-width:20px;height:20px;padding:0 6px;margin-inline-start:5px;border-radius:999px;border:1.5px solid #0f766e;background:#ecfdf5;color:#0f766e;font-family:Tajawal,sans-serif;font-size:0.72rem;font-weight:900;cursor:pointer;line-height:1;vertical-align:middle;">؟' + lbl + '</button>';
    }

    window.svHelpBtn = renderHelpBtn;

    // ========================================================================
    // 5. Universal SPA Browser History & Anti-Logout Back Button Controller
    // ========================================================================
    let _isHandlingPopState = false;
    let _lastRecordedPage = null;

    function getActiveDashboardPageId() {
        const activeEl = document.querySelector('.page.active');
        if (!activeEl || !activeEl.id) return 'home';
        return activeEl.id.replace(/Page$/, '') || 'home';
    }

    function closeAnyOpenDashboardModal() {
        // 0) First check SAWYAN.UI modals (confirm/prompt/alert)
        const uiOverlay = document.querySelector('.sw-ui-backdrop, .sawyan-ui-modal-overlay');
        if (uiOverlay) {
            const cancelBtn = uiOverlay.querySelector('[data-sw-cancel], .sw-ui-cancel');
            if (cancelBtn) cancelBtn.click();
            else uiOverlay.remove();
            return true;
        }
        const swDialog = document.querySelector('.sw-dialog-backdrop');
        if (swDialog) {
            const cancelBtn = swDialog.querySelector('.sw-btn-ghost');
            if (cancelBtn) cancelBtn.click();
            else swDialog.remove();
            return true;
        }
        const modalIds = [
            'sawyanHelpPopoverModal',
            'swMediaLightbox',
            'storeKitModalOverlay',
            'sawyanMerchantReturnModal',
            'svMerchantStage7Overlay',
            'svMerchantTopupOverlay',
            'svMerchantModalOverlay',
            'merchantPromoRequestModal',
            'merchantRadarModal',
            'wifiSharingModal',
            'tsInspectorOverlay',
            'tsNodeModalOverlay',
            'sawyanAcademyPlayerOverlay',
            'sawyanQuickMemberQrOverlay',
            'sawyanMemberModalOverlay',
            'memberDetailModal',
            'memberModalOverlay',
            'adminCmdKOverlay',
            'svCountryEditorOverlay',
            'svPitchRadarOverlay',
            'svStage7ModalOverlay',
            'sawyanOpsModal',
            'svAdminModalOverlay',
            'opsModalOverlay'
        ];
        const removeOnClose = new Set([
            'sawyanOpsModal',
            'tsNodeModalOverlay',
            'tsInspectorOverlay',
            'sawyanHelpPopoverModal',
            'svCountryEditorOverlay',
            'svPitchRadarOverlay'
        ]);
        for (let i = 0; i < modalIds.length; i++) {
            const el = document.getElementById(modalIds[i]);
            if (el) {
                const st = window.getComputedStyle(el);
                if (st.display !== 'none' && st.visibility !== 'hidden') {
                    if (removeOnClose.has(el.id)) {
                        el.remove();
                    } else {
                        el.classList.remove('active');
                        el.style.display = 'none';
                    }
                    return true;
                }
            }
        }
        const activeModal = document.querySelector('.modal.active, .modal-overlay.active, .modal[style*="display: flex"], .modal[style*="display:flex"], .modal[style*="display: block"]');
        if (activeModal) {
            activeModal.classList.remove('active');
            activeModal.style.display = 'none';
            return true;
        }
        // Smart safety net: catch ANY visible full-screen fixed overlay (excluding system loaders/security locks)
        const protectedIds = new Set(['appShellBackdrop', 'loadingOverlay', 'empTempLockOverlay', 'moreMenu']);
        const fixedOverlays = Array.from(document.body.children).filter(function (el) {
            if (!el || el.nodeType !== 1 || protectedIds.has(el.id)) return false;
            const st = window.getComputedStyle(el);
            if (st.position !== 'fixed' || st.display === 'none' || st.visibility === 'hidden') return false;
            const z = parseInt(st.zIndex, 10) || 0;
            const r = el.getBoundingClientRect();
            return z >= 1000 && r.width >= window.innerWidth * 0.85 && r.height >= window.innerHeight * 0.85;
        });
        if (fixedOverlays.length > 0) {
            const topOv = fixedOverlays[fixedOverlays.length - 1];
            topOv.classList.remove('active');
            topOv.style.display = 'none';
            return true;
        }
        const moreMenu = document.getElementById('moreMenu');
        if (moreMenu && moreMenu.classList.contains('open')) {
            moreMenu.classList.remove('open');
            return true;
        }
        return false;
    }

    function setupUniversalModalEscape() {
        if (window.__sawyanModalEscapeMounted) return;
        window.__sawyanModalEscapeMounted = true;

        // 1) Pressing Escape closes the topmost open modal/overlay cleanly
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (closeAnyOpenDashboardModal()) {
                    e.preventDefault();
                }
            }
        });

        // 2) Clicking directly on the dark backdrop of any full-screen overlay closes it
        const protectedIds = new Set(['appShellBackdrop', 'loadingOverlay', 'empTempLockOverlay', 'moreMenu']);
        document.addEventListener('click', function (e) {
            const target = e.target;
            if (!target || target.nodeType !== 1 || target.parentElement !== document.body) return;
            if (protectedIds.has(target.id)) return;
            const st = window.getComputedStyle(target);
            if (st.position !== 'fixed' || st.display === 'none' || st.visibility === 'hidden') return;
            const z = parseInt(st.zIndex, 10) || 0;
            const r = target.getBoundingClientRect();
            if (z >= 1000 && r.width >= window.innerWidth * 0.85 && r.height >= window.innerHeight * 0.85) {
                target.classList.remove('active');
                target.style.display = 'none';
            }
        });
    }

    function navigateDashboardTabInternal(pageId) {
        if (!pageId) return;
        _isHandlingPopState = true;
        try {
            if (pageId === 'sovereignLive' && typeof window.openSovereignLivePage === 'function') {
                window.openSovereignLivePage();
            } else if (pageId === 'sovereignOpsCenter' && typeof window.openSovereignOpsCenter === 'function') {
                window.openSovereignOpsCenter('root0');
            } else if (pageId === 'academyAdmin' && typeof window.openAcademyAdminPage === 'function') {
                window.openAcademyAdminPage('lessons');
            } else if (pageId === 'registrationBuilder' && typeof window.openRegistrationBuilderPage === 'function') {
                window.openRegistrationBuilderPage('merchant');
            } else if (pageId === 'networkTree' && typeof window.openAdminNetworkTree === 'function') {
                window.openAdminNetworkTree(0);
            } else if (typeof window.goToPage === 'function') {
                window.goToPage(pageId);
            } else if (typeof window.showPage === 'function') {
                window.showPage(pageId);
            } else {
                const nav = document.querySelector('.nav-item[data-page="' + pageId + '"], .bottom-nav-item[data-page="' + pageId + '"]');
                if (nav) nav.click();
            }
            _lastRecordedPage = pageId;
        } finally {
            setTimeout(function () { _isHandlingPopState = false; }, 60);
        }
    }

    function setupUniversalHistoryNavigation() {
        if (!document.querySelector('.dashboard-container') && !document.querySelector('.main-content')) return;
        if (window.__sawyanHistoryGuardMounted) return;
        window.__sawyanHistoryGuardMounted = true;

        const hashPage = (window.location.hash || '').replace(/^#/, '').trim();
        const initialPage = (hashPage && document.getElementById(hashPage + 'Page')) ? hashPage : getActiveDashboardPageId();
        _lastRecordedPage = initialPage;

        try {
            const baseUrl = window.location.pathname + window.location.search;
            window.history.replaceState({ sawyanPage: 'home', sawyanGuardFloor: true }, '', baseUrl + '#home');
            window.history.pushState({ sawyanPage: initialPage, sawyanGuardActive: true }, '', baseUrl + '#' + initialPage);
            if (initialPage !== getActiveDashboardPageId()) {
                setTimeout(function () { navigateDashboardTabInternal(initialPage); }, 80);
            }
        } catch (_) {}

        // Observe .page active class changes and push history state automatically
        const observePages = function () {
            if (_isHandlingPopState) return;
            const cur = getActiveDashboardPageId();
            if (cur && cur !== _lastRecordedPage) {
                _lastRecordedPage = cur;
                try {
                    const baseUrl = window.location.pathname + window.location.search;
                    window.history.pushState({ sawyanPage: cur }, '', baseUrl + '#' + cur);
                } catch (_) {}
            }
        };

        const contentRoot = document.querySelector('.main-content') || document.body;
        if (contentRoot && typeof MutationObserver !== 'undefined') {
            const pageObs = new MutationObserver(observePages);
            pageObs.observe(contentRoot, { attributes: true, subtree: true, attributeFilter: ['class'] });
        }

        window.addEventListener('popstate', function (e) {
            const baseUrl = window.location.pathname + window.location.search;
            // 1) If a modal/drawer is open, close it first and keep the user on their current tab
            if (closeAnyOpenDashboardModal()) {
                const cur = getActiveDashboardPageId();
                try {
                    window.history.pushState({ sawyanPage: cur }, '', baseUrl + '#' + cur);
                } catch (_) {}
                return;
            }

            const st = e.state || {};
            // 2) If user hit the floor of the dashboard history stack, keep them safely inside the dashboard (on #home)
            if (st.sawyanGuardFloor) {
                if (getActiveDashboardPageId() !== 'home') {
                    navigateDashboardTabInternal('home');
                }
                try {
                    window.history.pushState({ sawyanPage: 'home', sawyanGuardActive: true }, '', baseUrl + '#home');
                } catch (_) {}
                return;
            }

            // 3) Normal in-dashboard tab back/forward transition
            const targetPage = st.sawyanPage || ((window.location.hash || '').replace(/^#/, '').trim()) || 'home';
            if (document.getElementById(targetPage + 'Page')) {
                if (targetPage !== getActiveDashboardPageId()) {
                    navigateDashboardTabInternal(targetPage);
                }
            } else {
                try {
                    window.history.pushState({ sawyanPage: getActiveDashboardPageId() }, '', baseUrl + '#' + getActiveDashboardPageId());
                } catch (_) {}
            }
        });
    }

    function boot() {
        ensureDashboardBrandBar();
        setupRailToggle();
        syncMobileMoreMenuFromSidebar();
        enhanceTablesAndLabels();
        setupUniversalHistoryNavigation();
        setupUniversalModalEscape();

        const target = document.querySelector('.main-content') || document.body;
        if (target && typeof MutationObserver !== 'undefined') {
            const obs = new MutationObserver(scheduleEnhance);
            obs.observe(target, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.Help = {
        open: openHelpTopic,
        btn: renderHelpBtn,
        topics: HELP_TOPICS
    };
    window.SAWYAN.AppShell = {
        refresh: scheduleEnhance,
        syncMoreMenu: syncMobileMoreMenuFromSidebar,
        enhanceTables: enhanceTablesAndLabels,
        closeOpenModal: closeAnyOpenDashboardModal
    };
})();
