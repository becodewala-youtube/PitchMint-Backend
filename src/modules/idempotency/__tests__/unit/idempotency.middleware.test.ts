import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { idempotencyMiddleware, canonicalize } from '../../../../shared/middleware/idempotency.middleware';
import IdempotencyRecord from '../../idempotency.model';

jest.mock('../../idempotency.model');

describe('Idempotency Middleware Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let sendMock: jest.Mock;
  let onMock: jest.Mock;

  const getPayloadHash = (payload: any) =>
    crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload || {}))).digest('hex');

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn().mockReturnThis();
    sendMock = jest.fn().mockReturnThis();
    onMock = jest.fn();

    req = {
      method: 'POST',
      headers: {},
      body: { ideaText: 'AI assistant for lawyers' },
      originalUrl: '/api/idea/submit',
      user: { _id: new mongoose.Types.ObjectId() } as any
    };

    res = {
      statusCode: 200,
      status: statusMock,
      json: jsonMock,
      send: sendMock,
      on: onMock,
      writableEnded: false
    };

    next = jest.fn();
  });

  test('should call next() immediately when no Idempotency-Key header is provided', async () => {
    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(IdempotencyRecord.create).not.toHaveBeenCalled();
  });

  test('should return 401 if user is unauthenticated and idempotency key is provided', async () => {
    req.headers = { 'idempotency-key': 'test-key-1' };
    req.user = undefined;

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Not authorized'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('should atomically insert in_progress record with method, endpoint, and payload hash on new request', async () => {
    req.headers = { 'idempotency-key': 'test-key-2' };
    const mockRecord = {
      _id: new mongoose.Types.ObjectId(),
      status: 'in_progress'
    };
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue(mockRecord);

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(IdempotencyRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'test-key-2',
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      status: 'in_progress',
      requestPayloadHash: getPayloadHash(req.body)
    }));
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('should return cached response immediately when existing record is completed and request identity matches', async () => {
    req.headers = { 'idempotency-key': 'test-key-completed' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    const cachedData = { _id: 'idea-123', overallScore: 85, userCredits: 2 };
    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      requestPayloadHash: getPayloadHash(req.body),
      status: 'completed',
      responseStatus: 201,
      responseData: cachedData
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(cachedData);
    expect(next).not.toHaveBeenCalled();
  });

  test('should reject with 409 Conflict when duplicate key is used with a different payload', async () => {
    req.headers = { 'idempotency-key': 'test-key-diff-payload' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      requestPayloadHash: getPayloadHash({ ideaText: 'Initial different idea' }),
      status: 'completed',
      responseStatus: 201,
      responseData: { _id: 'idea-old' }
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Idempotency key has already been used with a different request payload or endpoint.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should reject with 409 Conflict when duplicate key is used with a different endpoint', async () => {
    req.headers = { 'idempotency-key': 'test-key-diff-endpoint' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      httpMethod: 'POST',
      endpoint: '/api/canvas/some-id',
      requestPayloadHash: getPayloadHash(req.body),
      status: 'completed',
      responseStatus: 200,
      responseData: { _id: 'canvas-1' }
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Idempotency key has already been used with a different request payload or endpoint.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should reject with 409 Conflict when duplicate key is used with a different HTTP method', async () => {
    req.headers = { 'idempotency-key': 'test-key-diff-method' };
    req.method = 'PUT';
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      requestPayloadHash: getPayloadHash(req.body),
      status: 'completed',
      responseStatus: 201,
      responseData: { _id: 'idea-1' }
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Idempotency key has already been used with a different request payload or endpoint.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 409 Conflict when duplicate request is still in_progress and identity matches', async () => {
    req.headers = { 'idempotency-key': 'test-key-in-progress' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      requestPayloadHash: getPayloadHash(req.body),
      status: 'in_progress'
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringContaining('in progress')
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('should allow retry by transitioning status from failed to in_progress when identity matches', async () => {
    req.headers = { 'idempotency-key': 'test-key-failed-retry' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    const existingRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      _id: existingRecordId,
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      requestPayloadHash: getPayloadHash(req.body),
      status: 'failed'
    });

    const claimedRecord = {
      _id: existingRecordId,
      status: 'in_progress'
    };
    (IdempotencyRecord.findOneAndUpdate as jest.Mock).mockResolvedValue(claimedRecord);

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(IdempotencyRecord.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: existingRecordId, status: 'failed' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'in_progress' })
      }),
      { new: true }
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('should reject failed retry with 409 Conflict if request payload differs without altering record', async () => {
    req.headers = { 'idempotency-key': 'test-key-failed-diff' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    const existingRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      _id: existingRecordId,
      httpMethod: 'POST',
      endpoint: '/api/idea/submit',
      requestPayloadHash: getPayloadHash({ ideaText: 'Original failed idea' }),
      status: 'failed'
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      message: 'Idempotency key has already been used with a different request payload or endpoint.'
    });
    expect(IdempotencyRecord.findOneAndUpdate).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('should wrap res.json and update record status to completed on 201 response', async () => {
    req.headers = { 'idempotency-key': 'test-key-wrap' };
    const mockRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue({
      _id: mockRecordId,
      status: 'in_progress'
    });
    (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

    await idempotencyMiddleware(req as Request, res as Response, next);

    res.statusCode = 201;
    res.json!({ ideaId: 'idea-999', score: 92 });

    // Wait for microtask queue
    await Promise.resolve();

    expect(IdempotencyRecord.findByIdAndUpdate).toHaveBeenCalledWith(
      mockRecordId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'completed',
          responseStatus: 201,
          responseData: { ideaId: 'idea-999', score: 92 }
        })
      })
    );
  });

  test('should wrap res.json and update record status to failed on 500 error response', async () => {
    req.headers = { 'idempotency-key': 'test-key-fail-wrap' };
    const mockRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue({
      _id: mockRecordId,
      status: 'in_progress'
    });
    (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

    await idempotencyMiddleware(req as Request, res as Response, next);

    res.statusCode = 500;
    res.json!({ message: 'AI service unavailable' });

    // Wait for microtask queue
    await Promise.resolve();

    expect(IdempotencyRecord.findByIdAndUpdate).toHaveBeenCalledWith(
      mockRecordId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          responseStatus: 500,
          responseData: { message: 'AI service unavailable' }
        })
      })
    );
  });

  test('should retain in_progress status and not mark as failed when client disconnects (close event)', async () => {
    req.headers = { 'idempotency-key': 'test-disconnect-key' };
    const mockRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue({
      _id: mockRecordId,
      status: 'in_progress'
    });

    let closeHandler: (() => void) | undefined;
    onMock.mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') {
        closeHandler = cb;
      }
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    // Simulate client disconnect while response is not ended
    (res as any).writableEnded = false;
    expect(closeHandler).toBeDefined();
    closeHandler!();

    // IdempotencyRecord should NOT be marked as failed
    expect(IdempotencyRecord.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('should update record to completed when handler finishes after client disconnects', async () => {
    req.headers = { 'idempotency-key': 'test-disconnect-complete-key' };
    const mockRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue({
      _id: mockRecordId,
      status: 'in_progress'
    });
    (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

    let closeHandler: (() => void) | undefined;
    onMock.mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') {
        closeHandler = cb;
      }
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    // Client disconnects
    (res as any).writableEnded = false;
    (res as any).destroyed = true;
    closeHandler!();

    // Downstream handler finishes with success
    res.statusCode = 201;
    res.json!({ ideaId: 'idea-after-disconnect', success: true });

    await Promise.resolve();

    expect(IdempotencyRecord.findByIdAndUpdate).toHaveBeenCalledWith(
      mockRecordId,
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'completed',
          responseStatus: 201,
          responseData: { ideaId: 'idea-after-disconnect', success: true }
        })
      })
    );
  });

  test('should accept x-idempotency-key header variant', async () => {
    req.headers = { 'x-idempotency-key': 'test-alt-key' };
    const mockRecord = {
      _id: new mongoose.Types.ObjectId(),
      status: 'in_progress'
    };
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue(mockRecord);

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(IdempotencyRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'test-alt-key',
      status: 'in_progress'
    }));
    // New in_progress record must NOT have expiresAt set
    const createCallArg = (IdempotencyRecord.create as jest.Mock).mock.calls[0][0];
    expect(createCallArg.expiresAt).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe('TTL and Recovery Policy Unit Tests', () => {
    test('should assign 24-hour expiresAt when record completes', async () => {
      req.headers = { 'idempotency-key': 'test-ttl-complete' };
      const mockRecordId = new mongoose.Types.ObjectId();
      (IdempotencyRecord.create as jest.Mock).mockResolvedValue({
        _id: mockRecordId,
        status: 'in_progress'
      });
      (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      const beforeTime = Date.now();
      await idempotencyMiddleware(req as Request, res as Response, next);

      res.statusCode = 200;
      res.json!({ success: true });
      await Promise.resolve();

      const afterTime = Date.now();
      const updateCall = (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mock.calls[0];
      const updateSet = updateCall[1].$set;

      expect(updateSet.status).toBe('completed');
      expect(updateSet.expiresAt).toBeInstanceOf(Date);
      const expiresAtMs = updateSet.expiresAt.getTime();
      const expectedMin = beforeTime + 24 * 60 * 60 * 1000;
      const expectedMax = afterTime + 24 * 60 * 60 * 1000;
      expect(expiresAtMs).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAtMs).toBeLessThanOrEqual(expectedMax);
    });

    test('should assign 24-hour expiresAt when record fails', async () => {
      req.headers = { 'idempotency-key': 'test-ttl-fail' };
      const mockRecordId = new mongoose.Types.ObjectId();
      (IdempotencyRecord.create as jest.Mock).mockResolvedValue({
        _id: mockRecordId,
        status: 'in_progress'
      });
      (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      const beforeTime = Date.now();
      await idempotencyMiddleware(req as Request, res as Response, next);

      res.statusCode = 500;
      res.json!({ success: false, message: 'Server error' });
      await Promise.resolve();

      const afterTime = Date.now();
      const updateCall = (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mock.calls[0];
      const updateSet = updateCall[1].$set;

      expect(updateSet.status).toBe('failed');
      expect(updateSet.expiresAt).toBeInstanceOf(Date);
      const expiresAtMs = updateSet.expiresAt.getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(beforeTime + 24 * 60 * 60 * 1000);
      expect(expiresAtMs).toBeLessThanOrEqual(afterTime + 24 * 60 * 60 * 1000);
    });

    test('should remove expiresAt via $unset when claiming retry for failed record', async () => {
      req.headers = { 'idempotency-key': 'test-ttl-retry-unset' };
      const duplicateError: any = new Error('E11000 duplicate key');
      duplicateError.code = 11000;
      (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

      const existingRecordId = new mongoose.Types.ObjectId();
      (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
        _id: existingRecordId,
        httpMethod: 'POST',
        endpoint: '/api/idea/submit',
        requestPayloadHash: getPayloadHash(req.body),
        status: 'failed',
        expiresAt: new Date(Date.now() + 100000)
      });

      (IdempotencyRecord.findOneAndUpdate as jest.Mock).mockResolvedValue({
        _id: existingRecordId,
        status: 'in_progress'
      });

      await idempotencyMiddleware(req as Request, res as Response, next);

      expect(IdempotencyRecord.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: existingRecordId, status: 'failed' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'in_progress' }),
          $unset: { expiresAt: 1 }
        }),
        { new: true }
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('should block duplicate request for permanently in_progress record with 409 without calling next()', async () => {
      req.headers = { 'idempotency-key': 'test-stuck-in-progress' };
      const duplicateError: any = new Error('E11000 duplicate key');
      duplicateError.code = 11000;
      (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

      // Record stuck in in_progress (e.g. from 5 hours ago)
      (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        httpMethod: 'POST',
        endpoint: '/api/idea/submit',
        requestPayloadHash: getPayloadHash(req.body),
        status: 'in_progress',
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000)
      });

      await idempotencyMiddleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Request currently in progress. Please retry shortly.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should assign fresh expiresAt when completed retry finishes', async () => {
      req.headers = { 'idempotency-key': 'test-retry-completed-fresh-ttl' };
      const duplicateError: any = new Error('E11000 duplicate key');
      duplicateError.code = 11000;
      (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

      const existingRecordId = new mongoose.Types.ObjectId();
      (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
        _id: existingRecordId,
        httpMethod: 'POST',
        endpoint: '/api/idea/submit',
        requestPayloadHash: getPayloadHash(req.body),
        status: 'failed'
      });

      const retryClaim = {
        _id: existingRecordId,
        status: 'in_progress'
      };
      (IdempotencyRecord.findOneAndUpdate as jest.Mock).mockResolvedValue(retryClaim);
      (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      await idempotencyMiddleware(req as Request, res as Response, next);

      // Downstream handler executes and finishes successfully
      const beforeComplete = Date.now();
      res.statusCode = 201;
      res.json!({ ideaId: 'idea-retried', success: true });
      await Promise.resolve();

      const afterComplete = Date.now();
      expect(IdempotencyRecord.findByIdAndUpdate).toHaveBeenCalledWith(
        existingRecordId,
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'completed',
            responseStatus: 201,
            expiresAt: expect.any(Date)
          })
        })
      );
      const updateCall = (IdempotencyRecord.findByIdAndUpdate as jest.Mock).mock.calls[0];
      const assignedExpiresAt = updateCall[1].$set.expiresAt.getTime();
      expect(assignedExpiresAt).toBeGreaterThanOrEqual(beforeComplete + 24 * 60 * 60 * 1000);
      expect(assignedExpiresAt).toBeLessThanOrEqual(afterComplete + 24 * 60 * 60 * 1000);
    });
  });
});
