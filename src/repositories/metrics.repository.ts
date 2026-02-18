import { DB } from '../db';

export type MetricsResponse = {
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  processing_jobs: number;
  average_processing_time_ms: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  failure_breakdown: {
    TIMEOUT: number;
    DNS_FAILURE: number;
    CRASH_RECOVERY: number;
    JOB_TIMEOUT: number;
    INTERNAL_ERROR: number;
    [key: string]: number;
  };
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
  }>(`
    SELECT 
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_jobs,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_jobs,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing_jobs,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) FILTER (WHERE status = 'COMPLETED' AND completed_at IS NOT NULL AND started_at IS NOT NULL) as average_processing_time_ms,
        COUNT(*) FILTER (WHERE result->>'risk_level' = 'HIGH') as high_risk_count,
        COUNT(*) FILTER (WHERE result->>'risk_level' = 'MEDIUM') as medium_risk_count,
        COUNT(*) FILTER (WHERE result->>'risk_level' = 'LOW') as low_risk_count
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

  return {
    total_jobs: parseInt(summary.total_jobs, 10),
    completed_jobs: parseInt(summary.completed_jobs, 10),
    failed_jobs: parseInt(summary.failed_jobs, 10),
    processing_jobs: parseInt(summary.processing_jobs, 10),
    average_processing_time_ms: Math.round(parseFloat(summary.average_processing_time_ms || '0')),
    high_risk_count: parseInt(summary.high_risk_count, 10),
    medium_risk_count: parseInt(summary.medium_risk_count, 10),
    low_risk_count: parseInt(summary.low_risk_count, 10),
    failure_breakdown: failure_breakdown as MetricsResponse['failure_breakdown'],
  };
}
