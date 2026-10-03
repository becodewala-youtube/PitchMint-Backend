import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import env from '../config/env';
import logger from '../config/logger';
import { apiLimiter, authLimiter } from '../shared/middleware/rate-limiter.middleware';
import { sanitizeInput } from '../shared/middleware/sanitizer.middleware';
import { errorHandler, notFoundHandler } from '../shared/errors/error.middleware';
import { requestIdMiddleware } from '../shared/middleware/request-id.middleware';
import routes from './routes';

const app = express();

// Webhook raw body parser (must come before express.json)
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
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

// Security headers
app.use(helmet());

// Request ID early in the middleware chain
app.use(requestIdMiddleware);

// General middleware (after raw and CORS)
app.use(express.json());
app.use(sanitizeInput);

// Apply rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Access logging
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Production structured access logs
  app.use(morgan((tokens, req, res) => {
    return JSON.stringify({
      requestId: (req as any).requestId,
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: tokens.status(req, res),
      content_length: tokens.res(req, res, 'content-length'),
      response_time_ms: tokens['response-time'](req, res)
    });
  }, {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Welcome to PitchMint API',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV
  });
});

// Environment variables check endpoint (development only)
if (env.NODE_ENV === 'development') {
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'OK',
      env_vars: {
        RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID ? '✅ Set' : '❌ Missing',
        RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET ? '✅ Set' : '❌ Missing',
        RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing',
        MONGODB_URI: env.MONGODB_URI ? '✅ Set' : '❌ Missing'
      }
    });
  });
}

// Mount all application routes
app.use(routes);

// 404 handler
app.use('*', notFoundHandler);

// Global error handler
app.use(errorHandler);

export { app };
export default app;
