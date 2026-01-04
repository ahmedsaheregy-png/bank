/**
 * ============================================
 * سويان - خدمة الدفع الرئيسية
 * SAWYAN - Payment Service
 * ============================================
 * 
 * خدمة التنسيق الرئيسية التي تتعامل مع جميع تدفقات الدفع:
 * - التدفق 1: العضو ينشئ → التاجر يوافق → دفع خارجي (موجود)
 * - التدفق 2: التاجر ينشئ مباشرة → دفع خارجي (موجود)
 * - التدفق 3: العضو ينشئ → دفع داخل التطبيق (جديد)
 * - التدفق 4: التاجر ينشئ → دفع داخل التطبيق لعميل غير متصل (جديد)
 * 
 * ============================================
 */

/**
 * خدمة الدفع الرئيسية
 */
class SawyanPaymentService {
    constructor() {
        // سجل المزودين المسجلين
        this.providers = new Map();

        // المزود الافتراضي
        this.defaultProvider = 'mock';

        // مفتاح تشفير QR (للإنتاج: يجب تخزينه بشكل آمن)
        this.qrEncryptionKey = 'SAWYAN_SECURE_KEY_2026';

        // مدة صلاحية QR بالمللي ثانية (24 ساعة)
        this.qrExpiryMs = 24 * 60 * 60 * 1000;
    }

    /**
     * تسجيل مزود دفع
     * @param {string} name - اسم المزود
     * @param {Object} provider - كائن المزود
     */
    registerProvider(name, provider) {
        this.providers.set(name, provider);
        console.log(`✅ تم تسجيل مزود الدفع: ${name}`);
    }

    /**
     * الحصول على مزود دفع
     * @param {string} name - اسم المزود
     * @returns {Object} - كائن المزود
     */
    getProvider(name = null) {
        const providerName = name || this.defaultProvider;
        const provider = this.providers.get(providerName);

        if (!provider) {
            throw new Error(`مزود الدفع "${providerName}" غير مسجل`);
        }

        return provider;
    }

    /**
     * تعيين المزود الافتراضي
     * @param {string} name - اسم المزود
     */
    setDefaultProvider(name) {
        if (!this.providers.has(name)) {
            throw new Error(`مزود الدفع "${name}" غير مسجل`);
        }
        this.defaultProvider = name;
    }

    /**
     * حساب تقسيم العمولة
     * @param {number} amount - المبلغ الإجمالي
     * @param {number} commissionPercentage - نسبة العمولة (مثال: 10 تعني 10%)
     * @returns {Object} - تفاصيل التقسيم
     */
    calculateSplit(amount, commissionPercentage) {
        const commissionAmount = amount * (commissionPercentage / 100);

        return {
            totalAmount: amount,                    // المبلغ الإجمالي
            commissionAmount: commissionAmount,     // مبلغ العمولة الكلي
            platformShare: commissionAmount * 0.25, // 25% لسويان
            memberShare: commissionAmount * 0.75,   // 75% لشجرة العضو
            merchantPayout: amount - commissionAmount // حصة التاجر
        };
    }

