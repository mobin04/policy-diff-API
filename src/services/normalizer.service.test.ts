import { normalizeContent } from './normalizer.service';

/**
 * Structural Normalization Unit Tests
 *
 * Assertions are based on canonical Markdown-like strings.
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runTests() {
  console.log('Running Structural Normalization Tests...');

  // 1. Table single row
  const tableSingle = '<table><tr><th>Plan</th><th>Price</th></tr></table>';
  const out1 = normalizeContent(tableSingle);
  assert(out1.includes('| Plan | Price |'), 'Table single row canonicalization failed');

  // 2. Table multiple rows
  const tableMulti = `
    <table>
      <tr><th>Plan</th><th>Price</th></tr>
      <tr><td>Basic</td><td>$9</td></tr>
    </table>
  `;
  const out2 = normalizeContent(tableMulti);
  assert(out2.includes('| Plan | Price |') && out2.includes('| Basic | $9 |'), 'Table multiple rows failed');

  // 3. List unordered
  const listUnordered = '<ul><li>Item 1</li><li>Item 2</li></ul>';
  const out3 = normalizeContent(listUnordered);
  assert(out3.includes('- Item 1') && out3.includes('- Item 2'), 'Unordered list failed');

  // 4. List ordered
  const listOrdered = '<ol><li>Step 1</li><li>Step 2</li></ol>';
  const out4 = normalizeContent(listOrdered);
  assert(out4.includes('1. Step 1') && out4.includes('2. Step 2'), 'Ordered list failed');

  // 5. Nested list
  const listNested = `
    <ul>
      <li>Parent
        <ul>
          <li>Child</li>
        </ul>
      </li>
    </ul>
  `;
  const out5 = normalizeContent(listNested);
  assert(out5.includes('- Parent') && out5.includes('  - Child'), 'Nested list indentation failed');

  // 6. Mixed table + list
  const mixed = `
    <table><tr><td>Cell</td></tr></table>
    <ul><li>List</li></ul>
  `;
  const out6 = normalizeContent(mixed);
  assert(out6.includes('| Cell |') && out6.includes('- List'), 'Mixed content failed');

  console.log('All Structural Normalization Tests Passed.');
}

// Run if called directly via ts-node
if (require.main === module) {
  runTests();
}

export { runTests };
