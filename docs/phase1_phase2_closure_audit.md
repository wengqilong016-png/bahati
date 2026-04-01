# Phase1→Phase2 收尾集成审计报告（可执行差异版）

> 审计范围：`supabase/migrations`、`apps/driver`、`apps/boss`。  
> 审计基线日期：2026-04-01（UTC）。

## A. 发现摘要

1. **本次安全硬化已补齐**：新增 migration `20260401000300_score_reset_search_path_hardening.sql`，对 `approve_score_reset`、`reject_score_reset`、`handle_score_reset_approval` 执行 `CREATE OR REPLACE` 且显式 `SET search_path = public`，并附 `pg_proc.proconfig` 校验 SQL。  
2. **新旧表名并存于仓库**：业务主迁移已切换到 `kiosks/tasks/daily_driver_reconciliations/...`，但历史迁移与 Dexie 迁移注释仍保留 `machines/machine_onboardings/daily_settlements`。这是“历史兼容存在”，不是运行期主路径，但易造成理解偏差。  
3. **核心 Phase2 RPC 大多已定义 + SECURITY DEFINER + search_path**；但额外 RPC `driver_create_onboarding_bundle` 当前 **未声明 SECURITY DEFINER / 未显式 SET search_path**，属于权限模型不一致风险。  
4. **RLS/列权限已加固关键列**：`drivers.coin_balance/cash_balance` 直接 UPDATE 已对 authenticated 撤销；`merchants.retained_balance/debt_balance` 对 authenticated 撤销 SELECT，boss 通过 `read_merchant_balances()` 读取。  
5. **关键业务规则实现可定位**：首次日结 opening 公式、分红比例快照、任务结算状态流、余额负数保护均可在 migration 直接定位。  
6. **工程层风险仍在**：
   - `supabase/migrations` 下存在**相同时间戳文件名**（`20260401000200_*`）可能带来迁移顺序歧义；
   - Capacitor 版本漂移（脚本固定 CLI 6.2.1，但 devDependency 为 8.3.0）；
   - `tar` 告警路径来自 `@capacitor/assets` 依赖链，需升级与重锁。

---

## B. 差异映射表（旧名→新名）

| 旧名 | 新名 | 仍在使用位置 | 调用链/影响 |
|---|---|---|---|
| `machines` | `kiosks` | `supabase/migrations/20240101000000_initial_schema.sql`, `20240103000000_phase1_score_validation.sql`; `apps/driver/src/lib/db.ts`（v3 迁移删除旧 store）; `README.md` 映射说明 | 旧迁移历史可回放；运行期以 `kiosks` 为准。Dexie 升级时删除 `machines` 本地库。 |
| `machine_onboardings` | `kiosk_onboarding_records` | `20240101000000_initial_schema.sql`; `20240102000000_phase1_kiosk_adjustments.sql`; `apps/driver/src/lib/db.ts` | 旧历史结构，运行期以 `kiosk_onboarding_records` 为准。 |
| `daily_settlements` | `daily_driver_reconciliations` | `20240101000000_initial_schema.sql`; `20240104000000_phase1_complete_schema.sql`（drop 旧表注释）；`README.md` 映射说明 | 日结逻辑已迁移到 `submit_daily_reconciliation/confirm_daily_reconciliation` + 新表。 |

---

## C. RPC 签名表（函数名→参数→安全属性）

> 结论字段：✅=已定义；❌=未在 migrations 定义（缺失/需补齐）。

