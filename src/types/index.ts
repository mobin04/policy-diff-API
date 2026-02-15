export type Section = {
  title: string;
  content: string;
};

export type ChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export type Change = {
  section: string;
  type: ChangeType;
};

export type DiffResult = {
  message: string;
  changes?: Change[];
};
