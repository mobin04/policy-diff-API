import { initDB } from '../src/db';
import { IS_PRODUCTION } from '../src/config';

/**
 * Migration CLI Utility
 *
 * Provides explicit migration application.
 * Usage: npx ts-node scripts/migrate.ts
 */

async function run() {
  console.log(`[${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}] Starting migrations...`);
  try {
    await initDB();
    console.log('Migrations COMPLETED successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migrations FAILED:', err);
    process.exit(1);
  }
}

run();
