"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Target, Zap } from "lucide-react";

const POLL_INTERVAL = 5000; // 5 seconds

function StatCard({ label, value, increase, icon }: { label: string, value: string, increase: string, icon: React.ReactNode }) {
    return (
        <div className="bg-card border border-border p-6 rounded-2xl hover:bg-muted/40 transition-all group overflow-hidden relative shadow-none">
            <div className="absolute top-0 right-0 w-24 h-24 bg-muted/5 group-hover:bg-indigo-600/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-colors"></div>
            <div className="flex items-center justify-between mb-4 relative">
                <div className="p-2 rounded-xl bg-muted/50 border border-border/50 shadow-inner">
                    {icon}
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full border border-border/50">
                    Live
                </span>
            </div>
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">{label}</h3>
            <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-foreground tracking-tight">{value}</span>
                <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium mb-1.5">{increase}</span>
            </div>
        </div>
    );
}

export function DashboardStats() {
    const [stats, setStats] = useState({
        totalMonitored: 0,
        todaySignals: 0,
        increaseToday: 0
    });

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/stats');
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error("Error fetching stats:", error);
        }
    }, []);

    useEffect(() => {
        fetchStats();

        const interval = setInterval(fetchStats, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchStats]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
                label="Total Monitored"
                value={stats.totalMonitored.toString()}
                increase={stats.increaseToday > 0 ? `+${stats.increaseToday} today` : "no new today"}
                icon={<Target className="w-5 h-5 text-indigo-400" />}
            />
            <StatCard
                label="Today's Signals"
                value={stats.todaySignals.toString()}
                increase="Live Feed"
                icon={<Zap className="w-5 h-5 text-amber-400" />}
            />
        </div>
    );
}
