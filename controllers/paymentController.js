const Razorpay = require('razorpay');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const logger = require('../utils/logger');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @desc    Create Razorpay order for premium upgrade
// @route   POST /api/payment/create-checkout-session
// @access  Private
const upgradeUserToPremium = async (req, res) => {
  try {
  
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      console.error('❌ User not found:', req.user._id);
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    

    // Create shorter receipt string (under 40 characters)
    const shortUserId = user._id.toString().slice(-8);
    const shortTimestamp = Date.now().toString().slice(-8);
    const receipt = `prem_${shortUserId}_${shortTimestamp}`;

    const orderData = {
      amount: 200, // ₹2.00 in paise
      currency: 'INR',
      receipt: receipt, // Fixed: Now under 40 characters
      notes: {
        userId: user._id.toString(),
        type: 'premium_upgrade',
        userEmail: user.email,
        userName: user.name
      },
      payment_capture: 1 // Fixed: Added payment capture
    };

    

    if (orderData.receipt.length > 40) {
      console.error('Receipt too long, using fallback');
      orderData.receipt = `prem_${Date.now()}`.slice(0, 40);
    }

   

    const order = await razorpay.orders.create(orderData);
    
    

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      userEmail: user.email,
      userName: user.name
    });

    
  } catch (error) {
    console.error('❌ Premium upgrade error:', error);
    logger.error('Error creating premium upgrade order:', error);
    
    // Enhanced error handling
    let errorMessage = 'Error processing payment';
    if (error.error && error.error.description) {
      errorMessage = error.error.description;
    } else if (error.description) {
      errorMessage = error.description;
    }
    
    res.status(500).json({ 
      success: false,
      message: errorMessage,
      code: 'PREMIUM_ORDER_CREATION_FAILED',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Verify premium upgrade payment
// @route   POST /api/payment/verify-premium
// @access  Private
const verifyPremiumPayment = async (req, res) => {
  try {
  
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing payment verification data'
      });
    }

    // Verify payment signature
    const crypto = require('crypto');
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
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
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    

   

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
    if (userId !== req.user._id.toString()) {
      console.error('❌ Unauthorized premium payment verification');
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Check if user is already premium (duplicate processing check)
    const currentUser = await User.findById(userId);
    if (currentUser.isPremium) {
      
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

  

  } catch (error) {
    console.error('❌ Premium payment verification error:', error);
    logger.error('Premium payment verification error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Payment verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Handle Razorpay webhook for premium upgrades
// @route   POST /api/payment/webhook
// @access  Public
const handlePaymentWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('Webhook secret not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    // Verify webhook signature
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');
    
    if (expectedSignature !== webhookSignature) {
      logger.error('Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const body = JSON.parse(req.body.toString());
    const event = body.event;
    
    
    
    if (event === 'payment.captured') {
      const payment = body.payload.payment.entity;
      const order = await razorpay.orders.fetch(payment.order_id);
      
      if (order.notes.type === 'premium_upgrade') {
        const userId = order.notes.userId;
        
        // Upgrade user to premium via webhook
        await User.findByIdAndUpdate(userId, { isPremium: true });
        
       
        logger.info(`Webhook: User ${userId} upgraded to premium`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Premium webhook error:', error);
    logger.error('Webhook handling error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

module.exports = {
  upgradeUserToPremium,
  verifyPremiumPayment,
  handlePaymentWebhook
};