"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FlaskConical } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";

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
    mfePrice: number;
    mfePct: number;
    maePrice: number;
    maePct: number;
    endPrice: number;
    endReturnPct: number;
    hit: boolean;
    minutesToHit: number | null;
}

interface BacktestWindowMetric {
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
    avgMfePct: number;
    avgMaePct: number;
    avgEndReturnPct: number;
    avgMinutesToHit: number | null;
    windowMetrics: BacktestWindowMetric[];
    samples: BacktestSample[];
}

const POLL_INTERVAL = 10000;
const selectClassName = "h-10 w-full rounded-xl border border-input/90 bg-input/70 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] focus:border-ring focus:bg-card focus:ring-4 focus:ring-ring/20";

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

function MetricCard({
    label,
    value,
    detail,
    tone = "default",
}: {
    label: string;
    value: string;
    detail: string;
    tone?: "default" | "positive" | "warning";
}) {
    const toneClass = tone === "positive"
        ? "text-emerald-300"
        : tone === "warning"
            ? "text-rose-300"
            : "text-foreground";

    return (
        <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
            <div className={`mt-2 text-lg font-semibold tracking-[-0.03em] ${toneClass}`}>{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
    );
}

export function StrategyBacktestPanel() {
    const fieldId = useId();
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
                    s.type === "entry_long" || s.type === "entry_rebound" || s.type === "pullback_to_ma" || s.type === "failed_breakdown")
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

    usePolling(fetchStrategies, { intervalMs: POLL_INTERVAL });

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
        <section className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/86 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_24px_80px_-46px_rgba(0,0,0,0.95)] transition-colors">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_94%,transparent),color-mix(in_oklab,var(--color-primary)_7%,transparent))] px-6 py-5">
                <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                        Validation Layer
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                        <FlaskConical className="h-5 w-5 text-primary" />
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Signal Backtest</h2>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                        Validate how fast a signal works, how deep it pulls back, and how results change across multiple windows before promoting it to live monitoring.
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <FlaskConical className="w-3.5 h-3.5 text-primary" />}
                    {loading ? "Loading" : "Backtest ready"}
                </div>
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorMessage}
                </div>
            )}

            <div className="space-y-5 p-6">
                <div className="rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <div className="md:col-span-2">
                            <label htmlFor={`${fieldId}-entry-strategy`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Entry Strategy</label>
                            <select
                                id={`${fieldId}-entry-strategy`}
                                value={selectedStrategyId}
                                onChange={(e) => setSelectedStrategyId(e.target.value)}
                                className={selectClassName}
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
                            <label htmlFor={`${fieldId}-lookahead-min`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Lookahead (min)</label>
                            <Input id={`${fieldId}-lookahead-min`} value={lookaheadMin} onChange={(e) => setLookaheadMin(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor={`${fieldId}-history-days`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">History (days)</label>
                            <Input id={`${fieldId}-history-days`} value={historyDays} onChange={(e) => setHistoryDays(e.target.value)} />
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
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
                </div>

                {result && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                            <MetricCard label="Actionable Signals" value={result.signalsTriggered.toString()} detail="Signals worth evaluating" />
                            <MetricCard label="Resolved / Hits" value={result.hits.toString()} detail={`${result.resolvedSignals} resolved · ${result.skippedSignals} skipped`} tone="positive" />
                            <MetricCard label="Hit Rate" value={formatPercent(result.hitRate)} detail={`${result.lookaheadMin} minute lookahead`} tone="positive" />
                            <MetricCard label="Avg MFE" value={formatPercent(result.avgMfePct)} detail="Best excursion after entry" />
                            <MetricCard label="Avg MAE" value={formatPercent(result.avgMaePct)} detail="Worst excursion after entry" tone="warning" />
                        </div>

                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <MetricCard
                                label="Avg Minutes to Target"
                                value={result.avgMinutesToHit === null ? "-" : `${result.avgMinutesToHit.toFixed(2)}m`}
                                detail="Average time to resolution"
                            />
                            <MetricCard label="Avg End Return" value={formatPercent(result.avgEndReturnPct)} detail="Final lookahead return" />
                            <MetricCard label="Snapshots Used" value={result.snapshotsUsed.toString()} detail="Historical samples processed" />
                            <MetricCard label="Token" value={selectedStrategy ? getTokenMeta(selectedStrategy).symbol : "TOKEN"} detail={result.tokenMint} />
                        </div>

                        <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Window Profile</div>
                                    <div className="mt-2 text-base font-semibold text-foreground">Lookahead Comparison</div>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    Compare hit rate and excursion metrics across multiple lookahead windows.
                                </div>
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/20">
                                <table className="w-full min-w-[720px] text-xs">
                                    <thead className="bg-background/60 text-muted-foreground">
                                        <tr>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Window</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Resolved</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Hits</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Hit Rate</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Avg MFE</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Avg MAE</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Avg End</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Avg Minutes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.windowMetrics.map((metric) => (
                                            <tr key={metric.lookaheadMin} className="border-t border-border/70">
                                                <td className="px-3 py-3 font-semibold text-foreground">{metric.lookaheadMin}m</td>
                                                <td className="px-3 py-3 text-foreground">{metric.resolvedSignals}</td>
                                                <td className="px-3 py-3 text-foreground">{metric.hits}</td>
                                                <td className="px-3 py-3 text-primary">{formatPercent(metric.hitRate)}</td>
                                                <td className="px-3 py-3 text-foreground">{formatPercent(metric.avgMfePct)}</td>
                                                <td className="px-3 py-3 text-rose-300">{formatPercent(metric.avgMaePct)}</td>
                                                <td className="px-3 py-3 text-foreground">{formatPercent(metric.avgEndReturnPct)}</td>
                                                <td className="px-3 py-3 text-foreground">
                                                    {metric.avgMinutesToHit === null ? "-" : `${metric.avgMinutesToHit.toFixed(2)}m`}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Trade Samples</div>
                                <div className="mt-2 text-base font-semibold text-foreground">Resolved Backtest Events</div>
                            </div>
                            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/20">
                                <table className="w-full min-w-[980px] text-xs">
                                    <thead className="bg-background/60 text-muted-foreground">
                                        <tr>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Triggered</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Entry</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Target</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Max Price</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Max Return</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">MFE</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">MAE</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">End Return</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Minutes to Hit</th>
                                            <th className="px-3 py-3 text-left font-semibold uppercase tracking-[0.14em]">Outcome</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.samples.map((sample) => (
                                            <tr key={`${sample.triggeredAt}-${sample.entryPrice}`} className="border-t border-border/70">
                                                <td className="px-3 py-3 text-muted-foreground">
                                                    {new Date(sample.triggeredAt).toLocaleString([], {
                                                        hour12: false,
                                                        month: "2-digit",
                                                        day: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </td>
                                                <td className="px-3 py-3 font-mono text-foreground">{formatPrice(sample.entryPrice)}</td>
                                                <td className="px-3 py-3 font-mono text-foreground">{formatPrice(sample.targetPrice)}</td>
                                                <td className="px-3 py-3 font-mono text-foreground">{formatPrice(sample.maxFuturePrice)}</td>
                                                <td className="px-3 py-3 text-emerald-300">{formatPercent(sample.maxFutureReturnPct)}</td>
                                                <td className="px-3 py-3 text-foreground">{formatPercent(sample.mfePct)}</td>
                                                <td className="px-3 py-3 text-rose-300">{formatPercent(sample.maePct)}</td>
                                                <td className="px-3 py-3 text-foreground">{formatPercent(sample.endReturnPct)}</td>
                                                <td className="px-3 py-3 text-foreground">
                                                    {sample.minutesToHit === null ? "-" : `${sample.minutesToHit.toFixed(2)}m`}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <Badge variant={sample.hit ? "default" : "outline"}>
                                                        {sample.hit ? "hit" : "open"}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
