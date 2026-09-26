import { Request, Response, NextFunction } from 'express';
import { handleValidationErrors, sanitizeInput } from '../sanitizer.middleware';
import * as expressValidator from 'express-validator';

jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

describe('Sanitizer Middleware Unit Tests', () => {
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
    req = {};
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('handleValidationErrors', () => {
    test('should return 400 with errors array when validation fails', () => {
      const mockErrors = [{ path: 'email', msg: 'Invalid email' }];
      (expressValidator.validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => false,
        array: () => mockErrors
      });

      handleValidationErrors(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ errors: mockErrors });
      expect(next).not.toHaveBeenCalled();
    });

    test('should call next() when validation passes without errors', () => {
      (expressValidator.validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      handleValidationErrors(req as Request, res as Response, next);

      expect(statusMock).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('sanitizeInput', () => {
    test('should be defined as middleware function', () => {
      expect(typeof sanitizeInput).toBe('function');
    });
  });
});
