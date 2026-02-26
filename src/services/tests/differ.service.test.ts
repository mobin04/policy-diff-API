import { diffSections } from '../differ.service';
import { Section, Change } from '../../types';

/**
 * Structural Diff Engine Unit Tests
 *
 * Includes Pass 3B (TITLE_RENAMED) validation
 */

describe('Structural Diff Engine Tests', () => {
  // 1. Title changed, content identical -> TITLE_RENAMED
  test('should detect TITLE_RENAMED when content is identical but title changed', () => {
    const oldSections: Section[] = [{ title: 'Privacy Policy', content: 'We value your privacy.', hash: 'hash1' }];
    const newSections: Section[] = [
      { title: 'Data Protection Policy', content: 'We value your privacy.', hash: 'hash1' },
    ];
    const changes = diffSections(oldSections, newSections);

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('TITLE_RENAMED');

    if (changes[0].type === 'TITLE_RENAMED') {
      expect(changes[0].oldTitle).toBe('Privacy Policy');
      expect(changes[0].newTitle).toBe('Data Protection Policy');
      expect(changes[0].contentHash).toBe('hash1');
    }
  });

  // 2. Title changed, content different -> MODIFIED (via fuzzy) or DELETED+ADDED
  // If similarity < 0.85 and hash different -> DELETED + ADDED
  test('should detect DELETED and ADDED when title changed and content different (low similarity)', () => {
    const oldSections: Section[] = [{ title: 'Introduction', content: 'Old content', hash: 'hash-old' }];
    const newSections: Section[] = [{ title: 'Overview', content: 'New content', hash: 'hash-new' }];
    const changes = diffSections(oldSections, newSections);

    // 'Introduction' vs 'Overview' similarity is low
    expect(
      changes.some(
        (c) => c.type === 'DELETED' && (c as Extract<Change, { type: 'DELETED' }>).section === 'Introduction',
      ),
    ).toBe(true);
    expect(
      changes.some((c) => c.type === 'ADDED' && (c as Extract<Change, { type: 'ADDED' }>).section === 'Overview'),
    ).toBe(true);
  });

  // 3. Two sections swap names (no exact title overlap) but identical content -> deterministic one-to-one mapping
  test('should detect swapped names with identical content as TITLE_RENAMED', () => {
    const oldSections: Section[] = [
      { title: 'Old Section A', content: 'Content 1', hash: 'h1' },
      { title: 'Old Section B', content: 'Content 2', hash: 'h2' },
    ];
    const newSections: Section[] = [
      { title: 'New Section B', content: 'Content 1', hash: 'h1' },
      { title: 'New Section A', content: 'Content 2', hash: 'h2' },
    ];
    const changes = diffSections(oldSections, newSections);

    // Section A (old) matches Section B (new) via hash h1 -> TITLE_RENAMED
    // Section B (old) matches Section A (new) via hash h2 -> TITLE_RENAMED
    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.type === 'TITLE_RENAMED')).toBe(true);
  });

  // 4. Content identical across multiple sections -> only first deterministic match allowed
  test('should only allow first deterministic match when content is identical across multiple sections', () => {
    const oldSections: Section[] = [
      { title: 'Old 1', content: 'Same', hash: 'same-hash' },
      { title: 'Old 2', content: 'Same', hash: 'same-hash' },
    ];
    const newSections: Section[] = [{ title: 'New 1', content: 'Same', hash: 'same-hash' }];
    const changes = diffSections(oldSections, newSections);

    // New 1 matches Old 1 -> TITLE_RENAMED
    // Old 2 remains -> DELETED
    expect(changes).toHaveLength(2);
    expect(changes.some((c) => c.type === 'TITLE_RENAMED')).toBe(true);
    expect(changes.some((c) => c.type === 'DELETED')).toBe(true);
  });

  // 5. Title minor change that fuzzy would already catch -> must still use fuzzy first
  test('should detect MODIFIED via fuzzy match for minor title changes', () => {
    const oldSections: Section[] = [
      {
        title: 'Data Privacy',
        content: 'This is the old content of the privacy policy.',
        hash: 'h-old',
      },
    ];
    const newSections: Section[] = [
      {
        title: 'Data Privcy', // 'Privacy' vs 'Privcy' is similarity 0.91
        content: 'This is the new content with significant changes.',
        hash: 'h-new',
      },
    ];
    const changes = diffSections(oldSections, newSections);

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('MODIFIED');
  });

  // 6. Numeric token variations ($100 vs $100.00) -> MODIFIED (numeric override)
  test('should detect MODIFIED when only numbers change (numeric override)', () => {
    const oldSections: Section[] = [{ title: 'Pricing', content: 'Entry fee is $100.', hash: 'h1' }];
    const newSections: Section[] = [{ title: 'Pricing', content: 'Entry fee is $100.00.', hash: 'h2' }];
    // Note: extractNumericTokens converts both to '100', so this might NOT be a numeric change
    // but the content hash changed, so it checks meaningful change.
    // Actually $100 vs $100.00 -> tokens are ['$100'] vs ['$10000'] (if comma-parsed)
    // Let's use a clear numeric change: $100 vs $200
    const os2: Section[] = [{ title: 'Pricing', content: 'Cost: $100', hash: 'h1' }];
    const ns2: Section[] = [{ title: 'Pricing', content: 'Cost: $200', hash: 'h2' }];
    const changes = diffSections(os2, ns2);

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('MODIFIED');
  });

  // 7. Section reordering -> should result in no changes (if hashes match)
  test('should detect no changes when sections are reordered', () => {
    const s1 = { title: 'A', content: 'Cont A', hash: 'ha' };
    const s2 = { title: 'B', content: 'Cont B', hash: 'hb' };
    const oldSections: Section[] = [s1, s2];
    const newSections: Section[] = [s2, s1];
    const changes = diffSections(oldSections, newSections);

    expect(changes).toHaveLength(0);
  });

  // 8. Trivial changes (below MEANINGFUL_CHANGE_THRESHOLD) -> no change
  test('should ignore trivial changes below 5% threshold', () => {
    const longContent = 'A'.repeat(1000);
    const oldSections: Section[] = [{ title: 'Long', content: longContent, hash: 'h1' }];
    const newSections: Section[] = [{ title: 'Long', content: longContent + ' (dot)', hash: 'h2' }];
    const changes = diffSections(oldSections, newSections);

    // Hash changed, but ratio is (5/1000) = 0.005 < 0.05
    expect(changes.length).toBe(0);
  });

  // 9. Multi-match collision (Pass 3B collision)
  test('should handle multiple sections with same content deterministically', () => {
    const oldSections: Section[] = [
      { title: 'O1', content: 'Same', hash: 'hs' },
      { title: 'O2', content: 'Same', hash: 'hs' },
    ];
    const newSections: Section[] = [
      { title: 'N1', content: 'Same', hash: 'hs' },
      { title: 'N2', content: 'Same', hash: 'hs' },
    ];
    const changes = diffSections(oldSections, newSections);

    expect(changes.filter((c) => c.type === 'TITLE_RENAMED')).toHaveLength(2);
  });

  // 10. Numeric Override Integrity Hardening
  test('should ignore formatting changes but trigger on value changes', () => {
    // Case A: Formatting only ($1,000 vs $1000) -> NOT meaningful (below threshold)
    const longContent1 = 'A'.repeat(1000) + ' The fee is $1,000.';
    const longContent2 = 'A'.repeat(1000) + ' The fee is $1000.'; // No comma
    const oldSections: Section[] = [{ title: 'Fees', content: longContent1, hash: 'h1' }];
    const newSections: Section[] = [{ title: 'Fees', content: longContent2, hash: 'h2' }];
    
    const changesA = diffSections(oldSections, newSections);
    expect(changesA).toHaveLength(0); // Numeric values are same (1000), ratio < 5%

    // Case B: Value change ($1,000 vs $1,001) -> Meaningful (numeric override)
    const longContent3 = 'A'.repeat(1000) + ' The fee is $1,001.';
    const newSectionsB: Section[] = [{ title: 'Fees', content: longContent3, hash: 'h3' }];
    
    const changesB = diffSections(oldSections, newSectionsB);
    expect(changesB).toHaveLength(1); // Numeric value changed (1000 -> 1001)
    expect(changesB[0].type).toBe('MODIFIED');

    // Case C: Version numbers (1.2.3 vs 1.2.4) -> NOT meaningful (ignored as tokens, ratio < 5%)
    const longContentV1 = 'A'.repeat(1000) + ' Version 1.2.3';
    const longContentV2 = 'A'.repeat(1000) + ' Version 1.2.4';
    const osV: Section[] = [{ title: 'Version', content: longContentV1, hash: 'hv1' }];
    const nsV: Section[] = [{ title: 'Version', content: longContentV2, hash: 'hv2' }];
    
    const changesV = diffSections(osV, nsV);
    expect(changesV).toHaveLength(0);

    // Case D: Identifiers with embedded numbers (v1 vs v2) -> NOT meaningful (ratio < 5%)
    const longContentID1 = 'A'.repeat(1000) + ' Revision v1';
    const longContentID2 = 'A'.repeat(1000) + ' Revision v2';
    const osID: Section[] = [{ title: 'Revision', content: longContentID1, hash: 'hid1' }];
    const nsID: Section[] = [{ title: 'Revision', content: longContentID2, hash: 'hid2' }];
    
    const changesID = diffSections(osID, nsID);
    expect(changesID).toHaveLength(0);
  });

  // 11. Section Matching Instrumentation & Edge Cases
  test('should accurately populate matching metrics and handle edge cases', () => {
    const oldSections: Section[] = [
      { title: 'Privacy Policy', content: 'Content 1', hash: 'h1' },
      { title: 'Terms of Service', content: 'Content 2', hash: 'h2' },
      { title: 'Cookie Policy', content: 'Content 3', hash: 'h3' },
    ];

    const newSections: Section[] = [
      { title: 'Privacy Policy Updated', content: 'Content 1 modified...', hash: 'h1-mod' }, // High confidence fuzzy
      { title: 'Terms of Servic', content: 'Content 2 modified...', hash: 'h2-mod' }, // High confidence fuzzy
      { title: 'Cookie Rules', content: 'Content 3', hash: 'h3' }, // Rename detection
    ];

    const context = { url: 'test-url' };
    const result = diffSections(oldSections, newSections, context) as Change[] & {
      fuzzy_match_count: number;
      low_confidence_fuzzy_match_count: number;
      fuzzy_collision_count: number;
      title_rename_count: number;
    };

    expect(result.fuzzy_match_count).toBe(2);
    expect(result.title_rename_count).toBe(1);
    expect(result.low_confidence_fuzzy_match_count).toBe(0);
    expect(result.fuzzy_collision_count).toBe(0);
  });

  test('should detect fuzzy match collisions and low confidence matches', () => {
    // FORCE COLLISION: 'ABCDEFX' matches both 'ABCDEFG' and 'ABCDEFH' with same distance
    const os: Section[] = [
      { title: 'ABCDEFG', content: 'C1', hash: 'h1' },
      { title: 'ABCDEFH', content: 'C2', hash: 'h2' },
    ];
    const ns: Section[] = [
      { title: 'ABCDEFX', content: 'C1 mod', hash: 'h1-mod' },
    ];
    // Similarity: 1 - 1/7 = 0.857 (Low confidence: 0.85-0.89)
    
    const result = diffSections(os, ns, { url: 'test' }) as any;
    expect(result.fuzzy_match_count).toBe(1);
    expect(result.fuzzy_collision_count).toBe(1);
    expect(result.low_confidence_fuzzy_match_count).toBe(1);
  });

  test('should prioritize exact match over rename detection', () => {
    const os: Section[] = [
      { title: 'Exact Title', content: 'Old Content', hash: 'h1' },
      { title: 'Other Title', content: 'Target Content', hash: 'h2' },
    ];
    const ns: Section[] = [
      { title: 'Exact Title', content: 'New Content', hash: 'h3' },
      { title: 'New Title', content: 'Target Content', hash: 'h2' },
    ];

    const result = diffSections(os, ns) as any;
    // 'Exact Title' matches Pass 1 (Exact Title)
    // 'New Title' matches Pass 3B (Rename)
    expect(result.filter((c: any) => c.type === 'MODIFIED')).toHaveLength(1);
    expect(result.filter((c: any) => c.type === 'TITLE_RENAMED')).toHaveLength(1);
    expect(result.title_rename_count).toBe(1);
  });
});
