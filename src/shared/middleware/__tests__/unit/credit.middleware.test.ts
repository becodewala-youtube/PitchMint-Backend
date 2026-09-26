import { Request, Response, NextFunction } from 'express';
import {
  checkCredits,
  atomicDeductCredits,
  refundCredits
} from '../../credit.middleware';
import User from '../../../../modules/users/user.model';
import CreditTransaction from '../../../../modules/credits/credit.model';

jest.mock('../../../../modules/users/user.model');
jest.mock('../../../../modules/credits/credit.model');

describe('Credit Middleware Unit Tests', () => {
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

  describe('checkCredits middleware', () => {
    test('should return 401 if user is not authorized', async () => {
      req.user = undefined;

      const middleware = checkCredits(2);
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Not authorized' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 404 if user not found in database', async () => {
      (req as any).user = { _id: 'missing-user' };
      (User.findById as jest.Mock).mockResolvedValue(null);

      const middleware = checkCredits(1);
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'User not found' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 402 if user credits are insufficient', async () => {
      (req as any).user = { _id: 'broke-user' };
      const mockUser = {
        _id: 'broke-user',
        credits: 1,
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      const middleware = checkCredits(3);
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Insufficient credits',
        creditsRequired: 3,
        creditsAvailable: 1,
        needsUpgrade: true
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('should attach updated user and call next() if user has sufficient credits', async () => {
      (req as any).user = { _id: 'rich-user' };
      const mockUser = {
        _id: 'rich-user',
        credits: 10,
        checkAndResetMonthlyCredits: jest.fn().mockResolvedValue(false)
      };
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      const middleware = checkCredits(2);
      await middleware(req as Request, res as Response, next);

      expect((req as any).user).toBe(mockUser);
      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('atomicDeductCredits', () => {
    test('should return failure if user has insufficient credits', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

      const result = await atomicDeductCredits('user-1', 5, 'idea_validation');

      expect(result).toEqual({
        success: false,
        monthly: 0,
        purchased: 0,
        split: { monthly: 0, purchased: 0 }
      });
      expect(CreditTransaction.create).not.toHaveBeenCalled();
    });

    test('should deduct from monthlyCredits pool first when monthly >= amount', async () => {
      const beforeUser = {
        _id: 'user-1',
        monthlyCredits: 3,
        purchasedCredits: 10
      };
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(beforeUser);
      (CreditTransaction.create as jest.Mock).mockResolvedValue(true);

      const result = await atomicDeductCredits('user-1', 2, 'idea_validation');

      expect(result).toEqual({
        success: true,
        monthly: 2,
        purchased: 0,
        split: { monthly: 2, purchased: 0 }
      });
      expect(CreditTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        amount: -2,
        deductedFrom: { monthly: 2, purchased: 0 },
        relatedService: 'idea_validation'
      }));
    });

    test('should split deduction between monthly and purchased when monthly < amount', async () => {
      const beforeUser = {
        _id: 'user-1',
        monthlyCredits: 1,
        purchasedCredits: 10
      };
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(beforeUser);
      (CreditTransaction.create as jest.Mock).mockResolvedValue(true);

      const result = await atomicDeductCredits('user-1', 3, 'market_research');

      expect(result).toEqual({
        success: true,
        monthly: 1,
        purchased: 2,
        split: { monthly: 1, purchased: 2 }
      });
      expect(CreditTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        amount: -3,
        deductedFrom: { monthly: 1, purchased: 2 },
        relatedService: 'market_research'
      }));
    });

    test('should compensate and rollback balance if transaction ledger write fails', async () => {
      const beforeUser = {
        _id: 'user-1',
        monthlyCredits: 2,
        purchasedCredits: 5
      };
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(beforeUser);
      (CreditTransaction.create as jest.Mock).mockRejectedValue(new Error('MongoNetworkTimeout'));
      (User.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

      const result = await atomicDeductCredits('user-1', 3, 'idea_validation');

      // Deduction: 2 monthly, 1 purchased. Compensate must rollback exact pools.
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        { $inc: { monthlyCredits: 2, purchasedCredits: 1 } }
      );
      expect(result).toEqual({
        success: false,
        monthly: 0,
        purchased: 0,
        split: { monthly: 0, purchased: 0 }
      });
    });
  });

  describe('refundCredits', () => {
    test('should refund credits to exact pools and create transaction', async () => {
      const mockUpdatedUser = {
        _id: 'user-1',
        monthlyCredits: 3,
        purchasedCredits: 5
      };
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedUser);
      (CreditTransaction.create as jest.Mock).mockResolvedValue(true);

      const split = { monthly: 1, purchased: 2 };
      const result = await refundCredits('user-1', { split }, 'idea_validation', 'ref-123');

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user-1', processedRefunds: { $ne: 'ref-123' } },
        {
          $push: { processedRefunds: 'ref-123' },
          $inc: { monthlyCredits: 1, purchasedCredits: 2 }
        },
        { new: true }
      );
      expect(CreditTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        type: 'refund',
        amount: 3,
        refundId: 'ref-123'
      }));
      expect(result).toEqual({ success: true, alreadyProcessed: false });
    });

    test('should handle number argument by refunding to purchasedCredits', async () => {
      const mockUpdatedUser = { _id: 'user-1' };
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedUser);
      (CreditTransaction.create as jest.Mock).mockResolvedValue(true);

      const result = await refundCredits('user-1', 5, 'idea_validation', 'ref-num');

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user-1', processedRefunds: { $ne: 'ref-num' } },
        {
          $push: { processedRefunds: 'ref-num' },
          $inc: { purchasedCredits: 5 }
        },
        { new: true }
      );
      expect(result).toEqual({ success: true, alreadyProcessed: false });
    });

    test('should handle idempotent duplicate refund and recover missing ledger entry', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      const mockExistingUser = {
        _id: 'user-1',
        processedRefunds: ['ref-already-done']
      };
      (User.findById as jest.Mock).mockResolvedValue(mockExistingUser);
      (CreditTransaction.findOne as jest.Mock).mockResolvedValue(null);
      (CreditTransaction.create as jest.Mock).mockResolvedValue(true);

      const result = await refundCredits('user-1', 2, 'canvas', 'ref-already-done');

      expect(CreditTransaction.findOne).toHaveBeenCalledWith({ refundId: 'ref-already-done' });
      expect(CreditTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        refundId: 'ref-already-done',
        amount: 2
      }));
      expect(result).toEqual({ success: true, alreadyProcessed: true });
    });

    test('should return success: false if user not found during refund', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockResolvedValue(null);

      const result = await refundCredits('missing-user', 2, 'canvas', 'ref-missing');

      expect(result).toEqual({ success: false });
    });

    test('should handle duplicate key 11000 error gracefully', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue({ _id: 'user-1' });
      const duplicateErr: any = new Error('E11000');
      duplicateErr.code = 11000;
      (CreditTransaction.create as jest.Mock).mockRejectedValue(duplicateErr);

      const result = await refundCredits('user-1', 2, 'canvas', 'ref-concurrent');

      expect(result).toEqual({ success: true, alreadyProcessed: false });
    });
  });
});
