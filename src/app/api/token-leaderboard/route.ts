import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveTokenInfo } from '@/lib/token-resolver';

const WINDOW_DAYS = {
    '1d': 1,
    '3d': 3,
    '7d': 7,
    '15d': 15,
} as const;

const SORT_MODES = ['buyers_desc', 'recent_desc', 'market_cap_desc'] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_MIN_BUYERS = 2;
const CACHE_TTL_MS = 60_000;

type WindowKey = keyof typeof WINDOW_DAYS;
type SortMode = typeof SORT_MODES[number];

interface LogRow {
    id: string;
    address: string | null;
    type: string | null;
    token_info: unknown;
    timestamp: string;
}

interface AddressRow {
    address: string;
    person_id: string | null;
}

interface PersonRow {
    id: string;
    name: string;
}

interface TokenInfoJson {
    mint?: string;
    symbol?: string;
    name?: string;
    marketCap?: number | string | null;
    personName?: string;
    action?: string;
}

interface TokenAccumulator {
    mint: string;
    symbol: string;
    name: string;
    marketCap: number | null;
    lastBuyMarketCap: number | null;
    buyers: Map<string, string>;
    lastBoughtAt: string;
}

interface TokenLeaderboardItem {
    mint: string;
    symbol: string;
    name: string;
    marketCap: number | null;
    lastBuyMarketCap: number | null;
    priceChangePct: number | null;
    buyerCount: number;
    buyers: string[];
    lastBoughtAt: string;
}

interface TokenMetadata {
    symbol: string;
    name: string;
    timestamp: string;
}

interface DexPair {
    baseToken?: {
        address?: string;
        symbol?: string;
        name?: string;
    };
    quoteToken?: {
        address?: string;
        symbol?: string;
        name?: string;
    };
    liquidity?: {
        usd?: number;
    };
    marketCap?: number;
    fdv?: number;
}

interface CurrentTokenInfo {
    symbol: string;
    name: string;
    marketCap: number | null;
    liquidityUsd: number;
}

interface ResolvedTokenInfo {
    symbol: string;
    name: string;
    marketCap: number | null;
}

interface TokenLeaderboardResponse {
    window: WindowKey;
    sort: SortMode;
    limit: number;
    minBuyers: number;
    generatedAt: string;
    cached: boolean;
    totalTokens: number;
    filteredTokens: number;
    items: TokenLeaderboardItem[];
}

const responseCache = new Map<string, { expiresAt: number; payload: TokenLeaderboardResponse }>();

function pruneResponseCache(now: number) {
    if (responseCache.size <= 200) return;
    for (const [key, value] of responseCache.entries()) {
        if (value.expiresAt <= now) responseCache.delete(key);
    }
}

function isWindowKey(value: string): value is WindowKey {
    return value in WINDOW_DAYS;
}

function isSortMode(value: string): value is SortMode {
    return SORT_MODES.includes(value as SortMode);
}

function getBoundedInteger(value: string | null, fallback: number, min: number, max: number) {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseTokenInfo(value: unknown): TokenInfoJson {
    if (!value) return {};

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'object' && parsed ? parsed : {};
        } catch {
            return {};
        }
    }

    return typeof value === 'object' ? value as TokenInfoJson : {};
}

