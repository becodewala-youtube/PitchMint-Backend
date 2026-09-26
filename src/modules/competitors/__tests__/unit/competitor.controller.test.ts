import { Request, Response } from 'express';
import {
  analyzeCompetitors,
  analyzeCompetitorsRandom
} from '../../competitor.controller';
import Idea from '../../../ideas/idea.model';
import User from '../../../users/user.model';
import * as geminiClient from '../../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../../shared/middleware/credit.middleware';
import * as activityLogger from '../../../../shared/utils/activity-logger';

jest.mock('../../../ideas/idea.model');
jest.mock('../../../users/user.model');
jest.mock('../../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../../shared/middleware/credit.middleware');
jest.mock('../../../../shared/utils/activity-logger');

describe('Competitor Controller Unit Tests', () => {
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

  describe('analyzeCompetitors', () => {
    test('should return 404 if idea is not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await analyzeCompetitors(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Idea not found' }));
    });

    test('should return 403 if user is unauthorized', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'attacker' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner'
      });

      await analyzeCompetitors(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    test('should return cached analysis if regenerate is false and analysis exists', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.body = { regenerate: false };

      const cachedAnalysis = { competitors: [{ name: 'Comp1' }], summary: 'Summary' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        competitorAnalysis: cachedAnalysis
      });

      await analyzeCompetitors(req as Request, res as Response);

      expect(creditMiddleware.atomicDeductCredits).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ competitorAnalysis: cachedAnalysis });
    });

    test('should deduct credit, generate analysis, save to idea, log activity, and return result', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.body = { regenerate: true };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'My startup idea',
        competitorAnalysis: null as any,
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });

      const newAnalysis = { competitors: [{ name: 'NewComp' }], summary: 'New Summary' };
      (geminiClient.generateCompetitorAnalysis as jest.Mock).mockResolvedValue(newAnalysis);
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
      (User.findById as jest.Mock).mockResolvedValue({ credits: 7 });

      await analyzeCompetitors(req as Request, res as Response);

      expect(mockIdea.competitorAnalysis).toEqual(newAnalysis);
      expect(mockIdea.save).toHaveBeenCalled();
      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({
        competitorAnalysis: newAnalysis,
        userCredits: 7
      });
    });

    test('should refund credits if analysis generation fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.body = { regenerate: true };

      const split = { monthly: 1, purchased: 0 };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Idea text'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.generateCompetitorAnalysis as jest.Mock).mockRejectedValue(new Error('AI failed'));

      await analyzeCompetitors(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('owner', split, 'competitor_analysis');
      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('analyzeCompetitorsRandom', () => {
    test('should return 400 if ideaText is missing', async () => {
      req.body = {};
      (req as any).user = { _id: 'user-1' };

      await analyzeCompetitorsRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    test('should deduct credit, generate analysis and log activity for random idea', async () => {
      req.body = { ideaText: 'Standalone idea' };
      (req as any).user = { _id: 'user-1' };

      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      const analysis = { competitors: [], summary: 'Summary' };
      (geminiClient.generateCompetitorAnalysis as jest.Mock).mockResolvedValue(analysis);
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
      (User.findById as jest.Mock).mockResolvedValue({ credits: 4 });

      await analyzeCompetitorsRandom(req as Request, res as Response);

      expect(creditMiddleware.atomicDeductCredits).toHaveBeenCalledWith('user-1', 1, 'competitor_analysis');
      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        summary: 'Summary',
        userCredits: 4
      }));
    });

    test('should return 401 if req.user._id is missing', async () => {
      req.body = { ideaText: 'Standalone idea' };
      (req as any).user = {};

      await analyzeCompetitorsRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized' }));
    });

    test('should return 402 if credit deduction fails for random idea', async () => {
      req.body = { ideaText: 'Standalone idea' };
      (req as any).user = { _id: 'user-1' };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: false
      });

      await analyzeCompetitorsRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });
  });

  test('should return 402 if credit deduction fails in analyzeCompetitors', async () => {
    req.params = { id: 'idea-1' };
    (req as any).user = { _id: 'owner' };
    req.body = { regenerate: true };

    (Idea.findById as jest.Mock).mockResolvedValue({
      _id: 'idea-1',
      userId: 'owner',
      ideaText: 'Idea text'
    });
    (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
      success: false
    });

    await analyzeCompetitors(req as Request, res as Response);

    expect(statusMock).toHaveBeenCalledWith(402);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
  });
});
