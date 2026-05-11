# Sol-Tracker Agent Handoff

## Build State

- Last Updated: 2026-04-21
- Working On: Pulse retest strategy verification
- Recently Completed: Token leaderboard API, Dashboard module, price-change column, token name fallback fix, pulse retest strategy, automatic pulse strategy creation, homepage entry, desktop and mobile smoke checks
- Blocked By: Clear

## 沟通风格

- 直接给结论，再补充必要上下文。
- 保持信息密度，减少礼貌性铺垫。
- 简单问题用短回答，复杂改动用清晰步骤。

## 产品现状

Sol-Tracker 是 Solana 钱包监控 Dashboard。当前能力包括：

- 通过 Helius webhook 监听监控地址交易。
- 解析 Swap 买卖并写入 `logs`。
- 通过 `people` 将多个地址归到同一监控人。
- Dashboard 展示统计、价格策略、回测、告警历史和最近交易。
- Telegram 推送依赖 `token-resolver.ts` 获取代币名称和市值。

## 当前活跃迭代

本轮目标是添加“代币榜单”：按 `1d / 3d / 7d / 15d` 展示近期监控人买入过的代币。基础功能和距离最近买入的变化列已实现并通过本地验证。

后续追加了 `pulse_retrace_retest` 价格策略：用监控买入日志作为起涨锚点，识别脉冲上涨后慢速回踩起涨区的提醒机会。

BUY 日志写入后，如果同一个 token 最近 4320 分钟内唯一监控买入人数达到 2，系统会自动加入 watch token 并创建 `Auto Pulse Retest` 策略。

执行文档：

- `/Users/sixseven/dev/ai-coding/sol-tracker/docs/Iteration-TokenLeaderboard.md`
- `/Users/sixseven/dev/ai-coding/sol-tracker/docs/TechNote-TokenLeaderboard.md`

## 实现顺序

1. 新增 `GET /api/token-leaderboard`。
2. 在 API 中按时间窗口读取 `logs`，只聚合买入记录。
3. 用 `logs.address -> addresses.person_id -> people.name` 计算监控人集合。
4. 以 CA 为聚合键，同一监控人的多个地址计为 1 人。
5. 返回名称、CA、市值、监控人数、监控人名单、最近买入时间。
6. 返回当前市值相对最近一次买入日志市值的变化百分比。
7. 新增 Dashboard 榜单组件，支持四个窗口切换和按监控人数排序。
8. 把组件挂到首页中最近交易上方。
9. 运行 lint，并本地检查桌面端和移动端布局。
10. 新增 `pulse_retrace_retest` 策略，接入 Dashboard、Telegram、监控任务和告警历史。
11. 在 Helius webhook 中接入自动策略创建，满足监控人数阈值后自动创建 `Auto Pulse Retest`。

## 关键口径

- 榜单统计对象是监控人。
- 地址只作为人员归属来源。
- CA 使用 `logs.token_info.mint`。
- 名称和市值优先使用最新日志里的 `token_info`。
- 缺失的代币信息复用 `resolveTokenInfo(mint)`。
- 默认排序是监控人数降序，最近买入时间作为次级排序。
- 变化列使用当前市值相对最近一次买入日志市值的百分比。
- 榜单默认只返回 Top 50，且默认过滤到至少 2 个监控人买入的 token。
- 榜单 API 对 `window + sort + limit + minBuyers` 做 60 秒服务端缓存。
- `pulse_retrace_retest` 默认回看 4320 分钟，默认 cooldown 为 21600 秒。
- `pulse_retrace_retest` 依赖 `logs.token_info.personName` 和 `price_snapshots`。
- 自动创建由 `AUTO_PULSE_RETEST_ENABLED` 控制，默认关闭。
- 自动创建阈值默认是最近 4320 分钟内 2 个唯一监控人买入。
- 自动创建策略会写入 `autoCreated: true`，已有活跃同类策略时直接复用。

## 常用命令

```bash
npm run lint
npm run dev
```
