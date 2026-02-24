import { validateSnapshotDeterminism } from '../src/services/replayValidator.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function main() {
  const snapshotId = process.argv[2];
  const runsArg = process.argv[3];

  if (!snapshotId || !UUID_REGEX.test(snapshotId)) {
    console.error('Usage: npx ts-node scripts/replay-validate.ts <snapshotId> [runs]');
    process.exit(1);
  }

  const runs = runsArg ? parseInt(runsArg, 10) : 10;

  if (isNaN(runs) || runs <= 0) {
    console.error('Error: runs must be a positive integer');
    process.exit(1);
  }

  try {
    await validateSnapshotDeterminism(snapshotId, runs);
    console.log('DETERMINISTIC_VALIDATION_PASS');
    process.exit(0);
  } catch (err: unknown) {
    console.error('DETERMINISTIC_VALIDATION_FAIL');
    process.exit(1);
  }
}

main();
