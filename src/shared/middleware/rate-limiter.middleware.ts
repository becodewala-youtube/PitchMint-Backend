import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 login/register requests per hour
  message: 'Too many authentication attempts, please try again after an hour'
});

export const pitchDeckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // Limit each IP to 2 pitch deck generations per minute
  message: 'Too many pitch deck generation requests, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

export const canvasLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // Limit each IP to 2 canvas generations per minute
  message: 'Too many canvas generation requests, please try again after a minute',
  standardHeaders: true,
  legacyHeaders: false,
});

export default { 
  apiLimiter, 
  authLimiter, 
  pitchDeckLimiter,
  canvasLimiter 
};
