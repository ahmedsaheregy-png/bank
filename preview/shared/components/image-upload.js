// ============================================================================
// SAWYAN V3.0 — Option B Session-Gated Media Compressor, Validator & Lightbox
// - Offscreen <canvas> re-encoding strips 100% of EXIF GPS/device headers
// - Strictly rejects SVG/GIF/scripts & validates safe https:// / data:image URLs
// - Singleton in-app Lightbox via delegated [data-sw-lightbox-key] click events
// ============================================================================

window.SAWYAN = window.SAWYAN || {};

(function () {
    'use strict';

    const ALLOWED_INPUT_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const _lightboxRegistry = new Map();
    let _lightboxSeq = 0;
    let _listenersBound = false;

    function escAttr(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function isSafeMediaUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const s = url.trim();
        if (!s || s.length > 520000) return false;
        if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\r\n\s]+$/i.test(s)) {
            return true;
        }
        if (/^https:\/\/[^/\s?#]+(\/[^\s]*)?$/i.test(s)) {
            const m = s.match(/^https:\/\/([^/:?#\s]+)/i);
            const host = m ? m[1].toLowerCase() : '';
            if (
                !host ||
                host === 'localhost' ||
                host === '0.0.0.0' ||
                /^127\./.test(host) ||
                /^10\./.test(host) ||
                /^192\.168\./.test(host) ||
                /^169\.254\./.test(host) ||
                /^::1$|^\[::1\]$/.test(host) ||
                /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
            ) {
                return false;
            }
            return true;
        }
        if (/^(\.\.\/)?assets\/[A-Za-z0-9_.\-/]+\.(png|jpe?g|webp)$/i.test(s)) {
            return true;
        }
        return false;
    }

    function loadFileAsImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
            reader.onload = () => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('ملف الصورة تالف أو غير صالح'));
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function compressImageFile(file, opts = {}) {
        if (!file) throw new Error('يرجى اختيار ملف صورة');
        const mime = String(file.type || '').toLowerCase();
        if (!ALLOWED_INPUT_MIME.includes(mime)) {
            throw new Error('صيغة الصورة غير مدعومة. المسموح فقط: JPEG, PNG, WebP (ويُمنع SVG/GIF).');
        }
        if (file.size > 15 * 1024 * 1024) {
            throw new Error('حجم الصورة يتجاوز الحد الأقصى المسموح (15 ميجابايت).');
        }

        const maxDim = Number(opts.maxDim) || 1280;
        const maxChars = Number(opts.maxChars) || 360000;
        const preserveTransparency = Boolean(opts.preserveTransparency) && (mime === 'image/png' || mime === 'image/webp');

        const img = await loadFileAsImage(file);
        let width = img.naturalWidth || img.width || 640;
        let height = img.naturalHeight || img.height || 480;

        if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (preserveTransparency) {
            canvas.width = width;
            canvas.height = height;
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const pngOrWebp = canvas.toDataURL('image/webp', 0.82);
            if (pngOrWebp && pngOrWebp.startsWith('data:image/') && !pngOrWebp.startsWith('data:image/png;base64,iVBOR') && pngOrWebp.length <= maxChars) {
                return pngOrWebp;
            }
            const pngUrl = canvas.toDataURL('image/png');
            if (pngUrl && pngUrl.length <= maxChars) {
                return pngUrl;
            }
        }

        const qualities = [0.74, 0.62, 0.52, 0.42];
        for (let scalePass = 0; scalePass < 3; scalePass++) {
            const passW = Math.max(120, Math.round(width * Math.pow(0.76, scalePass)));
            const passH = Math.max(120, Math.round(height * Math.pow(0.76, scalePass)));
            canvas.width = passW;
            canvas.height = passH;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, passW, passH);
            ctx.drawImage(img, 0, 0, passW, passH);

            for (let qi = 0; qi < qualities.length; qi++) {
                const out = canvas.toDataURL('image/jpeg', qualities[qi]);
                if (out && out.length <= maxChars) {
                    return out;
                }
            }
        }

        throw new Error('تعذر ضغط الصورة إلى الحجم الآمن. يرجى اختيار صورة بدقة أقل.');
    }

    function ensureLightboxDom() {
        bindGlobalLightboxListeners();
        let overlay = document.getElementById('swMediaLightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'swMediaLightbox';
            overlay.className = 'sw-lightbox-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.innerHTML = `
                <div class="sw-lightbox-card">
                    <button type="button" class="sw-lightbox-close" id="swLightboxCloseBtn" aria-label="إغلاق">×</button>
                    <img id="swLightboxImg" class="sw-lightbox-img" alt="معاينة المرفق">
                    <div id="swLightboxCaption" class="sw-lightbox-caption"></div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.id === 'swLightboxCloseBtn') {
                    closeLightbox();
                }
            });
        }
        return overlay;
    }

    function openLightbox(url, caption = '') {
        const cleanUrl = typeof url === 'string' ? url.trim() : '';
        if (!isSafeMediaUrl(cleanUrl)) {
            console.warn('Blocked unsafe media URL in Lightbox');
            return;
        }
        const overlay = ensureLightboxDom();
        const imgEl = document.getElementById('swLightboxImg');
        const capEl = document.getElementById('swLightboxCaption');
        if (imgEl) imgEl.src = cleanUrl;
        if (capEl) capEl.textContent = caption || 'معاينة المرفق';
        overlay.classList.add('open');
    }

    function closeLightbox() {
        const overlay = document.getElementById('swMediaLightbox');
        if (overlay) {
            overlay.classList.remove('open');
            const imgEl = document.getElementById('swLightboxImg');
            if (imgEl) imgEl.removeAttribute('src');
        }
    }

    function registerLightboxItem(url, caption = '') {
        if (!isSafeMediaUrl(url)) return null;
        const key = 'swlb_' + (++_lightboxSeq);
        if (_lightboxRegistry.size > 800) {
            const oldestKey = _lightboxRegistry.keys().next().value;
            _lightboxRegistry.delete(oldestKey);
        }
        _lightboxRegistry.set(key, { url: url.trim(), caption: String(caption || '') });
        return key;
    }

    function bindGlobalLightboxListeners() {
        if (_listenersBound || typeof document === 'undefined') return;
        _listenersBound = true;
        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-sw-lightbox-key]');
            if (!trigger) return;
            e.preventDefault();
            e.stopPropagation();
            const key = trigger.getAttribute('data-sw-lightbox-key');
            const entry = key ? _lightboxRegistry.get(key) : null;
            if (entry) {
                openLightbox(entry.url, entry.caption || trigger.getAttribute('data-sw-caption') || '');
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeLightbox();
        });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindGlobalLightboxListeners);
        } else {
            bindGlobalLightboxListeners();
        }
    }

    function renderThumbHtml(url, caption = 'عرض المرفق', opts = {}) {
        const key = registerLightboxItem(url, caption);
        if (!key) return '';
        const text = opts.label || 'عرض';
        return `<button type="button" class="sw-media-thumb-btn" data-sw-lightbox-key="${key}" title="${escAttr(caption)}">`
             + `<img src="${escAttr(url.trim())}" alt="${escAttr(caption)}" class="sw-media-thumb-img" loading="lazy">`
             + `<span>${escAttr(text)}</span>`
             + `</button>`;
    }

    function mountUploader(target, opts = {}) {
        const container = typeof target === 'string' ? document.getElementById(target) : target;
        if (!container) return null;

        bindGlobalLightboxListeners();

        const label = opts.label || '📷 رفع صورة';
        const hint = opts.hint || 'JPEG / PNG / WebP • يُضغط وتُمسح بيانات EXIF تلقائياً';
        const capture = opts.capture ? ` capture="${escAttr(opts.capture)}"` : '';
        const multiple = Boolean(opts.multiple);
        const maxItems = Number(opts.maxItems) || (multiple ? 6 : 1);
        const maxDim = Number(opts.maxDim) || 1280;
        const maxChars = Number(opts.maxChars) || 360000;
        const preserveTransparency = Boolean(opts.preserveTransparency);

        let items = [];
        if (multiple && Array.isArray(opts.initialValue)) {
            items = opts.initialValue.filter(isSafeMediaUrl).slice(0, maxItems);
        } else if (!multiple && isSafeMediaUrl(opts.initialValue)) {
            items = [opts.initialValue.trim()];
        }

        const uid = 'swUp_' + Math.random().toString(36).slice(2, 9);
        container.innerHTML = `
            <div class="sw-media-uploader-wrap">
                <div class="sw-media-dropzone" id="${uid}_zone" tabindex="0" role="button">
                    <div class="sw-media-dropzone-label">${escAttr(label)}</div>
                    <div class="sw-media-dropzone-hint">${escAttr(hint)}</div>
                </div>
                <input type="file" id="${uid}_input" accept="image/jpeg,image/png,image/webp" ${multiple ? 'multiple' : ''}${capture} style="display:none;">
                <div id="${uid}_preview"></div>
            </div>
        `;

        const zone = document.getElementById(`${uid}_zone`);
        const fileInput = document.getElementById(`${uid}_input`);
        const previewEl = document.getElementById(`${uid}_preview`);

        function notifyChange() {
            if (typeof opts.onChange === 'function') {
                opts.onChange(multiple ? items.slice() : (items[0] || null));
            }
        }

        function renderPreview() {
            if (!previewEl) return;
            if (!items.length) {
                previewEl.innerHTML = '';
                return;
            }
            if (!multiple) {
                const src = items[0];
                const lbKey = registerLightboxItem(src, label);
                previewEl.innerHTML = `
                    <div class="sw-media-preview-box">
                        <img src="${escAttr(src)}" class="sw-media-preview-img" data-sw-lightbox-key="${lbKey || ''}" alt="${escAttr(label)}">
                        <div class="sw-media-actions-row">
                            <button type="button" class="btn btn-outline btn-sm" data-sw-lightbox-key="${lbKey || ''}">🔍 تكبير</button>
                            <button type="button" class="btn btn-outline btn-sm" data-sw-remove-idx="0" style="color:#dc2626;border-color:#fca5a5;">🗑️ إزالة</button>
                        </div>
                    </div>
                `;
            } else {
                previewEl.innerHTML = `
                    <div class="sw-media-gallery-grid">
                        ${items.map((src, idx) => {
                            const lbKey = registerLightboxItem(src, `${label} #${idx + 1}`);
                            return `
                                <div class="sw-media-gallery-item">
                                    <img src="${escAttr(src)}" data-sw-lightbox-key="${lbKey || ''}" alt="${escAttr(label)} ${idx + 1}">
                                    <button type="button" class="sw-media-remove-chip" data-sw-remove-idx="${idx}" title="حذف">×</button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            previewEl.querySelectorAll('[data-sw-remove-idx]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    const idx = Number(btn.getAttribute('data-sw-remove-idx'));
                    items.splice(idx, 1);
                    renderPreview();
                    notifyChange();
                });
            });
        }

        async function handleFiles(fileList) {
            const picked = Array.from(fileList || []);
            if (!picked.length) return;
            const zoneLabel = zone.querySelector('.sw-media-dropzone-label');
            const origText = zoneLabel ? zoneLabel.textContent : label;
            if (zoneLabel) zoneLabel.textContent = '⏳ جاري ضغط الصورة وتأمينها...';

            try {
                for (const file of picked) {
                    if (multiple && items.length >= maxItems) break;
                    const dataUrl = await compressImageFile(file, { maxDim, maxChars, preserveTransparency });
                    if (multiple) {
                        items.push(dataUrl);
                    } else {
                        items = [dataUrl];
                        break;
                    }
                }
                renderPreview();
                notifyChange();
            } catch (err) {
                alert('⚠️ ' + (err?.message || 'تعذر معالجة الصورة'));
            } finally {
                if (zoneLabel) zoneLabel.textContent = origText;
                fileInput.value = '';
            }
        }

        zone.addEventListener('click', () => fileInput.click());
        zone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            handleFiles(e.dataTransfer?.files);
        });
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        renderPreview();

        return {
            getValue() {
                return multiple ? items.slice() : (items[0] || null);
            },
            setValue(val) {
                if (multiple) {
                    items = Array.isArray(val) ? val.filter(isSafeMediaUrl).slice(0, maxItems) : [];
                } else {
                    items = isSafeMediaUrl(val) ? [val.trim()] : [];
                }
                renderPreview();
                notifyChange();
            },
            clear() {
                items = [];
                fileInput.value = '';
                renderPreview();
                notifyChange();
            }
        };
    }

    window.SAWYAN.ImageUpload = {
        config: {
            maxSizeMB: 15,
            allowedTypes: ALLOWED_INPUT_MIME
        },
        isSafeMediaUrl,
        compressImageFile,
        openLightbox,
        closeLightbox,
        registerLightboxItem,
        renderThumbHtml,
        mountUploader,

        async uploadImage(file, _bucket = '', _folder = '', opts = {}) {
            try {
                const url = await compressImageFile(file, opts);
                return { success: true, url };
            } catch (err) {
                return { success: false, error: err?.message || 'حدث خطأ أثناء معالجة الصورة' };
            }
        },

        async deleteImage() {
            return { success: true };
        },

        async compressImage(file, maxWidth = 1024, quality = 0.72) {
            return await compressImageFile(file, { maxDim: maxWidth, maxChars: Math.round(quality * 480000) });
        },

        createUploader(options) {
            const container = document.getElementById(options.containerId);
            if (!container) return null;
            return mountUploader(container, {
                label: options.placeholder || '📷 اضغط لاختيار صورة',
                onChange(url) {
                    if (url && typeof options.onUploadSuccess === 'function') {
                        options.onUploadSuccess(url, '');
                    }
                }
            });
        }
    };
})();
