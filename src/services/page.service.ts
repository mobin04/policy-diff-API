import { fetchPage } from '../utils/fetchPage';
import { savePage } from '../repositories/page.repository';
import { normalizeContent } from './normalizer.service';
import { extractSections } from './sectionExtractor.service';
import { generateHash } from '../utils/hash';
import { canonicalizeUrl } from '../utils/canonicalizeUrl';
import { DiffResult } from '../types';
import { analyzeRisk } from './riskEngine.service';

/**
 * Logger interface for debug output
 */
type Logger = {
  debug: (obj: object, msg: string) => void;
};

/**
 * Check a page for policy changes
 *
 * WHY CANONICALIZATION MUST HAPPEN BEFORE DB LOOKUP:
 * Without it, URL variants create duplicate page records, causing
 * the "first snapshot" bug where the same page appears as new.
 *
 * @param rawUrl - User-provided URL (will be canonicalized)
 * @param logger - Optional logger for debug tracing
 * @returns DiffResult with status and any detected changes
 */
export async function checkPage(rawUrl: string, logger?: Logger): Promise<DiffResult> {
  // CRITICAL: Canonicalize URL BEFORE any database operation
  // This ensures consistent identity regardless of URL variants:
  // - Different casing: Example.com → example.com
  // - Trailing slashes: /privacy/ → /privacy
  // - Query params: ?utm=test → removed
  // - Protocol: http → https
  const canonicalUrl = canonicalizeUrl(rawUrl);

  // Debug logging for URL canonicalization tracing
  if (logger) {
    logger.debug({ rawUrl, canonicalUrl }, 'URL canonicalized');
  }

  // Fetch using canonical URL
  const rawHtml = await fetchPage(canonicalUrl);
  const normalizedContent = normalizeContent(rawHtml);
  const sections = extractSections(rawHtml);
  const contentHash = generateHash(normalizedContent);

  // Save using ONLY the canonical URL - never the raw input
  const result = await savePage(canonicalUrl, normalizedContent, contentHash, sections);

  // Debug logging for page identity tracing
  if (logger) {
    logger.debug(
      {
        canonicalUrl,
        pageId: result.pageId,
        status: result.status,
      },
      'Page processed',
    );
  }

  if (result.status === 'first_version') {
    return { message: 'First snapshot stored' };
  } else if (result.status === 'unchanged') {
    return { message: 'No meaningful change detected' };
  } else {
    const changes = result.changes || [];
    const riskAnalysis = analyzeRisk(changes, sections);

    return {
      message: 'Changes detected',
      risk_level: riskAnalysis.risk_level,
      changes: riskAnalysis.changes,
    };
  }
}