| 函数 | 参数（逐字） | 定义状态 | SECURITY DEFINER | `SET search_path=public` | 代码调用处 |
|---|---|---|---|---|---|
| `record_task_settlement` | `p_task_id UUID, p_dividend_method TEXT, p_exchange_amount NUMERIC DEFAULT 0, p_expense_amount NUMERIC DEFAULT 0, p_expense_note TEXT DEFAULT NULL` | ✅ | 是 | 是 | `apps/driver/src/lib/settlement.ts` |
| `submit_daily_reconciliation` | `p_date DATE, p_actual_coin_balance NUMERIC, p_actual_cash_balance NUMERIC, p_notes TEXT DEFAULT NULL, p_driver_id UUID DEFAULT NULL` | ✅ | 是 | 是 | `apps/driver/src/lib/reconciliation.ts` |
| `confirm_daily_reconciliation` | `p_reconciliation_id UUID` | ✅ | 是 | 是 | `apps/boss/src/pages/SettlementsPage.tsx` |
| `record_merchant_debt` | `p_merchant_id UUID, p_amount NUMERIC, p_debt_type TEXT, p_description TEXT DEFAULT NULL` | ✅ | 是 | 是 | 未检出前端直调（通常后台/管理端） |
| `record_retained_payout` | `p_merchant_id UUID, p_amount NUMERIC, p_description TEXT DEFAULT NULL` | ✅ | 是 | 是 | 未检出前端直调 |
| `offset_retained_to_debt` | `p_merchant_id UUID, p_amount NUMERIC, p_description TEXT DEFAULT NULL` | ✅ | 是 | 是 | 未检出前端直调 |
| `approve_score_reset` | `p_request_id UUID` | ✅ | 是 | 是（本次复写硬化） | `apps/boss/src/pages/ScoreResetApprovalsPage.tsx` |
| `reject_score_reset` | `p_request_id UUID, p_reason TEXT` | ✅ | 是 | 是（本次复写硬化） | `apps/boss/src/pages/ScoreResetApprovalsPage.tsx` |
| `manual_adjustment_driver` | `p_driver_id UUID, p_coin_adj NUMERIC DEFAULT 0, p_cash_adj NUMERIC DEFAULT 0, p_description TEXT DEFAULT NULL` | ✅ | 是 | 是 | 未检出前端直调 |
| `driver_create_onboarding_bundle`（额外） | `p_merchant_name TEXT, p_kiosk_serial_number TEXT, p_kiosk_location_name TEXT, p_onboarding_id UUID DEFAULT gen_random_uuid(), p_merchant_contact_name TEXT DEFAULT NULL, p_merchant_phone TEXT DEFAULT NULL, p_merchant_address TEXT DEFAULT NULL, p_kiosk_initial_score INTEGER DEFAULT 0, p_initial_coin_loan NUMERIC DEFAULT 0, p_photo_urls TEXT[] DEFAULT '{}', p_notes TEXT DEFAULT NULL` | ✅ | **否（缺失）** | **否（缺失）** | `apps/driver/src/lib/actions.ts` |
| `read_merchant_balances`（额外） | 无 | ✅ | 是 | 是 | `apps/boss/src/pages/MerchantsPage.tsx`, `DashboardPage.tsx` |
| `read_driver_balances`（额外） | `p_driver_id UUID DEFAULT NULL` | ✅ | 是 | 是 | 当前前端未检出调用 |

**“调用但迁移未定义”的 RPC：未发现。**

---

## D. Dexie 映射表（store→字段→索引→版本）

基准文件：`apps/driver/src/lib/db.ts`。

| Dexie version | store | schema/index 字符串 | 说明 |
|---|---|---|---|
| v3 | `kiosks` | `id, serial_number, status` | Phase1 新命名 |
| v3 | `tasks` | `id, kiosk_id, task_date, sync_status` | Phase1 新命名 |
| v3 | `score_reset_requests` | `id, kiosk_id, sync_status` | |
| v3 | `kiosk_onboarding_records` | `id, kiosk_id, onboarding_type, sync_status` | |
| v3 | `sync_queue` | `++id, table_name, record_id, operation` | |
| v3 | `machines/daily_tasks/machine_onboardings/settlements` | `null` | 显式删除旧 store |
| v4 | `tasks` | `id, kiosk_id, task_date, sync_status, settlement_status` | 新增 settlement_status 索引 |
| v5 | `reconciliations` | `id, driver_id, reconciliation_date, status` | 新增本地日结 store |

### Dexie 迁移策略建议

- **推荐：升级迁移（保留离线数据）**：继续按 `version(3→4→5)` 演进，必要时在 upgrade 钩子做字段 backfill。  
- **备选：清空重建**：最快但会导致离线数据丢失（高风险，仅限可接受全量重拉时）。

### 本地字段 vs 远端字段 diff（>=10）

