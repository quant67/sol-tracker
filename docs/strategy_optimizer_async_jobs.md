# Strategy Optimizer 异步任务化设计

本文定义如何把 `Strategy Optimizer` 从“同步 HTTP 请求内直接计算”升级为“Web 提交任务 + Worker 异步执行”的架构，目标是避免单次优化阻塞主 Web 进程，拖慢整个 Dashboard。

---

## 1. 背景

当前优化链路是：

1. 前端点击 `Optimize Strategy`
2. `POST /api/strategy-optimize`
3. Web 进程同步执行：
   - 读取 watch token
   - 拉取外部历史数据
   - 搜索参数
   - 计算多窗口稳定性
4. 直接返回优化结果

这个模式在功能上简单，但有两个明显问题：

1. **重计算阻塞主 Web**
   - 优化器本身是 CPU 密集型
   - 还会叠加外部 API 请求和缓存 IO
   - 在单实例 Node Web 进程下，容易把其它轻接口一起拖慢

2. **体验上只能“长请求等待”**
   - 用户点击后只能等待
   - 一旦 Nginx / upstream 超时，就只能看到失败
   - 无法展示任务进度、排队状态、历史结果

---

## 2. 目标

升级后的目标是：

1. Web 进程只负责：
   - 创建任务
   - 查询状态
   - 返回结果

2. 独立 Worker 进程负责：
   - 拉取历史数据
   - 执行优化
   - 写回结果或错误

3. 前端改成：
   - 提交任务
   - 轮询任务状态
   - 完成后渲染结果

4. 外部 API 节流更可控：
   - 单 worker 顺序执行
   - 避免多个请求并发打 GeckoTerminal

---

## 3. 数据模型

新增表：

- `strategy_optimization_jobs`

建议字段：

- `id`
- `watch_token_id`
- `mint`
- `history_days`
- `interval`
- `style`
- `status`
  - `queued`
  - `running`
  - `completed`
  - `failed`
- `progress_message`
- `provider`
- `pool_address`
- `pool_name`
- `result_json`
- `error_message`
- `attempt_count`
- `requested_by`
- `created_at`
- `started_at`
- `finished_at`
- `updated_at`

其中：

- `result_json` 直接存优化结果，第一阶段不额外拆结果表
- `progress_message` 用于前端展示当前阶段
- `attempt_count` 为后续失败重试预留

---

## 4. 新工作流

### 4.1 提交任务

前端调用：

- `POST /api/strategy-optimize/jobs`

请求体：

```json
{
  "watch_token_id": "uuid",
  "history_days": 30,
  "interval": "15m",
  "style": "balanced"
}
```

接口只做：

1. 参数校验
2. 查 token 基本信息
3. 写一条 `queued` job
4. 返回 `job`

### 4.2 Worker 执行

独立脚本：

- `scripts/strategy-optimizer-worker.ts`

Worker 循环逻辑：

1. 找最早的 `queued` job
2. 抢占并标记为 `running`
3. 更新 `progress_message`
4. 拉历史数据
5. 执行优化器
6. 写入 `result_json`
7. 标记为 `completed`

若失败：

1. 记录 `error_message`
2. 标记为 `failed`

### 4.3 前端轮询

前端拿到 `job.id` 后，轮询：

- `GET /api/strategy-optimize/jobs/:id`

状态展示：

- `queued`
- `running`
- `completed`
- `failed`

完成后从 `result_json` 取结果，沿用当前推荐列表 UI。

---

## 5. API 设计

### 5.1 `POST /api/strategy-optimize/jobs`

用途：

- 创建优化任务

返回：

- `job`

### 5.2 `GET /api/strategy-optimize/jobs/:id`

用途：

- 查询单个任务状态与结果

返回：

- `job`

### 5.3 `GET /api/strategy-optimize/jobs`

用途：

- 查询最近任务列表
- 可按 `watch_token_id` 过滤

---

## 6. 并发策略

第一阶段建议：

- 只启动 **1 个 optimizer worker**
- Worker 一次只处理 **1 个 job**

原因：

- GeckoTerminal 公共接口容易 `429`
- 当前优化任务以人工触发为主，不需要高并发
- 单并发最容易保证：
  - 节流
  - 可观测性
  - 结果可复现

后续如果需要扩展，可以再增加：

- 同 token 互斥
- 去重提交
- 优先级队列

---

## 7. 去重与复用

第一阶段可先做轻量去重：

如果存在同参数且状态为：

- `queued`
- `running`

则直接返回这条旧 job，而不是重复创建。

如果存在最近刚完成的相同参数 job，也可以直接复用结果，但这一步不是首批必做项。

---

## 8. 失败处理

### 8.1 外部接口失败

例如：

- GeckoTerminal `429`
- pool 未找到
- 历史数据不足

处理方式：

- 任务标记为 `failed`
- 记录 `error_message`
- 前端直接显示具体失败原因

### 8.2 Worker 进程异常退出

因为任务状态持久化在数据库中：

- 未完成的 `running` job 可能会遗留

第一阶段可在 worker 启动时做一次恢复：

- 把“长时间卡在 `running`”的任务重置为 `queued`
- 或标记为 `failed`

为保持实现简单，建议先设一个保守阈值，例如：

- `started_at` 超过 30 分钟仍未完成

---

## 9. 部署方式

在 PM2 中新增一个独立进程：

- `sol-tracker-optimizer-worker`

这样部署后会同时有：

- `sol-tracker`
- `sol-tracker-bot`
- `sol-tracker-monitor`
- `sol-tracker-optimizer-worker`

Worker 不对外提供 HTTP，仅负责执行任务。

---

## 10. 前端交互原则

优化按钮点击后：

1. 立即进入 `Submitting`
2. 创建 job 成功后进入 `Queued / Running`
3. 展示 `progress_message`
4. 轮询直到：
   - `completed`
   - `failed`

一旦完成：

- 直接渲染推荐列表
- 保留当前 “Apply Strategy / Apply All Featured” 行为

---

## 11. 实施顺序

按“文档优先”原则，实施顺序建议：

1. 新增异步任务设计文档
2. 新增数据库迁移
3. 新增 worker 脚本
4. 新增 job API
5. 前端改为异步轮询
6. 更新 PM2 配置与技术文档
7. 最后保留或降级旧同步入口

---

## 12. 第一阶段边界

第一阶段有意保持轻量：

- 不引入 Redis / BullMQ
- 不引入额外消息队列服务
- 不做多 worker 并发调度
- 不做任务取消
- 不做自动定时重优化

先解决最核心问题：

- **不要再让优化任务阻塞主 Web 进程**
