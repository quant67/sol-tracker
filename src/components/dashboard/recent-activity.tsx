"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Zap, ExternalLink, Loader2 } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase";

export function RecentActivity() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            const { data, error } = await supabase
                .from("logs")
                .select("*")
                .order("timestamp", { ascending: false })
                .limit(50);

            if (!error && data) setLogs(data);
            setLoading(false);
        };

        fetchLogs();

        // Set up realtime subscription for both INSERT and UPDATE
        const channel = supabase
            .channel('logs-realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
                setLogs(prev => {
                    // Dedup by signature
                    const exists = prev.some(log => log.signature === payload.new.signature);
                    if (exists) return prev;
                    return [payload.new, ...prev].slice(0, 50);
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'logs' }, (payload) => {
                setLogs(prev => prev.map(log =>
                    log.signature === payload.new.signature ? payload.new : log
                ));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

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
                                <TableHead className="text-muted-foreground font-medium">Token</TableHead>
                                <TableHead className="text-muted-foreground font-medium">Amount</TableHead>
                                <TableHead className="text-muted-foreground font-medium">SOL</TableHead>
                                <TableHead className="text-muted-foreground font-medium text-right">Time/TX</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => {
                                const typeInfo = getTypeInfo(log.type);
                                const dexName = getDexName(log.type);
                                const tokenMint = log.token_info?.mint;
                                return (
                                    <TableRow key={log.id} className="border-border hover:bg-muted/40 group transition-colors">
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 rounded-lg ${typeInfo.bg} flex items-center justify-center ${typeInfo.color}`}>
                                                    {typeInfo.icon}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`font-bold text-xs tracking-wider ${typeInfo.color}`}>{typeInfo.label}</span>
                                                    {dexName && <span className="text-[10px] text-muted-foreground">{dexName}</span>}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {tokenMint ? (
                                                <a
                                                    href={`https://birdeye.so/token/${tokenMint}`}
                                                    target="_blank"
                                                    className="text-sm font-mono text-foreground/80 hover:text-indigo-400 transition-colors"
                                                >
                                                    {tokenMint.slice(0, 4)}...{tokenMint.slice(-4)}
                                                </a>
                                            ) : (
                                                <span className="text-sm text-muted-foreground">{log.address?.slice(0, 4)}...</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm font-mono text-foreground/70">{formatAmount(log)}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm font-mono text-foreground/70">
                                                {log.amount && parseFloat(log.amount) > 0 ? `${parseFloat(log.amount).toFixed(4)}` : '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                <a
                                                    href={`https://solscan.io/tx/${log.signature}`}
                                                    target="_blank"
                                                    className="text-[10px] text-muted-foreground/60 hover:text-indigo-500 dark:hover:text-indigo-400 font-mono mt-0.5 flex items-center gap-0.5 transition-colors"
                                                >
                                                    {log.signature?.slice(0, 8)}... <ExternalLink className="w-2 h-2" />
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
