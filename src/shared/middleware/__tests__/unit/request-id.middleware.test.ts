import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from '../../request-id.middleware';
import { requestContext } from '../../../utils/request-context';
import crypto from 'crypto';

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => '1234-5678-9012-3456')
}));

describe('RequestId Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = { setHeader: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should generate a new UUID if x-request-id is missing', () => {
    requestIdMiddleware(req as Request, res as Response, next);
    expect(crypto.randomUUID).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', '1234-5678-9012-3456');
    expect((req as any).requestId).toBe('1234-5678-9012-3456');
    expect(next).toHaveBeenCalled();
  });

  it('should use incoming x-request-id if valid', () => {
    const validId = 'a1B2.c3_d4:e5-f6';
    req.headers!['x-request-id'] = validId;
    requestIdMiddleware(req as Request, res as Response, next);
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', validId);
  });

  it('should replace invalid x-request-id with a new UUID', () => {
    req.headers!['x-request-id'] = 'invalid!@#$';
    requestIdMiddleware(req as Request, res as Response, next);
    expect(crypto.randomUUID).toHaveBeenCalled();
  });

  it('should replace excessively long x-request-id', () => {
    req.headers!['x-request-id'] = 'a'.repeat(129);
    requestIdMiddleware(req as Request, res as Response, next);
    expect(crypto.randomUUID).toHaveBeenCalled();
  });

  it('should provide requestId in AsyncLocalStorage context', (done) => {
    requestIdMiddleware(req as Request, res as Response, () => {
      const storedId = requestContext.getStore();
      expect(storedId).toBe('1234-5678-9012-3456');
      done();
    });
  });
});
