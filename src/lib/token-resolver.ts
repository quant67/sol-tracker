// Token Name Resolution + Market Cap
// Priority: hardcoded → DexScreener → Jupiter → address fallback

interface TokenInfo {
    symbol: string;
    name: string;
    marketCap: number | null;  // USD market cap
}

const TTL_MS = 60 * 1000; // 60 seconds

// 1. Static Token Info (Never expires for Name/Symbol)
interface StaticInfo {
    symbol: string;
    name: string;
}
const staticCache = new Map<string, StaticInfo>();

// 2. Dynamic Market Cap (Expires every 60s)
interface MarketCapEntry {
    marketCap: number | null;
    timestamp: number;
}
const mcapCache = new Map<string, MarketCapEntry>();

// 3. Promise Deduplication (Prevents stampeding API requests)
const pendingRequests = new Map<string, Promise<TokenInfo>>();

// Pre-fill known tokens
const KNOWN_TOKENS: Record<string, StaticInfo> = {
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

Object.entries(KNOWN_TOKENS).forEach(([mint, info]) => {
    staticCache.set(mint, info);
});

export async function resolveTokenInfo(mint: string): Promise<TokenInfo> {
    // 1. Check if we have a fresh Market Cap cache
    const cachedStatic = staticCache.get(mint);
    const cachedMcap = mcapCache.get(mint);

    if (cachedStatic && cachedMcap) {
        const age = Date.now() - cachedMcap.timestamp;
        if (age < TTL_MS) {
            return {
                symbol: cachedStatic.symbol,
                name: cachedStatic.name,
                marketCap: cachedMcap.marketCap
            };
        }
    }

    // 2. If already fetching in another concurrent Webhook call, wait for it
    if (pendingRequests.has(mint)) {
        return pendingRequests.get(mint)!;
    }

    // 3. Otherwise, fetch fresh data and deduplicate concurrent calls
    const requestPromise = fetchFreshTokenInfo(mint, cachedStatic);
    pendingRequests.set(mint, requestPromise);

    try {
        const info = await requestPromise;
        return info;
    } finally {
        pendingRequests.delete(mint); // Always clean up
    }
}

async function fetchFreshTokenInfo(mint: string, existingStatic?: StaticInfo): Promise<TokenInfo> {
    let freshStatic = existingStatic;
    let freshMarketCap: number | null = null;
    let fallbackHit = false;

    // A. DexScreener (Provides both Static Info and Market Cap)
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (dexRes.ok) {
            const data = await dexRes.json();
            if (data?.pairs && data.pairs.length > 0) {
                // Find highest liquidity pair
                const pair = data.pairs[0];
                const tokenData = pair.baseToken?.address === mint
                    ? pair.baseToken
                    : pair.quoteToken?.address === mint
                        ? pair.quoteToken
                        : null;

                if (tokenData?.symbol) {
                    freshStatic = {
                        symbol: tokenData.symbol,
                        name: tokenData.name || tokenData.symbol
                    };
                    freshMarketCap = pair.marketCap || pair.fdv || null;
                }
            }
        }
    } catch (err: any) {
        console.warn(`DexScreener lookup failed for ${mint.slice(0, 8)}: ${err.message}`);
    }

    // B. Jupiter Fallback (Only provides Static Info, no Market Cap)
    if (!freshStatic) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const jupRes = await fetch(`https://tokens.jup.ag/token/${mint}`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (jupRes.ok) {
                const data = await jupRes.json();
                if (data?.symbol) {
                    freshStatic = { symbol: data.symbol, name: data.name || data.symbol };
                }
            }
        } catch (err: any) {
            console.warn(`Jupiter lookup failed for ${mint.slice(0, 8)}: ${err.message}`);
        }
    }

    // C. Ultimate Fallback (Address slice)
    if (!freshStatic) {
        freshStatic = {
            symbol: `${mint.slice(0, 4)}...${mint.slice(-4)}`,
            name: 'Unknown Token'
        };
        fallbackHit = true;
    }

    // Update caches
    if (!fallbackHit) {
        staticCache.set(mint, freshStatic);
    }

    // Always update Market Cap cache to avoid tight-loops even on failure
    mcapCache.set(mint, {
        marketCap: freshMarketCap,
        timestamp: Date.now()
    });

    return {
        symbol: freshStatic.symbol,
        name: freshStatic.name,
        marketCap: freshMarketCap
    };
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
