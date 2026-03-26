import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { parseStrategyType, type StrategyType } from '../src/lib/strategy-engine';

// Load environment variables from .env manually to ensure override
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '.env'),
];

let envLoaded = false;
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        console.log(`Loading env from: ${p}`);
        const envConfig = dotenv.parse(fs.readFileSync(p));
        for (const k in envConfig) {
            process.env[k] = envConfig[k];
        }
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.warn('⚠️ No .env file found in expected paths.');
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.error('Missing TELEGRAM_BOT_TOKEN.');
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error(`Missing Supabase credentials. URL exists: ${!!supabaseUrl}, Key exists: ${!!supabaseKey}`);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(botToken);

function parseNumberValue(input: string): number {
    const valueStr = input.toLowerCase();
    if (valueStr.endsWith('k')) return parseFloat(valueStr) * 1000;
    if (valueStr.endsWith('m')) return parseFloat(valueStr) * 1000000;
    if (valueStr.endsWith('b')) return parseFloat(valueStr) * 1000000000;
    return parseFloat(valueStr);
}

function parsePositiveNumber(input: string): number | null {
    const value = parseFloat(input);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

async function ensureWatchToken(mintRaw: string): Promise<{ id: string; mint: string } | null> {
    const mint = mintRaw.trim();
    if (!mint) return null;

    const { data: existing, error: existingError } = await supabase
        .from('watch_tokens')
        .select('id, mint, is_active')
        .eq('mint', mint)
        .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
        if (!existing.is_active) {
            const { error: activateError } = await supabase
                .from('watch_tokens')
                .update({ is_active: true })
                .eq('id', existing.id);
            if (activateError) throw activateError;
        }
        return { id: existing.id, mint: existing.mint };
    }

    const { data: inserted, error: insertError } = await supabase
        .from('watch_tokens')
        .insert({ mint, is_active: true })
        .select('id, mint')
        .single();

    if (insertError) throw insertError;
    if (!inserted) return null;
    return { id: inserted.id, mint: inserted.mint };
}

function strategyUsageText(): string {
    return [
        '⚠️ Usage:',
        '/strategyadd <mint> pct_change_up <windowMin> <thresholdPct> [cooldownSec]',
        '/strategyadd <mint> pct_change_down <windowMin> <thresholdPct> [cooldownSec]',
        '/strategyadd <mint> breakout_up <targetPrice> [cooldownSec]',
        '/strategyadd <mint> breakout_down <targetPrice> [cooldownSec]',
        '',
        'Examples:',
        '/strategyadd 7vfCXT... pct_change_up 5 10 300',
        '/strategyadd 7vfCXT... breakout_down 0.00025 600',
    ].join('\n');
}

function buildStrategyPayload(
    strategyType: StrategyType,
    parts: string[]
): { params: Record<string, number>; cooldownSec: number } | null {
    if (strategyType === 'pct_change_up' || strategyType === 'pct_change_down') {
        if (parts.length < 5) return null;
        const windowMin = parsePositiveNumber(parts[3]);
        const thresholdPct = parsePositiveNumber(parts[4]);
        if (!windowMin || !thresholdPct) return null;
        const cooldownSec = parts[5] ? parsePositiveNumber(parts[5]) : 300;
        return {
            params: { windowMin, thresholdPct },
            cooldownSec: cooldownSec ? Math.floor(cooldownSec) : 300,
        };
    }

    if (parts.length < 4) return null;
    const targetPrice = parsePositiveNumber(parts[3]);
    if (!targetPrice) return null;
    const cooldownSec = parts[4] ? parsePositiveNumber(parts[4]) : 300;
    return {
        params: { targetPrice },
        cooldownSec: cooldownSec ? Math.floor(cooldownSec) : 300,
    };
}

bot.command('setmc', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2) {
        return ctx.reply('⚠️ Please provide a value. Usage: /setmc 500k or /setmc 1m');
    }

    const numericValue = parseNumberValue(parts[1]);

    if (isNaN(numericValue) || numericValue < 0) {
        return ctx.reply('❌ Invalid format. Please use numbers like 500k, 1m, 2.5m, etc.');
    }

    try {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key: 'min_mc_threshold', value: numericValue.toString(), updated_at: new Date().toISOString() });

        if (error) {
            console.error('Failed to update app_settings:', error);
            return ctx.reply('❌ Failed to update the database. Please try again.');
        }

        const formattedValue = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(numericValue);

        return ctx.reply(`✅ Minimum Market Cap filter set to: ${formattedValue}\n\nAlerts for tokens below this market cap will be suppressed.`);
    } catch (err) {
        console.error('Error in /setmc:', err);
        return ctx.reply('❌ An unexpected error occurred.');
    }
});

