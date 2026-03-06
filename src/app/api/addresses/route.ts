import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
    const { address, label, person_id } = await req.json();

    if (!address) return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    if (!person_id) return NextResponse.json({ error: 'person_id is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('addresses')
        .insert([{ address, label: label || null, person_id, is_active: true }])
        .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data[0]);
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
    const body = await req.json();
    const { id, label, is_active } = body;

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const updates: Record<string, any> = {};
    if (label !== undefined) updates.label = label;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('addresses')
        .update(updates)
        .eq('id', id)
        .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data?.[0] || { success: true });
}
