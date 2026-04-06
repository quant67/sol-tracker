"use client";

import React, { useState } from "react";
import { Target, Loader2, Lock, ShieldCheck } from "lucide-react";

export default function LoginPage() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                window.location.href = "/";
            } else {
                const data = await res.json();
                setError(data.error || "Login failed");
            }
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
            <div className="pointer-events-none absolute left-[10%] top-[14%] h-[32rem] w-[32rem] rounded-full bg-primary/14 blur-[160px]" />
            <div className="pointer-events-none absolute bottom-[12%] right-[10%] h-[24rem] w-[24rem] rounded-full bg-cyan-400/10 blur-[150px]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.22))]" />

            <div className="relative w-full max-w-md">
                <div className="rounded-[2rem] border border-border/70 bg-card/88 p-8 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-foreground)_4%,transparent),0_30px_100px_-42px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
                    <div className="mb-8 flex flex-col items-start">
                        <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-primary/30 bg-primary/14 text-primary shadow-[0_18px_50px_-26px_color-mix(in_oklab,var(--color-primary)_85%,transparent)]">
                            <Target className="w-6 h-6" />
                        </div>
                        <div className="mt-5 flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Internal access
                        </div>
                        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-foreground">Solana Monitor</h1>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Sign in to the monitoring console and resume address surveillance, live signals, and strategy workflows.
                        </p>
                        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                            Trusted, calm, and fast
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Access key
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your internal password"
                                    autoFocus
                                    className="h-12 w-full rounded-2xl border border-input/90 bg-input/70 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/85 outline-none transition-[border-color,box-shadow,background-color] focus:border-ring focus:bg-card focus:ring-4 focus:ring-ring/20"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/45 bg-primary/92 text-sm font-semibold text-primary-foreground shadow-[0_20px_40px_-24px_color-mix(in_oklab,var(--color-primary)_88%,transparent)] transition-[background-color,transform,opacity] hover:-translate-y-px hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                "Enter Console"
                            )}
                        </button>

                        <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3 text-xs leading-5 text-muted-foreground">
                            This interface is optimized for dark-mode monitoring. Keep contrast high and distractions low while reacting to live wallet activity.
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
