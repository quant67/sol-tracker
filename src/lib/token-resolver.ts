// Token Name Resolution + Market Cap
// Priority: hardcoded → DexScreener → Jupiter → address fallback

interface TokenInfo {
    symbol: string;
    name: string;
    marketCap: number | null;  // USD market cap
}

const tokenCache = new Map<string, TokenInfo>();

// Well-known tokens (market cap fetched dynamically)
const KNOWN_TOKENS: Record<string, { symbol: string; name: string }> = {
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana' },
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD' },
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', name: 'Marinade Staked SOL' },
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk' },
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol: 'WIF', name: 'dogwifhat' },
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter' },
    'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof': { symbol: 'RENDER', name: 'Render Token' },
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': { symbol: 'PYTH', name: 'Pyth Network' },
    'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL': { symbol: 'JTO', name: 'Jito' },
    '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'MAXXING', name: 'Maxxing' },
};

export async function resolveTokenInfo(mint: string): Promise<TokenInfo> {
    // 1. Check cache (includes market cap)
    if (tokenCache.has(mint)) return tokenCache.get(mint)!;

    // 2. Try DexScreener — returns symbol + market cap
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (dexRes.ok) {
            const data = await dexRes.json();
            if (data?.pairs && data.pairs.length > 0) {
                const pair = data.pairs[0];
                const tokenData = pair.baseToken?.address === mint
                    ? pair.baseToken
                    : pair.quoteToken?.address === mint
                        ? pair.quoteToken
                        : null;

                if (tokenData?.symbol) {
                    const info: TokenInfo = {
                        symbol: tokenData.symbol,
                        name: tokenData.name || tokenData.symbol,
                        marketCap: pair.marketCap || pair.fdv || null,
                    };
                    tokenCache.set(mint, info);
                    return info;
                }
            }
        }
    } catch (err: any) {
        console.warn(`DexScreener lookup failed for ${mint.slice(0, 8)}: ${err.message}`);
    }

    // 3. Known tokens fallback (no market cap)
    if (KNOWN_TOKENS[mint]) {
        const info: TokenInfo = { ...KNOWN_TOKENS[mint], marketCap: null };
        tokenCache.set(mint, info);
        return info;
    }

    // 4. Try Jupiter
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const jupRes = await fetch(`https://tokens.jup.ag/token/${mint}`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (jupRes.ok) {
            const data = await jupRes.json();
            if (data?.symbol) {
                const info: TokenInfo = { symbol: data.symbol, name: data.name || data.symbol, marketCap: null };
                tokenCache.set(mint, info);
                return info;
            }
        }
    } catch (err: any) {
        console.warn(`Jupiter lookup failed for ${mint.slice(0, 8)}: ${err.message}`);
    }

    // 5. Fallback
    const fallback: TokenInfo = { symbol: `${mint.slice(0, 4)}...${mint.slice(-4)}`, name: 'Unknown Token', marketCap: null };
    tokenCache.set(mint, fallback);
    return fallback;
}

export function formatTokenAmount(amount: number): string {
    if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
    if (amount >= 1_000) return (amount / 1_000).toFixed(2) + 'K';
    if (amount < 0.001 && amount > 0) return amount.toExponential(2);
    return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function formatMarketCap(mc: number | null): string {
    if (!mc) return 'N/A';
    if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(2)}B`;
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
    return `$${mc.toFixed(0)}`;
}
