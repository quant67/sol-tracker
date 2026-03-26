import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { logToFile } from '../src/lib/logger';
import {
    evaluateStrategy,
    getMaxWindowMinutes,
    normalizeStrategy,
    type PricePoint,
    type StrategyDefinition,
} from '../src/lib/strategy-engine';

const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '.env'),
];

for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const envConfig = dotenv.parse(fs.readFileSync(p));
    for (const k in envConfig) process.env[k] = envConfig[k];
    break;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INTERVAL_SEC = Number(process.env.PRICE_MONITOR_INTERVAL_SEC || 20);
const RETENTION_HOURS = Number(process.env.PRICE_SNAPSHOT_RETENTION_HOURS || 48);

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials for price monitor.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface WatchTokenRow {
    id: string;
    mint: string;
    symbol: string | null;
    name: string | null;
    last_price: number | string | null;
    is_active: boolean;
}

interface PriceFetchResult {
    price: number;
    symbol: string | null;
    name: string | null;
    source: string;
}

function toNumber(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramMessage(message: string, chatId?: string | null): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN) {
        logToFile('TELEGRAM_BOT_TOKEN missing. Price alert suppressed.', 'INFO');
        return;
    }
    const targetChatId = chatId || TELEGRAM_CHAT_ID;
    if (!targetChatId) {
        logToFile('TELEGRAM_CHAT_ID missing. Price alert suppressed.', 'INFO');
        return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            }),
        });
        if (!response.ok) {
            const data = await response.text();
            logToFile(`Telegram send failed: ${response.status} ${data}`, 'ERROR');
        }
    } catch (error: unknown) {
        logToFile(`Telegram send exception: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
    }
}

async function fetchPriceFromDexScreener(mint: string): Promise<PriceFetchResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            signal: controller.signal,
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        if (!data?.pairs || !Array.isArray(data.pairs) || data.pairs.length === 0) return null;

        const sortedPairs = [...data.pairs].sort((a: any, b: any) => {
            const aLiq = Number(a?.liquidity?.usd || 0);
            const bLiq = Number(b?.liquidity?.usd || 0);
            return bLiq - aLiq;
        });

        const pair = sortedPairs[0];
        const price = Number(pair?.priceUsd || 0);
        if (!Number.isFinite(price) || price <= 0) return null;

        const tokenData = pair?.baseToken?.address === mint
            ? pair.baseToken
            : pair?.quoteToken?.address === mint
                ? pair.quoteToken
                : null;

        return {
            price,
            symbol: tokenData?.symbol || null,
            name: tokenData?.name || null,
            source: 'dexscreener',
        };
    } catch (error) {
        logToFile(`DexScreener lookup failed for ${mint.slice(0, 8)}: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function formatPrice(num: number): string {
    if (num >= 1) return num.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    if (num >= 0.01) return num.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    return num.toPrecision(6);
}

function formatPct(num: number): string {
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
}

function buildPriceAlertMessage(
    token: WatchTokenRow,
    strategy: StrategyDefinition,
    currentPrice: number,
    reason: string,
    snapshot: Record<string, unknown> | undefined,
): string {
    const symbol = token.symbol || 'TOKEN';
    const priceStr = formatPrice(currentPrice);
    const lines: string[] = [];
    lines.push(`📈 <b>Price Strategy Triggered</b>`);
    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`<b>Token:</b> ${symbol}`);
    lines.push(`<b>Mint:</b> <code>${token.mint}</code>`);
    lines.push(`<b>Strategy:</b> ${strategy.name}`);
    lines.push(`<b>Type:</b> ${strategy.type}`);
    lines.push(`<b>Price:</b> $${priceStr}`);
    lines.push(`<b>Reason:</b> ${reason}`);

    const changePct = toNumber(snapshot?.changePct);
    if (changePct !== null) {
        lines.push(`<b>Change:</b> ${formatPct(changePct)}`);
    }

    if (snapshot?.kind === 'entry_long') {
        const trendPct = toNumber(snapshot.trendPct);
        const targetPct = toNumber(snapshot.targetPct);
        const fastMA = toNumber(snapshot.fastMA);
        const slowMA = toNumber(snapshot.slowMA);
        const distanceFromHighPct = toNumber(snapshot.distanceFromHighPct);

        if (trendPct !== null) lines.push(`<b>Trend:</b> ${formatPct(trendPct)}`);
        if (distanceFromHighPct !== null) lines.push(`<b>From High:</b> ${formatPct(-distanceFromHighPct)}`);
        if (fastMA !== null && slowMA !== null) {
            lines.push(`<b>MA:</b> ${formatPrice(fastMA)} / ${formatPrice(slowMA)}`);
        }
        if (targetPct !== null) {
            lines.push(`<b>Target:</b> +${targetPct}% follow-through`);
        }
    }

    const dexLink = `<a href="https://dexscreener.com/solana/${token.mint}">DexScreener</a>`;
    const birdeyeLink = `<a href="https://birdeye.so/token/${token.mint}">Birdeye</a>`;
    lines.push(`🔗 ${dexLink} | ${birdeyeLink}`);

    return lines.join('\n');
}

async function strategyInCooldown(strategyId: string, cooldownSec: number): Promise<boolean> {
    const { data, error } = await supabase
        .from('price_alert_events')
        .select('triggered_at')
        .eq('strategy_id', strategyId)
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        logToFile(`Cooldown lookup failed for strategy ${strategyId}: ${error.message}`, 'ERROR');
        return false;
    }

    if (!data?.triggered_at) return false;
    const lastMs = new Date(data.triggered_at).getTime();
    const diffSec = (Date.now() - lastMs) / 1000;
    return diffSec < cooldownSec;
}

