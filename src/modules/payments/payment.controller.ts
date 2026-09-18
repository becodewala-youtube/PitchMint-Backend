import { Request, Response } from 'express';
import crypto from 'crypto';
import User from '../users/user.model';
import razorpay from '../../shared/integrations/razorpay/razorpay.client';
import logger from '../../config/logger';
import env from '../../config/env';
import { processRazorpayWebhook } from './payment.webhook';

// @desc    Create Razorpay order for premium upgrade
// @route   POST /api/payment/create-checkout-session
// @access  Private
export const upgradeUserToPremium = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await User.findById(req.user?._id);
    
    if (!user) {
      console.error('❌ User not found:', req.user?._id);
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Payment service not available'
      });
    }

    // Create shorter receipt string (under 40 characters)
    const shortUserId = user._id.toString().slice(-8);
    const shortTimestamp = Date.now().toString().slice(-8);
    const receipt = `prem_${shortUserId}_${shortTimestamp}`;

    const orderData: any = {
      amount: 2900, 
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: user._id.toString(),
        type: 'premium_upgrade',
        userEmail: user.email,
        userName: user.name
      },
      payment_capture: 1
    };

    if (orderData.receipt.length > 40) {
      console.error('Receipt too long, using fallback');
      orderData.receipt = `prem_${Date.now()}`.slice(0, 40);
    }

    const order: any = await razorpay.orders.create(orderData);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID,
      userEmail: user.email,
      userName: user.name
    });
  } catch (error: any) {
    console.error('❌ Premium upgrade error:', error);
    logger.error('Error creating premium upgrade order:', error);
    
    let errorMessage = 'Error processing payment';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.description) {
      errorMessage = error.description;
    }

    if (errorMessage.toLowerCase().includes('authentication failed')) {
      errorMessage = 'Razorpay gateway error: Invalid or expired API credentials in server configuration. Please check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env, or use Demo Upgrade.';
    }
    
    res.status(500).json({ 
      success: false,
      message: errorMessage,
      code: 'PREMIUM_ORDER_CREATION_FAILED',
      error: env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Verify premium upgrade payment
// @route   POST /api/payment/verify-premium
// @access  Private
export const verifyPremiumPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing payment verification data'
      });
    }

    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Payment service not available'
      });
    }

    // Verify payment signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('❌ Premium payment signature verification failed');
      return res.status(400).json({ 
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Get order details
    const order: any = await razorpay.orders.fetch(razorpay_order_id);
    const payment: any = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured') {
      console.warn(`Payment not captured. Status: ${payment.status}`);
      return res.status(400).json({ 
        success: false,
        message: 'Payment not completed',
        status: payment.status
      });
    }

    const { userId } = order.notes;
    
    // Verify user authorization
    if (userId !== req.user?._id?.toString()) {
      console.error('❌ Unauthorized premium payment verification');
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Check if user is already premium (duplicate processing check)
    const currentUser = await User.findById(userId);
    if (currentUser?.isPremium) {
      return res.json({
        success: true,
        message: 'User already has premium access',
        user: {
          _id: currentUser._id,
          name: currentUser.name,
          email: currentUser.email,
          isPremium: currentUser.isPremium
        }
      });
    }

    // Upgrade user to premium
    const user = await User.findByIdAndUpdate(
      userId,
      { isPremium: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`User ${userId} upgraded to premium successfully`);

    res.json({
      success: true,
      message: 'Premium upgrade successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium
      }
    });
  } catch (error: any) {
    console.error('❌ Premium payment verification error:', error);
    logger.error('Premium payment verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Payment verification failed',
      error: env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Simulate premium upgrade payment (development only)
// @route   POST /api/payment/simulate-premium-success
// @access  Private
export const simulatePremiumUpgrade = async (req: Request, res: Response): Promise<any> => {
  try {
    if (env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: 'Demo payments are only available in development mode'
      });
    }

    const user = await User.findById(req.user?._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isPremium = true;
    user.plan = 'premium';
    await user.save();

    logger.info(`Demo: User ${user._id} upgraded to premium successfully`);

    res.json({
      success: true,
      message: 'Demo upgrade successful! You now have Premium access.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isPremium: user.isPremium,
        credits: user.credits,
        plan: user.plan,
        profilePicture: user.profilePicture
      }
    });
  } catch (error: any) {
    logger.error('Demo premium upgrade error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Demo upgrade failed'
    });
  }
};

// @desc    Handle Razorpay webhook for premium upgrades
// @route   POST /api/payment/webhook
// @access  Public
export const handlePaymentWebhook = processRazorpayWebhook;

export default {
  upgradeUserToPremium,
  verifyPremiumPayment,
  handlePaymentWebhook,
  simulatePremiumUpgrade
};
