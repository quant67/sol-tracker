export type StrategyType = 'pct_change_up' | 'pct_change_down' | 'breakout_up' | 'breakout_down' | 'entry_long' | 'entry_rebound' | 'pullback_to_ma' | 'failed_breakdown';

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

interface EntrySignalContext {
    lookbackMin: number;
    fastWindowMin: number;
    slowWindowMin: number;
    fastMA: number;
    slowMA: number;
    recentHigh: number;
    recentLow: number;
}

function toFiniteNumber(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function parseStrategyType(value: unknown): StrategyType | null {
    if (value === 'pct_change_up' || value === 'pct_change_down' || value === 'breakout_up' || value === 'breakout_down' || value === 'entry_long' || value === 'entry_rebound' || value === 'pullback_to_ma' || value === 'failed_breakdown') {
        return value;
    }
    return null;
}

export function normalizeStrategy(raw: Record<string, unknown> | null | undefined): StrategyDefinition | null {
    const type = parseStrategyType(raw?.type);
    if (!type || !raw?.id || !raw?.watch_token_id) return null;

    const cooldown = toFiniteNumber(raw.cooldown_sec);

    return {
        id: String(raw.id),
        watchTokenId: String(raw.watch_token_id),
        name: String(raw.name || raw.type),
        type,
        params: isRecord(raw.params) ? raw.params : {},
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

function getLookbackMinutes(params: Record<string, unknown>): number | null {
    const lookback = toFiniteNumber(params.lookbackMin ?? params.lookback ?? params.windowMin ?? params.window);
    if (!lookback || lookback <= 0) return null;
    return lookback;
}

function getFastWindowMinutes(params: Record<string, unknown>): number | null {
    const fast = toFiniteNumber(params.fastWindowMin ?? params.fastWindow ?? params.fast ?? params.shortWindowMin);
    if (!fast || fast <= 0) return null;
    return fast;
}

function getSlowWindowMinutes(params: Record<string, unknown>): number | null {
    const slow = toFiniteNumber(params.slowWindowMin ?? params.slowWindow ?? params.slow ?? params.longWindowMin);
    if (!slow || slow <= 0) return null;
    return slow;
}

function getBreakoutTolerancePct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.breakoutTolerancePct ?? params.breakoutPct ?? params.tolerancePct ?? params.tolerance);
    if (pct === null || pct < 0) return null;
    return pct;
}

function getMinTrendPct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.minTrendPct ?? params.trendPct ?? params.momentumPct ?? params.minMovePct);
    if (pct === null || pct < 0) return null;
    return pct;
}

function getTargetPct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.targetPct ?? params.forwardTargetPct ?? params.forwardTarget ?? params.profitTargetPct);
    if (pct === null || pct <= 0) return null;
    return pct;
}

function getPullbackTolerancePct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.pullbackTolerancePct ?? params.maTolerancePct ?? params.pullbackPct ?? params.tolerancePct ?? params.tolerance);
    if (pct === null || pct < 0) return null;
    return pct;
}

function getMinReboundPct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.minReboundPct ?? params.reboundPct ?? params.bouncePct ?? params.minBouncePct);
    if (pct === null || pct < 0) return null;
    return pct;
}

function getMaxDistanceFromLowPct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.maxDistanceFromLowPct ?? params.maxReboundPct ?? params.reboundCeilingPct ?? params.maxBouncePct);
    if (pct === null || pct <= 0) return null;
    return pct;
}

function getReclaimPct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.reclaimPct ?? params.reclaimThresholdPct ?? params.recoveryPct ?? params.confirmPct);
    if (pct === null || pct <= 0) return null;
    return pct;
}

function getMinDrawdownPct(params: Record<string, unknown>): number | null {
    const pct = toFiniteNumber(params.minDrawdownPct ?? params.drawdownPct ?? params.minOffHighPct ?? params.minPullbackPct);
    if (pct === null || pct < 0) return null;
    return pct;
}

