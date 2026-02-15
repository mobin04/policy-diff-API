import { fetchPage } from '../utils/fetchPage';
import { savePage } from '../repositories/page.repository';

export async function checkPage(url: string) {
  const content = await fetchPage(url);
  console.log(content);

  await savePage(url, content);

  return { message: 'Page snapshot saved' };
}
