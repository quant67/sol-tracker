# 价格行为监控功能上线与验收指南

本文用于验证 Sol-Tracker 的“代币价格行为监控 + Telegram 推送”功能是否在部署后正常工作。

## 1. 功能范围

当前价格监控模块包含以下能力：

- 监听指定代币的价格变化
- 按策略触发提醒
- 通过 Telegram Bot 推送通知
- 在 Dashboard 中管理 watch token、策略和触发历史

支持的策略类型：

- `pct_change_up`
- `pct_change_down`
- `breakout_up`
- `breakout_down`

## 2. 部署前检查

在开始验收前，请确认以下内容已经准备好：

- 数据库迁移已执行
- `.env` 中已配置 `TELEGRAM_BOT_TOKEN`
- `.env` 中已配置 `TELEGRAM_CHAT_ID`
- `.env` 中已配置 `SUPABASE_URL`
- `.env` 中已配置 `SUPABASE_ANON_KEY`
- `pm2` 已配置 `sol-tracker`
- `pm2` 已配置 `sol-tracker-bot`
- `pm2` 已配置 `sol-tracker-monitor`

建议先确认进程状态：

```bash
pm2 list
```

预期结果：

- `sol-tracker` 为 `online`
- `sol-tracker-bot` 为 `online`
- `sol-tracker-monitor` 为 `online`

## 3. 数据库验收

确认以下表已存在并可写入数据：

- `watch_tokens`
- `price_strategies`
- `price_snapshots`
- `price_alert_events`

建议检查：

- watch token 是否成功插入
- strategy 是否成功插入
- `price_snapshots` 是否持续增长
- `price_alert_events` 是否在触发后新增记录

## 4. Telegram Bot 验收

### 4.1 基础连通

在 Telegram 中执行：

```text
/start
```

预期：

- 返回欢迎信息
- 命令列表可见

### 4.2 设置全局市值过滤

执行：

```text
/setmc 500k
```

预期：

- 返回成功提示
- `app_settings.min_mc_threshold` 更新为 `500000`

### 4.3 添加监控代币

执行：

```text
/watchadd <mint>
```

预期：

- 返回 `Watch token active`
- Dashboard 的 `Price Strategy Center` 中出现该 token

### 4.4 查看监控代币

执行：

```text
/watchlist
```

预期：

- 可以看到当前 watch token 列表
- token 的状态和最近价格展示正常

### 4.5 创建策略

示例：

```text
/strategyadd <mint> pct_change_up 5 10 300
```

或：

```text
/strategyadd <mint> breakout_up 0.00025 600
```

预期：

- 返回策略 ID
- `strategylist` 中可见该策略
- Dashboard 的 `Price Strategy Center` 中同步显示

### 4.6 手动测试推送

执行：

```text
/strategytest <strategy_id>
```

预期：

- Telegram 收到测试消息
- 证明 Bot 到 Telegram 的发送链路正常

## 5. 真实触发验收

这是验证监控主链路的关键步骤。

### 5.1 准备一个容易触发的策略

建议先创建一个容易触发的规则，例如：

- `pct_change_up 1 1`
- `breakout_up` 设置成接近当前价格的位置

### 5.2 等待监控进程轮询

`sol-tracker-monitor` 会按配置间隔轮询价格并计算策略。

可查看日志：

```bash
pm2 logs sol-tracker-monitor
```

预期日志包含：

- 价格抓取成功
- 策略评估成功
- 告警发送成功

### 5.3 预期结果

触发成功后应同时满足：

- Telegram 收到真实告警
- Dashboard `Price Alert History` 出现新记录
- `price_alert_events` 表新增一条记录
- `pm2 logs sol-tracker-monitor` 中出现 `Price alert sent`

## 6. Dashboard 验收

打开首页后，应该看到以下模块：

- `DashboardStats`
- `Price Strategy Center`
- `Price Alert History`
- `Recent Signals`

重点核对：

- watch token 是否正确显示
- 策略参数是否正确显示
- 策略状态是否能切换
- 告警历史是否按时间倒序更新

## 7. 常见问题排查

### 7.1 Bot 没反应

建议检查：

```bash
pm2 logs sol-tracker-bot
```

常见原因：

- `TELEGRAM_BOT_TOKEN` 未配置
- `SUPABASE_URL` 或 `SUPABASE_ANON_KEY` 未配置
- 机器人进程未启动

### 7.2 没有真实告警

建议检查：

```bash
pm2 logs sol-tracker-monitor
```

常见原因：

- watch token 未激活
- 策略阈值设置过高
- 价格波动不足以触发
- 外部行情 API 暂时不可用

### 7.3 Dashboard 没数据

建议检查：

- 数据库迁移是否执行
- API 路由是否返回 200
- 浏览器控制台是否有错误

可重点查看：

- `/api/watch-tokens`
- `/api/price-strategies`
- `/api/price-alerts`

### 7.4 只收到测试消息，没有真实触发

这通常说明：

- `/strategytest` 已正常工作
- 但监控条件没有满足

建议降低阈值，先验证链路，再逐步提高策略要求。

## 8. 推荐测试顺序

建议按下面顺序验收：

1. 检查 `pm2 list`
2. 执行 `/start`
3. 执行 `/watchadd <mint>`
4. 执行 `/strategyadd <mint> ...`
5. 执行 `/strategytest <strategy_id>`
6. 等待真实行情触发
7. 检查 Dashboard 历史和数据库记录

## 9. 相关文件

- [Telegram Bot 脚本](/Users/sixseven/dev/ai-coding/sol-tracker/scripts/tg-bot.ts)
- [价格监控脚本](/Users/sixseven/dev/ai-coding/sol-tracker/scripts/price-monitor.ts)
- [策略引擎](/Users/sixseven/dev/ai-coding/sol-tracker/src/lib/strategy-engine.ts)
- [Dashboard 首页](/Users/sixseven/dev/ai-coding/sol-tracker/src/app/page.tsx)
- [Dashboard 策略面板](/Users/sixseven/dev/ai-coding/sol-tracker/src/components/dashboard/price-strategy-manager.tsx)
- [Dashboard 告警历史](/Users/sixseven/dev/ai-coding/sol-tracker/src/components/dashboard/price-alert-history.tsx)
- [数据库迁移](/Users/sixseven/dev/ai-coding/sol-tracker/supabase/migration-price-monitor.sql)
