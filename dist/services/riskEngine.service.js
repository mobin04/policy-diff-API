"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRisk = analyzeRisk;
const differ_service_1 = require("./differ.service");
const TRANSFER_VERBS = ['sell', 'share', 'disclose', 'transfer', 'license', 'trade'];
const SENSITIVE_NOUNS = ['data', 'information', 'personal', 'biometric', 'health', 'financial', 'geolocation'];
const NEGATION_WORDS = ['not', 'except', 'excluding', 'unless', 'never'];
const SECTION_MULTIPLIER = {
    pricing: 1.5,
    refund: 2,
    arbitration: 2,
    liability: 2,
    contact: 0.5,
    introduction: 0.5,
};
const HIGH_RISK_ROOTS = [
    'share data',
    'sell data',
    'third party',
    'affiliate',
    'transfer data',
    'liability limitation',
    'arbitrat',
    'no refund',
    'automatic renewal',
    'class action waiver',
    'jury trial waiver',
    'indemn',
    'liquidated damages',
    'biometric',
    'genetic data',
    'precise geolocation',
    'gps',
    'health data',
    'medical records',
    'financial account',
    'sole discretion',
    'without notice',
    'sell your personal data',
    'thirdparty',
];
const MEDIUM_RISK_ROOTS = [
    'analytics',
    'cookies',
    'retention',
    'billing',
    'subscription',
    'notice period',
    'targeted advertising',
    'cross-context behavioral advertising',
    'profiling',
    'marketing communications',
    'governing law',
    'venue',
    'jurisdiction',
    'force majeure',
    'severability',
];
const LOW_RISK_TITLES = ['introduction', 'preamble', 'contact', 'about us', 'definitions'];
const HIGH_RISK_TITLES = ['refund', 'data', 'privacy', 'liability', 'arbitration'];
/**
 * STEP 1: Super Normalization Pipeline
 */