1. `tasks.settlement_status`：本地已有索引，远端有同名列（对齐）。
2. 本地 `tasks.sync_status`：远端无此列（仅离线同步状态）。
3. 本地 `kiosks.sync_status` 不存在于 store schema（类型层可能有），远端无（需统一）。
4. 本地 `reconciliations` store 名 vs 远端 `daily_driver_reconciliations` 表名（语义对应但命名不一致）。
5. 本地 `reconciliations.status` 与远端 `daily_driver_reconciliations.status`（对齐）。
6. 本地无 `merchant_ledger` store；远端存在完整账本表（只在线读写）。
7. 本地无 `driver_fund_ledger` store；远端存在完整账本表（只在线读写）。
8. 本地无 `task_settlements` store；远端存在（结算审计信息未离线镜像）。
9. 本地 `score_reset_requests` store 仅索引 `id/kiosk_id/sync_status`，远端还含 `requested_new_score/reviewed_by/rejection_reason` 等多字段（本地投影）。
10. 本地 `kiosk_onboarding_records` 未索引 `driver_id/status`，远端存在对应列（查询性能差异）。
11. 本地 `kiosks` 未索引 `merchant_id/assigned_driver_id`，远端具备列（本地筛选受限）。
12. 本地 `tasks` 未索引 `driver_id/status`，远端具备列（本地统计查询可能退化）。

---

## 1) 数据库表/字段名一致性（逐表字段清单）

> 仅依据 migrations 解析；若后续 ALTER 未发现则按当前已知列。

### `drivers`
`id, full_name, phone, license_plate, is_active, created_at, updated_at`（Phase1）+ `coin_balance, cash_balance`（Phase2）。

### `merchants`
`id, name, contact_name, phone, address, is_active, created_at, updated_at`（Phase1）+ `dividend_rate, retained_balance, debt_balance`（Phase2）。

### `kiosks`
`id, serial_number, merchant_id, location_name, status, last_recorded_score, assigned_driver_id, created_at, updated_at`。

### `kiosk_onboarding_records`
`id, kiosk_id, driver_id, onboarding_type, photo_urls, notes, status, reviewed_by, reviewed_at, rejection_reason, created_at`。

### `tasks`
`id, kiosk_id, driver_id, task_date, current_score, photo_urls, notes, status, snapshot_serial_number, snapshot_merchant_name, snapshot_location_name, snapshot_driver_name, created_at, updated_at`（Phase1）+ `score_before, dividend_rate_snapshot, settlement_status`（Phase2）。

### `score_reset_requests`
`id, kiosk_id, driver_id, current_score, requested_new_score, reason, status, reviewed_by, reviewed_at, rejection_reason, created_at`。

### `task_settlements`
`id, task_id, kiosk_id, merchant_id, driver_id, task_date, score_before, score_after, gross_revenue, dividend_rate, dividend_amount, dividend_method, exchange_amount, expense_amount, expense_note, created_at`。

### `merchant_ledger`
`id, merchant_id, kiosk_id, task_id, settlement_id, txn_type, amount, retained_balance_after, debt_balance_after, description, created_by, created_at`。

### `driver_fund_ledger`
`id, driver_id, task_id, settlement_id, txn_type, coin_amount, cash_amount, coin_balance_after, cash_balance_after, description, created_by, created_at`。

### `daily_driver_reconciliations`
`id, driver_id, reconciliation_date, opening_coin_balance, opening_cash_balance, theoretical_coin_balance, theoretical_cash_balance, actual_coin_balance, actual_cash_balance, coin_variance, cash_variance, total_kiosks_visited, total_gross_revenue, total_coins_collected, total_coins_exchanged, total_cash_from_exchange, total_dividend_cash, total_dividend_retained, total_expense_amount, status, notes, confirmed_by, confirmed_at, created_at, updated_at`。

---

## 4) RLS / 权限影响

- 列权限限制：
  - `REVOKE UPDATE (coin_balance, cash_balance) ON public.drivers FROM authenticated`。
  - `REVOKE SELECT (retained_balance, debt_balance) ON public.merchants FROM authenticated`。
- 需 `SECURITY DEFINER` 的关键 RPC：结算、日结、债务、留存、手工调账、审批读取类函数（大部分已满足）。
- 需 `SET search_path` 的函数：所有 `SECURITY DEFINER` 函数应显式设置；当前主链已满足，`driver_create_onboarding_bundle` 为缺口。
- Boss 端读取 `retained_balance/debt_balance` 方案：现状采用 `read_merchant_balances()`（SECURITY DEFINER + boss 校验）；前端 `MerchantsPage/DashboardPage` 已按 RPC 读取，符合设计。

---

## 5) 关键业务规则核对（含定位）

