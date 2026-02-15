import { fetchPage } from '../utils/fetchPage';
import { savePage } from '../repositories/page.repository';
import { normalizeContent } from './normalizer.service';
import { generateHash } from '../utils/hash';

export async function checkPage(url: string) {
  const rawHtml = await fetchPage(url);
  const normalizedContent = normalizeContent(rawHtml);
  console.log('✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨');
  console.log(normalizedContent);
  const contentHash = generateHash(normalizedContent);

  const result = await savePage(url, normalizedContent, contentHash);

  if (result.changed) {
    return { message: 'New version stored' };
  } else {
    return { message: 'No meaningful change detected' };
  }
}
