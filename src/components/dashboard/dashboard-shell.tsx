"use client";

import React from "react";
import {
    LayoutDashboard,
    Target,
    History,
    Settings,
    Bell,
    Search,
    ExternalLink,
    Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen bg-[#050505] text-zinc-100 overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-64 border-r border-zinc-800/50 bg-[#0a0a0a] flex flex-col">
                <div className="p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                            <Target className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">Sol Sniper</span>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-1 py-4">
                    <NavItem icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" active />
                    <NavItem icon={<History className="w-5 h-5" />} label="Recent Activity" />
                    <NavItem icon={<Settings className="w-5 h-5" />} label="Settings" />
                </nav>

                <div className="p-4 border-t border-zinc-800/50">
                    <div className="flex items-center gap-3 px-2 py-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500"></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">Hunter Admin</p>
                            <p className="text-xs text-zinc-500 truncate">Sol Sniper V1</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Background Decorative Element */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                {/* Header */}
                <header className="h-20 border-b border-zinc-800/50 flex items-center justify-between px-8 bg-[#0a0a0a]/50 backdrop-blur-xl sticky top-0 z-10">
                    <div className="flex items-center gap-4 flex-1 max-w-xl">
                        <div className="relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <Input
                                placeholder="Search addresses, tokens..."
                                className="bg-zinc-900/50 border-zinc-800/50 pl-10 h-10 focus:ring-indigo-500/20"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="rounded-full border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800">
                            <Bell className="w-4 h-4" />
                        </Button>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-[0_0_20px_rgba(79,70,229,0.3)] gap-2 rounded-xl">
                            <Plus className="w-4 h-4" /> Add Address
                        </Button>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-8 relative">
                    {children}
                </div>
            </main>
        </div>
    );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
    return (
        <a
            href="#"
            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${active
                    ? "bg-indigo-600/10 text-indigo-400 border border-indigo-600/20 shadow-[0_0_15px_rgba(79,70,229,0.1)]"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 border border-transparent"
                }`}
        >
            <span className={`${active ? "text-indigo-400" : "group-hover:text-zinc-300"}`}>{icon}</span>
            <span className="font-medium">{label}</span>
            {active && <div className="ml-auto w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]"></div>}
        </a>
    );
}
