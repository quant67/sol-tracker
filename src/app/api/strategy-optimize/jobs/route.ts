import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isHistoricalInterval, isOptimizationStyle } from '@/lib/strategy-optimizer-jobs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const watchTokenId = searchParams.get('watch_token_id');
        const limit = Math.min(Math.max(Number(searchParams.get('limit') || '10'), 1), 30);

        let query = supabase
            .from('strategy_optimization_jobs')
            .select('id, watch_token_id, mint, history_days, interval, style, status, progress_message, provider, pool_address, pool_name, result_json, error_message, attempt_count, requested_by, created_at, started_at, finished_at, updated_at, watch_tokens(id, mint, symbol, name)')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (watchTokenId) {
            query = query.eq('watch_token_id', watchTokenId);
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
        const body = await req.json();
        const watchTokenId = body?.watch_token_id ? String(body.watch_token_id) : '';
        const historyDays = Number(body?.history_days ?? 30);
        const interval = isHistoricalInterval(body?.interval) ? body.interval : '15m';
        const style = isOptimizationStyle(body?.style) ? body.style : 'balanced';
        const requestedBy = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;

        if (!watchTokenId) {
            return NextResponse.json({ error: 'watch_token_id is required' }, { status: 400 });
        }
        if (!Number.isFinite(historyDays) || historyDays <= 0 || historyDays > 30) {
            return NextResponse.json({ error: 'history_days must be between 1 and 30' }, { status: 400 });
        }

        const { data: token, error: tokenError } = await supabase
            .from('watch_tokens')
            .select('id, mint, symbol, name')
            .eq('id', watchTokenId)
            .maybeSingle();

        if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 });
        if (!token?.id || !token?.mint) {
            return NextResponse.json({ error: 'watch token not found. Add it to watchlist first.' }, { status: 404 });
        }

        const { data: existingJobs, error: existingError } = await supabase
            .from('strategy_optimization_jobs')
            .select('id, watch_token_id, mint, history_days, interval, style, status, progress_message, provider, pool_address, pool_name, result_json, error_message, attempt_count, requested_by, created_at, started_at, finished_at, updated_at, watch_tokens(id, mint, symbol, name)')
            .eq('watch_token_id', watchTokenId)
            .eq('history_days', historyDays)
            .eq('interval', interval)
            .eq('style', style)
            .in('status', ['queued', 'running'])
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (existingJobs?.[0]) {
            return NextResponse.json(existingJobs[0]);
        }

        const { data, error } = await supabase
            .from('strategy_optimization_jobs')
            .insert({
                watch_token_id: token.id,
                mint: token.mint,
                history_days: Math.floor(historyDays),
                interval,
                style,
                status: 'queued',
                progress_message: 'Queued',
                requested_by: requestedBy,
                updated_at: new Date().toISOString(),
            })
            .select('id, watch_token_id, mint, history_days, interval, style, status, progress_message, provider, pool_address, pool_name, result_json, error_message, attempt_count, requested_by, created_at, started_at, finished_at, updated_at, watch_tokens(id, mint, symbol, name)')
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
