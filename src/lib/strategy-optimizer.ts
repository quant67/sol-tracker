import { getDefaultBacktestWindows, runEntryStrategyBacktest, type BacktestWindowMetric } from './backtest-engine';
import type { HistoricalInterval, HistoricalPricePoint, HistoricalSeriesResult } from './historical-price-provider';
import type { StrategyDefinition, StrategyType } from './strategy-engine';

export type OptimizationStyle = 'conservative' | 'balanced' | 'aggressive';

export interface OptimizationRequest {
    mint: string;
    watchTokenId: string;
    historyDays: number;
    interval: HistoricalInterval;
    style: OptimizationStyle;
    series: HistoricalSeriesResult;
}

export interface StrategyRecommendation {
    rank: number;
    strategyType: StrategyType;
    params: Record<string, unknown>;
    lookaheadMin: number;
    score: number;
    style: OptimizationStyle;
    metrics: {
        signalsTriggered: number;
        resolvedSignals: number;
        hits: number;
        hitRate: number;
        avgMaxReturnPct: number;
        avgMfePct: number;
        avgMaePct: number;
        avgEndReturnPct: number;
        avgMinutesToHit: number | null;
        skippedSignals: number;
    };
    windowMetrics: RecommendationWindowMetric[];
    stability: RecommendationStability;
}

export interface OptimizationResult {
    provider: HistoricalSeriesResult['provider'];
    mint: string;
    watchTokenId: string;
    tokenSymbol: string | null;
    tokenName: string | null;
    historyDays: number;
    interval: HistoricalInterval;
    style: OptimizationStyle;
    poolAddress: string;
    poolName: string | null;
    pointsUsed: number;
    firstPointAt: string;
    lastPointAt: string;
    bestOverall: StrategyRecommendation | null;
    topRecommendations: StrategyRecommendation[];
    topByType: Record<'entry_long' | 'entry_rebound' | 'pullback_to_ma' | 'failed_breakdown', StrategyRecommendation | null>;
}

type CandidateDefinition = {
    strategy: StrategyDefinition;
    lookaheadMin: number;
};

type CandidateMetrics = StrategyRecommendation['metrics'];

export interface RecommendationWindowMetric extends BacktestWindowMetric {
    windowScore: number;
}

export interface RecommendationStability {
    primaryScore: number;
    windowScore: number;
    stabilityScore: number;
    qualifiedWindows: number;
    totalWindows: number;
    coveragePct: number;
    scoreRange: number;
    hitRateRange: number;
    endReturnRange: number;
}

type CandidateScore = {
    strategyType: StrategyType;
    params: Record<string, unknown>;
    lookaheadMin: number;
    score: number;
    metrics: CandidateMetrics;
    windowMetrics: RecommendationWindowMetric[];
    stability: RecommendationStability;
};

type CandidateEvaluation = {
    metrics: CandidateMetrics;
    windowMetrics: RecommendationWindowMetric[];
    stability: RecommendationStability;
    compositeScore: number;
};

type WindowCombo = {
    lookbackMin: number;
    fastWindowMin: number;
    slowWindowMin: number;
};

type WindowComboBars = {
    lookbackBars: number;
    fastBars: number;
    slowBars: number;
};

