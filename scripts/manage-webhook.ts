import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('--- Environment Check ---');
console.log('HELIUS_API_KEY:', HELIUS_API_KEY ? 'Present' : 'Missing');
console.log('WEBHOOK_URL:', WEBHOOK_URL);
console.log('SUPABASE_URL:', SUPABASE_URL);

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

        console.log('📦 Addresses in Supabase:', JSON.stringify(addresses, null, 2));

        const activeAddresses = addresses?.filter((a: any) => a.is_active).map((a: any) => a.address) || [];
        console.log('✅ Active addresses to monitor:', activeAddresses);

        if (!HELIUS_API_KEY || HELIUS_API_KEY.includes('YOUR_')) {
            console.error('❌ HELIUS_API_KEY not configured correctly');
            return;
        }

        const listRes = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`);
        const webhooks = await listRes.json();
        console.log('📡 Existing Helius Webhooks:', JSON.stringify(webhooks, null, 2));

        const existingWh = webhooks.find((wh: any) => wh.webhookURL === WEBHOOK_URL);

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
            console.log(`🔄 Updating Webhook ${existingWh.webhookID}...`);
            const updateRes = await fetch(
                `https://api.helius.xyz/v0/webhooks/${existingWh.webhookID}?api-key=${HELIUS_API_KEY}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );
            if (updateRes.ok) console.log('✅ SUCCESS: Webhook updated');
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
