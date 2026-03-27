import type { HistoricalInterval } from './historical-price-provider';
import type { OptimizationResult, OptimizationStyle } from './strategy-optimizer';

export type StrategyOptimizationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface StrategyOptimizationJobRecord {
    id: string;
    watch_token_id: string;
    mint: string;
    history_days: number;
    interval: HistoricalInterval;
    style: OptimizationStyle;
    status: StrategyOptimizationJobStatus;
    progress_message: string | null;
    provider: string | null;
    pool_address: string | null;
    pool_name: string | null;
    result_json: StrategyOptimizationJobResultEnvelope | null;
    error_message: string | null;
    attempt_count: number;
    requested_by: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    updated_at: string;
    watch_tokens?: {
        id: string;
        mint: string;
        symbol: string | null;
        name: string | null;
    } | {
        id: string;
        mint: string;
        symbol: string | null;
        name: string | null;
    }[] | null;
}

export interface StrategyOptimizationJobResultEnvelope {
    token: {
        id: string;
        mint: string;
        symbol: string | null;
        name: string | null;
    };
    optimization: OptimizationResult;
}

export function isHistoricalInterval(value: unknown): value is HistoricalInterval {
    return value === '5m' || value === '15m' || value === '1h';
}

export function isOptimizationStyle(value: unknown): value is OptimizationStyle {
    return value === 'conservative' || value === 'balanced' || value === 'aggressive';
}

export function extractJobToken(
    value: StrategyOptimizationJobRecord['watch_tokens']
): { id: string; mint: string; symbol: string | null; name: string | null } | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] || null;
    return value;
}
