# 底部信号研究设计

本文用于整理“局部底部 / 波段底部”类信号的研究方向，并给出首个实验策略 `failed_breakdown` 的定义，方便后续回测、优化和迭代。

---

## 1. 研究目标

当前系统已经覆盖：

- `entry_long`：趋势延续
- `entry_rebound`：局部低点反弹
- `pullback_to_ma`：趋势回踩再启动

但这三类更偏：

- 已经开始反弹后入场
- 或趋势恢复后的二次上车

对于“跌势末端 → 底部形成 → 反转确认”这一段，仍缺一组更清晰的实验信号。

本研究的目标是：

1. 把“底部”从模糊概念拆成可量化条件
2. 避免把最低点猜测当成信号本身
3. 在现有 close-based 数据结构下，先落一个能回测的实验版本
4. 为后续升级到完整 OHLCV / volume 版本预留结构

---

## 2. 研究原则

### 2.1 不追求抄到绝对最低点

系统更应该识别：

- 跌势是否已经衰竭
- 局部低点是否开始被承接
- 价格是否重新站回结构上方

而不是试图在最低 tick 直接买入。

### 2.2 底部识别应分三层

底部信号建议统一拆成：

1. **背景层**：先确认经历了足够回撤
2. **止跌层**：确认价格不再顺畅创新低
3. **确认层**：确认价格重新回到结构之上

### 2.3 优先做结构型信号

单纯“跌很多了”不够。

优先研究：

- 假跌破
- 恐慌出清后收复
- 底部横盘突破
- 二次回踩不破低点

这些比单看超跌数值更适合系统化。

---

## 3. 当前数据条件与限制

当前监控与回测主链路里，策略引擎主要使用的是：

- `price`
- `capturedAtMs`

也就是更接近 **close-only** 的序列。

这意味着目前难以直接识别：

- 长下影线
- 单根 K 线假跌破后收回
- 真实成交量放大 / 缩量
- 盘中刺破再快速收回

因此第一阶段的底部实验只能做：

- **close-based proxy（基于收盘序列的近似底部信号）**

这不是最终形态，但足够先筛选哪些方向值得继续投入。

---

## 4. 建议研究的底部信号族

### 4.1 `failed_breakdown`

**定位：**

- 前面先经历一段明显回撤
- 价格贴近或短暂跌到局部低点附近
- 随后快速重新站回结构之上

**适合：**

- 你想捕捉“局部低点被承接”的第一脚修复
- 比普通 `entry_rebound` 更强调“假跌破 / 跌不下去”

**第一阶段实现：**

- 使用 close-based 近似版
- 不依赖 wick / volume

### 4.2 `capitulation_reclaim`

**定位：**

- 极端抛压后快速收复

**挑战：**

- 更依赖 OHLC + volume
- 当前数据下不适合先做

### 4.3 `base_breakout`

**定位：**

- 大跌后先筑底横盘
- 再向上突破底部区间

**优点：**

- 更稳，更接近确认型底部

**缺点：**

- 入场更晚

### 4.4 `higher_low_reversal`

**定位：**

- 第一次探底后反弹
- 第二次回踩形成更高低点
- 再站回均线

**优点：**

- 结构清晰

**缺点：**

- 数据和规则设计会更复杂

---

## 5. 实验优先级

建议优先级：

1. `failed_breakdown`
2. `base_breakout`
3. `higher_low_reversal`
4. `capitulation_reclaim`

原因：

- `failed_breakdown` 最贴近“局部低点反弹”的交易直觉
- 在当前 close-based 数据条件下最容易先落地
- 它和现有 `entry_rebound` 有相邻但不重复的定位，便于横向比较

---

## 6. `failed_breakdown` 实验版定义

### 6.1 策略定位

`failed_breakdown` 是一个 **底部尝试型信号**。

它不是在趋势完全修复后进场，而是试图捕捉：

- 价格已经深度回撤
- 价格贴近局部低点
- 随后出现一段快速收复

### 6.2 参数

实验版先使用以下参数：

- `lookbackMin`
- `fastWindowMin`
- `slowWindowMin`
- `targetPct`
- `reclaimPct`
- `maxDistanceFromLowPct`
- `minDrawdownPct`

### 6.3 触发逻辑

在 `lookbackMin` 窗口内计算：

- `recentHigh`
- `recentLow`
- `fastMA`
- `slowMA`

再计算：

- `reboundPct = (currentPrice - recentLow) / recentLow * 100`
- `drawdownFromHighPct = (recentHigh - currentPrice) / recentHigh * 100`
- `previousDistanceFromLowPct = (previousPrice - recentLow) / recentLow * 100`

实验版要求同时满足：

1. **已有足够回撤**
   - `drawdownFromHighPct >= minDrawdownPct`

2. **上一拍贴近局部低点**
   - `previousDistanceFromLowPct <= reclaimPct`

3. **当前已从低点收回**
   - `reboundPct >= reclaimPct`
   - `reboundPct <= maxDistanceFromLowPct`

4. **重新站回短结构**
   - `currentPrice >= fastMA`
   - `fastMA >= slowMA * 0.99`

5. **至少有一拍反转确认**
   - `currentPrice > previousPrice`

### 6.4 设计意图

这组条件不是在问：

- “是不是最低点”

而是在问：

- “价格是不是已经在低点附近跌不下去，并开始被重新拉起”

### 6.5 与 `entry_rebound` 的区别

`entry_rebound` 更偏：

- 从局部低点弹起来了
- 并站回短期结构

`failed_breakdown` 更强调：

- 先有明显回撤背景
- 上一拍确实贴近低点
- 当前这一拍才开始确认收回

所以它更接近：

- **底部首次修复**

而 `entry_rebound` 更像：

- **反弹过程中择时进入**

---

## 7. 评估重点

研究 `failed_breakdown` 时，不应只看 `hitRate`。

建议同时关注：

- `resolvedSignals`
- `hitRate`
- `avgMaxReturnPct`
- `avgMinutesToHit`
- 不同 token 上是否稳定

尤其要看：

- 它是否真的比 `entry_rebound` 更早
- 更早的同时，是否带来了可接受的 hit rate

如果只是更早、但误报大量增加，就不值得保留。

---

## 8. 下一阶段升级方向

如果 `failed_breakdown` 在 close-based 实验里表现不错，下一步应升级为完整 K 线版：

- 加入 `open/high/low/close`
- 加入成交量
- 引入真正的“跌破后收回”
- 引入“放量出清 + 缩量回踩 + 再放量上行”

到那时可以进一步拓展：

- `capitulation_reclaim`
- `base_breakout`
- `higher_low_reversal`

---

## 9. 当前结论

底部信号不应直接建模为“抄底点”，而应建模为：

- 深度回撤背景
- 局部止跌
- 结构收复

在当前数据条件下，最适合作为第一实验策略的是：

- `failed_breakdown`

它既符合“局部低点反弹”的交易场景，也能在现有系统架构中快速接入并验证效果。
