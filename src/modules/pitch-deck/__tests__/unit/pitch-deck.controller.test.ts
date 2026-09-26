import { Request, Response } from 'express';
import {
  generatePitchDeckForIdea,
  generateTalkingPointsForSlide,
  regeneratePitchDeck,
  updateSlideContent,
  addComment,
  deleteComment,
  processVoiceFeedback
} from '../../pitch-deck.controller';
import Idea from '../../../ideas/idea.model';
import User from '../../../users/user.model';
import * as geminiClient from '../../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../../shared/middleware/credit.middleware';

jest.mock('../../../ideas/idea.model');
jest.mock('../../../users/user.model');
jest.mock('../../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../../shared/middleware/credit.middleware');

describe('Pitch Deck Controller Unit Tests', () => {
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

  describe('generatePitchDeckForIdea', () => {
    test('should return 404 if idea not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await generatePitchDeckForIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Idea not found' }));
    });

    test('should return 403 if user is not authorized to access idea', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'attacker-id' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id'
      });

      await generatePitchDeckForIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized to access this idea' }));
    });

    test('should return 402 if credit deduction fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({ success: false });

      await generatePitchDeckForIdea(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });

    test('should generate pitch deck and update idea on success', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner-id',
        ideaText: 'My startup idea',
        analysis: {},
        pitchDeckContent: null as any,
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'idea-1', pitchDeckContent: { problem: 'Problem' } })
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      (geminiClient.generatePitchDeck as jest.Mock).mockResolvedValue({ problem: 'Problem' });
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ credits: 2 })
      });

      await generatePitchDeckForIdea(req as Request, res as Response);

      expect(geminiClient.generatePitchDeck).toHaveBeenCalledWith('My startup idea', {});
      expect(mockIdea.pitchDeckContent).toEqual({ problem: 'Problem' });
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ userCredits: 2 }));
    });

    test('should refund credits if Gemini call fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };

      const split = { monthly: 1, purchased: 0 };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id',
        ideaText: 'Idea'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.generatePitchDeck as jest.Mock).mockRejectedValue(new Error('AI failed'));

      await generatePitchDeckForIdea(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('owner-id', split, 'pitch_deck');
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to generate pitch deck' }));
    });
  });

  describe('generateTalkingPointsForSlide', () => {
    test('should return 400 if idea has no pitch deck content', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id',
        pitchDeckContent: null
      });

      await generateTalkingPointsForSlide(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'No pitch deck content available' }));
    });

    test('should generate talking points and save to collaborativeData', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      req.body = { slideIndex: 0 };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner-id',
        pitchDeckContent: { problem: 'Problem statement' },
        collaborativeData: { comments: [], talkingPoints: [] as any[], lastModified: new Date() },
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (geminiClient.generateTalkingPoints as jest.Mock).mockResolvedValue(['Point 1', 'Point 2']);

      await generateTalkingPointsForSlide(req as Request, res as Response);

      expect(geminiClient.generateTalkingPoints).toHaveBeenCalledWith('Problem statement', 'Problem');
      expect(mockIdea.collaborativeData.talkingPoints).toHaveLength(1);
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ talkingPoints: ['Point 1', 'Point 2'] });
    });

    test('should return 404 if idea not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await generateTalkingPointsForSlide(req as Request, res as Response);

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

      await generateTalkingPointsForSlide(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized to access this idea' }));
    });

    test('should update existing talking points when already present for slideIndex', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      req.body = { slideIndex: 0 };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner-id',
        pitchDeckContent: { problem: 'Problem statement' },
        collaborativeData: {
          comments: [],
          talkingPoints: [{ slideIndex: 0, points: ['Old Point'], createdAt: new Date() }],
          lastModified: new Date()
        },
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (geminiClient.generateTalkingPoints as jest.Mock).mockResolvedValue(['Updated Point']);

      await generateTalkingPointsForSlide(req as Request, res as Response);

      expect(mockIdea.collaborativeData.talkingPoints[0].points).toEqual(['Updated Point']);
      expect(mockIdea.save).toHaveBeenCalled();
    });
  });

  describe('regeneratePitchDeck', () => {
    test('should return 404 if idea not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await regeneratePitchDeck(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Idea not found' }));
    });

    test('should return 403 if unauthorized', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'user-a' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'user-b'
      });

      await regeneratePitchDeck(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized to access this idea' }));
    });

    test('should return 402 if credit deduction fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: false
      });

      await regeneratePitchDeck(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });

    test('should refund credits if Gemini generation fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };

      const split = { monthly: 1, purchased: 0 };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id',
        ideaText: 'Idea text'
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.generatePitchDeck as jest.Mock).mockRejectedValue(new Error('AI crash'));

      await regeneratePitchDeck(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('owner-id', split, 'pitch_deck');
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to regenerate pitch deck' }));
    });

    test('should deduct credit, regenerate pitch deck, and update idea', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner-id',
        ideaText: 'Idea text',
        analysis: {},
        pitchDeckContent: null as any,
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'idea-1', pitchDeckContent: { solution: 'Updated' } })
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      (geminiClient.generatePitchDeck as jest.Mock).mockResolvedValue({ solution: 'Updated' });
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ credits: 1 })
      });

      await regeneratePitchDeck(req as Request, res as Response);

      expect(mockIdea.pitchDeckContent).toEqual({ solution: 'Updated' });
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ userCredits: 1 }));
    });
  });

  describe('updateSlideContent', () => {
    test('should return 400 if no pitch deck content exists', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      req.body = { slideIndex: 0, content: 'Updated' };

      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner-id',
        pitchDeckContent: null
      });

      await updateSlideContent(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'No pitch deck content available' }));
    });

    test('should update slide content and save changes', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner-id' };
      req.body = { slideIndex: 0, content: 'New problem description' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner-id',
        pitchDeckContent: { problem: 'Old problem' } as any,
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);

      await updateSlideContent(req as Request, res as Response);

      expect(mockIdea.pitchDeckContent.problem).toBe('New problem description');
      expect(mockIdea.markModified).toHaveBeenCalledWith('pitchDeckContent');
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Slide updated successfully' });
    });
  });

  describe('addComment and deleteComment', () => {
    test('should add comment to collaborativeData', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'user-1', name: 'Commenter' };
      req.body = { text: 'Great slide', slideIndex: 1 };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'user-1',
        collaborativeData: { comments: [] as any[], talkingPoints: [], lastModified: new Date() },
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);

      await addComment(req as Request, res as Response);

      expect(mockIdea.collaborativeData.comments).toHaveLength(1);
      expect(mockIdea.collaborativeData.comments[0].text).toBe('Great slide');
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ comment: expect.any(Object) }));
    });

    test('should delete comment from collaborativeData', async () => {
      req.params = { id: 'idea-1', commentId: 'comm-123' };
      (req as any).user = { _id: 'user-1' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'user-1',
        collaborativeData: {
          comments: [{ id: 'comm-123', text: 'To delete' }, { id: 'comm-456', text: 'To keep' }],
          talkingPoints: [],
          lastModified: new Date()
        },
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);

      await deleteComment(req as Request, res as Response);

      expect(mockIdea.collaborativeData.comments).toHaveLength(1);
      expect(mockIdea.collaborativeData.comments[0].id).toBe('comm-456');
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Comment deleted successfully' });
    });
  });

  describe('processVoiceFeedback', () => {
    test('should return 400 if no audio file is provided', async () => {
      (req as any).file = null;

      await processVoiceFeedback(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'No audio file provided' }));
    });

    test('should process audio buffer and return feedback metrics', async () => {
      (req as any).file = {
        buffer: Buffer.from('mock-audio-content'),
        mimetype: 'audio/mp3'
      };

      await processVoiceFeedback(req as Request, res as Response);

      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        transcription: expect.any(String),
        audioInfo: expect.objectContaining({ format: 'audio/mp3' }),
        feedback: expect.objectContaining({ clarity: expect.any(Number) })
      }));
    });
  });
});
