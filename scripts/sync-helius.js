// Force sync all active addresses to Helius webhook
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

async function sync() {
    const key = process.env.HELIUS_API_KEY;
    const webhookUrl = process.env.WEBHOOK_URL;
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 1. Get all active addresses from Supabase
    const dbRes = await fetch(`${sbUrl}/rest/v1/addresses?select=address,is_active&is_active=eq.true`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
    const dbAddrs = await dbRes.json();
    const addresses = dbAddrs.map(a => a.address.trim());
    console.log(`📋 DB active addresses: ${addresses.length}`);
    addresses.forEach(a => console.log(`  ${a}`));

    if (addresses.length === 0) {
        console.log('⚠️  No active addresses in DB!');
        return;
    }

    // 2. Get existing webhook
    const whRes = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${key}`);
    const webhooks = await whRes.json();

    if (webhooks.length === 0) {
        // Create new webhook
        console.log('Creating new Helius webhook...');
        const createRes = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                webhookURL: webhookUrl,
                accountAddresses: addresses,
                transactionTypes: ['Any'],
                webhookType: 'enhanced',
            }),
        });
        const result = await createRes.json();
        console.log('✅ Webhook created:', result.webhookID);
    } else {
        // Update existing
        const whId = webhooks[0].webhookID;
        console.log(`\n🔄 Updating webhook ${whId}...`);
        const updateRes = await fetch(`https://api.helius.xyz/v0/webhooks/${whId}?api-key=${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                webhookURL: webhookUrl,
                accountAddresses: addresses,
                transactionTypes: ['Any'],
                webhookType: 'enhanced',
            }),
        });
        if (updateRes.ok) {
            console.log(`✅ Helius webhook synced! ${addresses.length} addresses now monitored.`);
        } else {
            const err = await updateRes.text();
            console.log(`❌ Update failed: ${updateRes.status} - ${err}`);
        }
    }

    // 3. Verify by fetching specific webhook detail
    const verifyId = webhooks.length ? webhooks[0].webhookID : null;
    if (verifyId) {
        console.log('\n🔍 Verifying...');
        const verifyRes = await fetch(`https://api.helius.xyz/v0/webhooks/${verifyId}?api-key=${key}`);
        if (verifyRes.ok) {
            const detail = await verifyRes.json();
            const count = detail.accountAddresses?.length || 0;
            console.log(`✅ Helius now monitors: ${count} addresses`);
            if (detail.accountAddresses) {
                detail.accountAddresses.forEach(a => console.log(`  ${a}`));
            }
        } else {
            console.log('⚠️  Could not verify (API returned ' + verifyRes.status + '), but sync PUT was successful.');
        }
    }
}

sync().catch(e => console.error('❌ Error:', e.message));
