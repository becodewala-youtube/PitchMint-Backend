import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  upgradeUserToPremium,
  verifyPremiumPayment,
  simulatePremiumUpgrade
} from '../payment.controller';
import User from '../../users/user.model';
import razorpay from '../../../shared/integrations/razorpay/razorpay.client';
import env from '../../../config/env';

jest.mock('../../users/user.model');
jest.mock('../../../shared/integrations/razorpay/razorpay.client', () => {
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

describe('Payment Controller Unit Tests', () => {
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

  describe('upgradeUserToPremium', () => {
    test('should return 404 if user not found', async () => {
      (req as any).user = { _id: 'missing-user' };
      (User.findById as jest.Mock).mockResolvedValue(null);

      await upgradeUserToPremium(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });

    test('should return 500 when razorpay order creation fails', async () => {
      (req as any).user = { _id: 'user-12345678' };
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'user-12345678',
        email: 'test@example.com',
        name: 'Test'
      });

      const rzpErr: any = new Error('Gateway Error');
      rzpErr.error = { description: 'Authentication failed for merchant' };
      (razorpay!.orders.create as jest.Mock).mockRejectedValue(rzpErr);

      await upgradeUserToPremium(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        code: 'PREMIUM_ORDER_CREATION_FAILED'
      }));
    });

    test('should create premium upgrade order and return details on success', async () => {
      (req as any).user = { _id: 'user-12345678' };
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'user-12345678',
        email: 'test@example.com',
        name: 'Test'
      });

      (razorpay!.orders.create as jest.Mock).mockResolvedValue({
        id: 'order_prem_123',
        amount: 2900,
        currency: 'INR'
      });

      await upgradeUserToPremium(req as Request, res as Response);

      expect(razorpay!.orders.create).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        orderId: 'order_prem_123',
        amount: 2900,
        currency: 'INR'
      }));
    });
  });

  describe('verifyPremiumPayment', () => {
    test('should return 400 if verification fields are missing', async () => {
      req.body = { razorpay_order_id: 'ord_1' };

      await verifyPremiumPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Missing payment verification data'
      }));
    });

    test('should return 400 if signature does not match', async () => {
      req.body = {
        razorpay_order_id: 'order_1',
        razorpay_payment_id: 'pay_1',
        razorpay_signature: 'wrong-signature'
      };

      await verifyPremiumPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid payment signature'
      }));
    });

    test('should return 400 if order_id from payment mismatches requested order_id', async () => {
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
        order_id: 'other_order'
      });

      await verifyPremiumPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Payment order mismatch'
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

      await verifyPremiumPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Payment not completed'
      }));
    });

    test('should return 403 if authenticated user does not match order notes.userId', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      (req as any).user = { _id: 'hacker_user' };
      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: orderId,
        notes: { userId: 'real_user' }
      });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });

      await verifyPremiumPayment(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Unauthorized access'
      }));
    });

    test('should return already processed if user is already premium', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      (req as any).user = { _id: 'real_user' };
      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: orderId,
        notes: { userId: 'real_user' }
      });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'real_user',
        name: 'Real User',
        email: 'real@example.com',
        isPremium: true
      });

      await verifyPremiumPayment(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'User already has premium access'
      }));
    });

    test('should upgrade user to premium successfully on valid payment', async () => {
      const orderId = 'order_valid';
      const paymentId = 'pay_valid';
      const signature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(orderId + '|' + paymentId)
        .digest('hex');

      (req as any).user = { _id: 'real_user' };
      req.body = {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: orderId,
        notes: { userId: 'real_user' }
      });
      (razorpay!.payments.fetch as jest.Mock).mockResolvedValue({
        id: paymentId,
        order_id: orderId,
        status: 'captured'
      });
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'real_user',
        isPremium: false
      });
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({
        _id: 'real_user',
        name: 'Real User',
        email: 'real@example.com',
        isPremium: true
      });

      await verifyPremiumPayment(req as Request, res as Response);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('real_user', { isPremium: true }, { new: true });
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Premium upgrade successful'
      }));
    });
  });

  describe('simulatePremiumUpgrade', () => {
    test('should reject in production environment', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await simulatePremiumUpgrade(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Demo payments are only available in development or test mode'
      }));

      process.env.NODE_ENV = prevEnv;
    });

    test('should upgrade user in development mode', async () => {
      (req as any).user = { _id: 'sim_user' };
      const mockUser = {
        _id: 'sim_user',
        name: 'Sim User',
        email: 'sim@example.com',
        isPremium: false,
        plan: 'free',
        save: jest.fn().mockResolvedValue(true)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await simulatePremiumUpgrade(req as Request, res as Response);

      expect(mockUser.isPremium).toBe(true);
      expect(mockUser.plan).toBe('premium');
      expect(mockUser.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('Demo upgrade successful')
      }));
    });
  });
});
