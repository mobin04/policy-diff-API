import { DB } from '../db';
import { getActiveJobCount } from '../utils/concurrencyGuard';

export type MetricsResponse = {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  processing_jobs: number;
  average_processing_time_ms: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  isolation_success_count: number;
  isolation_fallback_count: number;
  isolation_drift_count: number;
  numeric_override_trigger_count: number;
  fuzzy_match_count: number;
  low_confidence_fuzzy_match_count: number;
  fuzzy_collision_count: number;
  title_rename_count: number;
  cooldown_hit_count: number;
  cooldown_integrity_warning_count: number;
  idempotency_reuse_count: number;
  idempotency_conflict_count: number;
  cross_key_idempotency_collision_count: number;
  job_poll_count: number;
  high_frequency_polling_count: number;
  client_error_count: number;
  high_error_rate_count: number;
  invalid_internal_token_attempt_count: number;
  failure_breakdown: {
    TIMEOUT: number;
    DNS_FAILURE: number;
    CRASH_RECOVERY: number;
    JOB_TIMEOUT: number;
    INTERNAL_ERROR: number;
    [key: string]: number;
  };
  in_memory_processing_jobs: number;
  db_processing_jobs: number;
  concurrency_drift_detected: boolean;
};

export async function getInternalMetrics(): Promise<MetricsResponse> {
  const summaryResult = await DB.query<{
    total_jobs: string;
    completed_jobs: string;
    failed_jobs: string;
    processing_jobs: string;
    average_processing_time_ms: string | null;
    high_risk_count: string;
    medium_risk_count: string;
    low_risk_count: string;
    isolation_success_count: string;
    isolation_fallback_count: string;
    isolation_drift_count: string;
    numeric_override_trigger_count: string;
    fuzzy_match_count: string;
    low_confidence_fuzzy_match_count: string;
    fuzzy_collision_count: string;
    title_rename_count: string;
    cooldown_hit_count: string;
    cooldown_integrity_warning_count: string;
    idempotency_reuse_count: string;
    idempotency_conflict_count: string;
    cross_key_idempotency_collision_count: string;
    job_poll_count: string;
    high_frequency_polling_count: string;
    client_error_count: string;
    high_error_rate_count: string;
    invalid_internal_token_attempt_count: string;
  }>(`
    WITH job_stats AS (
        SELECT 
            COUNT(*) as total_jobs,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_jobs,
            COUNT(*) FILTER (WHERE status = 'FAILED') as failed_jobs,
            COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing_jobs,
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (WHERE status = 'COMPLETED' AND completed_at IS NOT NULL AND started_at IS NOT NULL) as average_processing_time_ms,
            COUNT(*) FILTER (WHERE result->>'risk_level' = 'HIGH') as high_risk_count,
            COUNT(*) FILTER (WHERE result->>'risk_level' = 'MEDIUM') as medium_risk_count,
            COUNT(*) FILTER (WHERE result->>'risk_level' = 'LOW') as low_risk_count,
            COUNT(*) FILTER (WHERE result->>'content_isolation' = 'success') as isolation_success_count,
            COUNT(*) FILTER (WHERE result->>'content_isolation' = 'fallback') as isolation_fallback_count,
            COUNT(*) FILTER (WHERE (result->>'isolation_drift')::boolean = true) as isolation_drift_count,
            COUNT(*) FILTER (WHERE (result->>'numeric_override_triggered')::boolean = true) as numeric_override_trigger_count,
            SUM((result->>'fuzzy_match_count')::int) as fuzzy_match_count,
            SUM((result->>'low_confidence_fuzzy_match_count')::int) as low_confidence_fuzzy_match_count,
            SUM((result->>'fuzzy_collision_count')::int) as fuzzy_collision_count,
            SUM((result->>'title_rename_count')::int) as title_rename_count
        FROM monitor_jobs
    ),
    cooldown_stats AS (
        SELECT 
            COUNT(*) as cooldown_hit_count,
            COUNT(*) FILTER (WHERE integrity_warning = true) as cooldown_integrity_warning_count
        FROM cooldown_hits
    ),
    abuse_stats AS (
        SELECT
            COUNT(*) FILTER (WHERE event_type = 'IDEMPOTENCY_REUSE') as idempotency_reuse_count,
            COUNT(*) FILTER (WHERE event_type = 'IDEMPOTENCY_CONFLICT') as idempotency_conflict_count,
            COUNT(*) FILTER (WHERE event_type = 'CROSS_KEY_IDEMPOTENCY_COLLISION') as cross_key_idempotency_collision_count,
            COUNT(*) FILTER (WHERE event_type = 'JOB_POLLING') as job_poll_count,
            COUNT(*) FILTER (WHERE event_type = 'HIGH_FREQUENCY_JOB_POLLING') as high_frequency_polling_count,
            COUNT(*) FILTER (WHERE event_type = 'CLIENT_ERROR') as client_error_count,
            COUNT(*) FILTER (WHERE event_type = 'HIGH_ERROR_RATE_DETECTED') as high_error_rate_count,
            COUNT(*) FILTER (WHERE event_type = 'INVALID_INTERNAL_TOKEN_ATTEMPT') as invalid_internal_token_attempt_count
        FROM request_abuse_events
    )
    SELECT * FROM job_stats CROSS JOIN cooldown_stats CROSS JOIN abuse_stats
  `);

  const breakdownResult = await DB.query<{ error_type: string; count: string }>(`
    SELECT error_type, COUNT(*) as count
    FROM monitor_jobs
    WHERE status = 'FAILED' AND error_type IS NOT NULL
    GROUP BY error_type
  `);

  const summary = summaryResult.rows[0];
  const failure_breakdown: Record<string, number> = {
    TIMEOUT: 0,
    DNS_FAILURE: 0,
    CRASH_RECOVERY: 0,
    JOB_TIMEOUT: 0,
    INTERNAL_ERROR: 0,
  };

  breakdownResult.rows.forEach((row) => {
    const errorType = row.error_type === 'DNS_FAILURE' ? 'DNS_ERROR' : row.error_type;
    failure_breakdown[errorType] = parseInt(row.count, 10);
  });

  const dbProcessingJobs = parseInt(summary.processing_jobs, 10);
  const inMemoryProcessingJobs = getActiveJobCount();

  return {
    total_jobs: parseInt(summary.total_jobs, 10),
    completed_jobs: parseInt(summary.completed_jobs, 10),
    failed_jobs: parseInt(summary.failed_jobs, 10),
    processing_jobs: dbProcessingJobs,
    average_processing_time_ms: Math.round(parseFloat(summary.average_processing_time_ms || '0')),
    high_risk_count: parseInt(summary.high_risk_count, 10),
    medium_risk_count: parseInt(summary.medium_risk_count, 10),
    low_risk_count: parseInt(summary.low_risk_count, 10),
    isolation_success_count: parseInt(summary.isolation_success_count, 10),
    isolation_fallback_count: parseInt(summary.isolation_fallback_count, 10),
    isolation_drift_count: parseInt(summary.isolation_drift_count, 10),
    numeric_override_trigger_count: parseInt(summary.numeric_override_trigger_count, 10),
    fuzzy_match_count: parseInt(summary.fuzzy_match_count || '0', 10),
    low_confidence_fuzzy_match_count: parseInt(summary.low_confidence_fuzzy_match_count || '0', 10),
    fuzzy_collision_count: parseInt(summary.fuzzy_collision_count || '0', 10),
    title_rename_count: parseInt(summary.title_rename_count || '0', 10),
    cooldown_hit_count: parseInt(summary.cooldown_hit_count, 10),
    cooldown_integrity_warning_count: parseInt(summary.cooldown_integrity_warning_count, 10),
    idempotency_reuse_count: parseInt(summary.idempotency_reuse_count || '0', 10),
    idempotency_conflict_count: parseInt(summary.idempotency_conflict_count || '0', 10),
    cross_key_idempotency_collision_count: parseInt(summary.cross_key_idempotency_collision_count || '0', 10),
    job_poll_count: parseInt(summary.job_poll_count || '0', 10),
    high_frequency_polling_count: parseInt(summary.high_frequency_polling_count || '0', 10),
    client_error_count: parseInt(summary.client_error_count || '0', 10),
    high_error_rate_count: parseInt(summary.high_error_rate_count || '0', 10),
    invalid_internal_token_attempt_count: parseInt(summary.invalid_internal_token_attempt_count || '0', 10),
    failure_breakdown: failure_breakdown as MetricsResponse['failure_breakdown'],
    in_memory_processing_jobs: inMemoryProcessingJobs,
    db_processing_jobs: dbProcessingJobs,
    concurrency_drift_detected: inMemoryProcessingJobs !== dbProcessingJobs,
  };
}
