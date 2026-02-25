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
  }>(`
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
        COUNT(*) FILTER (WHERE (result->>'numeric_override_triggered')::boolean = true) as numeric_override_trigger_count
    FROM monitor_jobs
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
    failure_breakdown: failure_breakdown as MetricsResponse['failure_breakdown'],
    in_memory_processing_jobs: inMemoryProcessingJobs,
    db_processing_jobs: dbProcessingJobs,
    concurrency_drift_detected: inMemoryProcessingJobs !== dbProcessingJobs,
  };
}
