"use client";

import React from "react";
import { Target, LogOut, Shield, Activity } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AddressSidebar } from "@/components/dashboard/address-sidebar";
import { Button } from "@/components/ui/button";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
            <aside className="w-80 border-r border-sidebar-border bg-sidebar/92 backdrop-blur-xl flex flex-col transition-colors shrink-0">
                <div className="border-b border-sidebar-border px-5 py-4 shrink-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/35 bg-primary/15 text-primary shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_20%,transparent),0_18px_40px_-24px_color-mix(in_oklab,var(--color-primary)_75%,transparent)]">
                                <Target className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/85">
                                    Internal Console
                                </div>
                                <span className="text-base font-semibold tracking-[0.02em] text-sidebar-foreground">
                                    Solana Monitor
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                            <Shield className="w-3 h-3" />
                            Secure
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-sidebar-border bg-background/35 px-3 py-2.5">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Mode</div>
                            <div className="mt-1 text-sm font-medium text-sidebar-foreground">Address Watch</div>
                        </div>
                        <div className="rounded-2xl border border-sidebar-border bg-background/35 px-3 py-2.5">
                            <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                <Activity className="w-3 h-3 text-primary/75" />
                                Focus
                            </div>
                            <div className="mt-1 text-sm font-medium text-sidebar-foreground">Signal First</div>
                        </div>
                    </div>
                </div>

                <AddressSidebar />
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden relative">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-card)_72%,transparent),transparent_22%)]" />
                <div className="pointer-events-none absolute right-0 top-0 h-[24rem] w-[24rem] rounded-full bg-primary/10 blur-[120px] translate-x-1/3 -translate-y-1/3" />

                <header className="h-16 border-b border-border/70 flex items-center justify-between gap-3 px-6 bg-background/60 backdrop-blur-xl sticky top-0 z-10 transition-colors shrink-0">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Live Operations</div>
                        <div className="mt-1 text-lg font-semibold tracking-[0.01em] text-foreground">
                            Solana monitoring and signal execution
                        </div>
                    </div>

                    <ThemeToggle />
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"
                        >
                            <Activity className="w-4 h-4 text-primary" />
                            Live feed
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleLogout}
                            className="text-muted-foreground hover:text-rose-300 hover:bg-rose-500/10"
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 lg:p-8 relative">
                    {children}
                </div>
            </main>
        </div>
    );
}
