/**
 * SAWYAN V3.0 — Unified Registration, Form Governance, E.164 Phone, Email & Geo-Picker Engine
 * المحرك الموحد لهندسة نماذج التسجيل، والتحقق الصارم من البريد الإلكتروني والهاتف، ومنتقي خرائط جوجل، والتدرج الجغرافي العالمي
 */
(function (global) {
    'use strict';

    global.SAWYAN = global.SAWYAN || {};

    const _configCache = {};

    function escapeHtml(str) {
        return String(str === undefined || str === null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * تحقق صارم من صحة البريد الإلكتروني:
     * - علامة @ واحدة بالضبط (لا أقل ولا أكثر)
     * - وجود نقطة (.) في موضع سليم في اسم النطاق بعد @
     * - امتداد TLD صحيح من حرفين على الأقل ولا مسافات أو نقطتين متتاليتين (..)
     */
    function validateEmailStrict(rawEmail, isRequired) {
        const clean = String(rawEmail || '').trim().toLowerCase();
        if (!clean) {
            return isRequired
                ? { valid: false, clean: '', error: 'يرجى إدخال البريد الإلكتروني.' }
                : { valid: true, clean: '', error: null };
        }
        if (clean.length > 254 || /\s/.test(clean)) {
            return { valid: false, clean, error: 'البريد الإلكتروني يجب ألا يحتوي على مسافات وألا يتجاوز 254 حرفاً.' };
        }
        const parts = clean.split('@');
        if (parts.length !== 2) {
            return { valid: false, clean, error: 'يجب أن يحتوي البريد الإلكتروني على علامة (@) واحدة فقط في موضعها الصحيح.' };
        }
        const [localPart, domainPart] = parts;
        if (!localPart || localPart.length > 64) {
            return { valid: false, clean, error: 'اسم المستخدم قبل علامة (@) غير مكتمل أو طويل جداً.' };
        }
        if (!/^[a-z0-9._%+-]+$/.test(localPart) || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
            return { valid: false, clean, error: 'الجزء الأول قبل (@) يحتوي على رموز غير مسموح بها أو نقطة في غير موضعها.' };
        }
        if (!domainPart || domainPart.length < 4 || domainPart.length > 253 || !domainPart.includes('.')) {
            return { valid: false, clean, error: 'اسم النطاق بعد (@) يجب أن يحتوي على نقطة (.) صالحة مثل gmail.com.' };
        }
        if (domainPart.startsWith('.') || domainPart.endsWith('.') || domainPart.includes('..')) {
            return { valid: false, clean, error: 'موضع النقطة (.) في اسم النطاق بعد (@) غير صحيح.' };
        }
        const labels = domainPart.split('.');
        if (labels.length < 2) {
            return { valid: false, clean, error: 'صيغة النطاق البريدي غير مكتملة (مثال: name@domain.com).' };
        }
        for (let i = 0; i < labels.length; i++) {
            const lbl = labels[i];
            if (!lbl || lbl.length > 63 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(lbl)) {
                return { valid: false, clean, error: 'أحد أجزاء اسم النطاق البريدي يحتوي على حروف أو شرطات غير صالحة.' };
            }
        }
        const tld = labels[labels.length - 1];
        if (!/^[a-z]{2,24}$/.test(tld)) {
            return { valid: false, clean, error: 'امتداد البريد الإلكتروني (مثل com / net / eg) غير صحيح.' };
        }
        return { valid: true, clean, error: null };
    }

    /**
     * التحقق القياسي من رقم الهاتف بعد كود الدولة وفق عدد الأرقام (Digits) لكل دولة:
     * - يزيل صفر البداية المحلي تلقائياً في الدول التي تستخدمه (مثل 01012345678 -> 1012345678 بعد +20)
     * - يرفض تكرار كود الدولة أو اختلافه
     * - يفحص الحد الأدنى والأقصى وبداية الجوال للدولة
     */
    function validatePhoneByCountry(rawValue, countryCode, isRequired) {
        const cc = String(countryCode || 'EG').trim().toUpperCase();
        const rule = (global.SAWYAN && typeof global.SAWYAN.getPhoneRule === 'function')
            ? global.SAWYAN.getPhoneRule(cc)
            : { countryCode: cc, dialCode: '+20', dialDigits: '20', minNsn: 7, maxNsn: 15, stripZero: true, mobileStart: null, example: '1012345678' };

        const raw = String(rawValue || '').trim();
        if (!raw) {
            return isRequired
                ? { valid: false, e164: '', nsn: '', rule, strippedZero: false, error: `يرجى إدخال رقم الهاتف بدون كود الدولة (${rule.dialCode}).` }
                : { valid: true, e164: '', nsn: '', rule, strippedZero: false, error: null };
        }

        const compact = raw.replace(/[\s\-().]+/g, '');
        if (!/^\+?[0-9]+$/.test(compact)) {
            return { valid: false, e164: '', nsn: '', rule, strippedZero: false, error: 'رقم الهاتف يجب أن يحتوي على أرقام إنجليزية فقط (0-9).' };
        }

        let nsn = compact.replace(/\D+/g, '');
        if (compact.startsWith('+')) {
            if (!nsn.startsWith(rule.dialDigits)) {
                return {
                    valid: false,
                    e164: '',
                    nsn: '',
                    rule,
                    strippedZero: false,
                    error: `كود الدولة الثابت هو (${rule.dialCode})؛ أدخل بقية الرقم فقط دون كود دولة مختلف.`
                };
            }
            nsn = nsn.slice(rule.dialDigits.length);
        } else if (nsn.startsWith(rule.dialDigits) && nsn.length >= (rule.dialDigits.length + rule.minNsn)) {
            nsn = nsn.slice(rule.dialDigits.length);
        }

        let strippedZero = false;
        if (rule.stripZero && /^0+/.test(nsn)) {
            nsn = nsn.replace(/^0+/, '');
            strippedZero = true;
        }

        if (nsn.length < rule.minNsn || nsn.length > rule.maxNsn) {
            const lenText = rule.minNsn === rule.maxNsn
                ? `${rule.minNsn} أرقام بالضبط`
                : `من ${rule.minNsn} إلى ${rule.maxNsn} أرقام`;
            return {
                valid: false,
                e164: '',
                nsn,
                rule,
                strippedZero,
                error: `رقم الهاتف لدولة ${rule.nameAr} بعد (${rule.dialCode}) يجب أن يتكون من ${lenText} (المدخل الآن ${nsn.length}). مثال: ${rule.example}`
            };
        }

        if (rule.mobileStart && rule.mobileStart.length && !rule.mobileStart.some(p => nsn.startsWith(p))) {
            return {
                valid: false,
                e164: '',
                nsn,
                rule,
                strippedZero,
                error: `رقم الجوال لدولة ${rule.nameAr} بعد (${rule.dialCode}) يجب أن يبدأ بالرقم (${rule.mobileStart.join(' أو ')})، مثال: ${rule.example}`
            };
        }

        return {
            valid: true,
            e164: `${rule.dialCode}${nsn}`,
            nsn,
            rule,
            strippedZero,
            error: null
        };
    }

    function validatePasswordStrong(pwd, confirmPwd) {
        const p = String(pwd || '');
        if (!p || p.length < 8) {
            return { valid: false, score: 1, error: 'كلمة المرور يجب أن لا تقل عن 8 أحرف/أرقام.' };
        }
        const hasLetter = /[A-Za-z\u0600-\u06FF]/.test(p);
        const hasDigit = /[0-9]/.test(p);
        const hasUpper = /[A-Z]/.test(p);
        const hasSymbol = /[^A-Za-z0-9]/.test(p);

        let score = 1;
        if (p.length >= 8 && hasLetter && hasDigit) score = 2;
        if (p.length >= 10 && hasUpper && hasDigit) score = 3;
        if (p.length >= 10 && hasUpper && hasDigit && hasSymbol) score = 4;

        if (!hasLetter || !hasDigit) {
            return { valid: false, score, error: 'يفضّل احتواء كلمة المرور على حروف وأرقام معاً (8 خانات فأكثر).' };
        }
        if (confirmPwd !== undefined && confirmPwd !== null && p !== String(confirmPwd)) {
            return { valid: false, score, error: 'كلمتا المرور غير متطابقتين.' };
        }
        return { valid: true, score, error: null };
    }

    function attachPasswordEnhancements(inputEl, confirmEl) {
        if (!inputEl) return;

        function wrapEye(el) {
            if (!el || el.dataset.eyeAttached === '1') return;
            el.dataset.eyeAttached = '1';
            const parent = el.parentElement;
            const wrap = document.createElement('div');
            wrap.className = 'password-field-wrap';
            parent.insertBefore(wrap, el);
            wrap.appendChild(el);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pwd-toggle-btn';
            btn.title = 'إظهار / إخفاء كلمة المرور';
            btn.setAttribute('aria-label', 'إظهار أو إخفاء كلمة المرور');
            btn.textContent = '👁️';
            btn.addEventListener('click', function () {
                const show = el.type === 'password';
                el.type = show ? 'text' : 'password';
                btn.textContent = show ? '🙈' : '👁️';
            });
            wrap.appendChild(btn);
            return wrap;
        }

        const primaryWrap = wrapEye(inputEl);
        if (confirmEl) wrapEye(confirmEl);

        let meterEl = null;
        if (primaryWrap) {
            meterEl = document.createElement('div');
            meterEl.className = 'pwd-strength-meter';
            meterEl.innerHTML = '<div class="pwd-strength-bar"><span></span></div><small class="pwd-strength-label"></small>';
            primaryWrap.insertAdjacentElement('afterend', meterEl);
        }

        let matchEl = null;
        if (confirmEl && confirmEl.parentElement && confirmEl.parentElement.classList.contains('password-field-wrap')) {
            matchEl = document.createElement('small');
            matchEl.className = 'pwd-match-label';
            confirmEl.parentElement.insertAdjacentElement('afterend', matchEl);
        }

        function refreshState() {
            const p = inputEl.value || '';
            if (meterEl) {
                const span = meterEl.querySelector('.pwd-strength-bar span');
                const lbl = meterEl.querySelector('.pwd-strength-label');
                if (!p) {
                    meterEl.style.display = 'none';
                } else {
                    meterEl.style.display = 'flex';
                    const res = validatePasswordStrong(p);
                    const pct = res.score * 25;
                    const colors = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'];
                    const labels = ['ضعيفة — 8 خانات على الأقل', 'متوسطة — أضف حرفاً كبيراً أو رمزاً', 'جيدة', 'قوية وممتازة ✓'];
                    span.style.width = `${pct}%`;
                    span.style.background = colors[Math.max(0, res.score - 1)];
                    lbl.textContent = labels[Math.max(0, res.score - 1)];
                    lbl.style.color = colors[Math.max(0, res.score - 1)];
                }
            }
            if (matchEl && confirmEl) {
                const cp = confirmEl.value || '';
                if (!cp) {
                    matchEl.textContent = '';
                } else if (p === cp) {
                    matchEl.textContent = '✓ كلمتا المرور متطابقتان';
                    matchEl.style.color = '#059669';
                } else {
                    matchEl.textContent = '✗ كلمتا المرور غير متطابقتين';
                    matchEl.style.color = '#DC2626';
                }
            }
        }

        inputEl.addEventListener('input', refreshState);
        if (confirmEl) confirmEl.addEventListener('input', refreshState);
    }

    function extractCoordsFromGoogleMapsUrl(inputText) {
        const raw = String(inputText || '').trim();
        if (!raw) return null;

        // 1. Plain decimal coords "30.0444, 31.2357"
        const plainMatch = raw.match(/^\s*(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*$/);
        if (plainMatch) {
            return normalizeCoords(Number(plainMatch[1]), Number(plainMatch[2]));
        }

        // 2. Google Maps @lat,lng or !3dLAT!4dLNG or q=lat,lng or ll=lat,lng or query=lat,lng
        const patterns = [
            /@(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,
            /!3d(-?\d{1,2}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/,
            /[?&](?:q|ll|query|destination|center|sll)=(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,
            /\/place\/[^/]+\/@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/
        ];
        for (let i = 0; i < patterns.length; i++) {
            const m = raw.match(patterns[i]);
            if (m) return normalizeCoords(Number(m[1]), Number(m[2]));
        }
        return null;
    }

    function normalizeCoords(lat, lng) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        if (lat === 0 && lng === 0) return null;
        return {
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
            mapsUrl: `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
        };
    }

    const COUNTRY_FALLBACK_CENTERS = {
        EG: [30.0444, 31.2357],
        SA: [24.7136, 46.6753],
        TR: [41.0082, 28.9784],
        AE: [25.2048, 55.2708],
        KW: [29.3759, 47.9774],
        QA: [25.2854, 51.5310],
        BH: [26.2285, 50.5860],
        OM: [23.5880, 58.3829],
        JO: [31.9454, 35.9284],
        LB: [33.8938, 35.5018],
        MA: [33.5731, -7.5898],
        DZ: [36.7538, 3.0588],
        TN: [36.8065, 10.1815],
        US: [39.8283, -98.5795],
        GB: [51.5074, -0.1278],
        DE: [52.5200, 13.4050],
        FR: [48.8566, 2.3522]
    };

    /**
     * أداة اللاقط الذكي للموقع على خرائط جوجل (GPS التلقائي + لصق رابط Google Maps + دبوس خريطة تفاعلية)
     */
    function mountGeoPicker(containerEl, opts) {
        if (!containerEl) return null;
        const cfg = Object.assign({
            latInput: null,
            lngInput: null,
            mapsUrlInput: null,
            addressInput: null,
            initialLat: null,
            initialLng: null,
            countryCode: 'EG',
            onCoordsChange: null,
            compact: false
        }, opts || {});

        const uid = 'geo_' + Math.random().toString(36).slice(2, 8);
        const center = COUNTRY_FALLBACK_CENTERS[String(cfg.countryCode || 'EG').toUpperCase()] || [30.0444, 31.2357];
        const startLat = Number.isFinite(Number(cfg.initialLat)) && Number(cfg.initialLat) !== 0 ? Number(cfg.initialLat) : center[0];
        const startLng = Number.isFinite(Number(cfg.initialLng)) && Number(cfg.initialLng) !== 0 ? Number(cfg.initialLng) : center[1];
        const hasInitial = Number.isFinite(Number(cfg.initialLat)) && Number(cfg.initialLat) !== 0;

        containerEl.innerHTML = `
            <div class="geo-picker-box">
                <div class="geo-picker-actions">
                    <button type="button" class="btn btn-outline geo-gps-btn" id="${uid}_gps">
                        📍 التقط موقعي الحالي تلقائياً (GPS)
                    </button>
                    <a class="btn btn-outline geo-open-gmaps" id="${uid}_openGmaps" target="_blank" rel="noopener noreferrer"
                       href="https://www.google.com/maps/search/?api=1&query=${startLat},${startLng}">
                        🗺️ فتح على خرائط جوجل
                    </a>
                </div>
                <div class="geo-url-row">
                    <input type="text" class="form-control geo-url-input" id="${uid}_url"
                        placeholder="أو الصق رابط الموقع من خرائط جوجل أو الإحداثيات (مثال: 30.0444, 31.2357)"
                        dir="ltr">
                    <button type="button" class="btn btn-primary geo-extract-btn" id="${uid}_extract">
                        سحب الإحداثيات
                    </button>
                </div>
                <div id="${uid}_map" class="geo-leaflet-canvas" style="height:${cfg.compact ? '210px' : '250px'};width:100%;border-radius:10px;border:1px solid #E2E8F0;margin-top:8px;z-index:1;"></div>
                <div class="geo-status-bar" id="${uid}_status">
                    ${hasInitial
                        ? `✅ تم تحديد الإحداثيات: <span dir="ltr">${startLat.toFixed(5)}, ${startLng.toFixed(5)}</span>`
                        : '💡 انقر على الخريطة أو اسحب الدبوس أو اضغط زر تحديد الموقع التلقائي'}
                </div>
            </div>
        `;

        const gpsBtn = document.getElementById(`${uid}_gps`);
        const urlInput = document.getElementById(`${uid}_url`);
        const extractBtn = document.getElementById(`${uid}_extract`);
        const openLink = document.getElementById(`${uid}_openGmaps`);
        const mapDiv = document.getElementById(`${uid}_map`);
        const statusEl = document.getElementById(`${uid}_status`);

        let map = null;
        let marker = null;
        let current = hasInitial ? normalizeCoords(startLat, startLng) : null;

        if (cfg.mapsUrlInput && cfg.mapsUrlInput.value) {
            urlInput.value = cfg.mapsUrlInput.value;
        }

        function syncInputs(coords, flyTo) {
            if (!coords) return;
            current = coords;
            if (cfg.latInput) cfg.latInput.value = String(coords.lat);
            if (cfg.lngInput) cfg.lngInput.value = String(coords.lng);
            if (cfg.mapsUrlInput) cfg.mapsUrlInput.value = coords.mapsUrl;
            urlInput.value = coords.mapsUrl;
            openLink.href = coords.mapsUrl;
            statusEl.innerHTML = `✅ الإحداثيات الملتقطة: <strong dir="ltr">${coords.lat}, ${coords.lng}</strong>`;
            statusEl.style.color = '#047857';

            if (map && marker) {
                marker.setLatLng([coords.lat, coords.lng]);
                if (flyTo) map.setView([coords.lat, coords.lng], Math.max(map.getZoom(), 15));
            }
            if (typeof cfg.onCoordsChange === 'function') {
                cfg.onCoordsChange(coords);
            }
        }

        if (typeof global.L !== 'undefined' && mapDiv) {
            try {
                map = global.L.map(mapDiv, { scrollWheelZoom: false }).setView([startLat, startLng], hasInitial ? 15 : 11);
                global.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap',
                    maxZoom: 19
                }).addTo(map);
                marker = global.L.marker([startLat, startLng], { draggable: true }).addTo(map);

                map.on('click', function (ev) {
                    const c = normalizeCoords(ev.latlng.lat, ev.latlng.lng);
                    if (c) syncInputs(c, false);
                });
                marker.on('dragend', function () {
                    const pos = marker.getLatLng();
                    const c = normalizeCoords(pos.lat, pos.lng);
                    if (c) syncInputs(c, false);
                });
                setTimeout(() => { try { map.invalidateSize(); } catch (_e) {} }, 350);
            } catch (_mapErr) {
                mapDiv.innerHTML = '<div style="padding:18px;text-align:center;color:#64748B;">الخريطة التفاعلية متاحة عبر أزرار GPS ولصق رابط خرائط جوجل أعلاه.</div>';
            }
        } else if (mapDiv) {
            mapDiv.style.display = 'none';
        }

        gpsBtn.addEventListener('click', function () {
            if (!navigator.geolocation) {
                statusEl.textContent = '⚠️ المتصفح لا يدعم تحديد الموقع التلقائي؛ اسحب الدبوس أو الصق رابط خرائط جوجل.';
                statusEl.style.color = '#D97706';
                return;
            }
            gpsBtn.disabled = true;
            statusEl.textContent = '⏳ جاري التقاط إحداثيات GPS بدقة...';
            statusEl.style.color = '#0369A1';

            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    gpsBtn.disabled = false;
                    const c = normalizeCoords(pos.coords.latitude, pos.coords.longitude);
                    if (c) {
                        syncInputs(c, true);
                        // Reverse geocode best-effort when addressInput is empty
                        if (cfg.addressInput && !String(cfg.addressInput.value || '').trim()) {
                            fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lng}&accept-language=ar`)
                                .then(r => r.ok ? r.json() : null)
                                .then(d => {
                                    if (d && d.display_name && !String(cfg.addressInput.value || '').trim()) {
                                        cfg.addressInput.value = String(d.display_name).slice(0, 220);
                                    }
                                })
                                .catch(() => {});
                        }
                    }
                },
                function () {
                    gpsBtn.disabled = false;
                    statusEl.textContent = '⚠️ تعذر الوصول لمستشعر GPS (تأكد من السماح للمتصفح) — يمكنك النقر على الخريطة أو لصق رابط خرائط جوجل.';
                    statusEl.style.color = '#DC2626';
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
        });

        function tryExtract() {
            const val = urlInput.value;
            const c = extractCoordsFromGoogleMapsUrl(val);
            if (!c) {
                statusEl.textContent = '⚠️ الصق رابط خرائط جوجل كامل يحتوي على @lat,lng أو الصق الإحداثيات مثل 30.0444, 31.2357';
                statusEl.style.color = '#DC2626';
                return;
            }
            syncInputs(c, true);
        }

        extractBtn.addEventListener('click', tryExtract);
        urlInput.addEventListener('change', function () {
            if (extractCoordsFromGoogleMapsUrl(urlInput.value)) tryExtract();
        });

        return {
            getCoords: function () { return current; },
            setCoords: function (lat, lng, fly) {
                const c = normalizeCoords(Number(lat), Number(lng));
                if (c) syncInputs(c, fly !== false);
            },
            setCenterView: function (lat, lng, zoom) {
                const nLat = Number(lat), nLng = Number(lng);
                if (map && Number.isFinite(nLat) && Number.isFinite(nLng) && (nLat !== 0 || nLng !== 0)) {
                    map.setView([nLat, nLng], zoom || 12);
                    if (!current && marker) marker.setLatLng([nLat, nLng]);
                }
            },
            setCountryCenter: function (cc) {
                const ctr = COUNTRY_FALLBACK_CENTERS[String(cc || 'EG').toUpperCase()];
                if (ctr && !current && map) {
                    map.setView(ctr, 10);
                    if (marker) marker.setLatLng(ctr);
                }
            },
            invalidateSize: function () {
                if (map) { try { map.invalidateSize(); } catch (_e) {} }
            }
        };
    }

    /**
     * نظام التدرج الجغرافي العالمي: الدولة -> المدينة/المحافظة -> الحي/المنطقة
     * يغذي كافة مدن وأحياء العالم من قاعدة البيانات مع البحث الفوري وخيار الإدخال اليدوي
     */
    function mountWorldGeoCascade(opts) {
        const cfg = Object.assign({
            countrySelect: null,
            citySelect: null,
            citySearchInput: null,
            districtSelect: null,
            districtManualInput: null,
            activeOnly: true,
            includeAllCountries: false,
            defaultCountry: 'EG',
            onCountryChange: null,
            onCityChange: null,
            onDistrictChange: null
        }, opts || {});

        let citiesCache = [];
        let activeCountriesMeta = [];
        let categoriesCache = [];
        let searchTimer = null;

        function resolveCountryDisplayName(row, fallbackMeta) {
            const i18n = row && row.country_name_i18n;
            if (i18n && typeof i18n === 'object') {
                return i18n.ar || i18n.en || (fallbackMeta && fallbackMeta.nameAr) || row.country_code;
            }
            return (row && (row.name_ar || row.name_en)) || (fallbackMeta && fallbackMeta.nameAr) || (row && row.country_code) || '';
        }

        async function loadCountriesAndInitialCities() {
            const countrySel = cfg.countrySelect;
            if (!countrySel) return;

            let rows = [];
            let allRows = [];
            try {
                if (global.SAWYAN && global.SAWYAN.API && typeof global.SAWYAN.API.getPublicActiveCountriesAndCities === 'function') {
                    const res = await global.SAWYAN.API.getPublicActiveCountriesAndCities();
                    rows = (res && Array.isArray(res.countries)) ? res.countries : [];
                    allRows = (res && Array.isArray(res.all_countries)) ? res.all_countries : [];
                    categoriesCache = (res && Array.isArray(res.categories)) ? res.categories : [];
                    activeCountriesMeta = rows;
                }
            } catch (_e) {
                rows = [];
                allRows = [];
            }

            const prevVal = countrySel.value || cfg.defaultCountry;
            const list = [];
            const dbSource = cfg.includeAllCountries && allRows.length > 0 ? allRows : rows;

            if (cfg.includeAllCountries && global.SAWYAN && Array.isArray(global.SAWYAN.Countries)) {
                const dbMap = new Map(dbSource.map(r => [String(r.country_code || '').toUpperCase(), r]));
                const activeSet = new Set(rows.map(r => String(r.country_code || '').toUpperCase()));
                global.SAWYAN.Countries.forEach(c => {
                    const dbRow = dbMap.get(c.code);
                    const isAct = activeSet.has(c.code) || Boolean(dbRow && dbRow.is_active);
                    list.push({
                        code: c.code,
                        name_ar: c.nameAr,
                        name_en: c.nameEn,
                        flag: c.flag || '',
                        is_active: isAct
                    });
                });
            } else if (rows.length > 0) {
                rows.forEach(r => {
                    const code = String(r.country_code || '').toUpperCase();
                    const meta = (global.SAWYAN && typeof global.SAWYAN.getCountryByCode === 'function')
                        ? global.SAWYAN.getCountryByCode(code)
                        : null;
                    list.push({
                        code,
                        name_ar: resolveCountryDisplayName(r, meta),
                        name_en: (r.country_name_i18n && r.country_name_i18n.en) || (meta ? meta.nameEn : code),
                        flag: (meta && meta.flag) ? meta.flag : '',
                        is_active: r.is_active !== false
                    });
                });
            } else if (global.SAWYAN && Array.isArray(global.SAWYAN.Countries)) {
                ['EG', 'SA', 'TR', 'US', 'AE', 'KW', 'QA', 'JO', 'MA', 'GB', 'DE', 'FR'].forEach(cc => {
                    const c = global.SAWYAN.getCountryByCode(cc);
                    if (c) list.push({ code: c.code, name_ar: c.nameAr, name_en: c.nameEn, flag: c.flag, is_active: true });
                });
            }

            countrySel.innerHTML = '';
            list.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.code;
                const badge = cfg.includeAllCountries && item.is_active ? ' ✓ (مفعّلة)' : '';
                opt.textContent = `${item.flag ? item.flag + ' ' : ''}${item.name_ar} (${item.code})${badge}`;
                countrySel.appendChild(opt);
            });

            if ([...countrySel.options].some(o => o.value === prevVal)) {
                countrySel.value = prevVal;
            } else if (countrySel.options.length > 0) {
                countrySel.selectedIndex = 0;
            }

            await loadCitiesForCountry(countrySel.value, '');
            if (typeof cfg.onCountryChange === 'function') {
                cfg.onCountryChange(countrySel.value);
            }
        }

        async function loadCitiesForCountry(cc, searchQuery) {
            const citySel = cfg.citySelect;
            if (!citySel) return;
            citySel.innerHTML = '<option value="">⏳ جاري تحميل المدن والمحافظات...</option>';

            let cities = [];
            try {
                if (global.SAWYAN && global.SAWYAN.API && typeof global.SAWYAN.API.searchGeonamesLocations === 'function') {
                    const res = await global.SAWYAN.API.searchGeonamesLocations({
                        countryCode: cc,
                        query: searchQuery || '',
                        kind: 'cities',
                        limit: 120
                    });
                    cities = (res && Array.isArray(res.results)) ? res.results : [];
                }
            } catch (_e) {
                cities = [];
            }

            citiesCache = cities;
            const prevCityId = citySel.dataset.pendingCityId || '';
            citySel.innerHTML = '';

            const placeholderOpt = document.createElement('option');
            placeholderOpt.value = '';
            placeholderOpt.textContent = cities.length > 0
                ? '— اختر المدينة / المحافظة —'
                : '— لم يتم العثور على مدينة (جرّب كتابة الاسم بالبحث أعلى القائمة) —';
            citySel.appendChild(placeholderOpt);

            cities.forEach(c => {
                const opt = document.createElement('option');
                const dispName = String(c.city_name || c.asciiname || '').trim();
                const adm1 = String(c.admin1_name || '').trim();
                opt.value = String(c.geoname_id);
                const stateLabel = (adm1 && !adm1.startsWith('__GEO_') && adm1 !== dispName) ? ` — ${adm1}` : '';
                opt.textContent = `${dispName}${stateLabel}`;
                opt.dataset.name = dispName;
                opt.dataset.admin1 = adm1;
                opt.dataset.lat = c.latitude || '';
                opt.dataset.lng = c.longitude || '';
                citySel.appendChild(opt);
            });

            if (prevCityId && [...citySel.options].some(o => o.value === String(prevCityId))) {
                citySel.value = String(prevCityId);
                delete citySel.dataset.pendingCityId;
                await loadDistrictsForSelectedCity();
            } else {
                resetDistrictSelect();
            }
        }

        function resetDistrictSelect() {
            if (!cfg.districtSelect) return;
            cfg.districtSelect.innerHTML = '<option value="">— اختر الحي / المنطقة (بعد اختيار المدينة) —</option><option value="__MANUAL__">✍️ إدخال اسم الحي يدوياً...</option>';
            toggleManualDistrictInput(false);
        }

        function toggleManualDistrictInput(show) {
            if (!cfg.districtManualInput) return;
            cfg.districtManualInput.style.display = show ? 'block' : 'none';
            if (show) cfg.districtManualInput.focus();
        }

        async function loadDistrictsForSelectedCity() {
            const citySel = cfg.citySelect;
            const distSel = cfg.districtSelect;
            if (!citySel || !distSel) return;

            const selectedOpt = citySel.options[citySel.selectedIndex];
            const cityName = selectedOpt ? (selectedOpt.dataset.name || '') : '';
            const admin1 = selectedOpt ? (selectedOpt.dataset.admin1 || '') : '';
            const cc = cfg.countrySelect ? cfg.countrySelect.value : 'EG';
            const cityId = citySel.value ? Number(citySel.value) : null;

            if (!cityId) {
                resetDistrictSelect();
                if (typeof cfg.onCityChange === 'function') cfg.onCityChange(null);
                return;
            }

            if (typeof cfg.onCityChange === 'function') {
                cfg.onCityChange({
                    countryCode: cc,
                    cityId,
                    cityName,
                    admin1,
                    lat: selectedOpt.dataset.lat ? Number(selectedOpt.dataset.lat) : null,
                    lng: selectedOpt.dataset.lng ? Number(selectedOpt.dataset.lng) : null
                });
            }

            distSel.innerHTML = '<option value="">⏳ جاري جلب الأحياء والمناطق...</option>';
            let districts = [];
            try {
                if (global.SAWYAN && global.SAWYAN.API && typeof global.SAWYAN.API.searchGeonamesLocations === 'function') {
                    const primaryFilter = (admin1 && !admin1.startsWith('__GEO_')) ? admin1 : cityName;
                    let res = await global.SAWYAN.API.searchGeonamesLocations({
                        countryCode: cc,
                        query: '',
                        admin1Filter: primaryFilter || null,
                        kind: 'districts',
                        limit: 120
                    });
                    let rows = (res && Array.isArray(res.results)) ? res.results : [];
                    if (rows.length === 0 && cityName) {
                        res = await global.SAWYAN.API.searchGeonamesLocations({
                            countryCode: cc,
                            query: cityName.split('—')[0].trim(),
                            kind: 'districts',
                            limit: 60
                        });
                        rows = (res && Array.isArray(res.results)) ? res.results : [];
                    }
                    const seen = new Set();
                    rows.forEach(r => {
                        if (Number(r.geoname_id) === cityId) return;
                        const cleanName = String(r.city_name || r.asciiname || '').trim();
                        if (cleanName && !seen.has(cleanName.toLowerCase())) {
                            seen.add(cleanName.toLowerCase());
                            districts.push({
                                name: cleanName,
                                lat: r.latitude,
                                lng: r.longitude
                            });
                        }
                    });
                }
            } catch (_e) {
                districts = [];
            }

            distSel.innerHTML = '';
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.textContent = districts.length > 0
                ? '— اختر الحي / المنطقة —'
                : '— اختر (وسط المدينة) أو أدخل الحي يدوياً —';
            distSel.appendChild(defOpt);

            if (cityName) {
                const centerOpt = document.createElement('option');
                centerOpt.value = `وسط ${cityName}`;
                centerOpt.textContent = `وسط / مركز ${cityName}`;
                distSel.appendChild(centerOpt);
            }

            districts.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.name;
                opt.textContent = d.name;
                if (d.lat) opt.dataset.lat = d.lat;
                if (d.lng) opt.dataset.lng = d.lng;
                distSel.appendChild(opt);
            });

            const manualOpt = document.createElement('option');
            manualOpt.value = '__MANUAL__';
            manualOpt.textContent = '✍️ حي / منطقة أخرى (إدخال يدوي)...';
            distSel.appendChild(manualOpt);

            const pendingDist = distSel.dataset.pendingDistrict || '';
            if (pendingDist) {
                delete distSel.dataset.pendingDistrict;
                setDistrictValue(pendingDist);
            } else {
                toggleManualDistrictInput(false);
            }
        }

        function setDistrictValue(val) {
            const clean = String(val || '').trim();
            if (!cfg.districtSelect) return;
            if (!clean) {
                cfg.districtSelect.value = '';
                toggleManualDistrictInput(false);
                return;
            }
            const match = [...cfg.districtSelect.options].find(o => o.value === clean);
            if (match) {
                cfg.districtSelect.value = clean;
                toggleManualDistrictInput(false);
            } else {
                cfg.districtSelect.value = '__MANUAL__';
                if (cfg.districtManualInput) cfg.districtManualInput.value = clean;
                toggleManualDistrictInput(true);
            }
        }

        function getDistrictValue() {
            if (cfg.districtSelect) {
                const v = cfg.districtSelect.value;
                if (v === '__MANUAL__') {
                    return cfg.districtManualInput ? String(cfg.districtManualInput.value || '').trim() : '';
                }
                if (v) return String(v).trim();
            }
            return cfg.districtManualInput ? String(cfg.districtManualInput.value || '').trim() : '';
        }

        // Bind events
        if (cfg.countrySelect) {
            cfg.countrySelect.addEventListener('change', async function () {
                if (cfg.citySearchInput) cfg.citySearchInput.value = '';
                await loadCitiesForCountry(cfg.countrySelect.value, '');
                if (typeof cfg.onCountryChange === 'function') {
                    cfg.onCountryChange(cfg.countrySelect.value);
                }
            });
        }
        if (cfg.citySearchInput) {
            cfg.citySearchInput.addEventListener('input', function () {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(async () => {
                    const cc = cfg.countrySelect ? cfg.countrySelect.value : 'EG';
                    await loadCitiesForCountry(cc, cfg.citySearchInput.value.trim());
                }, 260);
            });
        }
        if (cfg.citySelect) {
            cfg.citySelect.addEventListener('change', loadDistrictsForSelectedCity);
        }
        if (cfg.districtSelect) {
            cfg.districtSelect.addEventListener('change', function () {
                const isManual = cfg.districtSelect.value === '__MANUAL__';
                toggleManualDistrictInput(isManual);
                const opt = cfg.districtSelect.options[cfg.districtSelect.selectedIndex];
                if (typeof cfg.onDistrictChange === 'function') {
                    cfg.onDistrictChange({
                        district: getDistrictValue(),
                        lat: opt && opt.dataset.lat ? Number(opt.dataset.lat) : null,
                        lng: opt && opt.dataset.lng ? Number(opt.dataset.lng) : null
                    });
                }
            });
        }

        return {
            init: loadCountriesAndInitialCities,
            loadCities: loadCitiesForCountry,
            setCityAndDistrict: async function (cityId, districtVal) {
                if (cfg.citySelect && cityId) {
                    cfg.citySelect.dataset.pendingCityId = String(cityId);
                }
                if (cfg.districtSelect && districtVal) {
                    cfg.districtSelect.dataset.pendingDistrict = String(districtVal);
                }
                if (cfg.countrySelect) {
                    await loadCitiesForCountry(cfg.countrySelect.value, '');
                }
            },
            getCityId: function () {
                return cfg.citySelect && cfg.citySelect.value ? Number(cfg.citySelect.value) : null;
            },
            getCityName: function () {
                if (!cfg.citySelect || cfg.citySelect.selectedIndex < 0) return '';
                const opt = cfg.citySelect.options[cfg.citySelect.selectedIndex];
                return opt && opt.dataset.name ? opt.dataset.name : '';
            },
            getDistrict: getDistrictValue,
            getActiveCountriesMeta: function () { return activeCountriesMeta; },
            getCategories: function () { return categoriesCache; }
        };
    }

    /**
     * جلب إعدادات النموذج من قاعدة البيانات
     */
    async function loadFormConfig(formType, forceRefresh) {
        const key = formType || 'ALL';
        if (!forceRefresh && _configCache[key]) return _configCache[key];

        if (!global.SAWYAN || !global.SAWYAN.API || typeof global.SAWYAN.API.getRegistrationFormConfig !== 'function') {
            return { settings: [], fields: [] };
        }
        const res = await global.SAWYAN.API.getRegistrationFormConfig(formType || null);
        _configCache[key] = res || { settings: [], fields: [] };
        return _configCache[key];
    }

    function invalidateFormConfigCache(formType) {
        if (formType) delete _configCache[formType];
        delete _configCache.ALL;
    }

    /**
     * تطبيق هندسة الحقول الديناميكية (الترتيب، الإظهار/الإخفاء، إلزامي بنجمة حمراء/اختياري، التسمية والوصف والتلميح)
     */
    function applyDynamicFormLayout(opts) {
        const {
            config,
            formType,
            stage = 'initial',
            fieldMap = {},
            requiredContainer = null,
            optionalDivider = null,
            optionalDividerTextEl = null,
            optionalContainer = null,
            pageTitleEl = null,
            pageSubtitleEl = null
        } = opts || {};

        const settingsArr = Array.isArray(config && config.settings) ? config.settings : [];
        const formSettings = settingsArr.find(s => s.form_type === formType) || settingsArr[0] || null;
        if (formSettings) {
            if (pageTitleEl && formSettings.page_title_ar) pageTitleEl.textContent = formSettings.page_title_ar;
            if (pageSubtitleEl && formSettings.page_subtitle_ar) pageSubtitleEl.textContent = formSettings.page_subtitle_ar;
            if (optionalDividerTextEl && formSettings.optional_divider_text_ar) {
                optionalDividerTextEl.textContent = formSettings.optional_divider_text_ar;
            }
        }

        const fields = (Array.isArray(config && config.fields) ? config.fields : [])
            .filter(f => !formType || f.form_type === formType)
            .slice()
            .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));

        const stateMap = {};
        let visibleOptionalCount = 0;

        fields.forEach(cfg => {
            const showFlag = stage === 'dashboard' ? Boolean(cfg.show_in_dashboard) : Boolean(cfg.show_in_initial);
            const reqFlag = stage === 'dashboard' ? Boolean(cfg.required_in_dashboard) : Boolean(cfg.required_in_initial);
            stateMap[cfg.field_key] = { ...cfg, isVisible: showFlag, isRequired: showFlag && reqFlag };

            const entry = fieldMap[cfg.field_key];
            if (!entry || !entry.wrapperEl) return;

            const wrap = entry.wrapperEl;
            const input = entry.inputEl;

            if (!showFlag) {
                wrap.style.display = 'none';
                wrap.dataset.regHidden = '1';
                if (input && 'required' in input) input.required = false;
                return;
            }

            wrap.style.display = '';
            delete wrap.dataset.regHidden;

            // 1. Update Label + Red Required Star (*) or (اختياري)
            const labelEl = entry.labelEl || wrap.querySelector('.form-label, label');
            if (labelEl && !entry.preserveLabel) {
                const reqBadge = reqFlag
                    ? '<span class="required-star" aria-hidden="true">*</span>'
                    : '<span class="optional-pill">اختياري</span>';
                labelEl.innerHTML = `${escapeHtml(cfg.label_ar || cfg.field_key)} ${reqBadge}`;
            }

            // 2. Update Placeholder inside input
            if (input && cfg.placeholder_ar && !entry.preservePlaceholder && ('placeholder' in input)) {
                input.placeholder = cfg.placeholder_ar;
            }
            if (input && ('required' in input) && !entry.skipNativeRequired) {
                input.required = Boolean(reqFlag);
            }

            // 3. Update Help Text below field
            let helpEl = entry.helpEl || wrap.querySelector('.field-help-text');
            if (!helpEl && cfg.help_text_ar) {
                helpEl = document.createElement('small');
                helpEl.className = 'field-help-text form-hint';
                wrap.appendChild(helpEl);
            }
            if (helpEl) {
                helpEl.textContent = cfg.help_text_ar || '';
                helpEl.style.display = cfg.help_text_ar ? 'block' : 'none';
            }

            // 4. Route to Required vs Optional container in initial mode
            if (stage === 'initial' && requiredContainer && optionalContainer && !entry.fixedContainer) {
                if (reqFlag) {
                    requiredContainer.appendChild(wrap);
                } else {
                    optionalContainer.appendChild(wrap);
                    visibleOptionalCount++;
                }
            } else if (!reqFlag && showFlag) {
                visibleOptionalCount++;
            }
        });

        if (optionalDivider) {
            optionalDivider.style.display = visibleOptionalCount > 0 ? 'flex' : 'none';
        }
        if (optionalContainer) {
            optionalContainer.style.display = visibleOptionalCount > 0 ? '' : 'none';
        }

        return { stateMap, formSettings, visibleOptionalCount };
    }

    /**
     * حساب نسبة اكتمال البيانات في لوحة تحكم التاجر أو العضو بناءً على إعدادات الأدمن الحية
     */
    function computeCompletionStatus(config, formType, valuesMap) {
        const fields = (Array.isArray(config && config.fields) ? config.fields : [])
            .filter(f => (!formType || f.form_type === formType) && f.show_in_dashboard);
        const settingsArr = Array.isArray(config && config.settings) ? config.settings : [];
        const formSettings = settingsArr.find(s => s.form_type === formType) || null;

        const targetFields = fields.filter(f => f.required_in_dashboard || !f.show_in_initial);
        const missingRequired = [];
        const missingOptional = [];
        let completedCount = 0;

        targetFields.forEach(f => {
            const v = valuesMap ? valuesMap[f.field_key] : null;
            const filled = v !== undefined && v !== null && String(v).trim() !== '' && !(typeof v === 'number' && v === 0 && f.field_key === 'commission_percentage');
            if (filled) {
                completedCount++;
            } else if (f.required_in_dashboard) {
                missingRequired.push(f);
            } else {
                missingOptional.push(f);
            }
        });

        const total = targetFields.length || 1;
        const pct = Math.min(100, Math.round((completedCount / total) * 100));
        return {
            percent: pct,
            totalCount: targetFields.length,
            completedCount,
            missingRequired,
            missingOptional,
            bannerText: formSettings ? formSettings.dashboard_banner_text_ar : ''
        };
    }

    global.SAWYAN.RegEngine = {
        escapeHtml,
        validateEmailStrict,
        validatePhoneByCountry,
        validatePasswordStrong,
        attachPasswordEnhancements,
        extractCoordsFromGoogleMapsUrl,
        normalizeCoords,
        mountGeoPicker,
        mountWorldGeoCascade,
        loadFormConfig,
        invalidateFormConfigCache,
        applyDynamicFormLayout,
        computeCompletionStatus
    };
})(window);
