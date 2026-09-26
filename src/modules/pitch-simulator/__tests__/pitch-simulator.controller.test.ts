import { Request, Response } from 'express';
import {
  simulatePitch,
  evaluateAnswer,
  simulatePitchRandom,
  evaluateAnswerRandom
} from '../pitch-simulator.controller';
import Idea from '../../ideas/idea.model';
import User from '../../users/user.model';
import * as geminiClient from '../../../shared/integrations/gemini/gemini.client';
import * as creditMiddleware from '../../../shared/middleware/credit.middleware';
import * as activityLogger from '../../../shared/utils/activity-logger';

jest.mock('../../ideas/idea.model');
jest.mock('../../users/user.model');
jest.mock('../../../shared/integrations/gemini/gemini.client');
jest.mock('../../../shared/middleware/credit.middleware');
jest.mock('../../../shared/utils/activity-logger');

describe('Pitch Simulator Controller Unit Tests', () => {
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

  describe('simulatePitch', () => {
    test('should return 404 if idea is not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await simulatePitch(req as Request, res as Response);

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

      await simulatePitch(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    test('should return 402 if credit deduction fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        pitchSimulation: null
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({ success: false });

      await simulatePitch(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
    });

    test('should generate questions and save simulation to idea', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Pitch idea',
        pitchSimulation: null as any,
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: 'idea-1', pitchSimulation: { questions: [] } })
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue({
        questions: [{ question: 'What is churn?', category: 'Revenue' }]
      });
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ credits: 4 })
      });

      await simulatePitch(req as Request, res as Response);

      expect(mockIdea.pitchSimulation.questions).toHaveLength(1);
      expect(mockIdea.pitchSimulation.questions[0].question).toBe('What is churn?');
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ userCredits: 4 }));
    });

    test('should refund credits if question generation fails', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };

      const split = { monthly: 1, purchased: 0 };
      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Pitch idea',
        pitchSimulation: null
      });
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split
      });
      (geminiClient.simulateInvestorQA as jest.Mock).mockRejectedValue(new Error('AI timeout'));

      await simulatePitch(req as Request, res as Response);

      expect(creditMiddleware.refundCredits).toHaveBeenCalledWith('owner', split, 'pitch_simulator');
      expect(statusMock).toHaveBeenCalledWith(500);
    });

    test('should return existing questions without deduction if already present and not regenerating', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.query = {};

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Pitch idea',
        pitchSimulation: { questions: [{ id: 'q1', question: 'Existing' }] },
        toObject: () => ({ _id: 'idea-1', pitchSimulation: { questions: [{ id: 'q1', question: 'Existing' }] } })
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ credits: 5 })
      });

      await simulatePitch(req as Request, res as Response);

      expect(creditMiddleware.atomicDeductCredits).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ userCredits: 5 }));
    });
  });

  describe('evaluateAnswer', () => {
    test('should return 404 if idea not found', async () => {
      req.params = { id: 'missing' };
      (Idea.findById as jest.Mock).mockResolvedValue(null);

      await evaluateAnswer(req as Request, res as Response);

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

      await evaluateAnswer(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized to access this idea' }));
    });

    test('should return 404 if questionId not found in simulation', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.body = { questionId: 'question_99', answer: 'My answer' };

      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        pitchSimulation: { questions: [{ id: 'question_0' }] }
      });

      await evaluateAnswer(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Question not found' }));
    });

    test('should evaluate answer and update question feedback on success', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.body = { questionId: 'question_0', answer: 'Low churn' };

      const mockIdea = {
        _id: 'idea-1',
        userId: 'owner',
        ideaText: 'Pitch idea',
        pitchSimulation: {
          questions: [{ id: 'question_0', question: 'What is churn?', answer: '', feedback: null }]
        },
        save: jest.fn().mockResolvedValue(true)
      };
      (Idea.findById as jest.Mock).mockResolvedValue(mockIdea);
      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue({
        feedback: { rating: 5, strengths: ['Direct answer'] }
      });

      await evaluateAnswer(req as Request, res as Response);

      expect(mockIdea.pitchSimulation.questions[0].answer).toBe('Low churn');
      expect(mockIdea.pitchSimulation.questions[0].feedback).toEqual({ rating: 5, strengths: ['Direct answer'] });
      expect(mockIdea.save).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ feedback: { rating: 5, strengths: ['Direct answer'] } });
    });

    test('should return 503 if Gemini simulation fails with specific error', async () => {
      req.params = { id: 'idea-1' };
      (req as any).user = { _id: 'owner' };
      req.body = { questionId: 'question_0', answer: 'Answer' };

      (Idea.findById as jest.Mock).mockResolvedValue({
        _id: 'idea-1',
        userId: 'owner',
        pitchSimulation: { questions: [{ id: 'question_0', question: 'Q' }] }
      });
      (geminiClient.simulateInvestorQA as jest.Mock).mockRejectedValue(new Error('Failed to process pitch simulation'));

      await evaluateAnswer(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(503);
    });
  });

  describe('simulatePitchRandom', () => {
    test('should return 400 if pitch is missing', async () => {
      req.body = {};
      (req as any).user = { _id: 'user-1' };

      await simulatePitchRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    test('should return 401 if req.user._id is missing', async () => {
      req.body = { pitch: 'My pitch' };
      (req as any).user = {};

      await simulatePitchRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not authorized' }));
    });

    test('should return 402 if credit deduction fails', async () => {
      req.body = { pitch: 'My pitch' };
      (req as any).user = { _id: 'user-1' };
      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: false
      });

      await simulatePitchRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(402);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Insufficient credits' }));
    });

    test('should deduct credit, simulate pitch, and log activity', async () => {
      req.body = { pitch: 'My ad-hoc pitch' };
      (req as any).user = { _id: 'user-1' };

      (creditMiddleware.atomicDeductCredits as jest.Mock).mockResolvedValue({
        success: true,
        split: { monthly: 1, purchased: 0 }
      });
      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue({
        questions: [{ question: 'Q1' }]
      });
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({ credits: 2 })
      });

      await simulatePitchRandom(req as Request, res as Response);

      expect(geminiClient.simulateInvestorQA).toHaveBeenCalledWith('My ad-hoc pitch');
      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ userCredits: 2 }));
    });
  });

  describe('evaluateAnswerRandom', () => {
    test('should return 400 if pitch, question, or answer is missing', async () => {
      req.body = { pitch: 'Pitch' };
      (req as any).user = { _id: 'user-1' };

      await evaluateAnswerRandom(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    test('should evaluate random answer and log activity', async () => {
      req.body = { pitch: 'Pitch', question: 'Q', answer: 'A' };
      (req as any).user = { _id: 'user-1' };

      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue({
        feedback: { rating: 4 }
      });
      (activityLogger.logActivity as jest.Mock).mockResolvedValue(undefined);

      await evaluateAnswerRandom(req as Request, res as Response);

      expect(activityLogger.logActivity).toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ feedback: { rating: 4 } });
    });
  });
});
