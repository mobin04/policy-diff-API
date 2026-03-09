"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
