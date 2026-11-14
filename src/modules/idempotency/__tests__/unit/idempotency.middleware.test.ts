import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { idempotencyMiddleware } from '../../../../shared/middleware/idempotency.middleware';
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

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn().mockReturnThis();
    sendMock = jest.fn().mockReturnThis();
    onMock = jest.fn();

    req = {
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

  test('should atomically insert in_progress record and call next() on new request', async () => {
    req.headers = { 'idempotency-key': 'test-key-2' };
    const mockRecord = {
      _id: new mongoose.Types.ObjectId(),
      status: 'in_progress'
    };
    (IdempotencyRecord.create as jest.Mock).mockResolvedValue(mockRecord);

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(IdempotencyRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'test-key-2',
      status: 'in_progress',
      endpoint: '/api/idea/submit'
    }));
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('should return cached response immediately when existing record is completed (0 credits, no next)', async () => {
    req.headers = { 'idempotency-key': 'test-key-completed' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    const cachedData = { _id: 'idea-123', overallScore: 85, userCredits: 2 };
    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      status: 'completed',
      responseStatus: 201,
      responseData: cachedData
    });

    await idempotencyMiddleware(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(201);
    expect(jsonMock).toHaveBeenCalledWith(cachedData);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 409 Conflict when duplicate request is still in_progress', async () => {
    req.headers = { 'idempotency-key': 'test-key-in-progress' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
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

  test('should allow retry by transitioning status from failed to in_progress and calling next()', async () => {
    req.headers = { 'idempotency-key': 'test-key-failed-retry' };
    const duplicateError: any = new Error('E11000 duplicate key');
    duplicateError.code = 11000;
    (IdempotencyRecord.create as jest.Mock).mockRejectedValue(duplicateError);

    const existingRecordId = new mongoose.Types.ObjectId();
    (IdempotencyRecord.findOne as jest.Mock).mockResolvedValue({
      _id: existingRecordId,
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
    expect(next).toHaveBeenCalledTimes(1);
  });
});
