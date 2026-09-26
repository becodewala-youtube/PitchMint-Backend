import request from 'supertest';
import app from '../../../../../tests/setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../../../../../tests/setup/test-db';
import { createTestUser, createTestIdea, createAuthHeader, mockGeminiResponses } from '../../../../../tests/setup/test-helpers';
import User from '../../../../../src/modules/users/user.model';
import Idea from '../../../../../src/modules/ideas/idea.model';
import * as geminiClient from '../../../../../src/shared/integrations/gemini/gemini.client';

jest.mock('../../../../../src/shared/integrations/gemini/gemini.client', () => ({
  validateIdea: jest.fn(),
  generatePitchDeck: jest.fn(),
  generateCanvas: jest.fn(),
  generateCompetitorAnalysis: jest.fn(),
  simulateInvestorQA: jest.fn(),
  generateMarketResearch: jest.fn(),
  generateTalkingPoints: jest.fn(),
  matchInvestors: jest.fn()
}));

describe('Pitch Simulator Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('POST /api/pitch-simulator/simulate/:id', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/pitch-simulator/simulate/507f1f77bcf86cd799439011');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent idea', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/pitch-simulator/simulate/507f1f77bcf86cd799439011')
        .set(authHeader);

      expect(res.status).toBe(404);
    });

    it('should return 403 when non-owner requests simulation', async () => {
      const owner = await createTestUser({ email: 'owner_sim@example.com' });
      const idea = await createTestIdea(owner._id);

      const stranger = await createTestUser({ email: 'stranger_sim@example.com' });
      const authHeaderStranger = createAuthHeader(stranger._id);

      const res = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}`)
        .set(authHeaderStranger);

      expect(res.status).toBe(403);
    });

    it('should deduct 1 credit, generate questions via Gemini, and persist on Idea', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchSimulation);

      const res = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.pitchSimulation).toBeDefined();
      expect(res.body.pitchSimulation.questions).toHaveLength(3);
      expect(res.body.userCredits).toBe(2);

      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.pitchSimulation?.questions).toHaveLength(3);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });

    it('should refund credits if Gemini API fails during simulation', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.simulateInvestorQA as jest.Mock).mockRejectedValue(new Error('AI simulation error'));

      const res = await request(app)
        .post(`/api/pitch-simulator/simulate/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(500);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
    });
  });

  describe('POST /api/pitch-simulator/evaluate/:id', () => {
    it('should evaluate answer and store feedback in idea pitch simulation', async () => {
      const user = await createTestUser();
      const idea = await createTestIdea(user._id, {
        pitchSimulation: {
          questions: [
            {
              id: 'question_0',
              question: 'How do you acquire enterprise customers?',
              category: 'Growth',
              answer: '',
              feedback: null as any
            }
          ]
        }
      });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchEvaluation);

      const res = await request(app)
        .post(`/api/pitch-simulator/evaluate/${idea._id}`)
        .set(authHeader)
        .send({
          questionId: 'question_0',
          answer: 'We leverage outbound enterprise SDRs alongside a high-converting developer trial sandbox.'
        });

      expect(res.status).toBe(200);
      expect(res.body.feedback).toBeDefined();
      expect(res.body.feedback.rating).toBe(4);

      // Verify answer and feedback saved to MongoDB
      const dbIdea = await Idea.findById(idea._id);
      const question = dbIdea?.pitchSimulation?.questions?.find((q: any) => q.id === 'question_0');
      expect(question?.answer).toContain('outbound enterprise SDRs');
      expect(question?.feedback?.rating).toBe(4);
    });
  });

  describe('POST /api/pitch-simulator/simulate (Ad-hoc)', () => {
    it('should generate questions for ad-hoc pitch and deduct 1 credit', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.simulateInvestorQA as jest.Mock).mockResolvedValue(mockGeminiResponses.pitchSimulation);

      const res = await request(app)
        .post('/api/pitch-simulator/simulate')
        .set(authHeader)
        .send({ pitch: 'Ad-hoc startup pitch description' });

      expect(res.status).toBe(200);
      expect(res.body.questions).toHaveLength(3);
      expect(res.body.userCredits).toBe(2);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);
    });
  });
});
