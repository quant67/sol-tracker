const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) process.env[k] = envConfig[k];

const logFile = path.resolve(process.cwd(), 'helius_debug.log');
function log(msg) {
    const content = `${new Date().toISOString()} - ${msg}\n`;
    fs.appendFileSync(logFile, content);
    console.log(msg);
}

fs.writeFileSync(logFile, '--- HELIUS DEBUG START ---\n');

async function check() {
    const key = process.env.HELIUS_API_KEY;
    const url = process.env.WEBHOOK_URL;

    log(`API Key: ${key ? 'Found' : 'Missing'}`);
    log(`Webhook URL: ${url}`);

    if (!key) {
        log('❌ Error: HELIUS_API_KEY is missing');
        return;
    }

    try {
        log('Fetching webhooks from Helius...');
        const response = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${key}`);
        if (!response.ok) {
            log(`❌ Helius API Error: ${response.status} ${response.statusText}`);
            return;
        }
        const data = await response.json();
        log(`Found ${data.length} webhooks.`);

        data.forEach(wh => {
            log(`- ID: ${wh.webhookID} | URL: ${wh.webhookURL}`);
            const accounts = wh.accountAddresses || [];
            log(`  Active: ${wh.webhookType} | Addresses Count: ${accounts.length}`);
            log(`  Addresses: ${JSON.stringify(accounts)}`);
        });

        const match = data.find(wh => wh.webhookURL === url);
        if (match) {
            log('✅ Target Webhook is ACTIVE on Helius');
        } else {
            log('❌ Webhook URL mismatch. Helius doesn\'t have this URL registered.');
        }
    } catch (err) {
        log(`💥 Crash: ${err.message}`);
    }
}

check();
