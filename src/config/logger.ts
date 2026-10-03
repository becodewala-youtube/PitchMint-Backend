import winston from 'winston';
import env from './env';
import { requestContext } from '../shared/utils/request-context';

const SENSITIVE_KEYS = [
  'authorization', 'cookie', 'set-cookie', 'password', 'currentpassword', 
  'newpassword', 'confirmpassword', 'token', 'accesstoken', 'refreshtoken', 
  'resettoken', 'verificationtoken', 'otp', 'secret', 'clientsecret', 
  'jwtsecret', 'apikey', 'geminiapikey', 'razorpaysignature', 
  'razorpaykeysecret', 'paymentsignature', 'googleaccesstoken', 
  'googlerefreshtoken', 'smtppassword',
  'razorpay_payment_id', 'razorpay_order_id', 'credential', 'prompt',
  'body', 'reqbody', 'resbody'
];

export const redact = (obj: any, seen = new WeakSet()): any => {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Do not serialize class instances uncontrollably, strings, buffers etc.
  if (Buffer.isBuffer(obj) || obj instanceof Date) return obj;
  
  // Stop traversal for circular references
  if (seen.has(obj)) {
    return '[CIRCULAR]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => redact(item, seen));
  }
  
  const redactedObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.some(sensitiveKey => normalizedKey.includes(sensitiveKey))) {
      redactedObj[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redactedObj[key] = redact(value, seen);
    } else {
      redactedObj[key] = value;
    }
  }
  return redactedObj;
};

// Custom format to redact and inject request ID
const injectRequestIdAndRedact = winston.format((info) => {
  const reqId = requestContext.getStore();
  if (reqId) {
    info.requestId = reqId;
  }
  
  for (const key of Object.keys(info)) {
    if (key !== 'message' && key !== 'level' && key !== 'timestamp' && key !== 'requestId') {
      info[key] = redact(info[key]);
    }
  }
  return info;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    injectRequestIdAndRedact(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
        const idStr = requestId ? ` [${requestId}]` : '';
        const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `${timestamp} ${level}${idStr}: ${message}${metaStr}`;
      })
    )
  }));
}

export default logger;
