import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { logToFile } from '../src/lib/logger';
import { getHistoricalPriceSeries } from '../src/lib/historical-price-provider';
import { optimizeSwingStrategies } from '../src/lib/strategy-optimizer';
import type { StrategyOptimizationJobRecord, StrategyOptimizationJobResultEnvelope } from '../src/lib/strategy-optimizer-jobs';

const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '.env'),
];

for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const envConfig = dotenv.parse(fs.readFileSync(p));
    for (const k in envConfig) process.env[k] = envConfig[k];
    break;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LOOP_INTERVAL_MS = Number(process.env.STRATEGY_OPTIMIZER_WORKER_INTERVAL_MS || 5000);
const STALE_RUNNING_MIN = Number(process.env.STRATEGY_OPTIMIZER_STALE_MIN || 30);

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials for strategy optimizer worker.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] || null;
    return value;
}

async function updateJob(
    id: string,
    updates: Record<string, unknown>
): Promise<void> {
    const { error } = await supabase
        .from('strategy_optimization_jobs')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        throw new Error(`Failed to update job ${id}: ${error.message}`);
    }
}

async function recoverStaleJobs(): Promise<void> {
    const threshold = new Date(Date.now() - STALE_RUNNING_MIN * 60 * 1000).toISOString();
    const { error } = await supabase
        .from('strategy_optimization_jobs')
        .update({
            status: 'failed',
            progress_message: 'Recovered from stale running state',
            error_message: `Worker marked stale running job as failed after ${STALE_RUNNING_MIN} minutes`,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('status', 'running')
        .lt('started_at', threshold);

    if (error) {
        logToFile(`Failed to recover stale optimizer jobs: ${error.message}`, 'ERROR');
    }
}

async function claimNextJob(): Promise<StrategyOptimizationJobRecord | null> {
    const { data: queuedJobs, error } = await supabase
        .from('strategy_optimization_jobs')
        .select('id, watch_token_id, mint, history_days, interval, style, status, progress_message, provider, pool_address, pool_name, result_json, error_message, attempt_count, requested_by, created_at, started_at, finished_at, updated_at, watch_tokens(id, mint, symbol, name)')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        throw new Error(`Failed to fetch queued optimizer jobs: ${error.message}`);
    }

    const candidate = queuedJobs?.[0] as StrategyOptimizationJobRecord | undefined;
    if (!candidate) return null;

    const { data: claimed, error: claimError } = await supabase
        .from('strategy_optimization_jobs')
        .update({
            status: 'running',
            progress_message: 'Worker claimed job',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            attempt_count: Number(candidate.attempt_count || 0) + 1,
        })
        .eq('id', candidate.id)
        .eq('status', 'queued')
        .select('id, watch_token_id, mint, history_days, interval, style, status, progress_message, provider, pool_address, pool_name, result_json, error_message, attempt_count, requested_by, created_at, started_at, finished_at, updated_at, watch_tokens(id, mint, symbol, name)')
        .maybeSingle();

    if (claimError) {
        throw new Error(`Failed to claim optimizer job ${candidate.id}: ${claimError.message}`);
    }

    return (claimed as StrategyOptimizationJobRecord | null) ?? null;
}

async function processJob(job: StrategyOptimizationJobRecord): Promise<void> {
    const token = extractRelation<{ id: string; mint: string; symbol: string | null; name: string | null }>(job.watch_tokens);
    const tokenMeta = token || {
        id: job.watch_token_id,
        mint: job.mint,
        symbol: null,
        name: null,
    };

    await updateJob(job.id, {
        progress_message: 'Fetching historical candles',
        error_message: null,
    });

    const series = await getHistoricalPriceSeries(job.mint, job.history_days, job.interval);

    await updateJob(job.id, {
        progress_message: 'Scoring strategy candidates',
        provider: series.provider,
        pool_address: series.poolAddress,
        pool_name: series.poolName,
    });

    const optimization = optimizeSwingStrategies({
        mint: job.mint,
        watchTokenId: job.watch_token_id,
        historyDays: job.history_days,
        interval: job.interval,
        style: job.style,
        series,
    });

    const resultEnvelope: StrategyOptimizationJobResultEnvelope = {
        token: {
            id: tokenMeta.id,
            mint: tokenMeta.mint,
            symbol: tokenMeta.symbol || optimization.tokenSymbol || null,
            name: tokenMeta.name || optimization.tokenName || null,
        },
        optimization,
    };

    await updateJob(job.id, {
        status: 'completed',
        progress_message: 'Optimization completed',
        provider: optimization.provider,
        pool_address: optimization.poolAddress,
        pool_name: optimization.poolName,
        result_json: resultEnvelope,
        error_message: null,
        finished_at: new Date().toISOString(),
    });
}

async function mainLoop(): Promise<void> {
    logToFile('Strategy optimizer worker started.', 'INFO');
    await recoverStaleJobs();

    while (true) {
        try {
            const job = await claimNextJob();
            if (!job) {
                await sleep(LOOP_INTERVAL_MS);
                continue;
            }

            logToFile(`Processing optimizer job ${job.id} (${job.mint} ${job.history_days}d ${job.interval} ${job.style})`, 'INFO');

            try {
                await processJob(job);
                logToFile(`Optimizer job completed: ${job.id}`, 'SUCCESS');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                await updateJob(job.id, {
                    status: 'failed',
                    progress_message: 'Optimization failed',
                    error_message: message,
                    finished_at: new Date().toISOString(),
                });
                logToFile(`Optimizer job failed ${job.id}: ${message}`, 'ERROR');
            }
        } catch (error: unknown) {
            logToFile(`Optimizer worker loop error: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
            await sleep(LOOP_INTERVAL_MS);
        }
    }
}

mainLoop().catch((error) => {
    logToFile(`Strategy optimizer worker crashed: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
    process.exit(1);
});
