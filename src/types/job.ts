/**
 * Types for async monitor job processing
 *
 * Job State Machine:
 *   PENDING → PROCESSING → COMPLETED
 *                       → FAILED
 *
 * PENDING: Job created, waiting to be picked up
 * PROCESSING: Job is actively being processed
 * COMPLETED: Job finished successfully, result available
 * FAILED: Job failed, error_type indicates cause
 */

import { DiffResult } from './diff';

/**
 * Job status enum values
 * Using string literal union for type safety
 */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Error types that can cause job failure
 * Maps to existing error classes in errors/index.ts
 */
export type JobErrorType =
  | 'INVALID_URL'
  | 'FETCH_ERROR'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'DNS_FAILURE'
  | 'CONNECTION_ERROR'
  | 'INTERNAL_ERROR'
  | 'CRASH_RECOVERY'
  | 'JOB_TIMEOUT'
  | 'UNSUPPORTED_DYNAMIC_PAGE'
  | 'PAGE_ACCESS_BLOCKED'
  | 'INVALID_PAGE_CONTENT';

/**
 * Monitor job entity as stored in database
 */
export type MonitorJob = {
  id: string;
  pageId: number;
  url?: string; // Canonical URL of the page
  apiKeyId: number | null;
  batchId: string | null;
  status: JobStatus;
  result: DiffResult | null;
  errorType: JobErrorType | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

/**
 * Database row type for monitor_jobs table
 */
export type MonitorJobRow = {
  id: string;
  page_id: number;
  url?: string; // Joined from pages table
  api_key_id?: number | null;
  batch_id: string | null;
  status: JobStatus;
  result: DiffResult | null;
  error_type: JobErrorType | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

/**
 * Request body for POST /v1/monitor
 */
export type MonitorRequestBody = {
  url: string;
};

/**
 * Response for POST /v1/monitor
 */
export type MonitorJobCreatedResponse = {
  job_id: string;
  status: JobStatus;
};

/**
 * Response for GET /v1/jobs/:jobId when job is pending or processing
 */
export type JobPendingResponse = {
  url: string;
  job_id: string;
  status: 'PENDING' | 'PROCESSING';
};

/**
 * Response for GET /v1/jobs/:jobId when job is completed
 */
export type JobCompletedResponse = {
  url: string;
  job_id: string;
  status: 'COMPLETED';
  result: DiffResult;
};

/**
 * Response for GET /v1/jobs/:jobId when job has failed
 */
export type JobFailedResponse = {
  url: string;
  job_id: string;
  status: 'FAILED';
  error_type: JobErrorType;
};

/**
 * Union type for GET /v1/jobs/:jobId response
 */
export type JobStatusResponse = JobPendingResponse | JobCompletedResponse | JobFailedResponse;
