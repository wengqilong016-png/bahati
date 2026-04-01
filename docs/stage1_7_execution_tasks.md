# Stage 1..7 实施任务清单（可直接转 GitHub Issues）

## Stage 1 — Driver Wallet 同步闭环（Phase2 收尾）
**目标**：补齐 driver 余额可见性与本地缓存。  
**任务**：
- [ ] `apps/driver/src/lib/sync.ts` 新增 `pullDriverProfile()`：拉取 `drivers.coin_balance,cash_balance,updated_at`；若列权限限制则回退 `rpc('read_driver_balances')`。
- [ ] apps/driver/src/lib/db.ts Dexie version bump（v6）：新增 driver_profile store（id, full_name, coin_balance, cash_balance, last_confirmed_coin, last_confirmed_cash, sync_status, updated_at）。
- [ ] `apps/driver/src/pages/HomePage.tsx` 或 `ReconciliationPage.tsx` 增加 Wallet Card（在线值 + 最近 confirmed 值）。
- [ ] 增加错误态文案：离线、无权限、未初始化；每种状态有重试按钮。
- [ ] 输出验收步骤（在线 30s 内可见；离线显示缓存或“未同步”提示）。
**验收**：
- [ ] 在线登录后 30 秒内 Wallet Card 展示最新 coin/cash。
- [ ] 断网后可展示缓存，并显示离线提示。
- [ ] 权限报错时提示“无权限读取余额，请联系管理员”。

## Stage 2 — Migration 序列治理
**目标**：迁移顺序可预测。  
**任务**：
- [ ] 修复重复前缀 migration 文件（`20260401000200_*`）的排序歧义（重命名新补丁文件）。
- [ ] 新增 CI 检查：migration 文件名必须严格递增、不可重复。
- [ ] README 增补“迁移冲突处理手册”。

## Stage 3 — RPC 合约门禁
**目标**：调用与定义严格一致。  
**任务**：
- [ ] 生成 `docs/rpc-contract.md`（函数名、参数、SECURITY DEFINER、search_path、调用端）。
- [ ] 增加脚本检查前端 `supabase.rpc()` 与 migrations 函数定义一一对应。
- [ ] 将脚本接入 CI。

## Stage 4 — Dexie/远端字段对齐
**目标**：离线字段口径统一。  
**任务**：
- [ ] 形成 `local->remote` 字段映射表并固定 owner。
- [ ] 对 `reconciliations` 与 `daily_driver_reconciliations` 建立命名适配层。
- [ ] 评估是否对 `task_settlements` 做最小离线镜像（只读摘要）。

## Stage 5 — RLS/列权限与读取方案固化
**目标**：余额与敏感字段读取规范化。  
**任务**：
- [ ] 明确 boss 端读取 `retained_balance/debt_balance` 仅走 `read_merchant_balances` 或 service_role。
- [ ] driver 端余额读取统一走 `read_driver_balances`（或白名单列 SELECT）。
- [ ] 增加权限失败回归测试（匿名/driver/boss 三角色）。

## Stage 6 — 存储生命周期策略
**目标**：照片保留策略落地。  
**任务**：
- [ ] 文档化策略：onboarding 长期、reset-request 中期、task 短期。
- [ ] 若未指定具体 TTL，默认提案：task 7~30 天、reset-request 30~90 天、onboarding 长期归档。
- [ ] 提供清理脚本/定时任务（Edge Function + cron）。
- [ ] 验证 DB 仅存 path/url，不存 base64。

## Stage 7 — 构建与供应链稳定性
**目标**：发布稳定，漏洞可控。  
**任务**：
- [ ] 统一 `@capacitor/*` 大版本（脚本与依赖一致）。
- [ ] 处理 Dependabot tar 告警（升级 @capacitor/assets、重锁、npm audit 验证）。
- [ ] 针对 Vercel（boss）补充 monorepo 构建配置与环境变量检查清单。
