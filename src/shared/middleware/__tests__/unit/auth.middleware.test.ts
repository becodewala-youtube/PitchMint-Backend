import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { protect, premium } from '../../auth.middleware';
import User from '../../../../modules/users/user.model';
import env from '../../../../config/env';

jest.mock('../../../../modules/users/user.model');

describe('Auth Middleware Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    next = jest.fn();
    req = { headers: {} };
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('protect middleware', () => {
    test('should return 401 if authorization header is missing', async () => {
      req.headers = {};

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Not authorized, no token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if header does not start with Bearer', async () => {
      req.headers = { authorization: 'Basic token123' };

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Not authorized, no token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if token is the literal string "null"', async () => {
      req.headers = { authorization: 'Bearer null' };

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Not authorized, no valid token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if token is the literal string "undefined"', async () => {
      req.headers = { authorization: 'Bearer undefined' };

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Not authorized, no valid token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if jwt verification fails', async () => {
      req.headers = { authorization: 'Bearer bad_token' };

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Not authorized, token failed' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if user is not found in database', async () => {
      const validToken = jwt.sign({ id: 'user_123' }, env.JWT_SECRET);
      req.headers = { authorization: `Bearer ${validToken}` };

      const selectMock = jest.fn().mockResolvedValue(null);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'User not found' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if tokenVersion in payload does not match user tokenVersion', async () => {
      const validToken = jwt.sign({ id: 'user_123', tokenVersion: 1 }, env.JWT_SECRET);
      req.headers = { authorization: `Bearer ${validToken}` };

      const mockUser = {
        _id: 'user_123',
        tokenVersion: 2 // invalidated!
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await protect(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Token has been invalidated. Please log in again.' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next() and attach user if token and tokenVersion are valid', async () => {
      const validToken = jwt.sign({ id: 'user_123', tokenVersion: 3 }, env.JWT_SECRET);
      req.headers = { authorization: `Bearer ${validToken}` };

      const mockUser = {
        _id: 'user_123',
        name: 'Valid User',
        tokenVersion: 3
      };
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      (User.findById as jest.Mock).mockReturnValue({ select: selectMock });

      await protect(req as Request, res as Response, next);

      expect((req as any).user).toBe(mockUser);
      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('premium middleware', () => {
    test('should call next() if req.user is premium', () => {
      (req as any).user = { _id: 'user_123', isPremium: true };

      premium(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    test('should return 403 if req.user is not premium', () => {
      (req as any).user = { _id: 'user_123', isPremium: false };

      premium(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Premium subscription required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 if req.user is undefined', () => {
      req.user = undefined;

      premium(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Premium subscription required'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