1. **首次日结 opening 公式**：
   - 在 `submit_daily_reconciliation` 中，当无前日 confirmed 记录时：
   - `opening = drivers.current_balance - today_ledger_delta`（coin/cash 各自计算）。
2. **分红比例快照**：
   - `validate_task_score()` 在任务创建时写 `NEW.dividend_rate_snapshot`，并在 `record_task_settlement()` 使用 `v_task.dividend_rate_snapshot` 计算 `v_dividend_amount`。
3. **任务结算状态流**：
   - `tasks.settlement_status` 默认 `pending`；`record_task_settlement()` 成功后更新为 `settled`，并插入 `task_settlements`。
4. **照片保留策略**：
   - DB 存储 `photo_urls TEXT[]` 路径/URL，不存 base64。
   - onboarding/task/reset-request 生命周期策略在 SQL 中**未硬编码具体 TTL**（未指定）；建议：task 7~30 天，reset-request 30~90 天，onboarding 长期归档。若不设 TTL，存储成本和合规风险上升。
5. **司机余额负数保护**：
   - `record_task_settlement`、`submit_daily_reconciliation`、`manual_adjustment_driver` 都有负数防护；`manual_adjustment_driver` 当前不允许 admin override 导致负数（默认更安全）。
6. **exchange 校验口径**：
   - `record_task_settlement` 以 `v_driver.coin_balance`（当前可用硬币）校验 `p_exchange_amount`，而非 `gross_revenue`。
7. **initial_coin_loan 自动联动**：
   - `driver_create_onboarding_bundle` 在 `p_initial_coin_loan > 0` 时直接更新 `merchants.debt_balance` 并写 `merchant_ledger(initial_coins)`，实现了自动联动（未复用 `record_merchant_debt` 但效果等价）。

---

## 6) 当前问题定位（复现路径 + 文件 + 修复建议）

### 6.1 Boss web 部署失败（Vercel）
若“未指定日志”，最可能 3 类：
1) **构建命令/输出目录不匹配**（monorepo 子目录 apps/boss）。
2) **环境变量缺失**（Supabase URL/Anon Key）。
3) **Node 版本/lockfile 不一致**（本地可构建，云端失败）。

验证方式：Vercel Deploy logs 检查 `Build Command`、`Output Directory`、`Environment Variables` 注入。建议在仓库添加 `vercel.json` 或 Project Settings 指向 `apps/boss`。

### 6.2 Photo upload “Bucket not found”
复现：driver 端上传 onboarding/task 照片报错。
常见根因：
1) bucket 名不一致（大小写/拼写）；
2) bucket 未创建；
3) policy / RLS 缺失导致实际访问失败被误判；
4) 迁移顺序冲突导致 storage policy migration 未执行。

建议先跑 `supabase/sql/verify_phase2_storage_policies.sql` 并核对 `storage.buckets`。

### 6.3 Capacitor CLI 版本漂移
- `apps/driver/package.json` devDependency: `@capacitor/cli: 8.3.0`。
- 但脚本 `cap:sync` / `cap:add:android` 强制 `npm exec --package @capacitor/cli@6.2.1`。

修复：统一到单一大版本（建议锁定 Capacitor 6 全家桶或整体升 8），并更新脚本 + lockfile。

### 6.4 Dependabot `tar` 告警
- 依赖链来自 `@capacitor/assets` 子依赖（其内嵌 CLI 5.x + tar）。

修复路径：
1) 升级 `@capacitor/assets` 至最新兼容版本；
2) `npm update` + 重建 lockfile；
3) `npm audit` 验证；
4) 若仍 transitively 受限，评估移除 `@capacitor/assets` 或替换资源生成流程。

### 6.5 Driver `coin_balance` 可见性
- 当前 driver UI 主要在 Reconciliation 展示“actual/theoretical balance”；未见统一“当前 coin_balance/cash_balance 卡片”直接来自 `drivers` 或 `read_driver_balances`。

建议：在 driver 首页或 Reconciliation 顶部新增“当前余额卡片”，并调用 `read_driver_balances()`（或安全 select 视图）避免前端自行推导。

---

## E. 风险清单（按严重度）

