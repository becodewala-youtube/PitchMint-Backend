// ✅ Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const morgan = require('morgan');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { sanitizeInput } = require('./middleware/sanitizer');
const logger = require('./utils/logger');
const Razorpay = require('razorpay');

// ✅ Initialize Razorpay AFTER loading environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const app = express();

// ✅ Connect to MongoDB
connectDB().catch(err => {
  logger.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

// ✅ Webhook raw body parser (must come before express.json)
app.use('/razorpay-webhook', express.raw({ type: 'application/json' }));
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'https://pitch-mint-frontend.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ✅ General middleware (after raw and CORS)
app.use(express.json());
app.use(sanitizeInput);

// Apply rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Request logger in development mode
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ✅ Razorpay Webhook handler
app.post('/razorpay-webhook', (req, res) => {
  const webhookSignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('❌ RAZORPAY_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let body;
  let event;
  
  try {
    const rawBody = req.body;
    body = JSON.parse(rawBody.toString());
    
    // Verify webhook signature
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    
    if (expectedSignature !== webhookSignature) {
      throw new Error('Invalid signature');
    }

    event = body.event;
    logger.info(`✅ Webhook verified: ${event}`);
    
  } catch (err) {
    logger.error('❌ Razorpay webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle Razorpay events
  try {
    switch (event) {
      case 'payment.captured':
        handlePaymentCaptured(body.payload.payment.entity);
        break;
      
      case 'payment.failed':
        handlePaymentFailed(body.payload.payment.entity);
        break;
      
      case 'order.paid':
        handleOrderPaid(body.payload.order.entity);
        break;
      
      default:
        logger.warn(`Unhandled event type: ${event}`);
    }
  } catch (error) {
    logger.error('Error processing webhook event:', error);
    return res.status(500).send('Webhook processing failed');
  }

  res.status(200).json({ received: true });
});

// Webhook event handlers
async function handlePaymentCaptured(payment) {
  try {
    logger.info('✅ Payment captured:', {
      id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      status: payment.status
    });

    const order = await razorpay.orders.fetch(payment.order_id);
    const { userId, planId, credits, type } = order.notes;

    if (type === 'credit_purchase') {
      const CreditTransaction = require('./models/CreditTransaction');
      const existingTransaction = await CreditTransaction.findOne({
        razorpayPaymentId: payment.id
      });

      if (existingTransaction) {
        logger.info(`Payment ${payment.id} already processed`);
        return;
      }

      const User = require('./models/User');
      const user = await User.findById(userId);
      
      if (user) {
        user.credits = (user.credits || 0) + parseInt(credits);
        await user.save();

        await CreditTransaction.create({
          userId: user._id,
          type: 'purchase',
          amount: parseInt(credits),
          description: `Purchased ${credits} credits via webhook`,
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id
        });

        logger.info(`✅ Webhook: User ${userId} credited with ${credits} credits`);
      }
    }
  } catch (error) {
    logger.error('Error handling payment.captured:', error);
  }
}

async function handlePaymentFailed(payment) {
  logger.error('❌ Payment failed:', {
    id: payment.id,
    order_id: payment.order_id,
    error_code: payment.error_code,
    error_description: payment.error_description
  });
}

async function handleOrderPaid(order) {
  logger.info('✅ Order paid:', {
    id: order.id,
    amount: order.amount,
    status: order.status
  });
}

// Import routes
const authRoutes = require('./routes/authRoutes');
const ideaRoutes = require('./routes/ideaRoutes');
const pitchDeckRoutes = require('./routes/pitchDeckRoutes');
const canvasRoutes = require('./routes/canvasRoutes');
const investorRoutes = require('./routes/investorRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const competitorRoutes = require('./routes/competitorRoutes');
const pitchSimulatorRoutes = require('./routes/pitchSimulatorRoutes');
const creditRoutes = require('./routes/creditRoutes');
const marketResearchRoutes = require('./routes/marketResearchRoutes');
const historyRoutes = require('./routes/historyRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/idea', ideaRoutes);
app.use('/api/pitchdeck', pitchDeckRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/competitors', competitorRoutes);
app.use('/api/pitch-simulator', pitchSimulatorRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/market-research', marketResearchRoutes);
app.use('/api/history', historyRoutes);

// ✅ Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to PitchMint API',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// ✅ Environment variables check endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      env_vars: {
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing',
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing',
        RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing',
        MONGODB_URI: process.env.MONGODB_URI ? '✅ Set' : '❌ Missing'
      }
    });
  });
}

// ✅ Error handler
app.use((err, req, res, next) => {
  logger.error('Global error handler:', err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ✅ 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  
  // Log configuration status
  logger.info('Configuration check:', {
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ? 'Set' : 'Missing',
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ? 'Set' : 'Missing',
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ? 'Set' : 'Missing'
  });
});