-- ============================================================
-- SmartKiosk — Supabase Realtime Setup
--
-- 说明 (Description):
--   为需要实时推送的核心业务表启用 Supabase Realtime。
--   Enable Supabase Realtime for all business-critical tables that
--   require live push notifications to driver / boss clients.
--
-- 为什么设置 REPLICA IDENTITY FULL？
--   Why REPLICA IDENTITY FULL?
--   Postgres 默认只在 WAL 中写入主键（REPLICA IDENTITY DEFAULT）。
--   设置为 FULL 后，UPDATE 和 DELETE 的旧行数据也会写入 WAL，
--   这是 Supabase Realtime 通过 RLS 过滤 DELETE/UPDATE 事件所必需的
--   ——如果缺少旧行数据，Realtime 无法判断事件属于哪个用户，从而无法
--   将事件路由到正确的订阅者。
--
--   By default Postgres writes only the PK to the WAL (REPLICA IDENTITY
--   DEFAULT). Setting FULL causes the entire old row to be written for
--   UPDATE and DELETE, which is required for Supabase Realtime to
--   evaluate RLS filters on those events and route them to the correct
--   subscriber.
--
-- 涉及的表 (Tables covered):
--   drivers                      — 司机状态变更（Driver status changes）
--   kiosks                       — 设备分配/状态变更（Assignment & status）
--   tasks                        — 巡检任务提交/更新（Task submissions）
--   score_reset_requests         — 清分申请审批（Score reset approvals）
--   kiosk_onboarding_records     — 接机记录审核（Onboarding reviews）
--   daily_driver_reconciliations — 日结提交/确认（Reconciliation lifecycle）
--   task_settlements             — 结算记录（Settlement records）
--   driver_fund_ledger           — 司机资金账本（Driver fund ledger）
--   merchant_ledger              — 商家账本（Merchant ledger）
--   merchant_balance_snapshots   — 商家余额快照（Merchant balance snapshots）
--
-- RLS 兼容性说明 (RLS Compatibility):
--   Realtime 订阅与 RLS 策略完全兼容：
--     • 司机只能收到自己行的事件（filtered by driver_id = auth.uid()）
--     • Boss 可以收到所有行的事件（is_boss() = true）
--   现有的 Phase 1 / Phase 2 RLS 策略无需修改。
--
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1.  REPLICA IDENTITY FULL
--     确保 UPDATE / DELETE 事件携带完整旧行，以支持 RLS 过滤。
--     Ensure UPDATE/DELETE events carry the full old row for RLS
--     filtering in Realtime.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.drivers                      REPLICA IDENTITY FULL;
ALTER TABLE public.kiosks                       REPLICA IDENTITY FULL;
ALTER TABLE public.tasks                        REPLICA IDENTITY FULL;
ALTER TABLE public.score_reset_requests         REPLICA IDENTITY FULL;
ALTER TABLE public.kiosk_onboarding_records     REPLICA IDENTITY FULL;
ALTER TABLE public.daily_driver_reconciliations REPLICA IDENTITY FULL;
ALTER TABLE public.task_settlements             REPLICA IDENTITY FULL;
ALTER TABLE public.driver_fund_ledger           REPLICA IDENTITY FULL;
ALTER TABLE public.merchant_ledger              REPLICA IDENTITY FULL;
ALTER TABLE public.merchant_balance_snapshots   REPLICA IDENTITY FULL;

-- ────────────────────────────────────────────────────────────
-- 2.  supabase_realtime PUBLICATION
--     将上述表加入 Supabase 默认的 Realtime 发布。
--     Add the tables to Supabase's default Realtime publication.
--
--     注意：supabase_realtime publication 由 Supabase 平台在项目初始化时
--     自动创建；此处的 ALTER PUBLICATION ... ADD TABLE 语句是向其中追加表，
--     不是新建发布。若在本地 supabase start 环境中执行，请确保
--     supabase_realtime publication 已存在（默认存在）。
--
--     Note: The supabase_realtime publication is created automatically
--     by the Supabase platform at project initialisation; the statements
--     below only add tables to it — they do not create the publication.
--     When running locally via `supabase start` the publication is
--     present by default.
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.drivers',
    'public.kiosks',
    'public.tasks',
    'public.score_reset_requests',
    'public.kiosk_onboarding_records',
    'public.daily_driver_reconciliations',
    'public.task_settlements',
    'public.driver_fund_ledger',
    'public.merchant_ledger',
    'public.merchant_balance_snapshots'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already a member, skip
    END;
  END LOOP;
END
$$;
