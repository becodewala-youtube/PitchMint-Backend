import { Request, Response } from 'express';
import {
  generateCanvasForIdea,
  regenerateCanvas
} from '../canvas.controller';
import Idea from '../../ideas/idea.model';
import User from '../../users/user.model';
import * as geminiClient from '../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../shared/middleware/credit.middleware';

jest.mock('../../ideas/idea.model');
jest.mock('../../users/user.model');
jest.mock('../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../shared/middleware/credit.middleware');

describe('Canvas Controller Unit Tests', () => {
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

  describe('generateCanvasForIdea', () => {
    test('should return 404 if idea is not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await generateCanvasForIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Idea not found' }));
    });

    test('should return 403 if user is not authorized to access idea', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'attacker' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner'
      });

      await generateCanvasForIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    test('should return 402 if credit deduction fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({ success: false });

      await generateCanvasForIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });

    test('should deduct credit, generate canvas, and update idea on success', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Idea text',
        analysis: {},
        canvasContent: null as any,
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'idea-1', canvasContent: { problem: 'Problem' } })
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      (geminiClient.generateCanvas as jest.Mock).mockResolvedValue({ problem: 'Problem' });
      (User.findById as jest.Mock).mockResolvedValue({ credits: 6 });

      await generateCanvasForIdea(req as Request, res as Response);

      expect(geminiClient.generateCanvas).toHaveBeenCalledWith('Idea text', {});
      expect(mockIdea.canvasContent).toEqual({ problem: 'Problem' });
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        userCredits: 6
      }));
    });

    test('should refund credits if Gemini canvas generation fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };

      const split = { monthly: 1, purchased: 0 };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Idea'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.generateCanvas as jest.Mock).mockRejectedValue(new Error('AI failed'));

      await generateCanvasForIdea(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('owner', split, 'canvas');
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to generate canvas' }));
    });
  });

  describe('regenerateCanvas', () => {
    test('should regenerate canvas and refund on error', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };

      const split = { monthly: 1, purchased: 0 };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Idea'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.generateCanvas as jest.Mock).mockRejectedValue(new Error('Gemini down'));

      await regenerateCanvas(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('owner', split, 'canvas');
      expect(statusMock).toHaveBeenCalledWith(500);
    });

    test('should regenerate canvas successfully', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Idea',
        analysis: {},
        canvasContent: null as any,
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'idea-1', canvasContent: { uniqueValueProposition: 'UVP' } })
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      (geminiClient.generateCanvas as jest.Mock).mockResolvedValue({ uniqueValueProposition: 'UVP' });
      (User.findById as jest.Mock).mockResolvedValue({ credits: 2 });

      await regenerateCanvas(req as Request, res as Response);

      expect(mockIdea.canvasContent).toEqual({ uniqueValueProposition: 'UVP' });
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        userCredits: 2
      }));
    });

    test('should return 404 if idea not found', async () => {
      req.params = { id: 'missing-id' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await regenerateCanvas(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Idea not found' }));
    });

    test('should return 403 if idea belongs to another user', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'user-a' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'user-b'
      });

      await regenerateCanvas(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized to access this idea' }));
    });

    test('should return 402 if credit deduction fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: false
      });

      await regenerateCanvas(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });
  });
});
