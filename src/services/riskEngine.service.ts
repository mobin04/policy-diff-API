import { Change, RiskedChange, RiskLevel, Section } from '../types';
import { normalizeText } from './differ.service';

const HIGH_RISK_KEYWORDS = [
  // Existing
  'share data',
  'sell data',
  'third party',
  'affiliate',
  'transfer data',
  'liability limitation',
  'arbitration',
  'no refund',
  'automatic renewal',

  // Legal Rights (Critical)
  'class action waiver',
  'jury trial waiver',
  'indemnification',
  'indemnify',
  'liquidated damages',

  // Sensitive Data (Highly Regulated)
  'biometric',
  'genetic data',
  'precise geolocation',
  'gps',
  'health data',
  'medical records',
  'financial account',

  // Aggressive Clauses
  'sole discretion',
  'without notice',
];

const MEDIUM_RISK_KEYWORDS = [
  // Existing
  'analytics',
  'cookies',
  'retention',
  'billing',
  'subscription',
  'notice period',

  // Data Usage
  'targeted advertising',
  'cross-context behavioral advertising',
  'profiling',
  'marketing communications',

  // Legal / Jurisdiction
  'governing law',
  'venue',
  'jurisdiction',
  'force majeure',
  'severability',
];

const LOW_RISK_TITLES = ['introduction', 'preamble', 'contact', 'about us', 'definitions'];

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
  let risk: RiskLevel = 'LOW';
  let reason = 'Minor wording change';

  if (change.type === 'ADDED' || change.type === 'MODIFIED') {
    const { section } = change;
    const sectionContent = newSections.find((s) => s.title === section)?.content || '';

    if (detectHighRisk(sectionContent)) {
      risk = 'HIGH';
      reason = 'High risk keyword detected in content';
    } else if (detectMediumRisk(sectionContent)) {
      risk = 'MEDIUM';
      reason = 'Medium risk keyword detected in content';
    }

    return {
      ...change,
      risk,
      reason,
    };
  } else if (change.type === 'DELETED') {
    const { section } = change;
    const titleRisk = detectTitleRisk(section);
    if (titleRisk === 'HIGH') {
      risk = 'HIGH';
      reason = 'Critical section removed';
    } else {
      const normalizedTitle = normalizeText(section);

      const isLowRiskRemoval = LOW_RISK_TITLES.some((title) => normalizedTitle.includes(title));

      if (isLowRiskRemoval) {
        risk = 'LOW';
        reason = 'Low-impact informational section removed';
      } else {
        risk = 'MEDIUM';
        reason = 'Section removed';
      }
    }

    return {
      ...change,
      risk,
      reason,
    };
  } else if (change.type === 'TITLE_RENAMED') {
    return {
      ...change,
      risk: 'LOW',
      reason: 'Section title renamed with identical content',
    };
  }

  const _exhaustiveCheck: never = change;
  return _exhaustiveCheck;
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
