# 回测指标升级设计

本文定义回测从“单窗口 hit / miss”升级到“多窗口 + MFE / MAE + 期望收益”的设计方案，目标是减少单一 `lookaheadMin` 对信号评价的扭曲。

---

## 1. 问题背景

当前回测主要回答一个问题：

- 信号触发后，在固定 `lookaheadMin` 时间内，价格是否达到 `targetPct`

这个定义简单、直观，也适合第一阶段筛信号，但它有两个明显问题：

1. **窗口过短会错杀**
   - 某些信号方向正确，但上涨节奏偏慢
   - 结果是 `hitRate` 被低估

2. **窗口过长会美化**
   - 某些信号本来没有快速 follow-through
   - 但因为观察时间足够长，最终也会被算成命中

因此，只用单一 `hitRate` 会把“方向质量”和“时间效率”混在一起。

---

## 2. 升级目标

升级后的回测需要同时回答下面四类问题：

1. **命中效率**
   - 多久能达到目标
   - 在不同窗口下命中率如何变化

2. **有利波动**
   - 即使没 hit，曾经最多涨到多少

3. **不利波动**
   - 触发后曾经最大回撤多少

4. **持有结果**
   - 如果持有到窗口结束，收益大概如何

也就是说，回测要从：

- “有没有 hit”

升级成：

- “涨得快不快”
- “涨得够不够”
- “回撤疼不疼”
- “持有到结束值不值得”

---

## 3. 新增指标定义

### 3.1 样本级指标

每个触发样本新增：

- `mfePrice`
- `mfePct`
- `maePrice`
- `maePct`
- `endPrice`
- `endReturnPct`

定义如下：

- **MFE (Maximum Favorable Excursion)**
  - 窗口内出现过的最高价
  - `mfePct = (mfePrice - entryPrice) / entryPrice * 100`

- **MAE (Maximum Adverse Excursion)**
  - 窗口内出现过的最低价
  - `maePct = (maePrice - entryPrice) / entryPrice * 100`
  - 通常为负值，越负说明回撤越深

- **End Return**
  - 持有到窗口结束时的近似收益
  - `endReturnPct = (endPrice - entryPrice) / entryPrice * 100`

### 3.2 汇总级指标

每个回测 summary 新增：

- `avgMfePct`
- `avgMaePct`
- `avgEndReturnPct`

用于回答：

- 平均最多能涨到哪里
- 平均会先挨多大回撤
- 如果机械持有到窗口结束，大概结果如何

---

## 4. 多窗口评价

### 4.1 为什么要多窗口

不同策略适合的 follow-through 时间尺度不同：

- `failed_breakdown` 往往应该更快验证
- `entry_rebound` 通常比底部尝试更慢一点
- `pullback_to_ma` 和 `entry_long` 往往可以接受更长的延续时间

因此，不能要求所有策略都用一个统一窗口判断优劣。

### 4.2 新增 `windowMetrics`

每次回测除了返回主窗口 summary，还应返回：

- `windowMetrics[]`

每个元素至少包含：

- `lookaheadMin`
- `resolvedSignals`
- `skippedSignals`
- `hits`
- `hitRate`
- `avgMfePct`
- `avgMaePct`
- `avgEndReturnPct`
- `avgMinutesToHit`

这样前端可以直接展示：

- `60m`
- `120m`
- `180m`
- `240m`
- `360m`

下同一策略的表现变化。

---

## 5. 窗口选择原则

### 5.1 研究阶段

研究时不建议只看单窗口，应至少比较 4~5 个窗口。

建议默认窗口：

- `failed_breakdown`
  - `60 / 120 / 180 / 240`
- `entry_rebound`
  - `120 / 180 / 240 / 360`
- `pullback_to_ma`
  - `120 / 180 / 240 / 360`
- `entry_long`
  - `90 / 180 / 240 / 360`

### 5.2 实盘阶段

实盘窗口建议不靠主观拍脑袋，而应参考历史命中时间分布：

- 看 `minutesToHit` 的 `P50 / P75 / P90`
- 常规上可先使用 `P75` 附近作为主窗口

这样可以兼顾：

- 不把窗口设得过短
- 也不把太慢的后知后觉上涨都算进来

### 5.3 底部信号的窗口原则

对于底部尝试类信号，窗口应更严格：

- 如果信号质量足够高，通常会较快出现收复
- 如果只有很长窗口才成立，说明信号本身不够干净

因此：

- `failed_breakdown` 主研究窗口建议优先看 `120m`
- 再辅助看 `180m` / `240m`

---

## 6. 评价口径

### 6.1 不再只看 `hitRate`

升级后不建议只用单一 `hitRate` 评价策略。

更合理的观察顺序是：

1. `resolvedSignals`
2. `hitRate`
3. `avgMfePct`
4. `avgMaePct`
5. `avgEndReturnPct`
6. `avgMinutesToHit`

### 6.2 信号优劣的典型模式

**类型 A：高 hit，高 MFE，低 MAE**

- 最理想
- 说明信号稳定且进场后回撤不大

**类型 B：低 hit，但高 MFE**

- 可能适合做分批止盈或更低 target
- 不一定是烂信号

**类型 C：高 hit，但低 end return**

- 说明只是“勉强摸到目标”
- 可能持续性一般

**类型 D：高 MFE，但极高 MAE**

- 说明信号方向可能没错，但进场位置太早或太疼

---

## 7. API 与前端升级范围

### 7.1 引擎

`src/lib/backtest-engine.ts` 需要：

- 样本级新增 `mfe/mae/endReturn`
- summary 新增 `avgMfePct/avgMaePct/avgEndReturnPct`
- 导出 `windowMetrics`

### 7.2 API

`POST /api/price-backtest` 需要支持：

- 传入主窗口 `lookahead_min`
- 可选传入 `window_minutes`
- 若未传入，则按策略类型自动给默认窗口集合

### 7.3 Dashboard

`Signal Backtest` 面板需要新增：

- 主窗口核心指标
- `windowMetrics` 表格
- 每个样本的 `MFE / MAE / End Return`

---

## 8. 与优化器的关系

本轮升级先聚焦回测结果可解释性，不强制同时改优化器。

优化器下一阶段可以进一步吸收：

- `avgMfePct`
- `avgMaePct`
- 多窗口稳定性

也就是从“单窗口打分”走向：

- “主窗口表现 + 相邻窗口稳定性”的综合评分

---

## 9. 当前实施顺序

按文档优先原则，建议实施顺序为：

1. 先升级回测文档
2. 再升级回测引擎
3. 再升级 API
4. 最后升级 Dashboard 展示

本次实现将严格按照这个顺序推进。