    /**
     * التدفق 3: دفع بمبادرة العضو داخل التطبيق
     * @param {Object} params - معاملات الدفع
     * @param {string} params.memberId - معرف العضو
     * @param {string} params.merchantId - معرف التاجر
     * @param {number} params.amount - المبلغ
     * @param {string} params.currency - العملة
     * @param {string} params.paymentToken - توكن الدفع
     * @param {number} params.commissionPercentage - نسبة العمولة
     * @param {string} params.providerName - اسم المزود (اختياري)
     * @returns {Promise<Object>} - نتيجة الدفع
     */
    async processMemberPayment(params) {
        const {
            memberId,
            merchantId,
            amount,
            currency,
            paymentToken,
            commissionPercentage,
            providerName
        } = params;

        console.log(`💳 معالجة دفع العضو: ${amount} ${currency}`);

        try {
            // الحصول على المزود
            const provider = this.getProvider(providerName);

            // التحقق من دعم العملة
            if (!provider.supportsCurrency(currency)) {
                throw new Error(`المزود لا يدعم العملة: ${currency}`);
            }

            // حساب التقسيم
            const split = this.calculateSplit(amount, commissionPercentage);

            // تنفيذ الدفع المباشر
            const result = await provider.directCharge(
                amount,
                currency,
                paymentToken,
                {
                    merchantAmount: split.merchantPayout,
                    platformAmount: split.platformShare + split.memberShare
                },
                {
                    memberId,
                    merchantId,
                    flow: 'member_initiated_in_app'
                }
            );

            if (!result.success) {
                throw new Error(result.error || 'فشل في معالجة الدفع');
            }

            return {
                success: true,
                transactionId: result.transactionId,
                paymentMethod: 'in_app',
                paymentProvider: provider.providerName,
                paymentReference: result.transactionId,
                split,
                message: 'تم الدفع بنجاح'
            };

        } catch (error) {
            console.error('❌ خطأ في معالجة دفع العضو:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * التدفق 4: دفع بمبادرة التاجر (عميل غير متصل)
     * @param {Object} params - معاملات الدفع
     * @param {string} params.merchantId - معرف التاجر
     * @param {string} params.qrData - بيانات QR المسحوبة
     * @param {number} params.amount - المبلغ
     * @param {string} params.currency - العملة
     * @param {number} params.commissionPercentage - نسبة العمولة
     * @param {string} params.providerName - اسم المزود (اختياري)
     * @returns {Promise<Object>} - نتيجة الدفع
     */
    async processOfflineCustomerPayment(params) {
        const {
            merchantId,
            qrData,
            amount,
            currency,
            commissionPercentage,
            providerName
        } = params;

        console.log(`📱 معالجة دفع عميل غير متصل: ${amount} ${currency}`);

        try {
            // فك تشفير والتحقق من QR
            const qrPayload = this.decryptOfflineQR(qrData);

            if (!qrPayload.valid) {
                throw new Error(qrPayload.error || 'QR غير صالح');
            }

            const memberId = qrPayload.memberId;
            const memberCode = qrPayload.memberCode;

            // الحصول على طريقة الدفع المحفوظة للعضو
            // (هذا يتطلب استعلام قاعدة البيانات - سيتم تنفيذه في الواجهة)
            const storedPaymentToken = await this.getMemberDefaultPaymentToken(memberId);

            if (!storedPaymentToken) {
                throw new Error('العضو ليس لديه طريقة دفع محفوظة');
            }

            // الحصول على المزود
            const provider = this.getProvider(providerName);

            // حساب التقسيم
            const split = this.calculateSplit(amount, commissionPercentage);

            // شحن طريقة الدفع المحفوظة
            const result = await provider.chargeStoredMethod(
                storedPaymentToken,
                amount,
                currency,
                {
                    merchantAmount: split.merchantPayout,
                    platformAmount: split.platformShare + split.memberShare
                }
            );

            if (!result.success) {
                throw new Error(result.error || 'فشل في معالجة الدفع');
            }

            return {
                success: true,
                transactionId: result.transactionId,
                memberId,
                memberCode,
                paymentMethod: 'in_app',
                paymentProvider: provider.providerName,
                paymentReference: result.transactionId,
                split,
                message: 'تم الدفع بنجاح (عميل غير متصل)'
            };

        } catch (error) {
            console.error('❌ خطأ في معالجة دفع العميل غير المتصل:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * توليد QR مشفر للدفع بدون اتصال
     * @param {string} memberId - معرف العضو
     * @param {string} memberCode - كود العضو
     * @returns {string} - نص QR المشفر
     */
    generateOfflineQR(memberId, memberCode) {
        const payload = {
            mid: memberId,
            mc: memberCode,
            ts: Date.now(),
            exp: Date.now() + this.qrExpiryMs
        };

        // تشفير بسيط (Base64 + hash)
        const jsonPayload = JSON.stringify(payload);
        const encoded = btoa(unescape(encodeURIComponent(jsonPayload)));
        const hash = this._simpleHash(encoded + this.qrEncryptionKey);

        return `SAWYAN:OFFLINE:${encoded}:${hash}`;
    }

    /**
     * فك تشفير والتحقق من QR
     * @param {string} qrData - بيانات QR
     * @returns {Object} - {valid, memberId, memberCode, error}
     */
    decryptOfflineQR(qrData) {
        try {
            // التحقق من الصيغة
            if (!qrData || !qrData.startsWith('SAWYAN:OFFLINE:')) {
                return { valid: false, error: 'صيغة QR غير صالحة' };
            }

            // استخراج الأجزاء
            const parts = qrData.split(':');
            if (parts.length !== 4) {
                return { valid: false, error: 'QR تالف' };
            }

            const [, , encoded, hash] = parts;

            // التحقق من الهاش
            const expectedHash = this._simpleHash(encoded + this.qrEncryptionKey);
            if (hash !== expectedHash) {
                return { valid: false, error: 'QR تم التلاعب به' };
            }

            // فك التشفير
            const jsonPayload = decodeURIComponent(escape(atob(encoded)));
            const payload = JSON.parse(jsonPayload);

            // التحقق من الصلاحية
            if (payload.exp < Date.now()) {
                return { valid: false, error: 'QR منتهي الصلاحية' };
            }

            return {
                valid: true,
                memberId: payload.mid,
                memberCode: payload.mc,
                timestamp: payload.ts,
                expiresAt: payload.exp
            };

        } catch (error) {
            console.error('خطأ في فك تشفير QR:', error);
            return { valid: false, error: 'خطأ في قراءة QR' };
        }
    }

    /**
     * دالة هاش بسيطة
     * @private
     */
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * الحصول على توكن الدفع الافتراضي للعضو
     * (يجب تنفيذها مع Supabase في الواجهة)
     * @param {string} memberId - معرف العضو
     * @returns {Promise<string|null>} - توكن الدفع أو null
     */
    async getMemberDefaultPaymentToken(memberId) {
        // هذه الدالة ستُستدعى من الواجهة مع Supabase
        // هنا نُرجع null كقيمة افتراضية
        console.log('⚠️ يجب تنفيذ getMemberDefaultPaymentToken مع Supabase');
        return null;
    }

    /**
     * توليد QR للواي فاي
     * @param {string} ssid - اسم الشبكة
     * @param {string} password - كلمة المرور
     * @param {string} encryption - نوع التشفير (WPA/WEP/nopass)
     * @returns {string} - نص QR للواي فاي
     */
    generateWifiQR(ssid, password, encryption = 'WPA') {
        // تهرب الأحرف الخاصة
        const escape = (str) => str.replace(/[\\;,:\"]/g, '\\$&');

        return `WIFI:T:${encryption};S:${escape(ssid)};P:${escape(password)};;`;
    }

    /**
     * الحصول على قائمة المزودين المتاحين
     * @returns {Array} - قائمة المزودين
     */
    getAvailableProviders() {
        return Array.from(this.providers.entries()).map(([name, provider]) => ({
            name,
            displayName: provider.providerName,
            supportedCurrencies: provider.supportedCurrencies,
            supportedCountries: provider.supportedCountries,
            supportsSplitPayment: provider.supportsSplitPayment,
            supportsInstallments: provider.supportsInstallments
        }));
    }

    /**
     * الحصول على أفضل مزود حسب الدولة والعملة
     * @param {string} countryCode - رمز الدولة
     * @param {string} currency - رمز العملة
     * @returns {Object|null} - المزود المناسب أو null
     */
    getBestProvider(countryCode, currency) {
        for (const [name, provider] of this.providers) {
            if (provider.supportsCountry(countryCode) && provider.supportsCurrency(currency)) {
                return { name, provider };
            }
        }
        return null;
    }
}

// إنشاء instance واحد
const sawyanPaymentService = new SawyanPaymentService();

// تصدير
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SawyanPaymentService, sawyanPaymentService };
}

// للاستخدام في المتصفح
if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.PaymentService = sawyanPaymentService;
    window.SAWYAN.SawyanPaymentServiceClass = SawyanPaymentService;
}
