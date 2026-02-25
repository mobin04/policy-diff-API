import { normalizeContent } from '../normalizer.service';

/**
 * Structural Normalization Unit Tests
 *
 * Assertions are based on canonical Markdown-like strings.
 */

describe('Structural Normalization Tests', () => {
  // 1. Table single row
  test('should normalize single row table', () => {
    const tableSingle = '<table><tr><th>Plan</th><th>Price</th></tr></table>';
    const out = normalizeContent(tableSingle);
    expect(out).toContain('| Plan | Price |');
  });

  // 2. Table multiple rows
  test('should normalize multiple row table', () => {
    const tableMulti = `
      <table>
        <tr><th>Plan</th><th>Price</th></tr>
        <tr><td>Basic</td><td>$9</td></tr>
      </table>
    `;
    const out = normalizeContent(tableMulti);
    expect(out).toContain('| Plan | Price |');
    expect(out).toContain('| Basic | $9 |');
  });

  // 3. List unordered
  test('should normalize unordered list', () => {
    const listUnordered = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const out = normalizeContent(listUnordered);
    expect(out).toContain('- Item 1');
    expect(out).toContain('- Item 2');
  });

  // 4. List ordered
  test('should normalize ordered list', () => {
    const listOrdered = '<ol><li>Step 1</li><li>Step 2</li></ol>';
    const out = normalizeContent(listOrdered);
    expect(out).toContain('1. Step 1');
    expect(out).toContain('2. Step 2');
  });

  // 5. Nested list
  test('should normalize nested list with indentation', () => {
    const listNested = `
      <ul>
        <li>Parent
          <ul>
            <li>Child</li>
          </ul>
        </li>
      </ul>
    `;
    const out = normalizeContent(listNested);
    expect(out).toContain('- Parent');
    expect(out).toContain('  - Child');
  });

  // 6. Mixed table + list
  test('should normalize mixed content (table + list)', () => {
    const mixed = `
      <table><tr><td>Cell</td></tr></table>
      <ul><li>List</li></ul>
    `;
    const out = normalizeContent(mixed);
    expect(out).toContain('| Cell |');
    expect(out).toContain('- List');
  });

  // 7. Empty table and list
  test('should handle empty table and list', () => {
    const empty = '<table></table><ul></ul>';
    const out = normalizeContent(empty);
    expect(out).toBe('');
  });

  // 8. Deeply nested list (5 levels)
  test('should normalize deeply nested lists', () => {
    const deep = `
      <ul>
        <li>Level 1
          <ul>
            <li>Level 2
              <ul>
                <li>Level 3
                  <ul>
                    <li>Level 4
                      <ul>
                        <li>Level 5</li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    `;
    const out = normalizeContent(deep);
    expect(out).toContain('- Level 1');
    expect(out).toContain('  - Level 2');
    expect(out).toContain('    - Level 3');
    expect(out).toContain('      - Level 4');
    expect(out).toContain('        - Level 5');
  });

  // 9. Non-standard whitespace (tabs, NBSP)
  test('should normalize non-standard whitespace', () => {
    const nonStd = '<ul><li>Item&nbsp;1</li><li>Item\t2</li></ul>';
    const out = normalizeContent(nonStd);
    // NBSP (\xA0) should be converted to space by .text() or our normalization
    expect(out).toContain('- Item 1');
    expect(out).toContain('- Item 2');
  });

  // 10. Removal of script and style tags
  test('should remove script and style tags', () => {
    const dirty = `
      <style>.bad { color: red; }</style>
      <script>alert("hack");</script>
      <p>Clean Content</p>
    `;
    const out = normalizeContent(dirty);
    expect(out).toBe('Clean Content');
    expect(out).not.toContain('.bad');
    expect(out).not.toContain('alert');
  });
});
