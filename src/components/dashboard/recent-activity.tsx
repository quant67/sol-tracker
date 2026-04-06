"use client";

import React, { useState, useCallback } from "react";
import { ArrowUpRight, ArrowDownLeft, Zap, ExternalLink, Loader2 } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { usePolling } from "@/hooks/use-polling";

const POLL_INTERVAL = 5000; // 5 seconds

interface ActivityLog {
    id: string;
    type: string;
    amount?: string;
    timestamp: string;
    signature: string;
    token_info?: {
        amount?: string;
        mint?: string;
        symbol?: string;
        name?: string;
        personName?: string;
        marketCap?: number;
    } | null;
}

export function RecentActivity() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/logs');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setLogs(data);
            }
        } catch (error) {
            console.error("Error fetching logs:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    usePolling(fetchLogs, { intervalMs: POLL_INTERVAL });

    const getTypeInfo = (type: string) => {
        if (type?.includes('BUY')) return { icon: <ArrowUpRight className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'BUY' };
        if (type?.includes('SELL')) return { icon: <ArrowDownLeft className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-500/10', label: 'SELL' };
        return { icon: <Zap className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-500/10', label: type };
    };

    const formatAmount = (log: ActivityLog) => {
        const tokenInfo = log.token_info;
        if (tokenInfo && tokenInfo.amount) {
            const amount = parseFloat(tokenInfo.amount);
            if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
            if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
            return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
        }
        return log.amount ? `${parseFloat(log.amount).toFixed(4)} SOL` : '-';
    };

    const getDexName = (type: string) => {
        const match = type?.match(/\(([^)]+)\)/);
        return match ? match[1] : '';
    };

    return (
        <section id="recent-signals" className="overflow-hidden rounded-[1.9rem] border border-border/70 bg-card/86 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_24px_80px_-46px_rgba(0,0,0,0.95)] transition-colors">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_94%,transparent),color-mix(in_oklab,var(--color-primary)_7%,transparent))] px-6 py-5">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Live Feed</div>
                    <div className="mt-2 flex items-center gap-3">
                        <Zap className="h-5 w-5 text-primary" />
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Recent Signals</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Scan the most recent wallet actions and judge whether the flow deserves follow-up.
                    </p>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            <div className="min-h-[300px] p-4">
                {logs.length === 0 && !loading ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center text-sm italic text-muted-foreground transition-colors">
                        No signals detected yet
                    </div>
                ) : (
                    <>
                    <div className="space-y-3 md:hidden">
                        {logs.map((log) => {
                            const typeInfo = getTypeInfo(log.type);
                            const dexName = getDexName(log.type);
                            const tokenInfo = log.token_info || {};
                            const tokenMint = tokenInfo.mint;
                            const symbol = tokenInfo.symbol || (tokenMint ? `${tokenMint.slice(0, 4)}...` : 'Unknown');
                            const traderName = tokenInfo.personName || 'Unknown';
                            const marketCap = tokenInfo.marketCap;
                            const mCapStr = !marketCap ? null : marketCap >= 1_000_000 ? `$${(marketCap / 1_000_000).toFixed(1)}M` : marketCap >= 1_000 ? `$${(marketCap / 1_000).toFixed(1)}K` : `$${marketCap.toFixed(0)}`;

                            return (
                                <article key={log.id} className="rounded-[1.35rem] border border-border/70 bg-background/25 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${typeInfo.bg} ${typeInfo.color}`}>
                                                {typeInfo.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${typeInfo.color}`}>{typeInfo.label}</div>
                                                <div className="mt-1 text-sm font-semibold text-foreground truncate">{traderName}</div>
                                                {dexName && <div className="text-[10px] text-muted-foreground truncate">{dexName}</div>}
                                            </div>
                                        </div>
                                        <div className="text-right text-[11px] text-muted-foreground shrink-0">
                                            {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                        <div className="min-w-0">
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Token</div>
                                            {tokenMint ? (
                                                <a
                                                    href={`https://dexscreener.com/solana/${tokenMint}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title="View on DexScreener"
                                                    className="mt-1 flex w-fit items-center gap-1 font-semibold text-foreground hover:text-primary"
                                                >
                                                    {symbol}
                                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                                </a>
                                            ) : (
                                                <div className="mt-1 font-semibold text-foreground">{symbol}</div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Amount</div>
                                            <div className="mt-1 font-mono text-foreground">{formatAmount(log)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Cost</div>
                                            <div className="mt-1 font-mono text-foreground/85">
                                                {log.amount && parseFloat(log.amount) > 0 ? `${parseFloat(log.amount).toFixed(3)} SOL` : '-'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Market Cap</div>
                                            <div className="mt-1 font-mono text-foreground/85">{mCapStr || "-"}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <a
                                            href={`https://solscan.io/tx/${log.signature}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            title="View TX on Solscan"
                                            className="text-[11px] font-mono text-muted-foreground hover:text-primary"
                                        >
                                            View transaction
                                        </a>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                                <TableHead className="text-muted-foreground font-medium">Type</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Trader</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Token</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Amount</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Cost / MCap</TableHead>
                                <TableHead className="text-muted-foreground font-medium text-right">Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => {
                                const typeInfo = getTypeInfo(log.type);
                                const dexName = getDexName(log.type);
                                const tokenInfo = log.token_info || {};
                                const tokenMint = tokenInfo.mint;

                                // New fields from DB or Fallback
                                const symbol = tokenInfo.symbol || (tokenMint ? `${tokenMint.slice(0, 4)}...` : 'Unknown');
                                const traderName = tokenInfo.personName || 'Unknown';

                                // Format Market Cap
                                const formatMCap = (mc: number | undefined) => {
                                    if (!mc) return null;
                                    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
                                    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
                                    return `$${mc.toFixed(0)}`;
                                };
                                const mCapStr = formatMCap(tokenInfo.marketCap);

                                return (
                                    <TableRow key={log.id} className="border-border hover:bg-muted/40 group transition-colors">
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className={`shrink-0 w-8 h-8 rounded-lg ${typeInfo.bg} flex items-center justify-center ${typeInfo.color}`}>
                                                    {typeInfo.icon}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`font-bold text-[11px] leading-tight tracking-wider ${typeInfo.color}`}>{typeInfo.label}</span>
                                                    {dexName && <span className="text-[9px] leading-tight text-muted-foreground truncate max-w-[60px]">{dexName}</span>}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                                                    <span className="text-[10px] font-bold text-primary">
                                                        {traderName.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <span className="text-xs font-medium text-foreground/90">{traderName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                {tokenMint ? (
                                                    <a
                                                        href={`https://dexscreener.com/solana/${tokenMint}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title="View on DexScreener"
                                                        className="flex w-fit items-center gap-1 text-sm font-bold text-foreground transition-colors hover:text-primary"
                                                    >
                                                        {symbol}
                                                        <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                                                    </a>
                                                ) : (
                                                    <span className="text-sm font-bold text-foreground">{symbol}</span>
                                                )}
                                                {tokenInfo.name && tokenInfo.name !== symbol && (
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                                        {tokenInfo.name}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs font-mono font-medium text-foreground/80">{formatAmount(log)}</span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-mono font-medium text-foreground/80">
                                                    {log.amount && parseFloat(log.amount) > 0 ? `${parseFloat(log.amount).toFixed(3)} SOL` : '-'}
                                                </span>
                                                {mCapStr && (
                                                    <span className="text-[10px] font-mono text-muted-foreground">
                                                        MC: {mCapStr}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-medium text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                <a
                                                    href={`https://solscan.io/tx/${log.signature}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title="View TX on Solscan"
                                                    className="mt-0.5 flex items-center font-mono text-[10px] text-muted-foreground/60 transition-colors hover:text-primary"
                                                >
                                                    TX ↗
                                                </a>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    </div>
                    </>
                )}
            </div>
        </section>
    );
}
