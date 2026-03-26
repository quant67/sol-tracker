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
        <div className="bg-card border border-border rounded-2xl overflow-hidden transition-colors shadow-none">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Siren className="w-5 h-5 text-rose-400" />
                    <h2 className="text-lg font-semibold text-foreground">Price Alert History</h2>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {errorMessage}
                </div>
            )}

            <div className="p-2 min-h-[260px]">
                {alerts.length === 0 && !loading ? (
                    <div className="p-12 text-center text-muted-foreground text-sm italic transition-colors">
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
                                const isUp = strategyType.includes("up");

                                return (
                                    <TableRow key={row.id} className="border-border hover:bg-muted/40 transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <a
                                                    href={`https://dexscreener.com/solana/${row.mint}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sm font-semibold text-foreground hover:text-indigo-400 transition-colors w-fit flex items-center gap-1"
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
                                            <Badge variant={isUp ? "secondary" : "outline"} className="font-mono">
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
        </div>
    );
}
