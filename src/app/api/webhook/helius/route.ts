import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseHeliusTransaction } from '@/lib/solana-parser';
import { sendTelegramAlert, formatSwapAlert } from '@/lib/telegram';
import { logToFile } from '@/lib/logger';

// In-memory dedup
const processedSignatures = new Set<string>();
const DEDUP_TTL_MS = 60_000;

function isDuplicate(signature: string): boolean {
    if (processedSignatures.has(signature)) return true;
    processedSignatures.add(signature);
    setTimeout(() => processedSignatures.delete(signature), DEDUP_TTL_MS);
    return false;
}

export async function POST(req: NextRequest) {
    logToFile('Webhook request received', 'WEBHOOK');
    try {
        const body = await req.json();
        logToFile(`Webhook body length: ${body?.length}`, 'INFO');

        if (!body || body.length === 0) {
            return NextResponse.json({ success: true, message: 'Empty body' });
        }

        // 1. Fetch monitored addresses with person names (joined)
        const { data: monitoredAddresses, error: fetchError } = await supabase
            .from('addresses')
            .select('address, label, is_active, person_id, people(name)')
            .eq('is_active', true);

        if (fetchError) {
            logToFile(`Supabase fetch error: ${fetchError.message}`, 'ERROR');
            throw fetchError;
        }

        // Build address → { originalAddress, personName, addrLabel } map
        const addressMap = new Map<string, { address: string; personName: string; addrLabel: string }>();
        for (const a of monitoredAddresses || []) {
            const personName = (a as any).people?.name || 'Unknown';
            addressMap.set(a.address.trim().toLowerCase(), {
                address: a.address.trim(),
                personName,
                addrLabel: a.label || '',
            });
        }

        let swapCount = 0;
        let skipCount = 0;
        let dedupCount = 0;

        for (const tx of body) {
            const signature = tx.signature || '';

            if (isDuplicate(signature)) {
                dedupCount++;
                logToFile(`⏭️ Dedup skip: ${signature.slice(0, 8)}`, 'INFO');
                continue;
            }

            const parsed = parseHeliusTransaction(tx);
            let matchedEntry: { address: string; personName: string; addrLabel: string } | undefined;

            for (const addr of parsed.involvedAddresses) {
                const entry = addressMap.get(addr.trim().toLowerCase());
                if (entry) { matchedEntry = entry; break; }
            }

            if (!matchedEntry) { skipCount++; continue; }

            const walletLabel = matchedEntry.addrLabel
                ? `${matchedEntry.personName} (${matchedEntry.addrLabel})`
                : matchedEntry.personName;

            const result = parseHeliusTransaction(tx, matchedEntry.address, walletLabel);

            if (!result.isSwap || !result.swap) {
                skipCount++;
                logToFile(`Skipping non-swap TX: ${signature.slice(0, 8)} (type: ${result.rawType})`, 'INFO');
                continue;
            }

            swapCount++;
            const swap = result.swap;
            logToFile(
                `🎯 SWAP DETECTED: ${swap.type} | Person: ${matchedEntry.personName} | Token: ${swap.tokenMint.slice(0, 8)}... | Amount: ${swap.tokenAmount} | Cost: ${swap.costAmount} ${swap.costSymbol} | DEX: ${swap.dexSource}`,
                'SUCCESS'
            );

            // Resolve token info BEFORE inserting into DB to save it
            // Since our resolver has deduplication and cache, this is extremely fast and safe.
            const { resolveTokenInfo } = await import('@/lib/token-resolver');
            const tokenInfoData = await resolveTokenInfo(swap.tokenMint);

            // Store in DB
            const { error: logError } = await supabase
                .from('logs')
                .insert({
                    address: matchedEntry.address,
                    signature: swap.signature,
                    type: `${swap.type} (${swap.dexSource})`,
                    token_info: {
                        mint: swap.tokenMint,
                        amount: swap.tokenAmount,
                        action: swap.type,
                        costMint: swap.costMint,
                        costAmount: swap.costAmount,
                        costSymbol: swap.costSymbol,
                        personName: matchedEntry.personName,
                        // New fields for Dashboard
                        symbol: tokenInfoData.symbol,
                        name: tokenInfoData.name,
                        marketCap: tokenInfoData.marketCap
                    },
                    amount: swap.costAmount.toString(),
                    timestamp: new Date().toISOString(),
                });

            if (logError) {
                if (logError.code === '23505') {
                    logToFile(`DB dedup: signature exists`, 'INFO');
                } else {
                    logToFile(`❌ DB insert error: ${logError.code} - ${logError.message}`, 'ERROR');
                }
            } else {
                logToFile(`✅ DB insert success: ${signature.slice(0, 8)}`, 'SUCCESS');
            }

            // Send Telegram alert
            try {
                const alertMessage = await formatSwapAlert(swap);
                await sendTelegramAlert(alertMessage);
            } catch (alertError: any) {
                logToFile(`Alert error: ${alertError.message}`, 'ERROR');
            }
        }

        logToFile(`Batch done: ${swapCount} swaps, ${skipCount} skipped, ${dedupCount} deduped`, 'INFO');
        return NextResponse.json({ success: true, swaps: swapCount, skipped: skipCount });
    } catch (error: any) {
        logToFile(`Webhook critical error: ${error.message}`, 'ERROR');
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