async function cleanupSnapshots(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
        .from('price_snapshots')
        .delete()
        .lt('captured_at', cutoff);
    if (error) {
        logToFile(`Snapshot cleanup failed: ${error.message}`, 'ERROR');
    }
}

async function processToken(token: WatchTokenRow, strategies: StrategyDefinition[]): Promise<void> {
    const priceData = await fetchPriceFromDexScreener(token.mint);
    if (!priceData) {
        logToFile(`Price not available for ${token.mint.slice(0, 8)}`, 'INFO');
        return;
    }

    const nowMs = Date.now();
    const maxWindow = Math.max(getMaxWindowMinutes(strategies), 1);
    const historySinceIso = new Date(nowMs - maxWindow * 60 * 1000).toISOString();

    const { data: snapshotRows, error: snapshotError } = await supabase
        .from('price_snapshots')
        .select('price, captured_at')
        .eq('watch_token_id', token.id)
        .gte('captured_at', historySinceIso)
        .order('captured_at', { ascending: true })
        .limit(1500);

    if (snapshotError) {
        logToFile(`Fetch snapshots failed for ${token.mint.slice(0, 8)}: ${snapshotError.message}`, 'ERROR');
    }

    const history: PricePoint[] = (snapshotRows || [])
        .map((r: any) => ({
            price: Number(r.price),
            capturedAtMs: new Date(r.captured_at).getTime(),
        }))
        .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.capturedAtMs));

    history.push({ price: priceData.price, capturedAtMs: nowMs });

    const previousPrice = toNumber(token.last_price) ?? (history.length >= 2 ? history[history.length - 2].price : null);

    const { error: insertSnapError } = await supabase
        .from('price_snapshots')
        .insert({
            watch_token_id: token.id,
            price: priceData.price,
            source: priceData.source,
            captured_at: new Date(nowMs).toISOString(),
        });

    if (insertSnapError) {
        logToFile(`Insert snapshot failed for ${token.mint.slice(0, 8)}: ${insertSnapError.message}`, 'ERROR');
    }

    const { error: updateTokenError } = await supabase
        .from('watch_tokens')
        .update({
            symbol: priceData.symbol ?? token.symbol,
            name: priceData.name ?? token.name,
            last_price: priceData.price,
            last_checked_at: new Date(nowMs).toISOString(),
        })
        .eq('id', token.id);

    if (updateTokenError) {
        logToFile(`Update token state failed for ${token.mint.slice(0, 8)}: ${updateTokenError.message}`, 'ERROR');
    }

    for (const strategy of strategies) {
        const evalResult = evaluateStrategy(strategy, priceData.price, previousPrice, history, nowMs);
        if (!evalResult.triggered) {
            continue;
        }

        const inCooldown = await strategyInCooldown(strategy.id, strategy.cooldownSec);
        if (inCooldown) {
            logToFile(`Cooldown skip: strategy=${strategy.id} mint=${token.mint.slice(0, 8)}`, 'INFO');
            continue;
        }

        const dedupeWindow = Math.max(strategy.cooldownSec, 60);
        const dedupeBucket = Math.floor(nowMs / (dedupeWindow * 1000));
        const dedupeKey = `${strategy.id}:${token.id}:${evalResult.dedupeSeed || 'trigger'}:${dedupeBucket}`;

        const payload = {
            strategyName: strategy.name,
            strategyType: strategy.type,
            currentPrice: priceData.price,
            previousPrice,
            symbol: priceData.symbol ?? token.symbol,
            evaluatedAt: new Date(nowMs).toISOString(),
            ...(evalResult.snapshot || {}),
        };

        const { error: eventError } = await supabase
            .from('price_alert_events')
            .insert({
                strategy_id: strategy.id,
                watch_token_id: token.id,
                mint: token.mint,
                snapshot: payload,
                dedupe_key: dedupeKey,
                triggered_at: new Date(nowMs).toISOString(),
            });

        if (eventError) {
            // PostgreSQL unique violation
            if (eventError.code === '23505') {
                logToFile(`Dedupe skip by key for strategy=${strategy.id}`, 'INFO');
                continue;
            }
            logToFile(`Insert alert event failed: ${eventError.message}`, 'ERROR');
            continue;
        }

        const alertMessage = buildPriceAlertMessage(
            { ...token, symbol: priceData.symbol ?? token.symbol, name: priceData.name ?? token.name },
            strategy,
            priceData.price,
            evalResult.reason || 'Triggered',
            evalResult.snapshot
        );
        await sendTelegramMessage(alertMessage, strategy.chatId);
        logToFile(`✅ Price alert sent: strategy=${strategy.id} token=${token.mint.slice(0, 8)}`, 'SUCCESS');
    }
}

