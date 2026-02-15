import { Change, RiskedChange, RiskLevel, Section } from '../types';

const HIGH_RISK_KEYWORDS = [
  'share data',
  'sell data',
  'third party',
  'affiliate',
  'transfer data',
  'liability limitation',
  'arbitration',
  'no refund',
  'automatic renewal',
];

const MEDIUM_RISK_KEYWORDS = ['analytics', 'cookies', 'retention', 'billing', 'subscription', 'notice period'];

const HIGH_RISK_TITLES = ['refund', 'data', 'privacy', 'liability'];

function detectHighRisk(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
}

function detectMediumRisk(content: string): boolean {
  const lowerContent = content.toLowerCase();
  return MEDIUM_RISK_KEYWORDS.some((keyword) => lowerContent.includes(keyword));
}

function detectTitleRisk(title: string): RiskLevel {
  const lowerTitle = title.toLowerCase();
  if (HIGH_RISK_TITLES.some((keyword) => lowerTitle.includes(keyword))) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

function evaluateChange(change: Change, newSections: Section[]): RiskedChange {
  const { section, type } = change;
  let risk: RiskLevel = 'LOW';
  let reason = 'Minor wording change';

  if (type === 'ADDED' || type === 'MODIFIED') {
    const sectionContent = newSections.find((s) => s.title === section)?.content || '';

    if (detectHighRisk(sectionContent)) {
      risk = 'HIGH';
      reason = 'High risk keyword detected in content';
    } else if (detectMediumRisk(sectionContent)) {
      risk = 'MEDIUM';
      reason = 'Medium risk keyword detected in content';
    }
  } else if (type === 'REMOVED') {
    const titleRisk = detectTitleRisk(section);
    if (titleRisk === 'HIGH') {
      risk = 'HIGH';
      reason = 'Critical section removed';
    } else {
      risk = 'MEDIUM';
      reason = 'Section removed';
    }
  }

  return {
    section,
    type,
    risk,
    reason,
  };
}

export function analyzeRisk(
  changes: Change[],
  newSections: Section[],
): { risk_level: RiskLevel; changes: RiskedChange[] } {
  const riskedChanges = changes.map((change) => evaluateChange(change, newSections));

  let overallRisk: RiskLevel = 'LOW';

  if (riskedChanges.some((c) => c.risk === 'HIGH')) {
    overallRisk = 'HIGH';
  } else if (riskedChanges.some((c) => c.risk === 'MEDIUM')) {
    overallRisk = 'MEDIUM';
  }

  return {
    risk_level: overallRisk,
    changes: riskedChanges,
  };
}
