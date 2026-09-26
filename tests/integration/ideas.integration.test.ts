import request from 'supertest';
import app from '../setup/test-app';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/test-db';
import { createTestUser, createTestIdea, createAuthHeader, mockGeminiResponses } from '../setup/test-helpers';
import User from '../../src/modules/users/user.model';
import Idea from '../../src/modules/ideas/idea.model';
import ActivityHistory from '../../src/modules/dashboard/dashboard.model';
import * as geminiClient from '../../src/shared/integrations/gemini/gemini.client';

// Mock external Gemini AI client
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

describe('Ideas Integration Tests', () => {
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

  describe('POST /api/idea/submit', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/idea/submit')
        .send({ ideaText: 'Valid startup idea description' });

      expect(res.status).toBe(401);
    });

    it('should return 400 when ideaText is missing', async () => {
      const user = await createTestUser({ monthlyCredits: 3 });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Please provide your startup idea');
    });

    it('should return 402 when user has insufficient credits', async () => {
      const user = await createTestUser({ monthlyCredits: 0, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .send({ ideaText: 'AI automated accounting software for small businesses' });

      expect(res.status).toBe(402);
      expect(res.body.message).toContain('Insufficient credits');
      expect(geminiClient.validateIdea).not.toHaveBeenCalled();
    });

    it('should deduct 1 credit, validate idea with Gemini, save to DB, log activity, and update user savedIdeas', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.validateIdea as jest.Mock).mockResolvedValue(mockGeminiResponses.ideaValidation);

      const ideaPayload = { ideaText: 'AI automated accounting software for small businesses' };

      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .send(ideaPayload);

      expect(res.status).toBe(201);
      expect(res.body._id).toBeDefined();
      expect(res.body.marketDemandScore).toBe(mockGeminiResponses.ideaValidation.marketDemandScore);
      expect(res.body.overallScore).toBe(mockGeminiResponses.ideaValidation.overallScore);
      expect(res.body.userCredits).toBe(2); // 3 - 1 = 2

      // Verify idea persisted in MongoDB
      const dbIdea = await Idea.findById(res.body._id);
      expect(dbIdea).not.toBeNull();
      expect(dbIdea?.userId.toString()).toBe(user._id.toString());
      expect(dbIdea?.ideaText).toBe(ideaPayload.ideaText);

      // Verify user credits in DB
      const dbUser = await User.findById(user._id);
      expect(dbUser?.monthlyCredits).toBe(2);
      expect(dbUser?.credits).toBe(2);
      expect(dbUser?.savedIdeas.map((id: any) => id.toString())).toContain(res.body._id);

      // Verify activity was logged in dashboard collection
      const activity = await ActivityHistory.findOne({ userId: user._id, serviceType: 'idea_validation' });
      expect(activity).not.toBeNull();
      expect(activity?.relatedIdeaId?.toString()).toBe(res.body._id);
      expect(activity?.creditsUsed).toBe(1);
    });

    it('should refund credits if Gemini API throws an error', async () => {
      const user = await createTestUser({ monthlyCredits: 3, purchasedCredits: 0 });
      const authHeader = createAuthHeader(user._id);

      (geminiClient.validateIdea as jest.Mock).mockRejectedValue(new Error('Gemini API Service Unavailable'));

      const res = await request(app)
        .post('/api/idea/submit')
        .set(authHeader)
        .send({ ideaText: 'AI platform that will fail during validation' });

      expect(res.status).toBe(500);

      // User must be refunded back to 3 credits
      const dbUser = await User.findById(user._id);
      expect(dbUser?.credits).toBe(3);
      expect(dbUser?.monthlyCredits).toBe(3);

      // Idea should NOT be saved in DB
      const count = await Idea.countDocuments({ userId: user._id });
      expect(count).toBe(0);
    });
  });

  describe('GET /api/idea/:id', () => {
    it('should return 404 for non-existent idea', async () => {
      const user = await createTestUser();
      const authHeader = createAuthHeader(user._id);
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .get(`/api/idea/${fakeId}`)
        .set(authHeader);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Idea not found');
    });

    it('should return 403 when accessing another user idea', async () => {
      const owner = await createTestUser({ email: 'owner@example.com' });
      const idea = await createTestIdea(owner._id);

      const attacker = await createTestUser({ email: 'attacker@example.com' });
      const authHeader = createAuthHeader(attacker._id);

      const res = await request(app)
        .get(`/api/idea/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Not authorized');
    });

    it('should return 200 and full idea document when requested by owner', async () => {
      const owner = await createTestUser();
      const idea = await createTestIdea(owner._id);
      const authHeader = createAuthHeader(owner._id);

      const res = await request(app)
        .get(`/api/idea/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body._id).toBe(idea._id.toString());
      expect(res.body.ideaText).toBe(idea.ideaText);
      expect(res.body.marketDemandScore).toBe(idea.marketDemandScore);
    });
  });

  describe('GET /api/idea/saved', () => {
    it('should return paginated saved ideas exclusively for the authenticated user', async () => {
      const userA = await createTestUser({ email: 'userA@example.com' });
      const userB = await createTestUser({ email: 'userB@example.com' });

      // Create 3 ideas for userA, 2 for userB
      await createTestIdea(userA._id, { ideaText: 'User A Idea 1' });
      await createTestIdea(userA._id, { ideaText: 'User A Idea 2' });
      await createTestIdea(userA._id, { ideaText: 'User A Idea 3' });
      await createTestIdea(userB._id, { ideaText: 'User B Idea 1' });
      await createTestIdea(userB._id, { ideaText: 'User B Idea 2' });

      const authHeaderA = createAuthHeader(userA._id);

      const res = await request(app)
        .get('/api/idea/saved?page=1&limit=2')
        .set(authHeaderA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(3);
      expect(res.body.ideas).toHaveLength(2);
      expect(res.body.totalPages).toBe(2);
      expect(res.body.currentPage).toBe(1);

      // Verify all returned ideas belong to userA
      res.body.ideas.forEach((item: any) => {
        expect(item.userId).toBe(userA._id.toString());
      });
    });
  });

  describe('DELETE /api/idea/:id', () => {
    it('should reject deletion with 403 when user is not the owner', async () => {
      const owner = await createTestUser({ email: 'owner_del@example.com' });
      const idea = await createTestIdea(owner._id);

      const stranger = await createTestUser({ email: 'stranger@example.com' });
      const authHeader = createAuthHeader(stranger._id);

      const res = await request(app)
        .delete(`/api/idea/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(403);

      // Verify idea still exists in DB
      const checkIdea = await Idea.findById(idea._id);
      expect(checkIdea).not.toBeNull();
    });

    it('should allow owner to delete idea and remove it from user savedIdeas', async () => {
      const owner = await createTestUser();
      const idea = await createTestIdea(owner._id);

      // Link idea to user's savedIdeas
      await User.findByIdAndUpdate(owner._id, { $push: { savedIdeas: idea._id } });

      const authHeader = createAuthHeader(owner._id);

      const res = await request(app)
        .delete(`/api/idea/${idea._id}`)
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Idea removed');

      // Verify idea removed from DB
      const deletedIdea = await Idea.findById(idea._id);
      expect(deletedIdea).toBeNull();

      // Verify removed from user's savedIdeas
      const updatedUser = await User.findById(owner._id);
      expect(updatedUser?.savedIdeas.map((id: any) => id.toString())).not.toContain(idea._id.toString());
    });
  });
});