function getEntrySignalContext(
    params: Record<string, unknown>,
    history: PricePoint[],
    nowMs: number
): EntrySignalContext | null {
    const lookbackMin = getLookbackMinutes(params);
    const fastWindowMin = getFastWindowMinutes(params);
    const slowWindowMin = getSlowWindowMinutes(params);

    if (!lookbackMin || !fastWindowMin || !slowWindowMin) return null;

    const lookbackStart = nowMs - lookbackMin * 60 * 1000;
    const fastStart = nowMs - fastWindowMin * 60 * 1000;
    const slowStart = nowMs - slowWindowMin * 60 * 1000;
    const samples = history.filter((p) => p.capturedAtMs >= lookbackStart && p.price > 0);
    if (samples.length < 4) return null;

    const fastSamples = samples.filter((p) => p.capturedAtMs >= fastStart);
    const slowSamples = samples.filter((p) => p.capturedAtMs >= slowStart);
    if (fastSamples.length < 2 || slowSamples.length < 2) return null;

    const fastMA = fastSamples.reduce((sum, p) => sum + p.price, 0) / fastSamples.length;
    const slowMA = slowSamples.reduce((sum, p) => sum + p.price, 0) / slowSamples.length;
    const recentHigh = Math.max(...samples.map((p) => p.price));
    const recentLow = Math.min(...samples.map((p) => p.price));

    if (!Number.isFinite(recentHigh) || !Number.isFinite(recentLow) || recentLow <= 0) return null;

    return {
        lookbackMin,
        fastWindowMin,
        slowWindowMin,
        fastMA,
        slowMA,
        recentHigh,
        recentLow,
    };
}

