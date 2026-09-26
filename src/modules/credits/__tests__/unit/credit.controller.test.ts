import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  verifyPayment,
  getCreditBalance,
  simulatePaymentSuccess
} from '../../credit.controller';
import User from '../../../users/user.model';
import CreditTransaction from '../../credit.model';
import razorpay from '../../../../shared/integrations/razorpay/razorpay.client';
import * as creditService from '../../credit.service';
import env from '../../../../config/env';
import { CREDIT_PLANS } from '../../../../shared/constants/credit-plans';

jest.mock('../../../users/user.model');
jest.mock('../../credit.model');
jest.mock('../../credit.service');
jest.mock('../../../../shared/integrations/razorpay/razorpay.client', () => {
  return {
    orders: {
      create: jest.fn(),
      fetch: jest.fn()
    },
    payments: {
      fetch: jest.fn()
    }
  };
});

describe('Credit Controller Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    req = { body: {}, params: {}, query: {} };
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('getCreditPlans', () => {
    test('should return all credit plans', async () => {
      (req as any).user = { _id: 'user-1' };
      await getCreditPlans(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(CREDIT_PLANS);
    });
  });

  describe('getCreditHistory', () => {
    test('should return 401 if user is not authorized', async () => {
      req.user = undefined;

      await getCreditHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized'
      }));
    });

    test('should return paginated credit history for authorized user', async () => {
      (req as any).user = { _id: 'user-1' };
      req.query = { page: '2', limit: '5' };

      const mockTransactions = [{ _id: 'tx-1', amount: 25 }];
      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          skip: jest.fn().mockResolvedValue(mockTransactions)
        })
      });
      (CreditTransaction.find as jest.Mock).mockReturnValue({ sort: sortMock });
      (CreditTransaction.countDocuments as jest.Mock).mockResolvedValue(12);

      await getCreditHistory(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        transactions: mockTransactions,
        totalPages: 3,
        currentPage: 2,
        total: 12
      }));
    });

    test('should return 500 when database error occurs', async () => {
      (req as any).user = { _id: 'user-1' };
      (CreditTransaction.find as jest.Mock).mockImplementation(() => {
        throw new Error('Database down');
      });

      await getCreditHistory(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Failed to fetch credit history'
      }));
    });
  });

  describe('purchaseCredits', () => {
    test('should return 400 if planId is missing', async () => {
      (req as any).user = { _id: 'user-1' };
      req.body = {};

      await purchaseCredits(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_PLAN_ID'
      }));
    });

    test('should return 400 if planId is invalid', async () => {
      (req as any).user = { _id: 'user-1' };
      req.body = { planId: 'nonexistent-plan' };

      await purchaseCredits(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_PLAN_ID'
      }));
    });

    test('should return 404 if user not found', async () => {
      (req as any).user = { _id: 'missing-user-id' };
      req.body = { planId: 'starter' };
      (User.findById as jest.Mock).mockResolvedValue(null);

      await purchaseCredits(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'USER_NOT_FOUND'
      }));
    });

    test('should return 500 if Razorpay order creation fails', async () => {
      (req as any).user = { _id: 'user-12345678' };
      req.body = { planId: 'starter' };
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'user-12345678',
        email: 'user@example.com',
        name: 'User Name'
      });

      const razorpayError: any = new Error('Gateway timeout');
      razorpayError.statusCode = 400;
      razorpayError.description = 'Invalid currency';
      (razorpay!.orders.create as jest.Mock).mockRejectedValue(razorpayError);

      await purchaseCredits(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_ORDER_PARAMS',
        message: 'Invalid currency'
      }));
    });

    test('should create Razorpay order and return checkout details on success', async () => {
      (req as any).user = { _id: 'user-12345678' };
      req.body = { planId: 'starter' };
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'user-12345678',
        email: 'user@example.com',
        name: 'User Name'
      });

      (razorpay!.orders.create as jest.Mock).mockResolvedValue({
        id: 'order_rzp_123',
        amount: 9900,
        currency: 'INR'
      });

      await purchaseCredits(req as Request, res as Response);

      expect(razorpay!.orders.create).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        orderId: 'order_rzp_123',
        amount: 9900,
        currency: 'INR',
        planName: 'Starter Pack'
      }));
    });
  });

  describe('verifyPayment', () => {
    test('should return 400 if verification fields are missing', async () => {
      req.body = { razorpay_order_id: 'ord_1' };

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'MISSING_VERIFICATION_DATA'
      }));
    });

    test('should return 400 if signature verification fails', async () => {
      req.body = {
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'invalid-signature'
      };

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_SIGNATURE'
      }));
    });

    test('should return 400 if Razorpay order lookup fails', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockRejectedValue(new Error('Order not found'));

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_ORDER_ID'
      }));
    });

    test('should return 400 if Razorpay payment lookup fails', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({ id: orderId });
      (razorpay!.payments.fetch as jest.Mock).mockRejectedValue(new Error('Payment not found'));

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_PAYMENT_ID'
      }));
    });

    test('should return 400 if payment order_id mismatches requested order_id', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({ id: orderId });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: 'different_order'
      });

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'ORDER_MISMATCH'
      }));
    });

    test('should return 400 if payment status is not captured', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({ id: orderId });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'authorized'
      });

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PAYMENT_NOT_CAPTURED'
      }));
    });

    test('should return 403 if order notes.userId does not match authenticated user', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      (req as any).user = { _id: 'attacker_user_id' };
      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: orderId,
        notes: { userId: 'victim_user_id', planId: 'starter', credits: '25' }
      });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      await verifyPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'UNAUTHORIZED_ACCESS'
      }));
    });

    test('should handle alreadyProcessed gracefully and return updated credits', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      (req as any).user = { _id: 'legit_user' };
      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: orderId,
        notes: { userId: 'legit_user', planId: 'starter', credits: '25' }
      });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });
      (User.findById as jest.Mock).mockResolvedValue({ _id: 'legit_user' });
      (creditService.processSuccessfulPayment as jest.Mock).mockResolvedValue({
        success: true,
        alreadyProcessed: true,
        user: { credits: 50 }
      });

      await verifyPayment(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Payment verified successfully (already processed)',
        credits: 50
      }));
    });

    test('should credit user and return success on valid first-time payment verification', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      (req as any).user = { _id: 'legit_user' };
      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: orderId,
        notes: { userId: 'legit_user', planId: 'starter', credits: '25' }
      });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });
      (User.findById as jest.Mock).mockResolvedValue({ _id: 'legit_user' });
      (creditService.processSuccessfulPayment as jest.Mock).mockResolvedValue({
        success: true,
        alreadyProcessed: false,
        user: { _id: 'legit_user', credits: 28 }
      });

      await verifyPayment(req as Request, res as Response);

      expect(creditService.processSuccessfulPayment).toHaveBeenCalledWith(
        'legit_user',
        25,
        'Starter Pack',
        paymentId,
        orderId
      );
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        credits: 28,
        purchased: 25,
        transactionId: paymentId
      }));
    });
  });

  describe('getCreditBalance', () => {
    test('should return 404 if user not found', async () => {
      (req as any).user = { _id: 'missing-user' };
      (User.findById as jest.Mock).mockResolvedValue(null);

      await getCreditBalance(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'USER_NOT_FOUND'
      }));
    });

    test('should return credit balance and plan for user', async () => {
      (req as any).user = { _id: 'valid-user' };
      const mockUser = {
        credits: 15,
        plan: 'starter',
        lastCreditReset: new Date(),
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await getCreditBalance(req as Request, res as Response);

      expect(mockUser.checkAndResetMonthlyCredits).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        credits: 15,
        plan: 'starter'
      }));
    });
  });

  describe('simulatePaymentSuccess', () => {
    test('should reject in production environment', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await simulatePaymentSuccess(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'DEVELOPMENT_ONLY'
      }));

      process.env.NODE_ENV = oldEnv;
    });

    test('should return 400 for invalid planId', async () => {
      req.body = { planId: 'invalid' };
      await simulatePaymentSuccess(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INVALID_PLAN_ID'
      }));
    });

    test('should simulate payment and add credits in dev mode', async () => {
      (req as any).user = { _id: 'sim-user' };
      req.body = { planId: 'starter' };

      const mockUser = {
        _id: 'sim-user',
        purchasedCredits: 0,
        credits: 28,
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      (CreditTransaction.create as jest.Mock).mockResolvedValue(true);

      await simulatePaymentSuccess(req as Request, res as Response);

      expect(mockUser.purchasedCredits).toBe(25);
      expect(mockUser.save).toHaveBeenCalled();
      expect(CreditTransaction.create).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        credits: 28,
        purchased: 25
      }));
    });
  });
});
