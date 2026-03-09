"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSnapshot = processSnapshot;
const mainContentExtractor_1 = require("../utils/mainContentExtractor");
const dateMasker_1 = require("../utils/dateMasker");
const normalizer_service_1 = require("./normalizer.service");
const sectionExtractor_service_1 = require("./sectionExtractor.service");
const hash_service_1 = require("./hash.service");
const riskEngine_service_1 = require("./riskEngine.service");
function processSnapshot(rawHtml) {
    // 1. Isolate main content
    const isolationResult = (0, mainContentExtractor_1.extractMainContent)(rawHtml);
    const isolatedContent = isolationResult.content;
    // 2. Identify and mask temporal noise
    const maskedContent = (0, dateMasker_1.maskTemporalNoise)(isolatedContent);
    // 3. Normalize structures (tables, lists, HTML cleaning)
    // normalizeHtml internally performs TemporalNoise masking again, which is idempotent
    const normalizedContentHtml = (0, normalizer_service_1.normalizeHtml)(isolatedContent);
    // 4. Extract section structures with content & hash
    const extractedSections = (0, sectionExtractor_service_1.extractSections)(normalizedContentHtml);
    // 5. Generate global hash from the fully normalized text representation
    const fullyNormalizedTextContent = (0, normalizer_service_1.normalizeContent)(isolatedContent);
    const globalHash = (0, hash_service_1.generateDateMaskedHash)(fullyNormalizedTextContent);
    // 6. Risk evaluation using mock 'ADDED' changes to force full document analysis
    const fullDocumentChanges = extractedSections.map((s) => ({
        type: 'ADDED',
        section: s.title,
    }));
    const riskResult = (0, riskEngine_service_1.analyzeRisk)(fullDocumentChanges, extractedSections, []);
    // Ensure stable ordering by sorting sections alphabetically by title
    // This explicitly guarantees that section array drift does not occur due to DOM rearrangement
    const stableSections = extractedSections
        .map((s) => ({
        title: s.title,
        content: s.content,
        contentHash: s.hash,
    }))
        .sort((a, b) => a.title.localeCompare(b.title) || a.contentHash.localeCompare(b.contentHash));
    return {
        normalizedContent: normalizedContentHtml,
        isolatedContent,
        maskedContent,
        sections: stableSections,
        globalHash,
        riskLevel: riskResult.risk_level,
    };
}
