"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, WandSparkles } from "lucide-react";

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
        avgMinutesToHit: number | null;
        skippedSignals: number;
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

const POLL_INTERVAL = 10000;
const STRATEGY_TYPE_ORDER = ["entry_long", "entry_rebound", "pullback_to_ma"] as const;

function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
}

function getStrategyTypeLabel(strategyType: string): string {
    if (strategyType === "entry_long") return "Trend Continuation";
    if (strategyType === "entry_rebound") return "Local Rebound";
    if (strategyType === "pullback_to_ma") return "Pullback To MA";
    return strategyType;
}

function getRecommendationKey(recommendation: Recommendation): string {
    return `${recommendation.strategyType}-${recommendation.lookaheadMin}-${JSON.stringify(recommendation.params)}`;
}

export function StrategyOptimizerPanel() {
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

    useEffect(() => {
        fetchWatchTokens();
        const timer = window.setInterval(() => {
            void fetchWatchTokens();
        }, POLL_INTERVAL);
        return () => window.clearInterval(timer);
    }, [fetchWatchTokens]);

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

        try {
            const response = await fetch("/api/strategy-optimize", {
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
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || "Optimization failed");
            }

            const data = await response.json();
            setResult(data as OptimizationResponse);
            setStatusMessage(
                (data as OptimizationResponse).optimization.topRecommendations.length > 0
                    ? "Optimization finished. Review the recommendations below."
                    : "Optimization finished, but no viable strategy was found. Try longer history or a smaller interval."
            );
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden transition-colors shadow-none">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <WandSparkles className="w-5 h-5 text-violet-400" />
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Strategy Optimizer</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Pull external history, test swing entries, then apply the best setup.
                        </p>
                    </div>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {errorMessage}
                </div>
            )}

            {statusMessage && (
                <div className="mx-6 mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    {statusMessage}
                </div>
            )}

            <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className="text-[11px] text-muted-foreground block mb-1">Watch Token</label>
                        <select
                            value={selectedWatchTokenId}
                            onChange={(event) => setSelectedWatchTokenId(event.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <label className="text-[11px] text-muted-foreground block mb-1">History (days)</label>
                        <Input value={historyDays} onChange={(event) => setHistoryDays(event.target.value)} />
                    </div>
                    <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Interval</label>
                        <select
                            value={interval}
                            onChange={(event) => setInterval(event.target.value as "5m" | "15m" | "1h")}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="5m">5m</option>
                            <option value="15m">15m</option>
                            <option value="1h">1h</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Trading Style</label>
                        <select
                            value={style}
                            onChange={(event) => setStyle(event.target.value as "conservative" | "balanced" | "aggressive")}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="conservative">conservative</option>
                            <option value="balanced">balanced</option>
                            <option value="aggressive">aggressive</option>
                        </select>
                    </div>
                    <div className="md:col-span-2 flex items-end">
                        <Button onClick={runOptimization} disabled={running || !selectedWatchTokenId}>
                            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                            Optimize Strategy
                        </Button>
                    </div>
                </div>

                {selectedToken && (
                    <div className="text-xs text-muted-foreground">
                        Target token: <span className="font-semibold text-foreground">{selectedToken.symbol || selectedToken.name || "TOKEN"}</span>
                        {" · "}
                        <span className="font-mono">{selectedToken.mint}</span>
                    </div>
                )}

                {result && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Provider</div>
                                <div className="text-base font-semibold text-foreground capitalize">{result.optimization.provider}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Candles Used</div>
                                <div className="text-base font-semibold text-foreground">{result.optimization.pointsUsed}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Pool</div>
                                <div className="text-xs font-mono text-foreground break-all">{result.optimization.poolAddress}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Best Overall</div>
                                <div className="text-base font-semibold text-violet-300">
                                    {result.optimization.bestOverall ? getStrategyTypeLabel(result.optimization.bestOverall.strategyType) : "-"}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {result.optimization.topRecommendations.length === 0 && (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                                    No strategy passed the minimum sample threshold for this run. Try `30d + 5m` or `30d + 15m`,
                                    or switch the trading style and re-run optimization.
                                </div>
                            )}
                            {featuredRecommendations.length > 0 && (
                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">Best By Strategy Type</h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Each strategy family keeps one independent best setup so you can compare continuation, rebound and pullback styles side by side.
                                        </p>
                                    </div>
                                    <div className="flex justify-end">
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
                                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                                        {featuredRecommendations.map((recommendation) => {
                                            const recommendationKey = getRecommendationKey(recommendation);
                                            return (
                                                <div key={`featured-${recommendationKey}`} className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-foreground">{getStrategyTypeLabel(recommendation.strategyType)}</div>
                                                            <div className="text-[11px] text-muted-foreground">{recommendation.strategyType}</div>
                                                        </div>
                                                        <Badge variant="secondary">score {recommendation.score.toFixed(3)}</Badge>
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
                                                            <div className="text-muted-foreground">Avg Max Return</div>
                                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgMaxReturnPct)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs font-mono text-foreground/90 break-all">
                                                        {JSON.stringify(recommendation.params)}
                                                    </div>

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

                        <div className="space-y-3">
                            {result.optimization.topRecommendations.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">Overall Leaderboard</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        The combined ranking still exists, but it now starts by surfacing one best setup from each strategy type.
                                    </p>
                                </div>
                            )}
                            {result.optimization.topRecommendations.map((recommendation) => (
                                <div key={getRecommendationKey(recommendation)} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Badge variant={recommendation.rank === 1 ? "secondary" : "outline"}>
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

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
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
                                            <div className="text-muted-foreground">Avg Max Return</div>
                                            <div className="font-semibold text-foreground">{formatPercent(recommendation.metrics.avgMaxReturnPct)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground">Avg Minutes</div>
                                            <div className="font-semibold text-foreground">
                                                {recommendation.metrics.avgMinutesToHit === null ? "-" : `${recommendation.metrics.avgMinutesToHit.toFixed(2)}m`}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs font-mono text-foreground/90 break-all">
                                        {JSON.stringify(recommendation.params)}
                                    </div>

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
        </div>
    );
}