bot.command('watchadd', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
        return ctx.reply('⚠️ Usage: /watchadd <mint>');
    }

    const mint = parts[1];
    try {
        const token = await ensureWatchToken(mint);
        if (!token) {
            return ctx.reply('❌ Failed to add watch token.');
        }
        return ctx.reply(`✅ Watch token active:\n<code>${token.mint}</code>`, { parse_mode: 'HTML' });
    } catch (error: any) {
        console.error('watchadd failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('watchdel', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
        return ctx.reply('⚠️ Usage: /watchdel <mint>');
    }

    const mint = parts[1];
    try {
        const { data: token, error: tokenError } = await supabase
            .from('watch_tokens')
            .select('id, mint')
            .eq('mint', mint)
            .maybeSingle();
        if (tokenError) throw tokenError;

        if (!token) {
            return ctx.reply('⚠️ Token is not in watch list.');
        }

        const { error: updateError } = await supabase
            .from('watch_tokens')
            .update({ is_active: false })
            .eq('id', token.id);
        if (updateError) throw updateError;

        return ctx.reply(`✅ Watch token disabled:\n<code>${token.mint}</code>`, { parse_mode: 'HTML' });
    } catch (error: any) {
        console.error('watchdel failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('watchlist', async (ctx) => {
    try {
        const { data, error } = await supabase
            .from('watch_tokens')
            .select('mint, symbol, is_active, last_price, last_checked_at')
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;

        if (!data || data.length === 0) {
            return ctx.reply('No watch tokens yet. Use /watchadd <mint>.');
        }

        const lines = data.map((t: any) => {
            const status = t.is_active ? '✅' : '⏸️';
            const symbol = t.symbol || 'N/A';
            const price = t.last_price ? `$${Number(t.last_price).toPrecision(6)}` : 'N/A';
            return `${status} ${symbol} ${price}\n<code>${t.mint}</code>`;
        });
        return ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
    } catch (error: any) {
        console.error('watchlist failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('strategyadd', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 4) {
        return ctx.reply(strategyUsageText());
    }

    const mint = parts[1];
    const strategyType = parseStrategyType(parts[2]);
    if (!strategyType) {
        return ctx.reply(`❌ Invalid strategy type: ${parts[2]}\n\n${strategyUsageText()}`);
    }

    const payload = buildStrategyPayload(strategyType, parts);
    if (!payload) {
        return ctx.reply(strategyUsageText());
    }

    try {
        const token = await ensureWatchToken(mint);
        if (!token) {
            return ctx.reply('❌ Failed to create/find watch token.');
        }

        const defaultName = `${strategyType} ${mint.slice(0, 6)}`;
        const chatId = String(ctx.chat?.id || '');

        const { data, error } = await supabase
            .from('price_strategies')
            .insert({
                watch_token_id: token.id,
                name: defaultName,
                type: strategyType,
                params: payload.params,
                cooldown_sec: payload.cooldownSec,
                is_active: true,
                chat_id: chatId || null,
                updated_at: new Date().toISOString(),
            })
            .select('id, name, type, cooldown_sec')
            .single();
        if (error) throw error;

        return ctx.reply(
            [
                '✅ Strategy added',
                `ID: <code>${data.id}</code>`,
                `Name: ${data.name}`,
                `Type: ${data.type}`,
                `Cooldown: ${data.cooldown_sec}s`,
            ].join('\n'),
            { parse_mode: 'HTML' }
        );
    } catch (error: any) {
        console.error('strategyadd failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('strategylist', async (ctx) => {
    try {
        const { data, error } = await supabase
            .from('price_strategies')
            .select('id, name, type, params, cooldown_sec, is_active, watch_tokens(mint, symbol)')
            .order('created_at', { ascending: false })
            .limit(30);
        if (error) throw error;

        if (!data || data.length === 0) {
            return ctx.reply('No strategies yet. Use /strategyadd ...');
        }

        const lines = data.map((s: any) => {
            const wt = Array.isArray(s.watch_tokens) ? s.watch_tokens[0] : s.watch_tokens;
            const mint = wt?.mint || 'N/A';
            const symbol = wt?.symbol || 'TOKEN';
            const status = s.is_active ? '✅' : '⏸️';
            return [
                `${status} ${s.name} (${s.type})`,
                `ID: <code>${s.id}</code>`,
                `Token: ${symbol}`,
                `<code>${mint}</code>`,
                `Cooldown: ${s.cooldown_sec}s`,
                `Params: <code>${JSON.stringify(s.params)}</code>`,
            ].join('\n');
        });
        return ctx.reply(lines.join('\n\n'), { parse_mode: 'HTML' });
    } catch (error: any) {
        console.error('strategylist failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('strategyon', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) return ctx.reply('⚠️ Usage: /strategyon <strategy_id>');

    try {
        const { error } = await supabase
            .from('price_strategies')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', parts[1]);
        if (error) throw error;
        return ctx.reply(`✅ Strategy enabled: <code>${parts[1]}</code>`, { parse_mode: 'HTML' });
    } catch (error: any) {
        console.error('strategyon failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('strategyoff', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) return ctx.reply('⚠️ Usage: /strategyoff <strategy_id>');

    try {
        const { error } = await supabase
            .from('price_strategies')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', parts[1]);
        if (error) throw error;
        return ctx.reply(`✅ Strategy paused: <code>${parts[1]}</code>`, { parse_mode: 'HTML' });
    } catch (error: any) {
        console.error('strategyoff failed:', error);
        return ctx.reply(`❌ Database error: ${error.message}`);
    }
});

bot.command('strategytest', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    if (parts.length < 2) return ctx.reply('⚠️ Usage: /strategytest <strategy_id>');

    const strategyId = parts[1];

    try {
        const { data, error } = await supabase
            .from('price_strategies')
            .select('id, name, type, params, chat_id, watch_tokens(mint, symbol)')
            .eq('id', strategyId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return ctx.reply('❌ Strategy not found.');

        const wt = Array.isArray((data as any).watch_tokens)
            ? (data as any).watch_tokens[0]
            : (data as any).watch_tokens;
        const mint = wt?.mint || 'N/A';
        const symbol = wt?.symbol || 'TOKEN';
        const targetChatId = data.chat_id || String(ctx.chat?.id || '');

        const message = [
            '🧪 <b>Strategy Test Alert</b>',
            '━━━━━━━━━━━━━━━━━━',
            `<b>Strategy:</b> ${data.name}`,
            `<b>Type:</b> ${data.type}`,
            `<b>Token:</b> ${symbol}`,
            `<b>Mint:</b> <code>${mint}</code>`,
            `<b>Params:</b> <code>${JSON.stringify(data.params)}</code>`,
            'This is a manual test, not a live trigger.',
        ].join('\n');

        if (!targetChatId) {
            return ctx.reply('❌ Cannot determine target chat for test alert.');
        }

        await ctx.telegram.sendMessage(targetChatId, message, { parse_mode: 'HTML' });
        return ctx.reply(`✅ Test alert sent to chat ${targetChatId}`);
    } catch (error: any) {
        console.error('strategytest failed:', error);
        return ctx.reply(`❌ Failed to send test alert: ${error.message}`);
    }
});

// Default start/help handler
bot.start((ctx) => {
    ctx.reply(
        [
            'Welcome to Sol Tracker Bot!',
            '',
            'Commands:',
            '/setmc <amount> - Set min market cap filter',
            '/watchadd <mint> - Add watch token',
            '/watchdel <mint> - Disable watch token',
            '/watchlist - List watch tokens',
            '/strategyadd ... - Add strategy',
            '/strategylist - List strategies',
            '/strategyon <id> - Enable strategy',
            '/strategyoff <id> - Disable strategy',
            '/strategytest <id> - Send manual test alert',
        ].join('\n')
    );
});

// Register bot commands to show up in the Telegram menu
bot.telegram.setMyCommands([
    { command: 'setmc', description: 'Set minimum market cap for alerts (e.g. 500k)' },
    { command: 'watchadd', description: 'Add watch token by mint' },
    { command: 'watchdel', description: 'Disable watch token by mint' },
    { command: 'watchlist', description: 'List watch tokens' },
    { command: 'strategyadd', description: 'Add a price strategy' },
    { command: 'strategylist', description: 'List strategies' },
    { command: 'strategyon', description: 'Enable strategy by id' },
    { command: 'strategyoff', description: 'Disable strategy by id' },
    { command: 'strategytest', description: 'Send manual test alert' }
]).catch(err => console.error('Failed to set bot commands:', err));

bot.launch().then(() => {
    console.log('🤖 Telegram Bot is running...');
}).catch((err) => {
    console.error('Failed to launch bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
