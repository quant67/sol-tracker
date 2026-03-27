import { evaluateStrategy, type PricePoint, type StrategyDefinition } from './strategy-engine';

export interface BacktestEntrySignal {
    triggeredAt: string;
    entryPrice: number;
    targetPrice: number;
    maxFuturePrice: number;
    maxFutureReturnPct: number;
    mfePrice: number;
    mfePct: number;
    maePrice: number;
    maePct: number;
    endPrice: number;
    endReturnPct: number;
    hit: boolean;
    minutesToHit: number | null;
}

export interface BacktestWindowMetric {
    lookaheadMin: number;
    resolvedSignals: number;
    skippedSignals: number;
    hits: number;
    hitRate: number;
    avgMfePct: number;
    avgMaePct: number;
    avgEndReturnPct: number;
    avgMinutesToHit: number | null;
}

export interface BacktestSummary {
    tokenMint: string;
    strategyId: string;
    strategyName: string;
    strategyType: StrategyDefinition['type'];
    lookaheadMin: number;
    targetPct: number;
    snapshotsUsed: number;
    signalsTriggered: number;
    resolvedSignals: number;
    skippedSignals: number;
    hits: number;
    hitRate: number;
    avgMaxReturnPct: number;
    avgMfePct: number;
    avgMaePct: number;
    avgEndReturnPct: number;
    avgMinutesToHit: number | null;
    windowMetrics: BacktestWindowMetric[];
    samples: BacktestEntrySignal[];
}

export interface BacktestSnapshot {
    price: number;
    capturedAtMs: number;
}

function roundMetric(value: number): number {
    return Number(value.toFixed(3));
}

function roundPrice(value: number): number {
    return Number(value.toFixed(10));
}

function uniqueSortedWindows(values: number[]): number[] {
    return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0).map((value) => Math.floor(value)))]
        .sort((left, right) => left - right);
}

export function getDefaultBacktestWindows(
    strategyType: StrategyDefinition['type'],
    primaryLookaheadMin: number
): number[] {
    const defaults = strategyType === 'failed_breakdown'
        ? [60, 120, 180, 240]
        : strategyType === 'entry_long'
            ? [90, 180, 240, 360]
            : [120, 180, 240, 360];

    return uniqueSortedWindows([...defaults, primaryLookaheadMin]);
}

