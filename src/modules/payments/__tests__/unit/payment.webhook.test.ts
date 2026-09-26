import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  processRazorpayWebhook,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleOrderPaid
} from '../../payment.webhook';
import User from '../../../users/user.model';
import razorpay from '../../../../shared/integrations/razorpay/razorpay.client';
import * as creditService from '../../../credits/credit.service';
import env from '../../../../config/env';

jest.mock('../../../users/user.model');
jest.mock('../../../credits/credit.service');
jest.mock('../../../../shared/integrations/razorpay/razorpay.client', () => ({
  orders: {
    fetch: jest.fn()
  }
}));

describe('Payment Webhook Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let sendMock: jest.Mock;

  const webhookSecret = 'test_webhook_secret_123';

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    sendMock = jest.fn();
    req = { headers: {} };
    res = {
      status: statusMock,
      json: jsonMock,
      send: sendMock
    };
    (env as any).RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  });

  const createSignedWebhook = (payload: any) => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    return { rawBody, signature };
  };

  describe('processRazorpayWebhook', () => {
    test('should return 500 if RAZORPAY_WEBHOOK_SECRET is missing', async () => {
      (env as any).RAZORPAY_WEBHOOK_SECRET = '';

      await processRazorpayWebhook(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith('Webhook secret not configured');
    });

    test('should return 400 if signature is invalid', async () => {
      const { rawBody } = createSignedWebhook({ event: 'payment.captured' });
      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': 'invalid_sig' };

      await processRazorpayWebhook(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith('Webhook Error: Invalid signature or payload');
    });

    test('should return 400 if raw body is not valid JSON', async () => {
      const rawBody = Buffer.from('bad-json');
      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': signature };

      await processRazorpayWebhook(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith('Webhook Error: Invalid signature or payload');
    });

    test('should process payment.captured for credit_purchase successfully', async () => {
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_capture_1',
              order_id: 'ord_capture_1',
              amount: 9900,
              status: 'captured'
            }
          }
        }
      };
      const { rawBody, signature } = createSignedWebhook(payload);
      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': signature };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: 'ord_capture_1',
        notes: {
          userId: 'user_webhook_1',
          credits: '25',
          type: 'credit_purchase'
        }
      });
      (creditService.processSuccessfulPayment as jest.Mock).mockResolvedValue({
        success: true,
        alreadyProcessed: false
      });

      await processRazorpayWebhook(req as Request, res as Response);

      expect(creditService.processSuccessfulPayment).toHaveBeenCalledWith(
        'user_webhook_1',
        25,
        '25 credits (webhook)',
        'pay_capture_1',
        'ord_capture_1'
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    test('should process payment.captured for premium_upgrade successfully', async () => {
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_prem_1',
              order_id: 'ord_prem_1',
              amount: 2900,
              status: 'captured'
            }
          }
        }
      };
      const { rawBody, signature } = createSignedWebhook(payload);
      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': signature };

      (razorpay!.orders.fetch as jest.Mock).mockResolvedValue({
        id: 'ord_prem_1',
        notes: {
          userId: 'user_prem_1',
          type: 'premium_upgrade'
        }
      });
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({ _id: 'user_prem_1', isPremium: true });

      await processRazorpayWebhook(req as Request, res as Response);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user_prem_1', { isPremium: true });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    test('should process payment.failed without throwing', async () => {
      const payload = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_fail_1',
              order_id: 'ord_fail_1',
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Card declined'
            }
          }
        }
      };
      const { rawBody, signature } = createSignedWebhook(payload);
      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': signature };

      await processRazorpayWebhook(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    test('should process order.paid event successfully', async () => {
      const payload = {
        event: 'order.paid',
        payload: {
          order: {
            entity: {
              id: 'ord_paid_1',
              amount: 9900,
              status: 'paid'
            }
          }
        }
      };
      const { rawBody, signature } = createSignedWebhook(payload);
      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': signature };

      await processRazorpayWebhook(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });

    test('should handle unhandled event types gracefully', async () => {
      const payload = {
        event: 'refund.processed',
        payload: {}
      };
      const { rawBody, signature } = createSignedWebhook(payload);
      req.body = rawBody;
      req.headers = { 'x-razorpay-signature': signature };

      await processRazorpayWebhook(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ received: true });
    });
  });

  describe('helper functions', () => {
    test('handlePaymentCaptured handles null razorpay instance gracefully', async () => {
      const payment = { id: 'p1', order_id: 'o1', amount: 100, status: 'captured' };
      await expect(handlePaymentCaptured(payment)).resolves.not.toThrow();
    });

    test('handlePaymentFailed logs failed payments without throwing', async () => {
      const payment = { id: 'p1', order_id: 'o1', error_code: 'ERR', error_description: 'Desc' };
      await expect(handlePaymentFailed(payment)).resolves.not.toThrow();
    });

    test('handleOrderPaid logs paid order without throwing', async () => {
      const order = { id: 'o1', amount: 100, status: 'paid' };
      await expect(handleOrderPaid(order)).resolves.not.toThrow();
    });
  });
});
