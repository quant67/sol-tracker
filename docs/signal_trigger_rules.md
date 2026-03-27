# Sol-Tracker 信号触发规则说明

本文记录当前仓库里已经实现的价格信号触发规则，目标是方便后续做参数优化、回测复盘和策略迭代。

核心源码入口：

- `src/lib/strategy-engine.ts`
- `scripts/price-monitor.ts`
- `scripts/tg-bot.ts`
- `src/components/dashboard/price-strategy-manager.tsx`

---

## 1. 当前支持的信号类型

目前系统支持 7 类价格信号：

- `pct_change_up`
- `pct_change_down`
- `breakout_up`
- `breakout_down`
- `entry_long`
- `entry_rebound`
- `pullback_to_ma`

其中：

- `pct_change_*` 属于“时间窗口内涨跌幅触发”
- `breakout_*` 属于“阈值价格穿越触发”
- `entry_long` 属于“趋势延续 / 接近突破触发”
- `entry_rebound` 属于“局部低点反弹 / 结构修复触发”
- `pullback_to_ma` 属于“趋势中的回踩均线再启动触发”

---

## 2. 统一触发流程

价格监控主流程在 `scripts/price-monitor.ts` 中：

1. 拉取当前价格
2. 读取该 token 的历史快照
3. 将当前价格追加到历史序列
4. 调用 `evaluateStrategy(...)` 逐条判断是否触发
5. 如果触发，再检查 `cooldown`
6. 生成 `dedupe_key`，写入 `price_alert_events`
7. 推送 Telegram 消息

这意味着：

- 真正的“是否命中”逻辑都在 `src/lib/strategy-engine.ts`
- `cooldown` 不会改变信号定义，只会阻止短时间内重复推送
- 即使信号条件满足，仍可能因为 cooldown 或 dedupe 被跳过

---

## 3. 通用约束与默认行为

### 3.1 价格有效性

所有策略都会先检查：

- `currentPrice` 必须是有限数值
- `currentPrice > 0`

否则直接返回不触发。

### 3.2 cooldown

每条策略都有 `cooldownSec`：

- 由 Telegram `/strategyadd` 或 Dashboard 创建时写入
- 若未填写，默认值是 `300` 秒

监控进程会查询该策略最近一次触发时间，若距离现在还小于 `cooldownSec`，就直接跳过本次推送。

### 3.3 dedupe

除了 cooldown，系统还会生成 `dedupe_key` 防重：

- `dedupeWindow = max(cooldownSec, 60)`
- 同一个策略、同一个 token、同一 dedupe seed、同一 dedupe bucket 只会保留一次事件

这可以避免同一分钟或同一冷却窗口内重复插入相同触发事件。

---

## 4. 各信号触发规则

## 4.1 `pct_change_up`

### 参数

- `windowMin`：回看窗口，单位分钟
- `thresholdPct`：涨幅阈值，单位 %

### 触发逻辑

从最近 `windowMin` 分钟内的历史价格中，取最早一个样本作为 `baseline`，计算：

`changePct = (currentPrice - baseline.price) / baseline.price * 100`

当：

`changePct >= thresholdPct`

则触发。

### 特点

- 这是“窗口首点 → 当前价”的比较，不是窗口最低点 → 当前价
- 因此它更像“某段时间的净涨幅”，不是“区间最大拉升”
- 对采样频率比较敏感：如果窗口首个样本位置变化，结果会变

### 适合优化的方向

- 是否改成“窗口起点”还是“窗口最低点”
- 是否改成 VWAP / MA 基线而不是首样本
- 是否增加最少样本数量约束，降低稀疏采样误差

---

## 4.2 `pct_change_down`

### 参数

- `windowMin`：回看窗口，单位分钟
- `thresholdPct`：跌幅阈值，单位 %

### 触发逻辑

同样使用最近 `windowMin` 分钟内最早样本作为 `baseline`，计算：

`changePct = (currentPrice - baseline.price) / baseline.price * 100`

当：

`changePct <= -thresholdPct`

则触发。

### 特点

- 与 `pct_change_up` 共用同一套窗口基线逻辑
- 更适合抓急跌、瀑布式下破，但也容易受单个异常采样点影响

### 适合优化的方向

- 是否加入连续确认，避免单次针刺误报
- 是否增加最小成交活跃度 / 最小样本数过滤

---

## 4.3 `breakout_up`

### 参数

- `targetPrice`：上破阈值价格

### 触发逻辑

只使用：

- `previousPrice`
- `currentPrice`
- `targetPrice`

当满足：

- `previousPrice <= targetPrice`
- `currentPrice > targetPrice`

