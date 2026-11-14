import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import IdempotencyRecord, { IIdempotencyRecord } from '../../modules/idempotency/idempotency.model';
import logger from '../../config/logger';

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
  const endpoint = req.originalUrl || req.baseUrl + req.path || req.url;

  const requestPayloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(req.body || {}))
    .digest('hex');

  let record: IIdempotencyRecord;

  try {
    record = await IdempotencyRecord.create({
      userId,
      idempotencyKey,
      endpoint,
      status: 'in_progress',
      requestPayloadHash,
      createdAt: new Date()
    });
  } catch (error: any) {
    if (error && (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000))) {
      // Duplicate key: handle based on existing record status
      const existing = await IdempotencyRecord.findOne({ userId, idempotencyKey });

      if (!existing) {
        return res.status(409).json({
          success: false,
          message: 'Request currently in progress. Please retry shortly.'
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
        // Previous attempt failed: atomically claim retry
        const retryClaim = await IdempotencyRecord.findOneAndUpdate(
          { _id: existing._id, status: 'failed' },
          {
            $set: {
              status: 'in_progress',
              endpoint,
              requestPayloadHash,
              createdAt: new Date()
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

    await IdempotencyRecord.findByIdAndUpdate(record._id, {
      $set: {
        status: isSuccess ? 'completed' : 'failed',
        responseStatus: statusCode,
        responseData: cleanData
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
        originalJson(body);
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
        originalSend(body);
      });
    return res;
  };

  res.on('close', () => {
    if (!res.writableEnded && !captured) {
      captured = true;
      IdempotencyRecord.findByIdAndUpdate(record._id, {
        $set: {
          status: 'failed',
          responseStatus: 499,
          responseData: { message: 'Client connection closed before response completed' }
        }
      }).catch((err) => {
        logger.error('Error marking idempotency record failed on socket close', err);
      });
    }
  });

  next();
};

export const idempotency = idempotencyMiddleware;
export default idempotencyMiddleware;
