"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, WandSparkles } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";

interface WatchTokenOption {
    id: string;
    mint: string;
    symbol: string | null;
    name: string | null;
    is_active: boolean;
}

interface Recommendation {
    rank: number;
    strategyType: string;
    params: Record<string, unknown>;
    lookaheadMin: number;
    score: number;
    style: string;
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
    windowMetrics: {
        lookaheadMin: number;
        resolvedSignals: number;
        skippedSignals: number;
        hits: number;
        hitRate: number;
        avgMfePct: number;
        avgMaePct: number;
        avgEndReturnPct: number;
        avgMinutesToHit: number | null;
        windowScore: number;
    }[];
    stability: {
        primaryScore: number;
        windowScore: number;
        stabilityScore: number;
        qualifiedWindows: number;
        totalWindows: number;
        coveragePct: number;
        scoreRange: number;
        hitRateRange: number;
        endReturnRange: number;
    };
}

interface OptimizationResponse {
    token: {
        id: string;
        mint: string;
        symbol: string | null;
        name: string | null;
    };
    optimization: {
        provider: string;
        mint: string;
        watchTokenId: string;
        tokenSymbol: string | null;
        tokenName: string | null;
        historyDays: number;
        interval: string;
        style: string;
        poolAddress: string;
        poolName: string | null;
        pointsUsed: number;
        firstPointAt: string;
        lastPointAt: string;
        bestOverall: Recommendation | null;
        topRecommendations: Recommendation[];
        topByType: Record<string, Recommendation | null>;
    };
}

interface OptimizationJob {
    id: string;
    watch_token_id: string;
    mint: string;
    history_days: number;
    interval: string;
    style: string;
    status: "queued" | "running" | "completed" | "failed";
    progress_message: string | null;
    provider: string | null;
    pool_address: string | null;
    pool_name: string | null;
    result_json: OptimizationResponse | null;
    error_message: string | null;
    attempt_count: number;
    requested_by: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string;
}

const POLL_INTERVAL = 10000;
const JOB_POLL_INTERVAL = 2500;
const STRATEGY_TYPE_ORDER = ["entry_long", "entry_rebound", "failed_breakdown", "pullback_to_ma"] as const;
const selectClassName = "h-10 w-full rounded-xl border border-input/90 bg-input/70 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] focus:border-ring focus:bg-card focus:ring-4 focus:ring-ring/20";

function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
}

function getStrategyTypeLabel(strategyType: string): string {
    if (strategyType === "entry_long") return "Trend Continuation";
    if (strategyType === "entry_rebound") return "Local Rebound";
    if (strategyType === "failed_breakdown") return "Failed Breakdown";
    if (strategyType === "pullback_to_ma") return "Pullback To MA";
    return strategyType;
}

function getRecommendationKey(recommendation: Recommendation): string {
    return `${recommendation.strategyType}-${recommendation.lookaheadMin}-${JSON.stringify(recommendation.params)}`;
}

