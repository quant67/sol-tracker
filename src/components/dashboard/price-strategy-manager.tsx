"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { Activity, Loader2, Pause, Play, Plus, Target, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePolling } from "@/hooks/use-polling";

type StrategyType = "pct_change_up" | "pct_change_down" | "breakout_up" | "breakout_down" | "entry_long" | "entry_rebound" | "pullback_to_ma" | "failed_breakdown";

interface WatchToken {
    id: string;
    mint: string;
    symbol: string | null;
    name: string | null;
    is_active: boolean;
    last_price: number | string | null;
}

interface Strategy {
    id: string;
    watch_token_id: string;
    name: string;
    type: StrategyType;
    params: Record<string, unknown>;
    cooldown_sec: number;
    is_active: boolean;
    chat_id: string | null;
    watch_tokens?: { mint?: string; symbol?: string } | { mint?: string; symbol?: string }[] | null;
}

const POLL_INTERVAL = 8000;
const selectClassName = "h-10 w-full rounded-xl border border-input/90 bg-input/70 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] focus:border-ring focus:bg-card focus:ring-4 focus:ring-ring/20";

function formatPrice(value: number | string | null): string {
    if (value === null || value === undefined) return "N/A";
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "N/A";
    if (num >= 1) return `$${num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${num.toPrecision(6)}`;
}

function formatParamValue(value: unknown): string {
    if (typeof value === "number") {
        return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
}

function getRelatedToken(strategy: Strategy): { mint: string; symbol: string } {
    const raw = strategy.watch_tokens;
    const token = Array.isArray(raw) ? raw[0] : raw;
    return {
        mint: token?.mint || "",
        symbol: token?.symbol || "TOKEN",
    };
}

function getStrategyTypeLabel(strategyType: StrategyType): string {
    if (strategyType === "pct_change_up") return "Pct Change Up";
    if (strategyType === "pct_change_down") return "Pct Change Down";
    if (strategyType === "breakout_up") return "Breakout Up";
    if (strategyType === "breakout_down") return "Breakout Down";
    if (strategyType === "entry_long") return "Trend Continuation";
    if (strategyType === "entry_rebound") return "Local Rebound";
    if (strategyType === "failed_breakdown") return "Failed Breakdown";
    return "Pullback To MA";
}

function getStrategyHint(strategyType: StrategyType): string {
    if (strategyType === "pct_change_up" || strategyType === "pct_change_down") {
        return "Simple momentum trigger using a fixed lookback window and percent move threshold.";
    }
    if (strategyType === "breakout_up" || strategyType === "breakout_down") {
        return "Static price breakout alert that fires once current price crosses a target level.";
    }
    if (strategyType === "entry_long") {
        return "Best for continuation entries near local highs when short-term trend stays strong.";
    }
    if (strategyType === "entry_rebound") {
        return "Best for local low rebounds after price regains short-term structure.";
    }
    if (strategyType === "failed_breakdown") {
        return "Experimental bottom signal for deep pullbacks that fail to break down and quickly reclaim structure.";
    }
    return "Best for trend pullbacks that reclaim moving averages and continue higher.";
}

function SummaryCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail: string;
}) {
    return (
        <div className="rounded-[1.35rem] border border-border/70 bg-background/30 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
    );
}

