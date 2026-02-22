import { maskTemporalNoise } from './dateMasker';
import { generateDateMaskedHash } from '../services/hash.service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runTests() {
  console.log('Running Temporal Noise Masking Tests...');

  const MASK = '__DATE_MASK__';

  // 1. Only date changed -> same mask
  const d1 = 'Last Updated: January 1, 2024';
  const d2 = 'Last Updated: February 2, 2025';
  assert(maskTemporalNoise(d1) === MASK, 'Month format masking failed');
  assert(maskTemporalNoise(d2) === MASK, 'Month format masking failed (2)');
  assert(generateDateMaskedHash(d1) === generateDateMaskedHash(d2), 'Hash should be identical for different dates');

  // 2. ISO format
  const iso = 'Effective Date: 2024-01-01';
  assert(maskTemporalNoise(iso) === MASK, 'ISO format masking failed');

  // 3. Slash format
  const slash = 'Revised: 01/02/2024';
  assert(maskTemporalNoise(slash) === MASK, 'Slash format masking failed');

  // 4. Date + real text change -> different hash
  const t1 = 'Updated: January 1, 2024. We collect emails.';
  const t2 = 'Updated: February 2, 2025. We collect phone numbers.';
  assert(generateDateMaskedHash(t1) !== generateDateMaskedHash(t2), 'Hash should be different when text changes');

  // 5. Monetary values -> must NOT be masked
  const money = 'The fee is $2024.01 per month.';
  assert(maskTemporalNoise(money).includes('$2024.01'), 'Monetary value should NOT be masked');

  // 6. Percentages -> must NOT be masked
  const percent = 'Usage increased by 20.24%.';
  assert(maskTemporalNoise(percent).includes('20.24%'), 'Percentage should NOT be masked');

  // 7. Date embedded inside paragraph
  const para = 'On January 1, 2024 we changed our terms. This is final.';
  assert(maskTemporalNoise(para).includes(MASK), 'Embedded date masking failed');

  // 8. Non-date numeric sequence
  const nums = 'Serial number 123-456-7890 is active.';
  assert(!maskTemporalNoise(nums).includes(MASK), 'Non-date sequence should NOT be masked');

  console.log('All Temporal Noise Masking Tests Passed.');
}

runTests();