1. **高**：`driver_create_onboarding_bundle` 非 SECURITY DEFINER 且无 `SET search_path`，与其内部跨表写入职责不匹配，存在权限和 search_path 劫持面。  
2. **高**：`supabase/migrations` 存在同时间戳双文件（`20260401000200_*`），在某些迁移编排工具下可能产生排序不确定性。  
3. **高**：Capacitor 版本漂移（6.x 运行脚本 + 8.x devDependency）导致移动端构建不可重复。  
4. **中**：Dexie 与远端账本表未镜像（task_settlements/merchant_ledger/driver_fund_ledger），离线审计能力不足。  
5. **中**：照片保留天数策略未固化（未指定），可能引发成本与合规问题。  
6. **中**：`read_driver_balances` 已有但前端尚未接入，余额展示口径易分裂。  

---

## F. 建议的 PR 拆分（Stage1..Stage7）

### Stage 1 — DB Security Hardening 收口
- 合并本次 score-reset search_path migration。
- 为 `driver_create_onboarding_bundle` 增加 `SECURITY DEFINER + SET search_path=public`。
- 增加 `pg_proc.proconfig` 自动化校验 SQL（CI 可跑）。

### Stage 2 — Migration 序列治理
- 解决重复时间戳文件，统一迁移命名规范（单调递增）。
- 在 README 增补“迁移顺序冲突排查”。

### Stage 3 — RPC Contract 固化
- 生成 `rpc-contract.md`（函数名/参数/权限/调用方）。
- 在 CI 增加“代码调用 RPC 必须在 migrations 定义”静态检查。

### Stage 4 — Dexie/Remote Schema 对齐
- 明确离线投影字段与 remote 字段映射表。
- 为 `reconciliations` 与 `daily_driver_reconciliations` 命名统一提供适配层。
- 评估是否引入轻量本地 ledger 镜像。

### Stage 5 — Driver Balance UX/安全接入
- 在 driver 端接入 `read_driver_balances`。
- 增加余额卡片 + 刷新策略 + 失败兜底。

### Stage 6 — Storage 生命周期与上传治理
- 将 onboarding/reset/task 三类照片保留策略写入文档与定时清理任务。
- 提供 SQL + Supabase Edge Function 清理模板。

### Stage 7 — 移动端依赖与供应链
- 统一 Capacitor 版本线。
- 处置 tar 告警并补 `npm audit` gate。
- 输出 Vercel/Capacitor 部署 runbook。

---

## G. 官方文档链接（Supabase / Capacitor / GitHub / Vercel）

- Supabase Postgres Functions: https://supabase.com/docs/guides/database/functions  
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security  
- Supabase Storage Access Control: https://supabase.com/docs/guides/storage/security/access-control  
- Supabase Storage Buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals  
- Capacitor CLI: https://capacitorjs.com/docs/cli  
- Capacitor Version Management / Updating: https://capacitorjs.com/docs/updating  
- GitHub Dependabot Alerts: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts  
- Vercel Build & Output Settings: https://vercel.com/docs/deployments/configure-a-build  
- Vercel Monorepo: https://vercel.com/docs/monorepos  

---

## 测试用例回放（验收要求）

1. **正向**：已列出全部目标 RPC，并核对 migrations 定义；“调用但未定义”结果为未发现。  
2. **负向**：检测到旧名 `machines` 等仍在历史迁移与本地 Dexie 删除逻辑中，已给映射表与影响路径。  
3. **边界**：如字段来自运行时生成/非迁移定义，本报告标注“未指定”；建议用 SQL introspection（`information_schema.columns`）二次验证。

## 关键文件列表（相对路径）

- `supabase/migrations/20240104000000_phase1_complete_schema.sql`
- `supabase/migrations/20240105000000_phase2_ledger_reconciliation.sql`
- `supabase/migrations/20240106000000_boss_read_merchant_balances.sql`
- `supabase/migrations/20260401000100_driver_onboarding_bundle.sql`
- `supabase/migrations/20260401000200_stage2_security_hardening.sql`
- `supabase/migrations/20260401000300_score_reset_search_path_hardening.sql`
- `apps/driver/src/lib/db.ts`
- `apps/driver/src/lib/actions.ts`
- `apps/driver/src/lib/reconciliation.ts`
- `apps/driver/src/lib/settlement.ts`
- `apps/boss/src/pages/ScoreResetApprovalsPage.tsx`
- `apps/boss/src/pages/SettlementsPage.tsx`
- `apps/boss/src/pages/MerchantsPage.tsx`
- `apps/boss/src/pages/DashboardPage.tsx`
- `apps/driver/package.json`
- `README.md`
