import { supabase } from '@/lib/supabase';
import { logToFile } from '@/lib/logger';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

/**
 * Sync all active addresses from Supabase to Helius webhook.
 * Called after any address add/delete/toggle operation.
 */
export async function syncHeliusWebhook() {
    if (!HELIUS_API_KEY) {
        logToFile('HELIUS_API_KEY missing, skip sync', 'ERROR');
        return;
    }

    try {
        // 1. Get all active addresses
        const { data: addresses, error } = await supabase
            .from('addresses')
            .select('address')
            .eq('is_active', true);

        if (error) {
            logToFile(`Supabase fetch error in sync: ${error.message}`, 'ERROR');
            return;
        }

        const activeAddresses = (addresses || []).map(a => a.address.trim());

        // 2. Get current webhook ID
        const webhooksRes = await fetch(
            `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`
        );

        if (!webhooksRes.ok) {
            logToFile(`Helius list webhooks failed: ${webhooksRes.status}`, 'ERROR');
            return;
        }

        const webhooks = await webhooksRes.json();
        if (!webhooks || webhooks.length === 0) {
            logToFile('No Helius webhooks found, creating one...', 'INFO');
            await createHeliusWebhook(activeAddresses);
            return;
        }

        const webhookId = webhooks[0].webhookID;

        // 3. Update webhook with current active addresses
        const updateRes = await fetch(
            `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${HELIUS_API_KEY}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    webhookURL: process.env.WEBHOOK_URL,
                    accountAddresses: activeAddresses,
                    transactionTypes: ['Any'],
                    webhookType: 'enhanced',
                }),
            }
        );

        if (updateRes.ok) {
            logToFile(`✅ Helius webhook synced: ${activeAddresses.length} addresses`, 'SUCCESS');
        } else {
            const errBody = await updateRes.text();
            logToFile(`❌ Helius webhook update failed: ${updateRes.status} - ${errBody}`, 'ERROR');
        }
    } catch (err: any) {
        logToFile(`Helius sync error: ${err.message}`, 'ERROR');
    }
}

async function createHeliusWebhook(addresses: string[]) {
    try {
        const res = await fetch(
            `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    webhookURL: process.env.WEBHOOK_URL,
                    accountAddresses: addresses,
                    transactionTypes: ['Any'],
                    webhookType: 'enhanced',
                }),
            }
        );

        if (res.ok) {
            const data = await res.json();
            logToFile(`✅ Helius webhook created: ${data.webhookID}`, 'SUCCESS');
        } else {
            const errBody = await res.text();
            logToFile(`❌ Helius webhook create failed: ${res.status} - ${errBody}`, 'ERROR');
        }
    } catch (err: any) {
        logToFile(`Helius create error: ${err.message}`, 'ERROR');
    }
}
