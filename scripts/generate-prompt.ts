import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = ['node_modules', 'dist', '.git', '.idea', 'coverage', '.vscode', 'logs', 'build', 'docs'];
const IGNORE_FILES = [
  'package-lock.json',
  '.DS_Store',
  'A_Z_CODEBASE_PROMPT.md',
  'AGENTS.md',
  'GEMINI.md',
  'GEMINI_STRATEGY.md',
];
const IGNORE_EXTENSIONS = ['.log', '.sqlite', '.sqlite3', '.gz', '.zip', '.tar', '.tgz'];

const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to check if a file/dir should be ignored
function shouldIgnore(entryPath: string, isDirectory: boolean): boolean {
  const baseName = path.basename(entryPath);
  if (isDirectory) {
    return IGNORE_DIRS.includes(baseName);
  } else {
    if (IGNORE_FILES.includes(baseName)) return true;
    if (baseName.endsWith('.test.ts') || baseName.endsWith('.spec.ts')) return true; // Excluding tests to save tokens
    const ext = path.extname(baseName);
    if (IGNORE_EXTENSIONS.includes(ext)) return true;
    return false;
  }
}

// Generate directory tree
function generateTree(dir: string, prefix = ''): string {
  let output = '';
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  // Sort: directories first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const fullPath = path.join(dir, entry.name);
    if (shouldIgnore(fullPath, entry.isDirectory())) continue;

    const isLast = i === entries.length - 1;
    const marker = isLast ? '└── ' : '├── ';
    output += `${prefix}${marker}${entry.name}\n`;

    if (entry.isDirectory()) {
      output += generateTree(fullPath, prefix + (isLast ? '    ' : '│   '));
    }
  }
  return output;
}

// Gather all pertinent files content
function gatherFiles(dir: string): { relativePath: string; content: string }[] {
  let files: { relativePath: string; content: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldIgnore(fullPath, entry.isDirectory())) continue;

    if (entry.isDirectory()) {
      files = files.concat(gatherFiles(fullPath));
    } else {
      const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      files.push({ relativePath: relPath, content });
    }
  }
  return files;
}

function generatePrompt() {
  const fileList = gatherFiles(ROOT_DIR);
  const tree = generateTree(ROOT_DIR);

  const promptContent = `
# System Role
You are an expert AI software engineer and backend architect. You are provided with the complete A-Z implementation of the "Policy Diff API" codebase. This is a deterministic API-first utility built with Node.js, Fastify, TypeScript, and PostgreSQL for monitoring website legal documents. 

# Your Task
Your goal is to deeply understand this entire codebase — its architecture, business logic, deterministic diff engine (Levenshtein distance + hashing), job queue system, and API layer — so that you can accurately answer questions, debug issues, or extend features. Note that tests are omitted to save context length.

# Project Architecture & Guidelines (From User)
1. **Focus on determinism**: The system avoids probabilistic AI for core diffing; it isolates HTML content, structural normalization (Markdown-like), hashes sections, and diffs them exactly.
2. **Concurrency**: Job queue limits concurrency organically and by API Key using an in-memory guard in \`monitorJob.service.ts\`.
3. **Database**: \`pg\` client pools are used directly for optimal efficiency over ORMs.
4. **Security**: Tokens are hashed with SHA-256 before storage.

---

## 1. Directory Structure
\`\`\`text
.
${tree.trim()}
\`\`\`

---

## 2. Source Code Files
The files below represent the complete implementation. They are delineated by XML-like tags \`<file>\` with a \`path\` attribute. Use this strictly as your source of truth.

${fileList.map((f) => '<file path="' + f.relativePath + '">\\n' + f.content.trim() + '\\n</file>').join('\n\n')}

---
**END OF CODEBASE**
Please confirm that you have read and understood the entire implementation, and let me know if you are ready to assist with any questions or modifications!
`.trim();

  fs.writeFileSync(path.join(ROOT_DIR, 'A_Z_CODEBASE_PROMPT.md'), promptContent, 'utf8');
  console.log('Successfully generated highly structured A_Z_CODEBASE_PROMPT.md');
}

generatePrompt();