则认为价格“从下往上穿越阈值”，触发 `breakout_up`。

### 特点

- 不依赖长历史窗口
- 是非常直接的“穿线触发”
- 如果价格长时间停在阈值上方，不会重复触发，除非之后回到阈值下方再重新上穿

### 适合优化的方向

- 是否增加“突破后保持 N 秒 / N 个采样点”确认
- 是否增加最小突破幅度，避免刚好贴线时频繁来回触发

---

## 4.4 `breakout_down`

### 参数

- `targetPrice`：下破阈值价格

### 触发逻辑

当满足：

- `previousPrice >= targetPrice`
- `currentPrice < targetPrice`

则认为价格“从上往下穿越阈值”，触发 `breakout_down`。

### 特点

- 与 `breakout_up` 对称
- 适合做止损线、关键支撑位跌破提醒

### 适合优化的方向

- 是否增加跌破确认
- 是否增加“收盘确认”或连续多个点都在阈值下方才触发

---

## 4.5 `entry_long`

### 目标定位

这是当前仓库里最复杂的一类信号，用于识别：

- 已经出现上行趋势
- 当前价接近近期高点
- 有机会继续上破并形成 follow-through

### 参数

- `lookbackMin`：整体回看窗口
- `fastWindowMin`：快均线窗口
- `slowWindowMin`：慢均线窗口
- `targetPct`：用于提醒文案和 backtest 的目标涨幅
- `breakoutTolerancePct`：距离近期高点允许的偏差
- `minTrendPct`：当前价相对近期低点至少要涨多少

默认值：

- `breakoutTolerancePct = 1.5`
- `minTrendPct = 2`
- `targetPct = 10`

### 数据样本要求

若以下任一条件不满足，则不触发：

- `lookbackMin` / `fastWindowMin` / `slowWindowMin` 必须都大于 0
- `lookback` 窗口内样本数至少 `4`
- `fast` 窗口内样本数至少 `2`
- `slow` 窗口内样本数至少 `2`

这说明 `entry_long` 对历史数据质量要求更高。

### 计算字段

在 `lookbackMin` 窗口内：

- `recentHigh` = 最近窗口最高价
- `recentLow` = 最近窗口最低价

在 `fastWindowMin` 窗口内：

- `fastMA` = 快速均价

在 `slowWindowMin` 窗口内：

- `slowMA` = 慢速均价

再计算：

- `trendPct = (currentPrice - recentLow) / recentLow * 100`
- `maSpreadPct = (fastMA - slowMA) / slowMA * 100`
- `distanceFromHighPct = (recentHigh - currentPrice) / recentHigh * 100`

### 触发条件

必须同时满足以下 3 个条件：

1. **接近前高**

   `currentPrice >= recentHigh * (1 - breakoutTolerancePct / 100)`

   含义：当前价距离近期高点不能太远。

2. **均线趋势向上**

   - `fastMA > slowMA`
   - `currentPrice > fastMA`

   含义：短周期强于长周期，且现价站在快均线之上。

3. **已具备足够涨势**

   `trendPct >= minTrendPct`

   含义：当前价相对近期低点至少已经抬升到指定幅度。

### Telegram 文案字段含义

触发后消息里常见字段：

- `Trend` = `trendPct`
- `From High` = `-distanceFromHighPct`
- `MA` = `fastMA / slowMA`
- `Target` = `+targetPct% follow-through`

其中：

- `Trend` 表示“当前价相对近期低点已经涨了多少”
- `From High` 是负值展示，表示“当前价距离近期高点还差多少”

### 特点

- 这是“趋势延续 + 接近突破”的组合信号，不是抄底信号
- `targetPct` **不会参与实时触发判断**，它只用于：
  - 触发文案提示
  - backtest 中判断未来窗口是否达到目标涨幅

### 适合优化的方向

- `fastMA` / `slowMA` 是否改成 EMA
- `Trend` 是否用最近低点，还是用 lookback 起点
- `breakoutTolerancePct` 是否按波动率动态调整
- 是否加入成交量、持仓人数、FDV/MC 过滤
- 是否加入“突破后确认”而不是接近高点即触发

---

## 4.6 `entry_rebound`

### 目标定位

`entry_rebound` 用来补足 `entry_long` 的空白场景，识别：

- 已经从局部低点弹起
- 价格开始重新站上短周期均价
- 结构在修复，但还没有走到“接近前高突破”的阶段

### 参数

- `lookbackMin`：整体回看窗口
- `fastWindowMin`：快均线窗口
- `slowWindowMin`：慢均线窗口
- `targetPct`：用于提醒文案和 backtest 的目标涨幅
- `minReboundPct`：距离局部低点至少反弹多少才算有效
- `maxDistanceFromLowPct`：离局部低点最多不能超过多少，避免追太高

