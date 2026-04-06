"use client";

import React from "react";
import { Target, LogOut, Shield, Activity, PanelLeft, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AddressSidebar } from "@/components/dashboard/address-sidebar";
import { Button } from "@/components/ui/button";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = React.useState(false);

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans lg:flex lg:h-screen lg:overflow-hidden">
            {sidebarOpen && (
                <button
                    type="button"
                    aria-label="Close sidebar"
                    className="fixed inset-0 z-30 bg-background/72 backdrop-blur-sm lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-sidebar-border bg-sidebar/96 backdrop-blur-xl transition-transform duration-200 lg:static lg:z-auto lg:w-80 lg:translate-x-0 lg:shrink-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
                    }`}
                aria-label="Address monitoring sidebar"
            >
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
                        <div className="flex items-center gap-2">
                            <div className="hidden items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300 sm:flex">
                                <Shield className="w-3 h-3" />
                                Secure
                            </div>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="lg:hidden"
                                aria-label="Close sidebar"
                                onClick={() => setSidebarOpen(false)}
                            >
                                <X className="w-4 h-4" />
                            </Button>
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

            <main className="relative flex min-h-screen flex-1 flex-col overflow-hidden lg:h-screen">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-card)_72%,transparent),transparent_22%)]" />
                <div className="pointer-events-none absolute right-0 top-0 h-[24rem] w-[24rem] rounded-full bg-primary/10 blur-[120px] translate-x-1/3 -translate-y-1/3" />

                <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/72 px-4 py-3 backdrop-blur-xl transition-colors sm:px-6 lg:shrink-0">
                    <div className="flex min-w-0 items-center gap-3">
                        <Button
                            variant="outline"
                            size="icon-sm"
                            className="lg:hidden"
                            aria-label="Open sidebar"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <PanelLeft className="w-4 h-4" />
                        </Button>
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Live Operations</div>
                            <div className="mt-1 truncate text-base font-semibold tracking-[0.01em] text-foreground sm:text-lg">
                                Solana monitoring and signal execution
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <ThemeToggle />
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"
                        >
                            <a href="#recent-signals">
                                <Activity className="w-4 h-4 text-primary" />
                                Live feed
                            </a>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleLogout}
                            className="text-muted-foreground hover:text-rose-300 hover:bg-rose-500/10"
                            title="Sign out"
                            aria-label="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </header>

                <div className="relative flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
