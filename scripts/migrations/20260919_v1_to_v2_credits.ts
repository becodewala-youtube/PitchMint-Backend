/**
 * Migration CLI: 20260919_v1_to_v2_credits.ts
 * Description: Migrates legacy `credits` field to `monthlyCredits` and `purchasedCredits` (Credit Model V2).
 * 
 * Usage:
 *   Dry run:  npx tsx scripts/migrations/20260919_v1_to_v2_credits.ts --dry-run
 *   Execute:  npx tsx scripts/migrations/20260919_v1_to_v2_credits.ts
 *   Rollback: npx tsx scripts/migrations/20260919_v1_to_v2_credits.ts --rollback
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { up, down, preflightCheck, MigrationStats } from '../../src/shared/migrations/v1-to-v2-credits';

dotenv.config();

export { up, down, preflightCheck, MigrationStats };

if (require.main === module) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  const isDryRun = process.argv.includes('--dry-run');
  const isRollback = process.argv.includes('--rollback');

  mongoose.connect(uri)
    .then(async () => {
      console.log(`Connected to MongoDB: ${mongoose.connection.name}`);
      if (isRollback) {
        await down(mongoose.connection, { dryRun: isDryRun });
      } else {
        await up(mongoose.connection, { dryRun: isDryRun });
      }
      await mongoose.disconnect();
      console.log('Migration finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed with error:', err);
      process.exit(1);
    });
}
