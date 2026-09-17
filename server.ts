// ✅ Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import connectDB from './config/db';
import morgan from 'morgan';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { sanitizeInput } from './middleware/sanitizer';
import logger from './utils/logger';
import Razorpay from 'razorpay';
import CreditTransaction from './models/CreditTransaction';
import User from './models/User';

// ✅ Initialize Razorpay AFTER loading environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

const app = express();

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

// Webhook event handlers
async function handlePaymentCaptured(payment: any): Promise<void> {
  try {
    logger.info('✅ Payment captured:', {
      id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      status: payment.status
    });

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
    }
  } catch (error: any) {
    logger.error('Error handling payment.captured:', error);
  }
}

async function handlePaymentFailed(payment: any): Promise<void> {
  logger.error('❌ Payment failed:', {
    id: payment.id,
    order_id: payment.order_id,
    error_code: payment.error_code,
    error_description: payment.error_description
  });
}

async function handleOrderPaid(order: any): Promise<void> {
  logger.info('✅ Order paid:', {
    id: order.id,
    amount: order.amount,
    status: order.status
  });
}

// ✅ Razorpay Webhook handler
app.post('/razorpay-webhook', (req: Request, res: Response): any => {
  const webhookSignature = req.headers['x-razorpay-signature'] as string;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

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
  } catch (error: any) {
    logger.error('Error processing webhook event:', error);
    return res.status(500).send('Webhook processing failed');
  }

  res.status(200).json({ received: true });
});

// Import routes
import authRoutes from './routes/authRoutes';
import ideaRoutes from './routes/ideaRoutes';
import pitchDeckRoutes from './routes/pitchDeckRoutes';
import canvasRoutes from './routes/canvasRoutes';
import investorRoutes from './routes/investorRoutes';
import paymentRoutes from './routes/paymentRoutes';
import competitorRoutes from './routes/competitorRoutes';
import pitchSimulatorRoutes from './routes/pitchSimulatorRoutes';
import creditRoutes from './routes/creditRoutes';
import marketResearchRoutes from './routes/marketResearchRoutes';
import historyRoutes from './routes/historyRoutes';

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
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Welcome to PitchMint API',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// ✅ Environment variables check endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api/health', (req: Request, res: Response) => {
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
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
        
        // Log configuration status
        logger.info('Configuration check:', {
          RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ? 'Set' : 'Missing',
          RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ? 'Set' : 'Missing',
          RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ? 'Set' : 'Missing'
        });
      });
    })
    .catch((error: any) => {
      logger.error('Failed to connect to MongoDB:', error.message);
      process.exit(1);
    });
}

export { app };
export default app;
