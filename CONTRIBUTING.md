# Contributing to PolicyDiff

Thank you for your interest in contributing to PolicyDiff! This document outlines the technical standards and workflows required to maintain the system's deterministic architecture.

---

## 1. Core Technical Mandates

All contributions MUST adhere to these foundational principles:

- **Strict Determinism**: The engine must produce identical output for identical input. The use of probabilistic models, AI, or non-deterministic algorithms is strictly prohibited.
- **Type Safety**: Use strict TypeScript. The use of `any` is prohibited.
- **Layered Architecture**: Business logic must reside in the Service layer. Controllers orchestrate requests, and Repositories manage database persistence.
- **No Side Effects**: Core diffing and risk classification logic must remain pure and free of hidden side effects.

---

## 2. Issue Reporting Guidelines

If you find a bug or have a feature request, please use our structured issue templates.

### Bug Reports
To help us resolve issues quickly, please include:
- **Steps to Reproduce**: A clear, numbered list of actions.
- **Expected Behavior**: What you expected to happen.
- **Actual Behavior**: What actually happened (include screenshots if applicable).
- **Environment Information**: Node.js version, OS, and database version.
- **Logs**: Relevant error output from your terminal or the `logs/` directory.

### Feature Requests
Clearly describe the problem the feature solves and provide a high-level technical proposal that aligns with our deterministic philosophy.

---

## 3. Commit Message Convention

We follow a simplified [Conventional Commits](https://www.conventionalcommits.org/) style to maintain a clean and searchable history.

### Format
`<type>: <description>`

### Types
- `feat`: A new functional addition.
- `fix`: An error correction or bug fix.
- `refactor`: Internal restructuring without changing behavior.
- `docs`: Documentation updates (README, CONTRIBUTING, etc.).
- `test`: Adding or updating tests.
- `chore`: Maintenance tasks (dependency updates, configuration).

### Examples
- `feat: add support for webhook notifications`
- `fix: resolve incorrect risk scoring in negation removal`
- `docs: update API reference for /v1/monitor`
- `test: add regression test for isolation drift`

---

## 4. Local Development

### Prerequisites
- **Node.js**: v20 or later.
- **PostgreSQL**: v14 or later.

### Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.config.example .env.config
# Update DATABASE_URL in .env.config

# Run migrations
npm run migrate
```

### Essential Commands
| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the development server with hot-reload. |
| `npm run build` | Compile TypeScript into the `dist/` directory. |
| `npm run test` | Execute the full Jest test suite. |
| `npm run lint` | Run ESLint to check for code quality issues. |
| `npm run format` | Automatically format code using Prettier. |

---

## 5. Testing Requirements

Testing is not optional. Every functional change must include verification logic.

- **Framework**: We use [Jest](https://jestjs.io/) for all testing.
- **Location**: Test files should be placed in the corresponding `tests/` subdirectory:
  - `src/services/tests/` for business logic.
  - `src/plugins/tests/` for Fastify plugins.
  - `src/utils/tests/` for utility functions.
- **Reproduction**: Bug fixes MUST include a failing test case that is resolved by the fix.
- **Pipeline Validation**: For changes affecting normalization or diff logic, run the replay script:
  ```bash
  npx ts-node scripts/replay-validate.ts <snapshot_id> 50
  ```

---

## 6. Security Reporting

Security is our top priority. Please **DO NOT** report security vulnerabilities via public GitHub issues.

To report a vulnerability:
1. Open a **Private Security Advisory** on the GitHub repository.
2. Alternatively, contact the maintainers directly.
3. Allow us sufficient time to investigate and provide a fix before public disclosure.

---

## 7. Pull Request Process

- **Granularity**: PRs must focus on a single technical objective. Large, multi-purpose PRs will be rejected.
- **Documentation**: Update the `README.md` if the change introduces new public endpoints or configuration.
- **Database Migrations**:
  - Migration files must be located in `src/db/migrations/`.
  - Migrations must be idempotent and valid for the current schema.
  - Update `src/db/schema.sql` to reflect final schema state.
- **Approval**: Merge requires approval from at least one repository maintainer.

---

## 8. License

By contributing to PolicyDiff, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
