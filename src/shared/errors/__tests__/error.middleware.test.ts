import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from '../error.middleware';
import env from '../../../config/env';

describe('Error Middleware Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    next = jest.fn();
    req = { originalUrl: '/api/unknown-endpoint' };
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('errorHandler', () => {
    test('should respond with error statusCode and message', () => {
      const err: any = new Error('Custom validation failed');
      err.statusCode = 422;

      errorHandler(err, req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(422);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Custom validation failed'
      }));
    });

    test('should default to 500 and Internal Server Error if unspecified', () => {
      const err: any = {};

      errorHandler(err, req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Internal Server Error'
      }));
    });

    test('should omit stack trace in non-development environment', () => {
      const prevEnv = env.NODE_ENV;
      (env as any).NODE_ENV = 'production';

      const err: any = new Error('Production error');
      errorHandler(err, req as Request, res as Response, next);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        stack: undefined
      }));

      (env as any).NODE_ENV = prevEnv;
    });
  });

  describe('notFoundHandler', () => {
    test('should return 404 with route url in message', () => {
      notFoundHandler(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Route /api/unknown-endpoint not found'
      });
    });
  });
});
