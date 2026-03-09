"use client";

import React, { useEffect, useState } from "react";
import {
    Trash2, Loader2, Pencil, Check, X,
    Eye, EyeOff, ChevronDown, ChevronRight, UserPlus, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Address {
    id: string;
    address: string;
    label: string | null;
    is_active: boolean;
    person_id: string;
}

interface Person {
    id: string;
    name: string;
    addresses: Address[];
}

export function AddressSidebar() {
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);

    // Expand/collapse state
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Add person form
    const [showAddPerson, setShowAddPerson] = useState(false);
    const [newPersonName, setNewPersonName] = useState("");
    const [isAddingPerson, setIsAddingPerson] = useState(false);

    // Edit person name
    const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
    const [editPersonName, setEditPersonName] = useState("");

    // Add address form (per person)
    const [addingAddrForPerson, setAddingAddrForPerson] = useState<string | null>(null);
    const [newAddr, setNewAddr] = useState("");
    const [newAddrLabel, setNewAddrLabel] = useState("");
    const [isAddingAddr, setIsAddingAddr] = useState(false);

    // Edit address label
    const [editingAddrId, setEditingAddrId] = useState<string | null>(null);
    const [editAddrLabel, setEditAddrLabel] = useState("");

    const fetchPeople = async () => {
        try {
            const res = await fetch("/api/people");
            const data = await res.json();
            if (Array.isArray(data)) setPeople(data);
        } catch (err) {
            console.error("Failed to fetch people:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPeople(); }, []);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    // ===== Person CRUD =====
    const handleAddPerson = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPersonName.trim()) return;
        setIsAddingPerson(true);
        try {
            const res = await fetch("/api/people", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newPersonName.trim() }),
            });
            if (res.ok) {
                const person = await res.json();
                setNewPersonName("");
                setShowAddPerson(false);
                setExpandedIds(prev => new Set(prev).add(person.id));
                fetchPeople();
            }
        } catch (err) { console.error(err); }
        finally { setIsAddingPerson(false); }
    };

    const handleEditPersonSave = async (id: string) => {
        if (!editPersonName.trim()) return;
        try {
            await fetch("/api/people", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, name: editPersonName.trim() }),
            });
            setEditingPersonId(null);
            fetchPeople();
        } catch (err) { console.error(err); }
    };

    const handleDeletePerson = async (id: string) => {
        try {
            await fetch(`/api/people?id=${id}`, { method: "DELETE" });
            fetchPeople();
        } catch (err) { console.error(err); }
    };

    // ===== Address CRUD =====
    const handleAddAddr = async (e: React.FormEvent, personId: string) => {
        e.preventDefault();
        if (!newAddr.trim()) return;
        setIsAddingAddr(true);
        try {
            const res = await fetch("/api/addresses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    address: newAddr.trim(),
                    label: newAddrLabel.trim() || null,
                    person_id: personId,
                }),
            });
            if (res.ok) {
                setNewAddr("");
                setNewAddrLabel("");
                setAddingAddrForPerson(null);
                fetchPeople();
            }
        } catch (err) { console.error(err); }
        finally { setIsAddingAddr(false); }
    };

    const handleToggleAddr = async (addr: Address) => {
        try {
            await fetch("/api/addresses", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: addr.id, is_active: !addr.is_active }),
            });
            fetchPeople();
        } catch (err) { console.error(err); }
    };

    const handleDeleteAddr = async (id: string) => {
        try {
            await fetch(`/api/addresses?id=${id}`, { method: "DELETE" });
            fetchPeople();
        } catch (err) { console.error(err); }
    };

    const handleEditAddrSave = async (id: string) => {
        try {
            await fetch("/api/addresses", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, label: editAddrLabel }),
            });
            setEditingAddrId(null);
            fetchPeople();
        } catch (err) { console.error(err); }
    };

    const totalActive = people.reduce((sum, p) => sum + p.addresses.filter(a => a.is_active).length, 0);
    const totalAddrs = people.reduce((sum, p) => sum + p.addresses.length, 0);

    return (
        <div className="flex flex-col h-full">
            {/* Sub-header: count + add person */}
            <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Monitors · {totalActive}/{totalAddrs}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10"
                    onClick={() => setShowAddPerson(!showAddPerson)}
                    title="Add person"
                >
                    {showAddPerson ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                </Button>
            </div>

            {/* Add Person Form */}
            {showAddPerson && (
                <form onSubmit={handleAddPerson} className="p-3 border-b border-border bg-muted/20 flex gap-2">
                    <Input
                        placeholder="Person name..."
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        className="bg-background border-border/50 h-8 text-xs shadow-none"
                        autoFocus
                    />
                    <Button type="submit" disabled={isAddingPerson} size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-xs px-3 shrink-0">
                        {isAddingPerson ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                    </Button>
                </form>
            )}

            {/* People List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : people.length === 0 ? (
                    <div className="p-6 text-center">
                        <p className="text-sm text-muted-foreground italic mb-3">No one tracked yet</p>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAddPerson(true)}>
                            <UserPlus className="w-3 h-3 mr-1" /> Add first person
                        </Button>
                    </div>
                ) : (
                    people.map(person => {
                        const isExpanded = expandedIds.has(person.id);
                        const activeCount = person.addresses.filter(a => a.is_active).length;

                        return (
                            <div key={person.id} className="border-b border-border/40">
                                {/* Person Row */}
                                <div className="group flex items-center gap-1 px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
                                    onClick={() => toggleExpand(person.id)}>
                                    <span className="text-muted-foreground">
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </span>

                                    {editingPersonId === person.id ? (
                                        <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                                            <Input
                                                value={editPersonName}
                                                onChange={e => setEditPersonName(e.target.value)}
                                                className="h-6 text-xs bg-background border-border/50 shadow-none"
                                                autoFocus
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleEditPersonSave(person.id);
                                                    if (e.key === 'Escape') setEditingPersonId(null);
                                                }}
                                            />
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-500"
                                                onClick={() => handleEditPersonSave(person.id)}>
                                                <Check className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium text-foreground truncate flex-1">{person.name}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono mr-1">{activeCount}/{person.addresses.length}</span>
                                            <div className="flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                    onClick={() => { setEditingPersonId(person.id); setEditPersonName(person.name); }}>
                                                    <Pencil className="w-3 h-3" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-rose-400"
                                                    onClick={() => handleDeletePerson(person.id)}>
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Expanded: Addresses */}
                                {isExpanded && (
                                    <div className="bg-muted/10">
                                        {person.addresses.map(addr => (
                                            <div key={addr.id} className={`group/addr flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-muted/30 transition-colors ${!addr.is_active ? 'opacity-40' : ''}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${addr.is_active ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]' : 'bg-zinc-500'}`}></div>

                                                {editingAddrId === addr.id ? (
                                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                                        <Input value={editAddrLabel} onChange={e => setEditAddrLabel(e.target.value)}
                                                            className="h-5 text-[11px] bg-background border-border/50 shadow-none" autoFocus
                                                            onKeyDown={e => { if (e.key === 'Enter') handleEditAddrSave(addr.id); if (e.key === 'Escape') setEditingAddrId(null); }} />
                                                        <Button variant="ghost" size="icon" className="h-5 w-5 text-emerald-500"
                                                            onClick={() => handleEditAddrSave(addr.id)}><Check className="w-2.5 h-2.5" /></Button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex-1 min-w-0">
                                                            {addr.label && <span className="text-[11px] text-foreground/70 block truncate">{addr.label}</span>}
                                                            <span className="text-[10px] font-mono text-muted-foreground">{addr.address.slice(0, 4)}...{addr.address.slice(-4)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-0 opacity-0 group-hover/addr:opacity-100 transition-opacity shrink-0">
                                                            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                                                onClick={() => { setEditingAddrId(addr.id); setEditAddrLabel(addr.label || ""); }}>
                                                                <Pencil className="w-2.5 h-2.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-amber-400"
                                                                onClick={() => handleToggleAddr(addr)} title={addr.is_active ? "Pause" : "Resume"}>
                                                                {addr.is_active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-rose-400"
                                                                onClick={() => handleDeleteAddr(addr.id)}>
                                                                <Trash2 className="w-2.5 h-2.5" />
                                                            </Button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}

                                        {/* Add Address Form (inline) */}
                                        {addingAddrForPerson === person.id ? (
                                            <form onSubmit={(e) => handleAddAddr(e, person.id)} className="pl-8 pr-3 py-2 space-y-1.5">
                                                <Input placeholder="Solana address..." value={newAddr} onChange={e => setNewAddr(e.target.value)}
                                                    className="bg-background border-border/50 h-7 text-[11px] shadow-none" autoFocus />
                                                <div className="flex gap-1.5">
                                                    <Input placeholder="Note (optional)" value={newAddrLabel} onChange={e => setNewAddrLabel(e.target.value)}
                                                        className="bg-background border-border/50 h-7 text-[11px] shadow-none" />
                                                    <Button type="submit" disabled={isAddingAddr} size="sm" className="h-7 bg-indigo-600 hover:bg-indigo-700 text-[11px] px-2.5">
                                                        {isAddingAddr ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] px-2"
                                                        onClick={() => { setAddingAddrForPerson(null); setNewAddr(""); setNewAddrLabel(""); }}>
                                                        <X className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </form>
                                        ) : (
                                            <button
                                                className="w-full pl-8 pr-3 py-2 text-[11px] text-muted-foreground hover:text-indigo-400 hover:bg-muted/30 transition-colors flex items-center gap-1.5"
                                                onClick={() => { setAddingAddrForPerson(person.id); setNewAddr(""); setNewAddrLabel(""); }}
                                            >
                                                <Wallet className="w-3 h-3" /> Add address
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
