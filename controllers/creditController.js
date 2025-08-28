const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

// Credit plans
const CREDIT_PLANS = {
  starter: {
    name: 'Starter Pack',
    credits: 25,
    price: 999, // $9.99
    description: 'Perfect for testing ideas'
  },
  pro: {
    name: 'Pro Pack',
    credits: 100,
    price: 2999, // $29.99
    description: 'Great for active entrepreneurs'
  },
  premium: {
    name: 'Premium Pack',
    credits: 500,
    price: 9999, // $99.99
    description: 'For serious startup builders'
  }
};

// @desc    Get credit plans
// @route   GET /api/credits/plans
// @access  Private
const getCreditPlans = async (req, res) => {
  try {
    res.json(CREDIT_PLANS);
  } catch (error) {
    logger.error('Get credit plans error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user credit history
// @route   GET /api/credits/history
// @access  Private
const getCreditHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const transactions = await CreditTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await CreditTransaction.countDocuments({ userId: req.user._id });

    res.json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    logger.error('Get credit history error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Purchase credits
// @route   POST /api/credits/purchase
// @access  Private
const purchaseCredits = async (req, res) => {
  try {
    const { planId } = req.body;
    
    if (!CREDIT_PLANS[planId]) {
      return res.status(400).json({ message: 'Invalid plan selected' });
    }

    const plan = CREDIT_PLANS[planId];
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create Stripe customer if doesn't exist
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString()
        }
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      currency: 'usd',
      customer: customerId,
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/credits`,
      metadata: {
  userId: user._id.toString(),
  planId,
  credits: plan.credits.toString(),
  type: 'credit_purchase'  
},
    });

    res.json({
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    logger.error('Purchase credits error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Confirm credit purchase
// @route   POST /api/credits/confirm-purchase
// @access  Private
// @desc    Confirm credit purchase
// @route   POST /api/credits/confirm-purchase
// @access  Private
const confirmPurchase = async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required' });
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (stripeError) {
      logger.error('Stripe session retrieval failed:', stripeError);
      return res.status(400).json({ message: 'Invalid session ID' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        message: 'Payment not completed',
        status: session.payment_status 
      });
    }

    const { userId, planId, credits } = session.metadata;
    
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    const plan = CREDIT_PLANS[planId];

    if (!user || !plan) {
      return res.status(400).json({ message: 'Invalid purchase data' });
    }

    // Check if this payment has already been processed
    const existingTransaction = await CreditTransaction.findOne({
      stripePaymentIntentId: sessionId
    });

    if (existingTransaction) {
      return res.status(400).json({ message: 'Payment already processed' });
    }

    // Add credits to user account
    user.credits += parseInt(credits);
    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: user._id,
      type: 'purchase',
      amount: parseInt(credits),
      description: `Purchased ${plan.name}`,
      stripePaymentIntentId: sessionId
    });

    logger.info(`User ${user._id} purchased ${credits} credits`);

    res.json({
      message: 'Credits purchased successfully',
      credits: user.credits,
      purchased: parseInt(credits)
    });
  } catch (error) {
    logger.error('Confirm purchase error:', error);
    res.status(500).json({ message: 'Payment processing failed. Please try again.' });
  }
};



// @desc    Get current credit balance
// @route   GET /api/credits/balance
// @access  Private
const getCreditBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Reset monthly credits if needed
    user.resetMonthlyCredits();
    await user.save();

    res.json({
      credits: user.credits,
      plan: user.plan,
      lastReset: user.lastCreditReset
    });
  } catch (error) {
    logger.error('Get credit balance error:', error);
    res.status(500).json({ message: error.message });
  }
};



// @desc    Simulate payment success (DEMO ONLY)
// @route   POST /api/credits/simulate-payment-success
// @access  Private
const simulatePaymentSuccess = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    // DEMO ONLY: This simulates Stripe marking a payment as succeeded
    // In production, this would be handled by Stripe automatically
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'This endpoint is only available in development' });
    }

    // For demo purposes, we'll just return success
    // In a real implementation, you would update the payment intent status
    logger.info(`Demo: Simulating payment success for ${paymentIntentId}`);
    
    res.json({ 
      message: 'Payment simulated successfully',
      paymentIntentId 
    });
  } catch (error) {
    logger.error('Simulate payment error:', error);
    res.status(500).json({ message: error.message });
  }
};



module.exports = {
  getCreditPlans,
  getCreditHistory,
  purchaseCredits,
  confirmPurchase,
  getCreditBalance,
  simulatePaymentSuccess
};