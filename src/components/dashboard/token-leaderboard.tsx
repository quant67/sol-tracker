"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
    ArrowDownWideNarrow,
    Copy,
    ExternalLink,
    Loader2,
    Trophy,
    Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { usePolling } from "@/hooks/use-polling";

const POLL_INTERVAL = 15000;
const WINDOW_OPTIONS = [
    { value: "1d", label: "1D" },
    { value: "3d", label: "3D" },
    { value: "7d", label: "7D" },
    { value: "15d", label: "15D" },
] as const;
const SORT_OPTIONS = [
    { value: "buyers_desc", label: "Buyer count" },
    { value: "recent_desc", label: "Recent buy" },
    { value: "market_cap_desc", label: "Market cap" },
] as const;
const selectClassName = "h-8 rounded-lg border border-border/80 bg-card/70 px-3 text-xs font-medium text-foreground outline-none transition-[border-color,box-shadow,background-color] focus:border-ring focus:bg-card focus:ring-4 focus:ring-ring/20";

type WindowKey = typeof WINDOW_OPTIONS[number]["value"];
type SortMode = typeof SORT_OPTIONS[number]["value"];

interface TokenLeaderboardItem {
    mint: string;
    symbol: string;
    name: string;
    marketCap: number | null;
    lastBuyMarketCap: number | null;
    priceChangePct: number | null;
    buyerCount: number;
    buyers: string[];
    lastBoughtAt: string;
}

function formatMarketCap(marketCap: number | null) {
    if (!marketCap) return "N/A";
    if (marketCap >= 1_000_000_000) return `$${(marketCap / 1_000_000_000).toFixed(2)}B`;
    if (marketCap >= 1_000_000) return `$${(marketCap / 1_000_000).toFixed(2)}M`;
    if (marketCap >= 1_000) return `$${(marketCap / 1_000).toFixed(1)}K`;
    return `$${marketCap.toFixed(0)}`;
}

