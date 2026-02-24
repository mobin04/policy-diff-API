import { extractMainContent } from '../utils/mainContentExtractor';
import { maskTemporalNoise } from '../utils/dateMasker';
import { normalizeHtml, normalizeContent } from './normalizer.service';
import { extractSections } from './sectionExtractor.service';
import { generateDateMaskedHash } from './hash.service';
import { analyzeRisk } from './riskEngine.service';
import { Change, Section } from '../types';

export type SnapshotPipelineResult = {
  normalizedContent: string;
  isolatedContent: string;
  maskedContent: string;
  sections: {
    title: string;
    content: string;
    contentHash: string;
  }[];
  globalHash: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
};

export function processSnapshot(rawHtml: string): SnapshotPipelineResult {
  // 1. Isolate main content
  const isolationResult = extractMainContent(rawHtml);
  const isolatedContent = isolationResult.html;

  // 2. Identify and mask temporal noise
  const maskedContent = maskTemporalNoise(isolatedContent);

  // 3. Normalize structures (tables, lists, HTML cleaning)
  // normalizeHtml internally performs TemporalNoise masking again, which is idempotent
  const normalizedContentHtml = normalizeHtml(isolatedContent);

  // 4. Extract section structures with content & hash
  const extractedSections: Section[] = extractSections(normalizedContentHtml);

  // 5. Generate global hash from the fully normalized text representation
  const fullyNormalizedTextContent = normalizeContent(isolatedContent);
  const globalHash = generateDateMaskedHash(fullyNormalizedTextContent);

  // 6. Risk evaluation using mock 'ADDED' changes to force full document analysis
  const fullDocumentChanges: Change[] = extractedSections.map((s) => ({
    type: 'ADDED',
    section: s.title,
  }));
  const riskResult = analyzeRisk(fullDocumentChanges, extractedSections);

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