function buildBacktestSummaryForWindow(
    strategy: StrategyDefinition,
    tokenMint: string,
    sorted: BacktestSnapshot[],
    lookaheadMin: number
): Omit<BacktestSummary, 'windowMetrics'> {
    const targetPct = Number(strategy.params.targetPct ?? 10);
    const lookaheadMs = lookaheadMin * 60 * 1000;
    const targetMultiplier = 1 + targetPct / 100;
    const samples: BacktestEntrySignal[] = [];

    let lastTriggeredAtMs = -Infinity;
    const cooldownMs = Math.max(strategy.cooldownSec, 1) * 1000;
    let actionableSignals = 0;

    for (let index = 0; index < sorted.length; index += 1) {
        const current = sorted[index];
        const history = sorted.slice(0, index + 1).map((point) => ({ price: point.price, capturedAtMs: point.capturedAtMs } satisfies PricePoint));
        const previousPrice = index > 0 ? sorted[index - 1].price : null;
        const evalResult = evaluateStrategy(strategy, current.price, previousPrice, history, current.capturedAtMs);

        if (!evalResult.triggered) continue;
        if (current.capturedAtMs - lastTriggeredAtMs < cooldownMs) continue;
        actionableSignals += 1;

        const futureEndMs = current.capturedAtMs + lookaheadMs;
        const futureCandidates = sorted.slice(index + 1);
        const coveragePoint = futureCandidates.find((point) => point.capturedAtMs >= futureEndMs);
        if (!coveragePoint) {
            continue;
        }

        const futurePoints = futureCandidates.filter((point) => point.capturedAtMs <= futureEndMs);
        const targetPrice = current.price * targetMultiplier;
        let maxFuturePrice = current.price;
        let minFuturePrice = current.price;
        let hitAtMs: number | null = null;

        for (const point of futurePoints) {
            if (point.price > maxFuturePrice) maxFuturePrice = point.price;
            if (point.price < minFuturePrice) minFuturePrice = point.price;
            if (hitAtMs === null && point.price >= targetPrice) {
                hitAtMs = point.capturedAtMs;
            }
        }

        const maxFutureReturnPct = roundMetric(((maxFuturePrice - current.price) / current.price) * 100);
        const maxAdverseReturnPct = roundMetric(((minFuturePrice - current.price) / current.price) * 100);
        const endReturnPct = roundMetric(((coveragePoint.price - current.price) / current.price) * 100);
        const hit = hitAtMs !== null;
        const minutesToHit = hitAtMs !== null ? roundMetric((hitAtMs - current.capturedAtMs) / 60000) : null;

        samples.push({
            triggeredAt: new Date(current.capturedAtMs).toISOString(),
            entryPrice: roundPrice(current.price),
            targetPrice: roundPrice(targetPrice),
            maxFuturePrice: roundPrice(maxFuturePrice),
            maxFutureReturnPct,
            mfePrice: roundPrice(maxFuturePrice),
            mfePct: maxFutureReturnPct,
            maePrice: roundPrice(minFuturePrice),
            maePct: maxAdverseReturnPct,
            endPrice: roundPrice(coveragePoint.price),
            endReturnPct,
            hit,
            minutesToHit,
        });

        lastTriggeredAtMs = current.capturedAtMs;
    }

    const resolvedSignals = samples.length;
    const hits = samples.filter((sample) => sample.hit).length;
    const skippedSignals = Math.max(actionableSignals - resolvedSignals, 0);
    const avgMfePct = resolvedSignals > 0
        ? roundMetric(samples.reduce((sum, sample) => sum + sample.mfePct, 0) / resolvedSignals)
        : 0;
    const avgMaePct = resolvedSignals > 0
        ? roundMetric(samples.reduce((sum, sample) => sum + sample.maePct, 0) / resolvedSignals)
        : 0;
    const avgEndReturnPct = resolvedSignals > 0
        ? roundMetric(samples.reduce((sum, sample) => sum + sample.endReturnPct, 0) / resolvedSignals)
        : 0;
    const avgMinutesToHit = hits > 0
        ? roundMetric(samples.filter((sample) => sample.hit).reduce((sum, sample) => sum + (sample.minutesToHit || 0), 0) / hits)
        : null;

    return {
        tokenMint,
        strategyId: strategy.id,
        strategyName: strategy.name,
        strategyType: strategy.type,
        lookaheadMin,
        targetPct,
        snapshotsUsed: sorted.length,
        signalsTriggered: actionableSignals,
        resolvedSignals,
        skippedSignals,
        hits,
        hitRate: resolvedSignals > 0 ? roundMetric((hits / resolvedSignals) * 100) : 0,
        avgMaxReturnPct: avgMfePct,
        avgMfePct,
        avgMaePct,
        avgEndReturnPct,
        avgMinutesToHit,
        samples,
    };
}

export function runEntryStrategyBacktest(
    strategy: StrategyDefinition,
    tokenMint: string,
    snapshots: BacktestSnapshot[],
    lookaheadMin: number,
    windowMinutes?: number[]
): BacktestSummary {
    const sorted = [...snapshots]
        .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.capturedAtMs))
        .sort((a, b) => a.capturedAtMs - b.capturedAtMs);
    const windows = uniqueSortedWindows(windowMinutes && windowMinutes.length > 0 ? [lookaheadMin, ...windowMinutes] : [lookaheadMin]);
    const summariesByWindow = windows.map((windowMin) => buildBacktestSummaryForWindow(strategy, tokenMint, sorted, windowMin));
    const primary = summariesByWindow.find((summary) => summary.lookaheadMin === lookaheadMin) || summariesByWindow[0];

    const windowMetrics: BacktestWindowMetric[] = summariesByWindow.map((summary) => ({
        lookaheadMin: summary.lookaheadMin,
        resolvedSignals: summary.resolvedSignals,
        skippedSignals: summary.skippedSignals,
        hits: summary.hits,
        hitRate: summary.hitRate,
        avgMfePct: summary.avgMfePct,
        avgMaePct: summary.avgMaePct,
        avgEndReturnPct: summary.avgEndReturnPct,
        avgMinutesToHit: summary.avgMinutesToHit,
    }));

    return {
        ...primary,
        windowMetrics,
    };
}
