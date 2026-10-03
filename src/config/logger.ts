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
  
  // Catch AxiosError spread directly into info
  const infoObj = info as any;
  if (infoObj.isAxiosError || (infoObj.config && infoObj.response)) {
    infoObj.apiStatus = infoObj.response?.status;
    infoObj.apiMethod = infoObj.config?.method;
    infoObj.apiUrl = infoObj.config?.url;
    delete infoObj.config;
    delete infoObj.request;
    delete infoObj.response;
  }

  for (const key of Object.keys(info)) {
    if (key !== 'message' && key !== 'level' && key !== 'timestamp' && key !== 'requestId') {
      let value = info[key];
      
      // 1. Explicit allowlist extraction for known dangerous object types
      if (value && typeof value === 'object') {
        const val = value as any;
        if (val.isAxiosError || (val.config && val.response)) {
          value = {
            message: val.message,
            name: val.name,
            code: val.code,
            status: val.response?.status,
            method: val.config?.method,
            url: val.config?.url,
          };
        } else if (val.headers && val.method && val.url && typeof val.header === 'function') {
          // Express Request object
          value = {
            method: val.method,
            url: val.url,
            query: val.query,
          };
        } else if (value instanceof Error) {
          // Standard Error (prevents arbitrary SDK payload leakage)
          value = {
            message: val.message,
            name: val.name,
            stack: env.NODE_ENV === 'development' ? val.stack : undefined,
          };
        }
      }
      
      // 2. Centralized redaction as defense-in-depth
      info[key] = redact(value);
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
