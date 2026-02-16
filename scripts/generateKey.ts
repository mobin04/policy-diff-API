/**
 * CLI script to generate and store API keys
 *
 * Usage:
 *   npx ts-node scripts/generateKey.ts <name> <environment>
 *
 * Examples:
 *   npx ts-node scripts/generateKey.ts "My Dev Key" dev
 *   npx ts-node scripts/generateKey.ts "Production App" prod
 */

import { generateApiKey } from '../src/utils/apiKey';
import { createApiKey } from '../src/repositories/apiKey.repository';
import { initDB, DB } from '../src/db';
import { ApiKeyEnvironment } from '../src/types';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node scripts/generateKey.ts <name> <environment>');
    console.error('  environment: dev | prod');
    process.exit(1);
  }

  const [name, env] = args;

  if (env !== 'dev' && env !== 'prod') {
    console.error('Environment must be "dev" or "prod"');
    process.exit(1);
  }

  const environment = env as ApiKeyEnvironment;

  try {
    // Initialize database
    await initDB();

    // Generate the raw key
    const rawKey = generateApiKey(environment);

    // Store hashed key in database
    const apiKey = await createApiKey(rawKey, name, environment);

    console.log('\n========================================');
    console.log('API KEY GENERATED SUCCESSFULLY');
    console.log('========================================\n');
    console.log('Name:', apiKey.name);
    console.log('Environment:', apiKey.environment);
    console.log('Rate Limit:', apiKey.rateLimit);
    console.log('\n⚠️  IMPORTANT: Save this key now. It will NOT be shown again!\n');
    console.log('API Key:', rawKey);
    console.log('\n========================================\n');

    // Close database connection
    await DB.end();
  } catch (error) {
    console.error('Error generating API key:', error);
    await DB.end();
    process.exit(1);
  }
}

main();
