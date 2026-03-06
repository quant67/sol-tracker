import { ParsedSwap } from './solana-parser';
import { resolveTokenInfo, formatTokenAmount, formatMarketCap } from './token-resolver';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramAlert(message: string) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('Telegram credentials missing. Alert suppressed.');
        return;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Telegram API error:', JSON.stringify(errorData));
        }
    } catch (error) {
        console.error('❌ Failed to send Telegram alert:', error);
    }
}

/**
 * Format a swap alert message for Telegram
 * - Full CA in <code> block for easy copy
 * - Market cap display
 */
export async function formatSwapAlert(swap: ParsedSwap): Promise<string> {
    const tokenInfo = await resolveTokenInfo(swap.tokenMint);

    const icon = swap.type === 'BUY' ? '🟢' : '🔴';
    const action = swap.type === 'BUY' ? 'BUY' : 'SELL';
    const costAction = swap.type === 'BUY' ? 'Spent' : 'Received';

    const time = new Date(swap.timestamp * 1000).toLocaleTimeString('en-US', {
        hour12: false,
        timeZone: 'Asia/Shanghai'
    });

    const tokenAmountStr = formatTokenAmount(swap.tokenAmount);
    const costStr = swap.costAmount > 0
        ? `${formatTokenAmount(swap.costAmount)} ${swap.costSymbol}`
        : 'N/A';
    const mcStr = formatMarketCap(tokenInfo.marketCap);

    const solscanLink = `<a href="https://solscan.io/tx/${swap.signature}">Solscan</a>`;
    const birdeyeLink = `<a href="https://birdeye.so/token/${swap.tokenMint}">Birdeye</a>`;
    const dexLink = `<a href="https://dexscreener.com/solana/${swap.tokenMint}">DexScreener</a>`;

    return `${icon} <b>${action} — ${swap.walletLabel}</b>
━━━━━━━━━━━━━━━━━━
<b>Token:</b> ${tokenInfo.symbol}
<b>MCap:</b> ${mcStr}
<b>Amount:</b> ${tokenAmountStr} ${tokenInfo.symbol}
<b>${costAction}:</b> ${costStr}
<b>DEX:</b> ${swap.dexSource}
<b>Time:</b> ${time}

<b>CA:</b>
<code>${swap.tokenMint}</code>

🔗 ${solscanLink} | ${birdeyeLink} | ${dexLink}`;
}
