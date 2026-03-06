"use client";

import React, { useEffect, useState } from "react";
import { Copy, Trash2, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AddressList() {
    const [addresses, setAddresses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newAddress, setNewAddress] = useState("");
    const [newLabel, setNewLabel] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    const fetchAddresses = async () => {
        try {
            const res = await fetch("/api/addresses");
            const data = await res.json();
            if (Array.isArray(data)) setAddresses(data);
        } catch (err) {
            console.error("Failed to fetch addresses:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAddresses();
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAddress) return;
        setIsAdding(true);
        try {
            const res = await fetch("/api/addresses", {
                method: "POST",
                body: JSON.stringify({ address: newAddress, label: newLabel }),
            });
            if (res.ok) {
                setNewAddress("");
                setNewLabel("");
                fetchAddresses();
            }
        } catch (err) {
            console.error("Failed to add address:", err);
        } finally {
            setIsAdding(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/addresses?id=${id}`, { method: "DELETE" });
            if (res.ok) fetchAddresses();
        } catch (err) {
            console.error("Failed to delete address:", err);
        }
    };

    return (
        <Card className="bg-card border-border rounded-2xl overflow-hidden transition-colors shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border px-6 py-4 transition-colors">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <CardTitle className="text-lg font-semibold text-foreground">Monitored Addresses</CardTitle>
                </div>
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-2 py-0.5 font-mono">
                    {addresses.length}/50
                </Badge>
            </CardHeader>
            <CardContent className="p-0">
                <form onSubmit={handleAdd} className="p-6 border-b border-border space-y-4 transition-colors">
                    <Input
                        placeholder="Solana Address (e.g. 675f...)"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        className="bg-muted/30 border-border/50 h-9 text-sm text-foreground placeholder:text-muted-foreground transition-all shadow-none"
                    />
                    <div className="flex gap-2">
                        <Input
                            placeholder="Label (Personal Wallet)"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            className="bg-muted/30 border-border/50 h-9 text-sm text-foreground placeholder:text-muted-foreground transition-all shadow-none"
                        />
                        <Button type="submit" disabled={isAdding} className="h-9 bg-indigo-600 hover:bg-indigo-700 whitespace-nowrap">
                            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Track"}
                        </Button>
                    </div>
                </form>

                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
                    ) : addresses.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm italic">No addresses tracked yet</div>
                    ) : (
                        addresses.map((item) => (
                            <div key={item.id} className="group hover:bg-muted/40 p-4 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-2 h-2 rounded-full ${item.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`}></div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-foreground">{item.label || "Unnamed"}</span>
                                                <Badge variant="secondary" className="bg-muted hover:bg-muted/80 text-[10px] text-muted-foreground font-mono py-0 px-1.5 h-auto transition-colors">
                                                    {item.address.slice(0, 4)}...{item.address.slice(-4)}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/10"
                                            onClick={() => handleDelete(item.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