function formatMint(mint: string) {
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function formatLastBuy(timestamp: string) {
    return new Date(timestamp).toLocaleString([], {
        month: "short",
        day: "2-digit",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatPriceChange(changePct: number | null) {
    if (changePct === null) return "N/A";
    const sign = changePct > 0 ? "+" : "";
    return `${sign}${changePct.toFixed(1)}%`;
}

function getPriceChangeClass(changePct: number | null) {
    if (changePct === null) return "text-muted-foreground";
    if (changePct > 0) return "text-emerald-300";
    if (changePct < 0) return "text-red-300";
    return "text-muted-foreground";
}

function BuyerList({ buyers }: { buyers: string[] }) {
    const visibleBuyers = buyers.slice(0, 5);
    const extraCount = buyers.length - visibleBuyers.length;

    return (
        <div className="flex flex-wrap gap-1.5">
            {visibleBuyers.map((buyer) => (
                <span
                    key={buyer}
                    className="max-w-[9rem] truncate rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                    title={buyer}
                >
                    {buyer}
                </span>
            ))}
            {extraCount > 0 && (
                <span className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    +{extraCount}
                </span>
            )}
        </div>
    );
}

function TokenIdentity({ item }: { item: TokenLeaderboardItem }) {
    return (
        <div className="min-w-0">
            <a
                href={`https://dexscreener.com/solana/${item.mint}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit max-w-full items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
                title="View on DexScreener"
            >
                <span className="truncate">{item.symbol || formatMint(item.mint)}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
            <div className="mt-1 max-w-[14rem] truncate text-[11px] text-muted-foreground" title={item.name}>
                {item.name}
            </div>
        </div>
    );
}

export function TokenLeaderboard() {
    const [windowKey, setWindowKey] = useState<WindowKey>("1d");
    const [sortMode, setSortMode] = useState<SortMode>("buyers_desc");
    const [items, setItems] = useState<TokenLeaderboardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");
    const [copiedMint, setCopiedMint] = useState("");

    const queryString = useMemo(
        () => new URLSearchParams({ window: windowKey, sort: sortMode }).toString(),
        [windowKey, sortMode]
    );

    const fetchLeaderboard = useCallback(async () => {
        try {
            setErrorMessage("");
            const res = await fetch(`/api/token-leaderboard?${queryString}`, { cache: "no-store" });
            const data = await res.json();

            if (res.ok && Array.isArray(data.items)) {
                setItems(data.items);
                return;
            }

            setErrorMessage(data.error || "Leaderboard request failed.");
        } catch (error) {
            console.error("Error fetching token leaderboard:", error);
            setErrorMessage("Leaderboard request failed.");
        } finally {
            setLoading(false);
        }
    }, [queryString]);

    usePolling(fetchLeaderboard, { intervalMs: POLL_INTERVAL });

    const handleCopyMint = useCallback(async (mint: string) => {
        await navigator.clipboard.writeText(mint);
        setCopiedMint(mint);
        window.setTimeout(() => setCopiedMint(""), 1400);
    }, []);

    return (
        <section id="token-leaderboard" className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/86 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_24px_80px_-46px_rgba(0,0,0,0.95)] transition-colors">
            <div className="flex flex-col gap-4 border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_94%,transparent),color-mix(in_oklab,var(--color-primary)_7%,transparent))] px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Token Flow</div>
                    <div className="mt-2 flex items-center gap-3">
                        <Trophy className="h-5 w-5 text-primary" />
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Token Leaderboard</h2>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        Rank tokens by how many monitored people bought them in the selected window.
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="grid grid-cols-4 gap-1 rounded-xl border border-border/70 bg-background/35 p-1">
                        {WINDOW_OPTIONS.map((option) => (
                            <Button
                                key={option.value}
                                type="button"
                                variant={windowKey === option.value ? "default" : "ghost"}
                                size="xs"
                                className="h-7 min-w-11"
                                onClick={() => {
                                    setLoading(true);
                                    setWindowKey(option.value);
                                }}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowDownWideNarrow className="h-3.5 w-3.5 text-primary" />
                        <select
                            value={sortMode}
                            onChange={(event) => {
                                setLoading(true);
                                setSortMode(event.target.value as SortMode);
                            }}
                            className={selectClassName}
                        >
                            {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="min-h-[260px] p-4">
                {loading ? (
                    <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                        Loading token flow
                    </div>
                ) : errorMessage ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center text-sm text-destructive">
                        {errorMessage}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground transition-colors">
                        Waiting for buy signals in this window
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {items.map((item, index) => (
                                <article key={item.mint} className="rounded-[1.35rem] border border-border/70 bg-background/25 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-sm font-semibold text-primary">
                                                #{index + 1}
                                            </div>
                                            <TokenIdentity item={item} />
                                        </div>
                                        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                            {item.buyerCount} people
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Market Cap</div>
                                            <div className="mt-1 font-mono text-foreground/90">{formatMarketCap(item.marketCap)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Since Buy</div>
                                            <div className={`mt-1 font-mono font-semibold ${getPriceChangeClass(item.priceChangePct)}`}>
                                                {formatPriceChange(item.priceChangePct)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Last Buy</div>
                                            <div className="mt-1 font-medium text-foreground/90">{formatLastBuy(item.lastBoughtAt)}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Buyers</div>
                                        <BuyerList buyers={item.buyers} />
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                                        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={item.mint}>
                                            {formatMint(item.mint)}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            title="Copy CA"
                                            aria-label={`Copy ${item.symbol} CA`}
                                            onClick={() => handleCopyMint(item.mint)}
                                        >
                                            <Copy className={copiedMint === item.mint ? "text-emerald-300" : ""} />
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border hover:bg-transparent">
                                        <TableHead className="w-16 text-muted-foreground font-medium">Rank</TableHead>
                                        <TableHead className="text-muted-foreground font-medium">Token</TableHead>
                                        <TableHead className="text-muted-foreground font-medium">CA</TableHead>
                                        <TableHead className="text-muted-foreground font-medium">Market Cap</TableHead>
                                        <TableHead className="text-muted-foreground font-medium">Since Buy</TableHead>
                                        <TableHead className="text-muted-foreground font-medium">People</TableHead>
                                        <TableHead className="text-muted-foreground font-medium">Buyers</TableHead>
                                        <TableHead className="text-right text-muted-foreground font-medium">Last Buy</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, index) => (
                                        <TableRow key={item.mint} className="border-border hover:bg-muted/40 transition-colors">
                                            <TableCell>
                                                <span className="font-mono text-xs font-semibold text-primary">#{index + 1}</span>
                                            </TableCell>
                                            <TableCell>
                                                <TokenIdentity item={item} />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-muted-foreground" title={item.mint}>
                                                        {formatMint(item.mint)}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        title="Copy CA"
                                                        aria-label={`Copy ${item.symbol} CA`}
                                                        onClick={() => handleCopyMint(item.mint)}
                                                    >
                                                        <Copy className={copiedMint === item.mint ? "text-emerald-300" : ""} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-xs font-medium text-foreground/85">
                                                    {formatMarketCap(item.marketCap)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`font-mono text-xs font-semibold ${getPriceChangeClass(item.priceChangePct)}`}>
                                                    {formatPriceChange(item.priceChangePct)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                                    <Users className="h-3.5 w-3.5 text-primary" />
                                                    {item.buyerCount}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-[22rem] whitespace-normal">
                                                <BuyerList buyers={item.buyers} />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    {formatLastBuy(item.lastBoughtAt)}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