function RecommendationWindows({ recommendation }: { recommendation: Recommendation }) {
    if (!recommendation.windowMetrics.length) return null;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted-foreground">Window Stability</div>
                <div className="text-[11px] text-muted-foreground">
                    coverage {recommendation.stability.qualifiedWindows}/{recommendation.stability.totalWindows}
                    {" · "}
                    stable {recommendation.stability.stabilityScore.toFixed(2)}
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                {recommendation.windowMetrics.map((metric) => (
                    <div key={`${recommendation.strategyType}-${metric.lookaheadMin}`} className="rounded-md border border-border/60 bg-background/40 p-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-semibold text-foreground">{metric.lookaheadMin}m</span>
                            <span className="text-muted-foreground">S {metric.windowScore.toFixed(1)}</span>
                        </div>
                        <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                            <div>Hit {formatPercent(metric.hitRate)}</div>
                            <div>End {formatPercent(metric.avgEndReturnPct)}</div>
                            <div>MAE {formatPercent(metric.avgMaePct)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MetricCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail: string;
}) {
    return (
        <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
            <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
    );
}

export function StrategyOptimizerPanel() {
    const fieldId = useId();
    const [watchTokens, setWatchTokens] = useState<WatchTokenOption[]>([]);
    const [selectedWatchTokenId, setSelectedWatchTokenId] = useState("");
    const [historyDays, setHistoryDays] = useState("30");
    const [interval, setInterval] = useState<"5m" | "15m" | "1h">("15m");
    const [style, setStyle] = useState<"conservative" | "balanced" | "aggressive">("balanced");
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [applyingKey, setApplyingKey] = useState<string | null>(null);
    const [batchApplying, setBatchApplying] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [result, setResult] = useState<OptimizationResponse | null>(null);
    const [activeJob, setActiveJob] = useState<OptimizationJob | null>(null);

    const fetchWatchTokens = useCallback(async () => {
        try {
            const response = await fetch("/api/watch-tokens?all=1");
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to fetch watch tokens");
            }

            const data = await response.json();
            const list = Array.isArray(data) ? data : [];
            setWatchTokens(list);
            if (!selectedWatchTokenId && list.length > 0) {
                const firstActive = list.find((token: WatchTokenOption) => token.is_active) || list[0];
                setSelectedWatchTokenId(firstActive.id);
            }
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [selectedWatchTokenId]);

    usePolling(fetchWatchTokens, { intervalMs: POLL_INTERVAL });

    const selectedToken = useMemo(
        () => watchTokens.find((token) => token.id === selectedWatchTokenId) || null,
        [watchTokens, selectedWatchTokenId]
    );

    const featuredRecommendations = useMemo(
        () => STRATEGY_TYPE_ORDER
            .map((strategyType) => result?.optimization.topByType?.[strategyType] || null)
            .filter((recommendation): recommendation is Recommendation => recommendation !== null),
        [result]
    );

    const createStrategyFromRecommendation = useCallback(async (recommendation: Recommendation) => {
        if (!result?.token?.id) {
            throw new Error("No target token selected.");
        }

        const response = await fetch("/api/price-strategies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                watch_token_id: result.token.id,
                name: `${recommendation.strategyType} ${result.token.symbol || result.token.mint.slice(0, 6)} optimized`,
                type: recommendation.strategyType,
                params: recommendation.params,
                cooldown_sec: 300,
                chat_id: null,
            }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data?.error || "Failed to apply recommendation");
        }
    }, [result]);

    usePolling(async () => {
        if (!activeJob?.id) return;
        if (activeJob.status === "completed" || activeJob.status === "failed") return;

        try {
            const response = await fetch(`/api/strategy-optimize/jobs/${activeJob.id}`);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to refresh optimization job");
            }

            const job = await response.json() as OptimizationJob;
            setActiveJob(job);

            if (job.status === "completed" && job.result_json) {
                setResult(job.result_json);
                setStatusMessage(
                    job.result_json.optimization.topRecommendations.length > 0
                        ? "Optimization finished. Review the recommendations below."
                        : "Optimization finished, but no viable strategy was found. Try longer history or a smaller interval."
                );
                setRunning(false);
            } else if (job.status === "failed") {
                setErrorMessage(job.error_message || "Optimization failed");
                setRunning(false);
            } else {
                setStatusMessage(job.progress_message || `Optimization ${job.status}...`);
            }
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
            setRunning(false);
        }
    }, {
        enabled: Boolean(activeJob?.id) && activeJob?.status !== "completed" && activeJob?.status !== "failed",
        intervalMs: JOB_POLL_INTERVAL,
        runImmediately: false,
    });

    const runOptimization = async () => {
        if (!selectedWatchTokenId) {
            setErrorMessage("Please select a watch token first.");
            return;
        }

        const parsedHistoryDays = Number(historyDays || "0");
        if (!Number.isFinite(parsedHistoryDays) || parsedHistoryDays <= 0 || parsedHistoryDays > 30) {
            setErrorMessage("History days must be between 1 and 30.");
            return;
        }

        setRunning(true);
        setErrorMessage("");
        setStatusMessage("");
        setActiveJob(null);
        setResult(null);

        try {
            const response = await fetch("/api/strategy-optimize/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    watch_token_id: selectedWatchTokenId,
                    history_days: parsedHistoryDays,
                    interval,
                    style,
                }),
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                let message = "Optimization failed";
                if (text) {
                    try {
                        const data = JSON.parse(text) as { error?: string };
                        message = data?.error || message;
                    } catch {
                        message = text.slice(0, 240);
                    }
                }
                throw new Error(message);
            }

            const job = await response.json() as OptimizationJob;
            setActiveJob(job);

            if (job.status === "completed" && job.result_json) {
                setResult(job.result_json);
                setStatusMessage(
                    job.result_json.optimization.topRecommendations.length > 0
                        ? "Optimization finished. Review the recommendations below."
                        : "Optimization finished, but no viable strategy was found. Try longer history or a smaller interval."
                );
                setRunning(false);
            } else if (job.status === "failed") {
                throw new Error(job.error_message || "Optimization failed");
            } else {
                setStatusMessage(job.progress_message || `Optimization ${job.status}...`);
            }
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
            setActiveJob(null);
            setRunning(false);
        }
    };

    const applyRecommendation = async (recommendation: Recommendation) => {
        if (!result?.token?.id) return;

        const recommendationKey = getRecommendationKey(recommendation);
        setApplyingKey(recommendationKey);
        setErrorMessage("");
        setStatusMessage("");

        try {
            await createStrategyFromRecommendation(recommendation);
            setStatusMessage(`Strategy applied: ${recommendation.strategyType}`);
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setApplyingKey(null);
        }
    };

    const applyFeaturedRecommendations = async () => {
        if (!result?.token?.id || featuredRecommendations.length === 0) return;

        setBatchApplying(true);
        setApplyingKey(null);
        setErrorMessage("");
        setStatusMessage("");

        let successCount = 0;
        const failures: string[] = [];

        for (const recommendation of featuredRecommendations) {
            try {
                await createStrategyFromRecommendation(recommendation);
                successCount += 1;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Unknown error";
                failures.push(`${recommendation.strategyType}: ${message}`);
            }
        }

        if (successCount > 0) {
            setStatusMessage(`Applied ${successCount} featured strategies.`);
        }

        if (failures.length > 0) {
            setErrorMessage(`Some strategies failed: ${failures.join(" | ")}`);
        }

        setBatchApplying(false);
    };

    return (
        <section className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/86 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_24px_80px_-46px_rgba(0,0,0,0.95)] transition-colors">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_94%,transparent),color-mix(in_oklab,var(--color-primary)_7%,transparent))] px-6 py-5">
                <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                        Research Layer
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                        <WandSparkles className="h-5 w-5 text-primary" />
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Strategy Optimizer</h2>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                        Pull external history, test swing entries, then surface the strongest setups before pushing them into the live registry.
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <WandSparkles className="w-3.5 h-3.5 text-primary" />}
                    {loading ? "Loading" : "Research ready"}
                </div>
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorMessage}
                </div>
            )}

            {statusMessage && (
                <div className="mx-6 mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {statusMessage}
                </div>
            )}

            <div className="space-y-5 p-6">
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
                    <div className="space-y-4 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                        <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Input</div>
                            <h3 className="text-base font-semibold text-foreground">Optimization Scope</h3>
                            <p className="text-sm leading-6 text-muted-foreground">
                                Choose the target token, define the time horizon, then select how aggressive the optimizer should be.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <div className="md:col-span-2">
                                <label htmlFor={`${fieldId}-watch-token`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Watch Token</label>
                                <select
                                    id={`${fieldId}-watch-token`}
                                    value={selectedWatchTokenId}
                                    onChange={(event) => setSelectedWatchTokenId(event.target.value)}
                                    className={selectClassName}
                                >
                                    <option value="">Select token</option>
                                    {watchTokens.map((token) => (
                                        <option key={token.id} value={token.id}>
                                            {token.symbol || "TOKEN"} · {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`${fieldId}-history-days`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">History (days)</label>
                                <Input id={`${fieldId}-history-days`} value={historyDays} onChange={(event) => setHistoryDays(event.target.value)} />
                            </div>
                            <div>
                                <label htmlFor={`${fieldId}-interval`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Interval</label>
                                <select
                                    id={`${fieldId}-interval`}
                                    value={interval}
                                    onChange={(event) => setInterval(event.target.value as "5m" | "15m" | "1h")}
                                    className={selectClassName}
                                >
                                    <option value="5m">5m</option>
                                    <option value="15m">15m</option>
                                    <option value="1h">1h</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                            <div>
                                <label htmlFor={`${fieldId}-trading-style`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trading Style</label>
                                <select
                                    id={`${fieldId}-trading-style`}
                                    value={style}
                                    onChange={(event) => setStyle(event.target.value as "conservative" | "balanced" | "aggressive")}
                                    className={selectClassName}
                                >
                                    <option value="conservative">conservative</option>
                                    <option value="balanced">balanced</option>
                                    <option value="aggressive">aggressive</option>
                                </select>
                            </div>
                            <Button onClick={runOptimization} disabled={running || !selectedWatchTokenId} className="min-w-[13rem]">
                                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                                Optimize Strategy
                            </Button>
                        </div>

                        {selectedToken && (
                            <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Target token</div>
                                <div className="mt-2 text-base font-semibold text-foreground">
                                    {selectedToken.symbol || selectedToken.name || "TOKEN"}
                                </div>
                                <div className="mt-1 break-all text-xs font-mono text-muted-foreground">{selectedToken.mint}</div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                        <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Run State</div>
                            <h3 className="text-base font-semibold text-foreground">Optimization Status</h3>
                        </div>

                        {activeJob ? (
                            <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Job ID</div>
                                        <div className="mt-2 break-all font-mono text-xs text-foreground">{activeJob.id}</div>
                                    </div>
                                    <Badge variant="outline">{activeJob.status}</Badge>
                                </div>
                                <div className="mt-4 text-sm text-muted-foreground">
                                    {activeJob.progress_message || "Queued for processing."}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/20 p-4 text-sm text-muted-foreground">
                                No active optimization job. Configure the scope and run a search to populate recommendations.
                            </div>
                        )}
                    </div>
                </div>

                {result && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <MetricCard
                                label="Provider"
                                value={result.optimization.provider}
                                detail={result.optimization.poolName || "External market history"}
                            />
                            <MetricCard
                                label="Candles Used"
                                value={result.optimization.pointsUsed.toString()}
                                detail={`${result.optimization.historyDays}d at ${result.optimization.interval}`}
                            />
                            <MetricCard
                                label="Pool"
                                value={result.optimization.poolAddress.slice(0, 8)}
                                detail={result.optimization.poolAddress}
                            />
                            <MetricCard
                                label="Best Overall"
                                value={result.optimization.bestOverall ? getStrategyTypeLabel(result.optimization.bestOverall.strategyType) : "-"}
                                detail={result.optimization.bestOverall ? `score ${result.optimization.bestOverall.score.toFixed(3)}` : "No viable leader yet"}
                            />
                        </div>

                        <div className="space-y-3">
                            {result.optimization.topRecommendations.length === 0 && (
                                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                                    No strategy passed the minimum sample threshold for this run. Try `30d + 5m` or `30d + 15m`,
                                    or switch the trading style and re-run optimization.
                                </div>
                            )}
                            {featuredRecommendations.length > 0 && (
                                <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                                    <div className="flex flex-wrap items-end justify-between gap-3">
                                        <div>
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Featured Setups</div>
                                            <h3 className="mt-2 text-base font-semibold text-foreground">Best By Strategy Type</h3>
                                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                                Each strategy family keeps one independent best setup so you can compare continuation, rebound, bottom-reclaim and pullback styles side by side.
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={applyFeaturedRecommendations}
                                            disabled={batchApplying || featuredRecommendations.length === 0}
                                        >
                                            {batchApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                                            Apply All Featured
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-4">
                                        {featuredRecommendations.map((recommendation) => {
                                            const recommendationKey = getRecommendationKey(recommendation);
                                            return (
                                                <div key={`featured-${recommendationKey}`} className="space-y-3 rounded-[1.3rem] border border-primary/20 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_88%,transparent),color-mix(in_oklab,var(--color-primary)_10%,transparent))] p-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-foreground">{getStrategyTypeLabel(recommendation.strategyType)}</div>
                                                            <div className="text-[11px] text-muted-foreground">{recommendation.strategyType}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {recommendation.metrics.resolvedSignals < 4 && (
                                                                <Badge variant="outline">low sample</Badge>
                                                            )}
                                                            <Badge variant="default">score {recommendation.score.toFixed(3)}</Badge>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                                        <div>
                                                            <div className="text-muted-foreground">Lookahead</div>
                                                            <div className="font-semibold text-foreground">{recommendation.lookaheadMin}m</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-muted-foreground">Resolved</div>
                                                            <div className="font-semibold text-foreground">{recommendation.metrics.resolvedSignals}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-muted-foreground">Hit Rate</div>
                                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.hitRate)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-muted-foreground">Avg End Return</div>
                                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgEndReturnPct)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-muted-foreground">Avg MFE</div>
                                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgMfePct)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-muted-foreground">Avg MAE</div>
                                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgMaePct)}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-muted-foreground">Stable Score</div>
                                                            <div className="font-semibold text-foreground">{recommendation.stability.stabilityScore.toFixed(2)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-xs font-mono text-foreground/90 break-all">
                                                        {JSON.stringify(recommendation.params)}
                                                    </div>

                                                    <RecommendationWindows recommendation={recommendation} />

                                                    <div className="flex justify-end">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => applyRecommendation(recommendation)}
                                                            disabled={applyingKey === recommendationKey}
                                                        >
                                                            {applyingKey === recommendationKey ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <WandSparkles className="w-4 h-4" />
                                                            )}
                                                            Apply This Strategy
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                            {result.optimization.topRecommendations.length > 0 && (
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Ranking View</div>
                                    <h3 className="mt-2 text-base font-semibold text-foreground">Overall Leaderboard</h3>
                                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                        The combined ranking still exists, but it now starts by surfacing one best setup from each strategy type.
                                    </p>
                                </div>
                            )}
                            {result.optimization.topRecommendations.map((recommendation) => (
                                <div key={getRecommendationKey(recommendation)} className="space-y-3 rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Badge variant={recommendation.rank === 1 ? "default" : "outline"}>
                                                #{recommendation.rank}
                                            </Badge>
                                            <div>
                                                <div className="text-sm font-semibold text-foreground">{getStrategyTypeLabel(recommendation.strategyType)}</div>
                                                <div className="text-[11px] text-muted-foreground">{recommendation.strategyType}</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            score <span className="font-semibold text-foreground">{recommendation.score.toFixed(3)}</span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4 xl:grid-cols-7">
                                        <div>
                                            <div className="text-muted-foreground">Lookahead</div>
                                            <div className="font-semibold text-foreground">{recommendation.lookaheadMin}m</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Resolved</div>
                                            <div className="font-semibold text-foreground">{recommendation.metrics.resolvedSignals}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Hit Rate</div>
                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.hitRate)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Avg MFE</div>
                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgMfePct)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Avg MAE</div>
                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgMaePct)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Avg End</div>
                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgEndReturnPct)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Avg Minutes</div>
                                            <div className="font-semibold text-foreground">
                                                {recommendation.metrics.avgMinutesToHit === null ? "-" : `${recommendation.metrics.avgMinutesToHit.toFixed(2)}m`}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Stable Score</div>
                                            <div className="font-semibold text-foreground">{recommendation.stability.stabilityScore.toFixed(2)}</div>
                                        </div>
                                    </div>

                                    <div className="rounded-[1rem] border border-border/60 bg-background/40 p-3 text-xs font-mono text-foreground/90 break-all">
                                        {JSON.stringify(recommendation.params)}
                                    </div>

                                    <RecommendationWindows recommendation={recommendation} />

                                    <div className="flex justify-end">
                                        <Button
                                            size="sm"
                                            onClick={() => applyRecommendation(recommendation)}
                                            disabled={applyingKey === getRecommendationKey(recommendation)}
                                        >
                                            {applyingKey === getRecommendationKey(recommendation) ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <WandSparkles className="w-4 h-4" />
                                            )}
                                            Apply Strategy
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
