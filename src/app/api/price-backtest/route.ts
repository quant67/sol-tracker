import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { normalizeStrategy } from '@/lib/strategy-engine';
import { runEntryLongBacktest } from '@/lib/backtest-engine';

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] || null;
    return value;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const strategyId = body?.strategy_id ? String(body.strategy_id) : '';
        const lookaheadMin = Number(body?.lookahead_min ?? 120);
        const historyDays = Number(body?.history_days ?? 30);

        if (!strategyId) {
            return NextResponse.json({ error: 'strategy_id is required' }, { status: 400 });
        }
        if (!Number.isFinite(lookaheadMin) || lookaheadMin <= 0) {
            return NextResponse.json({ error: 'lookahead_min must be a positive number' }, { status: 400 });
        }
        if (!Number.isFinite(historyDays) || historyDays <= 0) {
            return NextResponse.json({ error: 'history_days must be a positive number' }, { status: 400 });
        }

        const { data: rawStrategy, error: strategyError } = await supabase
            .from('price_strategies')
            .select('id, watch_token_id, name, type, params, cooldown_sec, chat_id, watch_tokens(mint, symbol)')
            .eq('id', strategyId)
            .maybeSingle();

        if (strategyError) {
            return NextResponse.json({ error: strategyError.message }, { status: 500 });
        }
        if (!rawStrategy) {
            return NextResponse.json({ error: 'strategy not found' }, { status: 404 });
        }

        const strategy = normalizeStrategy(rawStrategy);
        if (!strategy) {
            return NextResponse.json({ error: 'invalid strategy config' }, { status: 400 });
        }
        if (strategy.type !== 'entry_long') {
            return NextResponse.json({ error: 'backtest currently supports entry_long only' }, { status: 400 });
        }

        const token = extractRelation<{ mint?: string; symbol?: string }>(rawStrategy.watch_tokens);
        const tokenMint = token?.mint || '';
        if (!tokenMint) {
            return NextResponse.json({ error: 'strategy is missing token relation' }, { status: 400 });
        }

        const cutoff = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString();
        const { data: snapshots, error: snapshotError } = await supabase
            .from('price_snapshots')
            .select('price, captured_at')
            .eq('watch_token_id', strategy.watchTokenId)
            .gte('captured_at', cutoff)
            .order('captured_at', { ascending: true })
            .limit(5000);

        if (snapshotError) {
            return NextResponse.json({ error: snapshotError.message }, { status: 500 });
        }

        const series = (snapshots || []).map((row: any) => ({
            price: Number(row.price),
            capturedAtMs: new Date(row.captured_at).getTime(),
        }));

        const summary = runEntryLongBacktest(
            {
                ...strategy,
                params: {
                    ...strategy.params,
                },
            },
            tokenMint,
            series,
            lookaheadMin
        );

        return NextResponse.json({
            strategy: {
                id: strategy.id,
                name: strategy.name,
                type: strategy.type,
                params: strategy.params,
                cooldownSec: strategy.cooldownSec,
                tokenMint,
                tokenSymbol: token?.symbol || null,
            },
            summary,
        });
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