export function getMaxWindowMinutes(strategies: StrategyDefinition[]): number {
    let max = 0;
    for (const strategy of strategies) {
        let w: number | null = null;
        if (strategy.type === 'pct_change_up' || strategy.type === 'pct_change_down') {
            w = getWindowMinutes(strategy.params);
        } else if (strategy.type === 'entry_long' || strategy.type === 'entry_rebound' || strategy.type === 'pullback_to_ma' || strategy.type === 'failed_breakdown') {
            w = getLookbackMinutes(strategy.params);
        }
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

    if (strategy.type === 'entry_long') {
        const context = getEntrySignalContext(strategy.params, history, nowMs);
        const breakoutTolerancePct = getBreakoutTolerancePct(strategy.params) ?? 1.5;
        const minTrendPct = getMinTrendPct(strategy.params) ?? 2;
        const targetPct = getTargetPct(strategy.params) ?? 10;

        if (!context) return { triggered: false };

        const { lookbackMin, fastWindowMin, slowWindowMin, fastMA, slowMA, recentHigh, recentLow } = context;
        const trendPct = ((currentPrice - recentLow) / recentLow) * 100;
        const maSpreadPct = ((fastMA - slowMA) / slowMA) * 100;
        const distanceFromHighPct = ((recentHigh - currentPrice) / recentHigh) * 100;
        const breakoutReady = currentPrice >= recentHigh * (1 - breakoutTolerancePct / 100);
        const trendReady = fastMA > slowMA && currentPrice > fastMA;
        const momentumReady = trendPct >= minTrendPct;

        if (breakoutReady && trendReady && momentumReady) {
            return {
                triggered: true,
                reason: `${strategy.name}: trend up, breakout continuation likely, target +${targetPct}%`,
                dedupeSeed: `entry_long:${lookbackMin}:${fastWindowMin}:${slowWindowMin}:${breakoutTolerancePct}:${minTrendPct}:${targetPct}`,
                snapshot: {
                    kind: 'entry_long',
                    currentPrice,
                    recentHigh,
                    recentLow,
                    fastMA: Number(fastMA.toFixed(8)),
                    slowMA: Number(slowMA.toFixed(8)),
                    maSpreadPct: Number(maSpreadPct.toFixed(3)),
                    trendPct: Number(trendPct.toFixed(3)),
                    distanceFromHighPct: Number(distanceFromHighPct.toFixed(3)),
                    lookbackMin,
                    fastWindowMin,
                    slowWindowMin,
                    breakoutTolerancePct,
                    minTrendPct,
                    targetPct
                }
            };
        }

        return { triggered: false };
    }

    if (strategy.type === 'entry_rebound') {
        const context = getEntrySignalContext(strategy.params, history, nowMs);
        const minReboundPct = getMinReboundPct(strategy.params) ?? 1.5;
        const maxDistanceFromLowPct = getMaxDistanceFromLowPct(strategy.params) ?? 6;
        const targetPct = getTargetPct(strategy.params) ?? 8;

        if (!context) return { triggered: false };

        const { lookbackMin, fastWindowMin, slowWindowMin, fastMA, slowMA, recentHigh, recentLow } = context;
        const reboundPct = ((currentPrice - recentLow) / recentLow) * 100;
        const drawdownFromHighPct = ((recentHigh - currentPrice) / recentHigh) * 100;
        const maSpreadPct = ((fastMA - slowMA) / slowMA) * 100;
        const reboundReady = reboundPct >= minReboundPct && reboundPct <= maxDistanceFromLowPct;
        const recoveryReady = currentPrice >= fastMA && fastMA >= slowMA * 0.995;
        const stillBelowHigh = drawdownFromHighPct >= 1;

        if (reboundReady && recoveryReady && stillBelowHigh) {
            return {
                triggered: true,
                reason: `${strategy.name}: rebound +${Number(reboundPct.toFixed(2))}% off local low, target +${targetPct}%`,
                dedupeSeed: `entry_rebound:${lookbackMin}:${fastWindowMin}:${slowWindowMin}:${minReboundPct}:${maxDistanceFromLowPct}:${targetPct}`,
                snapshot: {
                    kind: 'entry_rebound',
                    currentPrice,
                    recentHigh,
                    recentLow,
                    fastMA: Number(fastMA.toFixed(8)),
                    slowMA: Number(slowMA.toFixed(8)),
                    maSpreadPct: Number(maSpreadPct.toFixed(3)),
                    reboundPct: Number(reboundPct.toFixed(3)),
                    drawdownFromHighPct: Number(drawdownFromHighPct.toFixed(3)),
                    lookbackMin,
                    fastWindowMin,
                    slowWindowMin,
                    minReboundPct,
                    maxDistanceFromLowPct,
                    targetPct,
                }
            };
        }

        return { triggered: false };
    }

    if (strategy.type === 'pullback_to_ma') {
        const context = getEntrySignalContext(strategy.params, history, nowMs);
        const pullbackTolerancePct = getPullbackTolerancePct(strategy.params) ?? 1.5;
        const minTrendPct = getMinTrendPct(strategy.params) ?? 3;
        const targetPct = getTargetPct(strategy.params) ?? 8;

        if (!context) return { triggered: false };

        const { lookbackMin, fastWindowMin, slowWindowMin, fastMA, slowMA, recentHigh, recentLow } = context;
        const trendPct = ((currentPrice - recentLow) / recentLow) * 100;
        const maSpreadPct = ((fastMA - slowMA) / slowMA) * 100;
        const distanceFromHighPct = ((recentHigh - currentPrice) / recentHigh) * 100;
        const distanceToFastMAPct = Math.abs((currentPrice - fastMA) / fastMA) * 100;
        const trendReady = fastMA > slowMA && currentPrice >= slowMA && trendPct >= minTrendPct;
        const pullbackReady = distanceFromHighPct >= pullbackTolerancePct && distanceToFastMAPct <= pullbackTolerancePct;
        const resumeReady = currentPrice >= fastMA && (previousPrice === null || previousPrice <= fastMA);

        if (trendReady && pullbackReady && resumeReady) {
            return {
                triggered: true,
                reason: `${strategy.name}: trend intact, pullback to MA reclaimed, target +${targetPct}%`,
                dedupeSeed: `pullback_to_ma:${lookbackMin}:${fastWindowMin}:${slowWindowMin}:${pullbackTolerancePct}:${minTrendPct}:${targetPct}`,
                snapshot: {
                    kind: 'pullback_to_ma',
                    currentPrice,
                    recentHigh,
                    recentLow,
                    fastMA: Number(fastMA.toFixed(8)),
                    slowMA: Number(slowMA.toFixed(8)),
                    maSpreadPct: Number(maSpreadPct.toFixed(3)),
                    trendPct: Number(trendPct.toFixed(3)),
                    distanceFromHighPct: Number(distanceFromHighPct.toFixed(3)),
                    distanceToFastMAPct: Number(distanceToFastMAPct.toFixed(3)),
                    lookbackMin,
                    fastWindowMin,
                    slowWindowMin,
                    pullbackTolerancePct,
                    minTrendPct,
                    targetPct,
                }
            };
        }

        return { triggered: false };
    }

    if (strategy.type === 'failed_breakdown') {
        const context = getEntrySignalContext(strategy.params, history, nowMs);
        const reclaimPct = getReclaimPct(strategy.params) ?? 1;
        const maxDistanceFromLowPct = getMaxDistanceFromLowPct(strategy.params) ?? 4;
        const minDrawdownPct = getMinDrawdownPct(strategy.params) ?? 12;
        const targetPct = getTargetPct(strategy.params) ?? 8;

        if (!context || previousPrice === null || previousPrice <= 0) return { triggered: false };

        const { lookbackMin, fastWindowMin, slowWindowMin, fastMA, slowMA, recentHigh, recentLow } = context;
        const reboundPct = ((currentPrice - recentLow) / recentLow) * 100;
        const drawdownFromHighPct = ((recentHigh - currentPrice) / recentHigh) * 100;
        const previousDistanceFromLowPct = ((previousPrice - recentLow) / recentLow) * 100;
        const maSpreadPct = ((fastMA - slowMA) / slowMA) * 100;
        const drawdownReady = drawdownFromHighPct >= minDrawdownPct;
        const previousFlushReady = previousDistanceFromLowPct <= reclaimPct;
        const reclaimReady = reboundPct >= reclaimPct && reboundPct <= maxDistanceFromLowPct;
        const structureReady = currentPrice >= fastMA && fastMA >= slowMA * 0.99;
        const reversalReady = currentPrice > previousPrice;

        if (drawdownReady && previousFlushReady && reclaimReady && structureReady && reversalReady) {
            return {
                triggered: true,
                reason: `${strategy.name}: failed breakdown reclaimed from local low, target +${targetPct}%`,
                dedupeSeed: `failed_breakdown:${lookbackMin}:${fastWindowMin}:${slowWindowMin}:${reclaimPct}:${maxDistanceFromLowPct}:${minDrawdownPct}:${targetPct}`,
                snapshot: {
                    kind: 'failed_breakdown',
                    currentPrice,
                    previousPrice,
                    recentHigh,
                    recentLow,
                    fastMA: Number(fastMA.toFixed(8)),
                    slowMA: Number(slowMA.toFixed(8)),
                    maSpreadPct: Number(maSpreadPct.toFixed(3)),
                    reboundPct: Number(reboundPct.toFixed(3)),
                    drawdownFromHighPct: Number(drawdownFromHighPct.toFixed(3)),
                    previousDistanceFromLowPct: Number(previousDistanceFromLowPct.toFixed(3)),
                    lookbackMin,
                    fastWindowMin,
                    slowWindowMin,
                    reclaimPct,
                    maxDistanceFromLowPct,
                    minDrawdownPct,
                    targetPct,
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
