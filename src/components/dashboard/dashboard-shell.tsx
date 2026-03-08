"use client";

import React from "react";
import { Target, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AddressSidebar } from "@/components/dashboard/address-sidebar";
import { Button } from "@/components/ui/button";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
    };

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
            {/* Left Sidebar — Address Management */}
            <aside className="w-72 border-r border-border bg-card flex flex-col transition-colors shrink-0">
                {/* Logo + Add Person */}
                <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(79,70,229,0.3)] dark:shadow-[0_0_12px_rgba(79,70,229,0.4)]">
                            <Target className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-base font-bold tracking-tight">Sol Sniper</span>
                    </div>
                </div>

                {/* Address Manager fills the rest */}
                <AddressSidebar />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Background Decorative */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/[0.02] dark:bg-indigo-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                {/* Top Bar */}
                <header className="h-14 border-b border-border flex items-center justify-end gap-2 px-6 bg-card/50 backdrop-blur-xl sticky top-0 z-10 transition-colors shrink-0">
                    <ThemeToggle />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogout}
                        className="text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                        title="Sign out"
                    >
                        <LogOut className="w-4 h-4" />
                    </Button>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 relative">
                    {children}
                </div>
            </main>
        </div>
    );
}
