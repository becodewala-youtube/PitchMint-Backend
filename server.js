const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const morgan = require('morgan');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { sanitizeInput } = require('./middleware/sanitizer');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB().catch(err => {
  logger.error('Failed to connect to MongoDB:', err);
  process.exit(1);  // Exit process with failure
});

const app = express();

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
app.use(sanitizeInput);

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Request logger in development
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

// ✅ Health check route
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
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
