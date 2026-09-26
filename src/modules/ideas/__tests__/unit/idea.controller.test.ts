import { Request, Response } from 'express';
import {
  submitStartupIdea,
  getIdeaById,
  getSavedIdeas,
  deleteIdea
} from '../../idea.controller';
import Idea from '../../idea.model';
import User from '../../../users/user.model';
import * as geminiClient from '../../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../../shared/middleware/credit.middleware';
import * as activityLogger from '../../../../shared/utils/activity-logger';

jest.mock('../../idea.model');
jest.mock('../../../users/user.model');
jest.mock('../../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../../shared/middleware/credit.middleware');
jest.mock('../../../../shared/utils/activity-logger');

describe('Idea Controller Unit Tests', () => {
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

  describe('submitStartupIdea', () => {
    test('should return 400 if ideaText is missing', async () => {
      req.body = {};
      (req as any).user = { _id: 'user-123' };

      await submitStartupIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Please provide your startup idea'
      }));
    });

    test('should return 401 if user is not authenticated', async () => {
      req.body = { ideaText: 'Uber for pets' };
      req.user = undefined;

      await submitStartupIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized'
      }));
    });

    test('should return 402 if credit deduction fails (insufficient credits)', async () => {
      req.body = { ideaText: 'Uber for pets' };
      (req as any).user = { _id: 'user-123' };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: false
      });

      await submitStartupIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Insufficient credits'
      }));
    });

    test('should validate idea, persist to db, log activity and return 201 on success', async () => {
      req.body = { ideaText: 'Uber for pets' };
      (req as any).user = { _id: 'user-123' };

      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });

      const mockAnalysis = {
        marketDemandScore: 85,
        competitionScore: 70,
        monetizationFeasibilityScore: 80,
        overallScore: 78,
        analysis: { marketDemand: { score: 85, text: 'Great' } }
      };
      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockAnalysis);

      const mockIdea = {
        _id: 'idea-456',
        userId: 'user-123',
        ideaText: 'Uber for pets',
        toObject: () => ({ _id: 'idea-456', ideaText: 'Uber for pets', overallScore: 78 })
      };
      (Idea.create as jest.Mock).mockResolvedValue(mockIdea);
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
      (User.findById as jest.Mock).mockResolvedValue({ credits: 5 });

      await submitStartupIdea(req as Request, res as Response);

      expect(geminiClient.validateIdea).toHaveBeenCalledWith('Uber for pets');
      expect(Idea.create).toHaveBeenCalled();
      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user-123', { $push: { savedIdeas: 'idea-456' } });
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        _id: 'idea-456',
        userCredits: 5
      }));
    });

    test('should refund credits if Gemini validation or database write fails', async () => {
      req.body = { ideaText: 'Uber for pets' };
      (req as any).user = { _id: 'user-123' };

      const split = { monthly: 1, purchased: 0 };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.validateIdea as jest.Mock).mockRejectedValue(new Error('AI Rate limit'));

      await submitStartupIdea(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('user-123', split, 'idea_validation');
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'AI Rate limit'
      }));
    });
  });

  describe('getIdeaById', () => {
    test('should return 404 if idea is not found', async () => {
      req.params = { id: 'missing-idea' };
      (req as any).user = { _id: 'user-123' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await getIdeaById(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Idea not found'
      }));
    });

    test('should return 403 if idea belongs to another user', async () => {
      req.params = { id: 'idea-123' };
      (req as any).user = { _id: 'attacker-id' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-123',
        userId: 'victim-id'
      });

      await getIdeaById(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized to access this idea'
      }));
    });

    test('should return idea when authenticated user is the owner', async () => {
      req.params = { id: 'idea-123' };
      (req as any).user = { _id: 'owner-id' };
      const mockIdea = {
        _id: 'idea-123',
        userId: 'owner-id',
        ideaText: 'Great startup'
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);

      await getIdeaById(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(mockIdea);
    });
  });

  describe('getSavedIdeas', () => {
    test('should return 401 if user is not authorized', async () => {
      req.user = undefined;

      await getSavedIdeas(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized'
      }));
    });

    test('should return paginated saved ideas for authenticated user', async () => {
      (req as any).user = { _id: 'user-123' };
      req.query = { page: '1', limit: '10' };

      const mockIdeas = [{ _id: 'i1' }, { _id: 'i2' }];
      const sortMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          skip: jest.fn().mockResolvedValue(mockIdeas)
        })
      });
      (Idea.find as jest.Mock).mockReturnValue({ sort: sortMock });
      (Idea.countDocuments as jest.Mock).mockResolvedValue(2);

      await getSavedIdeas(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        ideas: mockIdeas,
        totalPages: 1,
        currentPage: 1,
        total: 2
      });
    });
  });

  describe('deleteIdea', () => {
    test('should return 404 if idea to delete does not exist', async () => {
      req.params = { id: 'idea-missing' };
      (req as any).user = { _id: 'user-123' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await deleteIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Idea not found'
      }));
    });

    test('should return 403 if user is not the owner of the idea', async () => {
      req.params = { id: 'idea-123' };
      (req as any).user = { _id: 'attacker-id' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-123',
        userId: 'owner-id'
      });

      await deleteIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Not authorized to delete this idea'
      }));
    });

    test('should remove idea from user savedIdeas, delete idea and return success', async () => {
      req.params = { id: 'idea-123' };
      (req as any).user = { _id: 'owner-id' };
      const deleteOneMock = jest.fn().mockResolvedValue(true);
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-123',
        userId: 'owner-id',
        deleteOne: deleteOneMock
      });
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      await deleteIdea(req as Request, res as Response);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('owner-id', { $pull: { savedIdeas: 'idea-123' } });
      expect(deleteOneMock).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Idea removed' });
    });
  });
});
