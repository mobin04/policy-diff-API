import { canonicalizeUrl } from '../canonicalizeUrl';

describe('canonicalizeUrl', () => {
  test('should force public http URLs to https', () => {
    expect(canonicalizeUrl('http://Example.com/privacy?utm=test#section')).toBe('https://example.com/privacy');
  });

  test('should preserve http for localhost URLs', () => {
    expect(canonicalizeUrl('http://127.0.0.1:9000/privacy.html')).toBe('http://127.0.0.1:9000/privacy.html');
    expect(canonicalizeUrl('http://localhost:9000/privacy.html')).toBe('http://localhost:9000/privacy.html');
  });

  test('should preserve http for private network URLs', () => {
    expect(canonicalizeUrl('http://192.168.1.33:9000/privacy.html')).toBe(
      'http://192.168.1.33:9000/privacy.html',
    );
  });
});
