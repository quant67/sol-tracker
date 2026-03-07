import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function runDiag() {
    let output = '--- DIAGNOSTIC LOG ---\n';
    output += `Time: ${new Date().toISOString()}\n`;
    output += `Webhook URL: ${WEBHOOK_URL}\n`;

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data: addresses } = await supabase.from('addresses').select('*');
        output += `Supabase Addresses: ${JSON.stringify(addresses, null, 2)}\n\n`;

        if (HELIUS_API_KEY) {
            const res = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`);
            const webhooks = await res.json();
            output += `Helius Webhooks: ${JSON.stringify(webhooks, null, 2)}\n`;
        } else {
            output += 'ERROR: No Helius API Key\n';
        }
    } catch (err) {
        output += `ERROR: ${err instanceof Error ? err.message : String(err)}\n`;
    }

    fs.writeFileSync('diag_results.log', output);
    console.log('Diagnostic written to diag_results.log');
}

runDiag();
