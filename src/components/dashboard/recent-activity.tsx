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

        // Set up realtime subscription
        const channel = supabase
            .channel('schema-db-changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
                setLogs(prev => [payload.new, ...prev].slice(0, 50));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div className="bg-[#0a0a0a] border border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800/50 bg-[#0c0c0c] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <h2 className="text-lg font-semibold text-zinc-100">Recent Signals</h2>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
            </div>

            <div className="p-2 min-h-[300px]">
                {logs.length === 0 && !loading ? (
                    <div className="p-12 text-center text-zinc-500 text-sm italic">No signals detected yet</div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="border-zinc-800/50 hover:bg-transparent">
                                <TableHead className="text-zinc-500 font-medium">Type</TableHead>
                                <TableHead className="text-zinc-500 font-medium">Address</TableHead>
                                <TableHead className="text-zinc-500 font-medium">Amount</TableHead>
                                <TableHead className="text-zinc-500 font-medium text-right">Time/TX</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => (
                                <TableRow key={log.id} className="border-zinc-800/50 hover:bg-zinc-900/40 group">
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-lg ${log.type?.includes('BUY') || log.type?.includes('SWAP') ? 'bg-indigo-500/10' : 'bg-emerald-500/10'} flex items-center justify-center`}>
                                                {log.type?.includes('BUY') || log.type?.includes('SWAP') ?
                                                    <ArrowUpRight className="w-4 h-4 text-indigo-400" /> :
                                                    <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                                                }
                                            </div>
                                            <span className="font-bold text-xs tracking-wider text-zinc-300 group-hover:text-zinc-100">{log.type}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-zinc-200">{log.address?.slice(0, 4)}...</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm font-mono text-zinc-300">{log.amount}</span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs text-zinc-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            <a
                                                href={`https://solscan.io/tx/${log.signature}`}
                                                target="_blank"
                                                className="text-[10px] text-zinc-600 hover:text-indigo-400 font-mono mt-0.5 flex items-center gap-0.5"
                                            >
                                                {log.signature.slice(0, 8)}... <ExternalLink className="w-2 h-2" />
                                            </a>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}
