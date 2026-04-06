"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Siren, ExternalLink } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface PriceAlertRow {
    id: string;
    strategy_id: string;
    watch_token_id: string;
    mint: string;
    triggered_at: string;
    snapshot: Record<string, unknown>;
    strategy_name: string | null;
    strategy_type: string | null;
    token_symbol: string | null;
    token_name: string | null;
}

const POLL_INTERVAL = 8000;

function formatPercent(value: unknown): string {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    const sign = num > 0 ? "+" : "";
    return `${sign}${num.toFixed(2)}%`;
}

function formatPrice(value: unknown): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "-";
    if (num >= 1) return `$${num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${num.toPrecision(6)}`;
}

function summarizeSnapshot(snapshot: Record<string, unknown>): string {
    const kind = String(snapshot.kind || "");
    if (kind === "pct_change_up" || kind === "pct_change_down") {
        return `${formatPercent(snapshot.changePct)} in ${snapshot.windowMin}m`;
    }
    if (kind === "breakout_up" || kind === "breakout_down") {
        return `threshold ${formatPrice(snapshot.thresholdPrice)}`;
    }
    if (kind === "entry_long") {
        return `trend ${formatPercent(snapshot.trendPct)} · target +${snapshot.targetPct}%`;
    }
    if (kind === "entry_rebound") {
        return `rebound ${formatPercent(snapshot.reboundPct)} · target +${snapshot.targetPct}%`;
    }
    if (kind === "pullback_to_ma") {
        return `pullback ${formatPercent(-Number(snapshot.distanceFromHighPct))} · target +${snapshot.targetPct}%`;
    }
    if (kind === "failed_breakdown") {
        return `reclaim ${formatPercent(snapshot.reboundPct)} · dd ${formatPercent(-Number(snapshot.drawdownFromHighPct))}`;
    }
    return "-";
}

export function PriceAlertHistory() {
    const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    const fetchAlerts = useCallback(async () => {
        try {
            const res = await fetch("/api/price-alerts?limit=120");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to fetch price alerts");
            }
            const data = await res.json();
            setAlerts(Array.isArray(data) ? data : []);
            setErrorMessage("");
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    return (
        <section className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/86 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_24px_80px_-46px_rgba(0,0,0,0.95)] transition-colors">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_94%,transparent),color-mix(in_oklab,var(--color-primary)_7%,transparent))] px-6 py-5">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Alert Log</div>
                    <div className="mt-2 flex items-center gap-3">
                        <Siren className="h-5 w-5 text-primary" />
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Price Alert History</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Review how strategies have fired over time and inspect the signal context without leaving the dashboard.
                    </p>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorMessage}
                </div>
            )}

            <div className="min-h-[260px] p-4">
                {alerts.length === 0 && !loading ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center text-sm italic text-muted-foreground transition-colors">
                        No price alerts yet
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground font-medium">Token</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Strategy</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Signal</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Price</TableHead>
                                <TableHead className="text-muted-foreground font-medium text-right">Triggered</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {alerts.map((row) => {
                                const symbol = row.token_symbol || `${row.mint.slice(0, 4)}...`;
                                const summary = summarizeSnapshot(row.snapshot || {});
                                const currentPrice = formatPrice(row.snapshot?.currentPrice);
                                const strategyType = row.strategy_type || "unknown";
                                const isUp = strategyType.includes("up") || strategyType === "entry_long" || strategyType === "entry_rebound" || strategyType === "pullback_to_ma" || strategyType === "failed_breakdown";

                                return (
                                    <TableRow key={row.id} className="border-border hover:bg-muted/40 transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <a
                                                    href={`https://dexscreener.com/solana/${row.mint}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex w-fit items-center gap-1 text-sm font-semibold text-foreground transition-colors hover:text-primary"
                                                    title="View on DexScreener"
                                                >
                                                    {symbol}
                                                    <ExternalLink className="w-3 h-3 opacity-60" />
                                                </a>
                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                    {row.mint.slice(0, 6)}...{row.mint.slice(-6)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-medium text-foreground">
                                                    {row.strategy_name || "Unnamed"}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">{strategyType}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={isUp ? "default" : "outline"} className="font-mono">
                                                {summary}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs font-mono text-foreground/90">{currentPrice}</span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(row.triggered_at).toLocaleString([], {
                                                    hour12: false,
                                                    month: "2-digit",
                                                    day: "2-digit",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                })}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </section>
    );
}
