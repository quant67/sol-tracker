# 代币榜单技术说明

## 1. 技术目标

基于现有 `logs`、`addresses`、`people` 数据生成按时间窗口聚合的代币榜单。核心口径是“有多少监控人买过这个代币”，人员去重优先级高于地址去重。

## 2. 约束与风险

- `logs` 当前保存地址和 `token_info` JSON，人员维度需要通过 `addresses.person_id` 关联。
- 历史日志可能缺少 `token_info.name`、`token_info.symbol`、`token_info.marketCap`。
- 同一人可能有多个地址，同一窗口内多次买入同一 CA 只计一次。
- Next.js API 需要避免一次性返回过多日志，先按最大窗口 `15d` 做时间过滤。
- 市值是快照值，榜单显示的是最近日志或 resolver 获取到的可用值。

## 3. 选定方案

### API

新增 `GET /api/token-leaderboard?window=1d|3d|7d|15d&sort=buyers_desc`。

返回结构：

```ts
type TokenLeaderboardItem = {
  mint: string;
  symbol: string;
  name: string;
  marketCap: number | null;
  lastBuyMarketCap: number | null;
  priceChangePct: number | null;
  buyerCount: number;
  buyers: string[];
  lastBoughtAt: string;
};
```

聚合流程：

1. 校验 `window`，换算起始时间。
2. 查询 `logs` 中窗口内的买入记录。
3. 收集日志地址，查询对应 `addresses` 和 `people`。
4. 以 `token_info.mint` 作为 CA 聚合。
5. 每个 CA 内用 `person_id` 去重；缺少 `person_id` 时使用 `token_info.personName` 兜底。
6. 代币名称和当前市值优先通过 DexScreener 批量查询，缺失时调用 `resolveTokenInfo(mint)`。
7. `priceChangePct` 使用当前市值相对最近一次买入日志市值计算。
8. 默认按 `buyerCount` 降序，次级按 `lastBoughtAt` 降序。

### UI

新增 `TokenLeaderboard` 组件并挂到首页 `DashboardStats` 下方或 `RecentActivity` 上方。

交互：

- 使用四段式窗口切换按钮。
- 默认窗口为 `1d`。
- 排序控件默认 `监控人数降序`。
- 每条记录提供 DexScreener 链接。
- CA 使用短地址展示，完整地址放入 `title` 并支持复制。
- 人员名单以紧凑 badge 或逗号列表展示。

## 4. 数据口径

- 只统计买入。
- 买入识别优先使用 `token_info.action === "BUY"`，再兼容 `type` 包含 `BUY`。
- 监控人数统计使用唯一人员集合。
- 人名展示使用当前 `people.name`；缺失时使用日志内 `token_info.personName`。
- 单个 CA 多条日志保留最新 `marketCap/name/symbol`。
- 变化百分比以最近一次买入日志的 `marketCap` 为基准。

## 5. 测试与验证

- API 单元或脚本级测试覆盖窗口校验、地址到人员去重、排序。
- UI 验证四个窗口切换、加载态、空状态、长 CA、长人名。
- 运行 `npm run lint`。
- 本地启动 `npm run dev` 后检查 Dashboard 首屏和移动端布局。

## 6. 后续扩展

- 增加买入金额、最近买入时间、首次买入时间。
- 增加按市值、最近买入时间排序。
- 增加 SQL view 或 materialized view 以支撑更大数据量。
- 增加 Telegram 每日榜单推送。
