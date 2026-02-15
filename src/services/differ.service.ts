import { Section, Change } from '../types';

export function diffSections(oldSections: Section[], newSections: Section[]): Change[] {
  const changes: Change[] = [];
  const oldMap = new Map(oldSections.map((s) => [s.title, s.content]));
  const newMap = new Map(newSections.map((s) => [s.title, s.content]));

  // Check for ADDED and MODIFIED
  for (const newSection of newSections) {
    const oldContent = oldMap.get(newSection.title);

    if (oldContent === undefined) {
      changes.push({ section: newSection.title, type: 'ADDED' });
    } else if (oldContent !== newSection.content) {
      changes.push({ section: newSection.title, type: 'MODIFIED' });
    }
  }

  // Check for REMOVED
  for (const oldSection of oldSections) {
    if (!newMap.has(oldSection.title)) {
      changes.push({ section: oldSection.title, type: 'REMOVED' });
    }
  }

  return changes;
}
