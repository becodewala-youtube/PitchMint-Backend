import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../../users/user.model';
import CreditTransaction from '../credit.model';
import { processSuccessfulPayment } from '../credit.service';

describe('Credit System Idempotency and Correctness', () => {
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

  describe('A. Sequential duplicate webhook', () => {
    it('should grant credits exactly once for sequential requests with same payment ID', async () => {
      const user = await User.create({ 
        name: 'Test User', 
        email: `test_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'free', 
        monthlyCredits: 0, 
        purchasedCredits: 0,
        lastCreditReset: new Date() 
      });
      const paymentId = 'pay_seq_1';

      // First webhook
      const res1 = await processSuccessfulPayment(user._id.toString(), 100, 'Pro', paymentId, 'order_1');
      expect(res1.success).toBe(true);
      expect(res1.alreadyProcessed).toBe(false);

      // Second webhook sequentially
      const res2 = await processSuccessfulPayment(user._id.toString(), 100, 'Pro', paymentId, 'order_1');
      expect(res2.success).toBe(true);
      expect(res2.alreadyProcessed).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(100);

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(1);
    });
  });

  describe('B. Concurrent duplicate webhook', () => {
    it('should grant credits exactly once for multiple concurrent requests with same payment ID', async () => {
      const user = await User.create({ 
        name: 'Test User', 
        email: `test_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'free', 
        monthlyCredits: 0, 
        purchasedCredits: 0,
        lastCreditReset: new Date() 
      });
      const paymentId = 'pay_conc_1';

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }).map(() => 
        processSuccessfulPayment(user._id.toString(), 100, 'Pro', paymentId, 'order_2')
      );

      const results = await Promise.all(promises);

      // Only one should process successfully as new
      const newProcessings = results.filter(r => r.alreadyProcessed === false);
      const alreadyProcessed = results.filter(r => r.alreadyProcessed === true);

      expect(newProcessings.length).toBe(1);
      expect(alreadyProcessed.length).toBe(9);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(100);

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(1);
    });
  });

  describe('C. Old replay', () => {
    it('should prevent replay even after 50+ unique payments', async () => {
      const user = await User.create({ 
        name: 'Test User', 
        email: `test_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'free', 
        monthlyCredits: 0, 
        purchasedCredits: 0,
        lastCreditReset: new Date() 
      });
      
      const firstPaymentId = 'pay_old_0';
      await processSuccessfulPayment(user._id.toString(), 10, 'Pro', firstPaymentId, 'order_0');

      // Process 55 more unique payments
      for (let i = 1; i <= 55; i++) {
        await processSuccessfulPayment(user._id.toString(), 10, 'Pro', `pay_old_${i}`, `order_${i}`);
      }

      // User should have 560 credits total (1 + 55 = 56 payments * 10)
      let dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(560);
      expect(dbUser?.processedPayments.length).toBe(56);

      // Replay the first payment
      const replayRes = await processSuccessfulPayment(user._id.toString(), 10, 'Pro', firstPaymentId, 'order_0');
      expect(replayRes.success).toBe(true);
      expect(replayRes.alreadyProcessed).toBe(true);

      // Should still be 560 credits and 56 transactions
      dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(560);

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(56);
    });
  });

  describe('D. Different payment IDs concurrently', () => {
    it('should credit all valid concurrent payments independently', async () => {
      const user = await User.create({ 
        name: 'Test User', 
        email: `test_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'free', 
        monthlyCredits: 0, 
        purchasedCredits: 0,
        lastCreditReset: new Date() 
      });

      // Fire 5 distinct concurrent requests
      const promises = Array.from({ length: 5 }).map((_, i) => 
        processSuccessfulPayment(user._id.toString(), 100, 'Pro', `pay_diff_${i}`, `order_${i}`)
      );

      const results = await Promise.all(promises);

      // All should be processed successfully
      expect(results.every(r => r.alreadyProcessed === false)).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(500); // 5 * 100

      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(5);
    });
  });

  describe('E. Duplicate transaction constraint & F. Failure recovery (P3 Ledger desync)', () => {
    it('should recover missing ledger entry if user credits were granted but transaction crashed', async () => {
      const user = await User.create({ 
        name: 'Test User', 
        email: `test_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'free', 
        monthlyCredits: 0, 
        purchasedCredits: 0,
        lastCreditReset: new Date() 
      });
      const paymentId = 'pay_p3_1';
      
      // Simulate credit grant but missing ledger entry by directly manipulating user DB
      await User.updateOne(
        { _id: user._id },
        { 
          $inc: { purchasedCredits: 100 },
          $push: { processedPayments: paymentId }
        }
      );

      // Now Razorpay retries the webhook because we presumably crashed before returning 200 OK
      const res = await processSuccessfulPayment(user._id.toString(), 100, 'Pro', paymentId, 'order_3');
      
      expect(res.success).toBe(true);
      expect(res.alreadyProcessed).toBe(true); // Recognizes it was already processed

      // The recovery mechanism should have created the missing CreditTransaction!
      const txns = await CreditTransaction.find({ userId: user._id });
      expect(txns.length).toBe(1);
      expect(txns[0].razorpayPaymentId).toBe(paymentId);
      
      // Credits remain the same
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(100);
    });

    it('should ignore duplicate key error and succeed if an inconsistent duplicate transaction exists', async () => {
      const user = await User.create({ 
        name: 'Test User', 
        email: `test_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'free', 
        monthlyCredits: 0, 
        purchasedCredits: 0,
        lastCreditReset: new Date() 
      });
      const paymentId = 'pay_fatal_1';

      // Pre-create the transaction WITHOUT adding it to User document's processedPayments.
      await CreditTransaction.create({
        userId: user._id,
        type: 'purchase',
        amount: 100,
        description: 'Purchased Pro',
        razorpayPaymentId: paymentId,
        razorpayOrderId: 'order_fatal'
      });

      // The service should catch the 11000 error, log it, and safely proceed.
      const res = await processSuccessfulPayment(user._id.toString(), 100, 'Pro', paymentId, 'order_fatal');
      expect(res.success).toBe(true);

      // Verify the user received the credits (unlike the old logic which rolled them back)
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(100);
      expect(dbUser?.processedPayments).toContain(paymentId);
    });
  });

  describe('G. Monthly Credit Reset TOCTOU', () => {
    it('should not overwrite concurrent credit purchases when resetting monthly credits', async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const user = await User.create({ 
        name: 'Test User TOCTOU', 
        email: `test_toctou_${Date.now()}_${Math.random()}@test.com`, 
        password: 'password123',
        plan: 'pro', // reset should be 100
        monthlyCredits: 10, 
        purchasedCredits: 0,
        lastCreditReset: lastMonth 
      });

      const paymentId = 'pay_toctou_1';

      const userInstance = await User.findById(user._id);
      
      // Fire both the checkAndResetMonthlyCredits AND processSuccessfulPayment concurrently
      const [resetResult, paymentResult] = await Promise.all([
        userInstance!.checkAndResetMonthlyCredits(),
        processSuccessfulPayment(user._id.toString(), 500, 'Pro', paymentId, 'order_toctou')
      ]);

      expect(resetResult).toBe(true);
      expect(paymentResult.success).toBe(true);

      const dbUser = await User.findById(user._id);
      
      // With V2 model, the monthly reset and purchased increment are perfectly orthogonal.
      // Reset sets monthlyCredits to 100. Payment adds 500 to purchasedCredits.
      // Total virtual credits should be EXACTLY 600, deterministically.
      expect(dbUser?.credits).toBe(600);
      expect(dbUser?.monthlyCredits).toBe(100);
      expect(dbUser?.purchasedCredits).toBe(500);
    });
  });
});
