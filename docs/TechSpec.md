# Technical Specification

## 1. 技术栈 (Stack)
* **语言:** TypeScript (Node.js)
* **后端:** Fastify 或 Express
* **前端:** Next.js + Tailwind CSS + Shadcn UI (追求极简高质感)
* **数据库:** Supabase
* **Solana 交互:** @solana/web3.js, Helius SDK (用于 Webhooks)
* **通知:** Telegraf (Telegram Bot API)

## 2. 数据模型 (Schema)
* **Addresses 表:** `id, address, label, is_active, created_at`
* **Logs 表:** `id, address, signature, type, token_info, amount, timestamp`

## 3. 核心逻辑流

1. Helius Webhook 接收交易数据 -> 2. 后端解析逻辑 -> 3. 存入 Supabase -> 4. 发送 TG 消息。