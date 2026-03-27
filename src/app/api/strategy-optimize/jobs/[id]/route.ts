import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('strategy_optimization_jobs')
            .select('id, watch_token_id, mint, history_days, interval, style, status, progress_message, provider, pool_address, pool_name, result_json, error_message, attempt_count, requested_by, created_at, started_at, finished_at, updated_at, watch_tokens(id, mint, symbol, name)')
            .eq('id', id)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: 'job not found' }, { status: 404 });
        return NextResponse.json(data);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
