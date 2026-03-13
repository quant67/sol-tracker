import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

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

// Register bot commands to show up in the Telegram menu
bot.telegram.setMyCommands([
    { command: 'setmc', description: 'Set minimum market cap for alerts (e.g. 500k)' }
]).catch(err => console.error('Failed to set bot commands:', err));

bot.launch().then(() => {
    console.log('🤖 Telegram Bot is running...');
}).catch((err) => {
    console.error('Failed to launch bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
