/**
 * Section extracted from HTML page
 * Includes content hash for efficient comparison
 */
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

export type SectionDiffType = 'ADDED' | 'DELETED' | 'MODIFIED' | 'TITLE_RENAMED';

export type DiffDetail = {
  value: string;
  added: boolean;
  removed: boolean;
};

export type Change =
  | { section: string; type: 'ADDED' }
  | { section: string; type: 'DELETED' }
  | { section: string; type: 'MODIFIED'; details: DiffDetail[] }
  | { type: 'TITLE_RENAMED'; oldTitle: string; newTitle: string; contentHash: string };

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskedChange = Change & {
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
  /** Isolation status for internal metrics */
  content_isolation?: 'success' | 'fallback';
  /** True if container selection drifted since last run */
  isolation_drift?: boolean;
  /** True if numeric override hardening was triggered */
  numeric_override_triggered?: boolean;
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
