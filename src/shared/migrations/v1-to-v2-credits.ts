/**
 * Migration Logic: v1-to-v2-credits.ts
 * Description: Core migration logic for migrating legacy `credits` to `monthlyCredits` and `purchasedCredits`.
 */

import { Connection } from 'mongoose';

const PLAN_MONTHLY_QUOTAS: Record<string, number> = {
  free: 3,
  starter: 25,
  pro: 100,
  premium: 500
};

export interface MigrationStats {
  totalScanned: number;
  unmigratedFound: number;
  alreadyMigrated: number;
  anomaliesFound: number;
  migratedSuccessfully: number;
  totalCreditsBefore: number;
  totalCreditsAfter: number;
  balanceInvariantPreserved: boolean;
}

/**
 * Preflight verification & scan
 */
export async function preflightCheck(connection: Connection): Promise<{
  unmigrated: any[];
  anomalies: any[];
  alreadyMigratedCount: number;
}> {
  const collection = connection.collection('users');

  // Find users needing migration
  const unmigrated = await collection.find({
    credits: { $exists: true }
  }).toArray();

  const anomalies: any[] = [];
  for (const doc of unmigrated) {
    if (typeof doc.credits !== 'number' || isNaN(doc.credits) || doc.credits < 0) {
      anomalies.push({
        id: doc._id,
        email: doc.email,
        reason: `Invalid credits value: ${doc.credits}`
      });
    }
    if (doc.monthlyCredits !== undefined && doc.purchasedCredits !== undefined) {
      anomalies.push({
        id: doc._id,
        email: doc.email,
        reason: `Document contains both legacy credits (${doc.credits}) and V2 fields (${doc.monthlyCredits} / ${doc.purchasedCredits})`
      });
    }
  }

  const alreadyMigratedCount = await collection.countDocuments({
    credits: { $exists: false },
    monthlyCredits: { $exists: true },
    purchasedCredits: { $exists: true }
  });

  return { unmigrated, anomalies, alreadyMigratedCount };
}

/**
 * Migrate UP: V1 -> V2
 */
export async function up(
  connection: Connection,
  options: { dryRun?: boolean; logger?: (msg: string) => void } = {}
): Promise<MigrationStats> {
  const { dryRun = false, logger = console.info } = options;
  const collection = connection.collection('users');

  logger(`[MIGRATION UP] Starting V1 -> V2 Credits Migration (dryRun = ${dryRun})...`);

  const { unmigrated, anomalies, alreadyMigratedCount } = await preflightCheck(connection);

  const stats: MigrationStats = {
    totalScanned: unmigrated.length + alreadyMigratedCount,
    unmigratedFound: unmigrated.length,
    alreadyMigrated: alreadyMigratedCount,
    anomaliesFound: anomalies.length,
    migratedSuccessfully: 0,
    totalCreditsBefore: 0,
    totalCreditsAfter: 0,
    balanceInvariantPreserved: true
  };

  if (anomalies.length > 0) {
    logger(`[MIGRATION UP] WARNING: Found ${anomalies.length} document anomalies:`);
    anomalies.forEach((a) => logger(`  - User ${a.id} (${a.email}): ${a.reason}`));
  }

  for (const doc of unmigrated) {
    // If document already has V2 fields set (e.g. partial previous migration), clean up legacy field
    if (doc.monthlyCredits !== undefined && doc.purchasedCredits !== undefined) {
      if (!dryRun) {
        await collection.updateOne(
          { _id: doc._id },
          { $unset: { credits: '' } }
        );
      }
      stats.alreadyMigrated++;
      continue;
    }

    const rawCredits = Math.max(0, Number(doc.credits) || 0);
    const plan = doc.plan || 'free';
    const quota = PLAN_MONTHLY_QUOTAS[plan] ?? 3;

    // Allocate up to plan quota to monthly, and all excess to purchasedCredits
    const monthlyCredits = Math.min(rawCredits, quota);
    const purchasedCredits = Math.max(0, rawCredits - quota);

    // Verify balance equivalence
    const newTotal = monthlyCredits + purchasedCredits;
    if (newTotal !== rawCredits) {
      stats.balanceInvariantPreserved = false;
      throw new Error(`CRITICAL INVARIANT VIOLATION: User ${doc._id} old balance (${rawCredits}) != new balance (${newTotal})`);
    }

    stats.totalCreditsBefore += rawCredits;
    stats.totalCreditsAfter += newTotal;

    if (!dryRun) {
      const updateResult = await collection.updateOne(
        { _id: doc._id, credits: doc.credits }, // optimistic concurrency check
        {
          $set: {
            monthlyCredits,
            purchasedCredits,
            migratedToV2At: new Date()
          },
          $unset: {
            credits: ''
          }
        }
      );

      if (updateResult.modifiedCount > 0) {
        stats.migratedSuccessfully++;
      }
    } else {
      stats.migratedSuccessfully++;
    }
  }

  logger(`[MIGRATION UP] Completed. Summary:
    - Scanned: ${stats.totalScanned}
    - Unmigrated: ${stats.unmigratedFound}
    - Migrated: ${stats.migratedSuccessfully}
    - Already Migrated: ${stats.alreadyMigrated}
    - Total Credits Before: ${stats.totalCreditsBefore}
    - Total Credits After: ${stats.totalCreditsAfter}
    - Invariant Preserved: ${stats.balanceInvariantPreserved}
  `);

  return stats;
}

/**
 * Migrate DOWN (Rollback): V2 -> V1
 */
export async function down(
  connection: Connection,
  options: { dryRun?: boolean; logger?: (msg: string) => void } = {}
): Promise<{ rolledBack: number }> {
  const { dryRun = false, logger = console.info } = options;
  const collection = connection.collection('users');

  logger(`[MIGRATION DOWN] Starting Rollback to V1 (dryRun = ${dryRun})...`);

  // Target documents migrated by this script
  const docsToRollback = await collection.find({
    migratedToV2At: { $exists: true }
  }).toArray();

  let rolledBack = 0;
  for (const doc of docsToRollback) {
    const combinedCredits = (Number(doc.monthlyCredits) || 0) + (Number(doc.purchasedCredits) || 0);

    if (!dryRun) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            credits: combinedCredits
          },
          $unset: {
            monthlyCredits: '',
            purchasedCredits: '',
            migratedToV2At: ''
          }
        }
      );
    }
    rolledBack++;
  }

  logger(`[MIGRATION DOWN] Rollback completed. Rolled back: ${rolledBack} users.`);
  return { rolledBack };
}
