# Strategy Optimizer 工作流

本文描述“发现一个适合波段交易的 token → 加入 watchlist → 自动拉历史数据回测 → 推荐最佳策略参数 → 一键应用”的最小可用流程。

## 1. 目标场景

适用场景：

- 你发现一个新 token 适合波段交易
- 想先看过去 `1 ~ 30` 天内哪类入场信号更适合它
- 希望系统自动给出参数建议，而不是手工调 `lookbackMin`、`fastWindowMin`、`slowWindowMin`

这个工作流将“实盘监控”和“历史研究”拆开：

- **实时监控**：仍然使用 `price_snapshots`
- **历史研究**：优先使用外部历史数据源拉取 OHLCV，再喂给回测引擎

---

## 2. 当前实现（MVP）

### 2.1 Dashboard 面板

新增 `Strategy Optimizer` 面板：

- 选择已在 watchlist 中的 token
- 选择历史窗口：`1 ~ 30` 天
- 选择 K 线粒度：`5m` / `15m` / `1h`
- 选择风格：`conservative` / `balanced` / `aggressive`
- 点击 `Optimize Strategy`

优化完成后，系统会展示：

- 数据来源
- 选中的主 pool
- 实际使用的 candles 数量
- 每个策略类型的独立最优参数
- 综合推荐列表
- 每条推荐的参数、lookahead 和关键回测指标

用户可以直接点击 `Apply Strategy` 把推荐参数写入 `price_strategies`。

如果希望三类风格都先保留一套实盘配置，也可以点击：

- `Apply All Featured`

它会把 `entry_long`、`entry_rebound`、`pullback_to_ma` 当前各自的最优参数一并写入策略表，方便后续并行观察。

### 2.2 API

新增优化 API：

- `POST /api/strategy-optimize`

请求参数：

```json
{
  "watch_token_id": "uuid",
  "history_days": 30,
  "interval": "15m",
  "style": "balanced"
}
```

返回内容包括：

- token 基本信息
- 历史数据来源与 pool 信息
- candles 时间范围
- 最优策略
- 推荐列表

---

## 3. 历史数据方案

### 3.1 为什么不直接依赖 `price_snapshots`

`price_snapshots` 更适合实时监控：

- 长度受保留时长限制
- 采样频率固定
- 不一定覆盖 token 完整研究窗口

所以优化器默认改成“按需拉历史数据”：

- 输入 token
- 自动找到主 pool
- 拉取 OHLCV
- 标准化成回测序列

### 3.2 当前 provider

当前实现使用：

- **GeckoTerminal Public API**

流程：

1. 调用 token pools 接口获取该 mint 的候选 pool
2. 用 `reserve_in_usd` + `24h volume` 选出主 pool
3. 分页拉取 OHLCV
4. 用 close price 生成 `{ price, capturedAtMs }[]`
5. 写入本地缓存

本地缓存路径：

- `.cache/historical-price/`

缓存目的是：

- 避免重复调用外部 API
- 让同一个 token 的重复优化更快
- 不污染业务数据库

---

## 4. 优化器逻辑

### 4.1 当前候选策略

优化器会在这四类 entry / swing 型策略里搜索：

- `entry_long`
- `entry_rebound`
- `failed_breakdown`
- `pullback_to_ma`

这三类分别对应：

- **延续突破**
- **低点反弹**
- **假跌破收复（实验）**
- **趋势回踩中继**

当前展示方式分成两层：

1. **Best By Strategy Type**
   - `entry_long` 单独选出本类型最优
   - `entry_rebound` 单独选出本类型最优
   - `pullback_to_ma` 单独选出本类型最优

2. **Overall Leaderboard**
   - 仍然保留综合评分榜
   - 但榜单会优先保证每种策略至少出现一条最优解，再补充剩余高分参数

这样可以避免某一类策略在总榜里“刷屏”，导致其它风格完全看不到。

### 4.2 风格 preset

当前通过 `style` 控制参数搜索空间：

- `conservative`
- `balanced`
- `aggressive`

每种风格会影响：

- 候选参数范围
- lookahead 候选集合
- 窗口长度对应的 K 线根数

为了兼容 `5m / 15m / 1h` 三种粒度，优化器内部不再直接使用固定分钟窗口，而是先按“多少根 K 线”定义搜索空间，再根据 interval 转换成分钟参数写回策略。

例如：

- `15m` 下的 `fastWindowMin=60` 代表最近 `4` 根 K 线
- `1h` 下的 `slowWindowMin=480` 代表最近 `8` 根 K 线

这样可以避免在大粒度 K 线下因为窗口过短导致“全量零信号”的假优化结果。

### 4.3 评分方式

优化器不再只看“单一主窗口 summary”。

当前评分拆成两层：

