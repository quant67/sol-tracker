"use client";

import React, { useState, useCallback } from "react";
import { Target, Zap, RadioTower, TrendingUp } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";

const POLL_INTERVAL = 5000; // 5 seconds

function StatCard({
    label,
    value,
    increase,
    icon,
}: { label: string, value: string, increase: string, icon: React.ReactNode }) {
    return (
        <div className="group relative overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/82 p-5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_18px_60px_-34px_rgba(0,0,0,0.8)] transition-all hover:border-primary/30 hover:bg-card">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-primary)_8%,transparent),transparent_40%)] opacity-70" />
            <div className="pointer-events-none absolute -right-10 top-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl transition-opacity group-hover:opacity-100" />

            <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/12 text-primary">
                        {icon}
                    </div>
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {label}
                        </div>
                        <div className="mt-3 flex items-end gap-2">
                            <span className="text-3xl font-semibold tracking-[-0.03em] text-foreground">{value}</span>
                            <span className="mb-1 text-xs font-medium text-primary/90">{increase}</span>
                        </div>
                    </div>
                </div>

                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    Live
                </div>
            </div>

            <div className="relative mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <RadioTower className="w-3.5 h-3.5 text-primary/80" />
                Refreshing automatically with the active monitoring loop.
            </div>
        </div>
    );
}

function InsightCard() {
    return (
        <div className="rounded-[1.6rem] border border-border/70 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-card)_88%,transparent),color-mix(in_oklab,var(--color-primary)_10%,transparent))] p-5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/85">
                <TrendingUp className="w-3.5 h-3.5" />
                Operator focus
            </div>
            <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-foreground">
                Prioritize fast scans over dense form-heavy workflows.
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Surface critical movement, reduce visual noise, and keep execution controls close to the data that justifies them.
            </p>
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

    usePolling(fetchStats, { intervalMs: POLL_INTERVAL });

    return (
        <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                        Control Center
                    </div>
                    <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                        Track addresses, catch signals, move fast.
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                        A dark-first monitoring console for spotting meaningful wallet activity and validating follow-up strategy decisions without losing context.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.15fr]">
                <StatCard
                    label="Total Monitored"
                    value={stats.totalMonitored.toString()}
                    increase={stats.increaseToday > 0 ? `+${stats.increaseToday} today` : "flat today"}
                    icon={<Target className="w-5 h-5" />}
                />
                <StatCard
                    label="Today's Signals"
                    value={stats.todaySignals.toString()}
                    increase="live feed"
                    icon={<Zap className="w-5 h-5" />}
                />
                <InsightCard />
            </div>
        </section>
    );
}
