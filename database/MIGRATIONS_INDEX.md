# SAWYAN V3.0 — Canonical SQL Migrations & Function Ownership Registry

- **Total Ordered SQL Files:** `26` (`01` → `25`)
- **Total Distinct `sawyan.*` Functions:** `134`
- **Functions Redefined Across Multiple Files:** `36` (always edit ONLY the Canonical Final Owner file or author a new numbered migration `26+`)

## 1. Ordered Migration Sequence
| # | Migration File | Purpose |
|---|---|---|
| 01 | `01_schema_and_43_tables.sql` | Canonical sequential migration |
| 02 | `02_core_functions_and_triggers.sql` | Canonical sequential migration |
| 03 | `03_seed_coa_countries_and_demo.sql` | Canonical sequential migration |
| 04 | `03b_seed_demo_tree_48_members.sql` | Canonical sequential migration |
| 05 | `04_rls_and_grants.sql` | Canonical sequential migration |
| 06 | `05_stage3_api_payment_and_shift_rpcs.sql` | Canonical sequential migration |
| 07 | `06_stage4_member_and_portal_rpcs.sql` | Canonical sequential migration |
| 08 | `07_remediation_security_and_settlement_patch.sql` | Canonical sequential migration |
| 09 | `08_stage5_merchant_pos_and_portal_rpcs.sql` | Canonical sequential migration |
| 10 | `09_stage6_admin_governance_and_launch_rpcs.sql` | Canonical sequential migration |
| 11 | `10_stage7_operational_completeness_rpcs.sql` | Canonical sequential migration |
| 12 | `11_migration_zero_liability_d5.sql` | Canonical sequential migration |
| 13 | `12_stage8_academy_lms_foundation.sql` | Canonical sequential migration |
| 14 | `13_seed_all_world_countries.sql` | Canonical sequential migration |
| 15 | `14_geonames_search_rpc.sql` | Canonical sequential migration |
| 16 | `15_admin_full_tree_rpc.sql` | Canonical sequential migration |
| 17 | `16_registration_form_builder_governance.sql` | Canonical sequential migration |
| 18 | `17_merchant_lifecycle_3axis_governance.sql` | Canonical sequential migration |
| 19 | `18_launch_hardening_auth_and_ux_rpcs.sql` | Canonical sequential migration |
| 20 | `19_unified_verification_and_employee_portal.sql` | Canonical sequential migration |
| 21 | `20_unified_push_notifications.sql` | Canonical sequential migration |
| 22 | `21_phase0_security_hardening.sql` | Canonical sequential migration |
| 23 | `22_phase1_ledger_sessions_and_cron.sql` | Canonical sequential migration |
| 24 | `23_phase2_adaptive_tree_rpc.sql` | Phase 2 Adaptive Lazy Subtree RPC + Tree Pulse |
| 25 | `24_phase4_admin_tree_avatars.sql` | Phase 4C Admin Full Tree RPC `avatar_url` Upgrade |
| 26 | `25_stage17_onboarding_notifs_d4_fixes.sql` | Stage 17 Bi-Directional Live Notifications (Admin/Merchant Bells), D4 Cycle Fix, Self-Purchase Guard & Optional Onboarding Defaults |

