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
        } else {
            console.log('✅ Telegram alert sent successfully');
        }
    } catch (error) {
        console.error('❌ Failed to send Telegram alert:', error);
    }
}

export function formatTransactionAlert(tx: any, label: string) {
    const sigLink = `<a href="https://solscan.io/tx/${tx.signature}">Solscan</a>`;
    const time = new Date().toLocaleTimeString();

    return `
🎯 <b>New Signal: ${label || tx.signer.slice(0, 6)}</b>
━━━━━━━━━━━━━━━━━━
<b>Type:</b> ${tx.type}
<b>Amount:</b> ${tx.nativeAmount} SOL
<b>Source:</b> ${tx.source}
<b>Time:</b> ${time}

🔗 ${sigLink}
  `.trim();
}
