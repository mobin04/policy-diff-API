# Contributing to PolicyDiff

All contributions to PolicyDiff must maintain the system's deterministic architecture and meet the technical requirements below.

## 1. Technical Mandates

- **Deterministic Logic**: The engine must produce identical output for identical input. Do not use probabilistic models, AI, or non-deterministic algorithms.
- **Type Safety**: Use strict TypeScript. The use of `any` is prohibited.
- **Layered Architecture**: Logic must reside in the Service layer. Controllers orchestrate requests, and Repositories manage database persistence.
- **Verification**: Every functional change must include unit or integration tests. Bug fixes require a reproduction test case.

## 2. Environment Setup

### Prerequisites
- Node.js v20 or later.
- PostgreSQL v14 or later.

### Setup
```bash
npm install
cp .env.config.example .env.config
# Update DATABASE_URL in .env.config
```

## 3. Workflow & Standards

### Branching
- `feat/`: New functional additions.
- `fix/`: Error corrections.

### Code Quality
- **Formatting**: Run `npm run format` (Prettier).
- **Linting**: Run `npm run lint` (ESLint).
- **Naming**: Use descriptive, technical terminology. Avoid abbreviations.

### Database Migrations
- Migration files must be located in `src/db/migrations/`.
- Migrations must be idempotent and valid for the current schema.
- Update `src/db/schema.sql` to reflect final schema state.

## 4. Pipeline Validation

For changes affecting normalization, content isolation, or diff logic, the replay script must be used to verify consistency across multiple runs:
```bash
npx ts-node scripts/replay-validate.ts <snapshot_id> 50
```

## 5. Pull Request Process

- **Granularity**: PRs must focus on a single technical objective. Large, multi-purpose PRs will be rejected.
- **Documentation**: Update the `README.md` if the change introduces new public endpoints or configuration.
- **Approval**: Merge requires approval from at least one repository maintainer.

## 6. License
Contributions are licensed under the [Apache License 2.0](LICENSE).
