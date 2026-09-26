import request from 'supertest';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';
import { createTestUser, createAuthHeader, generatePaymentSignature, generateWebhookSignature } from '../setup/test-helpers';
import User from '../../src/modules/users/user.model';
import CreditTransaction from '../../src/modules/credits/credit.model';
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

describe('Payments Integration Tests', () => {
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

  describe('POST /api/payment/create-checkout-session', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/payment/create-checkout-session');

      expect(res.status).toBe(401);
    });

    it('should create Razorpay order for premium upgrade and return order details', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const mockOrder = {
        id: 'order_prem_123',
        amount: 2900,
        currency: 'INR'
      };

      mockOrders.create.mockResolvedValue(mockOrder);

      const res = await request(app)
        .post('/api/payment/create-checkout-session')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orderId).toBe(mockOrder.id);
      expect(res.body.amount).toBe(2900);
      expect(res.body.keyId).toBe(env.RAZORPAY_KEY_ID);
    });
  });

  describe('POST /api/payment/verify-premium', () => {
    it('should reject verification with missing data or invalid signature', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      // Missing data
      const resMissing = await request(app)
        .post('/api/payment/verify-premium')
        .set(authHeader)
        .send({});

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.message).toContain('Missing payment verification data');

      // Invalid signature
      const resInvalid = await request(app)
        .post('/api/payment/verify-premium')
        .set(authHeader)
        .send({
          razorpay_order_id: 'order_prem_test',
          razorpay_payment_id: 'pay_prem_test',
          razorpay_signature: 'invalid_sha256_signature'
        });

      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body.message).toBe('Invalid payment signature');
    });

    it('should reject verification if order belongs to a different user', async () => {
      const owner = await createTestUser({ email: 'owner_prem@example.com' });
      const attacker = await createTestUser({ email: 'attacker_prem@example.com' });
      const authHeaderAttacker = createAuthHeader(attacker._id);

      const orderId = 'order_cross_user_1';
      const paymentId = 'pay_cross_user_1';
      const signature = generatePaymentSignature(orderId, paymentId);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        notes: { userId: owner._id.toString() }
      });

      mockPayments.fetch.mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      const res = await request(app)
        .post('/api/payment/verify-premium')
        .set(authHeaderAttacker)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Unauthorized access');
    });

    it('should verify payment and upgrade user to premium status', async () => {
      const user = await createTestUser({ isPremium: false });
      const authHeader = createAuthHeader(user._id);

      const orderId = 'order_prem_success_1';
      const paymentId = 'pay_prem_success_1';
      const signature = generatePaymentSignature(orderId, paymentId);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        notes: { userId: user._id.toString() }
      });

      mockPayments.fetch.mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      const res = await request(app)
        .post('/api/payment/verify-premium')
        .set(authHeader)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Premium upgrade successful');
      expect(res.body.user.isPremium).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.isPremium).toBe(true);
    });

    it('should return already premium message if user has already upgraded', async () => {
      const user = await createTestUser({ isPremium: true });
      const authHeader = createAuthHeader(user._id);

      const orderId = 'order_prem_dup_1';
      const paymentId = 'pay_prem_dup_1';
      const signature = generatePaymentSignature(orderId, paymentId);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        notes: { userId: user._id.toString() }
      });

      mockPayments.fetch.mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      const res = await request(app)
        .post('/api/payment/verify-premium')
        .set(authHeader)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('already has premium access');
    });
  });

  describe('POST /api/payment/webhook', () => {
    it('should reject webhook request with invalid signature', async () => {
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_test' } } }
      });

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', 'invalid_signature')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid signature');
    });

    it('should process payment.captured for credit_purchase, grant credits, and be idempotent on replay', async () => {
      const user = await createTestUser({ purchasedCredits: 0 });

      const paymentId = 'pay_hook_cred_999';
      const orderId = 'order_hook_cred_999';

      const webhookPayloadObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 9900,
              status: 'captured'
            }
          }
        }
      };

      const rawPayload = JSON.stringify(webhookPayloadObj);
      const validSignature = generateWebhookSignature(rawPayload);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        notes: {
          userId: user._id.toString(),
          credits: '25',
          planId: 'starter',
          type: 'credit_purchase'
        }
      });

      // 1. First webhook delivery
      const res1 = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res1.status).toBe(200);
      expect(res1.body.received).toBe(true);

      const dbUser1 = await User.findById(user._id);
      expect(dbUser1?.purchasedCredits).toBe(25);
      expect(dbUser1?.processedPayments).toContain(paymentId);

      const txnCount = await CreditTransaction.countDocuments({ razorpayPaymentId: paymentId });
      expect(txnCount).toBe(1);

      // 2. Duplicate webhook delivery replay
      const res2 = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res2.status).toBe(200);
      expect(res2.body.received).toBe(true);

      // Verify user credits were NOT doubled
      const dbUser2 = await User.findById(user._id);
      expect(dbUser2?.purchasedCredits).toBe(25);
      expect(await CreditTransaction.countDocuments({ razorpayPaymentId: paymentId })).toBe(1);
    });

    it('should process payment.captured for premium_upgrade webhook', async () => {
      const user = await createTestUser({ isPremium: false });

      const paymentId = 'pay_hook_prem_777';
      const orderId = 'order_hook_prem_777';

      const webhookPayloadObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 2900,
              status: 'captured'
            }
          }
        }
      };

      const rawPayload = JSON.stringify(webhookPayloadObj);
      const validSignature = generateWebhookSignature(rawPayload);

      mockOrders.fetch.mockResolvedValue({
        id: orderId,
        notes: {
          userId: user._id.toString(),
          type: 'premium_upgrade'
        }
      });

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.isPremium).toBe(true);
    });

    it('should safely handle payment.failed and other events without errors', async () => {
      const webhookPayloadObj = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_fail_1',
              order_id: 'order_fail_1',
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Payment was declined'
            }
          }
        }
      };

      const rawPayload = JSON.stringify(webhookPayloadObj);
      const validSignature = generateWebhookSignature(rawPayload);

      const res = await request(app)
        .post('/api/payment/webhook')
        .set('x-razorpay-signature', validSignature)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe('POST /api/payment/simulate-premium-success', () => {
    it('should upgrade user to premium in test environment', async () => {
      const user = await createTestUser({ isPremium: false, plan: 'free' });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/payment/simulate-premium-success')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.isPremium).toBe(true);
      expect(res.body.user.plan).toBe('premium');

      const dbUser = await User.findById(user._id);
      expect(dbUser?.isPremium).toBe(true);
      expect(dbUser?.plan).toBe('premium');
    });
  });
});
