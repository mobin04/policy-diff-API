import { JobStatus } from './job';

/**
 * Monitor batch entity as stored in database
 */
export type MonitorBatch = {
  id: string;
  apiKeyId: number;
  totalJobs: number;
  createdAt: Date;
};

/**
 * Database row type for monitor_batches table
 */
export type MonitorBatchRow = {
  id: string;
  api_key_id: number;
  total_jobs: number;
  created_at: Date;
};

/**
 * Request body for POST /v1/monitor/batch
 */
export type MonitorBatchRequestBody = {
  urls: string[];
};

export type MonitorBatchCreatedJob = {
  url: string;
  job_id: string;
  status: 'PENDING';
};

/**
 * Response for POST /v1/monitor/batch
 */
export type MonitorBatchCreatedResponse = {
  batch_id: string;
  total_jobs: number;
  jobs: MonitorBatchCreatedJob[];
};

export type BatchJobStatusItem = {
  url: string;
  job_id: string;
  status: JobStatus;
};

/**
 * Response for GET /v1/batches/:batchId
 */
export type BatchStatusResponse = {
  batch_id: string;
  total: number;
  completed: number;
  processing: number;
  failed: number;
  jobs: BatchJobStatusItem[];
};

