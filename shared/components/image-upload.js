// ============================================
// SAWYAN - نظام رفع الصور
// ============================================

window.SAWYAN = window.SAWYAN || {};

window.SAWYAN.ImageUpload = {
    // إعدادات رفع الصور
    config: {
        maxSizeMB: 5, // الحد الأقصى للحجم بالميجابايت
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        storageUrl: 'https://dssspiossqgroefmvnql.supabase.co/storage/v1/object/public/'
    },

    /**
     * رفع صورة إلى Supabase Storage
     * @param {File} file - ملف الصورة
     * @param {string} bucket - اسم الـ bucket (avatars, logos, invoices)
     * @param {string} folder - المجلد داخل الـ bucket
     * @returns {Promise<{success: boolean, url?: string, error?: string}>}
     */
    async uploadImage(file, bucket, folder = '') {
        try {
            // التحقق من وجود الملف
            if (!file) {
                return { success: false, error: 'لم يتم اختيار ملف' };
            }

            // التحقق من نوع الملف
            if (!this.config.allowedTypes.includes(file.type)) {
                return { success: false, error: 'نوع الملف غير مدعوم. الأنواع المدعومة: JPEG, PNG, WebP, GIF' };
            }

            // التحقق من حجم الملف
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > this.config.maxSizeMB) {
                return { success: false, error: `حجم الملف يتجاوز الحد الأقصى (${this.config.maxSizeMB} ميجابايت)` };
            }

            // إنشاء اسم فريد للملف
            const fileExt = file.name.split('.').pop();
            const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // رفع الملف
            const { data, error } = await window.SAWYAN.supabase.storage
                .from(bucket)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                console.error('Upload error:', error);
                // في حالة عدم وجود bucket، نعيد رسالة مفيدة
                if (error.message.includes('not found')) {
                    return { success: false, error: 'مخزن الصور غير موجود. يرجى التواصل مع الدعم الفني.' };
                }
                return { success: false, error: error.message };
            }

            // الحصول على الرابط العام
            const { data: urlData } = window.SAWYAN.supabase.storage
                .from(bucket)
                .getPublicUrl(fileName);

            return {
                success: true,
                url: urlData.publicUrl,
                path: fileName
            };

        } catch (err) {
            console.error('Upload exception:', err);
            return { success: false, error: 'حدث خطأ أثناء رفع الصورة' };
        }
    },

    /**
     * حذف صورة من Supabase Storage
     * @param {string} bucket - اسم الـ bucket
     * @param {string} path - مسار الملف
     */
    async deleteImage(bucket, path) {
        try {
            const { error } = await window.SAWYAN.supabase.storage
                .from(bucket)
                .remove([path]);

            if (error) {
                console.error('Delete error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            console.error('Delete exception:', err);
            return { success: false, error: 'حدث خطأ أثناء حذف الصورة' };
        }
    },

    /**
     * معاينة صورة قبل الرفع
     * @param {HTMLInputElement} input - عنصر الإدخال
     * @param {HTMLElement} previewElement - عنصر المعاينة
     * @param {Function} callback - دالة تُستدعى بعد المعاينة
     */
    previewImage(input, previewElement, callback = null) {
        if (input.files && input.files[0]) {
            const file = input.files[0];

            // التحقق من نوع الملف
            if (!this.config.allowedTypes.includes(file.type)) {
                alert('نوع الملف غير مدعوم');
                input.value = '';
                return;
            }

            // التحقق من الحجم
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > this.config.maxSizeMB) {
                alert(`حجم الملف يتجاوز الحد الأقصى (${this.config.maxSizeMB} ميجابايت)`);
                input.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                if (previewElement) {
                    if (previewElement.tagName === 'IMG') {
                        previewElement.src = e.target.result;
                    } else {
                        previewElement.innerHTML = `<img src="${e.target.result}" alt="معاينة">`;
                    }
                }

                if (callback && typeof callback === 'function') {
                    callback(e.target.result, file);
                }
            };
            reader.readAsDataURL(file);
        }
    },

    /**
     * ضغط صورة قبل الرفع (اختياري)
     * @param {File} file - ملف الصورة
     * @param {number} maxWidth - العرض الأقصى
     * @param {number} quality - جودة الصورة (0-1)
     */
    async compressImage(file, maxWidth = 800, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = function () {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * إنشاء مكون رفع صور متكامل
     * @param {Object} options - خيارات المكون
     */
    createUploader(options) {
        const {
            containerId,
            inputId,
            previewId,
            bucket = 'avatars',
            folder = '',
            onUploadSuccess = null,
            onUploadError = null,
            placeholder = '📷 اضغط لاختيار صورة'
        } = options;

        const container = document.getElementById(containerId);
        if (!container) return null;

        container.innerHTML = `
            <div class="image-uploader">
                <div class="image-preview" id="${previewId}">
                    <span class="placeholder">${placeholder}</span>
                </div>
                <input type="file" id="${inputId}" accept="image/*" style="display:none">
                <div class="upload-actions">
                    <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('${inputId}').click()">
                        📷 اختر صورة
                    </button>
                </div>
                <div class="upload-progress" id="${inputId}Progress" style="display:none">
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                    <span class="progress-text">جاري الرفع...</span>
                </div>
            </div>
        `;

        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // معاينة الصورة
            this.previewImage(input, preview);

            // إظهار شريط التقدم
            const progressEl = document.getElementById(`${inputId}Progress`);
            if (progressEl) progressEl.style.display = 'block';

            // رفع الصورة
            const result = await this.uploadImage(file, bucket, folder);

            // إخفاء شريط التقدم
            if (progressEl) progressEl.style.display = 'none';

            if (result.success) {
                if (onUploadSuccess) onUploadSuccess(result.url, result.path);
            } else {
                if (onUploadError) onUploadError(result.error);
                else alert(result.error);
            }
        });

        return { input, preview };
    }
};

console.log('✅ SAWYAN ImageUpload module initialized');
