# PolicyDiff API

PolicyDiff is a deterministic compliance engine for monitoring structural and substantive changes in legal documents. It provides automated detection of section-level modifications using rule-based risk classification and strict content normalization.

## Table of Contents

1. [Core Design](#1-core-design)
2. [Architecture](#2-architecture)
3. [Normalization & Extraction](#3-normalization--extraction)
4. [Risk Engine](#4-risk-engine)
5. [Job & Concurrency Control](#5-job--concurrency-control)
6. [Quotas & Limits](#6-quotas--limits)
7. [API Reference](#7-api-reference)
8. [Observability & Security](#8-observability--security)
9. [Setup & Operations](#9-setup--operations)
10. [License](#10-license)

## 1. Core Design

- **Determinism**: Identical inputs always yield identical outputs. The system avoids all probabilistic logic or AI-based modeling.
- **O(1) Hash Comparison**: Employs SHA-256 section-level hashing to detect modifications without expensive string comparisons.
- **Single-Instance Isolation**: Designed for high-reliability single-node deployments with deterministic in-memory concurrency guards.
- **Stateless Analysis**: Content is analyzed in isolation from external state during the diff phase to ensure auditability.
- **Type Safety**: Built with strict TypeScript to enforce contract integrity across all layers.

## 2. Architecture

The system implements a strict layered architecture:
`Route (Fastify) → Controller (Orchestration) → Service (Logic) → Repository (Persistence) → Database (PostgreSQL)`

### The Pipeline Lifecycle
1. **Fetch**: Network retrieval of HTML content with realistic browser headers and redirect handling.
2. **Normalize**: Transformation of unstable DOM structures (tables, lists) into stable canonical text.
3. **Isolate**: Extraction of the primary content container (e.g., `<main>`) using a prioritized selector matrix.
4. **Parse**: Hierarchy-based sectioning using `<h1>`, `<h2>`, and `<h3>` tags as delimiters.
5. **Hash**: SHA-256 generation for content blocks after temporal noise masking.
6. **Diff**: Multi-pass delta calculation (Exact Match → Fuzzy Match → Rename Detection).
7. **Classify**: Deterministic risk scoring based on proximity clustering and negation-aware root matching.

## 3. Normalization & Extraction

### Structural Normalization
DOM elements that produce unstable diff noise are converted to stable formats before hashing:
- **Tables**: Converted to pipe-separated Markdown rows.
- **Lists**: Converted to canonical Markdown-like lists with consistent indentation.
- **Temporal Masking**: Dates within proximity (5 words) of keywords (e.g., "revised", "effective") are replaced with `__DATE_TOKEN__`.
- **Numeric Normalization**: Normalizes thousands-separators, currency symbols, and percentages to focus on numeric value changes.

### Content Isolation
The engine removes global noise (navigation, footers, scripts) and isolates the primary policy container:
- Priority: `<main>` → `<article>` → `[role="main"]` → `#content` → `#main`.
- Minimum text threshold: 500 characters.
- **Isolation Drift**: Detects and logs when the selected container changes between runs, preventing false-positive risk.

## 4. Risk Engine (V2)

The engine classifies changes (`LOW`, `MEDIUM`, `HIGH`) using a deterministic proximity-based clustering model:
- **Proximity Clustering**: Detects verb-noun pairs (e.g., "sell" within 5 words of "biometric") indicating high-risk data intent.
- **Negation Awareness**: Neutralizes clusters if a negation word (e.g., "not", "except") appears within 3 tokens before the verb.
- **Negation Shift**: Specifically flags the removal of negative modifiers in high-risk clauses for `MODIFIED` sections.
- **Structural Erosion**: Detects the deletion of mandatory compliance sections (e.g., "Arbitration", "Liability").
- **Contextual Multipliers**: Adjusts risk levels based on section importance (e.g., 2.0x for "Refund Policy").

## 5. Job & Concurrency Control

### Job State Machine
- `PENDING`: Created in database and enqueued in the in-memory FIFO queue.
- `PROCESSING`: Active execution with a hard 15-second runtime limit.
- `COMPLETED`: Results persisted in the `result` JSONB column.
- `FAILED`: Error classification persisted in the `error_type` column.

### Capacity Management
- **Global Concurrency**: Controlled via an in-memory guard (default: 5 concurrent slots).
- **Per-Key Fairness**: Limits active jobs per API key based on the assigned tier to prevent resource monopolization.
- **FIFO Queuing**: Jobs beyond capacity are held in an in-memory queue (up to 1,000 pending jobs).
- **Crash Recovery**: Service restart triggers a recovery task that transitions orphaned `PROCESSING` jobs to `FAILED`.

## 6. Quotas & Limits

| Tier | Monthly Quota | URL Limit | Concurrency | Max Batch Size | Burst (Req) | Refill (Req/s) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FREE** | 30 jobs | 3 URLs | 1 job | 3 URLs | 30 | 0.5 |
| **STARTER** | 500 jobs | 10 URLs | 2 jobs | 10 URLs | 120 | 2.0 |
| **PRO** | 2,500 jobs | 25 URLs | 5 jobs | 25 URLs | 600 | 10.0 |

*Usage is tracked per calendar month and resets at 00:00:00Z on the 1st.*

## 7. API Reference

All requests require `Authorization: Bearer <key>`.

### Common Headers
- `X-Request-Id`: Unique identifier for request tracing.
- `Idempotency-Key`: Ensures request deduplication. Returns cached `job_id` if the same payload is resubmitted.

### Endpoints
- `POST /v1/check`: Synchronous monitoring (limited to quick-fetch pages).
- `POST /v1/monitor`: Asynchronous URL submission. Returns `202 Accepted` with `job_id`.
- `POST /v1/monitor/batch`: Multi-URL submission. Returns `batch_id` for status polling.
- `GET /v1/jobs/:id`: Retrieve job status. `COMPLETED` results include word-level diffs (Myers algorithm).
- `GET /v1/batches/:id`: Aggregated status for a batch submission (counts of pending/processing/failed).
- `GET /v1/usage`: Detailed tier metrics and usage counters.
- `GET /v1/internal/metrics`: System-wide job performance and database statistics (Requires `X-Internal-Token`).

## 8. Observability & Security

- **Abuse Monitoring**: Instrumentation for idempotency reuse, high-frequency job polling, and abnormal error rates.
- **Structured Logging**: JSON logs (Pino) with automatic daily rotation and request correlation.
- **Error Mapping**: Internal failures are mapped to deterministic public error types (e.g., `DNS_FAILURE`, `PAGE_ACCESS_BLOCKED`, `JOB_TIMEOUT`).
- **Data Integrity**: SHA-256 hashing for all API keys; raw keys are never persisted.

## 9. Setup & Operations

### Prerequisites
- Node.js v20+
- PostgreSQL v14+

### Installation
```bash
npm install
cp .env.config.example .env.config
# Configure DATABASE_URL and API_SECRET
npm run dev
```

### Validation
Ensure pipeline stability via replay validation before deployment:
```bash
npx ts-node scripts/replay-validate.ts <snapshot_id> 20
```

## 10. License
Apache License 2.0.
