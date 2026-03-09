"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ArrowUpRight, ArrowDownLeft, Zap, ExternalLink, Loader2 } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";

const POLL_INTERVAL = 5000; // 5 seconds

export function RecentActivity() {
    const [logs, setLogs] = useState<any[]>([]);
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

    useEffect(() => {
        fetchLogs();

        const interval = setInterval(fetchLogs, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchLogs]);

    const getTypeInfo = (type: string) => {
        if (type?.includes('BUY')) return { icon: <ArrowUpRight className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '🟢 BUY' };
        if (type?.includes('SELL')) return { icon: <ArrowDownLeft className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-500/10', label: '🔴 SELL' };
        return { icon: <Zap className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-500/10', label: type };
    };

    const formatAmount = (log: any) => {
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden transition-colors shadow-none">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-semibold text-foreground">Recent Signals</h2>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            <div className="p-2 min-h-[300px]">
                {logs.length === 0 && !loading ? (
                    <div className="p-12 text-center text-muted-foreground text-sm italic transition-colors">No signals detected yet</div>
                ) : (
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
                                                <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                                    <span className="text-[10px] font-bold text-indigo-400">
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
                                                        title="View on DexScreener"
                                                        className="text-sm font-bold text-foreground hover:text-indigo-400 transition-colors flex items-center gap-1 w-fit"
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
                                                    title="View TX on Solscan"
                                                    className="text-[10px] text-muted-foreground/50 hover:text-indigo-500 dark:hover:text-indigo-400 font-mono mt-0.5 flex items-center transition-colors"
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
                )}
            </div>
        </div>
    );
}
