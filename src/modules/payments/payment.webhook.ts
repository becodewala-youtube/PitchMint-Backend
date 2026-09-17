import { Request, Response } from 'express';
import crypto from 'crypto';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import razorpay from '../../shared/integrations/razorpay/razorpay.client';
import env from '../../config/env';
import logger from '../../config/logger';

export async function handlePaymentCaptured(payment: any): Promise<void> {
  try {
    logger.info('✅ Payment captured:', {
      id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      status: payment.status
    });

    if (!razorpay) return;
    const order: any = await razorpay.orders.fetch(payment.order_id);
    const { userId, planId, credits, type } = order.notes;

    if (type === 'credit_purchase') {
      const existingTransaction = await CreditTransaction.findOne({
        razorpayPaymentId: payment.id
      });

      if (existingTransaction) {
        logger.info(`Payment ${payment.id} already processed`);
        return;
      }

      const user = await User.findById(userId);
      
      if (user) {
        user.credits = (user.credits || 0) + parseInt(credits, 10);
        await user.save();

        await CreditTransaction.create({
          userId: user._id,
          type: 'purchase',
          amount: parseInt(credits, 10),
          description: `Purchased ${credits} credits via webhook`,
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id
        });

        logger.info(`✅ Webhook: User ${userId} credited with ${credits} credits`);
      }
    } else if (type === 'premium_upgrade') {
      await User.findByIdAndUpdate(userId, { isPremium: true });
      logger.info(`✅ Webhook: User ${userId} upgraded to premium`);
    }
  } catch (error: any) {
    logger.error('Error handling payment.captured:', error);
  }
}

export async function handlePaymentFailed(payment: any): Promise<void> {
  logger.error('❌ Payment failed:', {
    id: payment.id,
    order_id: payment.order_id,
    error_code: payment.error_code,
    error_description: payment.error_description
  });
}

export async function handleOrderPaid(order: any): Promise<void> {
  logger.info('✅ Order paid:', {
    id: order.id,
    amount: order.amount,
    status: order.status
  });
}

export const processRazorpayWebhook = async (req: Request, res: Response): Promise<any> => {
  const webhookSignature = req.headers['x-razorpay-signature'] as string;
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('❌ RAZORPAY_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let body: any;
  let event: string;
  
  try {
    const rawBody = req.body;
    body = JSON.parse(rawBody.toString());
    
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    
    if (expectedSignature !== webhookSignature) {
      throw new Error('Invalid signature');
    }

    event = body.event;
    logger.info(`✅ Webhook verified: ${event}`);
    
  } catch (err: any) {
    logger.error('❌ Razorpay webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle Razorpay events
  try {
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(body.payload.payment.entity);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(body.payload.payment.entity);
        break;
      
      case 'order.paid':
        await handleOrderPaid(body.payload.order.entity);
        break;
      
      default:
        logger.warn(`Unhandled event type: ${event}`);
    }
  } catch (error: any) {
    logger.error('Error processing webhook event:', error);
    return res.status(500).send('Webhook processing failed');
  }

  res.status(200).json({ received: true });
};

export default {
  processRazorpayWebhook,
  handlePaymentCaptured,
  handlePaymentFailed,
  handleOrderPaid
};