默认值：

- `minReboundPct = 1.5`
- `maxDistanceFromLowPct = 6`
- `targetPct = 8`

### 数据样本要求

与 `entry_long` 相同：

- `lookbackMin` / `fastWindowMin` / `slowWindowMin` 必须都大于 0
- `lookback` 窗口内样本数至少 `4`
- `fast` 窗口内样本数至少 `2`
- `slow` 窗口内样本数至少 `2`

### 计算字段

复用 `entry_long` 的窗口统计：

- `recentHigh` = 最近窗口最高价
- `recentLow` = 最近窗口最低价
- `fastMA` = 快速均价
- `slowMA` = 慢速均价

再计算：

- `reboundPct = (currentPrice - recentLow) / recentLow * 100`
- `drawdownFromHighPct = (recentHigh - currentPrice) / recentHigh * 100`
- `maSpreadPct = (fastMA - slowMA) / slowMA * 100`

### 触发条件

必须同时满足以下 3 个条件：

1. **已经从低点反弹，但仍不算追高**

   - `reboundPct >= minReboundPct`
   - `reboundPct <= maxDistanceFromLowPct`

   含义：价格不能还趴在最低点附近，也不能已经从低点飞太远。

2. **短周期结构开始修复**

   - `currentPrice >= fastMA`
   - `fastMA >= slowMA * 0.995`

   含义：现价重新站上快均线，且快均线已经接近或重新追上慢均线。

3. **仍明显低于近期高点**

   `drawdownFromHighPct >= 1`

   含义：它还处于“反弹恢复”阶段，而不是已经走成接近新高的延续突破。

### Telegram 文案字段含义

触发后消息里常见字段：

- `Rebound` = `reboundPct`
- `Off High` = `-drawdownFromHighPct`
- `MA` = `fastMA / slowMA`
- `Target` = `+targetPct% follow-through`

### 特点

- 这是“从局部低点启动的早期恢复”信号
- 与 `entry_long` 是互补关系：
  - `entry_rebound` 更早、更容易抓到 V 型或 U 型反弹
  - `entry_long` 更晚，但更接近确认后的趋势延续
- `targetPct` 同样不参与实时触发，只用于提醒与回测

### 适合优化的方向

- 是否把 `fastMA >= slowMA * 0.995` 改成可配置参数
- 是否加上“低点之后至少连续 2 个点抬高”的结构确认
- 是否加入成交量或买盘活跃度过滤
- 是否加入“反弹后不能马上回落跌破 fastMA”的二次确认

---

## 4.7 `pullback_to_ma`

### 目标定位

`pullback_to_ma` 用来抓已经进入上行结构的 token，在未破坏大趋势的前提下，价格回踩快均线附近后再次站回去的中继机会。

### 参数

- `lookbackMin`：整体回看窗口
- `fastWindowMin`：快均线窗口
- `slowWindowMin`：慢均线窗口
- `targetPct`：用于提醒文案和 backtest 的目标涨幅
- `pullbackTolerancePct`：允许价格偏离快均线的容忍范围，同时也要求离近期高点至少有这么深的回踩
- `minTrendPct`：当前价相对近期低点至少要抬升多少，避免在纯横盘里误触发

默认值：

- `pullbackTolerancePct = 1.5`
- `minTrendPct = 3`
- `targetPct = 8`

### 数据样本要求

与 `entry_long` / `entry_rebound` 相同：

- `lookbackMin` / `fastWindowMin` / `slowWindowMin` 必须都大于 0
- `lookback` 窗口内样本数至少 `4`
- `fast` 窗口内样本数至少 `2`
- `slow` 窗口内样本数至少 `2`

### 计算字段

复用通用 entry 上下文：

- `recentHigh` = 最近窗口最高价
- `recentLow` = 最近窗口最低价
- `fastMA` = 快速均价
- `slowMA` = 慢速均价

再计算：

- `trendPct = (currentPrice - recentLow) / recentLow * 100`
- `distanceFromHighPct = (recentHigh - currentPrice) / recentHigh * 100`
- `distanceToFastMAPct = abs(currentPrice - fastMA) / fastMA * 100`
- `maSpreadPct = (fastMA - slowMA) / slowMA * 100`

### 触发条件

必须同时满足以下条件：

1. **趋势仍然成立**

   - `fastMA > slowMA`
   - `currentPrice >= slowMA`
   - `trendPct >= minTrendPct`

