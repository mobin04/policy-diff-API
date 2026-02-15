import { checkPage } from '../services/page.service';

export async function checkController(req: any) {
  const { url } = req.body;

  return await checkPage(url);
}
