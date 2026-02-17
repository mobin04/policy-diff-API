# Async Monitoring

## Overview

This document describes the asynchronous job-based monitoring system introduced in the context of PolicyDiff development.

**Important: This is a single-instance async model. Not distributed.**

## Why Async Execution Was Introduced

### Limitations of Synchronous Execution

The original `POST /v1/check` endpoint executed the full monitoring pipeline synchronously:

1. **HTTP Connection Blocking**: Client connections were held open for 5-30 seconds during page fetch, normalization, and diff operations.
2. **Timeout Risks**: Long-running operations risked HTTP timeouts, especially behind load balancers with default 30s limits.
3. **Poor User Experience**: No visibility into processing progress; clients could only wait or retry blindly.
4. **Resource Contention**: Synchronous requests tie up worker threads, limiting concurrent capacity.

### Production Reliability Reasoning

The async model addresses these issues:

- **Immediate Response**: Clients receive a job ID within milliseconds, not seconds.
- **Decoupled Processing**: HTTP request lifecycle is independent of processing time.
- **Observable State**: Clients can poll for status and see PENDING → PROCESSING → COMPLETED transitions.
- **Graceful Degradation**: At capacity, the system returns 429 instead of timing out.

## New Monitoring Lifecycle

```
┌──────────┐     POST /v1/monitor     ┌──────────┐
│  Client  │ ───────────────────────► │  Server  │
└──────────┘                          └──────────┘
     │                                      │
     │         { job_id, status }           │
     │ ◄──────────────────────────────────  │
     │                                      │
     │                              ┌───────▼───────┐
     │                              │ setImmediate  │
     │                              │  processing   │
     │                              └───────────────┘
     │
     │       GET /v1/jobs/:jobId
     │ ─────────────────────────────────────►
     │
     │         { status: PROCESSING }
     │ ◄─────────────────────────────────────
     │
     │       GET /v1/jobs/:jobId (poll)
     │ ─────────────────────────────────────►
     │
     │     { status: COMPLETED, result }
     │ ◄─────────────────────────────────────
```

## Job State Machine

```
                    ┌─────────┐
                    │ PENDING │
                    └────┬────┘
                         │
                    job picked up
                         │
                         ▼
                  ┌────────────┐
                  │ PROCESSING │
                  └──────┬─────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
      success                       failure
           │                           │
           ▼                           ▼
    ┌───────────┐               ┌──────────┐
    │ COMPLETED │               │  FAILED  │
    └───────────┘               └──────────┘
```

### State Descriptions

| Status | Description |
|--------|-------------|
| PENDING | Job created, waiting to be picked up by processing loop |
| PROCESSING | Job is actively being processed (fetch, diff, risk analysis) |
| COMPLETED | Job finished successfully, result available |
| FAILED | Job failed, error_type indicates cause |

## API Contract Examples

### Create Monitoring Job

**Request:**
```http
POST /v1/monitor HTTP/1.1
Host: api.policydiff.example
X-API-Key: pdiff_xxx
Content-Type: application/json

{
  "url": "https://example.com/privacy"
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "PENDING"
}
```

### Get Job Status (Processing)

**Request:**
```http
GET /v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890 HTTP/1.1
Host: api.policydiff.example
X-API-Key: pdiff_xxx
```

**Response (200 OK):**
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "PROCESSING"
}
```

### Get Job Status (Completed)

**Response (200 OK):**
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "COMPLETED",
  "result": {
    "message": "Changes detected",
    "risk_level": "HIGH",
    "changes": [
      {
        "section": "Data Sharing",
        "type": "MODIFIED",
        "risk": "HIGH",
        "reason": "High risk keyword detected in content"
      }
    ]
  }
}
```

### Get Job Status (Failed)

