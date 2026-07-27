// ============================================
// SAWYAN BANK - Supabase Configuration
// ============================================

const SUPABASE_CONFIG = {
    url: 'https://dssspiossqgroefmvnql.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzc3NwaW9zc3Fncm9lZm12bnFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMzUxMDAsImV4cCI6MjA4MDcxMTEwMH0.6c6q77dBnQE49_sC1FxH-0ajP0Q8_RBlxw64fAR4ATQ',
    schema: 'sawyan', // Schema منفصل

    // إعدادات الأمان والبيئة (Smart Security Foundation)
    ENVIRONMENT: 'development', // 'development' or 'production'
    SECURITY: {
        REQUIRE_STRONG_PASSWORD: false, // true عند الإطلاق
        ENABLE_OTP_VERIFICATION: false, // true عند الإطلاق
        REQUIRE_EMAIL_VERIFICATION: false, // true عند الإطلاق
        MAX_LOGIN_ATTEMPTS: 10,
        SESSION_TIMEOUT_MINS: 60
    }
};

// الانتظار حتى يتم تحميل مكتبة Supabase
(function initSupabase() {
    // التحقق من تحميل المكتبة
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library not loaded yet. Retrying...');
        setTimeout(initSupabase, 100);
        return;
    }

    // تهيئة Supabase Client
    const supabaseClient = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
            db: {
                schema: SUPABASE_CONFIG.schema
            }
        }
    );

    // Export
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.supabase = supabaseClient;
    window.SAWYAN.config = SUPABASE_CONFIG;

    console.log('✅ SAWYAN Supabase initialized successfully');
})();
