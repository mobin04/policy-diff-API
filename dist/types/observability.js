"use strict";
/**
 * Observability types for request tracking and logging
 *
 * Security Design Decisions:
 *
 * 1. WHY REQUEST IDS MATTER:
 *    Request IDs enable tracing a single request across logs, errors, and
 *    downstream services. Essential for debugging production issues and
 *    correlating user reports with server logs.
 *
 * 2. WHY STACK TRACES ARE HIDDEN IN PRODUCTION:
 *    Stack traces can reveal internal file paths, library versions, and
 *    implementation details that attackers could exploit. Only show them
 *    in development where security is less critical.
 *
 * 3. WHY AUDIT LOGS EXCLUDE SENSITIVE DATA:
 *    Request/response bodies may contain PII, API keys, or business data.
 *    Audit logs store only metadata (endpoint, status, timing) to enable
 *    analytics without compliance/privacy risks.
 *
 * 4. WHY STRUCTURED LOGGING IS CRITICAL:
 *    JSON logs can be parsed by log aggregators (ELK, Datadog, CloudWatch).
 *    This enables filtering, alerting, and dashboards at scale.
 *    console.log produces unstructured text that's hard to analyze.
 *
 * 5. HOW THIS PREPARES FOR SCALING:
 *    - Request IDs enable distributed tracing (add trace-id for microservices)
 *    - Audit logs feed into billing/analytics systems
 *    - Structured logs integrate with APM tools
 *    - Response times enable SLA monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
