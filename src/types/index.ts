export type Section = {
  title: string;
  content: string;
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

export type DiffResult = {
  message: string;
  risk_level?: RiskLevel;
  changes?: RiskedChange[];
};

// Re-export auth types
export * from './auth';