function metricsFromSummary(summary: ReturnType<typeof runEntryStrategyBacktest>): CandidateMetrics {
    return {
        signalsTriggered: summary.signalsTriggered,
        resolvedSignals: summary.resolvedSignals,
        hits: summary.hits,
        hitRate: summary.hitRate,
        avgMaxReturnPct: summary.avgMaxReturnPct,
        avgMfePct: summary.avgMfePct,
        avgMaePct: summary.avgMaePct,
        avgEndReturnPct: summary.avgEndReturnPct,
        avgMinutesToHit: summary.avgMinutesToHit,
        skippedSignals: summary.skippedSignals,
    };
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function range(values: number[]): number {
    if (values.length <= 1) return 0;
    return Math.max(...values) - Math.min(...values);
}

function scoreMetrics(
    metrics: Pick<CandidateMetrics, 'resolvedSignals' | 'hitRate' | 'avgMfePct' | 'avgMaePct' | 'avgEndReturnPct' | 'avgMinutesToHit'>,
    mode: 'primary' | 'window'
): number {
    const samplePenalty = metrics.resolvedSignals < 4
        ? mode === 'primary' ? -100 : -18
        : 0;
    const sparsityPenalty = metrics.resolvedSignals < 8
        ? mode === 'primary' ? -10 : -5
        : 0;
    const speedBonus = metrics.avgMinutesToHit === null
        ? 0
        : Math.max(0, 180 - metrics.avgMinutesToHit) * 0.03;

    return Number((
        metrics.hitRate * 0.26 +
        metrics.avgMfePct * 0.2 +
        metrics.avgEndReturnPct * 0.32 +
        metrics.avgMaePct * 0.14 +
        Math.min(metrics.resolvedSignals, 24) * 0.85 +
        speedBonus +
        samplePenalty +
        sparsityPenalty
    ).toFixed(3));
}

function buildWindowMetrics(summary: ReturnType<typeof runEntryStrategyBacktest>): RecommendationWindowMetric[] {
    return summary.windowMetrics.map((metric) => ({
        ...metric,
        windowScore: scoreMetrics(metric, 'window'),
    }));
}

function buildStability(
    windowMetrics: RecommendationWindowMetric[],
    primaryScore: number
): RecommendationStability {
    const qualifiedWindows = windowMetrics.filter((metric) => metric.resolvedSignals >= 4);
    const scoringWindows = qualifiedWindows.length > 0 ? qualifiedWindows : windowMetrics;
    const coveragePct = windowMetrics.length > 0
        ? Number(((qualifiedWindows.length / windowMetrics.length) * 100).toFixed(3))
        : 0;
    const scoreRange = Number(range(scoringWindows.map((metric) => metric.windowScore)).toFixed(3));
    const hitRateRange = Number(range(scoringWindows.map((metric) => metric.hitRate)).toFixed(3));
    const endReturnRange = Number(range(scoringWindows.map((metric) => metric.avgEndReturnPct)).toFixed(3));
    const averagedWindowScore = Number(average(scoringWindows.map((metric) => metric.windowScore)).toFixed(3));
    const coverageBonus = coveragePct * 0.08;
    const consistencyPenalty = scoreRange * 0.18 + hitRateRange * 0.04 + endReturnRange * 0.5;
    const normalizedPrimaryScore = Number(primaryScore.toFixed(3));

    return {
        primaryScore: normalizedPrimaryScore,
        windowScore: averagedWindowScore,
        stabilityScore: Number((averagedWindowScore + coverageBonus - consistencyPenalty).toFixed(3)),
        qualifiedWindows: qualifiedWindows.length,
        totalWindows: windowMetrics.length,
        coveragePct,
        scoreRange,
        hitRateRange,
        endReturnRange,
    };
}

function evaluateSummary(summary: ReturnType<typeof runEntryStrategyBacktest>): CandidateEvaluation {
    const metrics = metricsFromSummary(summary);
    const primaryScore = scoreMetrics(metrics, 'primary');
    const windowMetrics = buildWindowMetrics(summary);
    const stability = buildStability(windowMetrics, primaryScore);

    return {
        metrics,
        windowMetrics,
        stability,
        compositeScore: Number((primaryScore * 0.6 + stability.stabilityScore * 0.4).toFixed(3)),
    };
}

function getIntervalMinutes(interval: HistoricalInterval): number {
    if (interval === '5m') return 5;
    if (interval === '15m') return 15;
    return 60;
}

function toWindowMinutes(combo: WindowComboBars, interval: HistoricalInterval): WindowCombo {
    const intervalMinutes = getIntervalMinutes(interval);
    return {
        lookbackMin: combo.lookbackBars * intervalMinutes,
        fastWindowMin: combo.fastBars * intervalMinutes,
        slowWindowMin: combo.slowBars * intervalMinutes,
    };
}

function getLookaheads(style: OptimizationStyle, interval: HistoricalInterval): number[] {
    const intervalMinutes = getIntervalMinutes(interval);

    if (style === 'conservative') return [16, 24].map((bars) => bars * intervalMinutes);
    if (style === 'aggressive') return [6, 8].map((bars) => bars * intervalMinutes);
    return [8, 12].map((bars) => bars * intervalMinutes);
}

function getWindowCombos(style: OptimizationStyle, interval: HistoricalInterval): WindowCombo[] {
    const combos: WindowComboBars[] = [];

    if (style === 'conservative') {
        combos.push(
            { lookbackBars: 24, fastBars: 6, slowBars: 12 },
            { lookbackBars: 36, fastBars: 6, slowBars: 18 },
            { lookbackBars: 48, fastBars: 8, slowBars: 24 },
        );
    } else if (style === 'aggressive') {
        combos.push(
            { lookbackBars: 12, fastBars: 3, slowBars: 6 },
            { lookbackBars: 16, fastBars: 4, slowBars: 8 },
            { lookbackBars: 24, fastBars: 4, slowBars: 12 },
        );
    } else {
        combos.push(
            { lookbackBars: 16, fastBars: 4, slowBars: 8 },
            { lookbackBars: 24, fastBars: 4, slowBars: 12 },
            { lookbackBars: 32, fastBars: 6, slowBars: 16 },
        );
    }

    return combos.map((combo) => toWindowMinutes(combo, interval));
}

function buildEntryLongCandidates(
    mint: string,
    watchTokenId: string,
    style: OptimizationStyle,
    interval: HistoricalInterval
): CandidateDefinition[] {
    const targets = style === 'aggressive' ? [6, 8] : [8, 10];
    const breakoutTolerances = style === 'conservative' ? [1, 1.5] : [1.5, 2];
    const minTrends = style === 'aggressive' ? [1, 2] : style === 'conservative' ? [2, 3] : [1, 2];
    const lookaheads = getLookaheads(style, interval);
    const candidates: CandidateDefinition[] = [];

    for (const combo of getWindowCombos(style, interval)) {
        for (const targetPct of targets) {
            for (const breakoutTolerancePct of breakoutTolerances) {
                for (const minTrendPct of minTrends) {
                    for (const lookaheadMin of lookaheads) {
                        candidates.push({
                            lookaheadMin,
                            strategy: {
                                id: `entry_long-${mint}-${combo.lookbackMin}-${combo.fastWindowMin}-${combo.slowWindowMin}-${targetPct}-${breakoutTolerancePct}-${minTrendPct}-${lookaheadMin}`,
                                watchTokenId,
                                name: 'optimized entry_long',
                                type: 'entry_long',
                                params: {
                                    ...combo,
                                    targetPct,
                                    breakoutTolerancePct,
                                    minTrendPct,
                                },
                                cooldownSec: 300,
                                chatId: null,
                            },
                        });
                    }
                }
            }
        }
    }

    return candidates;
}

function buildEntryReboundCandidates(
    mint: string,
    watchTokenId: string,
    style: OptimizationStyle,
    interval: HistoricalInterval
): CandidateDefinition[] {
    const targets = style === 'aggressive' ? [6, 8] : [8, 10];
    const minRebounds = style === 'conservative' ? [1.5, 2] : [1, 1.5];
    const maxDistances = style === 'conservative' ? [4, 6] : [6, 8];
    const lookaheads = getLookaheads(style, interval);
    const candidates: CandidateDefinition[] = [];

    for (const combo of getWindowCombos(style, interval)) {
        for (const targetPct of targets) {
            for (const minReboundPct of minRebounds) {
                for (const maxDistanceFromLowPct of maxDistances) {
                    if (maxDistanceFromLowPct <= minReboundPct) continue;
                    for (const lookaheadMin of lookaheads) {
                        candidates.push({
                            lookaheadMin,
                            strategy: {
                                id: `entry_rebound-${mint}-${combo.lookbackMin}-${combo.fastWindowMin}-${combo.slowWindowMin}-${targetPct}-${minReboundPct}-${maxDistanceFromLowPct}-${lookaheadMin}`,
                                watchTokenId,
                                name: 'optimized entry_rebound',
                                type: 'entry_rebound',
                                params: {
                                    ...combo,
                                    targetPct,
                                    minReboundPct,
                                    maxDistanceFromLowPct,
                                },
                                cooldownSec: 300,
                                chatId: null,
                            },
                        });
                    }
                }
            }
        }
    }

    return candidates;
}

function buildPullbackCandidates(
    mint: string,
    watchTokenId: string,
    style: OptimizationStyle,
    interval: HistoricalInterval
): CandidateDefinition[] {
    const targets = style === 'aggressive' ? [6, 8] : [8, 10];
    const pullbackTolerances = style === 'conservative' ? [1, 1.5] : [1, 1.5];
    const minTrends = style === 'aggressive' ? [2, 3] : style === 'conservative' ? [3, 4] : [2, 3];
    const lookaheads = getLookaheads(style, interval);
    const candidates: CandidateDefinition[] = [];

    for (const combo of getWindowCombos(style, interval)) {
        for (const targetPct of targets) {
            for (const pullbackTolerancePct of pullbackTolerances) {
                for (const minTrendPct of minTrends) {
                    for (const lookaheadMin of lookaheads) {
                        candidates.push({
                            lookaheadMin,
                            strategy: {
                                id: `pullback_to_ma-${mint}-${combo.lookbackMin}-${combo.fastWindowMin}-${combo.slowWindowMin}-${targetPct}-${pullbackTolerancePct}-${minTrendPct}-${lookaheadMin}`,
                                watchTokenId,
                                name: 'optimized pullback_to_ma',
                                type: 'pullback_to_ma',
                                params: {
                                    ...combo,
                                    targetPct,
                                    pullbackTolerancePct,
                                    minTrendPct,
                                },
                                cooldownSec: 300,
                                chatId: null,
                            },
                        });
                    }
                }
            }
        }
    }

    return candidates;
}

function buildFailedBreakdownCandidates(
    mint: string,
    watchTokenId: string,
    style: OptimizationStyle,
    interval: HistoricalInterval
): CandidateDefinition[] {
    const targets = style === 'aggressive' ? [6, 8] : [8, 10];
    const reclaimPcts = style === 'conservative' ? [1, 1.5] : [0.75, 1, 1.5];
    const maxDistances = style === 'conservative' ? [3, 4] : [3, 4, 5];
    const minDrawdowns = style === 'aggressive' ? [8, 12] : style === 'conservative' ? [15, 20] : [10, 15];
    const lookaheads = getLookaheads(style, interval);
    const candidates: CandidateDefinition[] = [];

    for (const combo of getWindowCombos(style, interval)) {
        for (const targetPct of targets) {
            for (const reclaimPct of reclaimPcts) {
                for (const maxDistanceFromLowPct of maxDistances) {
                    if (maxDistanceFromLowPct <= reclaimPct) continue;
                    for (const minDrawdownPct of minDrawdowns) {
                        for (const lookaheadMin of lookaheads) {
                            candidates.push({
                                lookaheadMin,
                                strategy: {
                                    id: `failed_breakdown-${mint}-${combo.lookbackMin}-${combo.fastWindowMin}-${combo.slowWindowMin}-${targetPct}-${reclaimPct}-${maxDistanceFromLowPct}-${minDrawdownPct}-${lookaheadMin}`,
                                    watchTokenId,
                                    name: 'optimized failed_breakdown',
                                    type: 'failed_breakdown',
                                    params: {
                                        ...combo,
                                        targetPct,
                                        reclaimPct,
                                        maxDistanceFromLowPct,
                                        minDrawdownPct,
                                    },
                                    cooldownSec: 300,
                                    chatId: null,
                                },
                            });
                        }
                    }
                }
            }
        }
    }

    return candidates;
}

function splitSeries(points: HistoricalPricePoint[]): { train: HistoricalPricePoint[]; validation: HistoricalPricePoint[] } {
    const splitIndex = Math.max(Math.floor(points.length * 0.7), 20);
    return {
        train: points.slice(0, splitIndex),
        validation: points.slice(splitIndex),
    };
}

function evaluateCandidate(candidate: CandidateDefinition, mint: string, points: HistoricalPricePoint[]): CandidateScore {
    const windowMinutes = getDefaultBacktestWindows(candidate.strategy.type, candidate.lookaheadMin);
    const fullEvaluation = evaluateSummary(
        runEntryStrategyBacktest(candidate.strategy, mint, points, candidate.lookaheadMin, windowMinutes)
    );
    const { train, validation } = splitSeries(points);
    const trainEvaluation = train.length >= 20
        ? evaluateSummary(runEntryStrategyBacktest(candidate.strategy, mint, train, candidate.lookaheadMin, windowMinutes))
        : null;
    const validationEvaluation = validation.length >= 20
        ? evaluateSummary(runEntryStrategyBacktest(candidate.strategy, mint, validation, candidate.lookaheadMin, windowMinutes))
        : null;

    const fullScore = fullEvaluation.compositeScore;
    const trainScore = trainEvaluation ? trainEvaluation.compositeScore : 0;
    const validationScore = validationEvaluation ? validationEvaluation.compositeScore : 0;
    const stabilityPenalty = validationEvaluation && validationEvaluation.metrics.resolvedSignals > 0
        ? Math.max(0, fullEvaluation.metrics.hitRate - validationEvaluation.metrics.hitRate) * 0.08
            + Math.max(0, fullEvaluation.stability.stabilityScore - validationEvaluation.stability.stabilityScore) * 0.35
        : 4;

    return {
        strategyType: candidate.strategy.type,
        params: candidate.strategy.params,
        lookaheadMin: candidate.lookaheadMin,
        metrics: fullEvaluation.metrics,
        windowMetrics: fullEvaluation.windowMetrics,
        stability: fullEvaluation.stability,
        score: Number((fullScore * 0.45 + validationScore * 0.35 + trainScore * 0.2 - stabilityPenalty).toFixed(3)),
    };
}

function toRecommendation(candidate: CandidateScore, index: number, style: OptimizationStyle): StrategyRecommendation {
    return {
        rank: index + 1,
        strategyType: candidate.strategyType,
        params: candidate.params,
        lookaheadMin: candidate.lookaheadMin,
        score: candidate.score,
        style,
        metrics: candidate.metrics,
        windowMetrics: candidate.windowMetrics,
        stability: candidate.stability,
    };
}

function sortCandidates(left: CandidateScore, right: CandidateScore): number {
    return right.score - left.score
        || right.stability.stabilityScore - left.stability.stabilityScore
        || right.metrics.resolvedSignals - left.metrics.resolvedSignals
        || right.metrics.hitRate - left.metrics.hitRate
        || right.metrics.avgEndReturnPct - left.metrics.avgEndReturnPct
        || right.metrics.avgMaxReturnPct - left.metrics.avgMaxReturnPct;
}

function getTopCandidateByType(
    candidates: CandidateScore[],
    strategyType: StrategyType
): CandidateScore | null {
    return candidates.find((candidate) => candidate.strategyType === strategyType) || null;
}

export function optimizeSwingStrategies(request: OptimizationRequest): OptimizationResult {
    const candidates = [
        ...buildEntryLongCandidates(request.mint, request.watchTokenId, request.style, request.interval),
        ...buildEntryReboundCandidates(request.mint, request.watchTokenId, request.style, request.interval),
        ...buildPullbackCandidates(request.mint, request.watchTokenId, request.style, request.interval),
        ...buildFailedBreakdownCandidates(request.mint, request.watchTokenId, request.style, request.interval),
    ];

    const scored = candidates.map((candidate) => evaluateCandidate(candidate, request.mint, request.series.points));
    const sorted = [...scored].sort(sortCandidates);
    const viable = sorted.filter((candidate) => candidate.metrics.resolvedSignals >= 4);
    const bestEntryLong = getTopCandidateByType(sorted, 'entry_long');
    const bestEntryRebound = getTopCandidateByType(sorted, 'entry_rebound');
    const bestPullbackToMa = getTopCandidateByType(sorted, 'pullback_to_ma');
    const bestFailedBreakdown = getTopCandidateByType(sorted, 'failed_breakdown');
    const featured = [bestEntryLong, bestEntryRebound, bestPullbackToMa, bestFailedBreakdown]
        .filter((candidate): candidate is CandidateScore => candidate !== null)
        .sort(sortCandidates);
    const featuredSet = new Set(featured);

    const topRecommendations = [...featured, ...viable.filter((candidate) => !featuredSet.has(candidate))]
        .slice(0, 6)
        .map((candidate, index) => toRecommendation(candidate, index, request.style));

    const topByType = {
        entry_long: bestEntryLong ? toRecommendation(bestEntryLong, 0, request.style) : null,
        entry_rebound: bestEntryRebound ? toRecommendation(bestEntryRebound, 0, request.style) : null,
        pullback_to_ma: bestPullbackToMa ? toRecommendation(bestPullbackToMa, 0, request.style) : null,
        failed_breakdown: bestFailedBreakdown ? toRecommendation(bestFailedBreakdown, 0, request.style) : null,
    };

    return {
        provider: request.series.provider,
        mint: request.mint,
        watchTokenId: request.watchTokenId,
        tokenSymbol: request.series.tokenSymbol,
        tokenName: request.series.tokenName,
        historyDays: request.historyDays,
        interval: request.interval,
        style: request.style,
        poolAddress: request.series.poolAddress,
        poolName: request.series.poolName,
        pointsUsed: request.series.points.length,
        firstPointAt: new Date(request.series.points[0]?.capturedAtMs ?? 0).toISOString(),
        lastPointAt: new Date(request.series.points.at(-1)?.capturedAtMs ?? 0).toISOString(),
        bestOverall: viable[0] ? toRecommendation(viable[0], 0, request.style) : null,
        topRecommendations,
        topByType,
    };
}
