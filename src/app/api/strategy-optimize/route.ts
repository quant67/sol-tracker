import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getHistoricalPriceSeries, type HistoricalInterval } from '@/lib/historical-price-provider';
import { optimizeSwingStrategies, type OptimizationStyle } from '@/lib/strategy-optimizer';

function isHistoricalInterval(value: unknown): value is HistoricalInterval {
    return value === '5m' || value === '15m' || value === '1h';
}

function isOptimizationStyle(value: unknown): value is OptimizationStyle {
    return value === 'conservative' || value === 'balanced' || value === 'aggressive';
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const watchTokenId = body?.watch_token_id ? String(body.watch_token_id) : '';
        const mintFromBody = body?.mint ? String(body.mint).trim() : '';
        const historyDays = Number(body?.history_days ?? 30);
        const interval = isHistoricalInterval(body?.interval) ? body.interval : '15m';
        const style = isOptimizationStyle(body?.style) ? body.style : 'balanced';

        if (!watchTokenId && !mintFromBody) {
            return NextResponse.json({ error: 'watch_token_id or mint is required' }, { status: 400 });
        }
        if (!Number.isFinite(historyDays) || historyDays <= 0 || historyDays > 30) {
            return NextResponse.json({ error: 'history_days must be between 1 and 30' }, { status: 400 });
        }

        let token = null as { id: string; mint: string; symbol?: string | null; name?: string | null } | null;

        if (watchTokenId) {
            const { data, error } = await supabase
                .from('watch_tokens')
                .select('id, mint, symbol, name')
                .eq('id', watchTokenId)
                .maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            token = data;
        } else {
            const { data, error } = await supabase
                .from('watch_tokens')
                .select('id, mint, symbol, name')
                .eq('mint', mintFromBody)
                .maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            token = data;
        }

        if (!token?.mint || !token?.id) {
            return NextResponse.json({ error: 'watch token not found. Add it to watchlist first.' }, { status: 404 });
        }

        const series = await getHistoricalPriceSeries(token.mint, historyDays, interval);
        const result = optimizeSwingStrategies({
            mint: token.mint,
            watchTokenId: token.id,
            historyDays,
            interval,
            style,
            series,
        });

        return NextResponse.json({
            token: {
                id: token.id,
                mint: token.mint,
                symbol: token.symbol || result.tokenSymbol || null,
                name: token.name || result.tokenName || null,
            },
            optimization: result,
        });
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
