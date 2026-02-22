import { maskTemporalNoise } from './dateMasker';
import { generateDateMaskedHash } from '../services/hash.service';

/**
 * Mandatory Test Cases (Context-Aware Temporal Noise Masking V2)
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runTests() {
  console.log('Running V2 Temporal Noise Masking Tests...');

  const DATE_TOKEN = '__DATE_TOKEN__';

  // A. Date-only change
  const d1 = 'Last Updated: March 1, 2026';
  const d2 = 'Last Updated: April 5, 2026';
  assert(maskTemporalNoise(d1) === 'Last Updated: __DATE_TOKEN__', 'Date-only masking failed');
  assert(maskTemporalNoise(d2) === 'Last Updated: __DATE_TOKEN__', 'Date-only masking failed (2)');
  assert(generateDateMaskedHash(maskTemporalNoise(d1)) === generateDateMaskedHash(maskTemporalNoise(d2)), 'Hash equality failed');

  // B. Expiration date (No anchor)
  const expiration = 'Authorization expires on 2026-05-20';
  assert(!maskTemporalNoise(expiration).includes(DATE_TOKEN), 'Expiration date should NOT be masked');

  // C. Version number
  const version = 'Policy Version 2.2.0';
  assert(!maskTemporalNoise(version).includes(DATE_TOKEN), 'Version number should NOT be masked');

  // D. Mixed sentence
  const mixed = 'Version 2.0 updated March 1, 2026';
  const maskedMixed = maskTemporalNoise(mixed);
  assert(maskedMixed === 'Version 2.0 updated __DATE_TOKEN__', 'Mixed sentence masking failed');
  assert(maskedMixed.includes('2.0'), 'Version number in mixed sentence should be preserved');

  // E. Numeric non-date
  const money = 'Total cost is $19.99';
  assert(!maskTemporalNoise(money).includes(DATE_TOKEN), 'Numeric non-date ($19.99) should NOT be masked');

  // F. Percentage
  const percent = 'Usage limit is 10%';
  assert(!maskTemporalNoise(percent).includes(DATE_TOKEN), 'Percentage (10%) should NOT be masked');

  // G. Multiple dates in one document (Scoped to anchors)
  const multi = 'Effective Date: 2025-01-01. Then nothing happens until 2026-01-01, which is when something happens. Revised on May 10th, 2025.';
  const maskedMulti = maskTemporalNoise(multi);
  assert(maskedMulti.includes('Effective Date: __DATE_TOKEN__'), 'First anchor date failed');
  assert(maskedMulti.includes('2026-01-01'), 'Date without anchor should not be masked');
  assert(maskedMulti.includes('Revised on __DATE_TOKEN__'), 'Second anchor date failed');

  // H. Multi-format verification
  const iso = 'published: 2024-12-01';
  const numeric = 'date: 12/01/2024';
  assert(maskTemporalNoise(iso).includes(DATE_TOKEN), 'ISO format anchor masking failed');
  assert(maskTemporalNoise(numeric).includes(DATE_TOKEN), 'Numeric format anchor masking failed');

  console.log('All V2 Temporal Noise Masking Tests Passed.');
}

try {
  runTests();
} catch (e) {
  console.error(e);
  process.exit(1);
}
