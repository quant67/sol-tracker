import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] || null;
    return value;
}

interface RawAlertRow {
    id: string;
    strategy_id: string;
    watch_token_id: string;
    mint: string;
    triggered_at: string;
    snapshot: Record<string, unknown> | null;
    price_strategies: { name?: string; type?: string } | { name?: string; type?: string }[] | null;
    watch_tokens: { symbol?: string; name?: string } | { symbol?: string; name?: string }[] | null;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = Number(searchParams.get('limit') || '100');
        const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 500) : 100;

        const { data, error } = await supabase
            .from('price_alert_events')
            .select('id, strategy_id, watch_token_id, mint, triggered_at, snapshot, price_strategies(name, type), watch_tokens(symbol, name)')
            .order('triggered_at', { ascending: false })
            .limit(safeLimit);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const rows = (data || []) as RawAlertRow[];

        const shaped = rows.map((row) => {
            const strategy = extractRelation<{ name?: string; type?: string }>(row.price_strategies);
            const token = extractRelation<{ symbol?: string; name?: string }>(row.watch_tokens);
            return {
                id: row.id,
                strategy_id: row.strategy_id,
                watch_token_id: row.watch_token_id,
                mint: row.mint,
                triggered_at: row.triggered_at,
                snapshot: row.snapshot || {},
                strategy_name: strategy?.name || null,
                strategy_type: strategy?.type || null,
                token_symbol: token?.symbol || null,
                token_name: token?.name || null,
            };
        });

        return NextResponse.json(shaped);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
