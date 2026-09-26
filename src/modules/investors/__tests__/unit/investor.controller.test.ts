import { Request, Response } from 'express';
import {
  getInvestors,
  getInvestorById,
  matchInvestors
} from '../../investor.controller';
import Investor from '../../investor.model';
import User from '../../../users/user.model';
import * as geminiClient from '../../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../../shared/middleware/credit.middleware';
import * as activityLogger from '../../../../shared/utils/activity-logger';

jest.mock('../../investor.model');
jest.mock('../../../users/user.model');
jest.mock('../../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../../shared/middleware/credit.middleware');
jest.mock('../../../../shared/utils/activity-logger');

describe('Investor Controller Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();
    req = { body: {}, params: {}, query: {} };
    res = {
      status: statusMock,
      json: jsonMock
    };
  });

  describe('getInvestors', () => {
    test('should query investors with optional type and industry filters', async () => {
      req.query = { type: 'VC', industry: 'Fintech' };
      const sortMock = jest.fn().mockResolvedValue([{ name: 'Sequoia' }]);
      (Investor.find as jest.Mock).mockReturnValue({ sort: sortMock });

      await getInvestors(req as Request, res as Response);

      expect(Investor.find).toHaveBeenCalledWith({
        type: 'VC',
        industryFocus: { $in: ['Fintech'] }
      });
      expect(jsonMock).toHaveBeenCalledWith([{ name: 'Sequoia' }]);
    });

    test('should query all investors when no filters provided', async () => {
      req.query = {};
      const sortMock = jest.fn().mockResolvedValue([{ name: 'All' }]);
      (Investor.find as jest.Mock).mockReturnValue({ sort: sortMock });

      await getInvestors(req as Request, res as Response);

      expect(Investor.find).toHaveBeenCalledWith({});
      expect(jsonMock).toHaveBeenCalledWith([{ name: 'All' }]);
    });
  });

  describe('getInvestorById', () => {
    test('should return 404 if investor not found', async () => {
      req.params = { id: 'missing' };
      (Investor.findById as jest.Mock).mockResolvedValue(null);

      await getInvestorById(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Investor not found' }));
    });

    test('should return investor on success', async () => {
      req.params = { id: 'inv-123' };
      const mockInvestor = { _id: 'inv-123', name: 'Y Combinator' };
      (Investor.findById as jest.Mock).mockResolvedValue(mockInvestor);

      await getInvestorById(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(mockInvestor);
    });
  });

  describe('matchInvestors', () => {
    test('should return 401 if user is unauthorized', async () => {
      req.body = { industry: 'AI' };
      req.user = undefined;

      await matchInvestors(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    test('should return 402 if credit deduction fails', async () => {
      req.body = { industry: 'AI' };
      (req as any).user = { _id: 'user-1' };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({ success: false });

      await matchInvestors(req as Request, res as Response);

      expect(creditMiddleware.atomicDeductCredits).toHaveBeenCalledWith('user-1', 2, 'investor_matching');
      expect(statusMock).toHaveBeenCalledWith(402);
    });

    test('should match investors, log activity, and return result on success', async () => {
      req.body = { industry: 'Healthcare', stage: 'Seed' };
      (req as any).user = { _id: 'user-1' };

      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 2, purchased: 0 }
      });
      const matches = [{ name: 'Health Angels', matchScore: 90 }];
      (geminiClient.matchInvestors as jest.Mock).mockResolvedValue(matches);
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
      (User.findById as jest.Mock).mockResolvedValue({ credits: 10 });

      await matchInvestors(req as Request, res as Response);

      expect(geminiClient.matchInvestors).toHaveBeenCalledWith({ industry: 'Healthcare', stage: 'Seed' });
      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({
        matches,
        userCredits: 10
      });
    });

    test('should refund credits if matching fails', async () => {
      req.body = { industry: 'Healthcare', stage: 'Seed' };
      (req as any).user = { _id: 'user-1' };

      const split = { monthly: 2, purchased: 0 };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.matchInvestors as jest.Mock).mockRejectedValue(new Error('AI failed'));

      await matchInvestors(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('user-1', split, 'investor_matching');
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });
});
