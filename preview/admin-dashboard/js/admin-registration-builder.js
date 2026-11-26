/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — Stage 9: Admin Dynamic Registration & Form Builder
 * هندسة نماذج التسجيل الديناميكية في لوحة الإدارة (التاجر / العضو / الموظف)
 * + خريطة انتشار الأعضاء المجهولة لإقناع التجار الجدد
 * ============================================================================
 */
(function () {
    'use strict';

    const FORM_TABS = [
        { key: 'merchant', label: '🏪 صفحة تسجيل التاجر', subTypes: null },
        { key: 'member', label: '👤 صفحة تسجيل العضو', subTypes: null },
        {
            key: 'employee',
            label: '👔 صفحات تسجيل الموظفين',
            subTypes: [
                { key: 'employee_cashier', label: '💳 موظف كاشير التاجر (POS)' },
                { key: 'employee_admin', label: '🛡️ موظف الإدارة (RBAC)' }
            ]
        }
    ];

    let _activeTab = 'merchant';
    let _activeEmployeeSubTab = 'employee_cashier';
    let _allSettings = [];
    let _allFields = [];
    let _dirty = false;
    let _pitchMap = null;
    let _pitchLayer = null;
    let _pitchCenterMarker = null;

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(msg, isErr) {
        const rawText = msg && typeof msg === 'object' ? (msg.message || msg.error_code || String(msg)) : String(msg || '');
        const shouldHumanize = Boolean(isErr) || /RPC\[|failed:\s*[A-Z_]{3,}|\b[A-Z]{3,}_[A-Z0-9]{2,}_[A-Z0-9_]+\b/i.test(rawText);
        const displayMsg = (shouldHumanize && window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.humanizeError === 'function')
            ? window.SAWYAN.UI.humanizeError(msg)
            : rawText;
        if (typeof window.svAdminToast === 'function') {
            window.svAdminToast(displayMsg, isErr);
            return;
        }
        let box = document.getElementById('svRegBuilderToast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'svRegBuilderToast';
            box.style.cssText = 'position:fixed;bottom:22px;left:22px;z-index:10070;max-width:460px;padding:12px 16px;border-radius:12px;font-family:Tajawal,sans-serif;font-weight:800;font-size:0.88rem;box-shadow:0 10px 28px rgba(15,23,42,0.28);transition:opacity 0.25s;';
            document.body.appendChild(box);
        }
        box.style.background = isErr ? '#991b1b' : '#065f46';
        box.style.color = '#ffffff';
        box.style.border = isErr ? '1.5px solid #fca5a5' : '1.5px solid #6ee7b7';
        box.textContent = (isErr ? '⛔ ' : '✅ ') + displayMsg;
        box.style.opacity = '1';
        clearTimeout(box._timer);
        box._timer = setTimeout(function () { box.style.opacity = '0'; }, 4500);
    }

    function injectStyles() {
        if (document.getElementById('svRegBuilderStyles')) return;
        const st = document.createElement('style');
        st.id = 'svRegBuilderStyles';
        st.textContent = `
            #registrationBuilderPage .rb-card { background:#ffffff; border:1.5px solid #cbd5e1; border-radius:16px; padding:18px; margin-bottom:16px; box-shadow:0 2px 8px rgba(15,23,42,0.04); }
            #registrationBuilderPage .rb-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
            #registrationBuilderPage .rb-tab-btn { padding:10px 16px; border-radius:12px; border:1.5px solid #cbd5e1; background:#f8fafc; color:#1e293b; font-weight:800; cursor:pointer; font-family:inherit; transition:all 0.2s; }
            #registrationBuilderPage .rb-tab-btn.active { background:#065f46; color:#ffffff; border-color:#065f46; box-shadow:0 4px 12px rgba(6,95,70,0.22); }
            #registrationBuilderPage .rb-subtabs { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 14px; padding:10px; background:#f1f5f9; border-radius:12px; }
            #registrationBuilderPage .rb-subtab-btn { padding:8px 14px; border-radius:10px; border:1.5px solid #cbd5e1; background:#ffffff; color:#334155; font-weight:700; cursor:pointer; font-family:inherit; }
            #registrationBuilderPage .rb-subtab-btn.active { background:#1d4ed8; color:#ffffff; border-color:#1d4ed8; }
            #registrationBuilderPage .rb-actions-bar { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 16px; background:#f0fdf4; border:1.5px solid #86efac; border-radius:14px; margin-bottom:14px; }
            #registrationBuilderPage .rb-settings-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
            #registrationBuilderPage label.rb-lbl { display:block; font-weight:800; font-size:0.84rem; color:#0f172a; margin-bottom:5px; }
            #registrationBuilderPage .form-control { width:100%; box-sizing:border-box; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:9px; font-family:inherit; font-size:0.86rem; background:#fff; color:#0f172a; }
            #registrationBuilderPage select.form-control { appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%230F172A' d='M3.2 5.5L8 10.7l4.8-5.2H3.2z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:left 10px center; background-size:13px 13px; padding-left:30px; cursor:pointer; }
            #registrationBuilderPage .rb-chk-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; font-size:0.78rem; min-width:190px; }
            #registrationBuilderPage .rb-chk-item { display:flex; align-items:center; gap:5px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:7px; padding:4px 7px; cursor:pointer; font-weight:600; color:#1e293b; }
            #registrationBuilderPage .rb-chk-item input[type="checkbox"] { width:15px; height:15px; accent-color:#059669; cursor:pointer; }
            #registrationBuilderPage .rb-mode-badge { display:inline-block; font-size:0.72rem; font-weight:800; padding:2px 8px; border-radius:999px; margin-top:4px; }
            #registrationBuilderPage .rb-lock-badge { display:inline-block; font-size:0.72rem; font-weight:800; padding:2px 7px; border-radius:7px; background:#fef3c7; color:#92400e; border:1px solid #fcd34d; margin-top:4px; }
            .sv-pitch-modal-overlay { position:fixed; inset:0; z-index:10065; background:rgba(15,23,42,0.7); display:flex; align-items:center; justify-content:center; padding:14px; overflow-y:auto; }
            .sv-pitch-modal-box { background:#fff; border-radius:16px; width:100%; max-width:920px; max-height:92vh; overflow-y:auto; padding:20px; direction:rtl; box-shadow:0 24px 48px rgba(15,23,42,0.35); font-family:Tajawal,sans-serif; }
            @media (max-width: 640px) {
                #registrationBuilderPage .rb-chk-grid { grid-template-columns:1fr; min-width:0; }
                #registrationBuilderPage .rb-actions-bar { flex-direction:column; align-items:stretch; }
            }
        `;
        document.head.appendChild(st);
    }

    function currentFormType() {
        return _activeTab === 'employee' ? _activeEmployeeSubTab : _activeTab;
    }

    function canModifyForms() {
        const adm = (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedAdmin()) || window.currentAdmin || null;
        if (!adm) return false;
        if (adm.is_sovereign_founder) return true;
        return ['approver', 'reviewer'].includes(String(adm.role || '').toLowerCase());
    }

    function deriveModeFromFlags(shI, rqI, shD) {
        if (shI && rqI) return 'initial_required';
        if (shI) return 'initial_optional';
        if (shD) return 'dashboard_only';
        return 'hidden';
    }

    function applyModeToRowFlags(fieldObj, newMode) {
        if (fieldObj.is_system_locked && (newMode === 'dashboard_only' || newMode === 'hidden')) {
            toast('هذا الحقل إلزامي دستوري لأمان الحساب أو الشجرة ولا يمكن إخفاؤه من التسجيل المبدئي.', true);
            return false;
        }
        fieldObj.display_mode = newMode;
        if (newMode === 'initial_required') {
            fieldObj.show_in_initial = true;
            fieldObj.required_in_initial = true;
            fieldObj.show_in_dashboard = true;
        } else if (newMode === 'initial_optional') {
            fieldObj.show_in_initial = true;
            fieldObj.required_in_initial = false;
            fieldObj.show_in_dashboard = true;
        } else if (newMode === 'dashboard_only') {
            fieldObj.show_in_initial = false;
            fieldObj.required_in_initial = false;
            fieldObj.show_in_dashboard = true;
        } else if (newMode === 'hidden') {
            fieldObj.show_in_initial = false;
            fieldObj.required_in_initial = false;
            fieldObj.show_in_dashboard = false;
            fieldObj.required_in_dashboard = false;
        }
        return true;
    }

    window.openRegistrationBuilderPage = async function (tab) {
        injectStyles();
        if (tab === 'merchant' || tab === 'member' || tab === 'employee') {
            _activeTab = tab;
        } else if (tab === 'employee_cashier' || tab === 'employee_admin') {
            _activeTab = 'employee';
            _activeEmployeeSubTab = tab;
        }

        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        const navItem = document.getElementById('svRegBuilderNavItem');
        if (navItem) navItem.classList.add('active');

        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = '🧩 هندسة نماذج التسجيل واستكمال البيانات';

        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        const pg = document.getElementById('registrationBuilderPage');
        if (pg) {
            pg.classList.add('active');
            await loadAndRenderBuilder(pg);
        }
    };

    async function loadAndRenderBuilder(pg) {
        pg.innerHTML = '<div class="rb-card" style="text-align:center;color:#64748b;padding:30px;">⏳ جاري تحميل إعدادات نماذج التسجيل من قاعدة البيانات...</div>';
        try {
            const res = await window.SAWYAN.API.adminManageRegistrationFields({ action: 'list' });
            _allSettings = Array.isArray(res && res.settings) ? res.settings : [];
            _allFields = Array.isArray(res && res.fields) ? res.fields : [];
            _dirty = false;
            renderBuilder(pg);
        } catch (err) {
            const niceErr = (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.humanizeError === 'function')
                ? window.SAWYAN.UI.humanizeError(err)
                : String((err && err.message) || err || 'تعذر تحميل إعدادات نماذج التسجيل');
            pg.innerHTML = '<div class="rb-card" style="background:#fef2f2;border-color:#fca5a5;color:#991b1b;font-weight:800;">⛔ تعذر تحميل إعدادات نماذج التسجيل: ' + esc(niceErr) + '</div>';
        }
    }

    function modeBadgeHtml(mode) {
        const m = {
            initial_required: ['#FEE2E2', '#991B1B', '🔴 إلزامي بالتسجيل *'],
            initial_optional: ['#FEF3C7', '#92400E', '🟡 اختياري بالتسجيل'],
            dashboard_only: ['#DBEAFE', '#1E40AF', '🔵 يُرحّل للوحة التحكم'],
            hidden: ['#F1F5F9', '#475569', '⚫ مخفي بالكامل']
        }[mode] || ['#F1F5F9', '#334155', mode];
        return `<span class="rb-mode-badge" style="background:${m[0]};color:${m[1]};">${m[2]}</span>`;
    }

    function renderBuilder(pg) {
        const ft = currentFormType();
        const editable = canModifyForms();
        const settingsObj = _allSettings.find(s => s.form_type === ft) || {
            form_type: ft,
            page_title_ar: '',
            page_subtitle_ar: '',
            optional_divider_text_ar: '',
            dashboard_banner_text_ar: ''
        };
        const fields = _allFields
            .filter(f => f.form_type === ft)
            .slice()
            .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));

        const initialReqCount = fields.filter(f => f.show_in_initial && f.required_in_initial).length;
        const initialOptCount = fields.filter(f => f.show_in_initial && !f.required_in_initial).length;
        const deferredCount = fields.filter(f => !f.show_in_initial && f.show_in_dashboard).length;
        const hiddenCount = fields.filter(f => !f.show_in_initial && !f.show_in_dashboard).length;

        const tabsHtml = FORM_TABS.map(t => `
            <button type="button" class="rb-tab-btn ${_activeTab === t.key ? 'active' : ''}" data-rb-tab="${t.key}">${t.label}</button>
        `).join('');

        const empTabMeta = FORM_TABS.find(t => t.key === 'employee');
        const subTabsHtml = _activeTab === 'employee'
            ? `<div class="rb-subtabs">${empTabMeta.subTypes.map(st => `
                <button type="button" class="rb-subtab-btn ${_activeEmployeeSubTab === st.key ? 'active' : ''}" data-rb-subtab="${st.key}">${st.label}</button>
              `).join('')}</div>`
            : '';

        const actionsBar = (suffix) => `
            <div class="rb-actions-bar">
                <div style="font-size:0.86rem;font-weight:700;color:#065f46;">
                    <span>🔴 إلزامي بالبداية: <b>${initialReqCount}</b></span> |
                    <span>🟡 اختياري بالبداية: <b>${initialOptCount}</b></span> |
                    <span>🔵 مُرحّل للوحة التحكم: <b>${deferredCount}</b></span> |
                    <span>⚫ مخفي: <b>${hiddenCount}</b></span>
                    ${_dirty ? ' <span class="badge badge-warning">⚠️ توجد تعديلات غير محفوظة</span>' : ''}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-outline" id="btnPitchRadar_${suffix}" style="background:#fff;border-color:#0284c7;color:#0369a1;font-weight:800;">
                        🗺️ خريطة انتشار الأعضاء لإقناع التجار
                    </button>
                    <button type="button" class="btn btn-outline" id="btnResetReg_${suffix}" ${editable ? '' : 'disabled'}>
                        ↩️ استعادة الافتراضي
                    </button>
                    <button type="button" class="btn btn-primary" id="btnSaveReg_${suffix}" ${editable ? '' : 'disabled'} style="background:#059669;border-color:#047857;font-weight:800;">
                        💾 حفظ وتطبيق التعديلات فوراً
                    </button>
                </div>
            </div>
        `;

        const rowsHtml = fields.map(f => {
            const lockDisabled = f.is_system_locked ? 'disabled title="حقل إلزامي دستوري"' : '';
            const rowMode = deriveModeFromFlags(f.show_in_initial, f.required_in_initial, f.show_in_dashboard);
            f.display_mode = rowMode;
            return `
                <tr data-rb-row="${esc(f.field_key)}">
                    <td data-label="الخانة">
                        <div style="font-weight:800;color:#0f172a;">
                            ${esc(f.label_ar)}
                            ${(f.show_in_initial && f.required_in_initial) ? '<span style="color:#DC2626;font-weight:900;">*</span>' : ''}
                        </div>
                        <div style="font-size:0.74rem;color:#64748b;margin-top:2px;"><code>${esc(f.field_key)}</code></div>
                        <div>${modeBadgeHtml(rowMode)}</div>
                        ${f.is_system_locked ? '<div class="rb-lock-badge">🔒 إلزامي دستوري</div>' : ''}
                    </td>
                    <td data-label="وضع الظهور (Combo)">
                        <select class="form-control rb-mode-select" data-key="${esc(f.field_key)}" ${editable ? '' : 'disabled'}>
                            <option value="initial_required" ${rowMode === 'initial_required' ? 'selected' : ''}>🔴 إلزامي بنجمة * في التسجيل المبدئي</option>
                            <option value="initial_optional" ${rowMode === 'initial_optional' ? 'selected' : ''} ${lockDisabled}>🟡 اختياري في التسجيل المبدئي</option>
                            <option value="dashboard_only" ${rowMode === 'dashboard_only' ? 'selected' : ''} ${lockDisabled}>🔵 يرحّل للوحة التحكم بعد التسجيل</option>
                            <option value="hidden" ${rowMode === 'hidden' ? 'selected' : ''} ${lockDisabled}>⚫ مخفي من التسجيل واللوحة</option>
                        </select>
                    </td>
                    <td data-label="مربعات الصح والغلط">
                        <div class="rb-chk-grid">
                            <label class="rb-chk-item">
                                <input type="checkbox" class="rb-chk" data-prop="show_in_initial" data-key="${esc(f.field_key)}" ${f.show_in_initial ? 'checked' : ''} ${f.is_system_locked || !editable ? 'disabled' : ''}>
                                <span>في التسجيل</span>
                            </label>
                            <label class="rb-chk-item">
                                <input type="checkbox" class="rb-chk" data-prop="required_in_initial" data-key="${esc(f.field_key)}" ${f.required_in_initial ? 'checked' : ''} ${f.is_system_locked || !editable ? 'disabled' : ''}>
                                <span>إلزامي بنجمة <span style="color:#DC2626;">*</span></span>
                            </label>
                            <label class="rb-chk-item">
                                <input type="checkbox" class="rb-chk" data-prop="show_in_dashboard" data-key="${esc(f.field_key)}" ${f.show_in_dashboard ? 'checked' : ''} ${f.is_system_locked || !editable ? 'disabled' : ''}>
                                <span>في لوحة التحكم</span>
                            </label>
                            <label class="rb-chk-item">
                                <input type="checkbox" class="rb-chk" data-prop="required_in_dashboard" data-key="${esc(f.field_key)}" ${f.required_in_dashboard ? 'checked' : ''} ${f.is_system_locked || !editable ? 'disabled' : ''}>
                                <span>إلزامي بالداخل</span>
                            </label>
                        </div>
                    </td>
                    <td data-label="عنوان الخانة الظاهر">
                        <input type="text" class="form-control rb-text-input" data-prop="label_ar" data-key="${esc(f.field_key)}" value="${esc(f.label_ar)}" ${editable ? '' : 'disabled'}>
                    </td>
                    <td data-label="مثال / توضيح داخل الخانة">
                        <input type="text" class="form-control rb-text-input" data-prop="placeholder_ar" data-key="${esc(f.field_key)}" value="${esc(f.placeholder_ar || '')}" placeholder="مثال توضيحي يظهر داخل الخانة" ${editable ? '' : 'disabled'}>
                    </td>
                    <td data-label="شرح تفصيلي أسفل الخانة">
                        <textarea rows="2" class="form-control rb-text-input" data-prop="help_text_ar" data-key="${esc(f.field_key)}" placeholder="وصف مختصر واضح يظهر أسفل الخانة" ${editable ? '' : 'disabled'}>${esc(f.help_text_ar || '')}</textarea>
                    </td>
                    <td data-label="الترتيب">
                        <input type="number" min="1" max="999" class="form-control rb-num-input" data-prop="sort_order" data-key="${esc(f.field_key)}" value="${Number(f.sort_order || 10)}" style="min-width:68px;" ${editable ? '' : 'disabled'}>
                    </td>
                </tr>
            `;
        }).join('');

        pg.innerHTML = `
            <div class="rb-card" data-spec-id="admin-reg-builder-header">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                    <div>
                        <h2 style="margin:0 0 6px 0;font-size:1.18rem;color:#0f172a;">🧩 غرفة هندسة نماذج التسجيل والحقول (التاجر / العضو / الموظف)</h2>
                        <p style="margin:0;color:#475569;font-size:0.88rem;line-height:1.6;">
                            تحكّم مباشرةً في الحقول التي تظهر في صفحة التسجيل المبدئي، وما يُرحّل لاستكماله داخل لوحة التحكم، مع حرية تعديل اسم كل خانة، ومثالها الداخلي، وشرحها السفلي. أي حفظ هنا ينعكس فوراً في قاعدة البيانات وكافة الواجهات.
                        </p>
                    </div>
                    ${editable ? '<span class="badge badge-success">✓ صلاحية تعديل وحفظ فورية</span>' : '<span class="badge badge-warning">👁️ وضع قراءة فقط (يتطلب المؤسس أو approver/reviewer)</span>'}
                </div>
                <div class="rb-tabs" style="margin-top:14px;">${tabsHtml}</div>
                ${subTabsHtml}
                ${actionsBar('top')}
            </div>

            <div class="rb-card" data-spec-id="admin-reg-builder-settings">
                <h3 style="margin:0 0 12px 0;font-size:1rem;color:#0f172a;">📝 عناوين الصفحة ونصوص الفواصل التوجيهية (${esc(ft)})</h3>
                <div class="rb-settings-grid">
                    <div>
                        <label class="rb-lbl">عنوان صفحة التسجيل الرئيسي</label>
                        <input type="text" class="form-control rb-setting-input" data-setting="page_title_ar" value="${esc(settingsObj.page_title_ar || '')}" ${editable ? '' : 'disabled'}>
                    </div>
                    <div>
                        <label class="rb-lbl">الوصف المختصر أعلى الصفحة</label>
                        <input type="text" class="form-control rb-setting-input" data-setting="page_subtitle_ar" value="${esc(settingsObj.page_subtitle_ar || '')}" ${editable ? '' : 'disabled'}>
                    </div>
                    <div>
                        <label class="rb-lbl">جملة الفاصل قبل القسم الاختياري في التسجيل المبدئي</label>
                        <textarea rows="2" class="form-control rb-setting-input" data-setting="optional_divider_text_ar" ${editable ? '' : 'disabled'}>${esc(settingsObj.optional_divider_text_ar || '')}</textarea>
                    </div>
                    <div>
                        <label class="rb-lbl">رسالة التنبيه داخل لوحة التحكم لاستكمال البيانات الناقصة</label>
                        <textarea rows="2" class="form-control rb-setting-input" data-setting="dashboard_banner_text_ar" ${editable ? '' : 'disabled'}>${esc(settingsObj.dashboard_banner_text_ar || '')}</textarea>
                    </div>
                </div>
            </div>

            <div class="rb-card" data-spec-id="admin-reg-builder-table">
                <div style="overflow-x:auto;">
                    <table class="data-table" data-has-labels="1">
                        <thead>
                            <tr>
                                <th>الخانة والحالة</th>
                                <th>وضع الظهور (Combo)</th>
                                <th>التحكم الدقيق (صح / غلط)</th>
                                <th>عنوان الخانة الظاهر</th>
                                <th>توضيح / مثال داخل الخانة</th>
                                <th>شرح تفصيلي أسفل الخانة</th>
                                <th>الترتيب</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>

            ${actionsBar('bottom')}
        `;

        bindBuilderEvents(pg, fields, settingsObj, ft);
    }

    function bindBuilderEvents(pg, fields, settingsObj, ft) {
        pg.querySelectorAll('.rb-tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                _activeTab = btn.dataset.rbTab;
                renderBuilder(pg);
            });
        });

        pg.querySelectorAll('.rb-subtab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                _activeEmployeeSubTab = btn.dataset.rbSubtab;
                renderBuilder(pg);
            });
        });

        pg.querySelectorAll('.rb-mode-select').forEach(sel => {
            sel.addEventListener('change', function () {
                const f = fields.find(x => x.field_key === sel.dataset.key);
                if (!f) return;
                if (!applyModeToRowFlags(f, sel.value)) {
                    sel.value = f.display_mode;
                    return;
                }
                _dirty = true;
                renderBuilder(pg);
            });
        });

        pg.querySelectorAll('.rb-chk').forEach(chk => {
            chk.addEventListener('change', function () {
                const f = fields.find(x => x.field_key === chk.dataset.key);
                if (!f || f.is_system_locked) {
                    chk.checked = Boolean(f && f[chk.dataset.prop]);
                    return;
                }
                const prop = chk.dataset.prop;
                f[prop] = chk.checked;
                if (prop === 'required_in_initial' && f.required_in_initial) {
                    f.show_in_initial = true;
                    f.show_in_dashboard = true;
                }
                if (prop === 'show_in_initial' && !f.show_in_initial) {
                    f.required_in_initial = false;
                }
                if (prop === 'required_in_dashboard' && f.required_in_dashboard) {
                    f.show_in_dashboard = true;
                }
                if (prop === 'show_in_dashboard' && !f.show_in_dashboard) {
                    f.required_in_dashboard = false;
                }
                f.display_mode = deriveModeFromFlags(f.show_in_initial, f.required_in_initial, f.show_in_dashboard);
                _dirty = true;
                renderBuilder(pg);
            });
        });

        pg.querySelectorAll('.rb-text-input, .rb-num-input').forEach(inp => {
            inp.addEventListener('input', function () {
                const f = fields.find(x => x.field_key === inp.dataset.key);
                if (!f) return;
                const prop = inp.dataset.prop;
                f[prop] = prop === 'sort_order' ? Number(inp.value || 10) : inp.value;
                _dirty = true;
            });
        });

        pg.querySelectorAll('.rb-setting-input').forEach(inp => {
            inp.addEventListener('input', function () {
                settingsObj[inp.dataset.setting] = inp.value;
                _dirty = true;
            });
        });

        async function doSave() {
            const payloadFields = fields.map(f => ({
                field_key: f.field_key,
                display_mode: deriveModeFromFlags(f.show_in_initial, f.required_in_initial, f.show_in_dashboard),
                show_in_initial: Boolean(f.show_in_initial),
                required_in_initial: Boolean(f.required_in_initial),
                show_in_dashboard: Boolean(f.show_in_dashboard),
                required_in_dashboard: Boolean(f.required_in_dashboard),
                label_ar: String(f.label_ar || '').trim(),
                placeholder_ar: String(f.placeholder_ar || '').trim(),
                help_text_ar: String(f.help_text_ar || '').trim(),
                sort_order: Number(f.sort_order || 10)
            }));
            const payloadSettings = {
                page_title_ar: String(settingsObj.page_title_ar || '').trim(),
                page_subtitle_ar: String(settingsObj.page_subtitle_ar || '').trim(),
                optional_divider_text_ar: String(settingsObj.optional_divider_text_ar || '').trim(),
                dashboard_banner_text_ar: String(settingsObj.dashboard_banner_text_ar || '').trim()
            };
            try {
                await window.SAWYAN.API.adminManageRegistrationFields({
                    action: 'save_bulk',
                    formType: ft,
                    fields: payloadFields,
                    settings: payloadSettings
                });
                if (window.SAWYAN && window.SAWYAN.RegEngine) {
                    window.SAWYAN.RegEngine.invalidateFormConfigCache(ft);
                }
                toast('✅ تم حفظ وتطبيق التعديلات على قاعدة البيانات والواجهات فوراً!', false);
                await loadAndRenderBuilder(pg);
            } catch (err) {
                toast('تعذر حفظ التعديلات: ' + err.message, true);
            }
        }

        async function doReset() {
            const ok = window.SAWYAN?.UI?.confirm
                ? await window.SAWYAN.UI.confirm({ title: 'استعادة الافتراضي', message: 'هل تريد استعادة الإعدادات والنصوص الافتراضية القياسية لهذا النموذج فقط؟', confirmText: 'استعادة', cancelText: 'إلغاء', tone: 'warning' })
                : true;
            if (!ok) return;
            try {
                await window.SAWYAN.API.adminManageRegistrationFields({
                    action: 'reset_defaults',
                    formType: ft
                });
                if (window.SAWYAN && window.SAWYAN.RegEngine) {
                    window.SAWYAN.RegEngine.invalidateFormConfigCache(ft);
                }
                toast('↩️ تم استعادة الإعدادات الافتراضية للنموذج بنجاح.', false);
                await loadAndRenderBuilder(pg);
            } catch (err) {
                toast('تعذر استعادة الافتراضي: ' + err.message, true);
            }
        }

        ['top', 'bottom'].forEach(sfx => {
            const svBtn = document.getElementById(`btnSaveReg_${sfx}`);
            const rsBtn = document.getElementById(`btnResetReg_${sfx}`);
            const mapBtn = document.getElementById(`btnPitchRadar_${sfx}`);
            if (svBtn) svBtn.addEventListener('click', doSave);
            if (rsBtn) rsBtn.addEventListener('click', doReset);
            if (mapBtn) mapBtn.addEventListener('click', openMerchantPitchRadarModal);
        });
    }

    /**
     * نافذة خريطة انتشار الأعضاء المجهولة (أعلام خضراء فقط بدون أسماء/هواتف/أكواد) لعرضها للتاجر عند التعاقد
     */
    function openMerchantPitchRadarModal() {
        let ov = document.getElementById('svPitchRadarOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'svPitchRadarOverlay';
            ov.className = 'sv-pitch-modal-overlay';
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';

        const countriesList = (window.SAWYAN && typeof window.SAWYAN.getCountriesSorted === 'function')
            ? window.SAWYAN.getCountriesSorted()
            : ((window.SAWYAN && Array.isArray(window.SAWYAN.Countries))
                ? window.SAWYAN.Countries
                : [{ code: 'EG', nameAr: 'مصر', nameEn: 'Egypt', flag: '🇪🇬' }, { code: 'SA', nameAr: 'السعودية', nameEn: 'Saudi Arabia', flag: '🇸🇦' }, { code: 'TR', nameAr: 'تركيا', nameEn: 'Turkey', flag: '🇹🇷' }]);

        ov.innerHTML = `
            <div class="sv-pitch-modal-box">
                <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px;">
                    <div>
                        <h3 style="margin:0;color:#065f46;font-size:1.1rem;">🗺️ خريطة انتشار أعضاء SAWYAN حول موقع التاجر (سرية تامة للبيانات)</h3>
                        <small style="color:#475569;">تُظهر أعلام خضراء مجهولة الهوية مع تمويه إحداثيات أوتوماتيكي (±150–350م) دون أي أسماء أو هواتف — مثالية لإقناع التجار بقوة القاعدة الشرائية في محيطهم.</small>
                    </div>
                    <button type="button" id="svPitchCloseBtn" class="btn-sm btn-outline" style="font-size:1rem;">✕ إغلاق</button>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px;">
                    <div>
                        <label style="display:block;font-weight:700;font-size:0.82rem;margin-bottom:4px;">الدولة</label>
                        <select id="svPitchCountry" class="form-control">
                            <option value="">كل الدول</option>
                            ${countriesList.map(c => `<option value="${esc(c.code)}" ${c.code === 'EG' ? 'selected' : ''}>${esc(c.flag || '')} ${esc(c.nameAr)} (${esc(c.code)})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block;font-weight:700;font-size:0.82rem;margin-bottom:4px;">خط العرض (Lat)</label>
                        <input type="number" step="0.0001" id="svPitchLat" class="form-control" value="30.0444">
                    </div>
                    <div>
                        <label style="display:block;font-weight:700;font-size:0.82rem;margin-bottom:4px;">خط الطول (Lng)</label>
                        <input type="number" step="0.0001" id="svPitchLng" class="form-control" value="31.2357">
                    </div>
                    <div>
                        <label style="display:block;font-weight:700;font-size:0.82rem;margin-bottom:4px;">نطاق الدائرة (كم)</label>
                        <select id="svPitchRadius" class="form-control">
                            <option value="5">5 كم</option>
                            <option value="15" selected>15 كم</option>
                            <option value="25">25 كم</option>
                            <option value="50">50 كم</option>
                        </select>
                    </div>
                </div>

                <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px;">
                    <button type="button" id="svPitchRefreshBtn" class="btn btn-primary" style="background:#059669;border-color:#047857;">
                        🔍 تحديث خريطة الأعلام حول المتجر
                    </button>
                    <div id="svPitchStatsBadge" style="font-weight:800;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:6px 12px;border-radius:10px;">
                        ⏳ جاري مسح النطاق...
                    </div>
                </div>

                <div id="svPitchMapCanvas" style="height:370px;width:100%;border-radius:12px;border:1.5px solid #cbd5e1;"></div>
            </div>
        `;

        document.getElementById('svPitchCloseBtn').addEventListener('click', function () {
            ov.style.display = 'none';
            if (_pitchMap) {
                try { _pitchMap.remove(); } catch (_e) {}
                _pitchMap = null;
            }
        });

        if (window.SAWYAN && window.SAWYAN.SmartSearch) {
            const pitchCtry = document.getElementById('svPitchCountry');
            if (pitchCtry) {
                window.SAWYAN.SmartSearch.attachToSelect(pitchCtry, {
                    kind: 'country',
                    compact: true,
                    placeholder: 'ابحث عن الدولة (عربي / English)...',
                    showLetterHeaders: true,
                    skipEmptyPlaceholder: false
                });
            }
        }

        if (typeof window.L !== 'undefined') {
            const lat0 = Number(document.getElementById('svPitchLat').value);
            const lng0 = Number(document.getElementById('svPitchLng').value);
            _pitchMap = window.L.map('svPitchMapCanvas', { scrollWheelZoom: false }).setView([lat0, lng0], 12);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 19
            }).addTo(_pitchMap);
            _pitchLayer = window.L.layerGroup().addTo(_pitchMap);
            _pitchMap.on('click', function (ev) {
                document.getElementById('svPitchLat').value = ev.latlng.lat.toFixed(5);
                document.getElementById('svPitchLng').value = ev.latlng.lng.toFixed(5);
                refreshPitchPins();
            });
            setTimeout(function () { try { _pitchMap.invalidateSize(); } catch (_e) {} }, 250);
        }

        async function refreshPitchPins() {
            const lat = Number(document.getElementById('svPitchLat').value || 30.0444);
            const lng = Number(document.getElementById('svPitchLng').value || 31.2357);
            const rad = Number(document.getElementById('svPitchRadius').value || 15);
            const cc = document.getElementById('svPitchCountry').value || null;
            const badge = document.getElementById('svPitchStatsBadge');
            badge.textContent = '⏳ جاري تحديث الأعلام...';

            try {
                const res = await window.SAWYAN.API.getAnonymizedMembersMapPins({
                    centerLat: lat,
                    centerLng: lng,
                    radiusKm: rad,
                    countryCode: cc
                });
                const pins = Array.isArray(res && res.pins) ? res.pins : [];
                badge.textContent = `🚩 إجمالي الأعضاء داخل نطاق ${rad} كم: ${Number(res.total_pins || pins.length)} عضو (بيانات مجهولة 100%)`;

                if (_pitchMap && _pitchLayer) {
                    _pitchLayer.clearLayers();
                    _pitchCenterMarker = window.L.circle([lat, lng], {
                        radius: rad * 1000,
                        color: '#0284c7',
                        fillColor: '#38bdf8',
                        fillOpacity: 0.08,
                        weight: 1.5
                    }).addTo(_pitchLayer);

                    window.L.circleMarker([lat, lng], {
                        radius: 8,
                        color: '#1e3a8a',
                        fillColor: '#2563eb',
                        fillOpacity: 0.95
                    }).bindPopup('🏪 موقع المتجر المستهدف').addTo(_pitchLayer);

                    const flagIcon = window.L.divIcon({
                        className: 'sv-anon-flag-pin',
                        html: '<div style="font-size:20px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));">🚩</div>',
                        iconSize: [22, 22],
                        iconAnchor: [11, 20]
                    });

                    pins.forEach(function (p) {
                        window.L.marker([Number(p.lat), Number(p.lng)], { icon: flagIcon })
                            .bindPopup('👤 عضو SAWYAN')
                            .addTo(_pitchLayer);
                    });
                    _pitchMap.setView([lat, lng], rad <= 10 ? 13 : (rad <= 25 ? 11 : 10));
                }
            } catch (err) {
                badge.textContent = '⛔ ' + (window.SAWYAN?.UI?.humanizeError ? window.SAWYAN.UI.humanizeError(err) : (err && err.message) || 'تعذر التحميل');
            }
        }

        document.getElementById('svPitchRefreshBtn').addEventListener('click', refreshPitchPins);
        refreshPitchPins();
    }
})();
