import request from 'supertest';
import app from '../setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';
import { createTestUser, createTestIdea, createAuthHeader, mockGeminiResponses } from '../setup/test-helpers';
import User from '../../src/modules/users/user.model';
import Idea from '../../src/modules/ideas/idea.model';
import ActivityHistory from '../../src/modules/dashboard/dashboard.model';
import * as geminiClient from '../../src/shared/integrations/gemini/gemini.client';

jest.mock('../../src/shared/integrations/gemini/gemini.client', () => ({
  validateIdea: jest.fn(),
  generatePitchDeck: jest.fn(),
  generateCanvas: jest.fn(),
  generateCompetitorAnalysis: jest.fn(),
  simulateInvestorQA: jest.fn(),
  generateMarketResearch: jest.fn(),
  generateTalkingPoints: jest.fn(),
  matchInvestors: jest.fn()
}));

describe('Competitors Integration Tests', () => {
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

  describe('POST /api/competitors/analyze/:id', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/competitors/analyze/507f1f77bcf86cd799439011');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent idea', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/competitors/analyze/507f1f77bcf86cd799439011')
        .set(authHeader);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Idea not found');
    });

    it('should return 403 when non-owner requests analysis', async () => {
      const owner = await createTestUser({ email: 'owner_comp@example.com' });
      const idea = await createTestIdea(owner._id);

      const stranger = await createTestUser({ email: 'stranger_comp@example.com' });
      const authHeaderStranger = createAuthHeader(stranger._id);

      const res = await request(app)
        .post(`/api/competitors/analyze/${idea._id}`)
        .set(authHeaderStranger);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Not authorized');
    });

    it('should return 402 when user has insufficient credits', async () => {
      const user = await createTestUser({ monthlyCredits: 0, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post(`/api/competitors/analyze/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient credits');
    });

    it('should deduct 1 credit, generate competitor analysis via Gemini, persist on Idea, and log activity', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateCompetitorAnalysis as jest.Mock).mockResolvedValue(mockGeminiResponses.competitorAnalysis);

      const res = await request(app)
        .post(`/api/competitors/analyze/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.competitorAnalysis).toBeDefined();
      expect(res.body.competitorAnalysis.competitors).toHaveLength(2);
      expect(res.body.userCredits).toBe(2);

      // Verify in DB
      const dbIdea = await Idea.findById(idea._id);
      expect(dbIdea?.competitorAnalysis?.competitors).toHaveLength(2);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);

      // Verify activity log
      const activity = await ActivityHistory.findOne({ userId: user._id, serviceType: 'competitor_analysis' });
      expect(activity).not.toBeNull();
      expect(activity?.relatedIdeaId?.toString()).toBe(idea._id.toString());
    });

    it('should return cached analysis without credit deduction if regenerate is false', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id, {
        competitorAnalysis: mockGeminiResponses.competitorAnalysis
      });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post(`/api/competitors/analyze/${idea._id}`)
        .set(authHeader)
        .send({ regenerate: false });

      expect(res.status).toBe(200);
      expect(res.body.competitorAnalysis).toBeDefined();
      expect(geminiClient.generateCompetitorAnalysis).not.toHaveBeenCalled();

      // Credits remain untouched
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
    });

    it('should refund credits if Gemini API fails during analysis', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const idea = await createTestIdea(user._id);
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateCompetitorAnalysis as jest.Mock).mockRejectedValue(new Error('AI competitor failure'));

      const res = await request(app)
        .post(`/api/competitors/analyze/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(500);

      // Verify refund
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
    });
  });

  describe('POST /api/competitors/analyze (Ad-hoc / Random)', () => {
    it('should return 400 when ideaText is missing', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/competitors/analyze')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Please provide your startup idea');
    });

    it('should deduct 1 credit, perform ad-hoc analysis, and log activity', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.generateCompetitorAnalysis as jest.Mock).mockResolvedValue(mockGeminiResponses.competitorAnalysis);

      const res = await request(app)
        .post('/api/competitors/analyze')
        .set(authHeader)
        .send({ ideaText: 'Standalone idea for quick competitor research' });

      expect(res.status).toBe(200);
      expect(res.body.competitors).toBeDefined();
      expect(res.body.userCredits).toBe(2);

      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(2);

      const activity = await ActivityHistory.findOne({ userId: user._id, serviceType: 'competitor_analysis' });
      expect(activity).not.toBeNull();
      expect(activity?.relatedIdeaId).toBeNull();
    });
  });
});
