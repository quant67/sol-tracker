# 上涨延续入场信号测试流程

本文用于测试 Sol-Tracker 的 `entry_long` 入场信号功能，以及对应的回测面板和 Telegram 提醒链路。

## 1. 测试目标

本功能的目标不是“价格涨了就提醒”，而是：

- 当代币出现趋势转强、结构延续、接近突破位等入场形态时提醒
- 让你判断“此时介入后，后续继续上涨 10% 的概率是否较高”
- 通过 Dashboard 的回测面板查看历史命中情况

## 2. 测试前准备

确认以下项已经完成：

- 数据库迁移已执行
- `sol-tracker`、`sol-tracker-bot`、`sol-tracker-monitor` 都已启动
- `.env` 中已配置：
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

建议先检查进程：

```bash
pm2 list
```

预期：

- `sol-tracker` 为 `online`
- `sol-tracker-bot` 为 `online`
- `sol-tracker-monitor` 为 `online`

## 3. 选择测试代币

建议先挑一个你希望观察的 token，添加到 watch list：

```text
/watchadd <mint>
```

然后在 Dashboard 的 `Price Strategy Center` 中确认 token 已出现。

## 4. 创建入场信号

`entry_long` 的推荐格式：

```text
/strategyadd <mint> entry_long <lookbackMin> <fastWindowMin> <slowWindowMin> <targetPct> [cooldownSec] [breakoutTolerancePct] [minTrendPct]
```

推荐先用一组比较容易触发、便于测试的参数：

```text
/strategyadd <mint> entry_long 30 5 15 10 300 1.5 2
```

参数含义：

- `lookbackMin`：观察窗口，单位分钟
- `fastWindowMin`：短周期均线窗口
- `slowWindowMin`：长周期均线窗口
- `targetPct`：你希望信号后续验证的目标涨幅
- `cooldownSec`：冷却时间
- `breakoutTolerancePct`：距离局部高点的容忍距离
- `minTrendPct`：最小趋势幅度

创建后用以下命令确认：

```text
/strategylist
```

## 5. 先做回测

这是最重要的一步。先看历史上这类信号是否真的有效，再决定是否要在实盘里盯它。

### 5.1 在 Dashboard 上跑回测

打开首页，找到 `Signal Backtest` 面板，然后：

1. 选择刚创建的 `entry_long` 策略
2. 设置 `Lookahead (min)`，建议先用 `120`
3. 设置 `History (days)`，建议先用 `30`
4. 点击 `Run Backtest`

### 5.2 回测结果怎么看

重点看这些指标：

- `Actionable Signals`：真正进入评估的信号数量
- `Resolved / Hits`：成功在未来窗口内达到目标的样本数
- `Hit Rate`：命中率
- `Avg Max Return`：信号后平均最大延续幅度
- `Avg Minutes to Target`：平均多久达到目标

### 5.3 你要判断什么

回测不是为了追求“每次都命中”，而是为了看：

- 命中率是否足够高
- 最大延续幅度是否有交易价值
- 信号是否过于稀疏或过于频繁
- 是否需要调大/调小 `lookbackMin`、`fastWindowMin`、`slowWindowMin` 和 `breakoutTolerancePct`

## 6. 再做实时提醒测试

如果回测结果看起来合理，再测试实时提醒。

### 6.1 检查策略状态

确认策略是启用的：

```text
/strategylist
```

Dashboard 里也应显示为 `RUNNING`。

### 6.2 观察监控进程日志

```bash
pm2 logs sol-tracker-monitor
```

你应该看到：

- 价格轮询成功
- 策略评估成功
- 如果命中，会打印 `Price alert sent`

### 6.3 预期 Telegram 消息

收到的提醒应当包含：

- token 名称或符号
- 当前价格
- 策略名称
- 触发原因
- 趋势信息
- 目标延续幅度

## 7. 在 Dashboard 上核对结果

打开首页后，建议按这个顺序看：

1. `Price Strategy Center`
2. `Signal Backtest`
3. `Price Alert History`

重点核对：

- 策略参数是否正确
- 回测结果是否与预期一致
- 实际触发是否出现在历史里
- 告警内容是否能解释“为什么现在是入场点”

## 8. 现网测试建议

如果你准备做更贴近实盘的测试，建议这样安排：

1. 先选一个波动相对清晰的 token
2. 用保守参数创建 1 条 `entry_long`
3. 先跑 30 天历史回测
4. 再让 `sol-tracker-monitor` 跑 1 到 2 天
5. 观察是否出现过多误报
6. 再逐步收紧参数

## 9. 常见问题

### 9.1 没有任何回测结果

可能原因：

- 该 token 的 `price_snapshots` 不足
- 该策略不是 `entry_long`
- 观察窗口太短，历史数据不够覆盖

### 9.2 有回测，但实时不提醒

可能原因：

- 当前市场并没有形成符合条件的结构
- 参数过于严格
- `cooldown` 过长
- token 流动性不足，价格数据不稳定

### 9.3 提醒太频繁

建议先调大：

- `breakoutTolerancePct`
- `minTrendPct`
- `cooldownSec`

如果还是太频繁，可以把 `lookbackMin` 适当加大，让信号更稳定。

## 10. 相关入口

- [Dashboard 首页](/Users/sixseven/dev/ai-coding/sol-tracker/src/app/page.tsx)
- [入场信号策略引擎](/Users/sixseven/dev/ai-coding/sol-tracker/src/lib/strategy-engine.ts)
- [回测引擎](/Users/sixseven/dev/ai-coding/sol-tracker/src/lib/backtest-engine.ts)
- [回测 API](/Users/sixseven/dev/ai-coding/sol-tracker/src/app/api/price-backtest/route.ts)
- [策略管理面板](/Users/sixseven/dev/ai-coding/sol-tracker/src/components/dashboard/price-strategy-manager.tsx)
- [回测面板](/Users/sixseven/dev/ai-coding/sol-tracker/src/components/dashboard/strategy-backtest-panel.tsx)
