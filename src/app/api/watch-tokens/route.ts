import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const includeInactive = searchParams.get('all') === '1';

        let query = supabase
            .from('watch_tokens')
            .select('id, mint, symbol, name, is_active, last_price, last_checked_at, created_at')
            .order('created_at', { ascending: false });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data || []);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const { mint, symbol, name } = await req.json();
        if (!mint || !String(mint).trim()) {
            return NextResponse.json({ error: 'mint is required' }, { status: 400 });
        }

        const cleanMint = String(mint).trim();
        const payload = {
            mint: cleanMint,
            symbol: symbol ? String(symbol).trim() : null,
            name: name ? String(name).trim() : null,
            is_active: true,
        };

        const { data, error } = await supabase
            .from('watch_tokens')
            .upsert(payload, { onConflict: 'mint' })
            .select('id, mint, symbol, name, is_active, last_price, last_checked_at, created_at')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const id = body?.id ? String(body.id) : '';
        if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

        const updates: Record<string, unknown> = {};
        if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
        if (body.symbol !== undefined) updates.symbol = body.symbol ? String(body.symbol).trim() : null;
        if (body.name !== undefined) updates.name = body.name ? String(body.name).trim() : null;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('watch_tokens')
            .update(updates)
            .eq('id', id)
            .select('id, mint, symbol, name, is_active, last_price, last_checked_at, created_at')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

        const { error } = await supabase
            .from('watch_tokens')
            .delete()
            .eq('id', id);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