let isTickRunning = false;
let tickCount = 0;

async function runTick(): Promise<void> {
    if (isTickRunning) {
        logToFile('Previous monitor tick still running, skipping overlap.', 'INFO');
        return;
    }
    isTickRunning = true;

    try {
        const { data: tokens, error: tokenError } = await supabase
            .from('watch_tokens')
            .select('id, mint, symbol, name, last_price, is_active')
            .eq('is_active', true);

        if (tokenError) {
            logToFile(`Failed to fetch watch tokens: ${tokenError.message}`, 'ERROR');
            return;
        }

        const activeTokens = (tokens || []) as WatchTokenRow[];
        if (activeTokens.length === 0) {
            logToFile('No active watch tokens. Tick skipped.', 'INFO');
            return;
        }

        const tokenIds = activeTokens.map((t) => t.id);
        const { data: rawStrategies, error: strategyError } = await supabase
            .from('price_strategies')
            .select('id, watch_token_id, name, type, params, cooldown_sec, is_active, chat_id')
            .eq('is_active', true)
            .in('watch_token_id', tokenIds);

        if (strategyError) {
            logToFile(`Failed to fetch active strategies: ${strategyError.message}`, 'ERROR');
            return;
        }

        const normalizedStrategies = (rawStrategies || [])
            .map((row: any) => normalizeStrategy(row))
            .filter((s: StrategyDefinition | null): s is StrategyDefinition => !!s);

        const tokenStrategyMap = new Map<string, StrategyDefinition[]>();
        for (const strategy of normalizedStrategies) {
            const list = tokenStrategyMap.get(strategy.watchTokenId) || [];
            list.push(strategy);
            tokenStrategyMap.set(strategy.watchTokenId, list);
        }

        for (const token of activeTokens) {
            const strategies = tokenStrategyMap.get(token.id) || [];
            await processToken(token, strategies);
        }

        tickCount += 1;
        if (tickCount % 30 === 0) {
            await cleanupSnapshots();
        }
    } catch (error: unknown) {
        logToFile(`Monitor tick crashed: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
    } finally {
        isTickRunning = false;
    }
}

async function main(): Promise<void> {
    logToFile(`Price monitor started. Interval=${INTERVAL_SEC}s`, 'INFO');
    while (true) {
        await runTick();
        await sleep(Math.max(INTERVAL_SEC, 5) * 1000);
    }
}

main().catch((err) => {
    logToFile(`Price monitor fatal error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    process.exit(1);
});
