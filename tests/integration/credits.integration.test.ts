import request from 'supertest';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';
import { createTestUser, createAuthHeader, generatePaymentSignature } from '../setup/test-helpers';
import User from '../../src/modules/users/user.model';
import CreditTransaction from '../../src/modules/credits/credit.model';
import { atomicDeductCredits, refundCredits } from '../../src/shared/middleware/credit.middleware';
import { CREDIT_PLANS } from '../../src/shared/constants/credit-plans';
import env from '../../src/config/env';

const mockOrders = {
  create: jest.fn(),
  fetch: jest.fn()
};
const mockPayments = {
  fetch: jest.fn()
};

jest.mock('../../src/shared/integrations/razorpay/razorpay.client', () => ({
  __esModule: true,
  default: {
    orders: mockOrders,
    payments: mockPayments
  },
  razorpay: {
    orders: mockOrders,
    payments: mockPayments
  }
}));

import app from '../setup/test-app';

describe('Credits Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('GET /api/credits/plans', () => {
    it('should return available credit plans for authenticated user', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .get('/api/credits/plans')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.starter).toBeDefined();
      expect(res.body.starter.credits).toBe(25);
      expect(res.body.pro.credits).toBe(100);
      expect(res.body.premium.credits).toBe(500);
    });
  });

  describe('GET /api/credits/balance', () => {
    it('should return user balance including monthly, purchased, and total credits', async () => {
      const user = await createTestUser({
        monthlyCredits: 3,
        purchasedCredits: 50
      });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .get('/api/credits/balance')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.credits).toBe(53);
    });
  });

  describe('GET /api/credits/history', () => {
    it('should return paginated credit transactions for authenticated user', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      // Create ledger transactions
      await CreditTransaction.create({
        userId: user._id,
        type: 'purchase',
        amount: 25,
        description: 'Purchased Starter Pack',
        razorpayPaymentId: 'pay_hist_1',
        razorpayOrderId: 'order_hist_1'
      });

      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for idea_validation',
        deductedFrom: { monthly: 1, purchased: 0 },
        relatedService: 'idea_validation'
      });

      const res = await request(app)
        .get('/api/credits/history?page=1&limit=10')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(2);
      expect(res.body.transactions).toHaveLength(2);
    });
  });

  describe('POST /api/credits/purchase', () => {
    it('should reject purchase with missing or invalid planId', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const resMissing = await request(app)
        .post('/api/credits/purchase')
        .set(authHeader)
        .send({});

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.code).toBe('MISSING_PLAN_ID');

      const resInvalid = await request(app)
        .post('/api/credits/purchase')
        .set(authHeader)
        .send({ planId: 'non_existent_plan' });

      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.code).toBe('INVALID_PLAN_ID');
    });

    it('should create Razorpay order and return checkout details for valid plan', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const mockOrder = {
        id: 'order_mock_test_123',
        amount: 9900,
        currency: 'INR',
        receipt: 'rcpt_123'
      };

      mockOrders.create.mockResolvedValue(mockOrder);

      const res = await request(app)
        .post('/api/credits/purchase')
        .set(authHeader)
        .send({ planId: 'starter' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orderId).toBe(mockOrder.id);
      expect(res.body.amount).toBe(mockOrder.amount);
      expect(res.body.planName).toBe(CREDIT_PLANS.starter.name);
    });
  });

  describe('POST /api/credits/verify-payment', () => {
    it('should reject payment verification if required fields are missing or signature is invalid', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      // Missing fields
      const resMissing = await request(app)
        .post('/api/credits/verify-payment')
        .set(authHeader)
        .send({ razorpay_order_id: 'order_123' });

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.code).toBe('MISSING_VERIFICATION_DATA');

      // Invalid HMAC signature
      const resInvalidSig = await request(app)
        .post('/api/credits/verify-payment')
        .set(authHeader)
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'invalid_tampered_signature_hex'
        });

      expect(resInvalidSig.status).toBe(400);
      expect(resInvalidSig.body.code).toBe('INVALID_SIGNATURE');
    });

    it('should reject payment verification if request user does not match order userId', async () => {
      const legitUser = await createTestUser({ email: 'legit@example.com' });
      const attackerUser = await createTestUser({ email: 'attacker_cred@example.com' });
      const authHeaderAttacker = createAuthHeader(attackerUser._id);

      const orderId = 'order_tamper_user_1';
      const paymentId = 'pay_tamper_user_1';
      const validSignature = generatePaymentSignature(orderId, paymentId);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        amount: 9900,
        notes: {
          userId: legitUser._id.toString(),
          credits: '25',
          planName: 'Starter Pack',
          planId: 'starter'
        }
      });

      mockPayments.fetch.mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      const res = await request(app)
        .post('/api/credits/verify-payment')
        .set(authHeaderAttacker)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Unauthorized access');
    });

    it('should successfully verify payment, increment purchasedCredits, write transaction ledger, and handle duplicate idempotently', async () => {
      const user = await createTestUser({ purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      const orderId = 'order_valid_cred_100';
      const paymentId = 'pay_valid_cred_100';
      const validSignature = generatePaymentSignature(orderId, paymentId);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        amount: 9900,
        notes: {
          userId: user._id.toString(),
          credits: '25',
          planName: 'Starter Pack',
          planId: 'starter'
        }
      });

      mockPayments.fetch.mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      // 1. Initial verification
      const res1 = await request(app)
        .post('/api/credits/verify-payment')
        .set(authHeader)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature
        });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.purchased).toBe(25);
      expect(res1.body.credits).toBe(28); // 3 monthly + 25 purchased

      // Verify DB state
      const dbUser1 = await User.findById(user._id);
      expect(dbUser1?.purchasedCredits).toBe(25);
      expect(dbUser1?.processedPayments).toContain(paymentId);

      const txn1 = await CreditTransaction.findOne({ razorpayPaymentId: paymentId });
      expect(txn1).not.toBeNull();
      expect(txn1?.amount).toBe(25);
      expect(txn1?.type).toBe('purchase');

      // 2. Duplicate verification call with same paymentId
      const res2 = await request(app)
        .post('/api/credits/verify-payment')
        .set(authHeader)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature
        });

      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('already processed');

      // Verify no double-crediting
      const dbUser2 = await User.findById(user._id);
      expect(dbUser2?.purchasedCredits).toBe(25);

      const txnCount = await CreditTransaction.countDocuments({ razorpayPaymentId: paymentId });
      expect(txnCount).toBe(1);
    });
  });

  describe('Dual-Pool Cascading Deductions and Refund Invariants', () => {
    it('should deduct monthly credits first, then purchased credits for remainder', async () => {
      const user = await createTestUser({
        monthlyCredits: 2,
        purchasedCredits: 10
      });

      // Deduct 3 credits: should take 2 from monthly, 1 from purchased
      const deduction = await atomicDeductCredits(user._id, 3, 'pitch_deck');
      expect(deduction.success).toBe(true);
      expect(deduction.monthly).toBe(2);
      expect(deduction.purchased).toBe(1);
      expect(deduction.split).toEqual({ monthly: 2, purchased: 1 });

      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.monthlyCredits).toBe(0);
      expect(updatedUser?.purchasedCredits).toBe(9);
      expect(updatedUser?.credits).toBe(9);

      // Check transaction ledger
      const txn = await CreditTransaction.findOne({ userId: user._id, type: 'usage' });
      expect(txn?.deductedFrom).toEqual({ monthly: 2, purchased: 1 });
    });

    it('should refund credits back to their exact originating pools idempotently', async () => {
      const user = await createTestUser({
        monthlyCredits: 0,
        purchasedCredits: 5
      });

      const refundId = 'ref_integration_test_1';
      const split = { monthly: 2, purchased: 1 };

      // 1. Process refund
      const refundRes1 = await refundCredits(user._id, split, 'canvas', refundId);
      expect(refundRes1.success).toBe(true);
      expect(refundRes1.alreadyProcessed).toBe(false);

      const dbUser1 = await User.findById(user._id);
      expect(dbUser1?.monthlyCredits).toBe(2);
      expect(dbUser1?.purchasedCredits).toBe(6); // 5 + 1
      expect(dbUser1?.processedRefunds).toContain(refundId);

      // 2. Duplicate refund attempt with same refundId
      const refundRes2 = await refundCredits(user._id, split, 'canvas', refundId);
      expect(refundRes2.success).toBe(true);
      expect(refundRes2.alreadyProcessed).toBe(true);

      const dbUser2 = await User.findById(user._id);
      expect(dbUser2?.monthlyCredits).toBe(2);
      expect(dbUser2?.purchasedCredits).toBe(6); // unchanged!
    });
  });

  describe('Monthly Credit Auto-Reset on UTC Boundary', () => {
    it('should reset monthlyCredits to plan default when lastCreditReset is in a previous month', async () => {
      // Set lastCreditReset to 45 days ago
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 45);

      const user = await createTestUser({
        monthlyCredits: 0,
        purchasedCredits: 10,
        lastCreditReset: pastDate,
        plan: 'free'
      });

      // Calling checkAndResetMonthlyCredits
      const wasReset = await user.checkAndResetMonthlyCredits();
      expect(wasReset).toBe(true);

      const freshUser = await User.findById(user._id);
      expect(freshUser?.monthlyCredits).toBe(3);
      expect(freshUser?.purchasedCredits).toBe(10);
      expect(freshUser?.credits).toBe(13);
    });

    it('should NOT reset monthlyCredits if already reset in the current month', async () => {
      const user = await createTestUser({
        monthlyCredits: 1,
        purchasedCredits: 10,
        lastCreditReset: new Date(),
        plan: 'free'
      });

      const wasReset = await user.checkAndResetMonthlyCredits();
      expect(wasReset).toBe(false);

      const freshUser = await User.findById(user._id);
      expect(freshUser?.monthlyCredits).toBe(1);
    });
  });
});
