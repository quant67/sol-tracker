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

优化器会在这三类 entry 型策略里搜索：

- `entry_long`
- `entry_rebound`
- `pullback_to_ma`

这三类分别对应：

- **延续突破**
- **低点反弹**
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

当前评分综合考虑：

- `hitRate`
- `avgMaxReturnPct`
- `resolvedSignals`
- `avgMinutesToHit`

并对低样本策略加惩罚：

- `resolvedSignals < 4` 重罚
- `resolvedSignals < 8` 轻罚

此外实现了一个轻量版稳定性检查：

- 先把历史数据切分成训练段和验证段
- 对训练 / 验证 / 全量分别计算得分
- 最终得分会扣除一定的稳定性惩罚，避免完全靠单一时段过拟合

---

## 5. 推荐使用方式

### 5.1 发现 token 后

1. 把 token 加入 watchlist
2. 打开 `Strategy Optimizer`
3. 用 `30d + 15m + balanced` 先跑第一轮
4. 看推荐列表里：
   - 样本数是否足够
   - 命中率是否合理
   - 平均最大收益是否有交易价值

### 5.2 选择策略时

建议优先选：

- `resolvedSignals` 足够
- `hitRate` 与 `avgMaxReturnPct` 平衡
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
