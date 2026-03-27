import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

export type HistoricalInterval = '5m' | '15m' | '1h';

export interface HistoricalPricePoint {
    price: number;
    capturedAtMs: number;
    volumeUsd: number | null;
}

export interface HistoricalSeriesResult {
    provider: 'geckoterminal';
    mint: string;
    tokenSymbol: string | null;
    tokenName: string | null;
    poolAddress: string;
    poolName: string | null;
    interval: HistoricalInterval;
    historyDays: number;
    points: HistoricalPricePoint[];
    cacheHit: boolean;
    fetchedAt: string;
}

interface GeckoPoolAttributes {
    address?: string;
    name?: string;
    reserve_in_usd?: string;
    volume_usd?: {
        h24?: string;
    };
}

interface GeckoPoolResponse {
    id?: string;
    attributes?: GeckoPoolAttributes;
}

interface CachePayload extends HistoricalSeriesResult {
    createdAt: string;
}

const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'historical-price');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GECKO_BASE_URL = 'https://api.geckoterminal.com/api/v2';

function getIntervalConfig(interval: HistoricalInterval): { path: 'minute' | 'hour'; aggregate: number; stepMs: number } {
    if (interval === '5m') {
        return { path: 'minute', aggregate: 5, stepMs: 5 * 60 * 1000 };
    }
    if (interval === '15m') {
        return { path: 'minute', aggregate: 15, stepMs: 15 * 60 * 1000 };
    }
    return { path: 'hour', aggregate: 1, stepMs: 60 * 60 * 1000 };
}

function getCachePath(mint: string, interval: HistoricalInterval, historyDays: number): string {
    return path.join(CACHE_DIR, `${mint}_${interval}_${historyDays}.json`);
}

async function readCache(mint: string, interval: HistoricalInterval, historyDays: number): Promise<HistoricalSeriesResult | null> {
    const filePath = getCachePath(mint, interval, historyDays);
    try {
        const raw = await readFile(filePath, 'utf8');
        const cached = JSON.parse(raw) as CachePayload;
        const createdAtMs = new Date(cached.createdAt).getTime();
        if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > CACHE_TTL_MS) {
            return null;
        }
        return {
            ...cached,
            cacheHit: true,
        };
    } catch {
        return null;
    }
}

async function writeCache(result: HistoricalSeriesResult): Promise<void> {
    try {
        await mkdir(CACHE_DIR, { recursive: true });
        const payload: CachePayload = {
            ...result,
            createdAt: new Date().toISOString(),
        };
        await writeFile(getCachePath(result.mint, result.interval, result.historyDays), JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
        console.warn('[historical-price-provider] cache write skipped:', error);
    }
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`GeckoTerminal request failed (${response.status}): ${body || response.statusText}`);
    }

    return response.json() as Promise<T>;
}

function scorePool(pool: GeckoPoolResponse): number {
    const reserveUsd = Number(pool.attributes?.reserve_in_usd || 0);
    const volume24hUsd = Number(pool.attributes?.volume_usd?.h24 || 0);
    return reserveUsd * 0.65 + volume24hUsd * 0.35;
}

async function resolveBestPool(mint: string): Promise<{ address: string; name: string | null }> {
    const url = `${GECKO_BASE_URL}/networks/solana/tokens/${mint}/pools?page=1`;
    const response = await fetchJson<{ data?: GeckoPoolResponse[] }>(url);
    const best = (response.data || [])
        .filter((pool) => !!pool.attributes?.address)
        .sort((left, right) => scorePool(right) - scorePool(left))[0];

    if (!best?.attributes?.address) {
        throw new Error(`No GeckoTerminal pools found for ${mint}`);
    }

    return {
        address: best.attributes.address,
        name: best.attributes.name || null,
    };
}

export async function getHistoricalPriceSeries(
    mint: string,
    historyDays: number,
    interval: HistoricalInterval
): Promise<HistoricalSeriesResult> {
    const cached = await readCache(mint, interval, historyDays);
    if (cached) {
        return cached;
    }

    const pool = await resolveBestPool(mint);
    const intervalConfig = getIntervalConfig(interval);
    const cutoffMs = Date.now() - historyDays * 24 * 60 * 60 * 1000;
    const cutoffSec = Math.floor(cutoffMs / 1000);
    const limit = 1000;

    let beforeTimestamp: number | null = null;
    let shouldStop = false;
    const candles: HistoricalPricePoint[] = [];
    let tokenSymbol: string | null = null;
    let tokenName: string | null = null;

    while (!shouldStop) {
        const url = new URL(`${GECKO_BASE_URL}/networks/solana/pools/${pool.address}/ohlcv/${intervalConfig.path}`);
        url.searchParams.set('aggregate', String(intervalConfig.aggregate));
        url.searchParams.set('limit', String(limit));
        if (beforeTimestamp !== null) {
            url.searchParams.set('before_timestamp', String(beforeTimestamp));
        }

        const response = await fetchJson<{
            data?: {
                attributes?: {
                    ohlcv_list?: [number, number, number, number, number, number][];
                };
            };
            meta?: {
                base?: {
                    symbol?: string;
                    name?: string;
                };
            };
        }>(url.toString());

        const ohlcvList = response.data?.attributes?.ohlcv_list || [];
        tokenSymbol = response.meta?.base?.symbol || tokenSymbol;
        tokenName = response.meta?.base?.name || tokenName;

        if (ohlcvList.length === 0) break;

        for (const candle of ohlcvList) {
            const [timestampSec, , , , closePrice, volumeUsd] = candle;
            if (timestampSec < cutoffSec) {
                shouldStop = true;
                continue;
            }
            candles.push({
                price: Number(closePrice),
                capturedAtMs: timestampSec * 1000,
                volumeUsd: Number.isFinite(Number(volumeUsd)) ? Number(volumeUsd) : null,
            });
        }

        const oldestTimestampSec = ohlcvList[ohlcvList.length - 1]?.[0];
        if (!oldestTimestampSec || ohlcvList.length < limit || oldestTimestampSec <= cutoffSec) {
            break;
        }
        beforeTimestamp = oldestTimestampSec - Math.floor(intervalConfig.stepMs / 1000);
    }

    const deduped = [...candles]
        .filter((point) => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.capturedAtMs))
        .sort((left, right) => left.capturedAtMs - right.capturedAtMs)
        .filter((point, index, array) => index === 0 || array[index - 1].capturedAtMs !== point.capturedAtMs);

    if (deduped.length < 20) {
        throw new Error(`Not enough historical candles returned for ${mint}: ${deduped.length}`);
    }

    const result: HistoricalSeriesResult = {
        provider: 'geckoterminal',
        mint,
        tokenSymbol,
        tokenName,
        poolAddress: pool.address,
        poolName: pool.name,
        interval,
        historyDays,
        points: deduped,
        cacheHit: false,
        fetchedAt: new Date().toISOString(),
    };

    await writeCache(result);
    return result;
}
