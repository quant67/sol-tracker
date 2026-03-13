# Telegram Bot 开发与扩展文档

此文档主要介绍独立运行在项目底层的 Telegram 交互机器人 `scripts/tg-bot.ts`，方便未来为 Sol-Tracker 扩展更多功能。

## 1. 设计初衷

由于 Next.js 部署环境（特别是 `webhook` 路由本身）具有瞬态（Serverless）特性，不适合长连接监听 Telegram 返回的用户命令指令。因此，我们将发出“交易报警推送”与“命令接收面板”区分开来：

1. 交易推送继续由 Next.js 的服务端 Webhook `src/lib/telegram.ts` 负责调用简单的 Telegram API 触发送出。
2. 而命令交互能力则通过 `scripts/tg-bot.ts` 脚本进行长连接轮询 (Long Polling)，使用功能丰富的 `telegraf` 库。

在 VPS 上，它们统一由 `ecosystem.config.js` 托管启动进程。

## 2. 运行机制

- 采用 [Telegraf.js](https://telegraf.js.org/) 框架进行封装。
- 环境变量单独读取。部署在生产时，文件会读取 `__dirname/../.env` 获取环境变量（如 `TELEGRAM_BOT_TOKEN`、`SUPABASE_URL` 及其凭证）。
- 通过 `bot.telegram.setMyCommands` 在启动时动态向 Telegram 注册菜单列表，这能让前端 Telegram 聊天栏左下角直接出现可选列表（`/setmc` 等）。

## 3. 如何增加新功能开发

新增 Telegram 指令只需打开 `scripts/tg-bot.ts` 按模版填入即可。

### 示例 1: 增加一条简单的回复指令

在 `bot.launch()` 之前添加：

```typescript
bot.command('ping', (ctx) => {
    ctx.reply('Pong! 当前服务运行正常。');
});
```

别忘了去 `setMyCommands` 里面把它注册到菜单上：

```typescript
bot.telegram.setMyCommands([
    { command: 'setmc', description: '设置报警最低市值门槛 (示例 500k)' },
    { command: 'ping', description: '检查机器人是否存活' } // <-- 添加这行
]);
```

### 示例 2: 与 Supabase 交互 (例如增删白名单 Token)

Telegraf 采用完全异步执行风格（Context 参数为 `ctx`），结合项目中配好的 `supabase` 客户端调用即可。

```typescript
bot.command('addtoken', async (ctx) => {
    // 解析指令
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) return ctx.reply('⚠️ 使用指南: /addtoken <ca>');
    
    // 假定有 token_whitelist 数据库表
    const tokenAddress = parts[1];
    
    try {
        const { error } = await supabase.from('token_whitelist').insert({ address: tokenAddress });
        if (error) throw error;
        return ctx.reply(`✅ 成功添加监控白名单:\n<code>${tokenAddress}</code>`, { parse_mode: 'HTML' });
    } catch (e) {
        return ctx.reply('❌ 数据库插入出错');
    }
});
```

### 示例 3: 限制机器人只能特定人员使用

我们的机器人面向群组进行推送时，可能会被其他人输入指令乱改配置。考虑到安全性，我们只允许某些经过认证的用户 ID 才能触发。

```typescript
// 在顶部编写一个认证拦截中间件
bot.use(async (ctx, next) => {
    // ctx.from.id 可以获取到说话人的 Telegram UID
    const ALLOWED_ADMINS = [ 12345678, 87654321 ]; // 从环境变量或数据库读取更安全
    
    if (ctx.from && ALLOWED_ADMINS.includes(ctx.from.id)) {
        await next(); // 放行
    } else {
        // 非管理员不作任何理会或回应特定消息
        await ctx.reply('⚠️ 您没有权限执行此命令。');
    }
});
```

## 4. 调试与部署

- **本地调试**：在你修改完代码之后，在当前根目录执行 `npm run bot`。
- **验证热更新**：因为没有集成 `nodemon` 等热重载监视工具，你在本地写完 `bot.command(xxx)` 以后需要 `Ctrl+C` 断开并重新 `npm run bot`。
- **发布生产环境**：只需要使用基础工作流 `git add .`, `git commit -m "bot: xxx"`, `git push origin main` 即可。VPS 的 PM2 自动读取 `ecosystem.config.js` 重新拉起独立 Bot 进程。
- **查看线上日志**：`pm2 logs sol-tracker-bot`。
