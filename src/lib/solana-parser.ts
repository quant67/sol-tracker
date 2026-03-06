export interface ParsedTransaction {
    signature: string;
    type: string;
    source: string;
    signer: string;
    involvedAddresses: string[];
    tokenInfo?: {
        symbol: string;
        amount: string;
        action: 'BUY' | 'SELL' | 'TRANSFER';
    };
    nativeAmount: string; // in SOL
    timestamp: number;
}

export function parseHeliusTransaction(tx: any): ParsedTransaction {
    const { signature, type, source, feePayer, tokenTransfers, nativeTransfers, timestamp, accountData } = tx;

    let parsedType = type;
    let tokenInfo = undefined;
    let nativeAmount = '0';
    const involvedAddresses = new Set<string>();
    if (feePayer) involvedAddresses.add(feePayer);

    // Collect all addresses from native transfers
    if (nativeTransfers) {
        nativeTransfers.forEach((nt: any) => {
            if (nt.fromUser) involvedAddresses.add(nt.fromUser);
            if (nt.toUser) involvedAddresses.add(nt.toUser);
        });
        if (nativeTransfers.length > 0) {
            nativeAmount = (nativeTransfers[0].amount / 1_000_000_000).toFixed(4);
        }
    }

    // Collect all addresses from token transfers
    if (tokenTransfers) {
        tokenTransfers.forEach((tt: any) => {
            if (tt.fromUser) involvedAddresses.add(tt.fromUser);
            if (tt.toUser) involvedAddresses.add(tt.toUser);
        });
    }

    // Handle SWAPS (Raydium, Jupiter, etc.)
    if (type === 'SWAP' && tokenTransfers && tokenTransfers.length >= 2) {
        const buyTransfer = tokenTransfers.find((t: any) => t.toUser === feePayer);
        const sellTransfer = tokenTransfers.find((t: any) => t.fromUser === feePayer);

        if (buyTransfer) {
            tokenInfo = {
                symbol: buyTransfer.mint.slice(0, 4), // Fallback to mint slice if no symbol
                amount: buyTransfer.tokenAmount.toString(),
                action: 'BUY' as const
            };
            parsedType = `BUY ${tokenInfo.symbol}`;
        } else if (sellTransfer) {
            tokenInfo = {
                symbol: sellTransfer.mint.slice(0, 4),
                amount: sellTransfer.tokenAmount.toString(),
                action: 'SELL' as const
            };
            parsedType = `SELL ${tokenInfo.symbol}`;
        }
    }

    return {
        signature,
        type: parsedType,
        source: source || 'Unknown',
        signer: feePayer,
        involvedAddresses: Array.from(involvedAddresses),
        tokenInfo,
        nativeAmount,
        timestamp
    };
}
