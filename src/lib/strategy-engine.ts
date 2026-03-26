export type StrategyType = 'pct_change_up' | 'pct_change_down' | 'breakout_up' | 'breakout_down';

export interface StrategyDefinition {
    id: string;
    watchTokenId: string;
    name: string;
    type: StrategyType;
    params: Record<string, unknown>;
    cooldownSec: number;
    chatId: string | null;
}

export interface PricePoint {
    price: number;
    capturedAtMs: number;
}

export interface StrategyEvaluation {
    triggered: boolean;
    reason?: string;
    dedupeSeed?: string;
    snapshot?: Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

export function parseStrategyType(value: unknown): StrategyType | null {
    if (value === 'pct_change_up' || value === 'pct_change_down' || value === 'breakout_up' || value === 'breakout_down') {
        return value;
    }
    return null;
}

export function normalizeStrategy(raw: any): StrategyDefinition | null {
    const type = parseStrategyType(raw?.type);
    if (!type || !raw?.id || !raw?.watch_token_id) return null;

    const cooldown = toFiniteNumber(raw.cooldown_sec);

    return {
        id: String(raw.id),
        watchTokenId: String(raw.watch_token_id),
        name: String(raw.name || raw.type),
        type,
        params: (raw.params && typeof raw.params === 'object') ? raw.params : {},
        cooldownSec: cooldown && cooldown > 0 ? Math.floor(cooldown) : 300,
        chatId: raw.chat_id ? String(raw.chat_id) : null,
    };
}

function getWindowMinutes(params: Record<string, unknown>): number | null {
    const maybeWindow = toFiniteNumber(params.windowMin ?? params.windowMins ?? params.window ?? params.minutes);
    if (!maybeWindow || maybeWindow <= 0) return null;
    return maybeWindow;
}

function getThresholdPct(params: Record<string, unknown>): number | null {
    const threshold = toFiniteNumber(params.thresholdPct ?? params.threshold ?? params.percent);
    if (!threshold || threshold <= 0) return null;
    return threshold;
}

function getThresholdPrice(params: Record<string, unknown>): number | null {
    const threshold = toFiniteNumber(params.targetPrice ?? params.thresholdPrice ?? params.threshold ?? params.price);
    if (!threshold || threshold <= 0) return null;
    return threshold;
}

export function getMaxWindowMinutes(strategies: StrategyDefinition[]): number {
    let max = 0;
    for (const strategy of strategies) {
        if (strategy.type !== 'pct_change_up' && strategy.type !== 'pct_change_down') continue;
        const w = getWindowMinutes(strategy.params);
        if (w && w > max) max = w;
    }
    return max;
}

export function evaluateStrategy(
    strategy: StrategyDefinition,
    currentPrice: number,
    previousPrice: number | null,
    history: PricePoint[],
    nowMs: number = Date.now()
): StrategyEvaluation {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        return { triggered: false };
    }

    if (strategy.type === 'pct_change_up' || strategy.type === 'pct_change_down') {
        const windowMin = getWindowMinutes(strategy.params);
        const thresholdPct = getThresholdPct(strategy.params);
        if (!windowMin || !thresholdPct) return { triggered: false };

        const earliestMs = nowMs - windowMin * 60 * 1000;
        const samples = history.filter((p) => p.capturedAtMs >= earliestMs && p.price > 0);
        if (samples.length === 0) return { triggered: false };

        const baseline = samples[0];
        const changePct = ((currentPrice - baseline.price) / baseline.price) * 100;
        const roundedChange = Number(changePct.toFixed(3));

        if (strategy.type === 'pct_change_up' && changePct >= thresholdPct) {
            return {
                triggered: true,
                reason: `${strategy.name}: +${roundedChange}% in ${windowMin}m (>= ${thresholdPct}%)`,
                dedupeSeed: `pct_up:${windowMin}:${thresholdPct}`,
                snapshot: {
                    kind: 'pct_change_up',
                    baselinePrice: baseline.price,
                    currentPrice,
                    changePct: roundedChange,
                    windowMin,
                    thresholdPct
                }
            };
        }

        if (strategy.type === 'pct_change_down' && changePct <= -thresholdPct) {
            return {
                triggered: true,
                reason: `${strategy.name}: ${roundedChange}% in ${windowMin}m (<= -${thresholdPct}%)`,
                dedupeSeed: `pct_down:${windowMin}:${thresholdPct}`,
                snapshot: {
                    kind: 'pct_change_down',
                    baselinePrice: baseline.price,
                    currentPrice,
                    changePct: roundedChange,
                    windowMin,
                    thresholdPct
                }
            };
        }

        return { triggered: false };
    }

    const thresholdPrice = getThresholdPrice(strategy.params);
    if (!thresholdPrice || !previousPrice || previousPrice <= 0) return { triggered: false };

    if (strategy.type === 'breakout_up') {
        const crossedUp = previousPrice <= thresholdPrice && currentPrice > thresholdPrice;
        if (!crossedUp) return { triggered: false };
        return {
            triggered: true,
            reason: `${strategy.name}: broke above $${thresholdPrice}`,
            dedupeSeed: `breakout_up:${thresholdPrice}`,
            snapshot: {
                kind: 'breakout_up',
                previousPrice,
                currentPrice,
                thresholdPrice
            }
        };
    }

    const crossedDown = previousPrice >= thresholdPrice && currentPrice < thresholdPrice;
    if (!crossedDown) return { triggered: false };
    return {
        triggered: true,
        reason: `${strategy.name}: broke below $${thresholdPrice}`,
        dedupeSeed: `breakout_down:${thresholdPrice}`,
        snapshot: {
            kind: 'breakout_down',
            previousPrice,
            currentPrice,
            thresholdPrice
        }
    };
}