function normalizeForRisk(text) {
    return text
        .toLowerCase()
        .replace(/<[^>]*>/g, '') // Strip HTML tags
        .replace(/[.,!?;:"'()\[\]{}\-–—]/g, ' ') // Remove punctuation except spaces
        .replace(/\s+/g, ' ') // Collapse whitespace
        .trim();
}
/**
 * Extracts concatenated content from added diff segments
 */
function extractAddedContent(details) {
    return details
        .filter((d) => d.added)
        .map((d) => d.value)
        .join(' ');
}
/**
 * Extracts concatenated content from removed diff segments
 */
function extractRemovedContent(details) {
    return details
        .filter((d) => d.removed)
        .map((d) => d.value)
        .join(' ');
}
/**
 * STEP 2: Proximity Clustering
 * If a verb appears within 5 tokens of a noun, return true.
 *
 * God-Level Accuracy: Negation awareness.
 * If a negation word appears within 3 tokens before a verb,
 * the cluster is neutralized for that verb.
 */
function detectTransferCluster(text) {
    const normalized = normalizeForRisk(text);
    const tokens = normalized.split(' ');
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const isVerb = TRANSFER_VERBS.includes(token);
        if (isVerb) {
            // Check for negation before the verb (up to 3 tokens back)
            let isNegated = false;
            for (let k = Math.max(0, i - 3); k < i; k++) {
                if (NEGATION_WORDS.includes(tokens[k])) {
                    isNegated = true;
                    break;
                }
            }
            if (!isNegated) {
                // Look ahead up to 5 tokens for a noun
                for (let j = i + 1; j <= i + 5 && j < tokens.length; j++) {
                    if (SENSITIVE_NOUNS.includes(tokens[j]))
                        return true;
                }
                // Look behind up to 5 tokens for a noun
                for (let j = Math.max(0, i - 5); j < i; j++) {
                    if (SENSITIVE_NOUNS.includes(tokens[j]))
                        return true;
                }
            }
        }
    }
    return false;
}
/**
 * STEP 4: Negation Shift Detection
 */
function detectNegationShift(removedContent, addedContent) {
    const normalizedRemoved = normalizeForRisk(removedContent);
    const removedTokens = normalizedRemoved.split(' ');
    const hasNegationRemoved = NEGATION_WORDS.some((word) => removedTokens.includes(word));
    if (!hasNegationRemoved)
        return false;
    return detectTransferCluster(addedContent);
}
/**
 * STEP 5: Lightweight Stemming (Root-based matching)
 */
function scanForRoots(content, roots) {
    const normalized = normalizeForRisk(content);
    return roots.some((root) => normalized.includes(root));
}
function detectHighRisk(content) {
    return scanForRoots(content, HIGH_RISK_ROOTS);
}
function detectMediumRisk(content) {
    return scanForRoots(content, MEDIUM_RISK_ROOTS);
}
/**
 * STEP 3: Contextual Multiplier Matrix
 */
function applySectionMultiplier(baseRisk, sectionTitle) {
    if (baseRisk === 'HIGH')
        return 'HIGH';
    if (baseRisk === 'LOW')
        return 'LOW';
    const normalizedTitle = (0, differ_service_1.normalizeText)(sectionTitle);
    let multiplier = 1.0;
    for (const [key, value] of Object.entries(SECTION_MULTIPLIER)) {
        if (normalizedTitle.includes(key)) {
            multiplier = value;
            break;
        }
    }
    if (baseRisk === 'MEDIUM') {
        if (multiplier >= 2.0)
            return 'HIGH';
        if (multiplier < 1.0)
            return 'LOW';
    }
    return baseRisk;
}
function detectTitleRisk(title) {
    const lowerTitle = title.toLowerCase();
    if (HIGH_RISK_TITLES.some((keyword) => lowerTitle.includes(keyword))) {
        return 'HIGH';
    }
    return 'MEDIUM';
}
/**
 * Evaluates risk for a specific section change following Risk Engine V2 rules.
 */
function evaluateRiskForSectionV2(change, newSections, oldSections) {
    if (change.type === 'TITLE_RENAMED') {
        return {
            ...change,
            risk: 'LOW',
            reason: 'Section title renamed with identical content',
        };
    }
    if (change.type === 'DELETED') {
        const { section } = change;
        const deletedContent = oldSections.find((s) => s.title === section)?.content || '';
        // STEP 6: Structural Erosion Detection
        let highTriggerCount = 0;
        // Trigger 1: Proximity Cluster in deleted content
        if (detectTransferCluster(deletedContent))
            highTriggerCount++;
        // Trigger 2: High risk roots in deleted content
        if (detectHighRisk(deletedContent))
            highTriggerCount++;
        // Trigger 3: High risk title
        if (detectTitleRisk(section) === 'HIGH')
            highTriggerCount++;
        if (highTriggerCount >= 3) {
            return { ...change, risk: 'HIGH', reason: 'Critical high-risk section removed' };
        }
        const titleRisk = detectTitleRisk(section);
        if (titleRisk === 'HIGH') {
            return { ...change, risk: 'HIGH', reason: 'Critical section removed' };
        }
        const normalizedTitle = (0, differ_service_1.normalizeText)(section);
        const isLowRiskRemoval = LOW_RISK_TITLES.some((title) => normalizedTitle.includes(title));
        if (isLowRiskRemoval) {
            return { ...change, risk: 'LOW', reason: 'Low-impact informational section removed' };
        }
        return { ...change, risk: 'MEDIUM', reason: 'Standard removal' };
    }
    if (change.type === 'ADDED' || change.type === 'MODIFIED') {
        const { section } = change;
        const sectionContent = newSections.find((s) => s.title === section)?.content || '';
        const addedContent = change.type === 'MODIFIED' ? extractAddedContent(change.details) : sectionContent;
        const removedContent = change.type === 'MODIFIED' ? extractRemovedContent(change.details) : '';
        // STEP 7: New Risk Evaluation Order
        // 1. Negation Shift Detection (MODIFIED only)
        if (change.type === 'MODIFIED' && detectNegationShift(removedContent, addedContent)) {
            return {
                ...change,
                risk: 'HIGH',
                reason: 'Negation removed near high-risk clause',
            };
        }
        // 2. Transfer Proximity Cluster
        if (detectTransferCluster(addedContent)) {
            return {
                ...change,
                risk: 'HIGH',
                reason: 'High-risk data transfer cluster detected',
            };
        }
        // 3. HIGH keyword root match
        if (detectHighRisk(addedContent) || detectHighRisk(sectionContent)) {
            return {
                ...change,
                risk: 'HIGH',
                reason: 'High risk keyword root detected',
            };
        }
        // 4. MEDIUM keyword match
        let baseRisk = 'LOW';
        let reason = 'Minor wording change';
        if (detectMediumRisk(addedContent) || detectMediumRisk(sectionContent)) {
            baseRisk = 'MEDIUM';
            reason = 'Medium risk keyword root detected';
        }
        // 5. Section Multiplier Adjustment
        const finalRisk = applySectionMultiplier(baseRisk, section);
        if (finalRisk !== baseRisk) {
            reason = `Risk adjusted by section multiplier: ${finalRisk}`;
        }
        // Section-based LOW must never suppress HIGH/MEDIUM if they were already detected
        // but here we use the multiplier logic which explicitly allows downgrading MEDIUM to LOW
        // for specific sections like "contact".
        // Final fallback to section-based LOW if still LOW
        if (finalRisk === 'LOW' && baseRisk === 'LOW') {
            const normalizedTitle = (0, differ_service_1.normalizeText)(section);
            if (LOW_RISK_TITLES.some((title) => normalizedTitle.includes(title))) {
                reason = 'Section-based low risk classification';
            }
        }
        return {
            ...change,
            risk: finalRisk,
            reason,
        };
    }
    const _exhaustiveCheck = change;
    return _exhaustiveCheck;
}
function analyzeRisk(changes, newSections, oldSections = []) {
    const riskedChanges = changes.map((change) => evaluateRiskForSectionV2(change, newSections, oldSections));
    let overallRisk = 'LOW';
    if (riskedChanges.some((c) => c.risk === 'HIGH')) {
        overallRisk = 'HIGH';
    }
    else if (riskedChanges.some((c) => c.risk === 'MEDIUM')) {
        overallRisk = 'MEDIUM';
    }
    return {
        risk_level: overallRisk,
        changes: riskedChanges,
    };
}
