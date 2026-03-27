"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FlaskConical } from "lucide-react";

interface StrategyOption {
    id: string;
    name: string;
    type: string;
    params: Record<string, unknown>;
    watch_tokens?: { mint?: string; symbol?: string } | { mint?: string; symbol?: string }[] | null;
}

interface BacktestSample {
    triggeredAt: string;
    entryPrice: number;
    targetPrice: number;
    maxFuturePrice: number;
    maxFutureReturnPct: number;
    hit: boolean;
    minutesToHit: number | null;
}

interface BacktestSummary {
    tokenMint: string;
    strategyId: string;
    strategyName: string;
    strategyType: string;
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
    samples: BacktestSample[];
}

const POLL_INTERVAL = 10000;

function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return "-";
    if (value >= 1) return `$${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
    if (value >= 0.01) return `$${value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
    if (value >= 0.0001) return `$${value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${value.toPrecision(8)}`;
}

function getTokenMeta(strategy: StrategyOption): { mint: string; symbol: string } {
    const raw = strategy.watch_tokens;
    const token = Array.isArray(raw) ? raw[0] : raw;
    return {
        mint: token?.mint || "",
        symbol: token?.symbol || "TOKEN",
    };
}

export function StrategyBacktestPanel() {
    const [strategies, setStrategies] = useState<StrategyOption[]>([]);
    const [selectedStrategyId, setSelectedStrategyId] = useState("");
    const [lookaheadMin, setLookaheadMin] = useState("120");
    const [historyDays, setHistoryDays] = useState("30");
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [result, setResult] = useState<BacktestSummary | null>(null);

    const fetchStrategies = useCallback(async () => {
        try {
            const res = await fetch("/api/price-strategies?all=1");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to fetch strategies");
            }
            const data = await res.json();
            const list = Array.isArray(data)
                ? data.filter((s: StrategyOption) =>
                    s.type === "entry_long" || s.type === "entry_rebound" || s.type === "pullback_to_ma")
                : [];
            setStrategies(list);
            if (!selectedStrategyId && list.length > 0) {
                setSelectedStrategyId(list[0].id);
            }
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [selectedStrategyId]);

    useEffect(() => {
        fetchStrategies();
        const interval = setInterval(fetchStrategies, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchStrategies]);

    const selectedStrategy = useMemo(
        () => strategies.find((strategy) => strategy.id === selectedStrategyId) || null,
        [strategies, selectedStrategyId]
    );

    const handleRunBacktest = async () => {
        if (!selectedStrategyId) {
            setErrorMessage("Please select a strategy first.");
            return;
        }

        const lookahead = Number(lookaheadMin || "0");
        const days = Number(historyDays || "0");
        if (!Number.isFinite(lookahead) || lookahead <= 0 || !Number.isFinite(days) || days <= 0) {
            setErrorMessage("Lookahead and history days must be positive numbers.");
            return;
        }

        setRunning(true);
        setErrorMessage("");
        try {
            const res = await fetch("/api/price-backtest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    strategy_id: selectedStrategyId,
                    lookahead_min: lookahead,
                    history_days: days,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Backtest failed");
            }

            const data = await res.json();
            setResult(data.summary as BacktestSummary);
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden transition-colors shadow-none">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-cyan-400" />
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Signal Backtest</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Validate whether continuation and rebound entry setups tend to follow through.
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

            <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className="text-[11px] text-muted-foreground block mb-1">Entry Strategy</label>
                        <select
                            value={selectedStrategyId}
                            onChange={(e) => setSelectedStrategyId(e.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="">Select entry signal</option>
                            {strategies.map((strategy) => {
                                const token = getTokenMeta(strategy);
                                return (
                                    <option key={strategy.id} value={strategy.id}>
                                        {strategy.name} · {token.symbol}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">Lookahead (min)</label>
                        <Input value={lookaheadMin} onChange={(e) => setLookaheadMin(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">History (days)</label>
                        <Input value={historyDays} onChange={(e) => setHistoryDays(e.target.value)} />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button onClick={handleRunBacktest} disabled={running || !selectedStrategyId}>
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                        Run Backtest
                    </Button>
                    {selectedStrategy && (
                        <Badge variant="outline" className="font-mono">
                            {selectedStrategy.type}
                        </Badge>
                    )}
                </div>

                {result && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Actionable Signals</div>
                                <div className="text-xl font-semibold text-foreground">{result.signalsTriggered}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Resolved / Hits</div>
                                <div className="text-xl font-semibold text-emerald-400">{result.hits}</div>
                                <div className="text-[11px] text-muted-foreground mt-1">
                                    {result.resolvedSignals} resolved · {result.skippedSignals} skipped
                                </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Hit Rate</div>
                                <div className="text-xl font-semibold text-cyan-300">{formatPercent(result.hitRate)}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Avg Max Return</div>
                                <div className="text-xl font-semibold text-foreground">{formatPercent(result.avgMaxReturnPct)}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Avg Minutes to Target</div>
                                <div className="text-base font-semibold text-foreground">
                                    {result.avgMinutesToHit === null ? "-" : `${result.avgMinutesToHit.toFixed(2)} min`}
                                </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Lookahead</div>
                                <div className="text-base font-semibold text-foreground">{result.lookaheadMin} min</div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-3">
                                <div className="text-[11px] text-muted-foreground">Snapshots Used</div>
                                <div className="text-base font-semibold text-foreground">{result.snapshotsUsed}</div>
                            </div>
                        </div>

                        <div>
                            <div className="text-sm font-semibold text-foreground mb-2">Recent Samples</div>
                            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                {result.samples.slice(-8).reverse().map((sample) => (
                                    <div key={sample.triggeredAt} className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-mono text-xs text-muted-foreground">{new Date(sample.triggeredAt).toLocaleString()}</span>
                                            <Badge variant={sample.hit ? "secondary" : "outline"}>{sample.hit ? "HIT" : "MISS"}</Badge>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                            <div>Entry: <span className="font-mono text-foreground">{formatPrice(sample.entryPrice)}</span></div>
                                            <div>Target: <span className="font-mono text-foreground">{formatPrice(sample.targetPrice)}</span></div>
                                            <div>Max: <span className="font-mono text-foreground">{formatPrice(sample.maxFuturePrice)}</span></div>
                                            <div>Return: <span className="font-mono text-foreground">{formatPercent(sample.maxFutureReturnPct)}</span></div>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {sample.hit
                                                ? `Reached target in ${sample.minutesToHit?.toFixed(2)} min`
                                                : "Did not reach target within lookahead"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
