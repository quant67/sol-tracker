import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncHeliusWebhook } from '@/lib/helius-sync';

// GET: List all people with their addresses
export async function GET() {
    const { data: people, error: peopleError } = await supabase
        .from('people')
        .select('*')
        .order('created_at', { ascending: true });

    if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 500 });

    // Fetch addresses grouped by person
    const { data: addresses, error: addrError } = await supabase
        .from('addresses')
        .select('*')
        .order('created_at', { ascending: true });

    if (addrError) return NextResponse.json({ error: addrError.message }, { status: 500 });

    // Merge: attach addresses array to each person
    const result = (people || []).map(person => ({
        ...person,
        addresses: (addresses || []).filter(a => a.person_id === person.id),
    }));

    return NextResponse.json(result);
}

// POST: Create a new person
export async function POST(req: NextRequest) {
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('people')
        .insert([{ name: name.trim() }])
        .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data[0]);
}

// PATCH: Rename a person
export async function PATCH(req: NextRequest) {
    const { id, name } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('people')
        .update({ name: name.trim() })
        .eq('id', id)
        .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data?.[0] || { success: true });
}

// DELETE: Delete a person (cascades to their addresses)
export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const { error } = await supabase
        .from('people')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync to Helius (addresses were cascade-deleted)
    syncHeliusWebhook().catch(console.error);

    return NextResponse.json({ success: true });
}
