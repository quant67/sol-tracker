import { supabase } from '@/lib/supabase';
import { logToFile } from '@/lib/logger';

const DEFAULT_LOOKBACK_MIN = 4320;
const DEFAULT_COOLDOWN_SEC = 21600;
const AUTO_STRATEGY_NAME = 'Auto Pulse Retest';

const DEFAULT_PULSE_PARAMS = {
    lookbackMin: DEFAULT_LOOKBACK_MIN,
    buyClusterWindowMin: 30,
    pulseWindowMin: 120,
    minPulsePct: 60,
    minBleedMin: 180,
    minRetraceFromHighPct: 35,
    retestTolerancePct: 8,
    undercutPct: 12,
    minBuyerCount: 1,
    maxNewHighPct: 10,
};

interface AutoPulseStrategyInput {
    mint: string;
    symbol?: string | null;
    name?: string | null;
}

interface AutoPulseStrategyResult {
    created: boolean;
    reactivated: boolean;
    buyerCount: number;
    strategyId: string | null;
    reason: string;
}

interface LogTokenInfo {
    action?: string;
    personName?: string;
}

interface LogRow {
    address: string | null;
    type: string | null;
    token_info: unknown;
}

interface WatchTokenRow {
    id: string;
    symbol: string | null;
    name: string | null;
    is_active: boolean;
}

interface StrategyRow {
    id: string;
    name: string | null;
    params: unknown;
    is_active: boolean;
}

function cleanText(value: string | null | undefined): string | null {
    return value && value.trim() ? value.trim() : null;
}

function getEnvNumber(key: string, fallback: number): number {
    const value = Number(process.env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseTokenInfo(value: unknown): LogTokenInfo {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed ? parsed as LogTokenInfo : {};
        } catch {
            return {};
        }
    }
    return typeof value === 'object' ? value as LogTokenInfo : {};
}

function isAutoPulseStrategy(params: unknown): boolean {
    if (!params || typeof params !== 'object') return false;
    return (params as { autoCreated?: unknown }).autoCreated === true;
}

function isBuyLog(row: LogRow, tokenInfo: LogTokenInfo): boolean {
    const action = cleanText(tokenInfo.action)?.toUpperCase();
    if (action === 'BUY') return true;
    return Boolean(row.type?.toUpperCase().includes('BUY'));
}

function getBuyerKey(row: LogRow, tokenInfo: LogTokenInfo): string | null {
    const personName = cleanText(tokenInfo.personName);
    if (personName) return `person:${personName.toLowerCase()}`;

    const address = cleanText(row.address);
    return address ? `address:${address.toLowerCase()}` : null;
}

