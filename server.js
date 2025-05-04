const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { sanitizeInput } = require('./middleware/sanitizer');
const logger = require('./utils/logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ✅ Load environment variables
dotenv.config();

<<<<<<< HEAD
// ✅ Connect to MongoDB
connectDB().catch(err => {
  logger.error('Failed to connect to MongoDB:', err);
  process.exit(1);
=======
// Connect to MongoDB
connectDB().catch(err => {
  logger.error('Failed to connect to MongoDB:', err);
  process.exit(1);  // Exit process with failure
>>>>>>> cdc4f7f0b6319522aa1ec82c0b90cc8101541ac8
});

const app = express();

<<<<<<< HEAD
// ✅ Stripe Webhook needs raw body before express.json()
app.use(
  '/webhook',
  express.raw({ type: 'application/json' }) // ONLY for Stripe webhook
);

// ✅ Webhook route
app.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ Handle Stripe events
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      logger.info('✅ Payment successful:', session);
      // TODO: Save to DB or trigger email here
      break;
    default:
      logger.warn(`Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
});

// ✅ General middleware (after raw parser)
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'https://pitch-mint-frontend.vercel.app'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json()); // Must come after raw body parsing for /webhook
=======
// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = ['http://localhost:5173','http://localhost:5174', 'https://pitch-mint-frontend.vercel.app']; // Add all allowed origins here
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);  // Allow the request
    } else {
      callback(new Error('Not allowed by CORS'));  // Reject the request
    }
  },
  credentials: true,  // Allow cookies to be sent
}));


// Body parser & sanitization
app.use(express.json());
>>>>>>> cdc4f7f0b6319522aa1ec82c0b90cc8101541ac8
app.use(sanitizeInput);
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ✅ Routes
const authRoutes = require('./routes/authRoutes');
const ideaRoutes = require('./routes/ideaRoutes');
const pitchDeckRoutes = require('./routes/pitchDeckRoutes');
const canvasRoutes = require('./routes/canvasRoutes');
const investorRoutes = require('./routes/investorRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/idea', ideaRoutes);
app.use('/api/pitchdeck', pitchDeckRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/payment', paymentRoutes);

// ✅ Health check
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to PitchMint API' });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : {}
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
