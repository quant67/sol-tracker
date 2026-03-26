import { evaluateStrategy, type PricePoint, type StrategyDefinition } from './strategy-engine';

export interface BacktestEntrySignal {
    triggeredAt: string;
    entryPrice: number;
    targetPrice: number;
    maxFuturePrice: number;
    maxFutureReturnPct: number;
    hit: boolean;
    minutesToHit: number | null;
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
    avgMinutesToHit: number | null;
    samples: BacktestEntrySignal[];
}

export interface BacktestSnapshot {
    price: number;
    capturedAtMs: number;
}

function toPct(value: number): number {
    return Number(value.toFixed(3));
}

export function runEntryLongBacktest(
    strategy: StrategyDefinition,
    tokenMint: string,
    snapshots: BacktestSnapshot[],
    lookaheadMin: number
): BacktestSummary {
    const sorted = [...snapshots]
        .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.capturedAtMs))
        .sort((a, b) => a.capturedAtMs - b.capturedAtMs);

    const targetPct = Number(strategy.params.targetPct ?? 10);
    const lookaheadMs = lookaheadMin * 60 * 1000;
    const targetMultiplier = 1 + targetPct / 100;
    const samples: BacktestEntrySignal[] = [];

    let lastTriggeredAtMs = -Infinity;
    const cooldownMs = Math.max(strategy.cooldownSec, 1) * 1000;
    let actionableSignals = 0;

    for (let i = 0; i < sorted.length; i += 1) {
        const current = sorted[i];
        const history = sorted.slice(0, i + 1).map((p) => ({ price: p.price, capturedAtMs: p.capturedAtMs } satisfies PricePoint));
        const previousPrice = i > 0 ? sorted[i - 1].price : null;
        const evalResult = evaluateStrategy(strategy, current.price, previousPrice, history, current.capturedAtMs);

        if (!evalResult.triggered) continue;
        if (current.capturedAtMs - lastTriggeredAtMs < cooldownMs) continue;
        actionableSignals += 1;

        const futureEndMs = current.capturedAtMs + lookaheadMs;
        const futurePoints = sorted.slice(i + 1).filter((p) => p.capturedAtMs <= futureEndMs);
        const hasFullCoverage = sorted.some((p) => p.capturedAtMs >= futureEndMs);
        if (!hasFullCoverage) {
            continue;
        }

        const targetPrice = current.price * targetMultiplier;
        let maxFuturePrice = current.price;
        let hitAtMs: number | null = null;

        for (const point of futurePoints) {
            if (point.price > maxFuturePrice) maxFuturePrice = point.price;
            if (hitAtMs === null && point.price >= targetPrice) {
                hitAtMs = point.capturedAtMs;
            }
        }

        const maxFutureReturnPct = toPct(((maxFuturePrice - current.price) / current.price) * 100);
        const hit = hitAtMs !== null;
        const minutesToHit = hitAtMs !== null ? toPct((hitAtMs - current.capturedAtMs) / 60000) : null;

        samples.push({
            triggeredAt: new Date(current.capturedAtMs).toISOString(),
            entryPrice: current.price,
            targetPrice: toPct(targetPrice),
            maxFuturePrice: toPct(maxFuturePrice),
            maxFutureReturnPct,
            hit,
            minutesToHit,
        });

        lastTriggeredAtMs = current.capturedAtMs;
    }

    const resolvedSignals = samples.length;
    const hits = samples.filter((sample) => sample.hit).length;
    const skippedSignals = Math.max(actionableSignals - resolvedSignals, 0);
    const avgMaxReturnPct = resolvedSignals > 0
        ? toPct(samples.reduce((sum, sample) => sum + sample.maxFutureReturnPct, 0) / resolvedSignals)
        : 0;
    const avgMinutesToHit = hits > 0
        ? toPct(samples.filter((sample) => sample.hit).reduce((sum, sample) => sum + (sample.minutesToHit || 0), 0) / hits)
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
        hitRate: resolvedSignals > 0 ? toPct((hits / resolvedSignals) * 100) : 0,
        avgMaxReturnPct,
        avgMinutesToHit,
        samples,
    };
}
