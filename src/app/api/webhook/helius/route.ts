import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseHeliusTransaction } from '@/lib/solana-parser';
import { sendTelegramAlert, formatTransactionAlert } from '@/lib/telegram';
import { logToFile } from '@/lib/logger';

export async function POST(req: NextRequest) {
    logToFile('Webhook request received', 'WEBHOOK');
    try {
        const body = await req.json();
        logToFile(`Webhook body length: ${body?.length}`, 'INFO');

        if (!body || body.length === 0) {
            logToFile('Empty webhook body received', 'ERROR');
            return NextResponse.json({ success: true, message: 'Empty body' });
        }

        // 1. Fetch monitored addresses from Supabase
        const { data: monitoredAddresses, error: fetchError } = await supabase
            .from('addresses')
            .select('address, label')
            .eq('is_active', true);

        if (fetchError) {
            logToFile(`Supabase fetch error: ${fetchError.message}`, 'ERROR');
            throw fetchError;
        }

        const addressMap = new Map(monitoredAddresses.map(a => [a.address, a.label]));
        logToFile(`Monitoring ${addressMap.size} addresses`, 'INFO');

        // 2. Process each transaction
        for (const tx of body) {
            const parsedTx = parseHeliusTransaction(tx);
            logToFile(`Processing TX: ${parsedTx.signature.slice(0, 8)}... (Signer: ${parsedTx.signer.slice(0, 8)})`, 'INFO');

            // 3. Store in logs table
            const { error: logError } = await supabase
                .from('logs')
                .upsert({
                    address: parsedTx.signer,
                    signature: parsedTx.signature,
                    type: parsedTx.type,
                    token_info: parsedTx.tokenInfo,
                    amount: parsedTx.nativeAmount,
                    timestamp: new Date().toISOString(),
                }, { onConflict: 'signature' });

            if (logError) {
                logToFile(`Database insertion error: ${logError.message}`, 'ERROR');
            }

            // 4. If transaction involves a monitored address, send TG alert
            const matchedAddress = parsedTx.involvedAddresses.find(addr => addressMap.has(addr));
            if (matchedAddress) {
                const label = addressMap.get(matchedAddress) || 'Monitored Wallet';
                logToFile(`MATCH! Monitored address ${matchedAddress} found in TX`, 'SUCCESS');
                const alertMessage = formatTransactionAlert(parsedTx, label);
                await sendTelegramAlert(alertMessage);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        logToFile(`Webhook critical error: ${error.message}`, 'ERROR');
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
