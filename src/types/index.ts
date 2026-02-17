/**
 * Section extracted from HTML page
 * Includes content hash for efficient comparison
 */
export type Section = {
  title: string;
  content: string;
  /** SHA-256 hash of normalized content for fast comparison */
  hash: string;
};

export type ChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export type Change = {
  section: string;
  type: ChangeType;
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskedChange = {
  section: string;
  type: ChangeType;
  risk: RiskLevel;
  reason: string;
};

/**
 * Standard diff result returned by check endpoint
 */
export type DiffResult = {
  message: string;
  risk_level?: RiskLevel;
  changes?: RiskedChange[];
};

/**
 * Extended check result including skip status
 */
export type CheckResult = {
  status: 'processed' | 'skipped';
  reason?: string;
  last_checked?: string;
  result?: DiffResult;
};

// Re-export auth types
export * from './auth';

// Re-export observability types
export * from './observability';

// Re-export job types
export * from './job';

// Re-export batch types
export * from './batch';