export function PriceStrategyManager() {
    const fieldId = useId();
    const [watchTokens, setWatchTokens] = useState<WatchToken[]>([]);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState("");

    const [mintInput, setMintInput] = useState("");

    const [selectedWatchTokenId, setSelectedWatchTokenId] = useState("");
    const [strategyListScope, setStrategyListScope] = useState<"selected" | "all">("selected");
    const [strategyStatusFilter, setStrategyStatusFilter] = useState<"active" | "all">("all");
    const [strategyType, setStrategyType] = useState<StrategyType>("pct_change_up");
    const [strategyName, setStrategyName] = useState("");
    const [windowMin, setWindowMin] = useState("5");
    const [thresholdPct, setThresholdPct] = useState("10");
    const [targetPrice, setTargetPrice] = useState("");
    const [lookbackMin, setLookbackMin] = useState("30");
    const [fastWindowMin, setFastWindowMin] = useState("5");
    const [slowWindowMin, setSlowWindowMin] = useState("15");
    const [entryTargetPct, setEntryTargetPct] = useState("10");
    const [breakoutTolerancePct, setBreakoutTolerancePct] = useState("1.5");
    const [minTrendPct, setMinTrendPct] = useState("2");
    const [minReboundPct, setMinReboundPct] = useState("1.5");
    const [maxDistanceFromLowPct, setMaxDistanceFromLowPct] = useState("6");
    const [pullbackTolerancePct, setPullbackTolerancePct] = useState("1.5");
    const [reclaimPct, setReclaimPct] = useState("1");
    const [minDrawdownPct, setMinDrawdownPct] = useState("12");
    const [cooldownSec, setCooldownSec] = useState("300");
    const [chatId, setChatId] = useState("");

    const fetchAll = useCallback(async () => {
        try {
            const [tokenRes, strategyRes] = await Promise.all([
                fetch("/api/watch-tokens?all=1"),
                fetch("/api/price-strategies?all=1"),
            ]);

            if (!tokenRes.ok) {
                const data = await tokenRes.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to fetch watch tokens");
            }
            if (!strategyRes.ok) {
                const data = await strategyRes.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to fetch strategies");
            }

            const tokenData = await tokenRes.json();
            const strategyData = await strategyRes.json();
            const tokenList = Array.isArray(tokenData) ? tokenData : [];

            setWatchTokens(tokenList);
            setStrategies(Array.isArray(strategyData) ? strategyData : []);
            setErrorMessage("");

            const hasSelected = tokenList.some((token: WatchToken) => token.id === selectedWatchTokenId);
            if ((!selectedWatchTokenId || !hasSelected) && tokenList.length > 0) {
                const firstActive = tokenList.find((token: WatchToken) => token.is_active) || tokenList[0];
                setSelectedWatchTokenId(firstActive.id);
            }
            if (tokenList.length === 0) {
                setSelectedWatchTokenId("");
            }
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [selectedWatchTokenId]);

    usePolling(fetchAll, { intervalMs: POLL_INTERVAL });

    const activeTokenCount = useMemo(
        () => watchTokens.filter((token) => token.is_active).length,
        [watchTokens]
    );

    const activeStrategyCount = useMemo(
        () => strategies.filter((strategy) => strategy.is_active).length,
        [strategies]
    );

    const selectedToken = useMemo(
        () => watchTokens.find((token) => token.id === selectedWatchTokenId) || null,
        [watchTokens, selectedWatchTokenId]
    );

    const strategyCountByTokenId = useMemo(() => {
        const counts = new Map<string, number>();
        for (const strategy of strategies) {
            counts.set(strategy.watch_token_id, (counts.get(strategy.watch_token_id) || 0) + 1);
        }
        return counts;
    }, [strategies]);

    const filteredStrategies = useMemo(() => {
        const filtered = strategies.filter((strategy) => {
            if (strategyListScope === "selected" && selectedWatchTokenId && strategy.watch_token_id !== selectedWatchTokenId) {
                return false;
            }
            if (strategyStatusFilter === "active" && !strategy.is_active) {
                return false;
            }
            return true;
        });

        return [...filtered].sort((left, right) => {
            if (left.is_active !== right.is_active) {
                return left.is_active ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
        });
    }, [selectedWatchTokenId, strategies, strategyListScope, strategyStatusFilter]);

    const selectedTokenStrategyCount = selectedWatchTokenId
        ? strategies.filter((strategy) => strategy.watch_token_id === selectedWatchTokenId).length
        : 0;

    const handleAddWatchToken = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!mintInput.trim()) return;

        setBusyAction("add-token");
        try {
            const res = await fetch("/api/watch-tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mint: mintInput.trim() }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Add watch token failed");
            }
            setMintInput("");
            await fetchAll();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setBusyAction(null);
        }
    };

    const toggleWatchToken = async (token: WatchToken) => {
        setBusyAction(`token-toggle-${token.id}`);
        try {
            const res = await fetch("/api/watch-tokens", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: token.id, is_active: !token.is_active }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update watch token failed");
            }
            await fetchAll();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setBusyAction(null);
        }
    };

    const deleteWatchToken = async (token: WatchToken) => {
        setBusyAction(`token-delete-${token.id}`);
        try {
            const res = await fetch(`/api/watch-tokens?id=${token.id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Delete watch token failed");
            }
            await fetchAll();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setBusyAction(null);
        }
    };

    const handleAddStrategy = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedWatchTokenId) {
            setErrorMessage("Please choose a watch token first.");
            return;
        }

        const cooldown = Number(cooldownSec || "300");
        if (!Number.isFinite(cooldown) || cooldown <= 0) {
            setErrorMessage("Cooldown must be a positive number.");
            return;
        }

        let params: Record<string, number> = {};
        if (strategyType === "pct_change_up" || strategyType === "pct_change_down") {
            const windowNum = Number(windowMin || "0");
            const thresholdNum = Number(thresholdPct || "0");
            if (!Number.isFinite(windowNum) || windowNum <= 0 || !Number.isFinite(thresholdNum) || thresholdNum <= 0) {
                setErrorMessage("Window and threshold must be positive numbers.");
                return;
            }
            params = { windowMin: windowNum, thresholdPct: thresholdNum };
        } else if (strategyType === "entry_long") {
            const lookbackNum = Number(lookbackMin || "0");
            const fastNum = Number(fastWindowMin || "0");
            const slowNum = Number(slowWindowMin || "0");
            const targetNum = Number(entryTargetPct || "0");
            const breakoutPctNum = Number(breakoutTolerancePct || "0");
            const trendPctNum = Number(minTrendPct || "0");

            if (
                !Number.isFinite(lookbackNum) || lookbackNum <= 0 ||
                !Number.isFinite(fastNum) || fastNum <= 0 ||
                !Number.isFinite(slowNum) || slowNum <= 0 ||
                !Number.isFinite(targetNum) || targetNum <= 0 ||
                !Number.isFinite(breakoutPctNum) || breakoutPctNum < 0 ||
                !Number.isFinite(trendPctNum) || trendPctNum < 0
            ) {
                setErrorMessage("Entry signal parameters must be valid positive numbers.");
                return;
            }

            params = {
                lookbackMin: lookbackNum,
                fastWindowMin: fastNum,
                slowWindowMin: slowNum,
                targetPct: targetNum,
                breakoutTolerancePct: breakoutPctNum,
                minTrendPct: trendPctNum,
            };
        } else if (strategyType === "entry_rebound") {
            const lookbackNum = Number(lookbackMin || "0");
            const fastNum = Number(fastWindowMin || "0");
            const slowNum = Number(slowWindowMin || "0");
            const targetNum = Number(entryTargetPct || "0");
            const reboundPctNum = Number(minReboundPct || "0");
            const distancePctNum = Number(maxDistanceFromLowPct || "0");

            if (
                !Number.isFinite(lookbackNum) || lookbackNum <= 0 ||
                !Number.isFinite(fastNum) || fastNum <= 0 ||
                !Number.isFinite(slowNum) || slowNum <= 0 ||
                !Number.isFinite(targetNum) || targetNum <= 0 ||
                !Number.isFinite(reboundPctNum) || reboundPctNum < 0 ||
                !Number.isFinite(distancePctNum) || distancePctNum <= 0
            ) {
                setErrorMessage("Rebound signal parameters must be valid positive numbers.");
                return;
            }

            params = {
                lookbackMin: lookbackNum,
                fastWindowMin: fastNum,
                slowWindowMin: slowNum,
                targetPct: targetNum,
                minReboundPct: reboundPctNum,
                maxDistanceFromLowPct: distancePctNum,
            };
        } else if (strategyType === "pullback_to_ma") {
            const lookbackNum = Number(lookbackMin || "0");
            const fastNum = Number(fastWindowMin || "0");
            const slowNum = Number(slowWindowMin || "0");
            const targetNum = Number(entryTargetPct || "0");
            const pullbackPctNum = Number(pullbackTolerancePct || "0");
            const trendPctNum = Number(minTrendPct || "0");

            if (
                !Number.isFinite(lookbackNum) || lookbackNum <= 0 ||
                !Number.isFinite(fastNum) || fastNum <= 0 ||
                !Number.isFinite(slowNum) || slowNum <= 0 ||
                !Number.isFinite(targetNum) || targetNum <= 0 ||
                !Number.isFinite(pullbackPctNum) || pullbackPctNum < 0 ||
                !Number.isFinite(trendPctNum) || trendPctNum < 0
            ) {
                setErrorMessage("Pullback signal parameters must be valid positive numbers.");
                return;
            }

            params = {
                lookbackMin: lookbackNum,
                fastWindowMin: fastNum,
                slowWindowMin: slowNum,
                targetPct: targetNum,
                pullbackTolerancePct: pullbackPctNum,
                minTrendPct: trendPctNum,
            };
        } else if (strategyType === "failed_breakdown") {
            const lookbackNum = Number(lookbackMin || "0");
            const fastNum = Number(fastWindowMin || "0");
            const slowNum = Number(slowWindowMin || "0");
            const targetNum = Number(entryTargetPct || "0");
            const reclaimNum = Number(reclaimPct || "0");
            const maxDistanceNum = Number(maxDistanceFromLowPct || "0");
            const drawdownNum = Number(minDrawdownPct || "0");

            if (
                !Number.isFinite(lookbackNum) || lookbackNum <= 0 ||
                !Number.isFinite(fastNum) || fastNum <= 0 ||
                !Number.isFinite(slowNum) || slowNum <= 0 ||
                !Number.isFinite(targetNum) || targetNum <= 0 ||
                !Number.isFinite(reclaimNum) || reclaimNum <= 0 ||
                !Number.isFinite(maxDistanceNum) || maxDistanceNum <= 0 ||
                !Number.isFinite(drawdownNum) || drawdownNum < 0
            ) {
                setErrorMessage("Failed breakdown parameters must be valid positive numbers.");
                return;
            }

            params = {
                lookbackMin: lookbackNum,
                fastWindowMin: fastNum,
                slowWindowMin: slowNum,
                targetPct: targetNum,
                reclaimPct: reclaimNum,
                maxDistanceFromLowPct: maxDistanceNum,
                minDrawdownPct: drawdownNum,
            };
        } else {
            const target = Number(targetPrice || "0");
            if (!Number.isFinite(target) || target <= 0) {
                setErrorMessage("Target price must be a positive number.");
                return;
            }
            params = { targetPrice: target };
        }

        setBusyAction("add-strategy");
        try {
            const res = await fetch("/api/price-strategies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    watch_token_id: selectedWatchTokenId,
                    name: strategyName.trim() || `${strategyType} signal`,
                    type: strategyType,
                    params,
                    cooldown_sec: Math.floor(cooldown),
                    chat_id: chatId.trim() || null,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Add strategy failed");
            }
            setStrategyName("");
            await fetchAll();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setBusyAction(null);
        }
    };

    const toggleStrategy = async (strategy: Strategy) => {
        setBusyAction(`strategy-toggle-${strategy.id}`);
        try {
            const res = await fetch("/api/price-strategies", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: strategy.id, is_active: !strategy.is_active }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update strategy failed");
            }
            await fetchAll();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setBusyAction(null);
        }
    };

    const deleteStrategy = async (strategy: Strategy) => {
        setBusyAction(`strategy-delete-${strategy.id}`);
        try {
            const res = await fetch(`/api/price-strategies?id=${strategy.id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Delete strategy failed");
            }
            await fetchAll();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <section className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/86 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_24px_80px_-46px_rgba(0,0,0,0.95)] transition-colors">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_94%,transparent),color-mix(in_oklab,var(--color-primary)_7%,transparent))] px-6 py-5">
                <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                        Execution Layer
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">Price Strategy Center</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                        Operate the watchlist, compose strategies, and keep the active registry readable without turning the interface into a dense admin form.
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Activity className="w-3.5 h-3.5 text-primary" />}
                    {loading ? "Syncing" : "Ready"}
                </div>
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorMessage}
                </div>
            )}

            <div className="space-y-6 p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Watch Tokens" value={watchTokens.length.toString()} detail={`${activeTokenCount} active`} />
                    <SummaryCard label="Strategies" value={strategies.length.toString()} detail={`${activeStrategyCount} running`} />
                    <SummaryCard
                        label="Selected Token"
                        value={selectedToken?.symbol || selectedToken?.name || "None"}
                        detail={selectedToken ? `${selectedTokenStrategyCount} strategies attached` : "Pick a token from the watchlist"}
                    />
                    <SummaryCard
                        label="Last Price"
                        value={selectedToken ? formatPrice(selectedToken.last_price) : "N/A"}
                        detail={selectedToken?.mint ? `${selectedToken.mint.slice(0, 6)}...${selectedToken.mint.slice(-4)}` : "No token selected"}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] 2xl:grid-cols-[290px_minmax(0,1fr)_360px]">
                    <section className="space-y-4 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                        <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Selection</div>
                            <h3 className="text-base font-semibold text-foreground">Watchlist</h3>
                            <p className="text-sm leading-6 text-muted-foreground">
                                Keep selection simple here, then build or review strategies against the chosen token.
                            </p>
                        </div>

                        <form onSubmit={handleAddWatchToken} className="flex gap-2">
                            <Input
                                id={`${fieldId}-mint-input`}
                                placeholder="Token mint address..."
                                value={mintInput}
                                onChange={(event) => setMintInput(event.target.value)}
                                className="font-mono text-xs"
                                aria-label="Token mint address"
                            />
                            <Button type="submit" size="sm" disabled={busyAction === "add-token"}>
                                {busyAction === "add-token" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Add
                            </Button>
                        </form>

                        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                            {watchTokens.length === 0 && !loading && (
                                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                                    No watch tokens yet. Add a mint to start the strategy workflow.
                                </div>
                            )}

                            {watchTokens.map((token) => {
                                const isSelected = token.id === selectedWatchTokenId;
                                const strategyCount = strategyCountByTokenId.get(token.id) || 0;

                                return (
                                    <div
                                        key={token.id}
                                        className={`rounded-[1.2rem] border p-3 transition-colors ${
                                            isSelected
                                                ? "border-primary/35 bg-primary/10 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]"
                                                : "border-border/70 bg-background/30 hover:bg-accent/20"
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedWatchTokenId(token.id)}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold text-foreground">{token.symbol || "TOKEN"}</span>
                                                    <Badge variant={token.is_active ? "default" : "outline"}>
                                                        {token.is_active ? "ACTIVE" : "PAUSED"}
                                                    </Badge>
                                                    <Badge variant="outline">{strategyCount} strategies</Badge>
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">
                                                    {token.name || "Watch token"} · {formatPrice(token.last_price)}
                                                </div>
                                                <div className="mt-1 text-[11px] font-mono text-muted-foreground truncate">{token.mint}</div>
                                            </button>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    title={token.is_active ? "Pause token" : "Activate token"}
                                                    aria-label={token.is_active ? `Pause ${token.symbol || token.mint}` : `Activate ${token.symbol || token.mint}`}
                                                    onClick={() => toggleWatchToken(token)}
                                                    disabled={busyAction === `token-toggle-${token.id}`}
                                                >
                                                    {busyAction === `token-toggle-${token.id}` ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : token.is_active ? (
                                                        <Pause className="w-3.5 h-3.5 text-amber-400" />
                                                    ) : (
                                                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    title="Delete token"
                                                    aria-label={`Delete ${token.symbol || token.mint}`}
                                                    onClick={() => deleteWatchToken(token)}
                                                    disabled={busyAction === `token-delete-${token.id}`}
                                                >
                                                    {busyAction === `token-delete-${token.id}` ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="min-w-0 space-y-4 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                        <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Manual Build</div>
                            <h3 className="text-base font-semibold text-foreground">Strategy Composer</h3>
                            <p className="text-sm leading-6 text-muted-foreground">
                                Build a manual strategy for the selected token without losing context to a crowded form.
                            </p>
                        </div>

                        <div className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Selected token</div>
                                    <div className="text-base font-semibold text-foreground">
                                        {selectedToken?.symbol || selectedToken?.name || "Choose a token"}
                                    </div>
                                </div>
                                {selectedToken && (
                                    <div className="text-right">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Last price</div>
                                        <div className="text-sm font-semibold text-foreground">{formatPrice(selectedToken.last_price)}</div>
                                    </div>
                                )}
                            </div>
                            {selectedToken && (
                                <div className="mt-3 text-[11px] font-mono text-muted-foreground break-all">
                                    {selectedToken.mint}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleAddStrategy} className="space-y-5 rounded-[1.25rem] border border-border/60 bg-background/18 p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
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
                                    <label htmlFor={`${fieldId}-strategy-type`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Strategy Type</label>
                                    <select
                                        id={`${fieldId}-strategy-type`}
                                        value={strategyType}
                                        onChange={(event) => setStrategyType(event.target.value as StrategyType)}
                                        className={selectClassName}
                                    >
                                        <option value="pct_change_up">pct_change_up</option>
                                        <option value="pct_change_down">pct_change_down</option>
                                        <option value="breakout_up">breakout_up</option>
                                        <option value="breakout_down">breakout_down</option>
                                        <option value="entry_long">entry_long</option>
                                        <option value="entry_rebound">entry_rebound</option>
                                        <option value="failed_breakdown">failed_breakdown</option>
                                        <option value="pullback_to_ma">pullback_to_ma</option>
                                    </select>
                                </div>
                            </div>

                            <div className="rounded-[1.2rem] border border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_88%,transparent),color-mix(in_oklab,var(--color-primary)_8%,transparent))] p-4">
                                <div className="flex items-center gap-2">
                                    <Target className="w-4 h-4 text-primary" />
                                    <div className="text-sm font-semibold text-foreground">{getStrategyTypeLabel(strategyType)}</div>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{getStrategyHint(strategyType)}</p>
                            </div>

                            <div>
                                <label htmlFor={`${fieldId}-strategy-name`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Strategy Name (optional)</label>
                                <Input
                                    id={`${fieldId}-strategy-name`}
                                    value={strategyName}
                                    onChange={(event) => setStrategyName(event.target.value)}
                                    placeholder="e.g. 5m Pump Alert"
                                />
                            </div>

                            {(strategyType === "pct_change_up" || strategyType === "pct_change_down") ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor={`${fieldId}-window-min`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Window (min)</label>
                                        <Input id={`${fieldId}-window-min`} value={windowMin} onChange={(event) => setWindowMin(event.target.value)} />
                                    </div>
                                    <div>
                                        <label htmlFor={`${fieldId}-threshold-pct`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Threshold (%)</label>
                                        <Input id={`${fieldId}-threshold-pct`} value={thresholdPct} onChange={(event) => setThresholdPct(event.target.value)} />
                                    </div>
                                </div>
                            ) : (strategyType === "entry_long" || strategyType === "entry_rebound" || strategyType === "pullback_to_ma" || strategyType === "failed_breakdown") ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor={`${fieldId}-lookback-min`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Lookback (min)</label>
                                            <Input id={`${fieldId}-lookback-min`} value={lookbackMin} onChange={(event) => setLookbackMin(event.target.value)} />
                                        </div>
                                        <div>
                                            <label htmlFor={`${fieldId}-entry-target-pct`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Target (%)</label>
                                            <Input id={`${fieldId}-entry-target-pct`} value={entryTargetPct} onChange={(event) => setEntryTargetPct(event.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor={`${fieldId}-fast-window-min`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Fast MA (min)</label>
                                            <Input id={`${fieldId}-fast-window-min`} value={fastWindowMin} onChange={(event) => setFastWindowMin(event.target.value)} />
                                        </div>
                                        <div>
                                            <label htmlFor={`${fieldId}-slow-window-min`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Slow MA (min)</label>
                                            <Input id={`${fieldId}-slow-window-min`} value={slowWindowMin} onChange={(event) => setSlowWindowMin(event.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor={`${fieldId}-dynamic-primary`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                {strategyType === "entry_long"
                                                    ? "Breakout Tolerance (%)"
                                                    : strategyType === "entry_rebound"
                                                        ? "Min Rebound (%)"
                                                        : strategyType === "failed_breakdown"
                                                            ? "Reclaim (%)"
                                                        : "Pullback Tolerance (%)"}
                                            </label>
                                            <Input
                                                id={`${fieldId}-dynamic-primary`}
                                                value={strategyType === "entry_long"
                                                    ? breakoutTolerancePct
                                                    : strategyType === "entry_rebound"
                                                        ? minReboundPct
                                                        : strategyType === "failed_breakdown"
                                                            ? reclaimPct
                                                        : pullbackTolerancePct}
                                                onChange={(event) => strategyType === "entry_long"
                                                    ? setBreakoutTolerancePct(event.target.value)
                                                    : strategyType === "entry_rebound"
                                                        ? setMinReboundPct(event.target.value)
                                                        : strategyType === "failed_breakdown"
                                                            ? setReclaimPct(event.target.value)
                                                        : setPullbackTolerancePct(event.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`${fieldId}-dynamic-secondary`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                {strategyType === "entry_long"
                                                    ? "Min Trend (%)"
                                                    : strategyType === "entry_rebound"
                                                        ? "Max Distance From Low (%)"
                                                        : strategyType === "failed_breakdown"
                                                            ? "Max Distance From Low (%)"
                                                        : "Min Trend (%)"}
                                            </label>
                                            <Input
                                                id={`${fieldId}-dynamic-secondary`}
                                                value={strategyType === "entry_long"
                                                    ? minTrendPct
                                                    : strategyType === "entry_rebound"
                                                        ? maxDistanceFromLowPct
                                                        : strategyType === "failed_breakdown"
                                                            ? maxDistanceFromLowPct
                                                        : minTrendPct}
                                                onChange={(event) => strategyType === "entry_long"
                                                    ? setMinTrendPct(event.target.value)
                                                    : strategyType === "entry_rebound"
                                                        ? setMaxDistanceFromLowPct(event.target.value)
                                                        : strategyType === "failed_breakdown"
                                                            ? setMaxDistanceFromLowPct(event.target.value)
                                                        : setMinTrendPct(event.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {strategyType === "failed_breakdown" && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor={`${fieldId}-min-drawdown-pct`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Min Drawdown (%)</label>
                                                <Input id={`${fieldId}-min-drawdown-pct`} value={minDrawdownPct} onChange={(event) => setMinDrawdownPct(event.target.value)} />
                                            </div>
                                            <div className="rounded-[1.1rem] border border-dashed border-border/70 bg-background/24 px-3 py-2 text-[11px] text-muted-foreground">
                                                Experimental bottom model: previous sample must sit near the local low, then current price reclaims above fast MA.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <label htmlFor={`${fieldId}-target-price`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Target Price ($)</label>
                                    <Input id={`${fieldId}-target-price`} value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} />
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor={`${fieldId}-cooldown-sec`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooldown (sec)</label>
                                    <Input id={`${fieldId}-cooldown-sec`} value={cooldownSec} onChange={(event) => setCooldownSec(event.target.value)} />
                                </div>
                                <div>
                                    <label htmlFor={`${fieldId}-chat-id`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Chat ID (optional)</label>
                                    <Input
                                        id={`${fieldId}-chat-id`}
                                        value={chatId}
                                        onChange={(event) => setChatId(event.target.value)}
                                        placeholder="default from env if empty"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button type="submit" disabled={busyAction === "add-strategy"}>
                                    {busyAction === "add-strategy" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Create Strategy
                                </Button>
                            </div>
                        </form>
                    </section>

                    <section className="space-y-4 rounded-[1.5rem] border border-border/70 bg-background/16 p-5">
                        <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">Live Registry</div>
                            <h3 className="text-base font-semibold text-foreground">Strategy Registry</h3>
                            <p className="text-sm leading-6 text-muted-foreground">
                                Review only what matters right now instead of scanning one long mixed list.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label htmlFor={`${fieldId}-strategy-scope`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scope</label>
                                <select
                                    id={`${fieldId}-strategy-scope`}
                                    value={strategyListScope}
                                    onChange={(event) => setStrategyListScope(event.target.value as "selected" | "all")}
                                    className={selectClassName}
                                >
                                    <option value="selected">Selected token</option>
                                    <option value="all">All tokens</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`${fieldId}-strategy-status`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</label>
                                <select
                                    id={`${fieldId}-strategy-status`}
                                    value={strategyStatusFilter}
                                    onChange={(event) => setStrategyStatusFilter(event.target.value as "active" | "all")}
                                    className={selectClassName}
                                >
                                    <option value="all">All strategies</option>
                                    <option value="active">Active only</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Visible strategies</div>
                                <div className="text-lg font-semibold text-foreground">{filteredStrategies.length}</div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Activity className="w-4 h-4 text-primary" />
                                {strategyStatusFilter === "active" ? "Focused on live signals" : "Showing all saved rules"}
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                            {filteredStrategies.length === 0 && !loading && (
                                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                                    No strategies match the current filter. Try switching scope or creating one from the composer.
                                </div>
                            )}

                            {filteredStrategies.map((strategy) => {
                                const token = getRelatedToken(strategy);
                                const paramEntries = Object.entries(strategy.params || {}).slice(0, 6);

                                return (
                                    <div key={strategy.id} className="rounded-[1.25rem] border border-border/70 bg-background/30 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold text-foreground truncate">{strategy.name}</span>
                                                    <Badge variant={strategy.is_active ? "default" : "outline"}>
                                                        {strategy.is_active ? "RUNNING" : "PAUSED"}
                                                    </Badge>
                                                    <Badge variant="outline">{getStrategyTypeLabel(strategy.type)}</Badge>
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-foreground">
                                                    {token.symbol} · cooldown {strategy.cooldown_sec}s
                                                </div>
                                                <div className="mt-1 text-[11px] font-mono text-muted-foreground truncate">
                                                    {token.mint}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    title={strategy.is_active ? "Pause strategy" : "Enable strategy"}
                                                    aria-label={strategy.is_active ? `Pause strategy ${strategy.name}` : `Enable strategy ${strategy.name}`}
                                                    onClick={() => toggleStrategy(strategy)}
                                                    disabled={busyAction === `strategy-toggle-${strategy.id}`}
                                                >
                                                    {busyAction === `strategy-toggle-${strategy.id}` ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : strategy.is_active ? (
                                                        <Pause className="w-3.5 h-3.5 text-amber-400" />
                                                    ) : (
                                                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    title="Delete strategy"
                                                    aria-label={`Delete strategy ${strategy.name}`}
                                                    onClick={() => deleteStrategy(strategy)}
                                                    disabled={busyAction === `strategy-delete-${strategy.id}`}
                                                >
                                                    {busyAction === `strategy-delete-${strategy.id}` ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>

                                        {paramEntries.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {paramEntries.map(([key, value]) => (
                                                    <span
                                                        key={`${strategy.id}-${key}`}
                                                        className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                                                    >
                                                        <span className="text-foreground">{key}</span> {formatParamValue(value)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </section>
    );
}
