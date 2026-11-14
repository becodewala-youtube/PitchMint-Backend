import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import IdempotencyRecord, { IIdempotencyRecord } from '../../modules/idempotency/idempotency.model';
import logger from '../../config/logger';

/**
 * Recursively canonicalizes an object by sorting all object keys so that
 * equivalent JSON payloads always hash to the exact same SHA-256 fingerprint.
 */
export const canonicalize = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize(obj[key]);
  }
  return result;
};

/**
 * Middleware providing durable MongoDB-backed API idempotency for credit-consuming routes.
 * Uses Idempotency-Key (or x-idempotency-key) header.
 */
export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const keyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  // If no idempotency key provided, proceed without idempotency tracking
  if (!keyStr || typeof keyStr !== 'string' || !keyStr.trim()) {
    return next();
  }

  const idempotencyKey = keyStr.trim();

  if (!req.user?._id) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  const userId = req.user._id;
  const httpMethod = (req.method || 'POST').toUpperCase();
  const rawPath = req.originalUrl ? req.originalUrl.split('?')[0] : (req.baseUrl + req.path);
  const endpoint = (rawPath || '').replace(/\/+$/, '') || '/';

  const canonicalPayload = canonicalize({
    body: req.body || {},
    query: req.query || {}
  });
  const requestPayloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');

  let record: IIdempotencyRecord;

  try {
    record = await IdempotencyRecord.create({
      userId,
      idempotencyKey,
      httpMethod,
      endpoint,
      status: 'in_progress',
      requestPayloadHash,
      createdAt: new Date()
    });
  } catch (error: any) {
    if (error && (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000))) {
      // Duplicate key: fetch existing record
      const existing = await IdempotencyRecord.findOne({ userId, idempotencyKey });

      if (!existing) {
        return res.status(409).json({
          success: false,
          message: 'Request currently in progress. Please retry shortly.'
        });
      }

      // Request Identity Validation: compare httpMethod, endpoint, and requestPayloadHash
      const identityMatches =
        existing.httpMethod === httpMethod &&
        existing.endpoint === endpoint &&
        existing.requestPayloadHash === requestPayloadHash;

      if (!identityMatches) {
        return res.status(409).json({
          success: false,
          message: 'Idempotency key has already been used with a different request payload or endpoint.'
        });
      }

      if (existing.status === 'completed') {
        // Return cached status & responseData immediately (0 credits deducted)
        return res.status(existing.responseStatus || 200).json(existing.responseData);
      }

      if (existing.status === 'in_progress') {
        // Concurrent or duplicate request while first is still executing
        return res.status(409).json({
          success: false,
          message: 'Request currently in progress. Please retry shortly.'
        });
      }

      if (existing.status === 'failed') {
        // Previous attempt failed: atomically claim retry ONLY if request identity matches.
        // Do NOT overwrite endpoint, method, or payload hash during failed-request retry.
        // Unset expiresAt so the record has no automatic expiry while retry is in_progress.
        const retryClaim = await IdempotencyRecord.findOneAndUpdate(
          { _id: existing._id, status: 'failed' },
          {
            $set: {
              status: 'in_progress',
              createdAt: new Date()
            },
            $unset: {
              expiresAt: 1
            }
          },
          { new: true }
        );

        if (!retryClaim) {
          return res.status(409).json({
            success: false,
            message: 'Request currently in progress. Please retry shortly.'
          });
        }

        record = retryClaim;
      } else {
        return res.status(409).json({
          success: false,
          message: 'Request currently in progress. Please retry shortly.'
        });
      }
    } else {
      logger.error('Unexpected error in idempotency middleware:', error);
      return res.status(500).json({ success: false, message: 'Idempotency processing error' });
    }
  }

  // Wrap res.json and res.send to capture completed response or mark failed on downstream error
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let captured = false;

  const captureAndCommit = async (body: any) => {
    if (captured) return;
    captured = true;

    const statusCode = res.statusCode || 200;
    const isSuccess = statusCode >= 200 && statusCode < 300;

    let cleanData: any;
    try {
      cleanData = typeof body === 'string' ? JSON.parse(body) : JSON.parse(JSON.stringify(body));
    } catch {
      cleanData = body;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await IdempotencyRecord.findByIdAndUpdate(record._id, {
      $set: {
        status: isSuccess ? 'completed' : 'failed',
        responseStatus: statusCode,
        responseData: cleanData,
        expiresAt
      }
    });
  };

  res.json = function (body: any) {
    if (captured) {
      return originalJson(body);
    }
    captureAndCommit(body)
      .catch((err) => {
        logger.error('Error recording idempotency response in res.json', err);
      })
      .finally(() => {
        try {
          if (!res.writableEnded && !res.destroyed) {
            originalJson(body);
          }
        } catch (e) {
          logger.debug('Socket closed before writing res.json response', e);
        }
      });
    return res;
  };

  res.send = function (body: any) {
    if (captured) {
      return originalSend(body);
    }
    captureAndCommit(body)
      .catch((err) => {
        logger.error('Error recording idempotency response in res.send', err);
      })
      .finally(() => {
        try {
          if (!res.writableEnded && !res.destroyed) {
            originalSend(body);
          }
        } catch (e) {
          logger.debug('Socket closed before writing res.send response', e);
        }
      });
    return res;
  };

  res.on('close', () => {
    if (!res.writableEnded && !captured) {
      logger.info(
        `Client disconnected while idempotency key ${idempotencyKey} is in progress; retaining in_progress protection`
      );
    }
  });

  next();
};

export const idempotency = idempotencyMiddleware;
export default idempotencyMiddleware;
