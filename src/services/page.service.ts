import { fetchPage } from '../utils/fetchPage';
import { savePage } from '../repositories/page.repository';
import { normalizeContent } from './normalizer.service';
import { extractSections } from './sectionExtractor.service';
import { generateHash } from '../utils/hash';
import { DiffResult } from '../types';

export async function checkPage(url: string): Promise<DiffResult> {
  const rawHtml = await fetchPage(url);
  const normalizedContent = normalizeContent(rawHtml);
  const sections = extractSections(rawHtml);
  const contentHash = generateHash(normalizedContent);
  const result = await savePage(url, normalizedContent, contentHash, sections);

  if (result.status === 'first_version') {
    return { message: 'First snapshot stored' };
  } else if (result.status === 'unchanged') {
    return { message: 'No meaningful change detected' };
  } else {
    return {
      message: 'Changes detected',
      changes: result.changes,
    };
  }
}