**Response (200 OK):**
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "FAILED",
  "error_type": "TIMEOUT"
}
```

### Server at Capacity

**Response (429 Too Many Requests):**
```json
{
  "error": "TooManyRequests",
  "message": "Server is at capacity. Please retry later.",
  "request_id": "req_xyz123"
}
```

## Error Types

| Error Type | Description |
|------------|-------------|
| INVALID_URL | URL format is invalid or uses unsupported protocol |
| FETCH_ERROR | Generic fetch failure (unknown cause) |
| HTTP_ERROR | Target URL returned 4xx or 5xx status |
| TIMEOUT | Request timed out waiting for response |
| DNS_FAILURE | Domain could not be resolved |
| CONNECTION_ERROR | Connection refused or reset by server |
| INTERNAL_ERROR | Unexpected server error |

## Concurrency Model

### Single Instance Limitation

The current implementation uses an **in-memory concurrency guard**:

```typescript
const MAX_CONCURRENT_JOBS = 5;
const activeJobs = new Set<string>();
```

This approach:
- Limits concurrent processing to 5 jobs per server instance
- Prevents server overload from too many simultaneous fetches
- Returns 429 immediately when at capacity (before creating a job)

### In-Memory Guard Explanation

The guard operates as follows:

1. **Before job creation**: Check `canAcquireJob()` → if false, return 429
2. **When processing starts**: Call `acquireJob(jobId)` → adds to active set
3. **When processing ends**: Call `releaseJob(jobId)` → removes from active set (in `finally` block)

### Future Scaling Note

**The in-memory guard does NOT work for:**
- Multiple server instances behind a load balancer
- Clustered Node.js deployments (PM2 cluster mode)
- Serverless environments (Lambda, Cloud Functions)

**For horizontal scaling, migrate to:**
- Redis-based distributed locking (e.g., Redlock)
- Distributed job queue (BullMQ, RabbitMQ, SQS)
- Database-level advisory locks

## Database Schema

### monitor_jobs Table

```sql
CREATE TABLE monitor_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    result JSONB,
    error_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### Indexes

| Index | Purpose |
|-------|---------|
| idx_monitor_jobs_page_id | Fast lookup of jobs by page |
| idx_monitor_jobs_status | Finding pending/stuck jobs |
| idx_monitor_jobs_created_at | Ordering by creation time |

## Migration Notes

### Old Sync Endpoint Removed

The synchronous `POST /v1/check` endpoint remains available for backward compatibility, but new integrations should use the async model.

### Clients Must Poll for Results

Polling strategy recommendations:

1. **Initial delay**: Wait 1-2 seconds before first poll (most jobs complete quickly)
2. **Polling interval**: Poll every 2-3 seconds for PENDING/PROCESSING status
3. **Timeout**: Consider a job stale after 60 seconds of PROCESSING status
4. **Exponential backoff**: Optional for high-traffic clients

Example polling loop (pseudocode):
```
job = POST /v1/monitor { url }
sleep(2 seconds)

while job.status in [PENDING, PROCESSING]:
    job = GET /v1/jobs/{job.job_id}
    if elapsed > 60 seconds:
        break
    sleep(3 seconds)

if job.status == COMPLETED:
    process(job.result)
else if job.status == FAILED:
    handle_error(job.error_type)
```

## Production Considerations

### What Happens on Server Restart

On server startup, the `initializeJobService()` function:

1. Queries for all jobs with `status = 'PROCESSING'`
2. Marks them as `FAILED` with `error_type = 'INTERNAL_ERROR'`
3. Sets `completed_at = NOW()`

This prevents jobs from being stuck in PROCESSING forever after a crash.

### Orphan PROCESSING Jobs Handling Strategy

Orphaned jobs can occur when:
- Server crashes during processing
- Server is forcefully terminated (SIGKILL)
- Unhandled exception escapes the processing function

The mitigation strategy:
1. **On startup**: Mark all PROCESSING jobs as FAILED (handled automatically)
2. **Monitoring**: Alert on jobs in PROCESSING status for > 5 minutes
3. **Client handling**: Clients should treat stale PROCESSING jobs as potentially failed

### Graceful Shutdown

For graceful shutdown (future enhancement):
- Stop accepting new jobs (return 503)
- Wait for active jobs to complete (with timeout)
- Mark remaining PROCESSING jobs as FAILED
- Then exit

## File Structure

```
src/
├── controllers/
│   └── monitor.controller.ts    # HTTP request handlers
├── routes/
│   └── monitor.route.ts         # Route definitions
├── services/
│   └── monitorJob.service.ts    # Business logic
├── repositories/
│   └── monitorJob.repository.ts # Database operations
├── utils/
│   └── concurrencyGuard.ts      # In-memory job limiter
├── types/
│   └── job.ts                   # Type definitions
└── db/
    └── migrations/
        └── 005_monitor_jobs.sql # Table creation
```

## Testing Recommendations

### Unit Tests

1. **Concurrency guard**: Test acquire/release/capacity
2. **Error classification**: Test all error type mappings
3. **Repository**: Test CRUD operations

### Integration Tests

1. **Happy path**: Create job → poll → COMPLETED
2. **Failure path**: Invalid URL → FAILED with error_type
3. **Capacity limit**: Exceed MAX_CONCURRENT_JOBS → 429
4. **Orphan cleanup**: PROCESSING jobs marked FAILED on restart

### Load Tests

1. Verify behavior at concurrency limit
2. Measure job processing latency distribution
3. Test recovery after simulated crash