async function getRecentBuyerCount(mint: string, lookbackMin: number): Promise<number> {
    const sinceIso = new Date(Date.now() - lookbackMin * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('logs')
        .select('address, type, token_info')
        .eq('token_info->>mint', mint)
        .gte('timestamp', sinceIso)
        .limit(1000);

    if (error) {
        logToFile(`Auto pulse buyer count failed for ${mint.slice(0, 8)}: ${error.message}`, 'ERROR');
        return 0;
    }

    const buyers = new Set<string>();
    for (const row of (data || []) as LogRow[]) {
        const tokenInfo = parseTokenInfo(row.token_info);
        if (!isBuyLog(row, tokenInfo)) continue;

        const buyerKey = getBuyerKey(row, tokenInfo);
        if (buyerKey) buyers.add(buyerKey);
    }

    return buyers.size;
}

async function ensureWatchToken(input: AutoPulseStrategyInput): Promise<WatchTokenRow | null> {
    const mint = input.mint.trim();
    const symbol = cleanText(input.symbol);
    const name = cleanText(input.name);

    const { data: existing, error: existingError } = await supabase
        .from('watch_tokens')
        .select('id, symbol, name, is_active')
        .eq('mint', mint)
        .maybeSingle();

    if (existingError) {
        logToFile(`Auto pulse watch token lookup failed for ${mint.slice(0, 8)}: ${existingError.message}`, 'ERROR');
        return null;
    }

    if (existing) {
        const updates: Record<string, unknown> = {};
        if (!existing.is_active) updates.is_active = true;
        if (!existing.symbol && symbol) updates.symbol = symbol;
        if (!existing.name && name) updates.name = name;

        if (Object.keys(updates).length === 0) {
            return existing as WatchTokenRow;
        }

        const { data: updated, error: updateError } = await supabase
            .from('watch_tokens')
            .update(updates)
            .eq('id', existing.id)
            .select('id, symbol, name, is_active')
            .single();

        if (updateError) {
            logToFile(`Auto pulse watch token update failed for ${mint.slice(0, 8)}: ${updateError.message}`, 'ERROR');
            return existing as WatchTokenRow;
        }

        return updated as WatchTokenRow;
    }

    const insertPayload: Record<string, unknown> = {
        mint,
        is_active: true,
    };
    if (symbol) insertPayload.symbol = symbol;
    if (name) insertPayload.name = name;

    const { data: inserted, error: insertError } = await supabase
        .from('watch_tokens')
        .insert(insertPayload)
        .select('id, symbol, name, is_active')
        .single();

    if (!insertError) {
        return inserted as WatchTokenRow;
    }

    if (insertError.code === '23505') {
        const { data: racedToken, error: racedError } = await supabase
            .from('watch_tokens')
            .select('id, symbol, name, is_active')
            .eq('mint', mint)
            .maybeSingle();

        if (racedError) {
            logToFile(`Auto pulse raced token lookup failed for ${mint.slice(0, 8)}: ${racedError.message}`, 'ERROR');
            return null;
        }

        return racedToken as WatchTokenRow | null;
    }

    logToFile(`Auto pulse watch token insert failed for ${mint.slice(0, 8)}: ${insertError.message}`, 'ERROR');
    return null;
}

async function ensurePulseStrategy(watchTokenId: string): Promise<{ id: string | null; created: boolean; reactivated: boolean }> {
    const { data: existingRows, error: existingError } = await supabase
        .from('price_strategies')
        .select('id, name, params, is_active')
        .eq('watch_token_id', watchTokenId)
        .eq('type', 'pulse_retrace_retest')
        .order('created_at', { ascending: false })
        .limit(20);

    if (existingError) {
        logToFile(`Auto pulse strategy lookup failed: ${existingError.message}`, 'ERROR');
        return { id: null, created: false, reactivated: false };
    }

    const existing = (existingRows || []) as StrategyRow[];
    const activeStrategy = existing.find((row) => row.is_active);
    if (activeStrategy) {
        return { id: activeStrategy.id, created: false, reactivated: false };
    }

    const inactiveAutoStrategy = existing.find((row) => row.name === AUTO_STRATEGY_NAME || isAutoPulseStrategy(row.params));
    if (inactiveAutoStrategy) {

        const { error: reactivateError } = await supabase
            .from('price_strategies')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', inactiveAutoStrategy.id);

        if (reactivateError) {
            logToFile(`Auto pulse strategy reactivate failed: ${reactivateError.message}`, 'ERROR');
            return { id: inactiveAutoStrategy.id, created: false, reactivated: false };
        }

        return { id: inactiveAutoStrategy.id, created: false, reactivated: true };
    }

    const { data: inserted, error: insertError } = await supabase
        .from('price_strategies')
        .insert({
            watch_token_id: watchTokenId,
            name: AUTO_STRATEGY_NAME,
            type: 'pulse_retrace_retest',
            params: {
                ...DEFAULT_PULSE_PARAMS,
                autoCreated: true,
                autoTriggerMinBuyers: getEnvNumber('AUTO_PULSE_RETEST_MIN_BUYERS', 2),
            },
            cooldown_sec: DEFAULT_COOLDOWN_SEC,
            is_active: true,
            updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (insertError) {
        logToFile(`Auto pulse strategy insert failed: ${insertError.message}`, 'ERROR');
        return { id: null, created: false, reactivated: false };
    }

    return { id: String(inserted.id), created: true, reactivated: false };
}

export async function ensureAutoPulseRetestStrategy(input: AutoPulseStrategyInput): Promise<AutoPulseStrategyResult> {
    const mint = input.mint.trim();
    const minBuyers = Math.floor(getEnvNumber('AUTO_PULSE_RETEST_MIN_BUYERS', 2));
    const lookbackMin = Math.floor(getEnvNumber('AUTO_PULSE_RETEST_LOOKBACK_MIN', DEFAULT_LOOKBACK_MIN));

    if (!mint) {
        return { created: false, reactivated: false, buyerCount: 0, strategyId: null, reason: 'missing_mint' };
    }

    try {
        const buyerCount = await getRecentBuyerCount(mint, lookbackMin);
        if (buyerCount < minBuyers) {
            return { created: false, reactivated: false, buyerCount, strategyId: null, reason: 'below_threshold' };
        }

        const watchToken = await ensureWatchToken({ ...input, mint });
        if (!watchToken) {
            return { created: false, reactivated: false, buyerCount, strategyId: null, reason: 'watch_token_failed' };
        }

        const strategy = await ensurePulseStrategy(watchToken.id);
        const reason = strategy.created
            ? 'created'
            : strategy.reactivated
                ? 'reactivated'
                : 'exists';

        if (strategy.created || strategy.reactivated) {
            logToFile(
                `Auto pulse strategy ${reason}: mint=${mint.slice(0, 8)} buyers=${buyerCount}`,
                'SUCCESS'
            );
        }

        return {
            created: strategy.created,
            reactivated: strategy.reactivated,
            buyerCount,
            strategyId: strategy.id,
            reason,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logToFile(`Auto pulse strategy failed for ${mint.slice(0, 8)}: ${message}`, 'ERROR');
        return { created: false, reactivated: false, buyerCount: 0, strategyId: null, reason: 'exception' };
    }
}
