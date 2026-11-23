/**
 * ============================================================================
 * SAWYAN V3.0 — Unified Smart Multilingual Autocomplete Combobox (`SAWYAN.SmartSearch`)
 * Features:
 *  1. Instant first-letter inline ghost autocomplete (Tab / Enter to accept)
 *  2. Automatic query-language detection:
 *       - Arabic input -> Arabic search (normalized أ/إ/آ, ة/ه, ى/ي, optional الـ) + Hijaa'i sort (أ ب ت ث ج ...)
 *       - English/Latin input -> English search + A-Z sort (A B C D ...)
 *       - Any UI language -> native Intl.Collator(lang) alphabetical order
 *       - Dial codes (+20, 966, +90) & ISO codes (EG, SA, TR) supported seamlessly
 *  3. Alphabetical letter headers, match highlighting, keyboard navigation,
 *     optional remote async search (GeoNames), and 1-click manual fallback
 *  4. Full bidirectional synchronization with underlying native <select>
 * ============================================================================
 */
(function (global) {
    'use strict';

    global.SAWYAN = global.SAWYAN || {};

    function esc(str) {
        return String(str === null || str === undefined ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getLocaleSort() {
        if (global.SAWYAN && global.SAWYAN.LocaleSort) return global.SAWYAN.LocaleSort;
        // Minimal safe fallback if countries.js was not loaded on a page
        const normDig = s => String(s || '')
            .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0));
        const stripAl = s => String(s || '').trim().replace(/^ال(?=[\u0621-\u064A]{2,})/, '');
        const normAr = s => normDig(s).replace(/[\u064B-\u065F\u0670\u0640]/g, '')
            .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
        const normLat = s => normDig(s).replace(/\s+/g, ' ').trim().toLowerCase();
        return {
            getDocLang: () => (document.documentElement.lang || 'ar').toLowerCase().split(/[-_]/)[0] || 'ar',
            normalizeDigits: normDig,
            stripArabicDiacritics: s => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, ''),
            stripArabicDefiniteArticle: stripAl,
            normalizeArabic: normAr,
            normalizeLatin: normLat,
            normalizeForSearch: (s, l) => (l === 'ar' || /[\u0600-\u06FF]/.test(String(s || ''))) ? normAr(s) : normLat(s),
            detectQueryLang: (q, fb) => /[\u0600-\u06FF]/.test(String(q || '')) ? 'ar' : (/[A-Za-z]/.test(String(q || '')) ? 'en' : (fb || 'ar')),
            compareStrings: (a, b, l) => String(a || '').localeCompare(String(b || ''), l || 'ar', { sensitivity: 'base', numeric: true }),
            getLetterGroup: (s, l) => {
                const t = String(s || '').trim();
                if (!t) return '#';
                if (l === 'ar') {
                    const k = normAr(stripAl(t));
                    return k[0] === 'ا' ? 'أ' : (k[0] || '#');
                }
                return t[0].toUpperCase();
            },
            getLocalizedCountryName: (c, l) => (l === 'en' ? (c.nameEn || c.nameAr || c.code) : (c.nameAr || c.nameEn || c.code)),
            sortItems: (arr, fn, l) => (arr || []).slice().sort((a, b) => String(fn(a)).localeCompare(String(fn(b)), l || 'ar')),
            detectCountryFromTimezone: () => null
        };
    }

    /**
     * يبني قائمة عناصر ثرية تلقائياً من خيارات أي <select> مع إثرائها ببيانات SAWYAN.Countries إن كانت دولاً
     */
    function extractItemsFromSelect(selectEl, opts) {
        const ls = getLocaleSort();
        const items = [];
        const countryLookup = (global.SAWYAN && typeof global.SAWYAN.getCountryByCode === 'function')
            ? global.SAWYAN.getCountryByCode
            : null;

        [...selectEl.options].forEach(opt => {
            const val = opt.value;
            if (val === '__MANUAL__') return;
            const rawText = String(opt.textContent || '').trim();
            if (!val && opts.skipEmptyPlaceholder !== false) return;

            const isSpecialTop = val === '' || val === 'ALL' || val === 'all' || val === 'GLOBAL' || val === 'PIONEER';
            const upperVal = String(val || '').trim().toUpperCase();
            const cMeta = (!isSpecialTop && countryLookup && /^[A-Z]{2}$/.test(upperVal)) ? countryLookup(upperVal) : null;

            const dsAr = opt.dataset.nameAr || opt.dataset.name || '';
            const dsEn = opt.dataset.nameEn || opt.dataset.asciiname || '';
            const dsAdmin1 = opt.dataset.admin1 || '';

            const labelAr = dsAr || (cMeta ? cMeta.nameAr : rawText.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF\s🌍📍✓]+/, '').replace(/\s*\([A-Z]{2}\).*$/, '').trim() || rawText);
            const labelEn = dsEn || (cMeta ? cMeta.nameEn : (/[A-Za-z]/.test(rawText) ? rawText : labelAr));
            const flag = opt.dataset.flag || (cMeta ? cMeta.flag : (isSpecialTop && rawText.startsWith('🌍') ? '🌍' : ''));
            const dialCode = opt.dataset.dialCode || (cMeta ? cMeta.dialCode : '');
            const aliases = cMeta && Array.isArray(cMeta.aliases) ? cMeta.aliases : [];
            const isActive = opt.dataset.active === '1' || rawText.includes('مفعّلة') || rawText.includes('نشطة');

            items.push({
                value: val,
                labelAr: labelAr || rawText,
                labelEn: labelEn || labelAr || rawText,
                rawText,
                flag,
                code: cMeta ? cMeta.code : (opt.dataset.code || ''),
                dialCode,
                subAr: dsAdmin1 && !dsAdmin1.startsWith('__GEO_') && dsAdmin1 !== labelAr ? dsAdmin1 : '',
                subEn: dsAdmin1 && !dsAdmin1.startsWith('__GEO_') && dsAdmin1 !== labelEn ? dsAdmin1 : '',
                badge: isActive ? 'مفعّلة' : '',
                aliases,
                pinnedTop: isSpecialTop,
                isActive,
                lat: opt.dataset.lat || '',
                lng: opt.dataset.lng || '',
                meta: {
                    name: dsAr || labelAr,
                    admin1: dsAdmin1,
                    lat: opt.dataset.lat || '',
                    lng: opt.dataset.lng || ''
                }
            });
        });

        // Sort non-pinned items strictly in current document language
        const docLang = ls.getDocLang();
        const pinned = items.filter(i => i.pinnedTop);
        const sortable = items.filter(i => !i.pinnedTop);
        sortable.sort((a, b) => ls.compareStrings(getPrimaryLabel(a, docLang), getPrimaryLabel(b, docLang), docLang));
        return pinned.concat(sortable);
    }

    function getPrimaryLabel(item, lang) {
        const ls = getLocaleSort();
        const l = String(lang || ls.getDocLang() || 'ar').toLowerCase().split(/[-_]/)[0];
        if (item.pinnedTop) return item.rawText || item.labelAr || item.labelEn || '';
        if (l === 'ar') return item.labelAr || item.labelEn || item.rawText || '';
        if (l === 'en') return item.labelEn || item.labelAr || item.rawText || '';
        if (item.code && item.code.length === 2) {
            return ls.getLocalizedCountryName({ code: item.code, nameAr: item.labelAr, nameEn: item.labelEn }, l);
        }
        return item.labelEn || item.labelAr || item.rawText || '';
    }

    function getSecondaryLabel(item, lang) {
        if (item.pinnedTop) return '';
        const l = String(lang || 'ar').toLowerCase().split(/[-_]/)[0];
        const parts = [];
        const alt = l === 'ar' ? item.labelEn : item.labelAr;
        const primary = getPrimaryLabel(item, l);
        if (alt && alt.toLowerCase() !== primary.toLowerCase()) parts.push(alt);
        const sub = l === 'ar' ? item.subAr : (item.subEn || item.subAr);
        if (sub && sub.toLowerCase() !== primary.toLowerCase()) parts.push(sub);
        if (item.code && !parts.includes(item.code)) parts.push(item.code);
        return parts.join(' • ');
    }

    /**
     * يحسب درجة المطابقة مع دعم:
     * - البداية الفورية من أول حرف (مع تجاهل الـ التعريف بالعربية)
     * - تطابق بداية أي كلمة داخل الاسم
     * - تطابق داخل النص أو الأسماء البديلة (Aliases) أو كود الدولة أو مفتاح الهاتف
     */
    function scoreItemMatch(item, rawQuery, activeLang) {
        const ls = getLocaleSort();
        const q = String(rawQuery || '').trim();
        if (!q) return { matched: true, tier: item.pinnedTop ? 0 : 1, prefixMatchText: '' };

        const qNormAr = ls.normalizeArabic(q);
        const qNormArNoAl = ls.normalizeArabic(ls.stripArabicDefiniteArticle(q));
        const qNormLat = ls.normalizeLatin(q);
        const qDigits = ls.normalizeDigits(q).replace(/[^0-9+]/g, '');

        const primary = getPrimaryLabel(item, activeLang);
        const pNormAr = ls.normalizeArabic(primary);
        const pNormArNoAl = ls.normalizeArabic(ls.stripArabicDefiniteArticle(primary));
        const pNormLat = ls.normalizeLatin(primary);

        const arName = item.labelAr || '';
        const enName = item.labelEn || '';
        const arNorm = ls.normalizeArabic(arName);
        const arNormNoAl = ls.normalizeArabic(ls.stripArabicDefiniteArticle(arName));
        const enNorm = ls.normalizeLatin(enName);
        const codeNorm = ls.normalizeLatin(item.code || '');
        const dialClean = String(item.dialCode || '').replace(/\s+/g, '');
        const dialDigits = dialClean.replace(/\D+/g, '');
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        const subBlob = `${item.subAr || ''} ${item.subEn || ''}`;

        // 1. Exact match on primary, code, or dial
        if (
            (activeLang === 'ar' && (pNormAr === qNormAr || (qNormArNoAl && pNormArNoAl === qNormArNoAl))) ||
            (activeLang !== 'ar' && pNormLat === qNormLat) ||
            (codeNorm && codeNorm === qNormLat) ||
            (qDigits && dialClean && (dialClean === qDigits || ('+' + dialDigits) === qDigits))
        ) {
            return { matched: true, tier: 1, prefixMatchText: primary };
        }

        // 2. Prefix match on primary name (instant first-letter autocomplete!)
        if (activeLang === 'ar') {
            if (pNormAr.startsWith(qNormAr)) {
                return { matched: true, tier: 2, prefixMatchText: primary };
            }
            if (qNormArNoAl && pNormArNoAl.startsWith(qNormArNoAl)) {
                return { matched: true, tier: 2, prefixMatchText: ls.stripArabicDefiniteArticle(primary) };
            }
        } else {
            if (pNormLat.startsWith(qNormLat)) {
                return { matched: true, tier: 2, prefixMatchText: primary };
            }
        }

        // 3. Prefix match on alternate language name, code, dial code, or alias
        if (arNorm.startsWith(qNormAr) || (qNormArNoAl && arNormNoAl.startsWith(qNormArNoAl))) {
            return { matched: true, tier: 3, prefixMatchText: arName };
        }
        if (qNormLat && (enNorm.startsWith(qNormLat) || (codeNorm && codeNorm.startsWith(qNormLat)))) {
            return { matched: true, tier: 3, prefixMatchText: enName };
        }
        if (qDigits && qDigits.length >= 2 && dialDigits && (dialClean.startsWith(qDigits) || dialDigits.startsWith(qDigits.replace(/^\+/, '')))) {
            return { matched: true, tier: 3, prefixMatchText: '' };
        }
        for (let i = 0; i < aliases.length; i++) {
            const al = aliases[i];
            const alAr = ls.normalizeArabic(al);
            const alNoAl = ls.normalizeArabic(ls.stripArabicDefiniteArticle(al));
            const alLat = ls.normalizeLatin(al);
            if ((qNormAr && (alAr.startsWith(qNormAr) || (qNormArNoAl && alNoAl.startsWith(qNormArNoAl)))) ||
                (qNormLat && alLat.startsWith(qNormLat))) {
                return { matched: true, tier: 3, prefixMatchText: al };
            }
        }

        // 4. Word-start match inside primary/secondary name
        const wordsAr = arNorm.split(/\s+/);
        if (qNormAr && wordsAr.some(w => w.startsWith(qNormAr) || (qNormArNoAl && ls.normalizeArabic(ls.stripArabicDefiniteArticle(w)).startsWith(qNormArNoAl)))) {
            return { matched: true, tier: 4, prefixMatchText: '' };
        }
        const wordsEn = enNorm.split(/\s+/);
        if (qNormLat && wordsEn.some(w => w.startsWith(qNormLat))) {
            return { matched: true, tier: 4, prefixMatchText: '' };
        }

        // 5. Substring match across names, province/admin1, or aliases
        const fullArBlob = `${arNorm} ${ls.normalizeArabic(subBlob)} ${aliases.map(a => ls.normalizeArabic(a)).join(' ')}`;
        const fullEnBlob = `${enNorm} ${ls.normalizeLatin(subBlob)} ${aliases.map(a => ls.normalizeLatin(a)).join(' ')}`;
        if ((qNormAr && fullArBlob.includes(qNormAr)) ||
            (qNormArNoAl && qNormArNoAl.length >= 2 && fullArBlob.includes(qNormArNoAl)) ||
            (qNormLat && fullEnBlob.includes(qNormLat))) {
            return { matched: true, tier: 5, prefixMatchText: '' };
        }

        return { matched: false, tier: 99, prefixMatchText: '' };
    }

    function highlightMatch(text, rawQuery, activeLang) {
        const s = String(text || '');
        const q = String(rawQuery || '').trim();
        if (!q || !s) return esc(s);
        const ls = getLocaleSort();

        // Direct case-insensitive highlight first
        const lowS = s.toLowerCase();
        const lowQ = q.toLowerCase();
        const idx = lowS.indexOf(lowQ);
        if (idx >= 0) {
            return esc(s.slice(0, idx)) +
                '<mark class="sw-ss-mark">' + esc(s.slice(idx, idx + q.length)) + '</mark>' +
                esc(s.slice(idx + q.length));
        }

        // Arabic normalized position mapping (handles أ/ا/إ/آ, ة/ه, ى/ي, diacritics)
        if (activeLang === 'ar') {
            const normChars = [];
            const origIndices = [];
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (/[\u064B-\u065F\u0670\u0640]/.test(ch)) continue;
                normChars.push(ls.normalizeArabic(ch));
                origIndices.push(i);
            }
            const joined = normChars.join('');
            const qn = ls.normalizeArabic(q);
            const qnNoAl = ls.normalizeArabic(ls.stripArabicDefiniteArticle(q));
            let pos = joined.indexOf(qn);
            let mLen = qn.length;
            if (pos < 0 && qnNoAl) {
                pos = joined.indexOf(qnNoAl);
                mLen = qnNoAl.length;
            }
            if (pos >= 0 && mLen > 0) {
                const startOrig = origIndices[pos];
                const endOrig = (pos + mLen < origIndices.length) ? origIndices[pos + mLen] : s.length;
                return esc(s.slice(0, startOrig)) +
                    '<mark class="sw-ss-mark">' + esc(s.slice(startOrig, endOrig)) + '</mark>' +
                    esc(s.slice(endOrig));
            }
        }
        return esc(s);
    }

    /**
     * يحسب نص التكملة التلقائية الشفافة (Ghost suffix) عندما يطابق أول خيار بداية ما كتبه المستخدم
     */
    function computeInlineGhost(rawInput, topMatch, activeLang) {
        if (!rawInput || !topMatch) return null;
        const ls = getLocaleSort();
        const candidate = topMatch.prefixMatchText || getPrimaryLabel(topMatch.item, activeLang);
        if (!candidate || candidate.length <= rawInput.length) return null;

        if (activeLang === 'ar') {
            const normIn = ls.normalizeArabic(rawInput);
            const normCand = ls.normalizeArabic(candidate);
            if (!normIn || !normCand.startsWith(normIn)) return null;
            // Find split index in candidate matching rawInput length (ignoring diacritics)
            let count = 0;
            let splitIdx = 0;
            for (let i = 0; i < candidate.length && count < normIn.length; i++) {
                if (!/[\u064B-\u065F\u0670\u0640]/.test(candidate[i])) count++;
                splitIdx = i + 1;
            }
            const rest = candidate.slice(splitIdx);
            return rest ? { typed: rawInput, rest, full: candidate } : null;
        }

        const normIn = ls.normalizeLatin(rawInput);
        const normCand = ls.normalizeLatin(candidate);
        if (!normIn || !normCand.startsWith(normIn)) return null;
        const rest = candidate.slice(rawInput.length);
        return rest ? { typed: rawInput, rest, full: candidate } : null;
    }

    /**
     * يربط مكون البحث الذكي والتكملة التلقائية على أي عنصر <select>
     */
    function attachToSelect(selectEl, options) {
        if (!selectEl) return null;
        if (selectEl._swSmartSearch) {
            if (options && typeof selectEl._swSmartSearch.updateOptions === 'function') {
                selectEl._swSmartSearch.updateOptions(options);
            }
            selectEl._swSmartSearch.refresh();
            return selectEl._swSmartSearch;
        }

        const ls = getLocaleSort();
        const cfg = Object.assign({
            placeholder: 'ابحث بالاسم بالعربية أو الإنجليزية...',
            emptyText: 'لا توجد نتائج مطابقة لبحثك.',
            kind: 'generic', // 'country' | 'city' | 'district' | 'generic'
            compact: false,
            showLetterHeaders: true,
            showQuickPicks: false,
            quickPickCodes: [],
            suggestedCode: null,
            allowManual: false,
            manualValue: '__MANUAL__',
            manualActionLabel: (q) => `✍️ استخدام «${q}» كإدخال يدوي`,
            onManualPick: null,
            onRemoteSearch: null,
            remoteDebounceMs: 220,
            skipEmptyPlaceholder: true
        }, options || {});

        let items = [];
        let filteredEntries = [];
        let activeIdx = -1;
        let isOpen = false;
        let isTyping = false;
        let isLoading = false;
        let currentQuery = '';
        let activeLang = ls.getDocLang();
        let remoteTimer = null;
        let remoteSeq = 0;
        let currentGhost = null;
        let suppressObserver = false;

        // Build wrapper preserving original <select> DOM position & parent
        const wrap = document.createElement('div');
        wrap.className = 'sw-ss-wrap' + (cfg.compact ? ' sw-ss-compact' : '');
        wrap.dataset.swSmartKind = cfg.kind;

        const uid = 'swss_' + (selectEl.id || Math.random().toString(36).slice(2, 8));
        const listId = `${uid}_listbox`;

        wrap.innerHTML = `
            <div class="sw-ss-control">
                <span class="sw-ss-prefix" aria-hidden="true">🔍</span>
                <div class="sw-ss-input-stage">
                    <div class="sw-ss-ghost" aria-hidden="true"></div>
                    <input type="text"
                           class="sw-ss-input"
                           id="${uid}_input"
                           autocomplete="off"
                           autocorrect="off"
                           autocapitalize="off"
                           spellcheck="false"
                           role="combobox"
                           aria-autocomplete="both"
                           aria-expanded="false"
                           aria-controls="${listId}"
                           placeholder="${esc(cfg.placeholder)}">
                </div>
                <span class="sw-ss-tab-hint" title="اضغط Tab أو Enter لإكمال الاختيار">Tab ↹</span>
                <div class="sw-ss-actions">
                    <button type="button" class="sw-ss-clear-btn" aria-label="مسح البحث" title="مسح">✕</button>
                    <button type="button" class="sw-ss-toggle-btn" aria-label="فتح القائمة" title="عرض القائمة">
                        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.2 5.5L8 10.7l4.8-5.2H3.2z"/></svg>
                    </button>
                </div>
            </div>
            <div class="sw-ss-panel" role="region" aria-label="قائمة النتائج">
                <div class="sw-ss-meta-bar">
                    <span class="sw-ss-meta-lang"></span>
                    <span class="sw-ss-meta-count"></span>
                </div>
                <div class="sw-ss-quick-strip" style="display:none;"></div>
                <ul class="sw-ss-list" id="${listId}" role="listbox"></ul>
                <button type="button" class="sw-ss-manual-action" style="display:none;"></button>
            </div>
        `;

        selectEl.parentNode.insertBefore(wrap, selectEl);
        wrap.appendChild(selectEl);
        selectEl.classList.add('sw-ss-native-select');
        selectEl.tabIndex = -1;

        const prefixEl = wrap.querySelector('.sw-ss-prefix');
        const ghostEl = wrap.querySelector('.sw-ss-ghost');
        const inputEl = wrap.querySelector('.sw-ss-input');
        const tabHintEl = wrap.querySelector('.sw-ss-tab-hint');
        const clearBtn = wrap.querySelector('.sw-ss-clear-btn');
        const toggleBtn = wrap.querySelector('.sw-ss-toggle-btn');
        const panelEl = wrap.querySelector('.sw-ss-panel');
        const metaLangEl = wrap.querySelector('.sw-ss-meta-lang');
        const metaCountEl = wrap.querySelector('.sw-ss-meta-count');
        const quickStripEl = wrap.querySelector('.sw-ss-quick-strip');
        const listEl = wrap.querySelector('.sw-ss-list');
        const manualBtn = wrap.querySelector('.sw-ss-manual-action');

        // Clicking associated <label for="selectId"> focuses our combobox input
        if (selectEl.id) {
            const linkedLabel = document.querySelector(`label[for="${CSS.escape(selectEl.id)}"]`);
            if (linkedLabel) {
                linkedLabel.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    inputEl.focus();
                    openPanel();
                });
            }
        }

        function setDirectionForLang(lang) {
            const dir = lang === 'ar' ? 'rtl' : 'ltr';
            inputEl.setAttribute('dir', dir);
            ghostEl.setAttribute('dir', dir);
        }

        function updateGhost(ghostObj) {
            currentGhost = ghostObj || null;
            if (!ghostObj) {
                ghostEl.innerHTML = '';
                tabHintEl.classList.remove('visible');
                return;
            }
            ghostEl.innerHTML =
                `<span class="sw-ss-ghost-typed">${esc(ghostObj.typed)}</span>` +
                `<span class="sw-ss-ghost-rest">${esc(ghostObj.rest)}</span>`;
            tabHintEl.classList.add('visible');
        }

        function getSelectedItem() {
            const v = selectEl.value;
            if (!v && cfg.skipEmptyPlaceholder) return null;
            return items.find(i => String(i.value) === String(v)) || null;
        }

        function syncInputDisplayFromSelect() {
            if (isTyping) return;
            const selItem = getSelectedItem();
            const docLang = ls.getDocLang();
            setDirectionForLang(docLang);
            updateGhost(null);

            if (selItem && (selItem.value !== '' || !cfg.skipEmptyPlaceholder)) {
                const label = getPrimaryLabel(selItem, docLang);
                inputEl.value = label;
                prefixEl.textContent = selItem.flag || (cfg.kind === 'city' ? '🏙️' : cfg.kind === 'district' ? '📍' : '🔍');
                wrap.classList.add('has-value');
            } else if (selectEl.value === cfg.manualValue && cfg.allowManual) {
                inputEl.value = '✍️ إدخال يدوي';
                prefixEl.textContent = '✍️';
                wrap.classList.add('has-value');
            } else {
                inputEl.value = '';
                prefixEl.textContent = cfg.kind === 'country' ? '🌍' : (cfg.kind === 'city' ? '🏙️' : (cfg.kind === 'district' ? '📍' : '🔍'));
                wrap.classList.remove('has-value');
            }
            wrap.classList.toggle('is-disabled', Boolean(selectEl.disabled));
            wrap.classList.remove('has-query');
        }

        function renderQuickStrip() {
            if (!cfg.showQuickPicks || currentQuery.trim() !== '') {
                quickStripEl.style.display = 'none';
                quickStripEl.innerHTML = '';
                return;
            }
            const codes = [];
            if (cfg.suggestedCode) codes.push({ code: String(cfg.suggestedCode).toUpperCase(), suggested: true });
            (cfg.quickPickCodes || []).forEach(c => {
                const up = String(c || '').toUpperCase();
                if (up && !codes.some(x => x.code === up)) codes.push({ code: up, suggested: false });
            });
            const chips = [];
            codes.forEach(entry => {
                const found = items.find(i => String(i.value).toUpperCase() === entry.code);
                if (found) chips.push({ item: found, suggested: entry.suggested });
            });
            if (!chips.length) {
                quickStripEl.style.display = 'none';
                quickStripEl.innerHTML = '';
                return;
            }
            const docLang = ls.getDocLang();
            quickStripEl.style.display = 'flex';
            quickStripEl.innerHTML =
                `<span class="sw-ss-quick-label">⚡ وصول سريع:</span>` +
                chips.map(ch => {
                    const name = getPrimaryLabel(ch.item, docLang);
                    const tag = ch.suggested ? '📍 ' : '';
                    return `<button type="button" class="sw-ss-quick-chip ${ch.suggested ? 'is-suggested' : ''}" data-quick-val="${esc(ch.item.value)}">${tag}${esc(ch.item.flag || '')} ${esc(name)}</button>`;
                }).join('');
            quickStripEl.querySelectorAll('[data-quick-val]').forEach(btn => {
                btn.addEventListener('mousedown', function (ev) {
                    ev.preventDefault();
                    selectByValue(btn.dataset.quickVal, true);
                });
            });
        }

        function renderList() {
            const q = currentQuery.trim();
            const docLang = ls.getDocLang();
            activeLang = ls.detectQueryLang(q, docLang);
            setDirectionForLang(q ? activeLang : docLang);

            // Filter & score
            const matched = [];
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const sc = scoreItemMatch(it, q, activeLang);
                if (sc.matched) {
                    matched.push({ item: it, tier: sc.tier, prefixMatchText: sc.prefixMatchText });
                }
            }

            // Sort strictly by match tier -> strict language-native alphabetical order (أ ب ت ث ج for AR, A-Z for EN, etc.)
            matched.sort((a, b) => {
                if (a.tier !== b.tier) return a.tier - b.tier;
                return ls.compareStrings(
                    getPrimaryLabel(a.item, activeLang),
                    getPrimaryLabel(b.item, activeLang),
                    activeLang
                );
            });

            filteredEntries = matched;
            if (activeIdx >= filteredEntries.length) activeIdx = filteredEntries.length > 0 ? 0 : -1;
            if (q && filteredEntries.length > 0 && activeIdx < 0) activeIdx = 0;

            // Update inline first-letter ghost autocomplete
            if (isTyping && q && filteredEntries.length > 0 && !filteredEntries[0].item.pinnedTop) {
                const ghost = computeInlineGhost(inputEl.value, filteredEntries[0], activeLang);
                updateGhost(ghost);
            } else {
                updateGhost(null);
            }

            // Meta header indicating active language sort order
            if (activeLang === 'ar') {
                metaLangEl.textContent = '🔤 الترتيب الأبجدي العربي (أ ← ي)';
            } else if (activeLang === 'en') {
                metaLangEl.textContent = '🔤 English Alphabetical (A → Z)';
            } else {
                metaLangEl.textContent = `🔤 Alphabetical (${activeLang.toUpperCase()})`;
            }
            metaCountEl.textContent = isLoading
                ? '⏳ جاري البحث...'
                : `${filteredEntries.length} نتيجة`;

            renderQuickStrip();

            if (isLoading && filteredEntries.length === 0) {
                listEl.innerHTML = `<li class="sw-ss-empty">⏳ جاري تحميل القائمة...</li>`;
            } else if (filteredEntries.length === 0) {
                listEl.innerHTML = `<li class="sw-ss-empty">${esc(cfg.emptyText)}</li>`;
            } else {
                const showHeaders = cfg.showLetterHeaders && !q && filteredEntries.length >= 14;
                const selectedVal = String(selectEl.value || '');
                let lastLetter = '';
                const htmlParts = [];

                filteredEntries.forEach((entry, idx) => {
                    const it = entry.item;
                    const primary = getPrimaryLabel(it, activeLang);
                    const secondary = getSecondaryLabel(it, activeLang);

                    if (showHeaders && !it.pinnedTop) {
                        const letter = ls.getLetterGroup(primary, activeLang);
                        if (letter !== lastLetter) {
                            lastLetter = letter;
                            htmlParts.push(`<li class="sw-ss-letter-hdr" role="presentation">${esc(letter)}</li>`);
                        }
                    }

                    const isSel = String(it.value) === selectedVal && (it.value !== '' || !cfg.skipEmptyPlaceholder);
                    const isAct = idx === activeIdx;
                    const primaryHtml = highlightMatch(primary, q, activeLang);
                    const secHtml = secondary ? `<span class="sw-ss-opt-secondary">${highlightMatch(secondary, q, activeLang)}</span>` : '';
                    const flagHtml = it.flag ? `<span class="sw-ss-opt-flag">${esc(it.flag)}</span>` : '';
                    const dialHtml = it.dialCode ? `<span class="sw-ss-dial-pill">${esc(it.dialCode)}</span>` : '';
                    const badgeHtml = it.badge ? `<span class="sw-ss-badge-active">✓ ${esc(it.badge)}</span>` : '';

                    htmlParts.push(`
                        <li class="sw-ss-option ${isSel ? 'is-selected' : ''} ${isAct ? 'is-active' : ''}"
                            role="option"
                            aria-selected="${isSel ? 'true' : 'false'}"
                            data-ss-idx="${idx}"
                            data-ss-val="${esc(it.value)}">
                            <div class="sw-ss-opt-main">
                                ${flagHtml}
                                <div class="sw-ss-opt-texts">
                                    <span class="sw-ss-opt-primary">${primaryHtml}</span>
                                    ${secHtml}
                                </div>
                            </div>
                            <div class="sw-ss-opt-right">
                                ${badgeHtml}
                                ${dialHtml}
                            </div>
                        </li>
                    `);
                });
                listEl.innerHTML = htmlParts.join('');
            }

            // Optional 1-click manual fallback button (e.g., for districts not in GeoNames)
            if (cfg.allowManual) {
                const exactFound = q && filteredEntries.some(e =>
                    ls.normalizeForSearch(getPrimaryLabel(e.item, activeLang), activeLang) === ls.normalizeForSearch(q, activeLang)
                );
                if (q && !exactFound) {
                    manualBtn.style.display = 'flex';
                    manualBtn.innerHTML = `<span>${esc(cfg.manualActionLabel(q))}</span><span>↵</span>`;
                } else if (!q) {
                    manualBtn.style.display = 'flex';
                    manualBtn.innerHTML = `<span>✍️ إدخال اسم غير موجود بالقائمة يدوياً...</span><span>›</span>`;
                } else {
                    manualBtn.style.display = 'none';
                }
            } else {
                manualBtn.style.display = 'none';
            }
        }

        function positionPanel() {
            const rect = wrap.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            wrap.classList.toggle('open-up', spaceBelow < 260 && spaceAbove > spaceBelow);
        }

        function openPanel() {
            if (selectEl.disabled) return;
            if (!isOpen) {
                isOpen = true;
                wrap.classList.add('is-open');
                inputEl.setAttribute('aria-expanded', 'true');
                positionPanel();
            }
            renderList();
            // Scroll selected item into view when browsing full list
            if (!currentQuery) {
                const selEl = listEl.querySelector('.sw-ss-option.is-selected');
                if (selEl) {
                    try { selEl.scrollIntoView({ block: 'nearest' }); } catch (_e) {}
                }
            }
        }

        function closePanel(restoreSelected) {
            if (!isOpen && !isTyping) return;
            isOpen = false;
            isTyping = false;
            currentQuery = '';
            activeIdx = -1;
            wrap.classList.remove('is-open', 'open-up');
            inputEl.setAttribute('aria-expanded', 'false');
            updateGhost(null);
            if (restoreSelected !== false) {
                syncInputDisplayFromSelect();
            }
        }

        function selectByValue(val, closeAfter) {
            const exists = [...selectEl.options].some(o => String(o.value) === String(val));
            if (!exists) {
                const item = items.find(i => String(i.value) === String(val));
                if (item) {
                    suppressObserver = true;
                    const opt = document.createElement('option');
                    opt.value = item.value;
                    opt.textContent = getPrimaryLabel(item, ls.getDocLang());
                    if (item.meta) {
                        if (item.meta.name) opt.dataset.name = item.meta.name;
                        if (item.meta.admin1) opt.dataset.admin1 = item.meta.admin1;
                        if (item.meta.lat) opt.dataset.lat = item.meta.lat;
                        if (item.meta.lng) opt.dataset.lng = item.meta.lng;
                    }
                    selectEl.appendChild(opt);
                    suppressObserver = false;
                }
            }
            const changed = String(selectEl.value) !== String(val);
            selectEl.value = val;
            isTyping = false;
            currentQuery = '';
            if (closeAfter !== false) closePanel(false);
            syncInputDisplayFromSelect();
            if (changed) {
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        function triggerManualPick() {
            const typed = currentQuery.trim();
            isTyping = false;
            currentQuery = '';
            closePanel(false);
            if ([...selectEl.options].some(o => o.value === cfg.manualValue)) {
                selectEl.value = cfg.manualValue;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (typeof cfg.onManualPick === 'function') {
                cfg.onManualPick(typed);
            }
            inputEl.value = typed || '✍️ إدخال يدوي';
            prefixEl.textContent = '✍️';
            wrap.classList.add('has-value');
        }

        function highlightActiveRow() {
            const rows = listEl.querySelectorAll('.sw-ss-option');
            rows.forEach(r => {
                const isAct = Number(r.dataset.ssIdx) === activeIdx;
                r.classList.toggle('is-active', isAct);
                if (isAct) {
                    try { r.scrollIntoView({ block: 'nearest' }); } catch (_e) {}
                }
            });
        }

        // Event bindings
        inputEl.addEventListener('focus', function () {
            if (!isOpen) {
                // Select existing text so typing 1 letter immediately replaces & filters
                try { inputEl.select(); } catch (_e) {}
                openPanel();
            }
        });

        inputEl.addEventListener('click', function () {
            if (!isOpen) openPanel();
        });

        inputEl.addEventListener('input', function () {
            isTyping = true;
            currentQuery = inputEl.value;
            activeIdx = 0;
            wrap.classList.toggle('has-query', currentQuery.trim().length > 0);
            if (!isOpen) openPanel();
            else renderList();

            if (typeof cfg.onRemoteSearch === 'function') {
                clearTimeout(remoteTimer);
                const qSnap = currentQuery.trim();
                const seq = ++remoteSeq;
                remoteTimer = setTimeout(async () => {
                    try {
                        isLoading = true;
                        renderList();
                        const resItems = await cfg.onRemoteSearch(qSnap, activeLang);
                        if (seq !== remoteSeq) return;
                        isLoading = false;
                        if (Array.isArray(resItems)) {
                            items = resItems;
                        }
                        renderList();
                    } catch (_e) {
                        if (seq !== remoteSeq) return;
                        isLoading = false;
                        renderList();
                    }
                }, cfg.remoteDebounceMs);
            }
        });

        inputEl.addEventListener('keydown', function (ev) {
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                if (!isOpen) { openPanel(); return; }
                if (filteredEntries.length > 0) {
                    activeIdx = (activeIdx + 1) % filteredEntries.length;
                    highlightActiveRow();
                }
            } else if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                if (!isOpen) { openPanel(); return; }
                if (filteredEntries.length > 0) {
                    activeIdx = (activeIdx - 1 + filteredEntries.length) % filteredEntries.length;
                    highlightActiveRow();
                }
            } else if (ev.key === 'Tab') {
                if (isOpen && isTyping && currentGhost && filteredEntries.length > 0) {
                    ev.preventDefault();
                    selectByValue(filteredEntries[0].item.value, true);
                } else if (isOpen) {
                    closePanel(true);
                }
            } else if (ev.key === 'Enter') {
                if (isOpen) {
                    ev.preventDefault();
                    const pick = filteredEntries[activeIdx >= 0 ? activeIdx : 0];
                    if (pick) {
                        selectByValue(pick.item.value, true);
                    } else if (cfg.allowManual && currentQuery.trim()) {
                        triggerManualPick();
                    }
                }
            } else if (ev.key === 'Escape') {
                if (isOpen) {
                    ev.preventDefault();
                    closePanel(true);
                }
            }
        });

        tabHintEl.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            if (filteredEntries.length > 0) {
                selectByValue(filteredEntries[0].item.value, true);
            }
        });

        listEl.addEventListener('mousedown', function (ev) {
            const optEl = ev.target.closest('.sw-ss-option');
            if (!optEl) return;
            ev.preventDefault();
            selectByValue(optEl.dataset.ssVal, true);
        });

        manualBtn.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            triggerManualPick();
        });

        clearBtn.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            isTyping = true;
            currentQuery = '';
            inputEl.value = '';
            updateGhost(null);
            wrap.classList.remove('has-query');
            if (!cfg.skipEmptyPlaceholder || [...selectEl.options].some(o => o.value === '')) {
                if (selectEl.value !== '') {
                    selectEl.value = '';
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            inputEl.focus();
            openPanel();
            if (typeof cfg.onRemoteSearch === 'function') {
                cfg.onRemoteSearch('', ls.getDocLang()).then(res => {
                    if (Array.isArray(res)) {
                        items = res;
                        renderList();
                    }
                }).catch(() => {});
            }
        });

        toggleBtn.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            if (isOpen) {
                closePanel(true);
            } else {
                inputEl.focus();
                openPanel();
            }
        });

        document.addEventListener('mousedown', function (ev) {
            if (isOpen && !wrap.contains(ev.target)) {
                closePanel(true);
            }
        });

        // Sync if select value changes programmatically
        selectEl.addEventListener('change', function () {
            if (!isTyping) syncInputDisplayFromSelect();
        });

        // Observe dynamic <option> changes on the native <select>
        let obs = null;
        if (typeof MutationObserver === 'function') {
            obs = new MutationObserver(function () {
                if (suppressObserver) return;
                items = extractItemsFromSelect(selectEl, cfg);
                if (isOpen) renderList();
                else syncInputDisplayFromSelect();
            });
            obs.observe(selectEl, { childList: true });
        }

        // Initial hydration
        items = extractItemsFromSelect(selectEl, cfg);
        syncInputDisplayFromSelect();

        const api = {
            wrap,
            inputEl,
            selectEl,
            refresh: function () {
                items = extractItemsFromSelect(selectEl, cfg);
                if (isOpen) renderList();
                else syncInputDisplayFromSelect();
            },
            setItems: function (newItems) {
                items = Array.isArray(newItems) ? newItems.slice() : [];
                if (isOpen) renderList();
                else syncInputDisplayFromSelect();
            },
            setValue: function (val, silent) {
                selectEl.value = val;
                isTyping = false;
                currentQuery = '';
                syncInputDisplayFromSelect();
                if (!silent) selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            },
            setLoading: function (flag) {
                isLoading = Boolean(flag);
                if (isOpen) renderList();
            },
            setValidationState: function (state) {
                wrap.classList.toggle('is-valid', state === 'valid');
                wrap.classList.toggle('is-invalid', state === 'invalid');
            },
            updateOptions: function (nextOpts) {
                Object.assign(cfg, nextOpts || {});
                if (cfg.placeholder) inputEl.placeholder = cfg.placeholder;
                wrap.classList.toggle('sw-ss-compact', Boolean(cfg.compact));
            },
            focus: function () {
                inputEl.focus();
            },
            open: openPanel,
            close: () => closePanel(true),
            destroy: function () {
                if (obs) obs.disconnect();
                selectEl.classList.remove('sw-ss-native-select');
                selectEl.tabIndex = 0;
                if (wrap.parentNode) {
                    wrap.parentNode.insertBefore(selectEl, wrap);
                    wrap.remove();
                }
                delete selectEl._swSmartSearch;
            }
        };

        selectEl._swSmartSearch = api;
        return api;
    }

    /**
     * أداة مساعدة لتحويل الأرقام العربية-الهندية (٠١٢٣٤٥٦٧٨٩) تلقائياً إلى أرقام قياسية (0-9) أثناء الكتابة
     */
    function attachAutoDigitNormalization(inputEl) {
        if (!inputEl || inputEl.dataset.swDigitNorm === '1') return;
        inputEl.dataset.swDigitNorm = '1';
        const ls = getLocaleSort();
        inputEl.addEventListener('input', function () {
            const orig = inputEl.value;
            const norm = ls.normalizeDigits(orig);
            if (orig !== norm) {
                const pos = inputEl.selectionStart;
                inputEl.value = norm;
                try {
                    if (typeof pos === 'number') inputEl.setSelectionRange(pos, pos);
                } catch (_e) {}
            }
        });
    }

    /**
     * فحص تطابق نص بحث ثنائي اللغة (عربي مطبّع + إنجليزي) للاستخدام في أي شريط بحث بالموقع
     */
    function matchesBilingualQuery(haystackText, rawQuery) {
        const q = String(rawQuery || '').trim();
        if (!q) return true;
        const ls = getLocaleSort();
        const lang = ls.detectQueryLang(q, 'ar');
        const h = String(haystackText || '');
        if (lang === 'ar') {
            const hNorm = ls.normalizeArabic(h);
            const qNorm = ls.normalizeArabic(q);
            const qNoAl = ls.normalizeArabic(ls.stripArabicDefiniteArticle(q));
            return hNorm.includes(qNorm) || (qNoAl.length >= 2 && hNorm.includes(qNoAl));
        }
        return ls.normalizeLatin(h).includes(ls.normalizeLatin(q));
    }

    global.SAWYAN.SmartSearch = {
        attachToSelect,
        attachAutoDigitNormalization,
        matchesBilingualQuery,
        getLocaleSort,
        scoreItemMatch
    };
})(window);
