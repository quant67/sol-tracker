"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Pause, Play, Trash2 } from "lucide-react";

type StrategyType = "pct_change_up" | "pct_change_down" | "breakout_up" | "breakout_down";

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

function formatPrice(value: number | string | null): string {
    if (value === null || value === undefined) return "N/A";
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "N/A";
    if (num >= 1) return `$${num.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
    return `$${num.toPrecision(6)}`;
}

function getRelatedToken(strategy: Strategy): { mint: string; symbol: string } {
    const raw = strategy.watch_tokens;
    const token = Array.isArray(raw) ? raw[0] : raw;
    return {
        mint: token?.mint || "",
        symbol: token?.symbol || "TOKEN",
    };
}

export function PriceStrategyManager() {
    const [watchTokens, setWatchTokens] = useState<WatchToken[]>([]);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>("");

    const [mintInput, setMintInput] = useState("");

    const [selectedWatchTokenId, setSelectedWatchTokenId] = useState("");
    const [strategyType, setStrategyType] = useState<StrategyType>("pct_change_up");
    const [strategyName, setStrategyName] = useState("");
    const [windowMin, setWindowMin] = useState("5");
    const [thresholdPct, setThresholdPct] = useState("10");
    const [targetPrice, setTargetPrice] = useState("");
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

            setWatchTokens(Array.isArray(tokenData) ? tokenData : []);
            setStrategies(Array.isArray(strategyData) ? strategyData : []);
            setErrorMessage("");

            if (!selectedWatchTokenId && Array.isArray(tokenData) && tokenData.length > 0) {
                const firstActive = tokenData.find((t: WatchToken) => t.is_active) || tokenData[0];
                setSelectedWatchTokenId(firstActive.id);
            }
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [selectedWatchTokenId]);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const activeTokenCount = useMemo(
        () => watchTokens.filter((t) => t.is_active).length,
        [watchTokens]
    );

    const activeStrategyCount = useMemo(
        () => strategies.filter((s) => s.is_active).length,
        [strategies]
    );

    const handleAddWatchToken = async (e: React.FormEvent) => {
        e.preventDefault();
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

    const handleAddStrategy = async (e: React.FormEvent) => {
        e.preventDefault();
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Price Strategy Center</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Watch Tokens {activeTokenCount}/{watchTokens.length} · Active Strategies {activeStrategyCount}/{strategies.length}
                    </p>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {errorMessage && (
                <div className="mx-6 mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {errorMessage}
                </div>
            )}

            <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Watch Tokens</h3>
                    <form onSubmit={handleAddWatchToken} className="flex gap-2">
                        <Input
                            placeholder="Token mint address..."
                            value={mintInput}
                            onChange={(e) => setMintInput(e.target.value)}
                            className="font-mono text-xs"
                        />
                        <Button type="submit" size="sm" disabled={busyAction === "add-token"}>
                            {busyAction === "add-token" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Add
                        </Button>
                    </form>

                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                        {watchTokens.length === 0 && !loading && (
                            <div className="text-xs text-muted-foreground italic py-3">No watch tokens yet.</div>
                        )}

                        {watchTokens.map((token) => (
                            <div key={token.id} className="border border-border rounded-lg p-3 bg-muted/20">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-foreground">{token.symbol || "TOKEN"}</span>
                                            <Badge variant={token.is_active ? "secondary" : "outline"}>
                                                {token.is_active ? "ACTIVE" : "PAUSED"}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground font-mono truncate mt-1">{token.mint}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            title={token.is_active ? "Pause token" : "Activate token"}
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
                                <div className="text-[11px] text-muted-foreground mt-2">
                                    Last Price: <span className="font-mono text-foreground/80">{formatPrice(token.last_price)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Add Strategy</h3>
                    <form onSubmit={handleAddStrategy} className="space-y-3 border border-border rounded-lg p-4 bg-muted/20">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">Watch Token</label>
                                <select
                                    value={selectedWatchTokenId}
                                    onChange={(e) => setSelectedWatchTokenId(e.target.value)}
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
                                <label className="text-[11px] text-muted-foreground block mb-1">Type</label>
                                <select
                                    value={strategyType}
                                    onChange={(e) => setStrategyType(e.target.value as StrategyType)}
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <option value="pct_change_up">pct_change_up</option>
                                    <option value="pct_change_down">pct_change_down</option>
                                    <option value="breakout_up">breakout_up</option>
                                    <option value="breakout_down">breakout_down</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-[11px] text-muted-foreground block mb-1">Strategy Name (optional)</label>
                            <Input
                                value={strategyName}
                                onChange={(e) => setStrategyName(e.target.value)}
                                placeholder="e.g. 5m Pump Alert"
                            />
                        </div>

                        {(strategyType === "pct_change_up" || strategyType === "pct_change_down") ? (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[11px] text-muted-foreground block mb-1">Window (min)</label>
                                    <Input value={windowMin} onChange={(e) => setWindowMin(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-[11px] text-muted-foreground block mb-1">Threshold (%)</label>
                                    <Input value={thresholdPct} onChange={(e) => setThresholdPct(e.target.value)} />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">Target Price ($)</label>
                                <Input value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">Cooldown (sec)</label>
                                <Input value={cooldownSec} onChange={(e) => setCooldownSec(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-[11px] text-muted-foreground block mb-1">Chat ID (optional)</label>
                                <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="default from env if empty" />
                            </div>
                        </div>

                        <Button type="submit" disabled={busyAction === "add-strategy"} className="w-full">
                            {busyAction === "add-strategy" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Create Strategy
                        </Button>
                    </form>

                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                        {strategies.length === 0 && !loading && (
                            <div className="text-xs text-muted-foreground italic py-3">No strategies yet.</div>
                        )}
                        {strategies.map((strategy) => {
                            const token = getRelatedToken(strategy);
                            return (
                                <div key={strategy.id} className="border border-border rounded-lg p-3 bg-muted/20">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-foreground truncate">{strategy.name}</span>
                                                <Badge variant={strategy.is_active ? "secondary" : "outline"}>
                                                    {strategy.is_active ? "RUNNING" : "PAUSED"}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-1">
                                                {strategy.type} · {token.symbol} · cooldown {strategy.cooldown_sec}s
                                            </p>
                                            <p className="text-[11px] text-muted-foreground font-mono truncate">{token.mint}</p>
                                            <p className="text-[11px] text-muted-foreground font-mono truncate mt-1">
                                                params: {JSON.stringify(strategy.params)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                title={strategy.is_active ? "Pause strategy" : "Enable strategy"}
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
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}
