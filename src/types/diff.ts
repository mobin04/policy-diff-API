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

export interface DiffDetail {
  value: string;
  added: boolean;
  removed: boolean;
}

export type Change = {
  section: string;
  type: ChangeType;
  details?: DiffDetail[];
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskedChange = {
  section: string;
  type: ChangeType;
  risk: RiskLevel;
  reason: string;
  details?: DiffDetail[];
};

/**
 * Standard diff result returned by check endpoint
 */
export type DiffResult = {
  message: string;
  risk_level?: RiskLevel;
  changes?: RiskedChange[];
  /** Isolation status for internal metrics */
  content_isolation?: 'success' | 'fallback';
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