2. **价格确实发生了回踩**

   `distanceFromHighPct >= pullbackTolerancePct`

   含义：当前价离近期高点已经回撤出一个可观的幅度，不是在高位追突破。

3. **价格回到快均线附近**

   `distanceToFastMAPct <= pullbackTolerancePct`

   含义：当前价需要回踩到快均线附近，而不是离均线很远。

4. **出现重新站回快均线的动作**

   - `currentPrice >= fastMA`
   - `previousPrice <= fastMA`（若存在上一拍）

   含义：更偏向捕捉“回踩后重新上穿快均线”的恢复点。

### Telegram 文案字段含义

触发后消息里常见字段：

- `Trend` = `trendPct`
- `Pullback` = `-distanceFromHighPct`
- `To Fast MA` = `distanceToFastMAPct`
- `MA` = `fastMA / slowMA`
- `Target` = `+targetPct% follow-through`

### 特点

- 这是“强趋势中的中继回踩”信号
- 与另外两个 entry 型信号形成互补：
  - `entry_rebound` 抓低位修复
  - `pullback_to_ma` 抓趋势中的回踩续涨
  - `entry_long` 抓接近前高的延续突破

### 适合优化的方向

- 是否把“必须重新站回 fastMA”改成更宽松的两段确认
- 是否增加 `slowMA` 斜率或 `maSpreadPct` 最小值过滤
- 是否区分浅回踩和深回踩两类模板
- 是否按币种波动率动态设置 `pullbackTolerancePct`

---

## 5. 参数录入口径

### 5.1 Telegram `/strategyadd`

当前 TG Bot 支持的格式：

```text
/strategyadd <mint> pct_change_up <windowMin> <thresholdPct> [cooldownSec]
/strategyadd <mint> pct_change_down <windowMin> <thresholdPct> [cooldownSec]
/strategyadd <mint> breakout_up <targetPrice> [cooldownSec]
/strategyadd <mint> breakout_down <targetPrice> [cooldownSec]
/strategyadd <mint> entry_long <lookbackMin> <fastWindowMin> <slowWindowMin> <targetPct> [cooldownSec] [breakoutTolerancePct] [minTrendPct]
/strategyadd <mint> entry_rebound <lookbackMin> <fastWindowMin> <slowWindowMin> <targetPct> [cooldownSec] [minReboundPct] [maxDistanceFromLowPct]
/strategyadd <mint> pullback_to_ma <lookbackMin> <fastWindowMin> <slowWindowMin> <targetPct> [cooldownSec] [pullbackTolerancePct] [minTrendPct]
```

### 5.2 Dashboard

Dashboard 的策略管理面板与 TG Bot 的参数口径基本一致：

- `pct_change_*`：`windowMin` + `thresholdPct`
- `breakout_*`：`targetPrice`
- `entry_long`：`lookbackMin`、`fastWindowMin`、`slowWindowMin`、`targetPct`、`breakoutTolerancePct`、`minTrendPct`
- `entry_rebound`：`lookbackMin`、`fastWindowMin`、`slowWindowMin`、`targetPct`、`minReboundPct`、`maxDistanceFromLowPct`
- `pullback_to_ma`：`lookbackMin`、`fastWindowMin`、`slowWindowMin`、`targetPct`、`pullbackTolerancePct`、`minTrendPct`

---

## 6. 当前实现的几个重要事实

为了后续迭代不踩坑，建议牢记下面几点：

- `pct_change_*` 用的是“窗口最早样本”做基线，不是区间最低/最高点
- `breakout_*` 只看前一拍与当前拍，不看长窗口
- `entry_long` 的 `targetPct` 不参与实时触发，只参与提醒与回测目标
- `entry_rebound` 的 `targetPct` 也不参与实时触发，只参与提醒与回测目标
- `pullback_to_ma` 的 `targetPct` 同样不参与实时触发，只参与提醒与回测目标
- `cooldown` 和 `dedupe` 会影响“是否发出提醒”，但不改变“理论上是否命中信号”
- 触发规则和回测规则不是同一层：
  - 触发规则在 `strategy-engine.ts`
  - 回测评估窗口在 `backtest-engine.ts`

---

## 7. 建议的迭代记录方式

后续每次优化某个信号时，建议按下面模板补充实验记录：

### 策略名称

- 信号类型：
- 调整前参数：
- 调整后参数：
- 预期改善点：

### 回测观察

- 样本数：
- 命中率：
- 平均最大收益：
- 平均达标时间：
- 误报案例：

### 实盘观察

- 提醒频率：
- 人工主观质量：
- 是否过早：
- 是否过晚：
- 是否容易重复：

这样可以逐步把“感觉在调参数”变成“有证据地迭代策略”。
