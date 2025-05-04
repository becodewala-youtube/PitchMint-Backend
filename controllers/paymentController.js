// backend/controllers/paymentController.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const logger = require('../utils/logger');

const upgradeUserToPremium = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'IdeaForge Premium Subscription',
              description: 'Access to investor contacts and premium features',
            },
            unit_amount: 2900, // $29.00
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata: {
        userId: req.user._id.toString(),
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    logger.error('Error creating payment session:', error);
    res.status(500).json({ message: 'Error processing payment' });
  }
};

const handlePaymentSuccess = async (req, res) => {
  try {
    const payload = req.body;
    const sig = req.headers['stripe-signature'];
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Extract the user ID from metadata
      const userId = session.metadata.userId;
      
      try {
        // Update user to premium
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { isPremium: true },
          { new: true }
        );

        if (!updatedUser) {
          throw new Error('User not found');
        }

        logger.info(`User ${userId} upgraded to premium successfully`);
      } catch (error) {
        logger.error('Error updating user premium status:', error);
        return res.status(500).json({ message: 'Failed to update user status' });
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook handling error:', error);
    res.status(500).json({ message: 'Webhook handling failed' });
  }
};

const verifyPaymentSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const userId = session.metadata.userId;
      
      // Get updated user data
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json({
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isPremium: user.isPremium
        }
      });
    } else {
      res.status(400).json({ message: 'Payment not completed' });
    }
  } catch (error) {
    logger.error('Error verifying payment session:', error);
    res.status(500).json({ message: 'Error verifying payment' });
  }
};

module.exports = {
  upgradeUserToPremium,
  handlePaymentSuccess,
  verifyPaymentSession
};
