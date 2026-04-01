# Phase1→Phase2 差异映射表（旧名→新名）

| 旧名 | 新名 | 仍在使用文件 | 调用链/影响范围 | 结论 |
|---|---|---|---|---|
| `machines` | `kiosks` | `supabase/migrations/20240101000000_initial_schema.sql`、`supabase/migrations/20240103000000_phase1_score_validation.sql`、`apps/driver/src/lib/db.ts` | 历史迁移中仍有旧表；运行态主链已切到 `kiosks`。Dexie v3 显式删除 `machines` 本地 store。 | 历史兼容残留，非主路径。 |
| `machine_onboardings` | `kiosk_onboarding_records` | `supabase/migrations/20240101000000_initial_schema.sql`、`supabase/migrations/20240102000000_phase1_kiosk_adjustments.sql`、`apps/driver/src/lib/db.ts` | 历史迁移/本地旧 store 清理仍可见；线上使用 `kiosk_onboarding_records`。 | 已迁移，需保留映射认知。 |
| `daily_settlements` | `daily_driver_reconciliations` | `supabase/migrations/20240101000000_initial_schema.sql`、`supabase/migrations/20240104000000_phase1_complete_schema.sql` | 旧日结表在历史迁移中出现，主链已改为 `submit_daily_reconciliation/confirm_daily_reconciliation` + 新表。 | 已迁移，历史脚本仍需维护。 |

## 受影响页面（负向检测）
- 本次扫描未发现前端页面直接使用 `machines/machine_onboardings/daily_settlements` 旧名；旧名主要位于历史 migration 与 Dexie 旧版本删除逻辑。  
- driver 端当前余额 UI 差异（非旧名问题）：`HomePage`/`ReconciliationPage` 尚未提供独立 Wallet Card（coin/cash + 最近 confirmed），建议按 `docs/stage1_7_execution_tasks.md` 纳入 Stage 1（覆盖 UI + 本地缓存），Stage 5 专注 RLS/权限回归。 
