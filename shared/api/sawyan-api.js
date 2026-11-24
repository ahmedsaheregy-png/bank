/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — V3.0 UNIFIED FRONTEND API ADAPTER (sawyan-api.js)
 * Single Codebase + Dual Environment Routing (D10)
 * Original Site -> `sawyan` schema | Parallel Site (/preview/ | ?env=demo) -> `sawyan_demo` schema
 * ============================================================================
 */

(function (global) {
    'use strict';

    function getClient() {
        if (!global.SAWYAN || !global.SAWYAN.supabase) {
            throw new Error('SAWYAN_SUPABASE_NOT_READY');
        }
        return global.SAWYAN.supabase;
    }

    function generateIdempotencyKey() {
        if (global.SAWYAN && global.SAWYAN.IPaymentProvider) {
            return global.SAWYAN.IPaymentProvider.generateUUIDv7();
        }
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        throw new Error('CRYPTO_RANDOM_UNAVAILABLE');
    }

    async function callRpc(fnName, args = {}) {
        const client = getClient();
        const { data, error } = await client.rpc(fnName, args);
        if (error) {
            throw new Error(`RPC[${fnName}] failed: ${error.message}`);
        }
        return data;
    }

    function escapeCsvField(val) {
        const str = val === null || val === undefined ? '' : String(val);
        if (/[",\r\n]/.test(str)) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    const SawyanAPI = {
        getActiveSchema() {
            return (global.SAWYAN && global.SAWYAN.schema) || 'sawyan';
        },

        isDemoMode() {
            return Boolean(global.SAWYAN && global.SAWYAN.isParallelDemo);
        },

        newIdempotencyKey() {
            return generateIdempotencyKey();
        },

        /**
         * البحث عن الراعي بالرقم عند التسجيل وحظر الجذر #0 على العامة (Workflow 1 / A08)
         */
        async lookupSponsorByCode(memberCode) {
            return await callRpc('lookup_sponsor_by_code', {
                p_member_code: Number(memberCode)
            });
        },

        /**
         * Phase 0 C1: تم إغلاق الاستدعاء المباشر لدالة submit_pos_transaction من المتصفح نهائياً.
         * استخدم حصراً المسارات المصادقة: merchantCreatePosTransaction / employeeCreateVerificationTx / submitMemberPendingPurchase.
         */
        async submitPosTransaction() {
            throw new Error('DIRECT_SUBMIT_POS_TRANSACTION_REVOKED_C1: Direct client calls to submit_pos_transaction are disabled; use authenticated merchant, cashier, or member RPCs.');
        },

        /**
         * تقرير تقفيل الوردية للتاجر والمحاسب مع قيد Audit Log عند التصدير وتطهير CSV (Point 13)
         */
        async getMerchantShiftClosing({
            merchantId,
            branchId = null,
            periodFilter = 'today',
            fromDate = null,
            toDate = null,
            exportFormat = null,
            actorId = null
        }) {
            return await callRpc('get_merchant_shift_closing', {
                p_merchant_id: merchantId,
                p_branch_id: branchId,
                p_period_filter: periodFilter,
                p_from_date: fromDate,
                p_to_date: toDate,
                p_export_format: exportFormat,
                p_actor_id: actorId
            });
        },

        /**
         * بناء ملف CSV مطهّر 100% جاهز للتنزيل في المتصفح (بـ BOM لعرض العربية في Excel)
         */
        buildSafeCsvContent(shiftResult) {
            const headers = [
                'Code', 'Timestamp', 'Customer (D26 Masked)', 'Branch',
                'Cashier', 'Amount', 'Net Commission', 'Currency', 'Payment Type', 'Status'
            ];
            const lines = [headers.map(escapeCsvField).join(',')];
            const rows = (shiftResult && Array.isArray(shiftResult.transactions)) ? shiftResult.transactions : [];
            for (const row of rows) {
                const s = row.csv_safe_row || {};
                const vals = [
                    s.short_code ?? row.short_code,
                    s.created_at ?? row.created_at,
                    s.member ?? row.masked_member,
                    s.branch ?? row.branch_name,
                    s.cashier ?? row.cashier_name,
                    s.total_amount ?? row.total_amount,
                    s.commission_amount ?? row.commission_amount,
                    s.currency ?? row.currency_code,
                    s.payment_type ?? row.payment_type,
                    s.status ?? row.status
                ];
                lines.push(vals.map(escapeCsvField).join(','));
            }
            return '\uFEFF' + lines.join('\r\n');
        },

        /**
         * إرسال عرض خاطف لمراجعة الإدارة عبر الواجهة المصادقة بجلسة التاجر (Phase 0 C5 / Point 12)
         */
        async submitMerchantFlashOffer({ merchantId, title, body, discountHint = null, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_submit_flash_offer_guarded', {
                p_merchant_id: merchantId,
                p_title: title,
                p_body: body,
                p_discount_hint: discountHint,
                p_session_token: tok
            });
        },

        /**
         * رادار المتاجر القريبة للعضو (Haversine + عائدات العضو الصافية فقط بدون 25%)
         */
        async getMerchantsRadar({ lat, lng, radiusKm = 10, countryCode = null, category = null }) {
            return await callRpc('get_merchants_radar', {
                p_lat: Number(lat),
                p_lng: Number(lng),
                p_radius_km: Number(radiusKm),
                p_country_code: countryCode,
                p_category: category
            });
        },

        /**
         * رادار كثافة الأعضاء للتاجر مع تطبيق k-Anonymity >= 10 في SQL (M18)
         */
        async getMerchantMembersDensity(branchId, radiusKm = 3) {
            return await callRpc('get_merchant_members_density', {
                p_branch_id: branchId,
                p_radius_km: Number(radiusKm)
            });
        },

        /**
         * محرك تحليل الشجرة وعدسات الدول + فصل S01 (11 نزولاً) + الفريق الرديف + الخصوصية D26
         */
        async getTreeAnalyticsWithCountryLens(viewerMemberId, periodYm, countryCode = null) {
            return await callRpc('get_tree_analytics_with_country_lens', {
                p_viewer_member_id: viewerMemberId,
                p_period_ym: periodYm,
                p_country_code: countryCode
            });
        },

        /**
         * Phase 2: محرك الشجرة التكيّفي بالتحميل الكسول من الخادم (Mobile 4-5 gens / Laptop 6-8+ gens) + نبض الشجرة
         */
        async getMemberTreeSubtree({
            memberId,
            rootMemberCode = null,
            periodYm = null,
            maxDepth = 4,
            nodeLimit = 80,
            countryCode = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('get_member_tree_subtree', {
                p_member_id: memberId,
                p_session_token: tok,
                p_root_member_code: rootMemberCode !== null && rootMemberCode !== undefined ? Number(rootMemberCode) : null,
                p_period_ym: periodYm,
                p_max_depth: Number(maxDepth || 4),
                p_node_limit: Number(nodeLimit || 80),
                p_country_code: countryCode
            });
        },

        /**
         * تقديم طلب اعتماد مزدوج Maker-Checker للإدارة (D20 / A19)
         */
        async submitMakerCheckerRequest({
            actionType,
            targetEntity,
            targetId,
            payloadAfter,
            makerAdminId,
            reason,
            payloadBefore = null,
            impactSimulation = null
        }) {
            return await callRpc('submit_maker_checker_request', {
                p_action_type: actionType,
                p_target_entity: targetEntity,
                p_target_id: String(targetId),
                p_payload_after: payloadAfter,
                p_maker_admin_id: makerAdminId,
                p_reason: reason,
                p_payload_before: payloadBefore,
                p_impact_simulation: impactSimulation
            });
        },

        /**
         * قرار الاعتماد الثنائي (يرفض من قاعدة البيانات إذا كان checker_admin_id = maker_admin_id)
         */
        async decideMakerCheckerRequest({ requestId, checkerAdminId, decision, rejectionReason = null }) {
            return await callRpc('decide_maker_checker_request', {
                p_request_id: requestId,
                p_checker_admin_id: checkerAdminId,
                p_decision: decision,
                p_rejection_reason: rejectionReason
            });
        },

        // =====================================================================
        // Stage 4 & Phase 4.5: Schema-Namespaced Session Storage & Member RPCs
        // =====================================================================

        _storageKey(baseKey) {
            return `${baseKey}_${SawyanAPI.getActiveSchema()}`;
        },

        getSavedMember() {
            try {
                const raw = localStorage.getItem(SawyanAPI._storageKey('sawyan_member'));
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        },

        getSessionToken() {
            try {
                return localStorage.getItem(SawyanAPI._storageKey('sawyan_session_token')) || null;
            } catch (e) {
                return null;
            }
        },

        getMemberSessionToken() {
            return SawyanAPI.getSessionToken();
        },

        saveMemberSession(memberObj, sessionToken) {
            try {
                if (memberObj) {
                    localStorage.setItem(SawyanAPI._storageKey('sawyan_member'), JSON.stringify(memberObj));
                    if (memberObj.id) localStorage.setItem(SawyanAPI._storageKey('sawyan_member_id'), memberObj.id);
                }
                if (sessionToken) {
                    localStorage.setItem(SawyanAPI._storageKey('sawyan_session_token'), sessionToken);
                }
            } catch (e) {}
        },

        clearMemberSession() {
            try {
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_member'));
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_member_id'));
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_session_token'));
            } catch (e) {}
        },

        getSavedMerchant() {
            try {
                const raw = localStorage.getItem(SawyanAPI._storageKey('sawyan_merchant'));
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        },

        getMerchantSessionToken() {
            try {
                return localStorage.getItem(SawyanAPI._storageKey('sawyan_merchant_session_token')) || null;
            } catch (e) {
                return null;
            }
        },

        saveMerchantSession(merchantObj, sessionToken) {
            try {
                if (merchantObj) {
                    localStorage.setItem(SawyanAPI._storageKey('sawyan_merchant'), JSON.stringify(merchantObj));
                }
                if (sessionToken) {
                    localStorage.setItem(SawyanAPI._storageKey('sawyan_merchant_session_token'), sessionToken);
                }
            } catch (e) {}
        },

        clearMerchantSession() {
            try {
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_merchant'));
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_merchant_session_token'));
            } catch (e) {}
        },

        // Isolated Employee Personal-Phone Session (zero access to merchant owner token)
        getSavedEmployee() {
            try {
                const raw = localStorage.getItem(SawyanAPI._storageKey('sawyan_employee'));
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        },

        getEmployeeSessionToken() {
            try {
                return localStorage.getItem(SawyanAPI._storageKey('sawyan_employee_session_token')) || null;
            } catch (e) {
                return null;
            }
        },

        saveEmployeeSession(employeeObj, sessionToken, meta = null) {
            try {
                if (employeeObj) {
                    const merged = meta ? Object.assign({}, employeeObj, meta) : employeeObj;
                    localStorage.setItem(SawyanAPI._storageKey('sawyan_employee'), JSON.stringify(merged));
                }
                if (sessionToken) {
                    localStorage.setItem(SawyanAPI._storageKey('sawyan_employee_session_token'), sessionToken);
                }
            } catch (e) {}
        },

        clearEmployeeSession() {
            try {
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_employee'));
                localStorage.removeItem(SawyanAPI._storageKey('sawyan_employee_session_token'));
            } catch (e) {}
        },

        getSavedAdmin() {
            try {
                const k = SawyanAPI._storageKey('sawyan_admin');
                // Hardening (Stage 11): Admin session lives ONLY in sessionStorage; purge any stale localStorage tokens
                try {
                    localStorage.removeItem(k);
                    localStorage.removeItem('sawyan_admin');
                } catch (_e) {}
                const raw = sessionStorage.getItem(k);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        },

        getAdminSessionToken() {
            try {
                const k = SawyanAPI._storageKey('sawyan_admin_session_token');
                try {
                    localStorage.removeItem(k);
                } catch (_e) {}
                return sessionStorage.getItem(k) || null;
            } catch (e) {
                return null;
            }
        },

        saveAdminSession(adminObj, sessionToken) {
            try {
                const kAdm = SawyanAPI._storageKey('sawyan_admin');
                const kTok = SawyanAPI._storageKey('sawyan_admin_session_token');
                try {
                    localStorage.removeItem(kAdm);
                    localStorage.removeItem(kTok);
                    localStorage.removeItem('sawyan_admin');
                } catch (_e) {}
                if (adminObj) {
                    const serialized = JSON.stringify(adminObj);
                    sessionStorage.setItem(kAdm, serialized);
                }
                if (sessionToken) {
                    sessionStorage.setItem(kTok, sessionToken);
                }
            } catch (e) {}
        },

        clearAdminSession() {
            try {
                const kAdm = SawyanAPI._storageKey('sawyan_admin');
                const kTok = SawyanAPI._storageKey('sawyan_admin_session_token');
                sessionStorage.removeItem(kAdm);
                sessionStorage.removeItem(kTok);
                localStorage.removeItem(kAdm);
                localStorage.removeItem(kTok);
                localStorage.removeItem('sawyan_admin');
                localStorage.removeItem('sawyan_user_type');
            } catch (e) {}
        },

        async registerNewMember({
            fullName,
            phone,
            sponsorCode,
            password,
            residencyCountryCode = 'EG',
            nationalityCountryCode = null,
            cityGeonameId = null,
            manualDistrict = null,
            email = null,
            metadata = {}
        }) {
            return await callRpc('register_new_member', {
                p_full_name: fullName,
                p_phone: phone,
                p_sponsor_code: Number(sponsorCode),
                p_password: password,
                p_residency_country_code: residencyCountryCode,
                p_nationality_country_code: nationalityCountryCode,
                p_city_geoname_id: cityGeonameId,
                p_manual_district: manualDistrict,
                p_email: email,
                p_metadata: metadata
            });
        },

        async authenticateMemberLogin(identifier, password) {
            return await callRpc('authenticate_member_login', {
                p_identifier: String(identifier || '').trim(),
                p_password: String(password || '')
            });
        },

        async getPublicMerchantsCatalog({ countryCode = null, category = null } = {}) {
            return await callRpc('get_public_merchants_catalog', {
                p_country_code: countryCode && countryCode !== 'ALL' ? countryCode : null,
                p_category: category && category !== 'all' ? category : null
            });
        },

        async getMemberDashboardBundle({
            memberId,
            sessionToken = null,
            periodYm = null,
            lensCountryCode = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('get_member_dashboard_bundle', {
                p_member_id: memberId,
                p_session_token: tok,
                p_period_ym: periodYm,
                p_lens_country_code: lensCountryCode && lensCountryCode !== 'ALL' ? lensCountryCode : null
            });
        },

        async manageMemberCrmContact({
            memberId,
            action,
            contactId = null,
            contactName = null,
            contactPhone = null,
            notes = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('manage_member_crm_contact', {
                p_member_id: memberId,
                p_action: action,
                p_session_token: tok,
                p_contact_id: contactId,
                p_contact_name: contactName,
                p_contact_phone: contactPhone,
                p_notes: notes
            });
        },

        async submitMemberPendingPurchase({
            memberId,
            merchantId,
            branchId,
            amount,
            paymentType = 'cash',
            idempotencyKey = null,
            receiptUrl = null,
            uniquePaymentRef = null,
            employeeCode = null,
            cashierPin = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('submit_member_pending_purchase', {
                p_member_id: memberId,
                p_merchant_id: merchantId,
                p_branch_id: branchId,
                p_amount: Number(amount),
                p_payment_type: paymentType,
                p_idempotency_key: idempotencyKey || generateIdempotencyKey(),
                p_session_token: tok,
                p_receipt_url: receiptUrl,
                p_unique_payment_ref: uniquePaymentRef || null,
                p_employee_code: employeeCode || null,
                p_cashier_pin: cashierPin || null
            });
        },

        async cancelMemberPendingPurchase({ memberId, transactionId, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('cancel_member_pending_purchase', {
                p_member_id: memberId,
                p_transaction_id: transactionId,
                p_session_token: tok
            });
        },

        async submitMemberMerchantComplaint({
            memberId,
            merchantId,
            category = 'other',
            subject,
            details,
            evidenceUrl = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('submit_member_merchant_complaint', {
                p_member_id: memberId,
                p_merchant_id: merchantId,
                p_category: category || 'other',
                p_subject: subject,
                p_details: details,
                p_evidence_url: evidenceUrl || null,
                p_session_token: tok
            });
        },

        async submitMemberDispute({
            memberId,
            transactionId,
            reason,
            category = 'general',
            evidenceUrl = null,
            audioUrl = null,
            audioSec = null,
            videoUrl = null,
            videoSec = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('submit_member_dispute', {
                p_member_id: memberId,
                p_transaction_id: transactionId,
                p_dispute_reason: reason,
                p_session_token: tok,
                p_audio_url: audioUrl,
                p_audio_sec: audioSec,
                p_video_url: videoUrl,
                p_video_sec: videoSec,
                p_dispute_category: category || 'general',
                p_evidence_url: evidenceUrl
            });
        },

        async previewPosReturnImpact({ memberId, transactionId, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('preview_pos_return_impact', {
                p_member_id: memberId,
                p_transaction_id: transactionId,
                p_session_token: tok
            });
        },

        async memberRespondPosReturn({ memberId, returnRequestId, decision, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('member_respond_pos_return', {
                p_member_id: memberId,
                p_return_request_id: returnRequestId,
                p_decision: decision,
                p_session_token: tok
            });
        },

        async submitMemberReview({ memberId, transactionId, rating, comment = null, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('submit_member_review', {
                p_member_id: memberId,
                p_transaction_id: transactionId,
                p_rating: Number(rating),
                p_comment: comment,
                p_session_token: tok
            });
        },

        async updateMemberProfileSettings({
            memberId,
            fullName = null,
            email = null,
            manualDistrict = null,
            favoriteMerchantId = null,
            favoriteAction = null,
            currentPassword = null,
            newPassword = null,
            homeLat = null,
            homeLng = null,
            avatarUrl = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('update_member_profile_settings', {
                p_member_id: memberId,
                p_session_token: tok,
                p_full_name: fullName,
                p_email: email,
                p_manual_district: manualDistrict,
                p_favorite_merchant_id: favoriteMerchantId,
                p_favorite_action: favoriteAction,
                p_current_password: currentPassword,
                p_new_password: newPassword,
                p_home_lat: homeLat !== null && homeLat !== undefined && homeLat !== '' ? Number(homeLat) : null,
                p_home_lng: homeLng !== null && homeLng !== undefined && homeLng !== '' ? Number(homeLng) : null,
                p_avatar_url: avatarUrl !== undefined ? avatarUrl : null
            });
        },

        async manageMemberPayoutMethod({
            memberId,
            action,
            provider = null,
            holderName = null,
            accountIdentifier = null,
            methodId = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('manage_member_payout_method', {
                p_member_id: memberId,
                p_action: action,
                p_session_token: tok,
                p_provider: provider,
                p_holder_name: holderName,
                p_account_identifier: accountIdentifier,
                p_method_id: methodId
            });
        },

        async requestMemberWithdrawal({
            memberId,
            paymentMethodId,
            amountUsd,
            idempotencyKey = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('request_member_withdrawal', {
                p_member_id: memberId,
                p_payment_method_id: paymentMethodId,
                p_amount_usd: Number(amountUsd),
                p_idempotency_key: idempotencyKey || generateIdempotencyKey(),
                p_session_token: tok
            });
        },

        async submitPriceGougingReport({
            memberId,
            transactionId,
            declaredPrice,
            chargedPrice,
            shelfPhotoUrl,
            receiptUrl,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getSessionToken();
            return await callRpc('submit_price_gouging_report', {
                p_member_id: memberId,
                p_transaction_id: transactionId,
                p_declared_price: Number(declaredPrice),
                p_charged_price: Number(chargedPrice),
                p_shelf_photo_url: shelfPhotoUrl,
                p_receipt_url: receiptUrl,
                p_session_token: tok
            });
        },

        async finalizeSettlementPayoutStep56({
            periodYm,
            makerAdminId,
            checkerAdminId,
            ias21FxDeltaUsd = 0,
            countryCode = null
        }) {
            const normCountry = (countryCode && String(countryCode).trim().toUpperCase() !== 'ALL')
                ? String(countryCode).trim().toUpperCase().slice(0, 2)
                : null;
            return await callRpc('finalize_settlement_payout_step5_6', {
                p_period_ym: periodYm,
                p_maker_admin_id: makerAdminId,
                p_checker_admin_id: checkerAdminId,
                p_ias21_fx_delta_usd: Number(ias21FxDeltaUsd || 0),
                p_country_code: normCountry
            });
        },

        // =====================================================================
        // Stage 5: Merchant Portal, POS Kiosk, Cashier PIN (D25) & Store Ops
        // =====================================================================

        async registerNewMerchant({
            businessName,
            ownerName,
            phone,
            password,
            countryCode = 'EG',
            category = 'supermarket',
            merchantType = 'physical',
            deductionPercent = null,
            email = null,
            address = null,
            cityGeonameId = null,
            latitude = null,
            longitude = null,
            onboardedByMemberCode = null,
            initialCashierPin = null,
            metadata = null
        }) {
            const resolvedDeduction = (deductionPercent !== null && deductionPercent !== undefined && deductionPercent !== '')
                ? Number(deductionPercent)
                : null;
            const resolvedOnboarder = (onboardedByMemberCode !== null && onboardedByMemberCode !== undefined && onboardedByMemberCode !== '')
                ? Number(onboardedByMemberCode)
                : null;
            const resolvedLat = latitude !== null && latitude !== undefined && latitude !== '' ? Number(latitude) : null;
            const resolvedLng = longitude !== null && longitude !== undefined && longitude !== '' ? Number(longitude) : null;
            const resolvedMetadata = metadata || null;
            return await callRpc('register_new_merchant', {
                p_business_name: businessName,
                p_owner_name: ownerName,
                p_phone: phone,
                p_password: password,
                p_country_code: countryCode,
                p_category: category,
                p_merchant_type: merchantType,
                p_deduction_percent: resolvedDeduction,
                p_email: email,
                p_address: address,
                p_city_geoname_id: cityGeonameId,
                p_latitude: resolvedLat,
                p_longitude: resolvedLng,
                p_onboarded_by_member_code: resolvedOnboarder,
                p_initial_cashier_pin: initialCashierPin || null,
                p_metadata: resolvedMetadata
            });
        },

        async authenticateMerchantLogin(identifier, password) {
            return await callRpc('authenticate_merchant_login', {
                p_identifier: String(identifier || '').trim(),
                p_password: String(password || '')
            });
        },

        async authenticateEmployeeLogin({ merchantCode, employeeCode, pin }) {
            return await callRpc('authenticate_employee_login', {
                p_merchant_code: String(merchantCode || '').trim(),
                p_employee_code: String(employeeCode || '').trim(),
                p_pin: String(pin || '').trim()
            });
        },

        async employeeChangePin({ employeeId, currentPin, newPin, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getEmployeeSessionToken();
            return await callRpc('employee_change_pin', {
                p_employee_id: employeeId,
                p_session_token: tok,
                p_current_pin: String(currentPin || '').trim(),
                p_new_pin: String(newPin || '').trim()
            });
        },

        async employeeLockSession({ employeeId, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getEmployeeSessionToken();
            return await callRpc('employee_lock_session', {
                p_employee_id: employeeId,
                p_session_token: tok
            });
        },

        async getEmployeeVerificationBundle({ employeeId, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getEmployeeSessionToken();
            return await callRpc('get_employee_verification_bundle', {
                p_employee_id: employeeId,
                p_session_token: tok
            });
        },

        async employeeLookupMember({ employeeId, memberIdentifier, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getEmployeeSessionToken();
            return await callRpc('employee_lookup_member', {
                p_employee_id: employeeId,
                p_session_token: tok,
                p_member_identifier: String(memberIdentifier || '').trim()
            });
        },

        async employeeDecidePendingTx({ employeeId, transactionId, decision, rejectionReason = null, reconfirmPin = null, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getEmployeeSessionToken();
            return await callRpc('employee_decide_pending_tx', {
                p_employee_id: employeeId,
                p_session_token: tok,
                p_transaction_id: transactionId,
                p_decision: decision,
                p_rejection_reason: rejectionReason,
                p_reconfirm_pin: reconfirmPin || null
            });
        },

        async employeeCreateVerificationTx({
            employeeId,
            memberCode,
            amount,
            paymentType = 'cash',
            idempotencyKey = null,
            uniquePaymentRef = null,
            receiptMediaUrl = null,
            reconfirmPin = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getEmployeeSessionToken();
            return await callRpc('employee_create_verification_tx', {
                p_employee_id: employeeId,
                p_session_token: tok,
                p_member_code: Number(memberCode),
                p_amount: Number(amount),
                p_payment_type: paymentType || 'cash',
                p_idempotency_key: idempotencyKey || generateIdempotencyKey(),
                p_unique_payment_ref: uniquePaymentRef || null,
                p_receipt_media_url: receiptMediaUrl || null,
                p_reconfirm_pin: reconfirmPin || null
            });
        },

        // Stage 15: Unified Multi-Channel Push (Web Push VAPID + Google Play FCM/APNs ready)
        async getPushVapidPublicKey() {
            return await callRpc('get_push_vapid_public_key', {});
        },

        async registerPushSubscription({
            actorType,
            actorId,
            endpoint,
            p256dh = null,
            authSecret = null,
            channel = 'web_push',
            deviceLabel = null,
            sessionToken = null
        }) {
            const tok = sessionToken || (
                actorType === 'employee'
                    ? SawyanAPI.getEmployeeSessionToken()
                    : actorType === 'merchant_owner'
                    ? SawyanAPI.getMerchantSessionToken()
                    : SawyanAPI.getMemberSessionToken()
            );
            return await callRpc('register_push_subscription', {
                p_actor_type: actorType,
                p_actor_id: actorId,
                p_session_token: tok,
                p_endpoint: endpoint,
                p_p256dh: p256dh,
                p_auth_secret: authSecret,
                p_channel: channel || 'web_push',
                p_device_label: deviceLabel || null
            });
        },

        async unregisterPushSubscription({ actorType, actorId, endpoint, sessionToken = null }) {
            const tok = sessionToken || (
                actorType === 'employee'
                    ? SawyanAPI.getEmployeeSessionToken()
                    : actorType === 'merchant_owner'
                    ? SawyanAPI.getMerchantSessionToken()
                    : SawyanAPI.getMemberSessionToken()
            );
            return await callRpc('unregister_push_subscription', {
                p_actor_type: actorType,
                p_actor_id: actorId,
                p_session_token: tok,
                p_endpoint: endpoint
            });
        },

        async sendMyTestPush({ actorType, actorId, sessionToken = null }) {
            const tok = sessionToken || (
                actorType === 'employee'
                    ? SawyanAPI.getEmployeeSessionToken()
                    : actorType === 'merchant_owner'
                    ? SawyanAPI.getMerchantSessionToken()
                    : SawyanAPI.getMemberSessionToken()
            );
            return await callRpc('send_my_test_push', {
                p_actor_type: actorType,
                p_actor_id: actorId,
                p_session_token: tok
            });
        },

        async lookupMemberForPos({ merchantId, memberIdentifier, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('lookup_member_for_pos', {
                p_merchant_id: merchantId,
                p_member_identifier: String(memberIdentifier || '').trim(),
                p_session_token: tok
            });
        },

        async authenticateAndSubmitPosTx({
            merchantId,
            memberCode,
            amount,
            paymentType = 'cash',
            idempotencyKey = null,
            branchId = null,
            employeeCode = null,
            cashierPin = null,
            swShortCode = null,
            uniquePaymentRef = null,
            receiptMediaUrl = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('authenticate_and_submit_pos_tx', {
                p_merchant_id: merchantId,
                p_member_code: Number(memberCode),
                p_amount: Number(amount),
                p_payment_type: paymentType || 'cash',
                p_idempotency_key: idempotencyKey || generateIdempotencyKey(),
                p_session_token: tok,
                p_branch_id: branchId,
                p_employee_code: employeeCode || null,
                p_cashier_pin: cashierPin || null,
                p_sw_short_code: swShortCode || null,
                p_unique_payment_ref: uniquePaymentRef || null,
                p_receipt_media_url: receiptMediaUrl || null
            });
        },

        async confirmOrRejectPendingTx({
            merchantId,
            transactionId,
            decision,
            rejectionReason = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('confirm_or_reject_pending_tx', {
                p_merchant_id: merchantId,
                p_transaction_id: transactionId,
                p_decision: decision,
                p_rejection_reason: rejectionReason,
                p_session_token: tok
            });
        },

        async manageMerchantCashierAndSettings({
            merchantId,
            action = 'update_profile',
            businessName = null,
            ownerName = null,
            phone = null,
            address = null,
            latitude = null,
            longitude = null,
            wifiSsid = null,
            wifiPassword = null,
            workingHours = null,
            currentPassword = null,
            newPassword = null,
            employeeCode = null,
            employeeName = null,
            employeePin = null,
            linkedMemberCode = null,
            maxTxLimit = null,
            employeeId = null,
            branchId = null,
            mediaPatch = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            const resolvedMediaPatch = mediaPatch || null;
            return await callRpc('manage_merchant_cashier_and_settings', {
                p_merchant_id: merchantId,
                p_action: action,
                p_session_token: tok,
                p_business_name: businessName,
                p_owner_name: ownerName,
                p_phone: phone,
                p_address: address,
                p_latitude: latitude !== null && latitude !== '' ? Number(latitude) : null,
                p_longitude: longitude !== null && longitude !== '' ? Number(longitude) : null,
                p_wifi_ssid: wifiSsid,
                p_wifi_password: wifiPassword,
                p_working_hours: workingHours,
                p_current_password: currentPassword,
                p_new_password: newPassword,
                p_employee_code: employeeCode,
                p_employee_name: employeeName,
                p_employee_pin: employeePin,
                p_linked_member_code: linkedMemberCode ? Number(linkedMemberCode) : null,
                p_max_tx_limit: maxTxLimit !== null && maxTxLimit !== '' ? Number(maxTxLimit) : null,
                p_employee_id: employeeId,
                p_branch_id: branchId,
                p_media_patch: resolvedMediaPatch
            });
        },

        async toggleMerchantPause({ merchantId, note = null, sessionToken = null }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            const cleanNote = note ? String(note).trim() : null;
            const pausePatch = cleanNote ? { pause_reason: cleanNote } : null;
            return await callRpc('manage_merchant_cashier_and_settings', {
                p_merchant_id: merchantId,
                p_action: 'toggle_merchant_pause',
                p_session_token: tok,
                p_working_hours: cleanNote,
                p_media_patch: pausePatch
            });
        },

        async merchantInitiateTopup({
            merchantId,
            amount,
            provider = 'bank_transfer',
            paymentRef = null,
            idempotencyKey = null,
            sessionToken = null,
            receiptImageData = null,
            receiptNote = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_initiate_topup', {
                p_merchant_id: merchantId,
                p_amount: Number(amount),
                p_provider: provider,
                p_payment_ref: paymentRef,
                p_idempotency_key: idempotencyKey || generateIdempotencyKey(),
                p_session_token: tok,
                p_receipt_image_data: receiptImageData || null,
                p_receipt_note: receiptNote || null
            });
        },

        async merchantShiftClosingGuarded({
            merchantId,
            branchId = null,
            periodFilter = 'today',
            exportFormat = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_shift_closing_guarded', {
                p_merchant_id: merchantId,
                p_session_token: tok,
                p_branch_id: branchId,
                p_period_filter: periodFilter,
                p_export_format: exportFormat
            });
        },

        async merchantSubmitFlashOfferGuarded({
            merchantId,
            title,
            body,
            discountHint = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_submit_flash_offer_guarded', {
                p_merchant_id: merchantId,
                p_title: title,
                p_body: body,
                p_discount_hint: discountHint,
                p_session_token: tok
            });
        },

        async merchantRadarDensityGuarded({
            merchantId,
            branchId = null,
            radiusKm = 3.0,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_radar_density_guarded', {
                p_merchant_id: merchantId,
                p_branch_id: branchId,
                p_radius_km: Number(radiusKm),
                p_session_token: tok
            });
        },

        async merchantProcessPosReturn({
            merchantId,
            transactionId,
            reason = null,
            idempotencyKey = null,
            sessionToken = null,
            mode = 'request_otp',
            otpCode = null,
            proofUrl = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_process_pos_return', {
                p_merchant_id: merchantId,
                p_transaction_id: transactionId,
                p_reason: reason || 'مرتجع فاتورة من نقطة البيع',
                p_idempotency_key: idempotencyKey || generateIdempotencyKey(),
                p_session_token: tok,
                p_mode: mode || 'request_otp',
                p_otp_code: otpCode,
                p_proof_url: proofUrl
            });
        },

        async getMerchantDashboardBundle({
            merchantId,
            shiftFilter = 'today',
            branchId = null,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('get_merchant_dashboard_bundle', {
                p_merchant_id: merchantId,
                p_session_token: tok,
                p_shift_filter: shiftFilter,
                p_branch_id: branchId
            });
        },

        // =====================================================================
        // Stage 6: Sovereign Admin Governance, Maker-Checker & Period Close RPCs
        // =====================================================================

        async authenticateAdminLogin({ email, password, totpCode = null }) {
            const res = await callRpc('authenticate_admin_login', {
                p_email: String(email || '').trim(),
                p_password: String(password || ''),
                p_totp_code: totpCode
            });
            if (!res || res.success === false || !res.session_token || !res.admin) {
                const err = new Error(res?.error_code || 'ADMIN_INVALID_CREDENTIALS');
                err.payload = res || null;
                throw err;
            }
            SawyanAPI.saveAdminSession(res.admin, res.session_token);
            return res;
        },

        async adminToggleKillSwitch({ adminId = null, sessionToken = null, switchKey, enabled, reason }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_toggle_kill_switch', {
                p_admin_id: adm,
                p_session_token: tok,
                p_switch_key: String(switchKey || '').trim().toUpperCase(),
                p_enabled: Boolean(enabled),
                p_reason: String(reason || '').trim()
            });
        },

        async adminManage2faPolicy({ adminId = null, sessionToken = null, action = 'list', targetAdminId = null, is2faExempt = null } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_2fa_policy', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action: action,
                p_target_admin_id: targetAdminId,
                p_is_2fa_exempt: is2faExempt
            });
        },

        async getAdminSovereignBundle({ adminId = null, periodYm = null, sessionToken = null } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('get_admin_sovereign_bundle', {
                p_admin_id: adm,
                p_session_token: tok,
                p_period_ym: periodYm
            });
        },

        async adminRunActuarialStressTestS06({
            adminId = null,
            sessionToken = null,
            countryCode = 'EG',
            monthlyTargetUsd = 24.75,
            companyPercent = 25.0,
            s01Gens = 11,
            s02Slots = 11,
            s03StopperUsd = 4605.75,
            simulatedMembers = 10000
        } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_run_actuarial_stress_test_s06', {
                p_admin_id: adm,
                p_session_token: tok,
                p_country_code: countryCode,
                p_monthly_target_usd: Number(monthlyTargetUsd),
                p_company_percent: Number(companyPercent),
                p_s01_gens: Number(s01Gens),
                p_s02_slots: Number(s02Slots),
                p_s03_stopper_usd: Number(s03StopperUsd),
                p_simulated_members: Number(simulatedMembers)
            });
        },

        async adminSubmitGovernanceRequest({
            adminId = null,
            sessionToken = null,
            actionType,
            targetEntity,
            targetId,
            payloadAfter,
            reason,
            payloadBefore = null,
            impactSimulation = null
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_submit_governance_request', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action_type: actionType,
                p_target_entity: targetEntity,
                p_target_id: String(targetId),
                p_payload_after: payloadAfter,
                p_reason: reason,
                p_payload_before: payloadBefore,
                p_impact_simulation: impactSimulation
            });
        },

        async adminDecideGovernanceRequest({
            adminId = null,
            sessionToken = null,
            requestId,
            decision,
            rejectionReason = null
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_decide_governance_request', {
                p_admin_id: adm,
                p_session_token: tok,
                p_request_id: requestId,
                p_decision: decision,
                p_rejection_reason: rejectionReason
            });
        },

        async adminExecutePeriodCloseWizard({
            adminId = null,
            sessionToken = null,
            countryCode = 'EG',
            periodYm,
            stepAction,
            checkerAdminId = null,
            ias21FxDeltaUsd = 0.0
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            const normCountry = (countryCode && String(countryCode).trim().toUpperCase() !== 'ALL')
                ? String(countryCode).trim().toUpperCase().slice(0, 2)
                : null;
            return await callRpc('admin_execute_period_close_wizard', {
                p_admin_id: adm,
                p_session_token: tok,
                p_country_code: normCountry,
                p_period_ym: periodYm,
                p_step_action: stepAction,
                p_checker_admin_id: checkerAdminId,
                p_ias21_fx_delta_usd: Number(ias21FxDeltaUsd)
            });
        },

        async adminOperationalDecision({
            adminId = null,
            sessionToken = null,
            domain,
            recordId,
            decision,
            notes = null,
            reversalPhase = 'in_month'
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_operational_decision', {
                p_admin_id: adm,
                p_session_token: tok,
                p_domain: domain,
                p_record_id: String(recordId),
                p_decision: decision,
                p_notes: notes,
                p_reversal_phase: reversalPhase
            });
        },

        // =====================================================================
        // Stage 7: End-to-End Operational Completeness RPCs (Gaps 1–12)
        // =====================================================================

        async getPublicActiveCountriesAndCities() {
            return await callRpc('get_public_active_countries_and_cities', {});
        },

        async searchGeonamesLocations({
            countryCode = 'EG',
            query = '',
            admin1Filter = null,
            kind = 'all',
            limit = 60
        } = {}) {
            return await callRpc('search_geonames_locations', {
                p_country_code: String(countryCode || 'EG').toUpperCase(),
                p_query: query ? String(query).trim() : '',
                p_admin1_filter: admin1Filter ? String(admin1Filter).trim() : null,
                p_kind: kind || 'all',
                p_limit: Number(limit) || 60
            });
        },

        async verifyRootInviteToken(token) {
            return await callRpc('verify_root_invite_token', {
                p_token: String(token || '').trim()
            });
        },

        async adminManageCountryCities({
            adminId = null,
            sessionToken = null,
            action = 'list',
            countryCode,
            cityNameAr = null,
            cityNameEn = null,
            geonameId = null
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_country_cities', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action: action,
                p_country_code: countryCode,
                p_city_name_ar: cityNameAr,
                p_city_name_en: cityNameEn,
                p_geoname_id: geonameId ? Number(geonameId) : null
            });
        },

        async adminManageRootLeaders({
            adminId = null,
            sessionToken = null,
            action = 'list',
            leaderName = null,
            leaderPhone = null,
            countryCode = 'EG',
            initialPassword = null,
            leaderEmail = null,
            tokenToRevoke = null
        } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_root_leaders', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action: action,
                p_leader_name: leaderName,
                p_leader_phone: leaderPhone,
                p_country_code: countryCode,
                p_initial_password: initialPassword,
                p_leader_email: leaderEmail,
                p_token_to_revoke: tokenToRevoke
            });
        },

        async adminManageStaffAccounts({
            adminId = null,
            sessionToken = null,
            action = 'list',
            targetId = null,
            fullName = null,
            email = null,
            role = null,
            password = null,
            countryScope = 'GLOBAL',
            phone = null
        } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_staff_accounts', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action: action,
                p_target_id: targetId,
                p_full_name: fullName,
                p_email: email,
                p_role: role,
                p_password: password,
                p_country_scope: countryScope,
                p_phone: phone || null
            });
        },

        async submitSupportOrRecoveryTicket({
            requesterType = 'public',
            category = 'general',
            subject,
            message,
            contactName = null,
            contactPhone = null,
            contactEmail = null,
            requesterId = null,
            sessionToken = null
        }) {
            return await callRpc('submit_support_or_recovery_ticket', {
                p_requester_type: requesterType,
                p_category: category,
                p_subject: subject,
                p_message: message,
                p_contact_name: contactName,
                p_contact_phone: contactPhone,
                p_contact_email: contactEmail,
                p_requester_id: requesterId,
                p_session_token: sessionToken || null
            });
        },

        async getMySupportTickets({ actorType, actorId, sessionToken }) {
            return await callRpc('get_my_support_tickets', {
                p_actor_type: actorType,
                p_actor_id: actorId,
                p_session_token: sessionToken
            });
        },

        async adminResetUserPassword({
            adminId = null,
            sessionToken = null,
            userType,
            userIdentifier,
            tempPassword,
            reason = 'استعادة موثقة عبر التحقق من ملكية الهاتف'
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_reset_user_password', {
                p_admin_id: adm,
                p_session_token: tok,
                p_user_type: userType,
                p_user_identifier: String(userIdentifier || '').trim(),
                p_temp_password: tempPassword,
                p_reason: reason
            });
        },

        async changeOwnPassword({ actorType, actorId, sessionToken, oldPassword, newPassword }) {
            return await callRpc('change_own_password', {
                p_actor_type: actorType,
                p_actor_id: actorId,
                p_session_token: sessionToken,
                p_old_password: oldPassword,
                p_new_password: newPassword
            });
        },

        async adminDecideWithdrawalV3({
            adminId = null,
            sessionToken = null,
            walletTxId,
            decision,
            payoutRef = null,
            rejectReason = null
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_decide_withdrawal_v3', {
                p_admin_id: adm,
                p_session_token: tok,
                p_wallet_tx_id: walletTxId,
                p_decision: decision,
                p_payout_ref: payoutRef,
                p_reject_reason: rejectReason
            });
        },

        async submitMemberKycOrResidencyMove({
            memberId,
            sessionToken = null,
            requestKind = 'kyc_verification',
            legalFullName,
            documentType = 'national_id',
            documentNumber,
            documentImageData = null,
            targetCountryCode = null
        }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('submit_member_kyc_or_residency_move', {
                p_member_id: memberId,
                p_session_token: tok,
                p_request_kind: requestKind,
                p_legal_full_name: legalFullName,
                p_document_type: documentType,
                p_document_number: documentNumber,
                p_document_image_data: documentImageData,
                p_target_country_code: targetCountryCode
            });
        },

        async adminReviewKycOrResidency({
            adminId = null,
            sessionToken = null,
            memberId,
            reviewType = 'kyc',
            decision,
            notes = null
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_review_kyc_or_residency', {
                p_admin_id: adm,
                p_session_token: tok,
                p_member_id: memberId,
                p_review_type: reviewType,
                p_decision: decision,
                p_notes: notes
            });
        },

        async merchantManageBranchesAndRefunds({
            merchantId,
            sessionToken = null,
            action = 'list_branches',
            payload = {}
        }) {
            const tok = sessionToken || SawyanAPI.getMerchantSessionToken();
            return await callRpc('merchant_manage_branches_and_refunds', {
                p_merchant_id: merchantId,
                p_session_token: tok,
                p_action: action,
                p_payload: payload
            });
        },

        async adminManageMerchantContract({
            adminId = null,
            sessionToken = null,
            merchantId,
            action = 'update_contract',
            deductionPercent = null,
            category = null,
            creditLimit = null,
            isActive = null,
            isIsolated = null,
            topupAmountLocal = null,
            topupBankRef = null,
            topupProofNotifId = null,
            reason = 'تحديث تعاقدي معتمد من إدارة علاقات التجار',
            onboardingStatus = null,
            governanceStatus = null,
            unsecuredQueueCapOverride = null,
            clearQueueCapOverride = false,
            isolatePctOverride = null,
            clearIsolatePctOverride = false,
            deferredSettlementCutoffTime = null,
            clearCutoffTime = false,
            onboardingNotes = null,
            d4CycleDaysOverride = null,
            clearD4CycleDays = false,
            d4GraceHoursOverride = null,
            clearD4GraceHours = false,
            d4DisableTimeTrigger = null
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_merchant_contract', {
                p_admin_id: adm,
                p_session_token: tok,
                p_merchant_id: merchantId,
                p_action: action,
                p_deduction_percent: deductionPercent !== null && deductionPercent !== '' ? Number(deductionPercent) : null,
                p_category: category,
                p_credit_limit: creditLimit !== null && creditLimit !== '' ? Number(creditLimit) : null,
                p_is_active: isActive,
                p_is_isolated: isIsolated,
                p_topup_amount_local: topupAmountLocal !== null && topupAmountLocal !== '' ? Number(topupAmountLocal) : null,
                p_topup_bank_ref: topupBankRef,
                p_topup_proof_notif_id: topupProofNotifId,
                p_reason: reason,
                p_onboarding_status: onboardingStatus || null,
                p_governance_status: governanceStatus || null,
                p_unsecured_queue_cap_override: unsecuredQueueCapOverride !== null && unsecuredQueueCapOverride !== '' ? Number(unsecuredQueueCapOverride) : null,
                p_clear_queue_cap_override: Boolean(clearQueueCapOverride),
                p_isolate_pct_override: isolatePctOverride !== null && isolatePctOverride !== '' ? Number(isolatePctOverride) : null,
                p_clear_isolate_pct_override: Boolean(clearIsolatePctOverride),
                p_deferred_settlement_cutoff_time: deferredSettlementCutoffTime || null,
                p_clear_cutoff_time: Boolean(clearCutoffTime),
                p_onboarding_notes: onboardingNotes !== undefined ? onboardingNotes : null,
                p_d4_cycle_days_override: d4CycleDaysOverride !== null && d4CycleDaysOverride !== '' ? Number(d4CycleDaysOverride) : null,
                p_clear_d4_cycle_days: Boolean(clearD4CycleDays),
                p_d4_grace_hours_override: d4GraceHoursOverride !== null && d4GraceHoursOverride !== '' ? Number(d4GraceHoursOverride) : null,
                p_clear_d4_grace_hours: Boolean(clearD4GraceHours),
                p_d4_disable_time_trigger: d4DisableTimeTrigger === null || d4DisableTimeTrigger === undefined ? null : Boolean(d4DisableTimeTrigger)
            });
        },

        async adminManageAcademyAndCategories({
            adminId = null,
            sessionToken = null,
            domain = 'academy',
            action = 'list',
            payload = {}
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_academy_and_categories', {
                p_admin_id: adm,
                p_session_token: tok,
                p_domain: domain,
                p_action: action,
                p_payload: payload
            });
        },

        async adminManageAcademyLms({
            adminId = null,
            sessionToken = null,
            entity = 'lesson',
            action = 'list',
            payload = {}
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_manage_academy_lms', {
                p_admin_id: adm,
                p_session_token: tok,
                p_entity: entity,
                p_action: action,
                p_payload: payload
            });
        },

        async getMemberAcademyCatalog({
            memberId,
            sessionToken = null
        }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('get_member_academy_catalog', {
                p_member_id: memberId,
                p_session_token: tok
            });
        },

        async memberUpdateAcademyProgress({
            memberId,
            sessionToken = null,
            courseId,
            action = 'complete'
        }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('member_update_academy_progress', {
                p_member_id: memberId,
                p_session_token: tok,
                p_course_id: courseId,
                p_action: action
            });
        },

        parseAcademyMedia(rawUrl, mediaType = 'article') {
            const url = String(rawUrl || '').trim();
            if (!url) return { kind: 'empty', safeUrl: '', embedUrl: '' };
            if (!/^https:\/\/[^\s]+$/i.test(url)) return { kind: 'invalid', safeUrl: '', embedUrl: '' };

            let u;
            try {
                u = new URL(url);
            } catch (_e) {
                return { kind: 'invalid', safeUrl: '', embedUrl: '' };
            }
            const host = u.hostname.toLowerCase();
            const path = u.pathname || '';
            const cleanUrl = u.toString();

            // YouTube (youtube.com / m.youtube.com / youtu.be) -> privacy-enhanced embed
            if (host === 'youtu.be') {
                const vid = path.replace(/^\/+/, '').split('/')[0];
                if (/^[A-Za-z0-9_-]{6,20}$/.test(vid)) {
                    return { kind: 'youtube', safeUrl: cleanUrl, embedUrl: `https://www.youtube-nocookie.com/embed/${vid}?rel=0` };
                }
            }
            if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
                let vid = u.searchParams.get('v') || '';
                if (!vid && /^\/(embed|shorts)\/([A-Za-z0-9_-]{6,20})/.test(path)) {
                    vid = path.split('/')[2];
                }
                if (/^[A-Za-z0-9_-]{6,20}$/.test(vid)) {
                    return { kind: 'youtube', safeUrl: cleanUrl, embedUrl: `https://www.youtube-nocookie.com/embed/${vid}?rel=0` };
                }
            }

            // Vimeo
            if (host === 'vimeo.com' || host === 'player.vimeo.com') {
                const m = path.match(/\/(?:video\/)?([0-9]{5,15})(?:\/|$)/);
                if (m) {
                    return { kind: 'vimeo', safeUrl: cleanUrl, embedUrl: `https://player.vimeo.com/video/${m[1]}` };
                }
            }

            if (/\.(mp4|webm|mov)(\?|$)/i.test(path)) {
                return { kind: 'html5_video', safeUrl: cleanUrl, embedUrl: cleanUrl };
            }
            if (/\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(path) || mediaType === 'audio') {
                return { kind: 'html5_audio', safeUrl: cleanUrl, embedUrl: cleanUrl };
            }
            if (/\.pdf(\?|$)/i.test(path) || mediaType === 'pdf') {
                return { kind: 'pdf', safeUrl: cleanUrl, embedUrl: cleanUrl };
            }
            return { kind: 'link', safeUrl: cleanUrl, embedUrl: cleanUrl };
        },

        buildAcademyMediaPlayerHtml(rawUrl, mediaType = 'article') {
            const escH = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const parsed = SawyanAPI.parseAcademyMedia(rawUrl, mediaType);
            if (parsed.kind === 'youtube' || parsed.kind === 'vimeo') {
                return `<div class="acad-embed-box"><iframe src="${escH(parsed.embedUrl)}" title="Academy Training Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
            }
            if (parsed.kind === 'html5_video') {
                return `<div class="acad-embed-box"><video controls playsinline preload="metadata" src="${escH(parsed.safeUrl)}"></video></div>`;
            }
            if (parsed.kind === 'html5_audio') {
                return `<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin-bottom:12px;"><div style="font-size:0.8rem;font-weight:800;color:#0f172a;margin-bottom:6px;">🎧 مشغل المادة الصوتية</div><audio controls preload="metadata" style="width:100%;" src="${escH(parsed.safeUrl)}"></audio></div>`;
            }
            if (parsed.kind === 'pdf' || parsed.kind === 'link') {
                const lbl = parsed.kind === 'pdf' ? '📄 فتح / تحميل الملف التدريبي (PDF)' : '🔗 فتح المرفق التدريبي الآمن (HTTPS)';
                return `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><span style="font-size:0.84rem;font-weight:800;color:#065f46;">${lbl}</span><a href="${escH(parsed.safeUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">فتح الرابط ↗</a></div>`;
            }
            if (parsed.kind === 'invalid') {
                return `<div style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:10px;border-radius:10px;font-size:0.82rem;font-weight:700;margin-bottom:12px;">⚠️ الرابط غير صالح (يُقبل فقط روابط HTTPS الآمنة مثل YouTube أو Vimeo أو MP4/Audio/PDF).</div>`;
            }
            if (mediaType === 'video') {
                return `<div style="background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:12px;padding:14px;text-align:center;color:#475569;font-size:0.84rem;margin-bottom:12px;">🎬 <b>مادة مرئية تأسيسية</b> — اقرأ الشرح المنظّم بالأسفل (ويمكن للإدارة إرفاق رابط YouTube / Vimeo / MP4 في أي وقت لتشغيله هنا مباشرة).</div>`;
            }
            return '';
        },

        async getLeader10GenFollowupRadar({
            memberId,
            sessionToken = null,
            filterMode = 'all'
        }) {
            const tok = sessionToken || SawyanAPI.getMemberSessionToken();
            return await callRpc('get_leader_10gen_followup_radar', {
                p_member_id: memberId,
                p_session_token: tok,
                p_filter_mode: filterMode
            });
        },

        async adminSearchAndReplyOps({
            adminId = null,
            sessionToken = null,
            action = 'search',
            entity = 'members',
            query = null,
            recordId = null,
            replyText = null,
            newStatus = 'closed'
        }) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('admin_search_and_reply_ops', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action: action,
                p_entity: entity,
                p_query: query,
                p_record_id: recordId,
                p_reply_text: replyText,
                p_new_status: newStatus
            });
        },

        async getAdminFullTree({
            adminId = null,
            sessionToken = null,
            rootMemberCode = 0,
            periodYm = null,
            countryCode = null,
            maxDepth = 15
        } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            return await callRpc('get_admin_full_tree', {
                p_admin_id: adm,
                p_session_token: tok,
                p_root_member_code: Number(rootMemberCode || 0),
                p_period_ym: periodYm || null,
                p_country_code: countryCode || null,
                p_max_depth: Number(maxDepth || 15)
            });
        },

        async getRegistrationFormConfig(formType = null) {
            return await callRpc('get_registration_form_config', {
                p_form_type: formType || null
            });
        },

        async lookupOnboarderByCode(memberCode) {
            const codeNum = (memberCode !== null && memberCode !== undefined && memberCode !== '') ? Number(memberCode) : null;
            return await callRpc('lookup_onboarder_by_code', {
                p_member_code: codeNum
            });
        },

        async adminManageRegistrationFields({
            adminId = null,
            sessionToken = null,
            action = 'list',
            formType = null,
            fields = null,
            settings = null
        } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id);
            const tok = sessionToken || SawyanAPI.getAdminSessionToken();
            const fPayload = fields || null;
            const sPayload = settings || null;
            return await callRpc('admin_manage_registration_fields', {
                p_admin_id: adm,
                p_session_token: tok,
                p_action: action,
                p_form_type: formType || null,
                p_fields: fPayload,
                p_settings: sPayload
            });
        },

        async getAnonymizedMembersMapPins({
            centerLat,
            centerLng,
            radiusKm = 25,
            countryCode = null,
            merchantId = null,
            adminId = null,
            sessionToken = null
        } = {}) {
            const adm = adminId || (SawyanAPI.getSavedAdmin() && SawyanAPI.getSavedAdmin().id) || null;
            const tok = sessionToken || SawyanAPI.getAdminSessionToken() || SawyanAPI.getMerchantSessionToken() || null;
            return await callRpc('get_anonymized_members_map_pins', {
                p_center_lat: Number(centerLat),
                p_center_lng: Number(centerLng),
                p_radius_km: Number(radiusKm || 25),
                p_country_code: countryCode || null,
                p_merchant_id: merchantId || null,
                p_admin_id: adm,
                p_session_token: tok
            });
        },

        getSiblingEnvironmentUrl() {
            if (typeof window === 'undefined') return '#';
            const loc = window.location;
            const p = loc.pathname || '/';
            if (p.includes('/preview/')) {
                return p.replace('/preview/', '/') + (loc.search || '');
            }
            // على الموقع الأصلي: أضف preview/ بعد مجلد المستودع (GitHub Pages /bank/ أو الجذر المحلي /)
            const parts = p.split('/');
            const idxBank = parts.indexOf('bank');
            if (idxBank !== -1) {
                const head = parts.slice(0, idxBank + 1).join('/');
                const tail = parts.slice(idxBank + 1).join('/');
                return `${head}/preview/${tail}` + (loc.search || '');
            }
            return '/preview/' + p.replace(/^\/+/, '') + (loc.search || '');
        },

        rewriteProductionDemoLinks() {
            if (typeof document === 'undefined' || SawyanAPI.isDemoMode()) return;
            try {
                const links = document.querySelectorAll('a[href*="quick=member"], a[href*="quick=merchant"], a.demo-link');
                links.forEach((a) => {
                    const raw = a.getAttribute('href') || '';
                    if (!raw || raw.startsWith('#') || raw.includes('/preview/')) return;
                    const u = new URL(raw, window.location.href);
                    if (u.pathname.includes('/preview/')) return;
                    const parts = u.pathname.split('/');
                    const idxBank = parts.indexOf('bank');
                    let nextPath;
                    if (idxBank !== -1) {
                        const head = parts.slice(0, idxBank + 1).join('/');
                        const tail = parts.slice(idxBank + 1).join('/');
                        nextPath = `${head}/preview/${tail}`;
                    } else {
                        nextPath = '/preview/' + u.pathname.replace(/^\/+/, '');
                    }
                    a.setAttribute('href', nextPath + (u.search || '') + (u.hash || ''));
                });
            } catch (_e) {}
        },

        async markActorNotificationsRead({ actorType, actorId, sessionToken = null, notificationId = null }) {
            const type = String(actorType || '').toLowerCase().trim();
            const tok = sessionToken || (
                type === 'admin' ? SawyanAPI.getAdminSessionToken() :
                type === 'merchant' ? SawyanAPI.getMerchantSessionToken() :
                SawyanAPI.getMemberSessionToken()
            );
            return await callRpc('mark_actor_notifications_read', {
                p_actor_type: type,
                p_actor_id: actorId,
                p_session_token: tok,
                p_notification_id: notificationId || null
            });
        },

        mountEnvironmentSwitchBar() {
            if (typeof document === 'undefined' || document.getElementById('sawyanEnvRibbon')) return;
            SawyanAPI.rewriteProductionDemoLinks();
            const isDemo = SawyanAPI.isDemoMode();
            const pathNow = String(window.location.pathname || '').toLowerCase();
            const isMemberPortal = pathNow.includes('/member-dashboard/');
            const isMerchantPortal = pathNow.includes('/merchant-dashboard/');
            const isAdminPortal = pathNow.includes('/admin-dashboard/');

            // On Production public pages, visitors see the dedicated top trust & nav bars — never an internal env bar
            if (!isDemo && !isMemberPortal && !isMerchantPortal && !isAdminPortal) return;
            // On Production member/merchant auth pages (login, register, forgot-password), the branded .auth-top-nav header serves as the top bar
            if (!isDemo && (isMemberPortal || isMerchantPortal) && !pathNow.includes('dashboard.html')) return;

            const bar = document.createElement('div');
            bar.id = 'sawyanEnvRibbon';

            const syncLayoutBelowRibbon = () => {
                const h = bar.offsetHeight || 34;
                if (document.documentElement) {
                    document.documentElement.style.setProperty('--sawyan-ribbon-h', h + 'px');
                }
                if (document.body) {
                    document.body.style.paddingTop = h + 'px';
                }
                const sb = document.querySelector('.sidebar');
                if (sb && typeof window !== 'undefined') {
                    const st = window.getComputedStyle(sb);
                    if (st.position === 'fixed') {
                        sb.style.top = h + 'px';
                        sb.style.height = `calc(100vh - ${h}px)`;
                    }
                }
            };

            if (!isDemo && (isMemberPortal || isMerchantPortal)) {
                bar.style.cssText = 'background:linear-gradient(90deg,#064e3b 0%,#065f46 100%);color:#ecfdf5;font-family:Tajawal,sans-serif;font-size:12px;font-weight:700;padding:6px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1.5px solid #10b981;position:fixed;top:0;left:0;right:0;width:100%;box-sizing:border-box;z-index:9999;';

                if (isMemberPortal) {
                    const mem = SawyanAPI.getSavedMember();
                    const identityWrap = document.createElement('span');
                    identityWrap.id = 'sawyanMemberRibbonIdentity';
                    identityWrap.style.cssText = 'display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;color:#ffffff !important;font-weight:800;';

                    if (mem && mem.member_code) {
                        const greet = document.createElement('span');
                        greet.id = 'sawyanMemberRibbonGreeting';
                        greet.textContent = `👋 أهلاً، ${mem.full_name || 'عضو SAWYAN'}`;
                        const badge = document.createElement('span');
                        badge.style.cssText = 'background:rgba(16,185,129,0.22);border:1px solid rgba(52,211,153,0.5);color:#a7f3d0;padding:2px 9px;border-radius:999px;font-size:11px;white-space:nowrap;';
                        badge.textContent = `عضوية #${mem.member_code}`;
                        identityWrap.appendChild(greet);
                        identityWrap.appendChild(badge);
                        bar.appendChild(identityWrap);

                        if (pathNow.includes('dashboard.html')) {
                            const actions = document.createElement('div');
                            actions.style.cssText = 'display:inline-flex;align-items:center;gap:6px;flex-shrink:0;';

                            const pillCss = 'background:rgba(255,255,255,0.14);color:#ffffff;padding:3px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.34);white-space:nowrap;font-family:Tajawal,sans-serif;font-size:11.5px;font-weight:800;cursor:pointer;';

                            const qrBtn = document.createElement('button');
                            qrBtn.type = 'button';
                            qrBtn.textContent = '📷 كود QR';
                            qrBtn.style.cssText = pillCss;
                            qrBtn.onclick = () => {
                                if (typeof window.goToPage === 'function') window.goToPage('home');
                                setTimeout(() => {
                                    const el = document.getElementById('qrCode');
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 80);
                            };

                            const merchBtn = document.createElement('button');
                            merchBtn.type = 'button';
                            merchBtn.textContent = '🏪 التجار';
                            merchBtn.style.cssText = pillCss;
                            merchBtn.onclick = () => {
                                if (typeof window.goToPage === 'function') window.goToPage('merchants');
                            };

                            actions.appendChild(qrBtn);
                            actions.appendChild(merchBtn);
                            bar.appendChild(actions);
                        }
                    } else {
                        identityWrap.textContent = '🌿 SAWYAN • منصة الاستهلاك الاستثماري العالمية';
                        bar.appendChild(identityWrap);
                    }
                } else {
                    const mer = SawyanAPI.getSavedMerchant();
                    const merchSpan = document.createElement('span');
                    merchSpan.style.cssText = 'color:#ffffff !important;font-weight:800;';
                    merchSpan.textContent = (mer && (mer.business_name || mer.merchant_code))
                        ? `🏪 ${mer.business_name || 'تاجر SAWYAN'}${mer.merchant_code ? ` • كود ${mer.merchant_code}` : ''}`
                        : '🏪 بوابة التاجر • SAWYAN';
                    bar.appendChild(merchSpan);
                }
            } else {
                const targetUrl = SawyanAPI.getSiblingEnvironmentUrl();
                bar.style.cssText = isDemo
                    ? 'background:#78350f;color:#fef3c7;font-family:Tajawal,sans-serif;font-size:12px;font-weight:700;padding:5px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:2px solid #f59e0b;position:fixed;top:0;left:0;right:0;width:100%;box-sizing:border-box;z-index:9999;'
                    : 'background:#064e3b;color:#d1fae5;font-family:Tajawal,sans-serif;font-size:12px;font-weight:700;padding:5px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:2px solid #10b981;position:fixed;top:0;left:0;right:0;width:100%;box-sizing:border-box;z-index:9999;';

                let sessionSuffix = '';
                if (isMemberPortal) {
                    const mem = SawyanAPI.getSavedMember();
                    if (mem && mem.member_code) sessionSuffix = ` • حساب عضو #${mem.member_code}`;
                } else if (isMerchantPortal) {
                    const mer = SawyanAPI.getSavedMerchant();
                    if (mer && mer.merchant_code) sessionSuffix = ` • حساب تاجر ${mer.merchant_code}`;
                } else if (isAdminPortal) {
                    const adm = SawyanAPI.getSavedAdmin();
                    if (adm && adm.role) {
                        const roleMapAr = {
                            approver: adm.is_sovereign_founder ? 'المؤسس السيادي' : 'سلطة اعتماد',
                            finance: 'إدارة مالية',
                            auditor: 'مدقّق',
                            reviewer: 'مراجع رقابي',
                            data_entry: 'مُدخل بيانات',
                            support: 'دعم فني',
                            kyc_officer: 'مسؤول KYC'
                        };
                        sessionSuffix = ` • بوابة الإدارة (${roleMapAr[adm.role] || adm.role})`;
                    }
                }

                const left = document.createElement('span');
                left.style.cssText = 'color:#ffffff !important;font-weight:800;';
                left.textContent = isDemo
                    ? `🧪 الموقع الموازي للتجربة (Sandbox — sawyan_demo)${sessionSuffix}`
                    : `🟢 الموقع الأصلي الحي (Production — SAWYAN)${sessionSuffix}`;

                const link = document.createElement('a');
                link.href = targetUrl;
                link.textContent = isDemo ? 'الانتقال إلى الموقع الأصلي (Production) ↗' : 'الانتقال إلى الموقع الموازي للتجربة (/preview/) ↗';
                link.style.cssText = 'background:rgba(255,255,255,0.16);color:#ffffff;padding:3px 10px;border-radius:999px;text-decoration:none;border:1px solid rgba(255,255,255,0.35);white-space:nowrap;';

                bar.appendChild(left);
                bar.appendChild(link);
            }

            if (document.body) {
                document.body.insertBefore(bar, document.body.firstChild);
                syncLayoutBelowRibbon();
                if (typeof window !== 'undefined') {
                    window.addEventListener('resize', syncLayoutBelowRibbon);
                    if (typeof ResizeObserver !== 'undefined') {
                        const ro = new ResizeObserver(() => syncLayoutBelowRibbon());
                        ro.observe(bar);
                    }
                    setTimeout(syncLayoutBelowRibbon, 250);
                }
            }
        }
    };

    global.SAWYAN = global.SAWYAN || {};
    global.SAWYAN.API = SawyanAPI;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => SawyanAPI.mountEnvironmentSwitchBar());
        } else {
            SawyanAPI.mountEnvironmentSwitchBar();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
