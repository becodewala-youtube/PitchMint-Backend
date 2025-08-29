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
      const type = session.metadata.type;
      
      try {
        if (type === 'credit_purchase') {
          // Handle credit purchase
          const { planId, credits } = session.metadata;
          const user = await User.findById(userId);
          
          if (!user) {
            throw new Error('User not found');
          }
          
          // Check if this session has already been processed
          const CreditTransaction = require('../models/CreditTransaction');
          const existingTransaction = await CreditTransaction.findOne({
            stripePaymentIntentId: session.id
          });

          if (existingTransaction) {
            logger.info(`Session ${session.id} already processed`);
            return res.json({ received: true });
          }
          
          // Add credits to user account
          user.credits += parseInt(credits);
          await user.save();
          
          // Record transaction
          await CreditTransaction.create({
            userId: user._id,
            type: 'purchase',
            amount: parseInt(credits),
            description: `Purchased ${credits} credits`,
            stripePaymentIntentId: session.id
          });
          
          logger.info(`User ${userId} purchased ${credits} credits`);
        } else {
          // Handle premium upgrade
          const updatedUser = await User.findByIdAndUpdate(
            userId,
            { isPremium: true },
            { new: true }
          );

          if (!updatedUser) {
            throw new Error('User not found');
          }

          logger.info(`User ${userId} upgraded to premium successfully`);
        }
      } catch (error) {
        logger.error('Error processing payment:', error);
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
      const { userId, type, planId, credits } = session.metadata;

      if (userId !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Unauthorized' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (type === 'credit_purchase') {
        // Check for duplicate processing
        const CreditTransaction = require('../models/CreditTransaction');
        const existingTransaction = await CreditTransaction.findOne({
          stripePaymentIntentId: sessionId
        });

        if (!existingTransaction) {
          // Add credits to user account
          user.credits += parseInt(credits);
          await user.save();

          // Record transaction
          await CreditTransaction.create({
            userId: user._id,
            type: 'purchase',
            amount: parseInt(credits),
            description: `Purchased ${credits} credits`,
            stripePaymentIntentId: sessionId
          });

          logger.info(`User ${userId} purchased ${credits} credits`);
        }

        res.json({
          success: true,
          type: 'credit_purchase',
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            credits: user.credits
          }
        });
      } else {
        // Handle premium upgrade
        user.isPremium = true;
        await user.save();

        res.json({
          success: true,
          type: 'premium_upgrade',
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            isPremium: user.isPremium
          }
        });
      }

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
