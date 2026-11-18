// ============================================================================
// SAWYAN ECOSYSTEM — V3.0 UNIFIED DUAL-ENVIRONMENT SUPABASE CONFIG (D10)
// Single Codebase Auto-Routing:
//   - Original Production Site (root / member / merchant / admin) -> schema: 'sawyan'
//   - Parallel Demo Site (/preview/ or ?env=demo)                  -> schema: 'sawyan_demo'
// ============================================================================

(function bootstrapSawyanSupabaseConfig() {
    const pathname = typeof window !== 'undefined' ? (window.location.pathname || '') : '';
    const search = typeof window !== 'undefined' ? (window.location.search || '') : '';

    const isParallelDemo = pathname.includes('/preview/') || search.includes('env=demo');
    const activeSchema = isParallelDemo ? 'sawyan_demo' : 'sawyan';

    const SUPABASE_CONFIG = {
        url: 'https://dssspiossqgroefmvnql.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzc3NwaW9zc3Fncm9lZm12bnFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMzUxMDAsImV4cCI6MjA4MDcxMTEwMH0.6c6q77dBnQE49_sC1FxH-0ajP0Q8_RBlxw64fAR4ATQ',
        schema: activeSchema,
        isParallelDemo: isParallelDemo,
        ENVIRONMENT: isParallelDemo ? 'staging_demo' : 'production',
        SECURITY: {
            REQUIRE_STRONG_PASSWORD: true,
            ENABLE_OTP_VERIFICATION: !isParallelDemo,
            REQUIRE_EMAIL_VERIFICATION: false,
            REQUIRE_ADMIN_2FA: true,
            MAX_LOGIN_ATTEMPTS: 5,
            SESSION_TIMEOUT_MINS: 30
        }
    };

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.config = SUPABASE_CONFIG;
    window.SAWYAN.isParallelDemo = isParallelDemo;
    window.SAWYAN.schema = activeSchema;

    function initSupabase() {
        window.__sawyanSupabaseRetries = (window.__sawyanSupabaseRetries || 0) + 1;
        if (typeof window.supabase === 'undefined') {
            if (window.__sawyanSupabaseRetries <= 10) {
                setTimeout(initSupabase, 150);
            }
            return;
        }

        const supabaseClient = window.supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey,
            {
                db: {
                    schema: SUPABASE_CONFIG.schema
                }
            }
        );

        window.SAWYAN.supabase = supabaseClient;
        console.log(`✅ SAWYAN Supabase initialized [env=${SUPABASE_CONFIG.ENVIRONMENT}, schema=${SUPABASE_CONFIG.schema}]`);
    }

    initSupabase();
})();
