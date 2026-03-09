"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
const differ_service_1 = require("./differ.service");
/**
 * Structural Diff Engine Unit Tests
 *
 * Includes Pass 3B (TITLE_RENAMED) validation
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion Failed: ${message}`);
    }
}
function runTests() {
    console.log('Running Structural Diff Engine Tests...');
    // 1. Title changed, content identical -> TITLE_RENAMED
    const oldSections1 = [{ title: 'Privacy Policy', content: 'We value your privacy.', hash: 'hash1' }];
    const newSections1 = [
        { title: 'Data Protection Policy', content: 'We value your privacy.', hash: 'hash1' },
    ];
    const changes1 = (0, differ_service_1.diffSections)(oldSections1, newSections1);
    assert(changes1.length === 1, 'Should have 1 change');
    assert(changes1[0].type === 'TITLE_RENAMED', 'Should be TITLE_RENAMED');
    if (changes1[0].type === 'TITLE_RENAMED') {
        assert(changes1[0].oldTitle === 'Privacy Policy', 'Old title mismatch');
        assert(changes1[0].newTitle === 'Data Protection Policy', 'New title mismatch');
        assert(changes1[0].contentHash === 'hash1', 'Hash mismatch');
    }
    // 2. Title changed, content different -> MODIFIED (via fuzzy) or DELETED+ADDED
    // If similarity < 0.85 and hash different -> DELETED + ADDED
    const oldSections2 = [{ title: 'Introduction', content: 'Old content', hash: 'hash-old' }];
    const newSections2 = [{ title: 'Overview', content: 'New content', hash: 'hash-new' }];
    const changes2 = (0, differ_service_1.diffSections)(oldSections2, newSections2);
    // 'Introduction' vs 'Overview' similarity is low
    assert(changes2.some((c) => c.type === 'DELETED' && c.section === 'Introduction'), 'Should have DELETED Introduction');
    assert(changes2.some((c) => c.type === 'ADDED' && c.section === 'Overview'), 'Should have ADDED Overview');
    // 3. Two sections swap names (no exact title overlap) but identical content -> deterministic one-to-one mapping
    const oldSections3 = [
        { title: 'Old Section A', content: 'Content 1', hash: 'h1' },
        { title: 'Old Section B', content: 'Content 2', hash: 'h2' },
    ];
    const newSections3 = [
        { title: 'New Section B', content: 'Content 1', hash: 'h1' },
        { title: 'New Section A', content: 'Content 2', hash: 'h2' },
    ];
    const changes3 = (0, differ_service_1.diffSections)(oldSections3, newSections3);
    // Section A (old) matches Section B (new) via hash h1 -> TITLE_RENAMED
    // Section B (old) matches Section A (new) via hash h2 -> TITLE_RENAMED
    assert(changes3.length === 2, 'Should have 2 renames');
    assert(changes3.every((c) => c.type === 'TITLE_RENAMED'), 'All should be TITLE_RENAMED');
    // 4. Content identical across multiple sections -> only first deterministic match allowed
    const oldSections4 = [
        { title: 'Old 1', content: 'Same', hash: 'same-hash' },
        { title: 'Old 2', content: 'Same', hash: 'same-hash' },
    ];
    const newSections4 = [{ title: 'New 1', content: 'Same', hash: 'same-hash' }];
    const changes4 = (0, differ_service_1.diffSections)(oldSections4, newSections4);
    // New 1 matches Old 1 -> TITLE_RENAMED
    // Old 2 remains -> DELETED
    assert(changes4.length === 2, 'Should have 2 changes (rename + delete)');
    assert(changes4.some((c) => c.type === 'TITLE_RENAMED'), 'Should have rename');
    assert(changes4.some((c) => c.type === 'DELETED'), 'Should have delete');
    // 5. Title minor change that fuzzy would already catch -> must still use fuzzy first
    const oldSections5 = [
        {
            title: 'Data Privacy',
            content: 'This is the old content of the privacy policy.',
            hash: 'h-old',
        },
    ];
    const newSections5 = [
        {
            title: 'Data Privacies',
            content: 'This is the new content with significant changes.',
            hash: 'h-new',
        },
    ];
    const changes5 = (0, differ_service_1.diffSections)(oldSections5, newSections5);
    // Similarity between 'Data Privacy' and 'Data Privacies' is > 0.85
    // Should be MODIFIED, not TITLE_RENAMED (since hashes differ)
    assert(changes5.length === 1, 'Should have 1 change');
    assert(changes5[0].type === 'MODIFIED', 'Should be MODIFIED via fuzzy match');
    console.log('All Structural Diff Engine Tests Passed.');
}
// Run tests
runTests();
