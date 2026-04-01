# Schema Evolution（Phase1 → Phase2）

## 1) Authoritative 模型切换点

自 **2024-01-04**（`supabase/migrations/20240104000000_phase1_complete_schema.sql`）起，业务应以以下表为 authoritative：

- `drivers` 
- `merchants` 
- `kiosks` 
- `kiosk_assignment_history` 
- `tasks` 
- `kiosk_onboarding_records` 
- `score_reset_requests`

并在 Phase2（`2024-01-05`）补齐：

- `task_settlements` 
- `merchant_ledger` 
- `driver_fund_ledger` 
- `daily_driver_reconciliations` 
- `merchant_balance_snapshots`

> 结论：从代码与迁移执行语义看，运行期 authoritative 集合为 `drivers/merchants/kiosks/tasks/kiosk_onboarding_records/score_reset_requests`（Phase1）+ Phase2 账本/日结扩展表。

---

## 2) 旧名 → 新名映射与迁移切换点

| 旧名 | 新名 | 切换点（migration） | 说明 |
|---|---|---|---|
| `machines` | `kiosks` | `20240104000000_phase1_complete_schema.sql` | Phase1 完整重建时落地新命名；旧 migration 仍保留历史定义。 |
| `machine_onboardings` | `kiosk_onboarding_records` | `20240104000000_phase1_complete_schema.sql` | 业务入网记录切到 kiosk 语义。 |
| `daily_settlements` | `daily_driver_reconciliations` | `20240105000000_phase2_ledger_reconciliation.sql` | 日结由汇总表升级为“提交/确认”双阶段对账模型。 |
| `merchant_ledger_entries` | `merchant_ledger` | `20240104000000_phase1_complete_schema.sql` + `20240105000000_phase2_ledger_reconciliation.sql` | 从旧账本命名迁移到新账本结构并扩展 retained/debt 流。 |

---

## 3) 为什么保留旧迁移？新环境如何执行？

### 为什么保留旧迁移

保留 `20240101000000_initial_schema.sql` 等旧迁移文件的原因是：

1. **历史可追溯**：可完整回看从初始建模到重命名/重构的演进过程。
2. **审计可解释**：能说明为何仓库仍出现 `machines/daily_settlements` 等旧名。
3. **回放一致性**：在全新环境中，迁移系统按时间序列执行，后续 migration 会覆盖/替换早期模型。

### 新环境执行原则

- 必须按 `supabase/migrations` **完整时间序列**执行，不应只挑“看起来最新”的单个文件。
- 对于出现旧名的历史 migration，不应手工删除；由后续 migration 负责重建/替换。
- 若出现“同时间戳多文件”，应在交付流程中确保顺序可预测（建议通过后续补丁统一命名前缀）。

---

## 4) FAQ：看到 `machines` / `daily_settlements` SQL，如何判断是否“活跃模型”？

可按以下 checklist 判断：

1. **看文件时间与阶段**
   - 若仅出现在早期 migration（如 `20240101000000_initial_schema.sql`），通常属于历史模型。
2. **看后续 migration 是否 DROP/替换/重建**
   - 若后续存在 `DROP TABLE ... machines`、并创建 `kiosks`，则活跃模型应视为 `kiosks`。
3. **看应用代码实际调用**
   - 前端/服务端 `.from('...')` 与 `rpc('...')` 若已统一使用新名，则旧名不是运行期主路径。
4. **看权限与索引是否持续维护**
   - 新表若在后续 migration 持续追加 RLS、索引、RPC 逻辑，说明其为活跃模型。

### 快速结论模板

- 仅在历史 migration 出现 + 运行代码未调用：**历史遗留（非活跃）**。
- 在最新 migration 仍被 ALTER/RLS/RPC 依赖：**活跃模型**。

