import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseStrategyType } from '@/lib/strategy-engine';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const includeInactive = searchParams.get('all') === '1';
        const watchTokenId = searchParams.get('watchTokenId');

        let query = supabase
            .from('price_strategies')
            .select('id, watch_token_id, name, type, params, cooldown_sec, is_active, chat_id, created_at, updated_at, watch_tokens(mint, symbol)')
            .order('created_at', { ascending: false });

        if (!includeInactive) query = query.eq('is_active', true);
        if (watchTokenId) query = query.eq('watch_token_id', watchTokenId);

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
        const type = parseStrategyType(body?.type);
        const name = body?.name ? String(body.name).trim() : '';
        const cooldown = Number(body?.cooldown_sec ?? 300);
        const chatId = body?.chat_id ? String(body.chat_id).trim() : null;
        const params = body?.params && typeof body.params === 'object' ? body.params : {};

        if (!watchTokenId) return NextResponse.json({ error: 'watch_token_id is required' }, { status: 400 });
        if (!type) return NextResponse.json({ error: 'invalid strategy type' }, { status: 400 });
        if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
        if (!Number.isFinite(cooldown) || cooldown <= 0) {
            return NextResponse.json({ error: 'cooldown_sec must be a positive number' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('price_strategies')
            .insert({
                watch_token_id: watchTokenId,
                name,
                type,
                params,
                cooldown_sec: Math.floor(cooldown),
                is_active: true,
                chat_id: chatId,
                updated_at: new Date().toISOString(),
            })
            .select('id, watch_token_id, name, type, params, cooldown_sec, is_active, chat_id, created_at, updated_at, watch_tokens(mint, symbol)')
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

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.name !== undefined) {
            const n = String(body.name).trim();
            if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
            updates.name = n;
        }

        if (body.is_active !== undefined) {
            updates.is_active = Boolean(body.is_active);
        }

        if (body.cooldown_sec !== undefined) {
            const cooldown = Number(body.cooldown_sec);
            if (!Number.isFinite(cooldown) || cooldown <= 0) {
                return NextResponse.json({ error: 'cooldown_sec must be a positive number' }, { status: 400 });
            }
            updates.cooldown_sec = Math.floor(cooldown);
        }

        if (body.params !== undefined) {
            if (!body.params || typeof body.params !== 'object') {
                return NextResponse.json({ error: 'params must be an object' }, { status: 400 });
            }
            updates.params = body.params;
        }

        if (body.chat_id !== undefined) {
            updates.chat_id = body.chat_id ? String(body.chat_id).trim() : null;
        }

        if (Object.keys(updates).length === 1) {
            return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('price_strategies')
            .update(updates)
            .eq('id', id)
            .select('id, watch_token_id, name, type, params, cooldown_sec, is_active, chat_id, created_at, updated_at, watch_tokens(mint, symbol)')
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
            .from('price_strategies')
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
