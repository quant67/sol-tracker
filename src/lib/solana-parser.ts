export interface ParsedSwap {
    signature: string;
    type: 'BUY' | 'SELL';
    wallet: string;
    walletLabel: string;
    tokenMint: string;
    tokenAmount: number;
    costMint: string;       // What was spent/received (SOL, USDC, etc.)
    costAmount: number;
    costSymbol: string;     // 'SOL', 'USDC', etc.
    dexSource: string;
    description: string;
    timestamp: number;
}

export interface ParseResult {
    isSwap: boolean;
    swap?: ParsedSwap;
    rawType: string;
    signature: string;
    involvedAddresses: string[];
}

// Stablecoins and base assets — these are what you PAY WITH, not what you're trading
const BASE_ASSETS: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
};

function isBaseAsset(mint: string): boolean {
    return mint in BASE_ASSETS;
}

export function parseHeliusTransaction(tx: any, monitoredWallet?: string, walletLabel?: string): ParseResult {
    const {
        signature,
        type,
        source,
        feePayer,
        tokenTransfers,
        nativeTransfers,
        timestamp,
        accountData,
        description
    } = tx;

    // Collect all involved addresses
    const involvedAddresses = new Set<string>();
    if (feePayer) involvedAddresses.add(feePayer);

    if (accountData && Array.isArray(accountData)) {
        accountData.forEach((ad: any) => {
            if (ad.account) involvedAddresses.add(ad.account);
        });
    }
    if (nativeTransfers && Array.isArray(nativeTransfers)) {
        nativeTransfers.forEach((nt: any) => {
            if (nt.fromUser) involvedAddresses.add(nt.fromUser);
            if (nt.toUser) involvedAddresses.add(nt.toUser);
        });
    }
    if (tokenTransfers && Array.isArray(tokenTransfers)) {
        tokenTransfers.forEach((tt: any) => {
            if (tt.fromUserAccount) involvedAddresses.add(tt.fromUserAccount);
            if (tt.toUserAccount) involvedAddresses.add(tt.toUserAccount);
            if (tt.fromUser) involvedAddresses.add(tt.fromUser);
            if (tt.toUser) involvedAddresses.add(tt.toUser);
        });
    }

    const result: ParseResult = {
        isSwap: false,
        rawType: type || 'UNKNOWN',
        signature: signature || '',
        involvedAddresses: Array.from(involvedAddresses),
    };

    if (type !== 'SWAP') return result;
    if (!tokenTransfers || !Array.isArray(tokenTransfers) || tokenTransfers.length === 0) return result;

    const wallet = monitoredWallet || feePayer || '';

    // ===== CORE LOGIC: Identify the REAL traded token =====
    // In a swap like USDC → MAXXING:
    //   - tokenTransfers has: USDC out (from wallet) + MAXXING in  (to wallet)
    //   - The "target" token is the NON-base-asset one (MAXXING, not USDC)
    //   - If wallet receives it → BUY; if wallet sends it → SELL

    // Separate transfers into base-asset transfers and target-token transfers
    const targetTokenTransfers = tokenTransfers.filter(
        (tt: any) => !isBaseAsset(tt.mint)
    );
    const baseAssetTransfers = tokenTransfers.filter(
        (tt: any) => isBaseAsset(tt.mint)
    );

    let swapType: 'BUY' | 'SELL' | null = null;
    let targetTransfer: any = null;
    let costTransfer: any = null;

    if (targetTokenTransfers.length > 0) {
        // Check: did wallet RECEIVE a non-base token? → BUY
        const buyTransfer = targetTokenTransfers.find(
            (tt: any) => (tt.toUserAccount === wallet || tt.toUser === wallet)
        );
        if (buyTransfer) {
            swapType = 'BUY';
            targetTransfer = buyTransfer;
            // Cost is what the wallet sent out (base asset)
            costTransfer = baseAssetTransfers.find(
                (tt: any) => (tt.fromUserAccount === wallet || tt.fromUser === wallet)
            );
        } else {
            // Check: did wallet SEND a non-base token? → SELL
            const sellTransfer = targetTokenTransfers.find(
                (tt: any) => (tt.fromUserAccount === wallet || tt.fromUser === wallet)
            );
            if (sellTransfer) {
                swapType = 'SELL';
                targetTransfer = sellTransfer;
                // Cost is what the wallet received (base asset)
                costTransfer = baseAssetTransfers.find(
                    (tt: any) => (tt.toUserAccount === wallet || tt.toUser === wallet)
                );
            }
        }
    }

    // Fallback: try using feePayer if wallet didn't match
    if (!swapType && targetTokenTransfers.length > 0) {
        const buyFP = targetTokenTransfers.find(
            (tt: any) => (tt.toUserAccount === feePayer || tt.toUser === feePayer)
        );
        if (buyFP) {
            swapType = 'BUY';
            targetTransfer = buyFP;
            costTransfer = baseAssetTransfers.find(
                (tt: any) => (tt.fromUserAccount === feePayer || tt.fromUser === feePayer)
            );
        } else {
            const sellFP = targetTokenTransfers.find(
                (tt: any) => (tt.fromUserAccount === feePayer || tt.fromUser === feePayer)
            );
            if (sellFP) {
                swapType = 'SELL';
                targetTransfer = sellFP;
                costTransfer = baseAssetTransfers.find(
                    (tt: any) => (tt.toUserAccount === feePayer || tt.toUser === feePayer)
                );
            }
        }
    }

    if (!swapType || !targetTransfer) return result;

    // Calculate cost amount
    let costAmount = 0;
    let costSymbol = 'SOL';
    let costMint = 'So11111111111111111111111111111111111111112';

    if (costTransfer) {
        costAmount = Math.abs(costTransfer.tokenAmount || 0);
        costMint = costTransfer.mint;
        costSymbol = BASE_ASSETS[costMint] || 'Unknown';
    } else if (nativeTransfers && Array.isArray(nativeTransfers)) {
        // Fall back to native SOL transfers
        nativeTransfers.forEach((nt: any) => {
            if (nt.fromUser === wallet || nt.fromUser === feePayer ||
                nt.toUser === wallet || nt.toUser === feePayer) {
                costAmount += Math.abs(nt.amount || 0) / 1_000_000_000;
            }
        });
        costAmount = Math.round(costAmount * 10000) / 10000;
    }

    result.isSwap = true;
    result.swap = {
        signature,
        type: swapType,
        wallet,
        walletLabel: walletLabel || 'Monitored Wallet',
        tokenMint: targetTransfer.mint,
        tokenAmount: Math.abs(targetTransfer.tokenAmount || 0),
        costMint,
        costAmount: Math.round(costAmount * 10000) / 10000,
        costSymbol,
        dexSource: source || 'Unknown DEX',
        description: description || '',
        timestamp: timestamp || Math.floor(Date.now() / 1000),
    };

    return result;
}
