import { getHistoricalPriceSeries, type HistoricalInterval } from './src/lib/historical-price-provider';
import { optimizeSwingStrategies, type OptimizationStyle } from './src/lib/strategy-optimizer';

function parseInterval(value: string | undefined): HistoricalInterval {
    if (value === '5m' || value === '15m' || value === '1h') {
        return value;
    }
    return '15m';
}

function parseStyle(value: string | undefined): OptimizationStyle {
    if (value === 'conservative' || value === 'balanced' || value === 'aggressive') {
        return value;
    }
    return 'balanced';
}

async function main() {
    const mint = process.argv[2] || 'J8PSdNP3QewKq2Z1JJJFDMaqF7KcaiJhR7gbr5KZpump';
    const historyDays = Math.min(Math.max(Number(process.argv[3] || '7'), 1), 30);
    const interval = parseInterval(process.argv[4]);
    const style = parseStyle(process.argv[5]);

    const series = await getHistoricalPriceSeries(mint, historyDays, interval);
    const result = optimizeSwingStrategies({
        mint,
        watchTokenId: 'manual-optimize',
        historyDays,
        interval,
        style,
        series,
    });

    console.log(JSON.stringify({
        input: { mint, historyDays, interval, style },
        provider: result.provider,
        tokenSymbol: result.tokenSymbol,
        tokenName: result.tokenName,
        poolAddress: result.poolAddress,
        poolName: result.poolName,
        pointsUsed: result.pointsUsed,
        firstPointAt: result.firstPointAt,
        lastPointAt: result.lastPointAt,
        bestOverall: result.bestOverall,
        topByType: result.topByType,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
