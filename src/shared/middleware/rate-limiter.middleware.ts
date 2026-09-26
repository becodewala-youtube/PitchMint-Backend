import rateLimit from 'express-rate-limit';

const isRelaxed = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 5000 : 300,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 2000 : 50,
  message: 'Too many authentication attempts, please try again after 15 minutes'
});

export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isRelaxed ? 2000 : 5, // Only 5 attempts for reset/verify
  message: 'Too many attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

export const pitchDeckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isRelaxed ? 1000 : 2, // Limit each IP to 2 pitch deck generations per minute
  message: 'Too many pitch deck generation requests, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

export const canvasLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isRelaxed ? 1000 : 2, // Limit each IP to 2 canvas generations per minute
  message: 'Too many canvas generation requests, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

export default { 
  apiLimiter, 
  authLimiter, 
  strictAuthLimiter,
  pitchDeckLimiter,
  canvasLimiter 
};
