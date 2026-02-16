# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

```bash
# Development (hot reload via nodemon + ts-node)
npm run dev

# Build TypeScript to dist/
npm run build

# Run production build
npm start

# Lint
npm run lint
npm run lint:fix

# Format
npm run format

# Generate API key
npx ts-node scripts/generateKey.ts "Key Name" dev|prod
```

No tests are currently configured (`npm test` exits with error).

## Environment

Configuration is loaded from `.env.config` (not `.env`). Required variables:
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string

## Architecture

Fastify-based REST API for detecting and analyzing changes in policy documents.

### Request Flow

```
Routes → Controllers → Services → Repositories → PostgreSQL
```

### Core Pipeline (page.service.ts)

The main `/check` endpoint processes a URL through:
1. **fetchPage** - Fetches raw HTML via axios
2. **normalizeContent** - Strips scripts/styles, extracts body text
3. **extractSections** - Parses HTML into sections using h1/h2/h3 as delimiters
4. **generateHash** - SHA-256 hash of normalized content
5. **savePage** - Stores in DB, compares against previous version
6. **diffSections** - Computes ADDED/REMOVED/MODIFIED changes
7. **analyzeRisk** - Assigns risk levels (LOW/MEDIUM/HIGH) based on keyword detection

### Risk Engine (riskEngine.service.ts)

Assigns risk levels to changes by scanning section content for keywords:
- **HIGH**: "share data", "sell data", "third party", "arbitration", "no refund", etc.
- **MEDIUM**: "analytics", "cookies", "retention", "billing", etc.

Section removals are flagged based on title keywords (data, privacy, refund, liability).

### Database Schema

- `pages` - Unique URLs being tracked
- `page_versions` - Versioned snapshots with normalized content, hash, and extracted sections (JSONB)
- `api_keys` - Hashed API keys with usage tracking and rate limits

### Authentication (plugins/apiKeyAuth.ts)

API key auth applied to `/v1/*` routes. Keys are hashed with SHA-256 before storage.
- Dev mode (`NODE_ENV=development`): Allows `x-dev-bypass: true` header to skip auth
- Prod mode: Strict API key required via `Authorization: Bearer <key>`
- Rate limiting: Simple DB-based counter (usage_count vs rate_limit)

## Key Types (types/index.ts)

- `Section` - `{ title, content }` extracted from HTML headings
- `Change` - `{ section, type: 'ADDED' | 'REMOVED' | 'MODIFIED' }`
- `RiskedChange` - Change with `risk: 'LOW' | 'MEDIUM' | 'HIGH'` and reason
- `DiffResult` - API response with message, optional risk_level and changes array
