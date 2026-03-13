import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env
const envPath = path.resolve(process.cwd(), '.env');
const fallbackEnvPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
// If not found, try the fallback path
if (!process.env.TELEGRAM_BOT_TOKEN) {
    dotenv.config({ path: fallbackEnvPath });
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.error(`Missing TELEGRAM_BOT_TOKEN. Looked in ${envPath} and ${fallbackEnvPath}`);
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(botToken);

bot.command('setmc', async (ctx) => {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);

    if (parts.length < 2) {
        return ctx.reply('⚠️ Please provide a value. Usage: /setmc 500k or /setmc 1m');
    }

    const valueStr = parts[1].toLowerCase();
    let numericValue = 0;

    if (valueStr.endsWith('k')) {
        numericValue = parseFloat(valueStr) * 1000;
    } else if (valueStr.endsWith('m')) {
        numericValue = parseFloat(valueStr) * 1000000;
    } else if (valueStr.endsWith('b')) {
        numericValue = parseFloat(valueStr) * 1000000000;
    } else {
        numericValue = parseFloat(valueStr);
    }

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

// Default start/help handler
bot.start((ctx) => {
    ctx.reply('Welcome to Sol Tracker Bot!\n\nCommands:\n/setmc <amount> - Set minimum market cap for alerts (e.g. 500k, 1m)');
});

bot.launch().then(() => {
    console.log('🤖 Telegram Bot is running...');
}).catch((err) => {
    console.error('Failed to launch bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