## 2. Redefined Function Canonical Ownership Table (Single Source of Truth)
| Function (`sawyan.*`) | Definitions Count | Canonical Final Owner | Previous Files |
|---|---:|---|---|
| `admin_decide_governance_request` | 3 | **`19_unified_verification_and_employee_portal.sql`** | `09_stage6_admin_governance_and_launch_rpcs.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `admin_manage_merchant_contract` | 3 | **`17_merchant_lifecycle_3axis_governance.sql`** | `10_stage7_operational_completeness_rpcs.sql`, `16_registration_form_builder_governance.sql` |
| `admin_manage_staff_accounts` | 2 | **`16_registration_form_builder_governance.sql`** | `10_stage7_operational_completeness_rpcs.sql` |
| `admin_operational_decision` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `09_stage6_admin_governance_and_launch_rpcs.sql` |
| `admin_search_and_reply_ops` | 3 | **`18_launch_hardening_auth_and_ux_rpcs.sql`** | `10_stage7_operational_completeness_rpcs.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `authenticate_admin_login` | 3 | **`21_phase0_security_hardening.sql`** | `09_stage6_admin_governance_and_launch_rpcs.sql`, `18_launch_hardening_auth_and_ux_rpcs.sql` |
| `authenticate_member_login` | 2 | **`18_launch_hardening_auth_and_ux_rpcs.sql`** | `06_stage4_member_and_portal_rpcs.sql` |
| `authenticate_merchant_login` | 3 | **`18_launch_hardening_auth_and_ux_rpcs.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `cancel_member_pending_purchase` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `06_stage4_member_and_portal_rpcs.sql` |
| `check_price_gouging_trigger` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `01_schema_and_43_tables.sql` |
| `confirm_or_reject_pending_tx` | 3 | **`19_unified_verification_and_employee_portal.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `decide_maker_checker_request` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `05_stage3_api_payment_and_shift_rpcs.sql` |
| `employee_lock_session` | 2 | **`21_phase0_security_hardening.sql`** | `19_unified_verification_and_employee_portal.sql` |
| `feed_monthly_target_box` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `02_core_functions_and_triggers.sql` |
| `get_admin_full_tree` | 2 | **`24_phase4_admin_tree_avatars.sql`** | `15_admin_full_tree_rpc.sql` |
| `get_merchant_dashboard_bundle` | 5 | **`19_unified_verification_and_employee_portal.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql`, `16_registration_form_builder_governance.sql`, `17_merchant_lifecycle_3axis_governance.sql`, `18_launch_hardening_auth_and_ux_rpcs.sql` |
| `get_merchants_radar` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `02_core_functions_and_triggers.sql` |
| `get_public_merchants_catalog` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `06_stage4_member_and_portal_rpcs.sql` |
| `lookup_sponsor_by_code` | 2 | **`18_launch_hardening_auth_and_ux_rpcs.sql`** | `05_stage3_api_payment_and_shift_rpcs.sql` |
| `manage_merchant_cashier_and_settings` | 4 | **`19_unified_verification_and_employee_portal.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql`, `16_registration_form_builder_governance.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `merchant_initiate_topup` | 2 | **`18_launch_hardening_auth_and_ux_rpcs.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql` |
| `merchant_manage_branches_and_refunds` | 2 | **`22_phase1_ledger_sessions_and_cron.sql`** | `10_stage7_operational_completeness_rpcs.sql` |
| `process_merchant_topup_fifo` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `02_core_functions_and_triggers.sql` |
| `register_new_member` | 3 | **`16_registration_form_builder_governance.sql`** | `06_stage4_member_and_portal_rpcs.sql`, `10_stage7_operational_completeness_rpcs.sql` |
| `register_new_merchant` | 3 | **`17_merchant_lifecycle_3axis_governance.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql`, `16_registration_form_builder_governance.sql` |
| `seed_default_registration_configs` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `16_registration_form_builder_governance.sql` |
| `submit_member_pending_purchase` | 4 | **`19_unified_verification_and_employee_portal.sql`** | `06_stage4_member_and_portal_rpcs.sql`, `16_registration_form_builder_governance.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `submit_merchant_flash_offer` | 2 | **`17_merchant_lifecycle_3axis_governance.sql`** | `05_stage3_api_payment_and_shift_rpcs.sql` |
| `submit_pos_transaction` | 3 | **`19_unified_verification_and_employee_portal.sql`** | `02_core_functions_and_triggers.sql`, `17_merchant_lifecycle_3axis_governance.sql` |
| `update_member_profile_settings` | 2 | **`16_registration_form_builder_governance.sql`** | `06_stage4_member_and_portal_rpcs.sql` |
| `verify_admin_session` | 2 | **`21_phase0_security_hardening.sql`** | `09_stage6_admin_governance_and_launch_rpcs.sql` |
| `verify_member_session` | 3 | **`22_phase1_ledger_sessions_and_cron.sql`** | `06_stage4_member_and_portal_rpcs.sql`, `21_phase0_security_hardening.sql` |
| `verify_merchant_session` | 4 | **`22_phase1_ledger_sessions_and_cron.sql`** | `08_stage5_merchant_pos_and_portal_rpcs.sql`, `17_merchant_lifecycle_3axis_governance.sql`, `21_phase0_security_hardening.sql` |

## 3. Production vs Demo Environment Separation Runbook (`C6`)
- **Current State:** `sawyan` (Production) and `sawyan_demo` (Staging/Demo) reside in separate PostgreSQL schemas inside Supabase project `dssspiossqgroefmvnql` with separate session storage prefixes and zero cross-schema bypasses (hardened in `21` and `22`).
- **Target Launch Architecture (`C6`):** Before public financial scale-up, provision a dedicated second Supabase project for `sawyan_demo` (freeing or upgrading the paused `Rounds` slot on the organization) and point `preview/shared/config/supabase.js` demo routing to the separate project URL + anon key so Demo & Production share zero database compute, quotas, or credentials.
