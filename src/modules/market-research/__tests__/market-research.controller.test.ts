import { Request, Response } from 'express';
import { analyzeMarket } from '../market-research.controller';
import User from '../../users/user.model';
import * as geminiClient from '../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../shared/middleware/credit.middleware';
import * as activityLogger from '../../../shared/utils/activity-logger';

jest.mock('../../users/user.model');
jest.mock('../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../shared/middleware/credit.middleware');
jest.mock('../../../shared/utils/activity-logger');

describe('Market Research Controller Unit Tests', () => {
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

  describe('analyzeMarket', () => {
    test('should return 400 if required inputs are missing', async () => {
      req.body = { ideaText: 'Idea' }; // missing industry and targetRegion
      (req as any).user = { _id: 'user-1' };

      await analyzeMarket(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Please provide startup idea')
      }));
    });

    test('should return 401 if user is unauthorized', async () => {
      req.body = { ideaText: 'Idea', industry: 'EdTech', targetRegion: 'Global' };
      req.user = undefined;

      await analyzeMarket(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    test('should return 402 if credit deduction fails', async () => {
      req.body = { ideaText: 'Idea', industry: 'EdTech', targetRegion: 'Global' };
      (req as any).user = { _id: 'user-1' };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({ success: false });

      await analyzeMarket(req as Request, res as Response);

      expect(creditMiddleware.atomicDeductCredits).toHaveBeenCalledWith('user-1', 2, 'market_research');
      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });

    test('should generate research, log activity, and return result with user credits on success', async () => {
      req.body = { ideaText: 'My EdTech idea', industry: 'EdTech', targetRegion: 'North America' };
      (req as any).user = { _id: 'user-1' };

      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 2, purchased: 0 }
      });

      const mockMarketData = {
        tam: { value: 1000000 },
        sam: { value: 100000 },
        som: { value: 10000 },
        trends: [],
        personas: [],
        competitorActivity: []
      };
      (geminiClient.generateMarketResearch as jest.Mock).mockResolvedValue(mockMarketData);
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
      (User.findById as jest.Mock).mockResolvedValue({ credits: 8 });

      await analyzeMarket(req as Request, res as Response);

      expect(geminiClient.generateMarketResearch).toHaveBeenCalledWith('My EdTech idea', 'EdTech', 'North America');
      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        ...mockMarketData,
        userCredits: 8
      }));
    });

    test('should refund credits if Gemini market research call fails', async () => {
      req.body = { ideaText: 'My EdTech idea', industry: 'EdTech', targetRegion: 'North America' };
      (req as any).user = { _id: 'user-1' };

      const split = { monthly: 2, purchased: 0 };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.generateMarketResearch as jest.Mock).mockRejectedValue(new Error('AI failed'));

      await analyzeMarket(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('user-1', split, 'market_research');
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to analyze market' }));
    });
  });
});
