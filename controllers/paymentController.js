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
              name: 'Pitchmint Premium Subscription',
              description: 'Access to investor contacts and premium features',
            },
            unit_amount: 2900, // $29.00
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success`,
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
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;

    try {
      await User.findByIdAndUpdate(userId, { isPremium: true });
      logger.info(`User ${userId} upgraded to premium successfully`);
    } catch (error) {
      logger.error('Error upgrading user:', error);
      return res.status(500).json({ message: 'Error upgrading user' });
    }
  }

  res.json({ received: true });
};

module.exports = {
  upgradeUserToPremium,
  handlePaymentSuccess,
};