function getText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getMarketCap(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function getShortAddress(address: string | null | undefined): string {
    if (!address) return 'Unknown';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isAddressFallbackSymbol(mint: string, symbol: string) {
    return symbol === getShortAddress(mint) || symbol.includes('...');
}

function hasWeakTokenIdentity(mint: string, symbol: string, name: string) {
    return name === 'Unknown Token' || isAddressFallbackSymbol(mint, symbol);
}

function isBuyLog(log: LogRow, tokenInfo: TokenInfoJson): boolean {
    const action = getText(tokenInfo.action)?.toUpperCase();
    if (action === 'BUY') return true;

    return Boolean(log.type?.toUpperCase().includes('BUY'));
}

function getBuyer(
    log: LogRow,
    tokenInfo: TokenInfoJson,
    addressMap: Map<string, AddressRow>,
    peopleMap: Map<string, PersonRow>
) {
    const addressKey = log.address?.trim().toLowerCase() || '';
    const address = addressMap.get(addressKey);
    const person = address?.person_id ? peopleMap.get(address.person_id) : null;
    const fallbackName = getText(tokenInfo.personName) || getShortAddress(log.address);

    if (person) {
        return {
            id: `person:${person.id}`,
            name: person.name,
        };
    }

    return {
        id: `fallback:${fallbackName.toLowerCase()}`,
        name: fallbackName,
    };
}

function sortItems(items: TokenLeaderboardItem[], sort: SortMode) {
    return items.sort((a, b) => {
        if (sort === 'recent_desc') {
            return Date.parse(b.lastBoughtAt) - Date.parse(a.lastBoughtAt);
        }

        if (sort === 'market_cap_desc') {
            return (b.marketCap || 0) - (a.marketCap || 0)
                || b.buyerCount - a.buyerCount
                || Date.parse(b.lastBoughtAt) - Date.parse(a.lastBoughtAt);
        }

        return b.buyerCount - a.buyerCount
            || Date.parse(b.lastBoughtAt) - Date.parse(a.lastBoughtAt);
    });
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Token leaderboard request failed.';
}

function getPriceChangePct(lastBuyMarketCap: number | null, currentMarketCap: number | null) {
    if (!lastBuyMarketCap || !currentMarketCap) return null;
    return ((currentMarketCap - lastBuyMarketCap) / lastBuyMarketCap) * 100;
}

function chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function getPairToken(pair: DexPair, mint: string) {
    const lowerMint = mint.toLowerCase();
    if (pair.baseToken?.address?.toLowerCase() === lowerMint) return pair.baseToken;
    if (pair.quoteToken?.address?.toLowerCase() === lowerMint) return pair.quoteToken;
    return null;
}

async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    callback: (item: T) => Promise<void>
) {
    let index = 0;
    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(
        Array.from({ length: workerCount }).map(async () => {
            while (index < items.length) {
                const item = items[index];
                index += 1;
                await callback(item);
            }
        })
    );
}

function applyResolvedInfo(item: TokenLeaderboardItem, info: ResolvedTokenInfo) {
    const hasUsefulIdentity = !hasWeakTokenIdentity(item.mint, info.symbol, info.name);

    if (hasUsefulIdentity) {
        item.symbol = info.symbol || item.symbol;
        item.name = info.name || item.name;
    }

    item.marketCap = info.marketCap ?? item.marketCap;
    item.priceChangePct = getPriceChangePct(item.lastBuyMarketCap, info.marketCap);
}

function collectTokenMetadata(logRows: LogRow[]) {
    const metadataMap = new Map<string, TokenMetadata>();

    for (const log of logRows) {
        const tokenInfo = parseTokenInfo(log.token_info);
        const mint = getText(tokenInfo.mint);
        const symbol = getText(tokenInfo.symbol);
        const name = getText(tokenInfo.name);

        if (!mint || !symbol || !name || hasWeakTokenIdentity(mint, symbol, name)) continue;

        const current = metadataMap.get(mint);
        if (!current || Date.parse(log.timestamp) > Date.parse(current.timestamp)) {
            metadataMap.set(mint, { symbol, name, timestamp: log.timestamp });
        }
    }

    return metadataMap;
}

async function fetchCurrentTokenInfo(mints: string[]) {
    const uniqueMints = Array.from(new Set(mints));
    const result = new Map<string, CurrentTokenInfo>();
    const mintByLower = new Map(uniqueMints.map((mint) => [mint.toLowerCase(), mint]));

    await Promise.all(
        chunkArray(uniqueMints, 30).map(async (chunk) => {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4500);
                const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`, {
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                if (!response.ok) return;

                const data = await response.json();
                const pairs = Array.isArray(data?.pairs) ? data.pairs as DexPair[] : [];

                for (const pair of pairs) {
                    const addresses = [pair.baseToken?.address, pair.quoteToken?.address]
                        .filter((address): address is string => Boolean(address));

                    for (const address of addresses) {
                        const mint = mintByLower.get(address.toLowerCase());
                        if (!mint) continue;

                        const token = getPairToken(pair, mint);
                        if (!token?.symbol) continue;

                        const liquidityUsd = pair.liquidity?.usd || 0;
                        const current = result.get(mint);
                        if (current && current.liquidityUsd >= liquidityUsd) continue;

                        result.set(mint, {
                            symbol: token.symbol,
                            name: token.name || token.symbol,
                            marketCap: pair.marketCap || pair.fdv || null,
                            liquidityUsd,
                        });
                    }
                }
            } catch (error) {
                console.warn('Token leaderboard batch lookup failed:', error);
            }
        })
    );

    return result;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const windowParam = searchParams.get('window') || '1d';
        const sortParam = searchParams.get('sort') || 'buyers_desc';
        const limit = getBoundedInteger(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
        const minBuyers = getBoundedInteger(searchParams.get('minBuyers'), DEFAULT_MIN_BUYERS, 1, 1000);

        if (!isWindowKey(windowParam)) {
            return NextResponse.json(
                { error: 'Unsupported window. Use 1d, 3d, 7d, or 15d.' },
                { status: 400 }
            );
        }

        if (!isSortMode(sortParam)) {
            return NextResponse.json(
                { error: 'Unsupported sort mode.' },
                { status: 400 }
            );
        }

        const now = Date.now();
        pruneResponseCache(now);
        const cacheKey = `${windowParam}:${sortParam}:${limit}:${minBuyers}`;
        const cached = responseCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return NextResponse.json({ ...cached.payload, cached: true });
        }

        const since = new Date(Date.now() - WINDOW_DAYS[windowParam] * 24 * 60 * 60 * 1000);

        const { data: logs, error: logsError } = await supabase
            .from('logs')
            .select('id, address, type, token_info, timestamp')
            .gte('timestamp', since.toISOString())
            .order('timestamp', { ascending: false })
            .limit(2000);

        if (logsError) {
            return NextResponse.json({ error: logsError.message }, { status: 500 });
        }

        const logRows = (logs || []) as LogRow[];
        const addresses = Array.from(new Set(
            logRows
                .map((log) => log.address?.trim())
                .filter((address): address is string => Boolean(address))
        ));

        const { data: addressRows, error: addressesError } = addresses.length > 0
            ? await supabase
                .from('addresses')
                .select('address, person_id')
                .in('address', addresses)
            : { data: [] as AddressRow[], error: null };

        if (addressesError) {
            return NextResponse.json({ error: addressesError.message }, { status: 500 });
        }

        const typedAddressRows = (addressRows || []) as AddressRow[];
        const personIds = Array.from(new Set(
            typedAddressRows
                .map((address) => address.person_id)
                .filter((personId): personId is string => Boolean(personId))
        ));

        const { data: peopleRows, error: peopleError } = personIds.length > 0
            ? await supabase
                .from('people')
                .select('id, name')
                .in('id', personIds)
            : { data: [] as PersonRow[], error: null };

        if (peopleError) {
            return NextResponse.json({ error: peopleError.message }, { status: 500 });
        }

        const addressMap = new Map<string, AddressRow>(
            typedAddressRows.map((address) => [address.address.trim().toLowerCase(), address])
        );
        const peopleMap = new Map<string, PersonRow>(
            ((peopleRows || []) as PersonRow[]).map((person) => [person.id, person])
        );
        const metadataMap = collectTokenMetadata(logRows);
        const tokenMap = new Map<string, TokenAccumulator>();

        for (const log of logRows) {
            const tokenInfo = parseTokenInfo(log.token_info);

            if (!isBuyLog(log, tokenInfo)) continue;

            const mint = getText(tokenInfo.mint);
            if (!mint) continue;

            const buyer = getBuyer(log, tokenInfo, addressMap, peopleMap);
            const current = tokenMap.get(mint);
            const symbol = getText(tokenInfo.symbol) || getShortAddress(mint);
            const name = getText(tokenInfo.name) || symbol;
            const marketCap = getMarketCap(tokenInfo.marketCap);

            if (!current) {
                tokenMap.set(mint, {
                    mint,
                    symbol,
                    name,
                    marketCap,
                    lastBuyMarketCap: marketCap,
                    buyers: new Map([[buyer.id, buyer.name]]),
                    lastBoughtAt: log.timestamp,
                });
                continue;
            }

            current.buyers.set(buyer.id, buyer.name);

            if (!current.symbol && symbol) current.symbol = symbol;
            if (!current.name && name) current.name = name;
            if (current.marketCap === null && marketCap !== null) current.marketCap = marketCap;

            if (Date.parse(log.timestamp) > Date.parse(current.lastBoughtAt)) {
                current.lastBoughtAt = log.timestamp;
                current.symbol = symbol;
                current.name = name;
                current.lastBuyMarketCap = marketCap;
                current.marketCap = marketCap ?? current.marketCap;
            }
        }

        const items = Array.from(tokenMap.values()).map<TokenLeaderboardItem>((token) => ({
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            marketCap: token.marketCap,
            lastBuyMarketCap: token.lastBuyMarketCap,
            priceChangePct: null,
            buyerCount: token.buyers.size,
            buyers: Array.from(token.buyers.values()).sort((a, b) => a.localeCompare(b)),
            lastBoughtAt: token.lastBoughtAt,
        }));

        for (const item of items) {
            const metadata = metadataMap.get(item.mint);
            if (metadata && hasWeakTokenIdentity(item.mint, item.symbol, item.name)) {
                item.symbol = metadata.symbol;
                item.name = metadata.name;
            }
        }

        const totalTokens = items.length;
        const filteredItems = items.filter((item) => item.buyerCount >= minBuyers);
        const topItems = sortItems(filteredItems, sortParam).slice(0, limit);

        const currentInfoMap = await fetchCurrentTokenInfo(topItems.map((item) => item.mint));

        const fallbackItems = topItems.filter((item) =>
            !currentInfoMap.has(item.mint)
            && (hasWeakTokenIdentity(item.mint, item.symbol, item.name) || item.marketCap === null || item.lastBuyMarketCap !== null)
        );

        await runWithConcurrency(
            fallbackItems,
            6,
            async (item) => {
                try {
                    const info = await resolveTokenInfo(item.mint);
                    applyResolvedInfo(item, info);
                } catch (error) {
                    console.warn(`Token leaderboard resolver failed for ${item.mint}:`, error);
                }
            }
        );

        for (const item of topItems) {
            const info = currentInfoMap.get(item.mint);
            if (info) {
                applyResolvedInfo(item, info);
            }
        }

        const payload: TokenLeaderboardResponse = {
            window: windowParam,
            sort: sortParam,
            limit,
            minBuyers,
            generatedAt: new Date().toISOString(),
            cached: false,
            totalTokens,
            filteredTokens: filteredItems.length,
            items: topItems,
        };

        responseCache.set(cacheKey, {
            expiresAt: now + CACHE_TTL_MS,
            payload,
        });

        return NextResponse.json(payload);
    } catch (error: unknown) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