1. **主窗口表现**
2. **多窗口稳定性**

#### 主窗口表现

主窗口仍然保留每个候选参数自己的 `lookaheadMin`，并优先观察：

- `resolvedSignals`
- `hitRate`
- `avgMfePct`
- `avgMaePct`
- `avgEndReturnPct`
- `avgMinutesToHit`

其中：

- `avgMfePct` 代表“信号后最多能走多远”
- `avgMaePct` 代表“进场后平均要先承受多深回撤”
- `avgEndReturnPct` 代表“如果机械持有到窗口结束，结果如何”

#### 多窗口稳定性

每个候选参数除了主窗口，还会按策略类型自动带出一组默认窗口：

- `failed_breakdown`
  - `60 / 120 / 180 / 240`
- `entry_rebound`
  - `120 / 180 / 240 / 360`
- `pullback_to_ma`
  - `120 / 180 / 240 / 360`
- `entry_long`
  - `90 / 180 / 240 / 360`

系统会把候选参数的主窗口自动并入这组窗口，形成完整的 `windowMetrics`。

多窗口稳定性重点回答：

- 这组参数是否只在一个窗口里好看
- 拉长或缩短观察窗口后，表现是否大幅失真
- `hitRate / avgEndReturnPct / avgMaePct` 是否在相邻窗口上仍然可接受

最终每个候选都会额外得到一组稳定性信息，例如：

- `qualifiedWindows`
- `totalWindows`
- `coveragePct`
- `scoreRange`
- `hitRateRange`
- `stabilityScore`

#### 最终综合分

最终分数由三部分共同决定：

1. 全量数据的“主窗口 + 多窗口”综合分
2. 训练段的综合分
3. 验证段的综合分

并额外扣除：

- 低样本惩罚
- 多窗口离散度惩罚
- 训练 / 验证明显掉档的稳定性惩罚

因此当前优化器更偏向选出：

- 主窗口表现不错
- 相邻窗口不崩
- 验证段没有明显塌陷

而不是只在一个 `lookaheadMin` 上恰好刷出最高命中率的参数。

#### 计算方式补充

为了避免部署环境下优化接口超时，优化器采用两阶段流程：

1. 先用主窗口做一轮粗筛
2. 再只对 shortlist 做“多窗口 + 训练/验证”完整评分

这样可以保留稳定性评分，同时把接口耗时控制在更可接受的范围内。

---

## 5. 推荐使用方式

### 5.1 发现 token 后

1. 把 token 加入 watchlist
2. 打开 `Strategy Optimizer`
3. 用 `30d + 15m + balanced` 先跑第一轮
4. 看推荐列表里：
   - 样本数是否足够
   - 命中率是否合理
   - `avgMfePct / avgEndReturnPct / avgMaePct` 是否还有交易价值

### 5.2 选择策略时

建议优先选：

- `resolvedSignals` 足够
- `hitRate`、`avgEndReturnPct`、`avgMaePct` 平衡
- 分数高且不是极端参数的那组

不要单纯追求：

- 最高命中率但样本极少
- 单次收益最好但重复性太差

### 5.3 应用后

应用推荐参数后：

- 策略会进入 `price_strategies`
- 后续由 `price-monitor.ts` 继续做实时监控
- 若后续 token 行为变化明显，可再次跑优化

### 5.4 命令行快速验证

除了 Dashboard，也可以直接用脚本做一次本地 smoke test：

```bash
node --import tsx /Users/sixseven/dev/ai-coding/sol-tracker/backtest-optimize.ts <mint> 7 15m balanced
```

参数含义：

- 第 1 个参数：mint
- 第 2 个参数：历史天数（`1 ~ 30`）
- 第 3 个参数：粒度（`5m` / `15m` / `1h`）
- 第 4 个参数：风格（`conservative` / `balanced` / `aggressive`）

这个脚本会输出：

- 命中的 pool
- 实际使用的 candles 数量
- 最优推荐
- 各策略类型的当前最优参数

---

## 6. 目前的边界

当前版本有意保持轻量：

- 不新增研究结果数据库表
- 不自动覆盖已有策略
- 不自动定时重优化
- 不做多 provider 自动切换
- 文件缓存写失败时自动降级为“仅本次内存执行”，不会因为部署环境只读而直接让优化失败

也就是说：

- 它现在是一个“**按需研究并推荐**”系统
- 而不是一个“自动改参数的黑盒系统”

---

## 7. 后续可继续演进的方向

下一阶段建议优先做：

- 保存优化结果历史（研究记录表）
- 增加 `Apply Best + Pause Others`
- 增加 `Birdeye` 作为 fallback provider
- 加入 `walk-forward` 更严格验证
- 对不同风格输出“主策略 + 候选策略”

这样系统会从“能推荐”进一步走向“能持续优化”。
