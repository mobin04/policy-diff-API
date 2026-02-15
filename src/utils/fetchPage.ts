import axios from 'axios';

export async function fetchPage(url: string): Promise<string> {
  const res = await axios.get(url, { timeout: 5000 });
  return res.data;
}
