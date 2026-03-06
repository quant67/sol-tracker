const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Manual dotenv loading because in some environments process.cwd() varies
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('--- Environment Check ---');
console.log('HELIUS_API_KEY:', HELIUS_API_KEY ? 'Present' : 'Missing');
console.log('WEBHOOK_URL:', WEBHOOK_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function syncWebhooks() {
    try {
        const { data: addresses, error: dbError } = await supabase
            .from('addresses')
            .select('*');

        if (dbError) {
            console.error('❌ Supabase Error:', dbError);
            return;
        }

        const activeAddresses = addresses?.filter((a) => a.is_active).map((a) => a.address) || [];
        console.log('✅ Active addresses to monitor:', activeAddresses);

        if (!HELIUS_API_KEY) {
            console.error('❌ HELIUS_API_KEY not found in .env');
            return;
        }

        // Fetch existing webhooks
        const listRes = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`);
        const webhooks = await listRes.json();

        if (!Array.isArray(webhooks)) {
            console.error('❌ Failed to fetch webhooks from Helius:', webhooks);
            return;
        }

        console.log(`📡 Found ${webhooks.length} existing Helius Webhooks.`);

        // 1. Delete ALL webhooks that don't match our current WEBHOOK_URL
        const redundantWebhooks = webhooks.filter((wh) => wh.webhookURL !== WEBHOOK_URL);
        if (redundantWebhooks.length > 0) {
            console.log(`🧹 Cleaning up ${redundantWebhooks.length} redundant webhooks...`);
            for (const wh of redundantWebhooks) {
                const delRes = await fetch(
                    `https://api.helius.xyz/v0/webhooks/${wh.webhookID}?api-key=${HELIUS_API_KEY}`,
                    { method: 'DELETE' }
                );
                if (delRes.ok) console.log(`  ✅ Deleted: ${wh.webhookID} (${wh.webhookURL})`);
                else console.error(`  ❌ Failed to delete: ${wh.webhookID}`);
            }
        }

        const existingWh = webhooks.find((wh) => wh.webhookURL === WEBHOOK_URL);

        if (activeAddresses.length === 0) {
            console.log('⚠️ No addresses to monitor. Skipping update.');
            return;
        }

        const payload = {
            webhookURL: WEBHOOK_URL,
            transactionTypes: ["Any"],
            accountAddresses: activeAddresses,
            webhookType: "enhanced"
        };

        if (existingWh) {
            console.log(`🔄 Updating active Webhook ${existingWh.webhookID}...`);
            const updateRes = await fetch(
                `https://api.helius.xyz/v0/webhooks/${existingWh.webhookID}?api-key=${HELIUS_API_KEY}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );
            if (updateRes.ok) console.log('✅ SUCCESS: Webhook updated and synced');
            else console.error('❌ FAIL: Webhook update failed', await updateRes.text());
        } else {
            console.log('🆕 Creating New Webhook...');
            const createRes = await fetch(
                `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );
            if (createRes.ok) console.log('✅ SUCCESS: Webhook created');
            else console.error('❌ FAIL: Webhook creation failed', await createRes.text());
        }
    } catch (err) {
        console.error('💥 Crash:', err);
    }
}

syncWebhooks();
