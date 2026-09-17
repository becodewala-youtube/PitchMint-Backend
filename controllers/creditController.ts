import { Request, Response } from 'express';
import crypto from 'crypto';
import User from '../models/User';
import CreditTransaction from '../models/CreditTransaction';
import Razorpay from 'razorpay';
import logger from '../utils/logger';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Razorpay with validation
let razorpay: any;
try {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials not configured');
  }
  
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  
  logger.info('✅ Razorpay initialized successfully');
} catch (error: any) {
  logger.error('❌ Failed to initialize Razorpay:', error.message);
}

export interface CreditPlan {
  name: string;
  credits: number;
  price: number;
  description: string;
}

// Credit plans
export const CREDIT_PLANS: Record<string, CreditPlan> = {
  starter: {
    name: 'Starter Pack',
    credits: 25,
    price: 9900, // ₹99.00
    description: 'Perfect for testing ideas'
  },
  pro: {
    name: 'Pro Pack',
    credits: 100,
    price: 49900, // ₹499.00
    description: 'Great for active entrepreneurs'
  },
  premium: {
    name: 'Premium Pack',
    credits: 500,
    price: 99900, // ₹999.00
    description: 'For serious startup builders'
  }
};

// @desc    Get credit plans
// @route   GET /api/credits/plans
// @access  Private
export const getCreditPlans = async (req: Request, res: Response): Promise<any> => {
  try {
    logger.info(`User ${req.user?._id} requested credit plans`);
    res.json(CREDIT_PLANS);
  } catch (error: any) {
    logger.error('Get credit plans error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch credit plans',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get user credit history
// @route   GET /api/credits/history
// @access  Private
export const getCreditHistory = async (req: Request, res: Response): Promise<any> => {
  try {
    const { page = 1, limit = 10 } = req.query as { page?: string | number; limit?: string | number };
    
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const transactions = await CreditTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await CreditTransaction.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      transactions,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total
    });
  } catch (error: any) {
    logger.error('Get credit history error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch credit history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Create Razorpay order for credits (Enhanced with debugging)
// @route   POST /api/credits/purchase OR /api/credits/create-checkout-session
// @access  Private
export const purchaseCredits = async (req: Request, res: Response): Promise<any> => {
  try {
    // Check if razorpay is properly initialized
    if (!razorpay) {
      console.error('❌ Razorpay not initialized');
      return res.status(500).json({ 
        success: false,
        message: 'Payment service not available. Check environment variables.',
        code: 'RAZORPAY_NOT_INITIALIZED'
      });
    }

    const { planId } = req.body;
    
    // Validate input
    if (!planId) {
      console.error('❌ Missing planId in request body');
      return res.status(400).json({ 
        success: false,
        message: 'Plan ID is required',
        code: 'MISSING_PLAN_ID'
      });
    }
    
    if (!CREDIT_PLANS[planId]) {
      console.error(`❌ Invalid plan ID: ${planId}`);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid plan selected',
        code: 'INVALID_PLAN_ID',
        availablePlans: Object.keys(CREDIT_PLANS)
      });
    }

    const plan = CREDIT_PLANS[planId];
    
    const user = await User.findById(req.user?._id);
    if (!user) {
      console.error(`❌ User not found: ${req.user?._id}`);
      return res.status(404).json({ 
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Create order data with proper validation
    const shortUserId = user._id.toString().slice(-8);
    const shortTimestamp = Date.now().toString().slice(-8);

    const orderData: any = {
      amount: parseInt(plan.price.toString(), 10),
      currency: 'INR',
      receipt: `ord_${shortUserId}_${shortTimestamp}`,
      notes: {
        userId: user._id.toString(),
        planId: planId,
        credits: plan.credits.toString(),
        type: 'credit_purchase',
        userEmail: user.email,
        userName: user.name
      },
      payment_capture: 1
    };

    if (orderData.receipt.length > 40) {
      console.error('Receipt too long:', orderData.receipt.length);
      orderData.receipt = `ord_${Date.now()}`.slice(0, 40);
    }

    // Additional validation
    if (!orderData.amount || orderData.amount < 100) {
      console.error('❌ Invalid amount:', orderData.amount);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid order amount',
        code: 'INVALID_AMOUNT'
      });
    }

    // Create Razorpay order with detailed error handling
    let order: any;
    try {
      order = await razorpay.orders.create(orderData);
    } catch (razorpayError: any) {
      console.error('❌ Razorpay order creation failed - Full error:', razorpayError);
      console.error('❌ Error details:', {
        message: razorpayError.message,
        statusCode: razorpayError.statusCode,
        description: razorpayError.description,
        source: razorpayError.source,
        step: razorpayError.step,
        reason: razorpayError.reason,
        field: razorpayError.field,
        error: razorpayError.error
      });

      let errorMessage = 'Failed to create payment order';
      let errorCode = 'RAZORPAY_ORDER_CREATION_FAILED';

      if (razorpayError.statusCode === 400) {
        errorMessage = 'Invalid order parameters. Please check your configuration.';
        errorCode = 'INVALID_ORDER_PARAMS';
        
        if (razorpayError.error && razorpayError.error.description) {
          errorMessage = razorpayError.error.description;
        } else if (razorpayError.description) {
          errorMessage = razorpayError.description;
        }
      } else if (razorpayError.statusCode === 401) {
        errorMessage = 'Invalid Razorpay credentials';
        errorCode = 'INVALID_CREDENTIALS';
      }
      
      return res.status(500).json({ 
        success: false,
        message: errorMessage,
        code: errorCode,
        details: {
          statusCode: razorpayError.statusCode,
          message: razorpayError.message,
          description: razorpayError.description,
          razorpayError: razorpayError.error
        }
      });
    }

    // Prepare response
    const response = {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: plan.name,
      userEmail: user.email,
      userName: user.name,
      planDetails: {
        name: plan.name,
        credits: plan.credits,
        price: plan.price,
        description: plan.description
      }
    };

    res.json(response);
  } catch (error: any) {
    console.error('❌ CRITICAL ERROR in purchaseCredits:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?._id,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Internal server error. Please contact support.',
      code: 'INTERNAL_SERVER_ERROR',
      debug: {
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};

// @desc    Verify Razorpay payment
// @route   POST /api/credits/verify-payment
// @access  Private
export const verifyPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    logger.info(`Payment verification started for user ${req.user?._id}:`, {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id
    });
    
    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing payment verification data',
        code: 'MISSING_VERIFICATION_DATA',
        required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature']
      });
    }

    // Verify payment signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET as string)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.error('Payment signature verification failed:', {
        expected: expectedSignature,
        received: razorpay_signature
      });
      return res.status(400).json({ 
        success: false,
        message: 'Invalid payment signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Get order details
    let order: any;
    try {
      order = await razorpay.orders.fetch(razorpay_order_id);
    } catch (razorpayError) {
      logger.error('Razorpay order retrieval failed:', razorpayError);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid order ID',
        code: 'INVALID_ORDER_ID'
      });
    }

    // Get payment details to check status
    let payment: any;
    try {
      payment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (razorpayError) {
      logger.error('Razorpay payment retrieval failed:', razorpayError);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid payment ID',
        code: 'INVALID_PAYMENT_ID'
      });
    }

    // Check payment status
    if (payment.status !== 'captured') {
      logger.warn(`Payment not captured. Status: ${payment.status}`);
      return res.status(400).json({ 
        success: false,
        message: 'Payment not completed',
        code: 'PAYMENT_NOT_CAPTURED',
        status: payment.status 
      });
    }

    const { userId, planId, credits } = order.notes;
    
    // Verify user authorization
    if (userId !== req.user?._id?.toString()) {
      logger.error('Unauthorized payment verification attempt:', {
        orderUserId: userId,
        requestUserId: req.user?._id?.toString()
      });
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized access',
        code: 'UNAUTHORIZED_ACCESS'
      });
    }

    const user = await User.findById(userId);
    const plan = CREDIT_PLANS[planId];

    if (!user || !plan) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid purchase data',
        code: 'INVALID_PURCHASE_DATA'
      });
    }

    // Check for duplicate processing
    const existingTransaction = await CreditTransaction.findOne({
      razorpayPaymentId: razorpay_payment_id
    });

    if (existingTransaction) {
      logger.info(`Payment ${razorpay_payment_id} already processed`);
      return res.status(400).json({ 
        success: false,
        message: 'Payment already processed',
        code: 'DUPLICATE_PAYMENT',
        credits: user.credits
      });
    }

    // Process the payment - Add credits to user account
    const creditsToAdd = parseInt(credits, 10);
    const previousCredits = user.credits || 0;
    user.credits = previousCredits + creditsToAdd;
    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: user._id,
      type: 'purchase',
      amount: creditsToAdd,
      description: `Purchased ${plan.name}`,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id
    });

    logger.info(`✅ Payment verified successfully:`, {
      userId: user._id,
      paymentId: razorpay_payment_id,
      creditsAdded: creditsToAdd,
      totalCredits: user.credits
    });

    res.json({
      success: true,
      message: 'Credits purchased successfully',
      credits: user.credits,
      purchased: creditsToAdd,
      planName: plan.name,
      transactionId: razorpay_payment_id
    });

  } catch (error: any) {
    logger.error('Payment verification error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Payment verification failed. Please contact support.',
      code: 'VERIFICATION_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get current credit balance
// @route   GET /api/credits/balance
// @access  Private
export const getCreditBalance = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await User.findById(req.user?._id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Reset monthly credits if needed
    if (typeof user.resetMonthlyCredits === 'function') {
      user.resetMonthlyCredits();
      await user.save();
    }

    res.json({
      success: true,
      credits: user.credits || 0,
      plan: user.plan || 'free',
      lastReset: user.lastCreditReset || null
    });
  } catch (error: any) {
    logger.error('Get credit balance error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch credit balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Simulate payment success (DEMO ONLY)
// @route   POST /api/credits/simulate-payment-success
// @access  Private
export const simulatePaymentSuccess = async (req: Request, res: Response): Promise<any> => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ 
        success: false,
        message: 'This endpoint is only available in development mode',
        code: 'DEVELOPMENT_ONLY'
      });
    }

    const { planId } = req.body;
    
    if (!CREDIT_PLANS[planId]) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid plan selected',
        code: 'INVALID_PLAN_ID'
      });
    }

    const plan = CREDIT_PLANS[planId];
    const user = await User.findById(req.user?._id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Add credits (simulation)
    const previousCredits = user.credits || 0;
    user.credits = previousCredits + plan.credits;
    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: user._id,
      type: 'purchase',
      amount: plan.credits,
      description: `Demo: Purchased ${plan.name}`,
      razorpayPaymentId: `demo_${Date.now()}`,
      razorpayOrderId: `demo_order_${Date.now()}`
    });

    logger.info(`Demo: User ${user._id} simulated purchase of ${plan.credits} credits`);
    
    res.json({ 
      success: true,
      message: 'Credits added successfully (Demo)',
      credits: user.credits,
      purchased: plan.credits,
      planName: plan.name
    });
  } catch (error: any) {
    logger.error('Simulate payment error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Demo payment simulation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export default {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  verifyPayment,
  getCreditBalance,
  simulatePaymentSuccess
};
