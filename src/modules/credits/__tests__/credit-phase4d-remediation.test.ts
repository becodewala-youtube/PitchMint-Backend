import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import express from 'express';
import User from '../../users/user.model';
import CreditTransaction from '../credit.model';
import { atomicDeductCredits, refundCredits } from '../../../shared/middleware/credit.middleware';
import { processSuccessfulPayment } from '../credit.service';
import { up, down, preflightCheck } from '../../../shared/migrations/v1-to-v2-credits';

describe('PitchMint Phase 4D Remediation Test Suite', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await CreditTransaction.deleteMany({});
    jest.clearAllMocks();
  });

  // ==========================================
  // A. Legacy V1 User Migration
  // ==========================================
  describe('A. Legacy V1 user migration', () => {
    it('should preflight check, dry-run, migrate up, preserve exact balance, and rollback down safely', async () => {
      const userCollection = mongoose.connection.collection('users');

      // Seed unmigrated V1 documents directly into MongoDB
      await userCollection.insertMany([
        {
          name: 'Free User Low',
          email: 'free1@test.com',
          plan: 'free',
          credits: 2, // < 3 quota
          createdAt: new Date()
        },
        {
          name: 'Free User High',
          email: 'free2@test.com',
          plan: 'free',
          credits: 15, // > 3 quota -> 3 monthly + 12 purchased
          createdAt: new Date()
        },
        {
          name: 'Pro User High',
          email: 'pro@test.com',
          plan: 'pro',
          credits: 250, // > 100 quota -> 100 monthly + 150 purchased
          createdAt: new Date()
        },
        {
          name: 'Already Migrated User',
          email: 'v2@test.com',
          plan: 'free',
          monthlyCredits: 3,
          purchasedCredits: 50,
          createdAt: new Date()
        }
      ]);

      // 1. Preflight check
      const preflight = await preflightCheck(mongoose.connection);
      expect(preflight.unmigrated.length).toBe(3);
      expect(preflight.alreadyMigratedCount).toBe(1);
      expect(preflight.anomalies.length).toBe(0);

      // 2. Dry-run
      const dryRunStats = await up(mongoose.connection, { dryRun: true, logger: () => {} });
      expect(dryRunStats.unmigratedFound).toBe(3);
      expect(dryRunStats.migratedSuccessfully).toBe(3);
      expect(dryRunStats.totalCreditsBefore).toBe(2 + 15 + 250); // 267
      expect(dryRunStats.totalCreditsAfter).toBe(267);
      expect(dryRunStats.balanceInvariantPreserved).toBe(true);

      // Verify dry-run made NO live mutations
      const docStillV1 = await userCollection.findOne({ email: 'free1@test.com' });
      expect(docStillV1?.credits).toBe(2);
      expect(docStillV1?.monthlyCredits).toBeUndefined();

      // 3. Live UP Migration
      const upStats = await up(mongoose.connection, { dryRun: false, logger: () => {} });
      expect(upStats.migratedSuccessfully).toBe(3);

      const u1 = await userCollection.findOne({ email: 'free1@test.com' });
      expect(u1?.credits).toBeUndefined();
      expect(u1?.monthlyCredits).toBe(2);
      expect(u1?.purchasedCredits).toBe(0);
      expect(u1?.monthlyCredits + u1?.purchasedCredits).toBe(2);

      const u2 = await userCollection.findOne({ email: 'free2@test.com' });
      expect(u2?.credits).toBeUndefined();
      expect(u2?.monthlyCredits).toBe(3);
      expect(u2?.purchasedCredits).toBe(12);
      expect(u2?.monthlyCredits + u2?.purchasedCredits).toBe(15);

      const u3 = await userCollection.findOne({ email: 'pro@test.com' });
      expect(u3?.credits).toBeUndefined();
      expect(u3?.monthlyCredits).toBe(100);
      expect(u3?.purchasedCredits).toBe(150);
      expect(u3?.monthlyCredits + u3?.purchasedCredits).toBe(250);

      // 4. Idempotency test: Running UP again should do nothing
      const upAgain = await up(mongoose.connection, { dryRun: false, logger: () => {} });
      expect(upAgain.unmigratedFound).toBe(0);

      // 5. Rollback (DOWN)
      const downStats = await down(mongoose.connection, { dryRun: false, logger: () => {} });
      expect(downStats.rolledBack).toBe(3);

      const rolledBackU2 = await userCollection.findOne({ email: 'free2@test.com' });
      expect(rolledBackU2?.credits).toBe(15);
      expect(rolledBackU2?.monthlyCredits).toBeUndefined();
      expect(rolledBackU2?.purchasedCredits).toBeUndefined();
    });

    it('should migrate legacy document and allow subsequent credit deductions seamlessly', async () => {
      const userCollection = mongoose.connection.collection('users');
      const insertResult = await userCollection.insertOne({
        name: 'Legacy Unmigrated',
        email: 'legacy@test.com',
        credits: 50, // raw legacy credits
        plan: 'free',
        lastCreditReset: new Date(),
        processedPayments: [],
        processedRefunds: []
      });
      const userId = insertResult.insertedId;

      // Migrate the legacy user
      await up(mongoose.connection, { dryRun: false, logger: () => {} });

      // After migration, user has full 50 credits (3 monthly + 47 purchased)
      const user = await User.findById(userId);
      expect(user).not.toBeNull();
      expect(user?.credits).toBe(50);
      expect(user?.monthlyCredits).toBe(3);
      expect(user?.purchasedCredits).toBe(47);

      // atomicDeductCredits works seamlessly on migrated user
      const deducted = await atomicDeductCredits(userId.toString(), 5, 'canvas');
      expect(deducted.success).toBe(true);
      expect(deducted.split).toEqual({ monthly: 3, purchased: 2 });

      const updatedUser = await User.findById(userId);
      expect(updatedUser?.credits).toBe(45);
      expect(updatedUser?.monthlyCredits).toBe(0);
      expect(updatedUser?.purchasedCredits).toBe(45);
    });
  });

  // ==========================================
  // B. API JSON `credits` Virtual
  // ==========================================
  describe('B. API JSON `credits`', () => {
    it('should include `credits` in toJSON(), toObject(), and Express JSON serialization', async () => {
      const user = await User.create({
        name: 'JSON Test User',
        email: 'json@test.com',
        password: 'password123',
        monthlyCredits: 3,
        purchasedCredits: 25,
        plan: 'starter'
      });

      // 1. toJSON() test
      const jsonObj = user.toJSON();
      expect(jsonObj.credits).toBe(28);

      // 2. toObject() test
      const plainObj = user.toObject();
      expect(plainObj.credits).toBe(28);

      // 3. JSON.stringify / parse test
      const serialized = JSON.parse(JSON.stringify(user));
      expect(serialized.credits).toBe(28);

      // 4. Real HTTP Express response serialization
      const app = express();
      app.get('/api/test-user', (_req, res) => {
        res.json({ user });
      });

      const res = await request(app).get('/api/test-user');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.credits).toBe(28);
      expect(res.body.user.monthlyCredits).toBe(3);
      expect(res.body.user.purchasedCredits).toBe(25);
    });
  });

  // ==========================================
  // C. Monthly-Only Deduction
  // ==========================================
  describe('C. monthly-only deduction', () => {
    it('should deduct strictly from monthlyCredits and record exact deductedFrom split', async () => {
      const user = await User.create({
        name: 'Monthly User',
        email: 'monthly@test.com',
        monthlyCredits: 10,
        purchasedCredits: 5,
        plan: 'starter'
      });

      const deduction = await atomicDeductCredits(user._id.toString(), 4, 'canvas');
      expect(deduction.success).toBe(true);
      expect(deduction.split).toEqual({ monthly: 4, purchased: 0 });

      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(6);
      expect(dbUser?.purchasedCredits).toBe(5);
      expect(dbUser?.credits).toBe(11);

      const txn = await CreditTransaction.findOne({ userId: user._id });
      expect(txn).not.toBeNull();
      expect(txn?.amount).toBe(-4);
      expect(txn?.deductedFrom).toEqual({ monthly: 4, purchased: 0 });
    });
  });

  // ==========================================
  // D. Purchased-Only Deduction
  // ==========================================
  describe('D. purchased-only deduction', () => {
    it('should deduct strictly from purchasedCredits when monthlyCredits is 0', async () => {
      const user = await User.create({
        name: 'Purchased User',
        email: 'purchased@test.com',
        monthlyCredits: 0,
        purchasedCredits: 10,
        plan: 'free'
      });

      const deduction = await atomicDeductCredits(user._id.toString(), 4, 'pitch_deck');
      expect(deduction.success).toBe(true);
      expect(deduction.split).toEqual({ monthly: 0, purchased: 4 });

      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(0);
      expect(dbUser?.purchasedCredits).toBe(6);
      expect(dbUser?.credits).toBe(6);

      const txn = await CreditTransaction.findOne({ userId: user._id });
      expect(txn).not.toBeNull();
      expect(txn?.amount).toBe(-4);
      expect(txn?.deductedFrom).toEqual({ monthly: 0, purchased: 4 });
    });
  });

  // ==========================================
  // E. Cascading Deduction
  // ==========================================
  describe('E. cascading deduction', () => {
    it('should exhaust monthlyCredits first and take the remainder from purchasedCredits', async () => {
      const user = await User.create({
        name: 'Cascade User',
        email: 'cascade@test.com',
        monthlyCredits: 2,
        purchasedCredits: 10,
        plan: 'free'
      });

      // Deduct 5: should take 2 from monthly, 3 from purchased
      const deduction = await atomicDeductCredits(user._id.toString(), 5, 'market_research');
      expect(deduction.success).toBe(true);
      expect(deduction.split).toEqual({ monthly: 2, purchased: 3 });

      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(0);
      expect(dbUser?.purchasedCredits).toBe(7);
      expect(dbUser?.credits).toBe(7);

      const txn = await CreditTransaction.findOne({ userId: user._id });
      expect(txn).not.toBeNull();
      expect(txn?.amount).toBe(-5);
      expect(txn?.deductedFrom).toEqual({ monthly: 2, purchased: 3 });
    });
  });

  // ==========================================
  // E2. Exact Deduction Provenance
  // ==========================================
  describe('E2. exact deduction provenance', () => {
    it('should return exact deduction split and match CreditTransaction deductedFrom ledger entry', async () => {
      const user = await User.create({
        name: 'Provenance User',
        email: 'provenance@test.com',
        monthlyCredits: 3,
        purchasedCredits: 7,
        plan: 'starter'
      });

      const deduction = await atomicDeductCredits(user._id.toString(), 6, 'investor_matching');
      expect(deduction.success).toBe(true);
      expect(deduction.monthly).toBe(3);
      expect(deduction.purchased).toBe(3);
      expect(deduction.split).toEqual({ monthly: 3, purchased: 3 });

      const txn = await CreditTransaction.findOne({ userId: user._id });
      expect(txn).not.toBeNull();
      expect(txn?.deductedFrom?.monthly).toBe(3);
      expect(txn?.deductedFrom?.purchased).toBe(3);
    });
  });

  // ==========================================
  // F. Insufficient Balance
  // ==========================================
  describe('F. insufficient balance', () => {
    it('should reject deduction atomically without mutating balances or logging transaction', async () => {
      const user = await User.create({
        name: 'Broke User',
        email: 'broke@test.com',
        monthlyCredits: 1,
        purchasedCredits: 1,
        plan: 'free'
      });

      const deduction = await atomicDeductCredits(user._id.toString(), 3, 'pitch_simulator');
      expect(deduction.success).toBe(false);
      expect(deduction.split).toEqual({ monthly: 0, purchased: 0 });

      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(1);
      expect(dbUser?.purchasedCredits).toBe(1);
      expect(dbUser?.credits).toBe(2);

      const txn = await CreditTransaction.findOne({ userId: user._id });
      expect(txn).toBeNull();
    });
  });

  // ==========================================
  // G. Concurrent Deductions
  // ==========================================
  describe('G. concurrent deductions', () => {
    it('should handle concurrent deductions without race conditions, conserving exact balances', async () => {
      const user = await User.create({
        name: 'Concurrent Deduct User',
        email: 'concur_deduct@test.com',
        monthlyCredits: 5,
        purchasedCredits: 10, // Total: 15
        plan: 'starter'
      });

      // 5 concurrent deductions of 3 credits each = 15 total credits
      const promises = Array.from({ length: 5 }).map(() =>
        atomicDeductCredits(user._id.toString(), 3, 'canvas')
      );

      const results = await Promise.all(promises);
      expect(results.every((r: any) => r.success === true)).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(0);
      expect(dbUser?.purchasedCredits).toBe(0);
      expect(dbUser?.credits).toBe(0);

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(5);

      // Verify exact conservation across transactions
      const totalMonthlyDeducted = txns.reduce((acc, t) => acc + (t.deductedFrom?.monthly || 0), 0);
      const totalPurchasedDeducted = txns.reduce((acc, t) => acc + (t.deductedFrom?.purchased || 0), 0);

      expect(totalMonthlyDeducted).toBe(5);
      expect(totalPurchasedDeducted).toBe(10);
    });

    it('should reject excess concurrent requests when balance is partially exhausted', async () => {
      const user = await User.create({
        name: 'Exhaust User',
        email: 'exhaust@test.com',
        monthlyCredits: 2,
        purchasedCredits: 3, // Total: 5 credits
        plan: 'free'
      });

      // 5 concurrent requests of 2 credits each (requires 10, only 5 available)
      const promises = Array.from({ length: 5 }).map(() =>
        atomicDeductCredits(user._id.toString(), 2, 'idea_validation')
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r: any) => r.success === true);
      const failures = results.filter((r: any) => r.success === false);

      // Exactly 2 requests succeed (4 credits), 3 fail (remaining 1 credit cannot satisfy 2)
      expect(successes.length).toBe(2);
      expect(failures.length).toBe(3);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(1);
    });
  });

  // ==========================================
  // H & I. Concurrent Payments
  // ==========================================
  describe('H & I. Concurrent payments', () => {
    it('H: should handle concurrent identical payments idempotently (exactly one grants credits)', async () => {
      const user = await User.create({
        name: 'Identical Payment User',
        email: 'ident_pay@test.com',
        monthlyCredits: 0,
        purchasedCredits: 0
      });

      const paymentId = 'pay_concurrent_ident_1';
      const promises = Array.from({ length: 8 }).map(() =>
        processSuccessfulPayment(user._id.toString(), 100, 'Pro Plan', paymentId, 'order_1')
      );

      const results = await Promise.all(promises);
      const newProcessed = results.filter((r) => r.alreadyProcessed === false);
      const alreadyProcessed = results.filter((r) => r.alreadyProcessed === true);

      expect(newProcessed.length).toBe(1);
      expect(alreadyProcessed.length).toBe(7);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.purchasedCredits).toBe(100);

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(1);
    });

    it('I: should credit distinct concurrent payments independently', async () => {
      const user = await User.create({
        name: 'Distinct Payment User',
        email: 'distinct_pay@test.com',
        monthlyCredits: 0,
        purchasedCredits: 0
      });

      const promises = Array.from({ length: 4 }).map((_, i) =>
        processSuccessfulPayment(user._id.toString(), 50, 'Starter Plan', `pay_distinct_${i}`, `ord_${i}`)
      );

      const results = await Promise.all(promises);
      expect(results.every((r) => r.success === true && r.alreadyProcessed === false)).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.purchasedCredits).toBe(200); // 4 * 50

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(4);
    });
  });

  // ==========================================
  // J. Payment Retry After Missing Ledger
  // ==========================================
  describe('J. payment retry after missing ledger', () => {
    it('should recover missing ledger entry on retry when user document was updated before crash', async () => {
      const user = await User.create({
        name: 'Crash User',
        email: 'crash@test.com',
        monthlyCredits: 0,
        purchasedCredits: 0
      });

      const paymentId = 'pay_crash_ledger_recovery';

      // Simulate crash between User update and CreditTransaction write
      await User.updateOne(
        { _id: user._id },
        {
          $inc: { purchasedCredits: 100 },
          $push: { processedPayments: paymentId }
        }
      );

      // Verify transaction does NOT exist initially
      const initialTxn = await CreditTransaction.findOne({ razorpayPaymentId: paymentId });
      expect(initialTxn).toBeNull();

      // Webhook retries
      const retryResult = await processSuccessfulPayment(user._id.toString(), 100, 'Pro Plan', paymentId, 'ord_crash');
      expect(retryResult.success).toBe(true);
      expect(retryResult.alreadyProcessed).toBe(true);

      // Ledger has been recovered
      const recoveredTxn = await CreditTransaction.findOne({ razorpayPaymentId: paymentId });
      expect(recoveredTxn).not.toBeNull();
      expect(recoveredTxn?.amount).toBe(100);

      // User credits are not duplicated
      const dbUser = await User.findById(user._id);
      expect(dbUser?.purchasedCredits).toBe(100);
    });
  });

  // ==========================================
  // K. Refund Idempotency
  // ==========================================
  describe('K. refund idempotency', () => {
    it('should only refund once when called multiple times with the same refundId', async () => {
      const user = await User.create({
        name: 'Refund Idempotent User',
        email: 'ref_idem@test.com',
        monthlyCredits: 0,
        purchasedCredits: 10
      });

      const refundId = 'ref_idempotent_key_123';

      const firstCall = await refundCredits(user._id.toString(), 2, 'canvas', refundId);
      expect(firstCall.success).toBe(true);
      expect(firstCall.alreadyProcessed).toBe(false);

      const secondCall = await refundCredits(user._id.toString(), 2, 'canvas', refundId);
      expect(secondCall.success).toBe(true);
      expect(secondCall.alreadyProcessed).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.purchasedCredits).toBe(12); // Only +2, NOT +4

      const txns = await CreditTransaction.find({ refundId });
      expect(txns.length).toBe(1);
    });
  });

  // ==========================================
  // L. Refund Ledger Failure & Recovery
  // ==========================================
  describe('L. refund ledger failure', () => {
    it('should recover missing refund ledger entry on retry if user was updated but ledger write failed', async () => {
      const user = await User.create({
        name: 'Refund Recovery User',
        email: 'ref_rec@test.com',
        monthlyCredits: 0,
        purchasedCredits: 5
      });

      const refundId = 'ref_recovery_key_456';

      // Simulate crash between user update and transaction insertion
      await User.updateOne(
        { _id: user._id },
        {
          $inc: { purchasedCredits: 3 },
          $push: { processedRefunds: refundId }
        }
      );

      // Retry refund
      const retryResult = await refundCredits(user._id.toString(), 3, 'pitch_deck', refundId);
      expect(retryResult.success).toBe(true);
      expect(retryResult.alreadyProcessed).toBe(true);

      // Ledger entry was recovered
      const txn = await CreditTransaction.findOne({ refundId });
      expect(txn).not.toBeNull();
      expect(txn?.amount).toBe(3);

      // User balance wasn't duplicated
      const dbUser = await User.findById(user._id);
      expect(dbUser?.purchasedCredits).toBe(8);
    });
  });

  // ==========================================
  // M. AI Failure Refund
  // ==========================================
  describe('M. AI failure refund', () => {
    it('should refund deducted credits to the exact originating pool when AI generation fails', async () => {
      const user = await User.create({
        name: 'AI Fail User',
        email: 'ai_fail@test.com',
        monthlyCredits: 3,
        purchasedCredits: 0
      });

      // Deduct 1 credit before AI
      const deduction = await atomicDeductCredits(user._id.toString(), 1, 'canvas');
      expect(deduction.success).toBe(true);
      expect(deduction.split).toEqual({ monthly: 1, purchased: 0 });

      // Simulate AI generation failure and catch block triggering refund
      const fakeAiCall = async () => {
        throw new Error('Gemini quota exceeded');
      };

      try {
        await fakeAiCall();
      } catch (_err) {
        await refundCredits(user._id.toString(), deduction.split, 'canvas');
      }

      const dbUser = await User.findById(user._id);
      // Monthly was depleted to 2, refund went back to monthlyCredits (+1), NOT converted into purchasedCredits
      expect(dbUser?.credits).toBe(3);
      expect(dbUser?.monthlyCredits).toBe(3);
      expect(dbUser?.purchasedCredits).toBe(0);
    });
  });

  // ==========================================
  // N. Database Save Failure Refund
  // ==========================================
  describe('N. database save failure refund', () => {
    it('should refund deducted credits when AI succeeds but downstream database persistence fails', async () => {
      const user = await User.create({
        name: 'DB Fail User',
        email: 'db_fail@test.com',
        monthlyCredits: 5,
        purchasedCredits: 0
      });

      // 1. Deduct credits
      const deduction = await atomicDeductCredits(user._id.toString(), 1, 'canvas');
      expect(deduction.success).toBe(true);

      // 2. Simulate downstream database save failure after successful AI call
      const fakeSaveOperation = async () => {
        throw new Error('MongoServerError: connection timed out during save()');
      };

      try {
        await fakeSaveOperation();
      } catch (_err) {
        // The updated controller pattern refunds exact split on ANY downstream error
        await refundCredits(user._id.toString(), deduction.split, 'canvas');
      }

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(5);
      expect(dbUser?.monthlyCredits).toBe(5);
      expect(dbUser?.purchasedCredits).toBe(0);
    });
  });

  // ==========================================
  // N2. Exact Refund Restoration
  // ==========================================
  describe('N2. exact refund restoration', () => {
    it('should restore exact pools ({ monthly, purchased }) and never convert monthly to purchased', async () => {
      const user = await User.create({
        name: 'Exact Refund User',
        email: 'exact_refund@test.com',
        monthlyCredits: 4,
        purchasedCredits: 10,
        plan: 'starter'
      });

      // Deduct 6: 4 from monthly, 2 from purchased
      const deduction = await atomicDeductCredits(user._id.toString(), 6, 'canvas');
      expect(deduction.success).toBe(true);
      expect(deduction.split).toEqual({ monthly: 4, purchased: 2 });

      let dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(0);
      expect(dbUser?.purchasedCredits).toBe(8);

      // Refund exact split
      const refundResult = await refundCredits(user._id.toString(), deduction.split, 'canvas');
      expect(refundResult.success).toBe(true);

      dbUser = await User.findById(user._id);
      // Verify exact pool restoration
      expect(dbUser?.monthlyCredits).toBe(4);
      expect(dbUser?.purchasedCredits).toBe(10);
      expect(dbUser?.credits).toBe(14);
    });
  });

  // ==========================================
  // N3. Deduction Ledger Failure & Recovery
  // ==========================================
  describe('N3. deduction ledger failure and recovery', () => {
    it('should compensate user balances without permanent deduction if ledger creation fails', async () => {
      const user = await User.create({
        name: 'Ledger Fail User',
        email: 'ledger_fail@test.com',
        monthlyCredits: 5,
        purchasedCredits: 10,
        plan: 'starter'
      });

      // Mock CreditTransaction.create to simulate database failure during ledger writing
      const createSpy = jest.spyOn(CreditTransaction, 'create').mockRejectedValueOnce(
        new Error('MongoNetworkTimeoutError: connection lost during ledger write')
      );

      const deduction = await atomicDeductCredits(user._id.toString(), 4, 'pitch_simulator');

      // Deduction should fail gracefully and compensate
      expect(deduction.success).toBe(false);

      // Verify user balance was NOT permanently debited
      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(5);
      expect(dbUser?.purchasedCredits).toBe(10);
      expect(dbUser?.credits).toBe(15);

      createSpy.mockRestore();
    });
  });

  // ==========================================
  // O. UTC Month Reset
  // ==========================================
  describe('O. UTC month reset', () => {
    it('should reset monthly credits based on strict UTC month boundaries', async () => {
      // User last reset in November
      const novDate = new Date(Date.UTC(2025, 10, 15, 12, 0, 0)); // Nov 15 2025 UTC
      const user = await User.create({
        name: 'UTC Reset User',
        email: 'utc_reset@test.com',
        monthlyCredits: 0,
        purchasedCredits: 50,
        plan: 'starter', // starter quota is 25
        lastCreditReset: novDate
      });

      const resetPerformed = await user.checkAndResetMonthlyCredits();
      expect(resetPerformed).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(25);
      expect(dbUser?.purchasedCredits).toBe(50); // Untouched!
      expect(dbUser?.credits).toBe(75);

      // Repeated call in the same month should NOT reset
      const resetAgain = await dbUser!.checkAndResetMonthlyCredits();
      expect(resetAgain).toBe(false);
    });

    it('should handle Dec -> Jan rollover in UTC', () => {
      const user = new User({
        name: 'Year Rollover User',
        email: 'rollover@test.com',
        monthlyCredits: 0,
        plan: 'free',
        lastCreditReset: new Date(Date.UTC(2025, 11, 31, 23, 59, 59)) // Dec 31, 2025
      });

      // resetMonthlyCredits synchronous check
      const didReset = user.resetMonthlyCredits();
      expect(didReset).toBe(true);
      expect(user.monthlyCredits).toBe(3);
    });
  });

  // ==========================================
  // P. Concurrent Payment + Reset
  // ==========================================
  describe('P. concurrent payment + reset', () => {
    it('should deterministically calculate credits when payment and reset occur concurrently', async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const user = await User.create({
        name: 'Concurrent Pay Reset User',
        email: 'pay_reset@test.com',
        plan: 'pro', // reset = 100
        monthlyCredits: 5,
        purchasedCredits: 10,
        lastCreditReset: lastMonth
      });

      const userDoc = await User.findById(user._id);

      const [resetResult, paymentResult] = await Promise.all([
        userDoc!.checkAndResetMonthlyCredits(),
        processSuccessfulPayment(user._id.toString(), 200, 'Pro Plan', 'pay_concurrent_reset_1', 'ord_p')
      ]);

      expect(resetResult).toBe(true);
      expect(paymentResult.success).toBe(true);

      const dbUser = await User.findById(user._id);
      // Monthly should be 100 (reset)
      // Purchased should be 10 (initial) + 200 (payment) = 210
      // Total credits: 100 + 210 = 310
      expect(dbUser?.monthlyCredits).toBe(100);
      expect(dbUser?.purchasedCredits).toBe(210);
      expect(dbUser?.credits).toBe(310);
    });
  });
});
