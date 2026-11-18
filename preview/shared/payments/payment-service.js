/**
 * ============================================
 * سويان - خدمة الدفع والتكامل البنكي الموحدة (V3.0)
 * SAWYAN - Unified Global Payment Service (D21 + D24 + S05)
 * ============================================
 *
 * الضوابط الدستورية المطبقة:
 * 1. D21: أي حساب تقسيم في المتصفح استرشادي فقط (Non-binding UI Preview)؛ الحساب الملزم ينفذه PostgreSQL.
 * 2. D24: حظر تام لأي تحويلات P2P بين الأعضاء (No transfer_p2p).
 * 3. S05: إلزامية مفتاح Idempotency-Key (UUIDv7) في كل عملية مالية.
 * 4. البند المجمّد #1: عدم استخدام TOTP 60s المعتمد على ساعة الهاتف حتى قرار المؤسس النهائي؛
 *    تُستخدم هوية العضو الثابتة (Member Code) مع فحص التكرار بالخادم وطابور IndexedDB AES-GCM.
 */

class SawyanPaymentService {
    constructor() {
        this.providers = new Map();
        this.defaultProvider = 'mock';
    }

    registerProvider(name, provider) {
        this.providers.set(name, provider);
    }

    getProvider(name = null) {
        const providerName = name || this.defaultProvider;
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`مزود الدفع "${providerName}" غير مسجل`);
        }
        return provider;
    }

    setDefaultProvider(name) {
        if (!this.providers.has(name)) {
            throw new Error(`مزود الدفع "${name}" غير مسجل`);
        }
        this.defaultProvider = name;
    }

    /**
     * معاينة استرشادية غير ملزمة لتقسيم العمولة داخل واجهة المستخدم فقط (D21)
     * المبالغ والقيد الفعلي يحسبها PostgreSQL (feed_monthly_target_box)
     */
    calculateSplit(amount, commissionPercentage) {
        const total = Number(amount) || 0;
        const pct = Number(commissionPercentage) || 0;
        const commissionAmount = Math.round((total * (pct / 100)) * 100) / 100;

        return {
            nonBindingPreviewOnly: true,
            totalAmount: total,
            commissionAmount: commissionAmount,
            platformShare: Math.round((commissionAmount * 0.25) * 100) / 100,
            memberShare: Math.round((commissionAmount * 0.75) * 100) / 100,
            merchantPayout: Math.round((total - commissionAmount) * 100) / 100
        };
    }

    /**
     * حظر التحويلات المباشرة بين محافظ الأعضاء نهائياً (D24)
     */
    async transferP2P() {
        throw new Error('P2P_TRANSFERS_PROHIBITED_D24: التحويل المباشر بين الأعضاء محظور بقرار معماري D24.');
    }

    _generateIdempotencyKey() {
        if (typeof window !== 'undefined' && window.SAWYAN && window.SAWYAN.IPaymentProvider) {
            return window.SAWYAN.IPaymentProvider.generateUUIDv7();
        }
        const { IPaymentProvider } = require('./payment-provider');
        return IPaymentProvider.generateUUIDv7();
    }

    async processMemberPayment(params) {
        const {
            memberId,
            merchantId,
            branchId,
            amount,
            currency,
            paymentToken,
            paymentType = 'payment_gateway',
            providerName,
            idempotencyKey
        } = params;

        try {
            const provider = this.getProvider(providerName);
            if (!provider.supportsCurrency(currency)) {
                throw new Error(`المزود ${provider.providerName} لا يدعم العملة: ${currency}`);
            }

            const idemKey = idempotencyKey || this._generateIdempotencyKey();
            const result = await provider.directCharge(
                amount,
                currency,
                paymentToken,
                {}, // لا يرسل المتصفح أوامر تقسيم ملزمة (D21)
                { memberId, merchantId, branchId, flow: 'member_initiated_in_app', idempotencyKey: idemKey }
            );

            if (!result.success) {
                throw new Error(result.error || 'فشل في معالجة الدفع');
            }

            // تسجيل العملية ذرياً في نواة PostgreSQL إذا كانت واجهة API محملة
            let ledgerResult = null;
            if (typeof window !== 'undefined' && window.SAWYAN && window.SAWYAN.API && branchId) {
                ledgerResult = await window.SAWYAN.API.submitPosTransaction({
                    memberId,
                    merchantId,
                    branchId,
                    amount,
                    paymentType,
                    uniquePaymentRef: result.transactionId,
                    swShortCode: `SW-${idemKey.slice(0, 8).toUpperCase()}`,
                    idempotencyKey: idemKey,
                    isInstantPin: true
                });
            }

            return {
                success: true,
                transactionId: result.transactionId,
                idempotencyKey: idemKey,
                paymentMethod: 'in_app',
                paymentProvider: provider.providerName,
                paymentReference: result.transactionId,
                ledgerResult,
                message: 'تم الدفع وتوثيق القيد المحاسبي بنجاح'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async processOfflineCustomerPayment(params) {
        const {
            merchantId,
            branchId,
            cashierEmployeeId = null,
            qrData,
            amount,
            currency,
            providerName,
            idempotencyKey
        } = params;

        try {
            const qrPayload = this.decryptOfflineQR(qrData);
            if (!qrPayload.valid) {
                throw new Error(qrPayload.error || 'كود العضو غير صالح');
            }

            const idemKey = idempotencyKey || this._generateIdempotencyKey();
            const provider = this.getProvider(providerName);
            const refCode = `OFFLINE-${Date.now()}-${qrPayload.memberCode}`;

            if (typeof window !== 'undefined' && window.SAWYAN && window.SAWYAN.API && qrPayload.memberId && branchId) {
                const ledgerResult = await window.SAWYAN.API.submitPosTransaction({
                    memberId: qrPayload.memberId,
                    merchantId,
                    branchId,
                    amount,
                    paymentType: 'cash',
                    uniquePaymentRef: refCode,
                    swShortCode: `SW-${idemKey.slice(0, 8).toUpperCase()}`,
                    idempotencyKey: idemKey,
                    cashierEmployeeId,
                    isInstantPin: true
                });

                return {
                    success: true,
                    memberCode: qrPayload.memberCode,
                    idempotencyKey: idemKey,
                    paymentProvider: provider.providerName,
                    paymentReference: refCode,
                    ledgerResult,
                    message: 'تم تسجيل معاملة العميل غير المتصل في السجل المحاسبي'
                };
            }

            return {
                success: true,
                memberCode: qrPayload.memberCode,
                idempotencyKey: idemKey,
                paymentProvider: provider.providerName,
                paymentReference: refCode,
                requiresSync: true,
                message: 'جاهز للمزامنة الآمنة عبر طابور المتجر'
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * توليد كود التعريف الثابت للعضو لمسح POS (متوافق مع تجميد البند #1 بدلاً من TOTP 60s)
     */
    generateOfflineQR(memberId, memberCode) {
        const cleanCode = String(memberCode || '').replace(/\D/g, '');
        if (!cleanCode) {
            throw new Error('INVALID_MEMBER_CODE_FOR_BARCODE');
        }
        return `SAWYAN:MEMBER:${cleanCode}:${memberId || ''}`;
    }

    /**
     * قراءة وتحقق كود العضو الثابت (SAWYAN:MEMBER:<code >:<uuid>)
     */
    decryptOfflineQR(qrData) {
        if (!qrData || typeof qrData !== 'string') {
            return { valid: false, error: 'صيغة الكود فارغة' };
        }
        const trimmed = qrData.trim();

        if (trimmed.startsWith('SAWYAN:MEMBER:')) {
            const parts = trimmed.split(':');
            const memberCode = parts[2];
            if (!/^\d+$/.test(memberCode)) {
                return { valid: false, error: 'كود العضو غير رقمي' };
            }
            return {
                valid: true,
                mode: 'static_member_barcode',
                memberCode: Number(memberCode),
                memberId: parts[3] || null
            };
        }

        // دعم إدخال كود العضو الرقمي مباشرة في نقطة البيع POS
        if (/^\d{1,12}$/.test(trimmed)) {
            return {
                valid: true,
                mode: 'numeric_member_code',
                memberCode: Number(trimmed),
                memberId: null
            };
        }

        return { valid: false, error: 'صيغة باركود غير مدعومة (النظام الثابت SAWYAN:MEMBER متبع لحين اعتماد البند #1)' };
    }

    generateWifiQR(ssid, password, encryption = 'WPA') {
        const escape = (str) => String(str || '').replace(/[\\;,:\"]/g, '\\$&');
        return `WIFI:T:${encryption};S:${escape(ssid)};P:${escape(password)};;`;
    }

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

    getBestProvider(countryCode, currency) {
        // الأولوية للمزود الإقليمي المتخصص ثم المزودين العالميين (Stripe / Adyen / PayPalWise)
        const candidates = [];
        for (const [name, provider] of this.providers) {
            if (name === 'mock') continue;
            const countryMatch = provider.supportsCountry(countryCode);
            const currMatch = typeof provider.supportsCurrency === 'function'
                ? provider.supportsCurrency(currency)
                : (provider.supportedCurrencies || []).includes(currency);
            if (countryMatch && currMatch) {
                const isRegionalSpecific = !(provider.supportedCountries || []).includes('*');
                candidates.push({ name, provider, priority: isRegionalSpecific ? 1 : 2 });
            }
        }
        candidates.sort((a, b) => a.priority - b.priority);
        if (candidates.length > 0) {
            return { name: candidates[0].name, provider: candidates[0].provider };
        }
        if (this.providers.has('mock')) {
            return { name: 'mock', provider: this.providers.get('mock') };
        }
        return null;
    }
}

const sawyanPaymentService = new SawyanPaymentService();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SawyanPaymentService, sawyanPaymentService };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.PaymentService = sawyanPaymentService;
    window.SAWYAN.SawyanPaymentServiceClass = SawyanPaymentService;
}
